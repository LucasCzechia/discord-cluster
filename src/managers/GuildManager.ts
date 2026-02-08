import { GuildInfo } from '../types';
import { Routes } from 'discord.js';
import type { ClusterClient } from '../core/clusterClient';

export class GuildManager {
	constructor(private cluster: ClusterClient) {
		this.cluster.ipc.handle('__guild_count', () => {
			return this.cluster.client.guilds.cache.size;
		});

		this.cluster.ipc.handle('__guild_fetch', async (data: unknown) => {
			const { guildId } = data as { guildId: string };
			const guild = this.cluster.client.guilds.cache.get(guildId);
			if (!guild) return null;
			return {
				id: guild.id,
				name: guild.name,
				memberCount: guild.memberCount,
				ownerId: guild.ownerId,
				createdTimestamp: guild.createdTimestamp,
				iconURL: guild.iconURL({ forceStatic: false, size: 512 }),
				shardId: guild.shardId,
			} satisfies GuildInfo;
		});
	}

	async fetch(guildId: string): Promise<GuildInfo | null> {
		const local = this.cluster.client.guilds.cache.get(guildId);
		if (local) {
			return {
				id: local.id,
				name: local.name,
				memberCount: local.memberCount,
				ownerId: local.ownerId,
				createdTimestamp: local.createdTimestamp,
				iconURL: local.iconURL({ forceStatic: false, size: 512 }),
				shardId: local.shardId,
			};
		}

		const targetCluster = this.cluster.findGuild(guildId);
		if (targetCluster !== this.cluster.id) {
			try {
				const result = await this.cluster.ipc.requestTo<GuildInfo | null>(
					targetCluster, '__guild_fetch', { guildId }, 5000,
				);
				if (result) return result;
			} catch {}
		}

		try {
			const data = await this.cluster.client.rest.get(Routes.guild(guildId)) as any;
			return {
				id: data.id,
				name: data.name,
				memberCount: data.approximate_member_count ?? 0,
				ownerId: data.owner_id,
				createdTimestamp: new Date(data.id ? Number((BigInt(data.id) >> 22n) + 1420070400000n) : 0).getTime(),
				iconURL: data.icon ? `https://cdn.discordapp.com/icons/${data.id}/${data.icon}.webp?size=512` : null,
				shardId: this.cluster.findShard(guildId),
			};
		} catch {
			return null;
		}
	}

	async count(): Promise<number> {
		const results = await this.cluster.ipc.requestAll<number>('__guild_count');
		return results.sum();
	}
}
