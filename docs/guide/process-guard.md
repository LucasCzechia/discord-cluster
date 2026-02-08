# Process Guard

discord-cluster provides two complementary classes for process lifecycle management:

- **`ProcessGuard`** -- runs on the manager process, handles graceful shutdown and orphan cleanup
- **`ClusterProcessGuard`** -- runs inside each cluster, detects if the manager dies

> For the full ClusterManager API, see the [API reference](/api/cluster-manager).

## ProcessGuard (Manager Side)

`ProcessGuard` attaches to a `ClusterManager` and provides:

- Signal handling (SIGTERM, SIGINT, uncaughtException). Unhandled rejections are logged but do not trigger shutdown.
- Ordered cleanup task execution before exit
- PID file tracking and orphan process cleanup on restart
- Force-exit timeout as a safety net

### Setup

```ts
import { ClusterManager, ProcessGuard } from 'discord-cluster';

const manager = new ClusterManager('./dist/bot.js', {
  token: process.env.DISCORD_TOKEN,
});

const guard = new ProcessGuard(manager, {
  pidDir: process.cwd(),
  orphanCheckMs: 30000,
  forceExitMs: 90000,
});
```

### Options

| Option | Type | Default | Description |
|---|---|---|---|
| `pidDir` | `string` | `process.cwd()` | Directory for the PID file |
| `orphanCheckMs` | `number` | `30000` | How often to refresh the PID file (ms). Set to 0 to disable. |
| `forceExitMs` | `number` | `90000` | Max time for graceful shutdown before force exit (ms) |

### `addCleanupTask(name, taskFn, timeout?)`

Registers a named cleanup task that runs during graceful shutdown. Tasks execute in the order they are added.

```ts
guard.addCleanupTask('database', async () => {
  await db.close();
}, 10000);

guard.addCleanupTask('cache', async () => {
  await redis.quit();
}, 5000);

guard.addCleanupTask('http-server', async () => {
  await server.close();
}, 10000);
```

| Parameter | Type | Default | Description |
|---|---|---|---|
| `name` | `string` | -- | Unique task identifier |
| `taskFn` | `() => Promise<void>` | -- | Async cleanup function |
| `timeout` | `number` | `30000` | Per-task timeout in ms |

Each task is wrapped in a `Promise.race` against its timeout. If a task times out, the guard logs a warning and proceeds to the next task.

### `removeCleanupTask(name)`

Removes a previously registered cleanup task.

```ts
guard.removeCleanupTask('cache');
```

### `isInShutdown()`

Returns whether a shutdown is currently in progress. Useful for skipping non-essential work.

```ts
if (guard.isInShutdown()) return;
```

### Shutdown Flow

When `ProcessGuard` receives SIGTERM, SIGINT, or an uncaught exception:

1. Sets `isShuttingDown` to `true`
2. Emits `shutdown:start` with the signal/reason
3. Runs each cleanup task sequentially (with per-task timeout)
4. Kills all child processes/workers
5. Emits `shutdown:complete`
6. Removes the PID file
7. Exits with code 0 (or 1 on error)

If the entire process exceeds `forceExitMs`, a force exit with code 1 is triggered.

### Events

```ts
guard.on('shutdown:start', (reason) => {
  console.log(`Shutdown initiated: ${reason}`);
});

guard.on('shutdown:complete', () => {
  console.log('Shutdown complete');
});
```

### PID File and Orphan Cleanup

On startup, `ProcessGuard` writes a `.discord-cluster.pids` file containing:

```json
{
  "managerPid": 12345,
  "children": [12346, 12347, 12348],
  "timestamp": 1706000000000
}
```

If the manager crashes and restarts, it reads the stale PID file. If the old manager PID is no longer running, it kills all listed child processes (orphans) before spawning new clusters.

The PID file is refreshed at the `orphanCheckMs` interval to keep the child PID list current.

## ClusterProcessGuard (Cluster Side)

`ClusterProcessGuard` runs inside each cluster process. It periodically checks if the manager process is still alive. If the manager dies, the cluster self-terminates instead of becoming an orphan.

### Setup

```ts
import { ClusterProcessGuard } from 'discord-cluster';

new ClusterProcessGuard();
```

That is all that is needed. The guard detects the parent PID automatically.

### Options

```ts
new ClusterProcessGuard({
  checkMs: 10000,
  maxMissed: 3,
});
```

| Option | Type | Default | Description |
|---|---|---|---|
| `checkMs` | `number` | `10000` | Health check interval in ms |
| `maxMissed` | `number` | `3` | Consecutive missed checks before self-termination |

With the defaults, a cluster detects a dead manager within 30 seconds (3 checks at 10s intervals) and exits with code 1.

### How It Works

1. On construction, records `process.ppid` as the manager PID
2. Every `checkMs` milliseconds, sends a `kill(pid, 0)` signal (a no-op signal that only checks if the process exists)
3. If the signal fails, increments a missed-check counter
4. If the counter reaches `maxMissed`, logs an error and calls `process.exit(1)`
5. If a check succeeds, resets the counter to 0

## Full Example

```ts
// manager.ts
import { ClusterManager, ProcessGuard } from 'discord-cluster';

const manager = new ClusterManager('./dist/bot.js', {
  token: process.env.DISCORD_TOKEN,
  mode: 'process',
  logging: { enabled: true, level: 'info' },
});

const guard = new ProcessGuard(manager);

guard.addCleanupTask('database', async () => {
  await mongoose.disconnect();
}, 10000);

manager.spawn();
```

```ts
// bot.ts
import { ClusterClient, ClusterProcessGuard } from 'discord-cluster';
import { Client, GatewayIntentBits } from 'discord.js';

const client = new Client({ intents: [GatewayIntentBits.Guilds] });
const cluster = new ClusterClient(client);
new ClusterProcessGuard();

client.login(process.env.DISCORD_TOKEN);
```
