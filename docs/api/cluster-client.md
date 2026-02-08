# ClusterClient

The `ClusterClient` runs inside each cluster process or worker thread. It provides access to the Discord.js Client, IPC communication with the manager and other clusters, cross-cluster data managers, and eval capabilities.

> For practical guides, see [Transparent API](/guide/transparent-api), [IPC Handlers](/guide/ipc), [Shared Store](/guide/store), and [Cross-Cluster Events](/guide/events).

## Import

```ts
import { ClusterClient } from 'discord-cluster';
```

## Constructor

```ts
new ClusterClient(client: Client)
```

| Parameter | Type | Description |
|-----------|------|-------------|
| `client` | `Client` | The Discord.js Client instance. The ClusterClient automatically configures the client's shard options. |

```ts
import { Client } from 'discord.js';
import { ClusterClient } from 'discord-cluster';

const client = new Client({ intents: [...] });
const cluster = new ClusterClient(client);
```

## Properties

| Property | Type | Description |
|----------|------|-------------|
| `id` | `number` | The current cluster's ID. |
| `shards` | `number[]` | Array of shard IDs assigned to this cluster. |
| `totalShards` | `number` | Total number of shards across all clusters. |
| `totalClusters` | `number` | Total number of clusters. |
| `isPrimary` | `boolean` | Whether this is cluster 0 (the first cluster). |
| `client` | `Client` | The Discord.js Client instance. |
| `info` | `ClusterClientData` | Full cluster metadata including shard list, manager mode, and queue mode. |
| `ready` | `boolean` | Whether this cluster has finished initializing. |
| `ipc` | `IPCHandler` | IPC handler for request/response communication between clusters. |
| `store` | `StoreClient` | Client for the shared key-value store managed by the ClusterManager. |
| `events` | `EventBusClient` | Client for the cross-cluster event bus. |
| `guilds` | `GuildManager` | Cross-cluster guild lookup manager. See [GuildManager](./guild-manager.md). |
| `channels` | `ChannelManager` | Cross-cluster channel operations manager. See [ChannelManager](./channel-manager.md). |
| `members` | `MemberManager` | Cross-cluster member operations manager. See [MemberManager](./member-manager.md). |
| `users` | `UserManager` | Cross-cluster user operations manager. See [UserManager](./user-manager.md). |
| `process` | `ChildClient \| WorkerClient \| null` | The underlying process or worker thread handle. |

## Methods

### send

Sends a message to the parent cluster manager via IPC.

```ts
public send<T extends Serializable>(
    message: SerializableInput<T>
): Promise<void>
```

| Parameter | Type | Description |
|-----------|------|-------------|
| `message` | `SerializableInput<T>` | The serializable message payload. |

```ts
await cluster.send({ type: 'STATUS', data: 'operational' });
```

### broadcast

Broadcasts a message to all clusters via the manager.

```ts
public broadcast<T extends Serializable>(
    message: SerializableInput<T>,
    sendSelf?: boolean
): Promise<void>
```

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `message` | `SerializableInput<T>` | -- | The serializable message payload. |
| `sendSelf` | `boolean` | `false` | Whether to include the current cluster in the broadcast. |

```ts
await cluster.broadcast({ type: 'CACHE_INVALIDATE', key: 'users' });
await cluster.broadcast({ type: 'SYNC' }, true);
```

### broadcastEval

Evaluates a script on all clusters in the context of each cluster's Discord.js Client.

```ts
public async broadcastEval<T, P extends object, C = InternalClient>(
    script: string | ((client: C, context: Serialized<P>) => Awaitable<T>),
    options?: EvalOptions<P>
): Promise<ValidIfSerializable<T>[]>
```

| Parameter | Type | Description |
|-----------|------|-------------|
| `script` | `string \| Function` | The script or function to evaluate on each cluster's client. |
| `options` | `EvalOptions<P>` | Optional eval options including target cluster, shard, guild, context, and timeout. |

**Returns:** `Promise<ValidIfSerializable<T>[]>` -- An array of results from each cluster.

```ts
const guildCounts = await cluster.broadcastEval(
    (client) => client.guilds.cache.size
);
const total = guildCounts.reduce((a, b) => a + b, 0);
```

### evalOnManager

Evaluates a script on the manager process in the context of the ClusterManager.

```ts
public async evalOnManager<T, P extends object, M = InternalManager>(
    script: ((manager: M, context: Serialized<P>) => Awaitable<T>),
    options?: { context?: P; timeout?: number }
): Promise<ValidIfSerializable<T>>
```

| Parameter | Type | Description |
|-----------|------|-------------|
| `script` | `Function` | The function to evaluate on the manager. Must be a function, not a string. |
| `options` | `object` | Optional context and timeout. |

```ts
const clusterCount = await cluster.evalOnManager(
    (manager) => manager.clusters.size
);
```

### evalOnGuild

Evaluates a script on the cluster that hosts a specific guild. The guild object is passed as the third argument. Only supported with discord.js.

```ts
public async evalOnGuild<T, P extends object, C = InternalClient>(
    guildId: string,
    script: (client: C, context: Serialized<P>, guild: Guild | undefined) => Awaitable<T>,
    options?: EvalOptions<P>
): Promise<ValidIfSerializable<T>>
```

