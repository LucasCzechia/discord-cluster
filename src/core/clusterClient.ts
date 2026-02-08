import { ClusterClientEvents, EvalOptions, MessageTypes, Serialized, Awaitable, ValidIfSerializable, SerializableInput, ClusterClientData, PackageType, IPCMessage, ClusterStats, ClusterStatEntry } from '../types';
import { BaseMessage, BaseMessageInput, DataType, ProcessMessage } from '../other/message';
import { detectLibraryFromClient, getInfo } from '../other/utils';
import { ClusterClientHandler } from '../handlers/message';
import { ShardingUtils } from '../other/shardingUtils';
import { RefClusterManager } from './clusterManager';
import { PromiseHandler } from '../handlers/promise';
import { WorkerClient } from '../classes/worker';
import { ChildClient } from '../classes/child';
import { IPCHandler } from '../ipc/IPCHandler';
import { StoreClient } from '../ipc/Store';
import { EventBusClient } from '../ipc/EventBus';
import { GuildManager } from '../managers/GuildManager';
import { ChannelManager } from '../managers/ChannelManager';
import { MemberManager } from '../managers/MemberManager';
import { UserManager } from '../managers/UserManager';
import { Serializable } from 'child_process';
import { Guild, Client } from 'discord.js';
import EventEmitter from 'events';

export type ClientRefType = Client;

/** Simplified Cluster instance available on the {@link ClusterClient}. */
export class ClusterClient<
	InternalClient extends ClientRefType = ClientRefType,
	InternalManager extends RefClusterManager = RefClusterManager,
