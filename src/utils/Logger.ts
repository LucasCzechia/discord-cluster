import pc from 'picocolors';
import { LoggingOptions } from '../types';

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const LEVEL_PRIORITY: Record<LogLevel, number> = {
	debug: 0,
	info: 1,
	warn: 2,
	error: 3,
};

const LEVEL_COLORS: Record<LogLevel, (s: string) => string> = {
	debug: pc.gray,
	info: pc.cyan,
	warn: pc.yellow,
	error: pc.red,
};

const LEVEL_LABELS: Record<LogLevel, string> = {
	debug: 'DEBUG',
	info: 'INFO',
	warn: 'WARN',
	error: 'ERROR',
};

const TAG_COLORS = [
	pc.green,
	pc.blue,
	pc.magenta,
	pc.cyan,
	pc.yellow,
];

export class Logger {
	private enabled: boolean;
	private useColors: boolean;
	private useTimestamps: boolean;
	private minLevel: number;
	private tagColorMap: Map<string, (s: string) => string> = new Map();
	private tagColorIndex = 0;

	constructor(options?: LoggingOptions) {
		this.enabled = options?.enabled ?? false;
		this.useColors = options?.colors ?? true;
		this.useTimestamps = options?.timestamps ?? true;
		this.minLevel = LEVEL_PRIORITY[options?.level ?? 'info'];
	}

	debug(message: string): void {
		this.log('debug', message);
	}

	info(message: string): void {
		this.log('info', message);
	}

	warn(message: string): void {
		this.log('warn', message);
	}

	error(message: string): void {
		this.log('error', message);
	}

	private log(level: LogLevel, message: string): void {
		if (!this.enabled || LEVEL_PRIORITY[level] < this.minLevel) return;

		const { tag, body } = this.parseTag(message);
		const parts: string[] = [];

		if (this.useTimestamps) {
			const ts = this.timestamp();
			parts.push(this.useColors ? pc.gray(ts) : ts);
		}

		const label = `[${LEVEL_LABELS[level]}]`;
		parts.push(this.useColors ? LEVEL_COLORS[level](label) : label);

		if (tag) {
			const tagStr = `[${tag}]`;
			parts.push(this.useColors ? this.colorForTag(tag)(tagStr) : tagStr);
		}

		const text = this.useColors ? LEVEL_COLORS[level](body) : body;
		parts.push(text);

		const output = parts.join(' ');
		if (level === 'error') {
			console.error(output);
		} else if (level === 'warn') {
			console.warn(output);
		} else {
			console.log(output);
		}
	}

	private parseTag(message: string): { tag: string | null; body: string } {
		const match = message.match(/^\[([^\]]+)\]\s*(.*)/s);
		if (match) return { tag: match[1], body: match[2] };
		return { tag: null, body: message };
	}

	private colorForTag(tag: string): (s: string) => string {
		let fn = this.tagColorMap.get(tag);
		if (!fn) {
			fn = TAG_COLORS[this.tagColorIndex % TAG_COLORS.length];
			this.tagColorIndex++;
			this.tagColorMap.set(tag, fn);
		}
		return fn;
	}

	private timestamp(): string {
		const now = new Date();
		const h = String(now.getHours()).padStart(2, '0');
		const m = String(now.getMinutes()).padStart(2, '0');
		const s = String(now.getSeconds()).padStart(2, '0');
		return `[${h}:${m}:${s}]`;
	}
}
