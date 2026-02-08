import { MemberInfo, RolesResult, ManageRolesOptions } from '../types';
import { Routes } from 'discord.js';
import type { ClusterClient } from '../core/clusterClient';

export class MemberManager {
	constructor(private cluster: ClusterClient) {
		this.cluster.ipc.handle('__member_fetch', async (data: unknown) => {
			const { guildId, userId } = data as { guildId: string; userId: string };
			const guild = this.cluster.client.guilds.cache.get(guildId);
			if (!guild) return null;
			try {
				const member = await guild.members.fetch(userId);
				return {
					id: member.id,
					displayName: member.displayName,
					username: member.user.username,
					avatar: member.user.displayAvatarURL({ forceStatic: false }),
					roles: Array.from(member.roles.cache.keys()),
					joinedAt: member.joinedTimestamp,
					premiumSince: member.premiumSinceTimestamp,
				} satisfies MemberInfo;
			} catch {
				return null;
			}
		});
	}

	async fetch(guildId: string, userId: string): Promise<MemberInfo | null> {
		const guild = this.cluster.client.guilds.cache.get(guildId);
		if (guild) {
			try {
				const member = await guild.members.fetch(userId);
				return {
					id: member.id,
					displayName: member.displayName,
					username: member.user.username,
					avatar: member.user.displayAvatarURL({ forceStatic: false }),
					roles: Array.from(member.roles.cache.keys()),
					joinedAt: member.joinedTimestamp,
					premiumSince: member.premiumSinceTimestamp,
				};
			} catch {}
		}

		const targetCluster = this.cluster.findGuild(guildId);
		if (targetCluster !== this.cluster.id) {
			try {
				const result = await this.cluster.ipc.requestTo<MemberInfo | null>(
					targetCluster, '__member_fetch', { guildId, userId }, 5000,
				);
				if (result) return result;
			} catch {}
		}

		try {
			const data = await this.cluster.client.rest.get(Routes.guildMember(guildId, userId)) as any;
			return {
				id: data.user.id,
				displayName: data.nick || data.user.global_name || data.user.username,
				username: data.user.username,
				avatar: data.user.avatar
					? `https://cdn.discordapp.com/avatars/${data.user.id}/${data.user.avatar}.webp`
					: `https://cdn.discordapp.com/embed/avatars/${(BigInt(data.user.id) >> 22n) % 6n}.png`,
				roles: data.roles || [],
				joinedAt: data.joined_at ? new Date(data.joined_at).getTime() : null,
				premiumSince: data.premium_since ? new Date(data.premium_since).getTime() : null,
			};
		} catch {
			return null;
		}
	}

	async addRole(guildId: string, userId: string, roleId: string, reason?: string): Promise<RolesResult> {
		try {
			await this.cluster.client.rest.put(Routes.guildMemberRole(guildId, userId, roleId), {
				reason,
			});
			return { success: true, added: 1, removed: 0 };
		} catch (err) {
			return { success: false, error: (err as Error).message };
		}
	}

	async removeRole(guildId: string, userId: string, roleId: string, reason?: string): Promise<RolesResult> {
		try {
			await this.cluster.client.rest.delete(Routes.guildMemberRole(guildId, userId, roleId), {
				reason,
			});
			return { success: true, added: 0, removed: 1 };
		} catch (err) {
			return { success: false, error: (err as Error).message };
		}
	}

	async manageRoles(guildId: string, userId: string, options: ManageRolesOptions): Promise<RolesResult> {
		const { add = [], remove = [], reason } = options;
		try {
			for (const roleId of add) {
				await this.cluster.client.rest.put(Routes.guildMemberRole(guildId, userId, roleId), { reason });
			}
			for (const roleId of remove) {
				await this.cluster.client.rest.delete(Routes.guildMemberRole(guildId, userId, roleId), { reason });
			}
			return { success: true, added: add.length, removed: remove.length };
		} catch (err) {
			return { success: false, error: (err as Error).message };
		}
	}

	async ban(guildId: string, userId: string, options?: { reason?: string; deleteMessageSeconds?: number }): Promise<{ success: boolean; error?: string }> {
		try {
			await this.cluster.client.rest.put(Routes.guildBan(guildId, userId), {
				body: { delete_message_seconds: options?.deleteMessageSeconds },
				reason: options?.reason,
			});
			return { success: true };
		} catch (err) {
			return { success: false, error: (err as Error).message };
		}
	}

	async kick(guildId: string, userId: string, reason?: string): Promise<{ success: boolean; error?: string }> {
		try {
			await this.cluster.client.rest.delete(Routes.guildMember(guildId, userId), { reason });
			return { success: true };
		} catch (err) {
			return { success: false, error: (err as Error).message };
		}
	}
}
