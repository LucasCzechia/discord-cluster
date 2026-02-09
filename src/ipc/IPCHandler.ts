import { MessageTypes, IPCMessage, StoredPromise } from '../types';
import { ShardingUtils } from '../utils/shardingUtils';
import { ResultCollection } from '../utils/ResultCollection';

type HandlerFn<TData = unknown, TResult = unknown> = (data: TData) => TResult | Promise<TResult>;
type SendFn = (message: unknown) => Promise<void>;
type ClusterSendFn = (clusterId: number, message: unknown) => Promise<void>;

export class IPCHandler {
	private handlers: Map<string, HandlerFn> = new Map();
	private promises: Map<string, StoredPromise> = new Map();
	private pendingAll: Map<string, { results: Map<number, unknown>; expected: number; resolve: (value: unknown) => void; reject: (error: Error) => void; timeout?: NodeJS.Timeout }> = new Map();

	constructor(
		private send: SendFn,
		private sendToCluster?: ClusterSendFn,
		private totalClusters?: () => number,
	) {}

	handle<TData = unknown, TResult = unknown>(name: string, handler: HandlerFn<TData, TResult>): void {
		this.handlers.set(name, handler as HandlerFn);
	}

	removeHandler(name: string): boolean {
		return this.handlers.delete(name);
	}

	async request<TResult = unknown>(handler: string, data?: unknown, timeout?: number): Promise<TResult> {
		const nonce = ShardingUtils.generateNonce();

		await this.send({
			_type: MessageTypes.HandlerRequest,
			_nonce: nonce,
			data: { handler, data, _broadcast: false },
		});

		return this.createPromise<TResult>(nonce, timeout);
	}

	async requestTo<TResult = unknown>(clusterId: number, handler: string, data?: unknown, timeout?: number): Promise<TResult> {
		if (!this.sendToCluster) throw new Error('requestTo is not available from this context');
		const nonce = ShardingUtils.generateNonce();

		await this.sendToCluster(clusterId, {
			_type: MessageTypes.HandlerRequest,
			_nonce: nonce,
			data: { handler, data },
		});

		return this.createPromise<TResult>(nonce, timeout);
	}

	async requestAll<TResult = unknown>(handler: string, data?: unknown, timeout: number = 30000): Promise<ResultCollection<TResult>> {
		const nonce = ShardingUtils.generateNonce();
		const total = this.totalClusters?.() ?? 0;
		if (total === 0) return new ResultCollection([]);

		const remoteExpected = total - 1;
		const initialResults: Map<number, unknown> = new Map();

		const fn = this.handlers.get(handler);
		if (fn) {
			try {
				const localResult = await fn(data);
				initialResults.set(-1, localResult);
			} catch (err) {
				initialResults.set(-1, new Error((err as Error).message));
			}
		}

		if (remoteExpected <= 0) {
			const results = Array.from(initialResults.entries()).map(([clusterId, result]) => {
				if (result instanceof Error) return { clusterId, status: 'error' as const, error: result.message };
				return { clusterId, status: 'ok' as const, data: result as TResult };
			});
			return new ResultCollection<TResult>(results);
		}

		await this.send({
			_type: MessageTypes.HandlerRequestAll,
			_nonce: nonce,
			data: { handler, data },
		});

		return new Promise<ResultCollection<TResult>>((resolve, reject) => {
			const timer = timeout > 0 ? setTimeout(() => {
				const pending = this.pendingAll.get(nonce);
				if (pending) {
					this.pendingAll.delete(nonce);
					const results = Array.from(pending.results.entries()).map(([clusterId, result]) => {
						if (result instanceof Error) return { clusterId, status: 'error' as const, error: result.message };
						return { clusterId, status: 'ok' as const, data: result as TResult };
					});
					resolve(new ResultCollection<TResult>(results));
				}
			}, timeout) : undefined;

			this.pendingAll.set(nonce, {
				results: initialResults,
				expected: remoteExpected + initialResults.size,
				resolve: (value) => resolve(value as ResultCollection<TResult>),
				reject,
				timeout: timer,
			});
		});
	}

