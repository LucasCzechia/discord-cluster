import { ClusterResult } from '../types';

export class ResultCollection<T = unknown> {
	constructor(public readonly results: ClusterResult<T>[]) {}

	values(): T[] {
		return this.results
			.filter((r) => r.status === 'ok' && r.data !== undefined)
			.map((r) => r.data as T);
	}

	errors(): { clusterId: number; error: string }[] {
		return this.results
			.filter((r) => r.status === 'error')
			.map((r) => ({ clusterId: r.clusterId, error: r.error || 'Unknown error' }));
	}

	allOk(): boolean {
		return this.results.every((r) => r.status === 'ok');
	}

	sum(): number {
		return this.values().reduce((acc, v) => acc + (typeof v === 'number' ? v : 0), 0);
	}

	get(clusterId: number): ClusterResult<T> | undefined {
		return this.results.find((r) => r.clusterId === clusterId);
	}

	first(): T | undefined {
		return this.values()[0];
	}

	find(predicate: (value: T) => boolean): T | undefined {
		return this.values().find(predicate);
	}

	get size(): number {
		return this.results.length;
	}

	get successCount(): number {
		return this.results.filter((r) => r.status === 'ok').length;
	}

	get errorCount(): number {
		return this.results.filter((r) => r.status === 'error').length;
	}
}