> extends EventEmitter {
	public ready: boolean;
	public promise: PromiseHandler;
	readonly process: ChildClient | WorkerClient | null;
	private messageHandler: ClusterClientHandler<InternalClient>;
	private packageType: PackageType | null;

	public readonly ipc: IPCHandler;
	public readonly store: StoreClient;
	public readonly events: EventBusClient;
	public readonly guilds: GuildManager;
	public readonly channels: ChannelManager;
	public readonly members: MemberManager;
	public readonly users: UserManager;

	/** Creates an instance of ClusterClient. */
	constructor (public client: InternalClient) {
		super();

		this.ready = false;
		this.packageType = detectLibraryFromClient(client);

		const clusterInfo = this.info;
		if ((client as any).options) {
			(client as any).options.shards = clusterInfo.ShardList;
			(client as any).options.shardCount = clusterInfo.TotalShards;
		}

		this.process = (clusterInfo.ClusterManagerMode === 'process' ? new ChildClient() : clusterInfo.ClusterManagerMode === 'worker' ? new WorkerClient() : null);
		this.messageHandler = new ClusterClientHandler<InternalClient>(this);

		if (!this.process?.ipc) throw new Error('CLUSTERING_NO_PROCESS | No process to handle messages from.');
		this.process.ipc.on('message', this._handleMessage.bind(this));
		this.promise = new PromiseHandler(this);

		const sendFn = async (message: unknown) => {
			if (!this.process) throw new Error('No process to send IPC message.');
			await this.process.send(message as BaseMessage<'normal'>);
		};

		const sendToCluster = async (clusterId: number, message: unknown) => {
			await sendFn({ _type: MessageTypes.HandlerRequestTo, data: { ...message as object, _targetCluster: clusterId } });
		};

		this.ipc = new IPCHandler(sendFn, sendToCluster, () => this.info.ClusterCount);
		this.store = new StoreClient(sendFn);
		this.events = new EventBusClient(sendFn, this.id);
		this.guilds = new GuildManager(this as any);
		this.channels = new ChannelManager(this as any);
		this.members = new MemberManager(this as any);
		this.users = new UserManager(this as any);

		this.ipc.handle('__cluster_stats', () => ({
			id: this.id,
			guilds: this.client.guilds.cache.size,
			users: this.client.guilds.cache.reduce((acc, g) => acc + g.memberCount, 0),
			shards: this.shards,
			uptime: this.client.uptime ?? 0,
			memory: process.memoryUsage().heapUsed,
			status: 'healthy' as const,
		}));

		if (this.packageType === 'discord.js' && typeof (client as any).on === 'function') {
			(client as any).on('clientReady', () => this.triggerReady());
		}
	}

	/** Current cluster id. */
	public get id(): number {
		return this.info.ClusterId;
	}

	/** Total number of shards. */
	public get totalShards(): number {
		return this.info.TotalShards;
	}

	/** Total number of clusters. */
	public get totalClusters(): number {
		return this.info.ClusterCount;
	}

	/** Utility function to get some info about the cluster. */
	public get info(): ClusterClientData {
		return getInfo();
	}

	public get shards(): number[] {
		return this.info.ShardList;
	}

	public get isPrimary(): boolean {
		return this.id === 0;
	}

	public findShard(guildId: string): number {
		return ShardingUtils.shardIdForGuildId(guildId, this.totalShards);
	}

	public findGuild(guildId: string): number {
		return ShardingUtils.clusterIdForGuildId(guildId, this.totalShards, this.totalClusters);
	}

	public async stats(): Promise<ClusterStats> {
		const results = await this.ipc.requestAll<ClusterStatEntry>('__cluster_stats');
		const clusterEntries = results.values();
		return {
			totalGuilds: clusterEntries.reduce((sum, c) => sum + c.guilds, 0),
			totalUsers: clusterEntries.reduce((sum, c) => sum + c.users, 0),
			totalClusters: this.totalClusters,
			totalShards: this.totalShards,
			clusters: clusterEntries,
		};
	}

	public async requestRestart(): Promise<void> {
		if (!this.process) throw new Error('No process to send restart request.');
		await this.process.send({
			_type: MessageTypes.RestartRequest,
			data: { clusterId: this.id },
		} as BaseMessage<'normal'>);
	}

	public async requestRollingRestart(options?: { restartMode?: 'rolling' | 'gracefulSwitch' }): Promise<void> {
		if (!this.process) throw new Error('No process to send rolling restart request.');
		await this.process.send({
			_type: MessageTypes.RollingRestartRequest,
			data: { restartMode: options?.restartMode || 'rolling' },
		} as BaseMessage<'normal'>);
	}

	public async handleIPCMessage(message: IPCMessage, sourceCluster?: number): Promise<void> {
		if (message._type >= 30 && message._type <= 34) {
			await this.ipc.handleIncoming(message, sourceCluster);
		} else if (message._type === MessageTypes.StoreResponse) {
			this.store.handleResponse(message);
		} else if (message._type >= 50 && message._type <= 53) {
			this.events.handleIncoming(message);
		}
	}

	/** Sends a message to the Cluster as child. (goes to Cluster on _handleMessage). */
	public send<T extends Serializable>(message: SerializableInput<T>): Promise<void> {
		if (!this.process) return Promise.reject(new Error('CLUSTERING_NO_PROCESS_TO_SEND_TO | No process to send the message to (#1).'));
		else if (!this.ready) return Promise.reject(new Error('CLUSTERING_NOT_READY | Cluster is not ready yet (#1).'));

		this.emit('debug', `[IPC] [Child ${this.id}] Sending message to cluster.`);

		return this.process.send({
			data: message,
			_type: MessageTypes.CustomMessage,
		} as BaseMessage<'normal'>) as Promise<void>;
	}

	/** Broadcasts a message to all clusters. */
	public broadcast<T extends Serializable>(message: SerializableInput<T>, sendSelf: boolean = false): Promise<void> {
		if (!this.process) return Promise.reject(new Error('CLUSTERING_NO_PROCESS_TO_SEND_TO | No process to send the message to (#2).'));
		else if (!this.ready) return Promise.reject(new Error('CLUSTERING_NOT_READY | Cluster is not ready yet (#2).'));

		this.emit('debug', `[IPC] [Child ${this.id}] Sending message to cluster.`);

		return this.process.send<BaseMessageInput<'normal'>>({
			data: {
				message,
				ignore: sendSelf ? undefined : this.id,
			},
			_type: MessageTypes.ClientBroadcast,
		}) as Promise<void>;
	}

	/** Sends a message to the Cluster. */
	public _sendInstance<D extends DataType, A = Serializable, P extends object = object>(message: BaseMessage<D, A, P>): Promise<void> {
		if (!this.process) return Promise.reject(new Error('CLUSTERING_NO_PROCESS_TO_SEND_TO | No process to send the message to (#3).'));
		else if (!this.ready) return Promise.reject(new Error('CLUSTERING_NOT_READY | Cluster is not ready yet (#3).'));
		else if (!('_type' in message) || !('data' in message)) return Promise.reject(new Error('CLUSTERING_INVALID_MESSAGE | Invalid message object.' + JSON.stringify(message)));

		this.emit('debug', `[IPC] [Child ${this.id}] Sending message to cluster.`);
		return this.process.send(message) as Promise<void>;
	}

	/** Evaluates a script on the master process, in the context of the {@link ClusterManager}. */
	public async evalOnManager<T, P extends object, M = InternalManager>(script: ((manager: M, context: Serialized<P>) => Awaitable<T>), options?: { context?: P, timeout?: number }): Promise<ValidIfSerializable<T>> {
		if (!this.process) return Promise.reject(new Error('CLUSTERING_NO_PROCESS_TO_SEND_TO | No process to send the message to (#4).'));
		else if (!this.ready) return Promise.reject(new Error('CLUSTERING_NOT_READY | Cluster is not ready yet (#4).'));
		else if (typeof script !== 'function') return Promise.reject(new Error('CLUSTERING_INVALID_EVAL_SCRIPT | Eval script is not a function (#1).'));

		const nonce = ShardingUtils.generateNonce();

		this.process.send<BaseMessage<'eval'>>({
			data: {
				options,
				script: `(${script})(this,${options?.context ? JSON.stringify(options.context) : undefined})`,
			},
			_nonce: nonce,
			_type: MessageTypes.ClientManagerEvalRequest,
		});

		return this.promise.create(nonce, options?.timeout);
	}

	/** Evaluates a script on all clusters in parallel. */
	public async broadcastEval<T, P extends object, C = InternalClient>(script: string | ((client: C, context: Serialized<P>) => Awaitable<T>), options?: EvalOptions<P>): Promise<ValidIfSerializable<T>[]> {
		if (!this.process) return Promise.reject(new Error('CLUSTERING_NO_PROCESS_TO_SEND_TO | No process to send the message to (#5).'));
		else if (!this.ready) return Promise.reject(new Error('CLUSTERING_NOT_READY | Cluster is not ready yet (#5).'));
		else if (typeof script !== 'string' && typeof script !== 'function') return Promise.reject(new Error('CLUSTERING_INVALID_EVAL_SCRIPT | Eval script is not a function or string.'));

		const nonce = ShardingUtils.generateNonce();

		this.process.send({
			data: {
				options,
				script: typeof script === 'string' ? script : `(${script})(this,${options?.context ? JSON.stringify(options.context) : undefined})`,
			},
			_nonce: nonce,
			_type: MessageTypes.ClientBroadcastRequest,
		} as BaseMessage<'eval'>);

		return this.promise.create(nonce, options?.timeout);
	}

	/** Evaluates a script on specific guild. */
	public async evalOnGuild<T, P extends object, C = InternalClient, E extends boolean = false>(guildId: string, script: (client: C, context: Serialized<P>, guild: E extends true ? Guild : Guild | undefined) => Awaitable<T>, options?: EvalOptions<P>): Promise<ValidIfSerializable<T>> {
		if (!this.process) return Promise.reject(new Error('CLUSTERING_NO_PROCESS_TO_SEND_TO | No process to send the message to (#6).'));
		else if (!this.ready) return Promise.reject(new Error('CLUSTERING_NOT_READY | Cluster is not ready yet (#6).'));
		else if (typeof script !== 'function') return Promise.reject(new Error('CLUSTERING_INVALID_EVAL_SCRIPT | Eval script is not a function (#2).'));
		else if (typeof guildId !== 'string') return Promise.reject(new TypeError('CLUSTERING_GUILD_ID_INVALID | Guild Id must be a string.'));
		else if (this.packageType !== 'discord.js') return Promise.reject(new Error('CLUSTERING_EVAL_GUILD_UNSUPPORTED | evalOnGuild is only supported in discord.js package type.'));

		const nonce = ShardingUtils.generateNonce();

		this.process.send({
			_type: MessageTypes.ClientBroadcastRequest,
			_nonce: nonce,
			data: {
				script: ShardingUtils.parseInput(script, options?.context, this.packageType, `this?.guilds?.cache?.get('${guildId}')`),
				options: { ...options, guildId },
			},
		} as BaseMessage<'eval'>);

		return this.promise.create(nonce, options?.timeout).then((data) => (data as unknown as T[])?.find((v) => v !== undefined)) as Promise<ValidIfSerializable<T>>;
	}

	/** Evaluates a script on a current client, in the context of the {@link ShardingClient}. */
	public async evalOnClient<T, P extends object, C = InternalClient>(script: string | ((client: C, context: Serialized<P>) => Awaitable<T>), options?: EvalOptions<P>): Promise<ValidIfSerializable<T>> {
		type EvalObject = { _eval: <T>(script: string) => T; };

		switch (this.packageType) {
			case 'discord.js': {
				const parsedScript = ShardingUtils.parseInput(script, options?.context, this.packageType);

				if (!(this.client as unknown as EvalObject)._eval) (this.client as unknown as EvalObject)._eval = function (_: string) { return (0, eval)(_); }.bind(this.client);
				return await (this.client as unknown as EvalObject)._eval(parsedScript);
			}
			case '@discordjs/core': {
				if (typeof script === 'function') return await script(this.client as unknown as C, options?.context as Serialized<P>) as Promise<ValidIfSerializable<T>>;

				const fixedScript = script.replace(/\(this,/, '(client,');
				const evalFunction = new Function('client', `return (${fixedScript})`);
				return await evalFunction(this.client, options?.context);
			}
			default: {
				return Promise.reject(new Error('CLUSTERING_EVAL_CLIENT_UNSUPPORTED | evalOnClient is only supported in discord.js and @discordjs/core package types.'));
			}
		}
	}

	/** Sends a request to the Cluster (cluster has to respond with a reply (cluster.on('message', (message) => message.reply('reply')))). */
	public request<T extends Serializable>(message: SerializableInput<T>, options: { timeout?: number } = {}): Promise<ValidIfSerializable<T>> {
		if (!this.process) return Promise.reject(new Error('CLUSTERING_NO_PROCESS_TO_SEND_TO | No process to send the message to (#7).'));
		else if (!this.ready) return Promise.reject(new Error('CLUSTERING_NOT_READY | Cluster is not ready yet (#7).'));

		this.emit('debug', `[IPC] [Child ${this.id}] Sending message to cluster.`);
		const nonce = ShardingUtils.generateNonce();

		this.process.send<BaseMessage<'normal'>>({
			_type: MessageTypes.CustomRequest,
			_nonce: nonce,
			data: message,
		});

		return this.promise.create(nonce, options.timeout);
	}

	/** Kills all running clusters and respawns them. */
	public respawnAll(clusterDelay: number = 8000, respawnDelay: number = 5500, timeout: number = -1, except: number[] = []): Promise<void> {
		if (!this.process) return Promise.reject(new Error('CLUSTERING_NO_PROCESS_TO_SEND_TO | No process to send the message to (#8).'));
		else if (!this.ready) return Promise.reject(new Error('CLUSTERING_NOT_READY | Cluster is not ready yet (#8).'));

		this.emit('debug', `[IPC] [Child ${this.id}] Sending message to cluster.`);

		return this.process.send({
			_type: MessageTypes.ClientRespawnAll,
			data: {
				clusterDelay,
				respawnDelay,
				timeout,
				except,
			},
		} as BaseMessage<'respawnAll'>);
	}

	/** Kills specific clusters and respawns them. */
	public async respawnClusters(clusters: number[], clusterDelay: number = 8000, respawnDelay: number = 5500, timeout: number = -1): Promise<void> {
		if (!this.process) return Promise.reject(new Error('CLUSTERING_NO_PROCESS_TO_SEND_TO | No process to send the message to (#8).'));
		else if (!this.ready) return Promise.reject(new Error('CLUSTERING_NOT_READY | Cluster is not ready yet (#8).'));

		this.emit('debug', `[IPC] [Child ${this.id}] Sending message to cluster.`);

		return this.process.send({
			_type: MessageTypes.ClientRespawnSpecific,
			data: {
				clusterIds: clusters,
				clusterDelay,
				respawnDelay,
				timeout,
			},
		} as BaseMessage<'respawnSome'>);
	}

	/** Handles a message from the ClusterManager. */
	private _handleMessage(message: BaseMessage<'normal'>): void {
		if (!message) return;

		// Debug.
		this.emit('debug', `[IPC] [Child ${this.id}] Received message from cluster.`);
		this.messageHandler.handleMessage(message);

		// Emitted upon receiving a message from the child process/worker.
		if ([MessageTypes.CustomMessage, MessageTypes.CustomRequest].includes(message._type)) {
			this.emit('message', new ProcessMessage(this, message));
		}
	}

	/** Sends a message to the master process. */
	public _respond<D extends DataType, A = Serializable, P extends object = object>(message: BaseMessage<D, A, P>): void {
		if (!this.process) throw new Error('CLUSTERING_NO_PROCESS_TO_SEND_TO | No process to send the message to (#9).');
		this.process.send(message);
	}

	/** Triggers the ready event, do not use this unless you know what you are doing. */
	public triggerReady(): boolean {
		if (this.ready) return this.ready;
		else if (!this.process) throw new Error('CLUSTERING_NO_PROCESS_TO_SEND_TO | No process to send the message to (#10).');

		this.ready = true;

		this.process.send({
			_type: MessageTypes.ClientReady,
			data: { packageType: this.packageType },
		} as BaseMessage<'readyOrSpawn'>);

		this.emit('ready', this);
		return this.ready;
	}

	/** Spawns the next cluster, when queue mode is on 'manual'. */
	public spawnNextCluster(): Promise<void> {
		if (this.info.ClusterQueueMode === 'auto') throw new Error('Next Cluster can just be spawned when the queue is not on auto mode.');
		else if (!this.process) return Promise.reject(new Error('CLUSTERING_NO_PROCESS_TO_SEND_TO | No process to send the message to (#12).'));
		else if (!this.ready) return Promise.reject(new Error('CLUSTERING_NOT_READY | Cluster is not ready yet (#9).'));

		return this.process.send({
			_type: MessageTypes.ClientSpawnNextCluster,
		} as BaseMessage<'readyOrSpawn'>);
	}

	/** Kills the cluster. */
	public _debug(message: string): void {
		this.emit('debug', message);
	}
}

export type RefClusterClient = ClusterClient;

export declare interface ClusterClient {
	/** Emit an event. */
	emit: (<K extends keyof ClusterClientEvents>(event: K, ...args: ClusterClientEvents[K]) => boolean) & (<S extends string | symbol>(event: Exclude<S, keyof ClusterClientEvents>, ...args: unknown[]) => boolean);
	/** Remove an event listener. */
	off: (<K extends keyof ClusterClientEvents>(event: K, listener: (...args: ClusterClientEvents[K]) => void) => this) & (<S extends string | symbol>(event: Exclude<S, keyof ClusterClientEvents>, listener: (...args: unknown[]) => void) => this);
	/** Listen for an event. */
	on: (<K extends keyof ClusterClientEvents>(event: K, listener: (...args: ClusterClientEvents[K]) => void) => this) & (<S extends string | symbol>(event: Exclude<S, keyof ClusterClientEvents>, listener: (...args: unknown[]) => void) => this);
	/** Listen for an event once. */
	once: (<K extends keyof ClusterClientEvents>(event: K, listener: (...args: ClusterClientEvents[K]) => void) => this) & (<S extends string | symbol>(event: Exclude<S, keyof ClusterClientEvents>, listener: (...args: unknown[]) => void) => this);
	/** Remove all listeners for an event. */
	removeAllListeners: (<K extends keyof ClusterClientEvents>(event?: K) => this) & (<S extends string | symbol>(event?: Exclude<S, keyof ClusterClientEvents>) => this);
}