	async handleIncoming(message: IPCMessage, sourceCluster?: number): Promise<void> {
		switch (message._type) {
			case MessageTypes.HandlerRequestAll:
			case MessageTypes.HandlerRequest: {
				const { handler, data } = message.data as { handler: string; data: unknown };
				const fn = this.handlers.get(handler);

				if (!fn) {
					await this.send({
						_type: MessageTypes.HandlerError,
						_nonce: message._nonce,
						data: { error: `No handler registered for '${handler}'`, sourceCluster },
					});
					return;
				}

				try {
					const result = await fn(data);
					await this.send({
						_type: MessageTypes.HandlerResponse,
						_nonce: message._nonce,
						data: { data: result, sourceCluster },
					});
				} catch (err) {
					await this.send({
						_type: MessageTypes.HandlerError,
						_nonce: message._nonce,
						data: { error: (err as Error).message, sourceCluster },
					});
				}
				break;
			}

			case MessageTypes.HandlerResponse: {
				const { data: responseData, sourceCluster: src } = message.data as { data: unknown; sourceCluster?: number };
				const pending = this.pendingAll.get(message._nonce);
				if (pending && src !== undefined) {
					pending.results.set(src, responseData);
					if (pending.results.size >= pending.expected) {
						if (pending.timeout) clearTimeout(pending.timeout);
						this.pendingAll.delete(message._nonce);
						const results = Array.from(pending.results.entries()).map(([clusterId, result]) => {
							if (result instanceof Error) return { clusterId, status: 'error' as const, error: result.message };
							return { clusterId, status: 'ok' as const, data: result };
						});
						pending.resolve(new ResultCollection(results));
					}
					return;
				}

				const promise = this.promises.get(message._nonce);
				if (promise) {
					if (promise.timeout) clearTimeout(promise.timeout);
					this.promises.delete(message._nonce);
					promise.resolve(responseData);
				}
				break;
			}

			case MessageTypes.HandlerError: {
				const { error: errMsg, sourceCluster: src } = message.data as { error: string; sourceCluster?: number };
				const pending = this.pendingAll.get(message._nonce);
				if (pending && src !== undefined) {
					pending.results.set(src, new Error(errMsg));
					if (pending.results.size >= pending.expected) {
						if (pending.timeout) clearTimeout(pending.timeout);
						this.pendingAll.delete(message._nonce);
						const results = Array.from(pending.results.entries()).map(([clusterId, result]) => {
							if (result instanceof Error) return { clusterId, status: 'error' as const, error: result.message };
							return { clusterId, status: 'ok' as const, data: result };
						});
						pending.resolve(new ResultCollection(results));
					}
					return;
				}

				const promise = this.promises.get(message._nonce);
				if (promise) {
					if (promise.timeout) clearTimeout(promise.timeout);
					this.promises.delete(message._nonce);
					promise.reject(new Error(errMsg));
				}
				break;
			}
		}
	}

	private createPromise<T>(nonce: string, timeout?: number): Promise<T> {
		return new Promise<T>((resolve, reject) => {
			const timer = timeout && timeout > 0 ? setTimeout(() => {
				this.promises.delete(nonce);
				reject(new Error('IPC request timed out'));
			}, timeout) : undefined;

			this.promises.set(nonce, {
				resolve: resolve as (value: unknown) => void,
				reject,
				timeout: timer,
			});
		});
	}

	clearPending(): void {
		for (const [, promise] of this.promises) {
			if (promise.timeout) clearTimeout(promise.timeout);
			promise.reject(new Error('IPC handler cleared'));
		}
		this.promises.clear();

		for (const [, pending] of this.pendingAll) {
			if (pending.timeout) clearTimeout(pending.timeout);
			pending.reject(new Error('IPC handler cleared'));
		}
		this.pendingAll.clear();
	}
}
