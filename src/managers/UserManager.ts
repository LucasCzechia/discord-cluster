import { SendResult } from '../types';
import { Routes } from 'discord.js';
import type { ClusterClient } from '../core/clusterClient';

export class UserManager {
	constructor(private cluster: ClusterClient) {}

	async send(userId: string, payload: object): Promise<SendResult> {
		try {
			const dmChannel = await this.cluster.client.rest.post(Routes.userChannels(), {
				body: { recipient_id: userId },
			}) as any;

			const message = await this.cluster.client.rest.post(Routes.channelMessages(dmChannel.id), {
				body: payload,
			}) as any;

			return { success: true, messageId: message.id };
		} catch (err) {
			return { success: false, error: (err as Error).message };
		}
	}

	async fetch(userId: string): Promise<{ id: string; username: string; avatar: string; bot: boolean } | null> {
		const local = this.cluster.client.users.cache.get(userId);
		if (local) {
			return {
				id: local.id,
				username: local.username,
				avatar: local.displayAvatarURL({ forceStatic: false }),
				bot: local.bot,
			};
		}

		try {
			const data = await this.cluster.client.rest.get(Routes.user(userId)) as any;
			return {
				id: data.id,
				username: data.username,
				avatar: data.avatar
					? `https://cdn.discordapp.com/avatars/${data.id}/${data.avatar}.webp`
					: `https://cdn.discordapp.com/embed/avatars/${(BigInt(data.id) >> 22n) % 6n}.png`,
				bot: data.bot ?? false,
			};
		} catch {
			return null;
		}
	}
}
