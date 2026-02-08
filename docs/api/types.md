# Types

All exported TypeScript interfaces and type aliases from the discord-cluster type system. These types are used throughout the ClusterManager and ClusterClient APIs.

## Enums

### MessageTypes

Internal IPC message type identifiers.

```ts
enum MessageTypes {
    MissingType = 0,
    CustomRequest = 1,
    CustomMessage = 2,
    CustomReply = 3,
    Heartbeat = 4,
    HeartbeatAck = 5,
    ClientBroadcast = 6,
    ClientBroadcastRequest = 7,
    ClientBroadcastResponse = 8,
    ClientBroadcastResponseError = 9,
    ClientRespawn = 10,
    ClientRespawnAll = 11,
    ClientSpawnNextCluster = 16,
    ClientReady = 17,
    ClientEvalRequest = 18,
    ClientEvalResponse = 19,
    ClientEvalResponseError = 20,
    ClientManagerEvalRequest = 21,
    ClientManagerEvalResponse = 22,
    ClientManagerEvalResponseError = 23,
    ManagerReady = 24,
    Kill = 25,
    ClientRespawnSpecific = 26,
    HandlerRequest = 30,
    HandlerResponse = 31,
    HandlerError = 32,
    HandlerRequestAll = 33,
    HandlerRequestTo = 34,
    StoreGet = 40,
    StoreSet = 41,
    StoreDelete = 42,
    StoreHas = 43,
    StoreResponse = 44,
    EventEmit = 50,
    EventForward = 51,
    EventAck = 52,
    EventEmitAndWait = 53,
    RollingRestartRequest = 60,
    RestartRequest = 61,
}
```

## Configuration Interfaces

### ClusterManagerCreateOptions

Options passed to the `ClusterManager` constructor.

```ts
interface ClusterManagerCreateOptions<T extends ClusteringMode> {
    mode?: T;
    token?: string;
    totalShards?: number;
    totalClusters?: number;
    shardsPerClusters?: number;
    shardArgs?: string[];
    execArgv?: string[];
    respawn?: boolean;
    heartbeat?: ClusterHeartbeatOptions;
    queueOptions?: QueueOptions;
    spawnOptions?: ClusterSpawnOptions;
    clusterData?: object;
    clusterOptions?: T extends 'worker' ? WorkerThreadOptions : ChildProcessOptions;
    advanced?: Partial<ClusterManagerAdvancedOptions>;
    logging?: LoggingOptions;
}
```

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `mode` | `'worker' \| 'process'` | `'worker'` | Clustering mode. Workers use threads, processes use child processes. |
| `token` | `string` | -- | Discord bot token. Used to fetch recommended shard count. |
| `totalShards` | `number` | `-1` | Total shard count. `-1` to auto-detect from Discord API. |
| `totalClusters` | `number` | `-1` | Total cluster count. `-1` to auto-calculate based on CPU cores and shard count. |
| `shardsPerClusters` | `number` | `-1` | Shards per cluster. `-1` to distribute evenly. |
| `shardArgs` | `string[]` | -- | Arguments passed to the script (process mode only). |
| `execArgv` | `string[]` | -- | Arguments passed to the executable. |
| `respawn` | `boolean` | `true` | Whether to auto-respawn clusters that exit. |
| `heartbeat` | `ClusterHeartbeatOptions` | See below | Heartbeat monitoring configuration. |
| `queueOptions` | `QueueOptions` | -- | Spawn queue configuration. |
| `spawnOptions` | `ClusterSpawnOptions` | -- | Spawn delay and timeout configuration. |
| `clusterData` | `object` | -- | Custom data passed to each cluster. |
| `clusterOptions` | `WorkerThreadOptions \| ChildProcessOptions` | -- | Options for the underlying worker/process. |
| `advanced` | `ClusterManagerAdvancedOptions` | -- | Advanced behavior options. |
| `logging` | `LoggingOptions` | -- | Logging configuration. |

### ClusterManagerOptions

The resolved version of `ClusterManagerCreateOptions` with all defaults applied. Used internally after construction.

