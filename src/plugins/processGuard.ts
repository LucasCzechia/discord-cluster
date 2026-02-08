import { ClusterManager } from '../core/clusterManager';
import { ChildProcess } from 'child_process';
import { Worker } from 'worker_threads';
import EventEmitter from 'events';
import path from 'path';
import fs from 'fs';

interface CleanupTask {
	task: () => Promise<void>;
	timeout: number;
}

export class ProcessGuard extends EventEmitter {
	private pidFile: string;
	private orphanCheckInterval?: NodeJS.Timeout;
	private isShuttingDown: boolean = false;
	private shutdownStartTime: number | null = null;
	private shutdownPromise: Promise<void> | null = null;
	private forceExitTimeout: NodeJS.Timeout | null = null;
	private cleanupTasks: Map<string, CleanupTask> = new Map();
	private signalHandler: ((signal: string) => void) | null = null;

	constructor(private manager: ClusterManager, options?: { pidDir?: string; orphanCheckMs?: number; forceExitMs?: number }) {
		super();

		this.pidFile = path.join(options?.pidDir || process.cwd(), '.discord-cluster.pids');

		this.cleanStaleProcesses();
		this.writePidFile();
		this.setupSignalHandlers(options?.forceExitMs ?? 90000);

		const interval = options?.orphanCheckMs ?? 30000;
		if (interval > 0) {
			this.orphanCheckInterval = setInterval(() => this.writePidFile(), interval);
		}
	}

	addCleanupTask(name: string, taskFn: () => Promise<void>, timeout: number = 30000): void {
		this.cleanupTasks.set(name, { task: taskFn, timeout });
	}

	removeCleanupTask(name: string): void {
		this.cleanupTasks.delete(name);
	}

	isInShutdown(): boolean {
		return this.isShuttingDown;
	}

	async initiate(reason: string): Promise<void> {
		if (this.isShuttingDown) return this.shutdownPromise as Promise<void>;

		this.isShuttingDown = true;
		this.shutdownStartTime = Date.now();

		this.manager._info(`[ProcessGuard] Received ${reason}. Initiating graceful shutdown...`);
		this.emit('shutdown:start', reason);

		this.shutdownPromise = this.executeShutdown(reason);
		return this.shutdownPromise;
	}

	private async executeShutdown(reason: string): Promise<void> {
		const tasks = Array.from(this.cleanupTasks.entries());

		try {
			for (const [name, { task, timeout }] of tasks) {
				this.manager._debug(`[ProcessGuard] Step: ${name}...`);
				try {
					await Promise.race([
						task(),
						new Promise<void>((_, reject) => setTimeout(() => reject(new Error(`${name} timeout`)), timeout)),
					]);
					this.manager._debug(`[ProcessGuard] ${name} completed.`);
				} catch (err) {
					this.manager._debug(`[ProcessGuard] ${name}: ${(err as Error).message}`);
				}
			}

			this.killAllChildren();

			this.emit('shutdown:complete');

			const totalTime = Date.now() - (this.shutdownStartTime || Date.now());
			this.manager._info(`[ProcessGuard] Graceful shutdown completed in ${totalTime}ms.`);

			if (this.forceExitTimeout) clearTimeout(this.forceExitTimeout);
			this.cleanup();
			process.exit(0);
		} catch (err) {
			this.manager._debug(`[ProcessGuard] Shutdown error: ${(err as Error).message}`);
			this.killAllChildren();
			if (this.forceExitTimeout) clearTimeout(this.forceExitTimeout);
			this.cleanup();
			process.exit(1);
		}
	}

