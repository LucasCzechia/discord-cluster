# Cross-Cluster Events

The `EventBusClient` lets clusters broadcast events to each other without needing a request/response pattern. It extends `EventEmitter`, so you can listen for events with `.on()`.

Access it via `cluster.events`:

> For the full ClusterClient API, see the [API reference](/api/cluster-client).

```ts
const cluster = new ClusterClient(client);
cluster.events; // EventBusClient
```

## Broadcasting Events

### `events.broadcast(event, data?)`

Broadcasts an event to all other clusters. The sending cluster does not receive its own broadcast.

```ts
await cluster.events.broadcast('configUpdated', {
  key: 'prefix',
  value: '!',
});
```

| Parameter | Type | Description |
|---|---|---|
| `event` | `string` | Event name |
| `data` | `unknown` | Serializable payload (optional) |

### `events.emitTo(clusterId, event, data?)`

Sends an event to a specific cluster.

```ts
await cluster.events.emitTo(0, 'taskAssigned', {
  taskId: 'cleanup-123',
});
```

| Parameter | Type | Description |
|---|---|---|
| `clusterId` | `number` | Target cluster ID |
| `event` | `string` | Event name |
| `data` | `unknown` | Serializable payload (optional) |

### `events.broadcastAndWait(event, data?, timeout?, expectedClusters?)`

Broadcasts an event and waits for acknowledgements from other clusters. Returns the number of clusters that acknowledged.

```ts
const acked = await cluster.events.broadcastAndWait(
  'cacheInvalidate',
  { key: 'guild:123' },
  10000,
  cluster.totalClusters - 1,
);

console.log(`${acked} clusters acknowledged`);
```

| Parameter | Type | Default | Description |
|---|---|---|---|
| `event` | `string` | -- | Event name |
| `data` | `unknown` | -- | Serializable payload |
| `timeout` | `number` | `10000` | Max wait time in ms |
| `expectedClusters` | `number` | `0` | How many acks to expect |

If `expectedClusters` is 0, the method returns immediately with `0`. Otherwise it waits until all expected acks arrive or the timeout elapses, returning however many acks were received.

Acknowledgements are sent automatically when a cluster receives the event -- listeners do not need to explicitly acknowledge.

## Listening for Events

Use `.on()` to listen for events from other clusters. The listener receives the data payload and the source cluster ID.

```ts
cluster.events.on('configUpdated', (data, sourceCluster) => {
  console.log(`Cluster ${sourceCluster} updated config:`, data);
  reloadConfig(data);
});
```

```ts
cluster.events.on('taskAssigned', (data, sourceCluster) => {
  const { taskId } = data as { taskId: string };
  processTask(taskId);
});
```

## Examples

### Cache Invalidation

When one cluster modifies data, notify all others to clear their local caches.

```ts
cluster.events.on('invalidateCache', (data) => {
  const { type, id } = data as { type: string; id: string };
  localCache.delete(`${type}:${id}`);
});

async function updateGuildSettings(guildId: string, settings: object) {
  await db.updateGuildSettings(guildId, settings);
  localCache.delete(`guild:${guildId}`);
  await cluster.events.broadcast('invalidateCache', {
    type: 'guild',
    id: guildId,
  });
}
```

### Configuration Reload

Push configuration changes from any cluster to all others.

```ts
let config = await loadConfig();

cluster.events.on('configReload', async () => {
  config = await loadConfig();
  console.log('Config reloaded');
});

async function updateConfig(key: string, value: unknown) {
  await db.setConfig(key, value);
  config = await loadConfig();
  await cluster.events.broadcast('configReload');
}
```

### Maintenance Mode

Toggle maintenance mode across all clusters from a single command.

```ts
let maintenanceMode = false;

cluster.events.on('maintenance', (data) => {
  maintenanceMode = (data as { enabled: boolean }).enabled;
});

client.on('interactionCreate', async (interaction) => {
  if (!interaction.isChatInputCommand()) return;

  if (interaction.commandName === 'maintenance') {
    maintenanceMode = !maintenanceMode;
    await cluster.events.broadcast('maintenance', { enabled: maintenanceMode });
    await interaction.reply(`Maintenance mode: ${maintenanceMode ? 'on' : 'off'}`);
  }
});
```

### Cluster-to-Cluster Communication

Send a task to the primary cluster for centralized processing.

```ts
if (cluster.isPrimary) {
  cluster.events.on('logAction', (data, sourceCluster) => {
    const { action, userId } = data as { action: string; userId: string };
    auditLog.write({ action, userId, sourceCluster, timestamp: Date.now() });
  });
}

await cluster.events.emitTo(0, 'logAction', {
  action: 'ban',
  userId: '987654321098765432',
});
```

## Event Flow

1. Cluster A calls `broadcast('myEvent', data)`
2. The message is sent to the manager process
3. The manager forwards it to all other clusters (excluding A)
4. Each receiving cluster's `EventBusClient` emits `'myEvent'` locally
5. Any `.on('myEvent')` listeners fire with the data and source cluster ID
