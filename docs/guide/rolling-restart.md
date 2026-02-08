# Rolling Restart

discord-cluster supports zero-downtime restarts through two modes. Both are powered by the `ReClusterManager` and can be triggered from the manager process or from within a cluster.

## Restart Modes

### Rolling Mode

New clusters spawn one at a time. As each new cluster becomes ready, the old cluster with the same ID is immediately killed and replaced.

- Faster overall restart time
- Brief gap per cluster during the switch
- Lower peak memory usage (only one extra cluster at a time)

### Graceful Switch Mode

All new clusters are spawned first while the old clusters continue running. Once every new cluster is ready, the old clusters are killed all at once.

- True zero-downtime -- old clusters handle requests until all replacements are ready
- Higher peak memory usage (double the clusters during transition)
- Longer total restart time

## Manager API

### `manager.rollingRestart(options?)`

Triggers a rolling restart from the manager process.

```ts
await manager.rollingRestart({ restartMode: 'rolling' });
```

```ts
await manager.rollingRestart({ restartMode: 'gracefulSwitch' });
```

| Option | Type | Default | Description |
|---|---|---|---|
| `restartMode` | `'rolling' \| 'gracefulSwitch'` | `'rolling'` | Which restart strategy to use |

**Returns:** `Promise<boolean>` -- resolves to `true` when the restart is complete.

This method delegates to the internal `ReClusterManager.start()`. It throws if a restart is already in progress or if the manager is not ready.

## Client API

### `cluster.requestRollingRestart(options?)`

Triggers a rolling restart from inside a cluster. The request is sent to the manager, which coordinates the restart.

```ts
await cluster.requestRollingRestart({ restartMode: 'rolling' });
```

```ts
await cluster.requestRollingRestart({ restartMode: 'gracefulSwitch' });
```

| Option | Type | Default | Description |
|---|---|---|---|
| `restartMode` | `'rolling' \| 'gracefulSwitch'` | `'rolling'` | Which restart strategy to use |

### `cluster.requestRestart()`

Requests a restart of the current cluster only.

```ts
await cluster.requestRestart();
```

## Deploy Workflow with SIGUSR2

A common pattern is to listen for `SIGUSR2` on the manager process to trigger a rolling restart after deploying new code.

```ts
// manager.ts
import { ClusterManager, ProcessGuard } from 'discord-cluster';

const manager = new ClusterManager('./dist/bot.js', {
  token: process.env.DISCORD_TOKEN,
  logging: { enabled: true, level: 'info' },
});

const guard = new ProcessGuard(manager);

process.on('SIGUSR2', () => {
  console.log('Received SIGUSR2, starting rolling restart...');
  manager.rollingRestart({ restartMode: 'gracefulSwitch' }).then(() => {
    console.log('Rolling restart complete');
  }).catch((err) => {
    console.error('Rolling restart failed:', err);
  });
});

manager.spawn();
```

Then deploy with:

```bash
git pull
npm run build
kill -USR2 $(cat .discord-cluster.pids | jq .managerPid)
```

The manager spawns new clusters using the updated code while the old clusters continue serving requests.

## Triggering from a Slash Command

You can also trigger a restart from a Discord command:

```ts
client.on('interactionCreate', async (interaction) => {
  if (!interaction.isChatInputCommand()) return;
  if (interaction.commandName !== 'restart') return;

  await interaction.reply('Starting rolling restart...');
  await cluster.requestRollingRestart({ restartMode: 'gracefulSwitch' });
});
```

## Restart Flow

### Rolling Mode

```
Cluster 0 (old) ████████████████░░░░░░░░░░░░░░░░
Cluster 0 (new)                 ████████████████████
Cluster 1 (old) ████████████████████████████░░░░░░
Cluster 1 (new)                             ████████
```

1. Spawn new Cluster 0
2. New Cluster 0 becomes ready
3. Kill old Cluster 0, swap in new
4. Spawn new Cluster 1
5. New Cluster 1 becomes ready
6. Kill old Cluster 1, swap in new

### Graceful Switch Mode

```
Cluster 0 (old) ████████████████████████████████░░
Cluster 1 (old) ████████████████████████████████░░
Cluster 0 (new)         ████████████████████████████
Cluster 1 (new)                 ████████████████████
```

1. Spawn new Cluster 0
2. Spawn new Cluster 1
3. Both new clusters become ready
4. Kill all old clusters at once

## Other Respawn Methods

### `cluster.respawnAll(clusterDelay?, respawnDelay?, timeout?, except?)`

Kills and respawns all clusters sequentially. This is a hard restart, not zero-downtime.

```ts
await cluster.respawnAll(8000, 5500, -1, []);
```

### `cluster.respawnClusters(clusters, clusterDelay?, respawnDelay?, timeout?)`

Kills and respawns specific clusters.

```ts
await cluster.respawnClusters([0, 2], 8000, 5500);
```