```ts
interface ClusterManagerOptions<T extends ClusteringMode> extends ClusterManagerCreateOptions<T> {
    mode: T;
    totalShards: number;
    totalClusters: number;
    shardsPerClusters: number;
    shardList: number[];
    clusterList: number[];
    spawnOptions: Required<ClusterSpawnOptions>;
    heartbeat: Required<ClusterHeartbeatOptions>;
    packageType: PackageType | null;
}
```

### ClusterManagerAdvancedOptions

```ts
interface ClusterManagerAdvancedOptions {
    logMessagesInDebug: boolean;
    proceedBroadcastIfClusterDead: boolean;
}
```

| Field | Type | Description |
|-------|------|-------------|
| `logMessagesInDebug` | `boolean` | Whether to log IPC messages in debug output. |
| `proceedBroadcastIfClusterDead` | `boolean` | Whether to use `Promise.allSettled` for broadcasts, allowing results from live clusters even if some are dead. |

### LoggingOptions

```ts
interface LoggingOptions {
    enabled?: boolean;
    colors?: boolean;
    timestamps?: boolean;
    level?: 'debug' | 'info' | 'warn' | 'error';
}
```

| Field | Type | Description |
|-------|------|-------------|
| `enabled` | `boolean` | Whether logging is enabled. |
| `colors` | `boolean` | Whether to use colored output. |
| `timestamps` | `boolean` | Whether to include timestamps. |
| `level` | `string` | Minimum log level to output. |

## Spawn and Queue Options

### ClusterSpawnOptions

```ts
interface ClusterSpawnOptions {
    delay?: number;
    timeout?: number;
}
```

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `delay` | `number` | `7000` | Delay in ms between spawning each cluster. |
| `timeout` | `number` | `-1` | Timeout in ms for a cluster to become ready. `-1` for no timeout. |

### QueueOptions

```ts
interface QueueOptions {
    mode?: 'auto' | 'manual';
    timeout?: number;
}
```

| Field | Type | Description |
|-------|------|-------------|
| `mode` | `'auto' \| 'manual'` | `auto` spawns clusters automatically. `manual` requires calling `spawnNextCluster()`. |
| `timeout` | `number` | Timeout for queue items. |

## Heartbeat Options

### ClusterHeartbeatOptions

```ts
interface ClusterHeartbeatOptions {
    enabled: boolean;
    maxMissedHeartbeats?: number;
    maxRestarts?: number;
    interval?: number;
    timeout?: number;
}
```

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `enabled` | `boolean` | `true` | Whether heartbeat monitoring is enabled. |
| `maxMissedHeartbeats` | `number` | `2` | Maximum missed heartbeats before a cluster is considered unresponsive. |
| `maxRestarts` | `number` | `-1` | Maximum restarts allowed. `-1` for unlimited. |
| `interval` | `number` | `2000` | Interval in ms between heartbeat checks. |
| `timeout` | `number` | `8000` | Timeout in ms for a heartbeat response. |

## Eval Options

### EvalOptions

```ts
interface EvalOptions<T extends object = object> {
    cluster?: number | number[];
    shard?: number | number[];
    guildId?: string;
    context?: T;
    timeout?: number;
    useAllSettled?: boolean;
}
```

| Field | Type | Description |
|-------|------|-------------|
| `cluster` | `number \| number[]` | Target specific cluster(s). |
| `shard` | `number \| number[]` | Target cluster(s) containing specific shard(s). |
| `guildId` | `string` | Target the cluster hosting a specific guild. Cannot be combined with `cluster` or `shard`. |
| `context` | `T` | Serializable context object passed to the eval function. |
| `timeout` | `number` | Timeout in ms before the eval is cancelled. |
| `useAllSettled` | `boolean` | Use `Promise.allSettled` instead of `Promise.all`, allowing partial results. |

## Cluster Data

### ClusterClientData

Metadata about the current cluster, available via `cluster.info`.

