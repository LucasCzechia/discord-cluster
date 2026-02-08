# IPC Handlers

The `IPCHandler` provides a request/response pattern for communication between clusters. Define handlers on each cluster, then call them from any other cluster.

Access it via `cluster.ipc`:

```ts
const cluster = new ClusterClient(client);
cluster.ipc; // IPCHandler
```

## Defining Handlers

### `ipc.handle(name, handler)`

Registers a named handler that can be called from any cluster.

```ts
cluster.ipc.handle('getUserCount', () => {
  return client.guilds.cache.reduce((acc, g) => acc + g.memberCount, 0);
});
```

Handlers can be async:

```ts
cluster.ipc.handle('getGuildData', async (data: { guildId: string }) => {
  const guild = client.guilds.cache.get(data.guildId);
  if (!guild) return null;
  return {
    name: guild.name,
    memberCount: guild.memberCount,
    channels: guild.channels.cache.size,
  };
});
```

The handler receives whatever data the caller passes and returns a serializable value.

### `ipc.removeHandler(name)`

Removes a previously registered handler.

```ts
cluster.ipc.removeHandler('getUserCount');
```

**Returns:** `boolean` -- `true` if the handler existed and was removed.

## Making Requests

### `ipc.request(handler, data?, timeout?)`

Sends a request to the manager, which routes it to an available cluster.

```ts
const count = await cluster.ipc.request<number>('getUserCount');
console.log(`Users: ${count}`);
```

With data and timeout:

```ts
const data = await cluster.ipc.request<GuildData>(
  'getGuildData',
  { guildId: '123456789012345678' },
  5000,
);
```

| Parameter | Type | Description |
|---|---|---|
| `handler` | `string` | Name of the registered handler |
| `data` | `unknown` | Data to pass to the handler |
| `timeout` | `number` | Timeout in ms (optional) |

### `ipc.requestTo(clusterId, handler, data?, timeout?)`

Sends a request to a specific cluster by ID.

```ts
const result = await cluster.ipc.requestTo<string>(
  0,
  'getPrimaryData',
  { key: 'config' },
  5000,
);
```

This is useful when you know which cluster has the data you need, such as when using deterministic routing.

| Parameter | Type | Description |
|---|---|---|
| `clusterId` | `number` | Target cluster ID |
| `handler` | `string` | Name of the registered handler |
| `data` | `unknown` | Data to pass to the handler |
| `timeout` | `number` | Timeout in ms (optional) |

### `ipc.requestAll(handler, data?, timeout?)`

Sends a request to all clusters (including the current one) and collects the results.

```ts
const results = await cluster.ipc.requestAll<number>('getUserCount');
const total = results.sum();
console.log(`Total users: ${total}`);
```

The default timeout is 30000ms. The local cluster's handler is called directly (not over IPC), and the results are combined into a `ResultCollection`.

| Parameter | Type | Default | Description |
|---|---|---|---|
| `handler` | `string` | -- | Name of the registered handler |
| `data` | `unknown` | -- | Data to pass to the handler |
| `timeout` | `number` | `30000` | Timeout in ms |

## ResultCollection

`requestAll` returns a `ResultCollection<T>` that provides methods for working with results from multiple clusters.

### Methods

| Method | Returns | Description |
|---|---|---|
| `values()` | `T[]` | All successful results as an array |
| `errors()` | `{ clusterId, error }[]` | All failed results |
| `allOk()` | `boolean` | Whether every cluster succeeded |
| `sum()` | `number` | Sum of all numeric results |
| `get(clusterId)` | `ClusterResult<T>` | Result from a specific cluster |
| `first()` | `T \| undefined` | First successful result |
| `find(predicate)` | `T \| undefined` | Find a specific result |

### Properties

| Property | Type | Description |
|---|---|---|
| `size` | `number` | Total number of results |
| `successCount` | `number` | Number of successful results |
| `errorCount` | `number` | Number of failed results |

### Example

```ts
cluster.ipc.handle('getTopGuild', () => {
  const sorted = [...client.guilds.cache.values()]
    .sort((a, b) => b.memberCount - a.memberCount);
  return sorted[0] ? { name: sorted[0].name, members: sorted[0].memberCount } : null;
});

const results = await cluster.ipc.requestAll<{ name: string; members: number } | null>('getTopGuild');

if (!results.allOk()) {
  console.log('Some clusters failed:', results.errors());
}

const topGuilds = results.values().filter(Boolean);
const biggest = topGuilds.sort((a, b) => b!.members - a!.members)[0];
console.log(`Biggest guild: ${biggest?.name}`);
```

## Error Handling

If no handler is registered for a given name, the request rejects with an error:

```ts
try {
  await cluster.ipc.request('nonExistent');
} catch (err) {
  // Error: No handler registered for 'nonExistent'
}
```

If a handler throws, the error is serialized and sent back to the caller:

```ts
cluster.ipc.handle('mayFail', () => {
  throw new Error('Something went wrong');
});

try {
  await cluster.ipc.request('mayFail');
} catch (err) {
  // Error: Something went wrong
}
```

For `requestAll`, errors from individual clusters appear in the `ResultCollection` rather than rejecting the promise:

```ts
const results = await cluster.ipc.requestAll('mayFail');
for (const err of results.errors()) {
  console.log(`Cluster ${err.clusterId}: ${err.error}`);
}
```
