# discord-cluster

Stop using `broadcastEval`. It serializes functions as strings, `eval()`s them remotely, loses all TypeScript types, and broadcasts to every cluster even when only one has the data you need.

**discord-cluster** makes cross-cluster operations feel like normal discord.js code — cache first, targeted IPC, REST fallback, full types.

[![npm version](https://img.shields.io/npm/v/discord-cluster.svg)](https://www.npmjs.com/package/discord-cluster)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node.js](https://img.shields.io/badge/node-%3E%3D18.4.0-brightgreen.svg)](https://nodejs.org/)
[![Docs](https://img.shields.io/badge/docs-discord--cluster.vercel.app-blue.svg)](https://discord-cluster.vercel.app)

---

## Quick Start

```bash
npm install discord-cluster
```

### Manager (spawns clusters)

```typescript
import { ClusterManager, ProcessGuard } from 'discord-cluster';

const manager = new ClusterManager('./bot.js', {
  mode: 'worker',
  token: process.env.DISCORD_TOKEN,
  totalShards: -1,
  totalClusters: -1,
  logging: { enabled: true },
});

const guard = new ProcessGuard(manager);

guard.addCleanupTask('killClusters', async () => {
  for (const cluster of manager.clusters.values()) {
    await cluster.kill({ reason: 'Manager shutting down' });
  }
}, 10000);

manager.spawn();
```

### Bot file (runs in each cluster)

```typescript
import { ClusterClient, ClusterProcessGuard } from 'discord-cluster';
import { Client, GatewayIntentBits } from 'discord.js';

const client = new Client({ intents: [GatewayIntentBits.Guilds] });
const cluster = new ClusterClient(client);
const guard = new ClusterProcessGuard();

client.login(process.env.DISCORD_TOKEN);
```

`ClusterClient` automatically patches shard options and triggers ready. `ClusterProcessGuard` self-terminates the cluster if the manager dies.

> **[Full documentation →](https://discord-cluster.vercel.app)**

---

## Real-World Example

A slash command that fetches a guild from any cluster — no `broadcastEval`, no eval, no string serialization:

```typescript
client.on('interactionCreate', async (interaction) => {
  if (!interaction.isChatInputCommand()) return;

  if (interaction.commandName === 'server-info') {
    const guildId = interaction.options.getString('guild', true);

    const guild = await cluster.guilds.fetch(guildId);
    // Checks local cache → IPC to correct cluster → REST fallback

    if (!guild) return interaction.reply('Guild not found.');

    await interaction.reply(`**${guild.name}** — ${guild.memberCount} members`);
  }
});
```

One line. The library handles cache lookup, shard math routing, IPC, and REST fallback automatically.

---

## Features

| Feature | Description |
|---------|-------------|
| **Transparent API** | `cluster.guilds.fetch()`, `cluster.channels.send()`, `cluster.members.fetch()` work across clusters automatically |
| **Type-Safe IPC** | Named request/response handlers with full TypeScript types |
| **Shared Store** | Cross-cluster key-value store with TTL, sub-millisecond latency |
| **Cross-Cluster Events** | Pub/sub between clusters with optional targeting |
| **Structured Results** | `ResultCollection` with `.values()`, `.errors()`, `.sum()`, `.allOk()` |
| **Process Guard** | Orphan detection, stale cleanup, graceful shutdown with cleanup tasks |
| **Rolling Restarts** | Zero-downtime restarts with `manager.rollingRestart()` |
| **Logger** | Built-in colored logging with configurable levels |

---

## Transparent API

Access data from any cluster like you would with discord.js normally:

```typescript
const guild = await cluster.guilds.fetch('guildId');
const guildCount = await cluster.guilds.count();

const channel = await cluster.channels.fetch('channelId');
await cluster.channels.send('channelId', { content: 'Hello' });

const member = await cluster.members.fetch('guildId', 'userId');
await cluster.members.addRole('guildId', 'userId', 'roleId');
await cluster.members.removeRole('guildId', 'userId', 'roleId');
await cluster.members.ban('guildId', 'userId', { reason: 'bad' });

const user = await cluster.users.fetch('userId');
await cluster.users.send('userId', { content: 'DM' });
```

---

## Type-Safe IPC

Named handlers replace `broadcastEval`. Normal code, full types, no eval:

```typescript
cluster.ipc.handle('getGuildInfo', async (data) => {
  const guild = client.guilds.cache.get(data.guildId);
  if (!guild) return null;
  return { id: guild.id, name: guild.name, memberCount: guild.memberCount };
});

const info = await cluster.ipc.request('getGuildInfo', { guildId: '123' });

const info = await cluster.ipc.requestTo(2, 'getGuildInfo', { guildId: '123' });

const results = await cluster.ipc.requestAll('getGuildCount');
results.values()    // [1200, 1350, 1280]
results.errors()    // [{ clusterId: 2, error: '...' }]
results.sum()       // 3830
results.allOk()     // true
```

---

## Shared Store

Cross-cluster key-value store. Manager holds the data, clusters read/write via IPC:

```typescript
await cluster.store.set('cooldown:userId', Date.now(), { ttl: 30000 });
const val = await cluster.store.get('cooldown:userId');
const exists = await cluster.store.has('cooldown:userId');
await cluster.store.delete('cooldown:userId');
```

---

## Cross-Cluster Events

```typescript
cluster.events.broadcast('settingsUpdated', { guildId: '123' });

cluster.events.emitTo(3, 'reloadConfig', {});

cluster.events.on('settingsUpdated', (data) => {
  settingsCache.delete(data.guildId);
});
```

---

## Stats & Utilities

```typescript
const stats = await cluster.stats();
// { totalGuilds, totalUsers, totalClusters, totalShards, clusters: [...] }

cluster.findGuild('guildId')  // → clusterId
cluster.findShard('guildId')  // → shardId

cluster.id          // current cluster id
cluster.shards      // [0, 1, 2, 3]
cluster.isPrimary   // cluster.id === 0
cluster.totalShards
cluster.totalClusters
```

---

## Process Guard

### Manager side

Graceful shutdown with cleanup tasks, signal handling, stale process cleanup:

```typescript
const guard = new ProcessGuard(manager);

guard.addCleanupTask('saveState', async () => {
  await db.flush();
}, 5000);

guard.addCleanupTask('killClusters', async () => {
  for (const cluster of manager.clusters.values()) {
    await cluster.kill({ reason: 'Shutting down' });
  }
}, 10000);
```

### Cluster side

Monitors parent PID. If the manager dies, the cluster self-terminates:

```typescript
const guard = new ClusterProcessGuard();
```

---

## Logging

Built-in colored console output. Disabled by default:

```typescript
const manager = new ClusterManager('./bot.js', {
  logging: {
    enabled: true,
    colors: true,
    timestamps: true,
    level: 'info',       // 'debug' | 'info' | 'warn' | 'error'
  },
});

manager.logger.info('[MyApp] Custom message');
manager.logger.warn('[MyApp] Warning');
manager.logger.error('[MyApp] Error');
```

---

## Why Not broadcastEval?

| | discord-cluster | broadcastEval |
|--|:-:|:-:|
| TypeScript types | Full | Lost |
| Targeted requests | Math routing | Broadcast to all |
| Return types | Typed | `unknown` |
| Error handling | Per-cluster | All or nothing |
| Shared state | Built-in store | DIY |
| Events | Pub/sub | None |
| Code | Normal functions | Serialized strings |

---

<details>
<summary><b>All ClusterManager options</b></summary>

```typescript
const manager = new ClusterManager('./bot.js', {
  mode: 'worker',              // 'worker' | 'process'
  token: process.env.DISCORD_TOKEN,

  totalShards: -1,             // -1 = auto from Discord API
  totalClusters: -1,           // -1 = auto (based on CPU cores)
  shardsPerClusters: -1,       // -1 = auto (totalShards / totalClusters)

  spawnOptions: {
    timeout: -1,               // Spawn timeout (-1 = none)
    delay: 7000,               // Delay between cluster spawns
  },

  heartbeat: {
    enabled: true,
    interval: 2000,
    timeout: 8000,
    maxMissedHeartbeats: 2,
    maxRestarts: -1,           // -1 = unlimited
  },

  respawn: true,

  logging: {
    enabled: false,
    colors: true,
    timestamps: true,
    level: 'info',
  },

  queueOptions: {
    mode: 'auto',              // 'auto' | 'manual'
  },

  shardArgs: [],
  execArgv: [],
});
```

</details>

---

## Requirements

- **Node.js** 18.4.0+
- **discord.js** 14.14.1+

---

## License

MIT © [LucasCzechia](https://github.com/LucasCzechia)