```ts
interface ClusterClientData {
    ShardList: number[];
    TotalShards: number;
    ClusterCount: number;
    ClusterId: number;
    ClusterManagerMode: ClusteringMode;
    ClusterQueueMode?: 'auto' | 'manual';
    FirstShardId: number;
    LastShardId: number;
}
```

| Field | Type | Description |
|-------|------|-------------|
| `ShardList` | `number[]` | Shard IDs assigned to this cluster. |
| `TotalShards` | `number` | Total number of shards across all clusters. |
| `ClusterCount` | `number` | Total number of clusters. |
| `ClusterId` | `number` | This cluster's ID. |
| `ClusterManagerMode` | `ClusteringMode` | `'worker'` or `'process'`. |
| `ClusterQueueMode` | `string` | `'auto'` or `'manual'`. |
| `FirstShardId` | `number` | First shard ID in this cluster's shard list. |
| `LastShardId` | `number` | Last shard ID in this cluster's shard list. |

### ClusterKillOptions

```ts
interface ClusterKillOptions {
    reason: string;
}
```

## Statistics

### ClusterStats

Aggregate statistics returned by `cluster.stats()`.

```ts
interface ClusterStats {
    totalGuilds: number;
    totalUsers: number;
    totalClusters: number;
    totalShards: number;
    clusters: ClusterStatEntry[];
}
```

| Field | Type | Description |
|-------|------|-------------|
| `totalGuilds` | `number` | Sum of guilds across all clusters. |
| `totalUsers` | `number` | Sum of users across all clusters. |
| `totalClusters` | `number` | Total cluster count. |
| `totalShards` | `number` | Total shard count. |
| `clusters` | `ClusterStatEntry[]` | Per-cluster breakdown. |

### ClusterStatEntry

```ts
interface ClusterStatEntry {
    id: number;
    guilds: number;
    users: number;
    shards: number[];
    uptime: number;
    memory: number;
    status: 'healthy' | 'starting' | 'exited';
}
```

| Field | Type | Description |
|-------|------|-------------|
| `id` | `number` | Cluster ID. |
| `guilds` | `number` | Number of guilds on this cluster. |
| `users` | `number` | Number of users on this cluster. |
| `shards` | `number[]` | Shard IDs assigned to this cluster. |
| `uptime` | `number` | Uptime in milliseconds. |
| `memory` | `number` | Heap memory usage in bytes. |
| `status` | `string` | Cluster health status. |

### ClusterResult

```ts
interface ClusterResult<T = unknown> {
    clusterId: number;
    status: 'ok' | 'error';
    data?: T;
    error?: string;
}
```

| Field | Type | Description |
|-------|------|-------------|
| `clusterId` | `number` | The cluster that produced this result. |
| `status` | `string` | `'ok'` on success, `'error'` on failure. |
| `data` | `T` | The result data (present on success). |
| `error` | `string` | Error message (present on failure). |

## Data Interfaces

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

### ChannelInfo

```ts
interface ChannelInfo {
    id: string;
    name: string;
    type: number;
    guildId: string | null;
}
```

### MemberInfo

```ts
interface MemberInfo {
    id: string;
    displayName: string;
    username: string;
    avatar: string;
    roles: string[];
    joinedAt: number | null;
    premiumSince: number | null;
}
```

### SendResult

```ts
interface SendResult {
    success: boolean;
    messageId?: string;
    error?: string;
}
```

### RolesResult

```ts
interface RolesResult {
    success: boolean;
    added?: number;
    removed?: number;
    error?: string;
}
```

### FilePath

```ts
interface FilePath {
    path: string;
    name: string;
}
```

### ManageRolesOptions

```ts
interface ManageRolesOptions {
    add?: string[];
    remove?: string[];
    reason?: string;
}
```

### IPCMessage

```ts
interface IPCMessage {
    _type: MessageTypes;
    _nonce: string;
    data: unknown;
}
```

## ReCluster Options

### ReClusterOptions

```ts
interface ReClusterOptions {
    totalShards?: number;
    totalClusters?: number;
    shardsPerClusters?: number;
    restartMode?: ReClusterRestartMode;
}
```

