# Logging

discord-cluster includes a built-in `Logger` that provides structured, color-coded output for manager and cluster events. It is configured through the `logging` option on `ClusterManager`.

> For the full ClusterManager API, see the [API reference](/api/cluster-manager).

## Configuration

```ts
const manager = new ClusterManager('./dist/bot.js', {
  token: process.env.DISCORD_TOKEN,
  logging: {
    enabled: true,
    level: 'info',
    colors: true,
    timestamps: true,
  },
});
```

### Options

| Option | Type | Default | Description |
|---|---|---|---|
| `enabled` | `boolean` | `false` | Whether logging is active |
| `level` | `'debug' \| 'info' \| 'warn' \| 'error'` | `'info'` | Minimum log level |
| `colors` | `boolean` | `true` | Whether to use ANSI colors in output |
| `timestamps` | `boolean` | `true` | Whether to prefix logs with a timestamp |

### Log Levels

Levels follow a priority hierarchy. Setting a level filters out everything below it.

| Level | Priority | Description |
|---|---|---|
| `debug` | 0 | Verbose internal details (IPC messages, queue operations) |
| `info` | 1 | General operational messages (cluster ready, spawn complete) |
| `warn` | 2 | Non-critical issues (suboptimal config, resource warnings) |
| `error` | 3 | Failures (uncaught exceptions, process crashes) |

Setting `level: 'info'` shows info, warn, and error messages. Setting `level: 'debug'` shows everything.

## Output Format

With all options enabled, log output looks like:

```
[14:32:01] [INFO] [ClusterManager] Spawning 4 clusters with 8 shards in total (2 shards per cluster)
[14:32:01] [DEBUG] [ClusterManager] Added Cluster 0 to the queue with 0,1 shards.
[14:32:08] [INFO] [ClusterManager] Initialized successfully.
[14:32:15] [WARN] [ClusterManager] Running 16 clusters on 4 CPU cores. This may impact performance.
[14:32:20] [ERROR] [ProcessGuard] Uncaught exception: TypeError: Cannot read properties of undefined
```

### Tag Colors

The logger automatically assigns a unique color to each tag (the text in the first brackets after the level). Tags like `ClusterManager`, `ProcessGuard`, `ReClustering`, etc. each get their own color from a rotating palette of green, blue, magenta, cyan, and yellow.

This makes it easy to visually distinguish different subsystems in the log output.

### No Colors Mode

Set `colors: false` for environments that do not support ANSI (log files, CI pipelines):

```ts
logging: {
  enabled: true,
  colors: false,
  timestamps: true,
  level: 'info',
}
```

Output:

```
[14:32:01] [INFO] [ClusterManager] Spawning 4 clusters with 8 shards in total
```

### No Timestamps Mode

Set `timestamps: false` if your log aggregator already adds timestamps:

```ts
logging: {
  enabled: true,
  timestamps: false,
  level: 'info',
}
```

Output:

```
[INFO] [ClusterManager] Spawning 4 clusters with 8 shards in total
```

## Direct Logger Usage

The logger instance is available on the manager as `manager.logger`. You can call its methods directly. Note that the `Logger` instance is only available on the manager side. Inside clusters, use the `debug` event on `ClusterClient` or your own logging solution.

```ts
manager.logger.info('[MyPlugin] Custom info message');
manager.logger.debug('[MyPlugin] Verbose debug data');
manager.logger.warn('[MyPlugin] Something looks off');
manager.logger.error('[MyPlugin] Something failed');
```

### Logger Methods

| Method | Description |
|---|---|
| `logger.debug(message)` | Log at debug level |
| `logger.info(message)` | Log at info level |
| `logger.warn(message)` | Log at warn level |
| `logger.error(message)` | Log at error level |

Messages that start with `[TagName]` are automatically parsed -- the tag is extracted and colored separately from the message body.

## Manager Debug Events

The manager also emits `debug` events for all log messages. You can use these alongside or instead of the built-in logger.

```ts
manager.on('debug', (message) => {
  externalLogger.log(message);
});
```

The `ClusterClient` also emits `debug` events within each cluster:

```ts
cluster.on('debug', (message) => {
  console.log(`[Cluster ${cluster.id}] ${message}`);
});
```

## Recommended Configuration

For development:

```ts
logging: {
  enabled: true,
  level: 'debug',
  colors: true,
  timestamps: true,
}
```

For production:

```ts
logging: {
  enabled: true,
  level: 'info',
  colors: false,
  timestamps: true,
}
```
