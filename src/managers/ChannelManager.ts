import { SendResult, ChannelInfo, FilePath } from '../types';
import { AttachmentBuilder, Channel, Routes } from 'discord.js';
import type { ClusterClient } from '../core/clusterClient';

export class ChannelManager {
	constructor(private cluster: ClusterClient) {
		this.cluster.ipc.handle('__channel_fetch', async (data: unknown) => {
			const { channelId } = data as { channelId: string };
			const channel = this.cluster.client.channels.cache.get(channelId);
			if (!channel) return null;
			return this._serialize(channel);
		});

		this.cluster.ipc.handle('__channel_send', async (data: unknown) => {
			const { channelId, payload, filePaths } = data as { channelId: string; payload: any; filePaths?: FilePath[] };
			const channel = this.cluster.client.channels.cache.get(channelId);
			if (channel && 'send' in channel && typeof (channel as any).send === 'function') {
				try {
					if (filePaths?.length) {
						payload.files = filePaths.map((fp: FilePath) => new AttachmentBuilder(fp.path, { name: fp.name }));
					}
					const msg = await (channel as any).send(payload);
					return { success: true, messageId: msg.id } satisfies SendResult;
				} catch (err) {
					return { success: false, error: (err as Error).message } satisfies SendResult;
				}
			}
			return null;
		});
	}

	async fetch(channelId: string): Promise<ChannelInfo | null> {
		const local = this.cluster.client.channels.cache.get(channelId);
		if (local) return this._serialize(local);

		const results = await this.cluster.ipc.requestAll<ChannelInfo | null>('__channel_fetch', { channelId });
		const found = results.find((v) => v !== null);
		if (found) return found;

		try {
			const data = await this.cluster.client.rest.get(Routes.channel(channelId)) as any;
			return {
				id: data.id,
				name: data.name ?? null,
				type: data.type,
				guildId: data.guild_id ?? null,
			};
		} catch (err) {
			this.cluster.emit('debug', `[ChannelManager] REST fetch failed for ${channelId}: ${(err as Error).message}`);
			return null;
		}
	}

	async send(channelId: string, payload: any, filePaths?: FilePath[]): Promise<SendResult> {
		const local = this.cluster.client.channels.cache.get(channelId);
		if (local && 'send' in local && typeof (local as any).send === 'function') {
			try {
				if (filePaths?.length) {
					payload.files = filePaths.map((fp: FilePath) => new AttachmentBuilder(fp.path, { name: fp.name }));
				}
				const msg = await (local as any).send(payload);
				return { success: true, messageId: msg.id };
			} catch (err) {
				return { success: false, error: (err as Error).message };
			}
		}

		const results = await this.cluster.ipc.requestAll<SendResult | null>('__channel_send', { channelId, payload, filePaths });
		const sent = results.find((v) => v !== null && v.success);
		if (sent) return sent;

		try {
			const data = await this.cluster.client.rest.post(Routes.channelMessages(channelId), {
				body: payload,
			}) as any;
			return { success: true, messageId: data.id };
		} catch (err) {
			return { success: false, error: (err as Error).message };
		}
	}

	async edit(channelId: string, messageId: string, payload: object): Promise<SendResult> {
		try {
			const data = await this.cluster.client.rest.patch(Routes.channelMessage(channelId, messageId), {
				body: payload,
			}) as any;
			return { success: true, messageId: data.id };
		} catch (err) {
			return { success: false, error: (err as Error).message };
		}
	}

	async delete(channelId: string, messageId: string): Promise<{ success: boolean; error?: string }> {
		try {
			await this.cluster.client.rest.delete(Routes.channelMessage(channelId, messageId));
			return { success: true };
		} catch (err) {
			return { success: false, error: (err as Error).message };
		}
	}

	private _serialize(channel: Channel): ChannelInfo {
		return {
			id: channel.id,
			name: 'name' in channel ? (channel as any).name : null,
			type: channel.type,
			guildId: 'guildId' in channel ? (channel as any).guildId : null,
		};
	}
}