| Field | Type | Description |
|-------|------|-------------|
| `totalShards` | `number` | New total shard count. |
| `totalClusters` | `number` | New total cluster count. |
| `shardsPerClusters` | `number` | New shards per cluster. |
| `restartMode` | `ReClusterRestartMode` | `'gracefulSwitch'` waits for all new clusters before switching. `'rolling'` kills old clusters as new ones are ready. |

### RollingRestartOptions

```ts
interface RollingRestartOptions {
    concurrency?: number;
    delay?: number;
}
```

| Field | Type | Description |
|-------|------|-------------|
| `concurrency` | `number` | How many clusters to restart simultaneously. |
| `delay` | `number` | Delay in ms between restart batches. |

### StoredPromise

Internal interface for tracking pending IPC promises.

```ts
interface StoredPromise {
    timeout?: NodeJS.Timeout;
    resolve(value: unknown): void;
    reject(error: Error): void;
}
```

## Event Interfaces

### ClusterManagerEvents

```ts
interface ClusterManagerEvents {
    clientRequest: [message: ProcessMessage];
    clusterCreate: [cluster: Cluster];
    clusterReady: [cluster: Cluster];
    message: [message: ProcessMessage];
    debug: [debugMessage: string];
    ready: [manager: ClusterManager];
}
```

### ClusterClientEvents

```ts
interface ClusterClientEvents {
    managerReady: [];
    message: [message: ProcessMessage];
    ready: [clusterClient: ClusterClient];
    debug: [message: string];
}
```

### ClusterEvents

```ts
interface ClusterEvents {
    message: [message: ProcessMessage];
    death: [cluster: Cluster, thread: ChildProcess | Worker | null];
    spawn: [cluster: Cluster, thread: ChildProcess | Worker | null];
    ready: [cluster: Cluster];
    debug: [message: string];
    error: [error: Error];
}
```

## Type Aliases

### Awaitable

```ts
type Awaitable<T> = T | PromiseLike<T>;
```

### ClusteringMode

```ts
type ClusteringMode = 'worker' | 'process';
```

### PackageType

```ts
type PackageType = 'discord.js' | '@discordjs/core';
```

### ReClusterRestartMode

```ts
type ReClusterRestartMode = 'gracefulSwitch' | 'rolling';
```

### HeartbeatData

```ts
type HeartbeatData = {
    restarts: number;
    missedBeats: number;
    killing: boolean;
};
```

### Serializable

```ts
type Serializable =
    | string
    | number
    | boolean
    | null
    | undefined
    | Serializable[]
    | { [key: string]: Serializable }
    | object
    | ChildSerializable;
```

### Serialized

```ts
type Serialized<T> = T extends symbol | bigint | UnknownFunction
    ? never
    : T extends ValidIfSerializable<T>
        ? T
        : T extends { toJSON(): infer R }
            ? R
            : T extends ReadonlyArray<infer V>
                ? Serialized<V>[]
                : T extends ReadonlyMap<unknown, unknown> | ReadonlySet<unknown>
                    ? object
                    : T extends object
                        ? { [K in keyof T]: Serialized<T[K]> }
                        : T;
```

### ValidIfSerializable

```ts
type ValidIfSerializable<T> = T extends NonNullable<Serializable> ? (T | undefined) : never;
```

### SerializableInput

```ts
type SerializableInput<T, U = false> = T extends Serializable ? T : T extends unknown ? U : never;
```

### UnknownFunction

```ts
type UnknownFunction = (...args: unknown[]) => unknown;
```

### DeepNonNullable

```ts
type DeepNonNullable<T> = T extends NonNullable<T> ? T : DeepNonNullable<NonNullable<T>>;
```

### DeconstructedFunction

```ts
type DeconstructedFunction = {
    args: (string | string[])[];
    body: string;
    wrapScope: boolean;
    wrapArgs: boolean;
    isAsync: boolean;
};
```

### RecursiveStringArray

```ts
type RecursiveStringArray = (RecursiveStringArray | string)[];
```