	private setupSignalHandlers(forceExitMs: number): void {
		this.signalHandler = (signal: string) => {
			if (this.isShuttingDown) {
				this.manager._debug(`[ProcessGuard] Received ${signal} but shutdown already in progress.`);
				return;
			}

			this.forceExitTimeout = setTimeout(() => {
				this.manager.logger.error(`[ProcessGuard] Force exit after ${forceExitMs}ms.`);
				this.killAllChildren();
				process.exit(1);
			}, forceExitMs);

			this.initiate(signal);
		};

		process.on('SIGTERM', () => this.signalHandler?.('SIGTERM'));
		process.on('SIGINT', () => this.signalHandler?.('SIGINT'));
		process.on('uncaughtException', (err) => {
			this.manager.logger.error(`[ProcessGuard] Uncaught exception: ${err}`);
			if (!this.isShuttingDown) {
				this.forceExitTimeout = setTimeout(() => process.exit(1), forceExitMs);
				this.initiate('uncaughtException');
			}
		});
		process.on('unhandledRejection', (reason) => {
			this.manager.logger.error(`[ProcessGuard] Unhandled rejection: ${reason}`);
		});
	}

	private getChildPids(): number[] {
		const pids: number[] = [];
		for (const cluster of this.manager.clusters.values()) {
			if (!cluster.thread?.process) continue;
			const proc = cluster.thread.process;
			if ('pid' in proc && (proc as ChildProcess).pid) {
				pids.push((proc as ChildProcess).pid!);
			} else if ('threadId' in proc) {
				pids.push((proc as Worker).threadId);
			}
		}
		return pids;
	}

	private writePidFile(): void {
		try {
			const data = {
				managerPid: process.pid,
				children: this.getChildPids(),
				timestamp: Date.now(),
			};
			fs.writeFileSync(this.pidFile, JSON.stringify(data));
		} catch {}
	}

	private cleanStaleProcesses(): void {
		try {
			if (!fs.existsSync(this.pidFile)) return;
			const raw = fs.readFileSync(this.pidFile, 'utf-8');
			const data = JSON.parse(raw) as { managerPid: number; children: number[]; timestamp: number };

			if (this.isProcessAlive(data.managerPid)) return;

			this.manager._debug(`[ProcessGuard] Found stale PID file from manager ${data.managerPid}. Cleaning ${data.children.length} orphan processes.`);

			for (const pid of data.children) {
				try {
					process.kill(pid, 'SIGTERM');
					this.manager._debug(`[ProcessGuard] Killed stale process ${pid}.`);
				} catch {}
			}

			fs.unlinkSync(this.pidFile);
		} catch {}
	}

	private isProcessAlive(pid: number): boolean {
		try {
			process.kill(pid, 0);
			return true;
		} catch {
			return false;
		}
	}

	private killAllChildren(): void {
		for (const cluster of this.manager.clusters.values()) {
			if (cluster.thread?.process) {
				try {
					const proc = cluster.thread.process;
					if ('kill' in proc) (proc as ChildProcess).kill('SIGTERM');
					else if ('terminate' in proc) (proc as Worker).terminate();
				} catch {}
			}
		}
	}

	private cleanup(): void {
		if (this.orphanCheckInterval) clearInterval(this.orphanCheckInterval);
		try { fs.unlinkSync(this.pidFile); } catch {}
	}

	destroy(): void {
		this.cleanup();
	}
}

export class ClusterProcessGuard {
	private managerPid: number;
	private checkInterval: NodeJS.Timeout;
	private missedChecks: number = 0;

	constructor(options?: { checkMs?: number; maxMissed?: number }) {
		const ppid = process.ppid;
		if (!ppid || ppid === 1) {
			throw new Error('ClusterProcessGuard: No parent process detected.');
		}

		this.managerPid = ppid;
		const checkMs = options?.checkMs ?? 10000;
		const maxMissed = options?.maxMissed ?? 3;

		this.checkInterval = setInterval(() => {
			if (!this.isManagerAlive()) {
				this.missedChecks++;
				if (this.missedChecks >= maxMissed) {
					console.error(`[ClusterProcessGuard] Manager (PID ${this.managerPid}) is dead. Self-terminating after ${this.missedChecks} missed checks.`);
					this.destroy();
					process.exit(1);
				}
			} else {
				this.missedChecks = 0;
			}
		}, checkMs);
	}

	private isManagerAlive(): boolean {
		try {
			process.kill(this.managerPid, 0);
			return true;
		} catch {
			return false;
		}
	}

	destroy(): void {
		clearInterval(this.checkInterval);
	}
}
