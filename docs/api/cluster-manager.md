# ClusterManager

The `ClusterManager` is the main entry point for managing clusters. It runs on the primary process and is responsible for spawning, monitoring, and communicating with all cluster processes or worker threads.

## Import

```ts
import { ClusterManager } from 'discord-cluster';
```

## Constructor

```ts
new ClusterManager(file: string, options: ClusterManagerCreateOptions<ClusteringMode>)
```

| Parameter | Type | Description |
|-----------|------|-------------|
| `file` | `string` | Path to the bot file that each cluster will execute. Resolved to an absolute path automatically. |
| `options` | `ClusterManagerCreateOptions` | Configuration options for the manager. See [Types](./types.md#clustermanagercreateoptions). |

```ts
const manager = new ClusterManager('./bot.js', {
    token: process.env.DISCORD_TOKEN,
    totalShards: 'auto',
    totalClusters: 4,
    mode: 'worker',
});
```

## Properties

| Property | Type | Description |
|----------|------|-------------|
| `ready` | `boolean` | Whether all clusters have been spawned and are ready. |
| `clusters` | `CustomMap<number, Cluster>` | A collection of all clusters the manager has spawned, keyed by cluster ID. |
| `options` | `ClusterManagerOptions` | The resolved options for the manager, with defaults applied. |
| `store` | `StoreManager` | Shared key-value store accessible from all clusters. |
| `eventBus` | `EventBusManager` | Cross-cluster event bus for publishing and subscribing to events. |
| `heartbeat` | `HeartbeatManager \| null` | Heartbeat manager that monitors cluster health. `null` if heartbeat is disabled. |
| `logger` | `Logger` | Logger instance used for debug and info output. |
| `promise` | `PromiseHandler` | Internal promise handler for tracking IPC responses. |
| `reCluster` | `ReClusterManager` | Manager for rolling restarts and reclustering operations. |
| `clusterQueue` | `Queue` | Internal queue that controls the order and timing of cluster spawns. |
| `file` | `string` | Absolute path to the bot file. |

## Methods

### spawn

Spawns all clusters according to the configured options. Automatically fetches the recommended shard count from the Discord API if `totalShards` is set to `-1`.

```ts
public async spawn(): Promise<Queue>
```

**Returns:** `Promise<Queue>` -- The spawn queue that manages the cluster creation process.

```ts
await manager.spawn();
```

### broadcast

Sends a message to all clusters via IPC.

```ts
public async broadcast<T extends Serializable>(
    message: SerializableInput<T>,
    ignoreClusters?: number[]
): Promise<void>
```

| Parameter | Type | Description |
|-----------|------|-------------|
| `message` | `SerializableInput<T>` | The message payload to broadcast. |
| `ignoreClusters` | `number[]` | Optional array of cluster IDs to exclude from the broadcast. |

```ts
await manager.broadcast({ type: 'CONFIG_UPDATE', data: newConfig });
await manager.broadcast({ type: 'RELOAD' }, [0, 2]);
```

### broadcastEval

Evaluates a script on all clusters (or specific clusters) in the context of each cluster's Discord.js Client.

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
const guildCounts = await manager.broadcastEval(
    (client) => client.guilds.cache.size
);

const guild = await manager.broadcastEval(
    (client, ctx) => client.guilds.cache.get(ctx.guildId)?.name,
    { context: { guildId: '123456789' }, cluster: 0 }
);
```

### evalOnCluster

Evaluates a script on a specific cluster in the context of the Cluster instance itself (not the Client).

```ts
public async evalOnCluster<T, P extends object, C = InternalCluster>(
    cluster: number,
    script: string | ((cluster: C, context: Serialized<P>) => Awaitable<T>),
    options?: Exclude<EvalOptions<P>, 'cluster'>
): Promise<ValidIfSerializable<T>>
```

| Parameter | Type | Description |
|-----------|------|-------------|
| `cluster` | `number` | The ID of the target cluster. |
| `script` | `string \| Function` | The script or function to evaluate. |
| `options` | `EvalOptions<P>` | Optional eval options (excluding `cluster`). |

### evalOnClusterClient

Evaluates a script on a specific cluster in the context of the Discord.js Client.

```ts
public async evalOnClusterClient<T, P extends object, C = InternalClient>(
    cluster: number,
    script: ((client: C, context: Serialized<P>) => Awaitable<T>),
    options?: Exclude<EvalOptions<P>, 'cluster'>
): Promise<ValidIfSerializable<T>>
```

| Parameter | Type | Description |
|-----------|------|-------------|
| `cluster` | `number` | The ID of the target cluster. |
| `script` | `Function` | The function to evaluate on the cluster's client. |
| `options` | `EvalOptions<P>` | Optional eval options (excluding `cluster`). |

```ts
const guilds = await manager.evalOnClusterClient(0, (client) => {
    return client.guilds.cache.map(g => g.name);
});
```

### evalOnGuild

Evaluates a script on the cluster that hosts a specific guild. The guild object is passed as the third argument to the callback. Only supported with discord.js.

```ts
public async evalOnGuild<T, P extends object, C = InternalClient>(
    guildId: string,
    script: string | ((client: C, context: Serialized<P>, guild: Guild | undefined) => Awaitable<T>),
    options?: EvalOptions<P>
): Promise<ValidIfSerializable<T>>
```

| Parameter | Type | Description |
|-----------|------|-------------|
| `guildId` | `string` | The ID of the target guild. |
| `script` | `string \| Function` | The script or function to evaluate. |
| `options` | `EvalOptions<P>` | Optional eval options. |

```ts
const memberCount = await manager.evalOnGuild(
    '123456789',
    (client, ctx, guild) => guild?.memberCount
);
```

### eval

Evaluates a script directly on the manager process.

```ts
public async eval<T, P extends object, M = ClusterManager>(
    script: string | ((manager: M, context: Serialized<P>) => Awaitable<T>),
    options?: { context?: P; timeout?: number }
): Promise<{ result: Serialized<T> | undefined; error: Error | undefined }>
```

| Parameter | Type | Description |
|-----------|------|-------------|
| `script` | `string \| Function` | The script or function to evaluate on the manager. |
| `options` | `object` | Optional context and timeout. |

**Returns:** An object with `result` and `error` fields.

### respawnAll

Kills all running clusters and respawns them sequentially.

```ts
public async respawnAll(
    clusterDelay?: number,
    respawnDelay?: number,
    timeout?: number,
    except?: number[]
): Promise<Map<number, InternalCluster>>
```

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `clusterDelay` | `number` | `8000` | Delay in ms between each cluster respawn, multiplied by shard count. |
| `respawnDelay` | `number` | `5500` | Delay in ms before respawning a killed cluster. |
| `timeout` | `number` | `-1` | Timeout in ms for each cluster to become ready. `-1` for no timeout. |
| `except` | `number[]` | `[]` | Array of cluster IDs to exclude from respawning. |

### respawnClusters

Kills and respawns specific clusters by their IDs.

```ts
public async respawnClusters(
    clusters: number[],
    clusterDelay?: number,
    respawnDelay?: number,
    timeout?: number
): Promise<Map<number, InternalCluster>>
```

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `clusters` | `number[]` | -- | Array of cluster IDs to respawn. |
| `clusterDelay` | `number` | `8000` | Delay in ms between each cluster respawn. |
| `respawnDelay` | `number` | `5500` | Delay in ms before respawning a killed cluster. |
| `timeout` | `number` | `-1` | Timeout in ms for each cluster to become ready. |

### rollingRestart

Performs a rolling restart of all clusters using the ReCluster system, ensuring zero downtime.

```ts
public async rollingRestart(options?: {
    restartMode?: 'rolling' | 'gracefulSwitch'
}): Promise<boolean>
```

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `options.restartMode` | `'rolling' \| 'gracefulSwitch'` | `'rolling'` | `rolling` kills old clusters as new ones become ready. `gracefulSwitch` waits for all new clusters before switching. |

### createCluster

Manually creates a single cluster. This is typically handled internally by `spawn()`.

```ts
public createCluster(
    id: number,
    shardsToSpawn: number[],
    recluster?: boolean
): Cluster
```

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `id` | `number` | -- | The cluster ID. |
| `shardsToSpawn` | `number[]` | -- | Array of shard IDs to assign to this cluster. |
| `recluster` | `boolean` | `false` | If `true`, the cluster is not added to the main clusters collection (used during reclustering). |

## Events

Listen for events using the standard EventEmitter API:

```ts
manager.on('eventName', (...args) => { });
```

| Event | Payload | Description |
|-------|---------|-------------|
| `message` | `ProcessMessage` | Emitted when any IPC message is received from a cluster. |
| `clientRequest` | `ProcessMessage` | Emitted when a cluster sends a request via IPC. |
| `clusterCreate` | `Cluster` | Emitted when a new cluster is created. |
| `clusterReady` | `Cluster` | Emitted when a cluster has finished spawning and is ready. |
| `ready` | `ClusterManager` | Emitted when all clusters are ready. |
| `debug` | `string` | Emitted for internal debug and info messages. |

```ts
manager.on('clusterCreate', (cluster) => {
    console.log(`Cluster ${cluster.id} created`);
});

manager.on('ready', (manager) => {
    console.log(`All ${manager.clusters.size} clusters are ready`);
});

manager.on('message', (message) => {
    if (message.data.type === 'LOG') {
        console.log(message.data.content);
    }
});
```
