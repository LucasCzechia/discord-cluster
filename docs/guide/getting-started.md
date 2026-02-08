# Getting Started

## Installation

```bash
npm install discord-cluster discord.js
```

Requires Node.js 18.4.0 or newer and discord.js 14.14.1 or newer.

## Project Structure

A discord-cluster project has two files:

- **Manager file** -- runs on the main process, spawns and manages clusters
- **Bot file** -- runs inside each cluster, contains your discord.js client

## Manager Setup

Create a `manager.ts` (or `manager.js`) file. This is the entry point you run with `node`.

```ts
import { ClusterManager, ProcessGuard } from 'discord-cluster';

const manager = new ClusterManager('./dist/bot.js', {
  token: process.env.DISCORD_TOKEN,
  mode: 'worker',
  totalShards: 'auto',
  totalClusters: -1,
  shardsPerClusters: -1,
  respawn: true,
  spawnOptions: {
    delay: 7000,
    timeout: -1,
  },
  heartbeat: {
    enabled: true,
    interval: 2000,
    timeout: 8000,
    maxMissedHeartbeats: 2,
    maxRestarts: -1,
  },
  logging: {
    enabled: true,
    level: 'info',
    colors: true,
    timestamps: true,
  },
});

const guard = new ProcessGuard(manager, {
  forceExitMs: 90000,
  orphanCheckMs: 30000,
});

guard.addCleanupTask('database', async () => {
  // close DB connections
}, 10000);

manager.on('clusterCreate', (cluster) => {
  console.log(`Cluster ${cluster.id} created`);
});

manager.on('ready', () => {
  console.log('All clusters are ready');
});

manager.spawn();
```

### Manager Options

| Option | Type | Default | Description |
|---|---|---|---|
| `mode` | `'worker' \| 'process'` | `'worker'` | Clustering mode |
| `token` | `string` | -- | Discord bot token |
| `totalShards` | `number` | `-1` (auto) | Total shard count |
| `totalClusters` | `number` | `-1` (auto) | Total cluster count |
| `shardsPerClusters` | `number` | `-1` (auto) | Shards per cluster |
| `respawn` | `boolean` | `true` | Auto-respawn on crash |
| `spawnOptions` | `object` | -- | Delay and timeout for spawning |
| `heartbeat` | `object` | -- | Heartbeat monitoring config |
| `logging` | `object` | -- | Logger config |

## Bot File Setup

Create a `bot.ts` file. This is the script that runs inside each cluster.

```ts
import { ClusterClient, ClusterProcessGuard } from 'discord-cluster';
import { Client, GatewayIntentBits } from 'discord.js';

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
  ],
});

const cluster = new ClusterClient(client);
new ClusterProcessGuard();

client.on('ready', () => {
  console.log(`Cluster ${cluster.id} ready with shards [${cluster.shards.join(', ')}]`);
});

client.login(process.env.DISCORD_TOKEN);
```

The `ClusterClient` constructor automatically configures `client.options.shards` and `client.options.shardCount` from the cluster environment. It also listens for the `clientReady` event to signal readiness back to the manager.

### ClusterClient Properties

| Property | Type | Description |
|---|---|---|
| `cluster.id` | `number` | Current cluster ID |
| `cluster.totalShards` | `number` | Total shard count across all clusters |
| `cluster.totalClusters` | `number` | Total cluster count |
| `cluster.shards` | `number[]` | Shard IDs assigned to this cluster |
| `cluster.isPrimary` | `boolean` | Whether this is cluster 0 |
| `cluster.ipc` | `IPCHandler` | IPC request/response handler |
| `cluster.store` | `StoreClient` | Shared key-value store |
| `cluster.events` | `EventBusClient` | Cross-cluster event bus |
| `cluster.guilds` | `GuildManager` | Transparent guild lookups |
| `cluster.channels` | `ChannelManager` | Transparent channel operations |
| `cluster.members` | `MemberManager` | Transparent member operations |
| `cluster.users` | `UserManager` | Transparent user operations |

## Worker vs Process Mode

The `mode` option controls how clusters are spawned.

### Worker Mode (default)

```ts
const manager = new ClusterManager('./dist/bot.js', {
  mode: 'worker',
});
```

Uses `worker_threads`. All clusters share the same process memory space. Lower overhead, faster IPC. Best for most bots.

### Process Mode

```ts
const manager = new ClusterManager('./dist/bot.js', {
  mode: 'process',
});
```

Uses `child_process.fork()`. Each cluster runs in its own OS process with isolated memory. Better fault isolation -- a crash in one cluster does not affect others. Use this when you need full process isolation or are running untrusted code.

## Utility Methods

The `ClusterClient` provides helper methods for routing:

```ts
const shardId = cluster.findShard('guild-id-here');

const clusterId = cluster.findGuild('guild-id-here');
```

Get aggregate stats across all clusters:

```ts
const stats = await cluster.stats();
console.log(`Total guilds: ${stats.totalGuilds}`);
console.log(`Total users: ${stats.totalUsers}`);
```

## Next Steps

- [Transparent API](/guide/transparent-api) -- query guilds, channels, members, and users across clusters
- [IPC Handlers](/guide/ipc) -- define custom request/response handlers
- [Shared Store](/guide/store) -- cross-cluster key-value storage
- [Cross-Cluster Events](/guide/events) -- broadcast events between clusters