| Parameter | Type | Description |
|-----------|------|-------------|
| `guildId` | `string` | The ID of the target guild. |
| `script` | `Function` | The function to evaluate. Receives the client, context, and guild. |
| `options` | `EvalOptions<P>` | Optional eval options. |

```ts
const name = await cluster.evalOnGuild(
    '123456789',
    (client, ctx, guild) => guild?.name
);
```

### evalOnClient

Evaluates a script on the current cluster's Client instance locally without IPC.

```ts
public async evalOnClient<T, P extends object, C = InternalClient>(
    script: string | ((client: C, context: Serialized<P>) => Awaitable<T>),
    options?: EvalOptions<P>
): Promise<ValidIfSerializable<T>>
```

| Parameter | Type | Description |
|-----------|------|-------------|
| `script` | `string \| Function` | The script or function to evaluate. |
| `options` | `EvalOptions<P>` | Optional eval options. |

### request

Sends a request to the manager and waits for a reply. The manager must handle the request and respond via `message.reply()`.

```ts
public request<T extends Serializable>(
    message: SerializableInput<T>,
    options?: { timeout?: number }
): Promise<ValidIfSerializable<T>>
```

| Parameter | Type | Description |
|-----------|------|-------------|
| `message` | `SerializableInput<T>` | The request payload. |
| `options.timeout` | `number` | Optional timeout in ms for waiting for the response. |

```ts
const config = await cluster.request({ type: 'GET_CONFIG' });
```

### respawnAll

Requests the manager to kill and respawn all clusters.

```ts
public respawnAll(
    clusterDelay?: number,
    respawnDelay?: number,
    timeout?: number,
    except?: number[]
): Promise<void>
```

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `clusterDelay` | `number` | `8000` | Delay in ms between each cluster respawn. |
| `respawnDelay` | `number` | `5500` | Delay in ms before respawning a killed cluster. |
| `timeout` | `number` | `-1` | Timeout in ms for each cluster to become ready. |
| `except` | `number[]` | `[]` | Cluster IDs to exclude from respawning. |

### respawnClusters

Requests the manager to kill and respawn specific clusters.

```ts
public async respawnClusters(
    clusters: number[],
    clusterDelay?: number,
    respawnDelay?: number,
    timeout?: number
): Promise<void>
```

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `clusters` | `number[]` | -- | Array of cluster IDs to respawn. |
| `clusterDelay` | `number` | `8000` | Delay in ms between each cluster respawn. |
| `respawnDelay` | `number` | `5500` | Delay in ms before respawning a killed cluster. |
| `timeout` | `number` | `-1` | Timeout in ms for each cluster to become ready. |

### requestRestart

Requests the manager to restart only the current cluster.

```ts
public async requestRestart(): Promise<void>
```

```ts
await cluster.requestRestart();
```

### requestRollingRestart

Requests the manager to perform a rolling restart of all clusters.

```ts
public async requestRollingRestart(options?: {
    restartMode?: 'rolling' | 'gracefulSwitch'
}): Promise<void>
```

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `options.restartMode` | `'rolling' \| 'gracefulSwitch'` | `'rolling'` | The restart strategy. |

### spawnNextCluster

Spawns the next cluster in the queue. Only available when the queue mode is set to `manual`.

```ts
public spawnNextCluster(): Promise<void>
```

```ts
await cluster.spawnNextCluster();
```

### stats

Fetches aggregate statistics from all clusters via IPC.

```ts
public async stats(): Promise<ClusterStats>
```

**Returns:** `Promise<ClusterStats>` -- Aggregated statistics including total guilds, users, and per-cluster breakdowns.

```ts
const stats = await cluster.stats();
console.log(`Total guilds: ${stats.totalGuilds}`);
console.log(`Total users: ${stats.totalUsers}`);
for (const c of stats.clusters) {
    console.log(`Cluster ${c.id}: ${c.guilds} guilds, ${c.memory} bytes`);
}
```

### findShard

Returns the shard ID that a given guild belongs to.

```ts
public findShard(guildId: string): number
```

| Parameter | Type | Description |
|-----------|------|-------------|
| `guildId` | `string` | The guild ID to look up. |

### findGuild

Returns the cluster ID that a given guild belongs to.

```ts
public findGuild(guildId: string): number
```

| Parameter | Type | Description |
|-----------|------|-------------|
| `guildId` | `string` | The guild ID to look up. |

```ts
const clusterId = cluster.findGuild('123456789');
const shardId = cluster.findShard('123456789');
```

## Events

Listen for events using the standard EventEmitter API:

```ts
cluster.on('eventName', (...args) => { });
```

| Event | Payload | Description |
|-------|---------|-------------|
| `ready` | `ClusterClient` | Emitted when this cluster is fully initialized and ready. |
| `managerReady` | -- | Emitted when all clusters across the manager are ready. |
| `message` | `ProcessMessage` | Emitted when a custom IPC message is received from the manager or another cluster. |
| `debug` | `string` | Emitted for internal debug messages. |

```ts
cluster.on('ready', (clusterClient) => {
    console.log(`Cluster ${clusterClient.id} is ready with shards: ${clusterClient.shards}`);
});

cluster.on('message', (message) => {
    console.log('Received:', message.data);
    if (message._type === 1) {
        message.reply({ status: 'ok' });
    }
});
```
