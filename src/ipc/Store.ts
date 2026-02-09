import { MessageTypes, IPCMessage, StoredPromise } from '../types';
import { ShardingUtils } from '../utils/shardingUtils';

type SendFn = (message: unknown) => Promise<void>;

interface StoreEntry {
	value: unknown;
	expiresAt?: number;
}

export class StoreManager {
	private data: Map<string, StoreEntry> = new Map();
	private cleanupTimer?: NodeJS.Timeout;

	constructor(cleanupInterval: number = 30000) {
		this.cleanupTimer = setInterval(() => this.cleanup(), cleanupInterval);
	}

	get(key: string): unknown | undefined {
		const entry = this.data.get(key);
		if (!entry) return undefined;
		if (entry.expiresAt && Date.now() > entry.expiresAt) {
			this.data.delete(key);
			return undefined;
		}
		return entry.value;
	}

	set(key: string, value: unknown, ttl?: number): void {
		this.data.set(key, {
			value,
			expiresAt: ttl ? Date.now() + ttl : undefined,
		});
	}

	has(key: string): boolean {
		const entry = this.data.get(key);
		if (!entry) return false;
		if (entry.expiresAt && Date.now() > entry.expiresAt) {
			this.data.delete(key);
			return false;
		}
		return true;
	}

	delete(key: string): boolean {
		return this.data.delete(key);
	}

	private cleanup(): void {
		const now = Date.now();
		for (const [key, entry] of this.data) {
			if (entry.expiresAt && now > entry.expiresAt) {
				this.data.delete(key);
			}
		}
	}

	destroy(): void {
		if (this.cleanupTimer) clearInterval(this.cleanupTimer);
		this.data.clear();
	}

	handleMessage(message: IPCMessage): IPCMessage | null {
		const data = message.data as { key: string; value?: unknown; ttl?: number };

		switch (message._type) {
			case MessageTypes.StoreGet:
				return {
					_type: MessageTypes.StoreResponse,
					_nonce: message._nonce,
					data: { value: this.get(data.key) },
				};

			case MessageTypes.StoreSet:
				this.set(data.key, data.value, data.ttl);
				return {
					_type: MessageTypes.StoreResponse,
					_nonce: message._nonce,
					data: { value: true },
				};

			case MessageTypes.StoreHas:
				return {
					_type: MessageTypes.StoreResponse,
					_nonce: message._nonce,
					data: { value: this.has(data.key) },
				};

			case MessageTypes.StoreDelete:
				return {
					_type: MessageTypes.StoreResponse,
					_nonce: message._nonce,
					data: { value: this.delete(data.key) },
				};

			default:
				return null;
		}
	}
}

export class StoreClient {
	private promises: Map<string, StoredPromise> = new Map();

	constructor(private send: SendFn) {}

	async get<T = unknown>(key: string, timeout: number = 5000): Promise<T | undefined> {
		const nonce = ShardingUtils.generateNonce();
		await this.send({
			_type: MessageTypes.StoreGet,
			_nonce: nonce,
			data: { key },
		});
		const result = await this.createPromise(nonce, timeout) as { value: T | undefined };
		return result.value;
	}

	async set(key: string, value: unknown, options?: { ttl?: number; timeout?: number }): Promise<void> {
		const nonce = ShardingUtils.generateNonce();
		await this.send({
			_type: MessageTypes.StoreSet,
			_nonce: nonce,
			data: { key, value, ttl: options?.ttl },
		});
		await this.createPromise(nonce, options?.timeout ?? 5000);
	}

	async has(key: string, timeout: number = 5000): Promise<boolean> {
		const nonce = ShardingUtils.generateNonce();
		await this.send({
			_type: MessageTypes.StoreHas,
			_nonce: nonce,
			data: { key },
		});
		const result = await this.createPromise(nonce, timeout) as { value: boolean };
		return result.value;
	}

	async delete(key: string, timeout: number = 5000): Promise<boolean> {
		const nonce = ShardingUtils.generateNonce();
		await this.send({
			_type: MessageTypes.StoreDelete,
			_nonce: nonce,
			data: { key },
		});
		const result = await this.createPromise(nonce, timeout) as { value: boolean };
		return result.value;
	}

	handleResponse(message: IPCMessage): void {
		const promise = this.promises.get(message._nonce);
		if (!promise) return;
		if (promise.timeout) clearTimeout(promise.timeout);
		this.promises.delete(message._nonce);
		promise.resolve(message.data);
	}

	private createPromise(nonce: string, timeout: number): Promise<unknown> {
		return new Promise((resolve, reject) => {
			const timer = setTimeout(() => {
				this.promises.delete(nonce);
				reject(new Error('Store request timed out'));
			}, timeout);

			this.promises.set(nonce, { resolve, reject, timeout: timer });
		});
	}
}
