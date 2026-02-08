# UserManager

The `UserManager` provides cross-cluster user operations including sending direct messages and fetching user information. It is accessible from any cluster via `cluster.users`.

## Import

The UserManager is automatically instantiated on the ClusterClient. You do not need to import it directly.

```ts
const userManager = cluster.users;
```

## Lookup Strategy

When fetching a user, the manager checks the local cluster's user cache first, then falls back to a Discord REST API call.

## Methods

### send

Sends a direct message to a user. This creates a DM channel (or reuses an existing one) and sends the message via the Discord REST API.

```ts
async send(userId: string, payload: object): Promise<SendResult>
```

| Parameter | Type | Description |
|-----------|------|-------------|
| `userId` | `string` | The ID of the user to send a DM to. |
| `payload` | `object` | The message payload (content, embeds, components, etc.). |

**Returns:** `Promise<SendResult>` -- Result indicating success or failure with the message ID.

```ts
const result = await cluster.users.send('222222222222222222', {
    content: 'Hello! This is a direct message from the bot.',
});

if (result.success) {
    console.log(`DM sent, message ID: ${result.messageId}`);
} else {
    console.error(`Failed to send DM: ${result.error}`);
}
```

### fetch

Fetches information about a user by their ID.

```ts
async fetch(userId: string): Promise<{
    id: string;
    username: string;
    avatar: string;
    bot: boolean;
} | null>
```

| Parameter | Type | Description |
|-----------|------|-------------|
| `userId` | `string` | The ID of the user to fetch. |

**Returns:** User information object or `null` if the user cannot be found.

```ts
const user = await cluster.users.fetch('222222222222222222');
if (user) {
    console.log(`${user.username} (bot: ${user.bot})`);
    console.log(`Avatar: ${user.avatar}`);
}
```

## Return Types

### User Object

The object returned by `fetch`:

| Field | Type | Description |
|-------|------|-------------|
| `id` | `string` | The user's snowflake ID. |
| `username` | `string` | The user's username. |
| `avatar` | `string` | URL to the user's avatar image. |
| `bot` | `boolean` | Whether the user is a bot account. |

### SendResult

See [ChannelManager - SendResult](./channel-manager.md#sendresult) for the full interface definition.

```ts
interface SendResult {
    success: boolean;
    messageId?: string;
    error?: string;
}
```
