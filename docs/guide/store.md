# Shared Store

The shared store provides a cross-cluster key-value store that lives on the manager process. All clusters read and write to the same data, making it ideal for shared state that needs to be consistent across the entire bot.

Access it via `cluster.store`:

```ts
const cluster = new ClusterClient(client);
cluster.store; // StoreClient
```

## API

### `store.set(key, value, options?)`

Sets a key-value pair. Optionally provide a TTL in milliseconds.

```ts
await cluster.store.set('bot:status', 'online');

await cluster.store.set('ratelimit:user:123', true, { ttl: 60000 });
```

| Parameter | Type | Description |
|---|---|---|
| `key` | `string` | The key to set |
| `value` | `unknown` | Any serializable value |
| `options.ttl` | `number` | Time-to-live in ms (optional) |

### `store.get(key, timeout?)`

Retrieves a value by key. Returns `undefined` if the key does not exist or has expired.

```ts
const status = await cluster.store.get<string>('bot:status');
console.log(status); // 'online'
```

| Parameter | Type | Default | Description |
|---|---|---|---|
| `key` | `string` | -- | The key to retrieve |
| `timeout` | `number` | `5000` | Request timeout in ms |

### `store.has(key, timeout?)`

Checks if a key exists and has not expired.

```ts
const exists = await cluster.store.has('ratelimit:user:123');
if (exists) {
  console.log('User is rate limited');
}
```

| Parameter | Type | Default | Description |
|---|---|---|---|
| `key` | `string` | -- | The key to check |
| `timeout` | `number` | `5000` | Request timeout in ms |

### `store.delete(key)`

Deletes a key from the store.

```ts
const deleted = await cluster.store.delete('bot:status');
console.log(deleted); // true
```

**Returns:** `Promise<boolean>` -- `true` if the key existed and was deleted.

## TTL and Expiry

When you set a TTL, the value automatically expires after the specified duration. The manager runs a cleanup interval (default 30 seconds) to purge expired entries, but expiry is also checked on read -- a `get` or `has` call on an expired key returns `undefined`/`false` immediately.

```ts
await cluster.store.set('session:abc', { userId: '123' }, { ttl: 300000 });

const session = await cluster.store.get<{ userId: string }>('session:abc');
```

## Use Cases

### Command Cooldowns

```ts
async function checkCooldown(userId: string, command: string): Promise<boolean> {
  const key = `cooldown:${command}:${userId}`;
  if (await cluster.store.has(key)) return true;
  await cluster.store.set(key, true, { ttl: 5000 });
  return false;
}

client.on('interactionCreate', async (interaction) => {
  if (!interaction.isChatInputCommand()) return;

  if (await checkCooldown(interaction.user.id, interaction.commandName)) {
    await interaction.reply({ content: 'You are on cooldown.', ephemeral: true });
    return;
  }
});
```

### Global Rate Limiting

```ts
async function isRateLimited(guildId: string, action: string, max: number, windowMs: number): Promise<boolean> {
  const key = `ratelimit:${action}:${guildId}`;
  const current = await cluster.store.get<number>(key) ?? 0;

  if (current >= max) return true;

  await cluster.store.set(key, current + 1, { ttl: windowMs });
  return false;
}
```

### Shared Configuration

```ts
await cluster.store.set('config:maintenance', false);

const maintenance = await cluster.store.get<boolean>('config:maintenance');
if (maintenance) {
  return interaction.reply('Bot is in maintenance mode.');
}
```

### Cross-Cluster Deduplication

```ts
async function claimTask(taskId: string): Promise<boolean> {
  if (await cluster.store.has(`task:${taskId}`)) return false;
  await cluster.store.set(`task:${taskId}`, cluster.id, { ttl: 60000 });
  return true;
}
```

## Architecture Notes

The `StoreManager` lives on the manager process and holds all data in memory. The `StoreClient` on each cluster communicates with it over IPC. This means:

- All operations involve an IPC round-trip (typically sub-millisecond for worker mode)
- Values must be serializable (no functions, circular references, etc.)
- Data does not persist across manager restarts
- The store is not a database -- use it for ephemeral shared state
