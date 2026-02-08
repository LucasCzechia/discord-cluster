# GuildManager

The `GuildManager` provides cross-cluster guild lookup capabilities. It is accessible from any cluster via `cluster.guilds` and can fetch guild information regardless of which cluster the guild is cached on.

> For usage examples, see the [Transparent API guide](/guide/transparent-api#guilds).

## Import

The GuildManager is automatically instantiated on the ClusterClient. You do not need to import it directly.

```ts
const guildManager = cluster.guilds;
```

## Lookup Strategy

When fetching a guild, the manager follows this resolution order:

1. Check the local cluster's cache
2. Send an IPC request to the cluster that should own the guild (based on shard calculation)
3. Fall back to a direct Discord REST API call

## Methods

### fetch

Fetches information about a guild by its ID. Returns a `GuildInfo` object or `null` if the guild cannot be found.

```ts
async fetch(guildId: string): Promise<GuildInfo | null>
```

| Parameter | Type | Description |
|-----------|------|-------------|
| `guildId` | `string` | The ID of the guild to fetch. |

```ts
const guild = await cluster.guilds.fetch('123456789012345678');
if (guild) {
    console.log(`${guild.name} has ${guild.memberCount} members`);
}
```

### count

Returns the total number of guilds across all clusters by aggregating counts from every cluster via IPC.

```ts
async count(): Promise<number>
```

```ts
const totalGuilds = await cluster.guilds.count();
console.log(`Bot is in ${totalGuilds} guilds`);
```

## Interfaces

### GuildInfo

```ts
interface GuildInfo {
    id: string;
    name: string;
    memberCount: number;
    ownerId: string;
    createdTimestamp: number;
    iconURL: string | null;
    shardId: number;
}
```

| Field | Type | Description |
|-------|------|-------------|
| `id` | `string` | The guild's snowflake ID. |
| `name` | `string` | The guild's name. |
| `memberCount` | `number` | The approximate or cached member count. |
| `ownerId` | `string` | The ID of the guild owner. |
| `createdTimestamp` | `number` | Unix timestamp (ms) of when the guild was created. |
| `iconURL` | `string \| null` | URL to the guild's icon, or `null` if none. |
| `shardId` | `number` | The shard ID that this guild belongs to. |
