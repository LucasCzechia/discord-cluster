import { MessageTypes, IPCMessage } from '../types';
import { ShardingUtils } from '../other/shardingUtils';
import EventEmitter from 'events';

type SendFn = (message: unknown) => Promise<void>;

export class EventBusClient extends EventEmitter {
	private ackPromises: Map<string, { expected: number; received: number; resolve: (value: number) => void; timeout?: NodeJS.Timeout }> = new Map();
	private clusterId: number;

	constructor(private send: SendFn, clusterId: number) {
		super();
		this.clusterId = clusterId;
	}

	async broadcast(event: string, data?: unknown): Promise<void> {
		await this.send({
			_type: MessageTypes.EventEmit,
			_nonce: ShardingUtils.generateNonce(),
			data: { event, data, sourceCluster: this.clusterId },
		});
	}

	async emitTo(clusterId: number, event: string, data?: unknown): Promise<void> {
		await this.send({
			_type: MessageTypes.EventEmit,
			_nonce: ShardingUtils.generateNonce(),
			data: { event, data, sourceCluster: this.clusterId, targetCluster: clusterId },
		});
	}

	async broadcastAndWait(event: string, data?: unknown, timeout: number = 10000, expectedClusters?: number): Promise<number> {
		const nonce = ShardingUtils.generateNonce();
		const expected = expectedClusters ?? 0;

		await this.send({
			_type: MessageTypes.EventEmitAndWait,
			_nonce: nonce,
			data: { event, data, sourceCluster: this.clusterId },
		});

		if (expected <= 0) return 0;

		return new Promise<number>((resolve) => {
			const timer = setTimeout(() => {
				const pending = this.ackPromises.get(nonce);
				this.ackPromises.delete(nonce);
				resolve(pending?.received ?? 0);
			}, timeout);

			this.ackPromises.set(nonce, { expected, received: 0, resolve, timeout: timer });
		});
	}

	handleIncoming(message: IPCMessage): void {
		switch (message._type) {
			case MessageTypes.EventForward: {
				const { event, data, sourceCluster } = message.data as { event: string; data: unknown; sourceCluster: number };
				super.emit(event, data, sourceCluster);
				break;
			}

			case MessageTypes.EventEmitAndWait: {
				const { event, data, sourceCluster } = message.data as { event: string; data: unknown; sourceCluster: number };
				super.emit(event, data, sourceCluster);
				this.send({
					_type: MessageTypes.EventAck,
					_nonce: message._nonce,
					data: { sourceCluster: this.clusterId },
				}).catch(() => {});
				break;
			}

			case MessageTypes.EventAck: {
				const pending = this.ackPromises.get(message._nonce);
				if (!pending) return;
				pending.received++;
				if (pending.received >= pending.expected) {
					if (pending.timeout) clearTimeout(pending.timeout);
					this.ackPromises.delete(message._nonce);
					pending.resolve(pending.received);
				}
				break;
			}
		}
	}
}

export class EventBusManager {
	handleMessage(message: IPCMessage, sourceCluster: number, sendToCluster: (clusterId: number, msg: unknown) => Promise<void>, allClusterIds: number[]): void {
		const eventData = message.data as { event: string; data: unknown; sourceCluster: number; targetCluster?: number };

		switch (message._type) {
			case MessageTypes.EventEmit: {
				if (eventData.targetCluster !== undefined) {
					sendToCluster(eventData.targetCluster, {
						_type: MessageTypes.EventForward,
						_nonce: message._nonce,
						data: eventData,
					}).catch(() => {});
				} else {
					for (const id of allClusterIds) {
						if (id === sourceCluster) continue;
						sendToCluster(id, {
							_type: MessageTypes.EventForward,
							_nonce: message._nonce,
							data: eventData,
						}).catch(() => {});
					}
				}
				break;
			}

			case MessageTypes.EventEmitAndWait: {
				for (const id of allClusterIds) {
					if (id === sourceCluster) continue;
					sendToCluster(id, {
						_type: MessageTypes.EventEmitAndWait,
						_nonce: message._nonce,
						data: eventData,
					}).catch(() => {});
				}
				break;
			}

			case MessageTypes.EventAck: {
				const { sourceCluster: ackSource } = message.data as { sourceCluster: number };
				sendToCluster(eventData.sourceCluster ?? sourceCluster, {
					_type: MessageTypes.EventAck,
					_nonce: message._nonce,
					data: { sourceCluster: ackSource },
				}).catch(() => {});
				break;
			}
		}
	}
}
