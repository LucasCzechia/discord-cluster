# ChannelManager

The `ChannelManager` provides cross-cluster channel operations including fetching channel info, sending messages, editing messages, and deleting messages. It is accessible from any cluster via `cluster.channels`.

## Import

The ChannelManager is automatically instantiated on the ClusterClient. You do not need to import it directly.

```ts
const channelManager = cluster.channels;
```

## Lookup Strategy

When fetching a channel or sending a message, the manager follows this resolution order:

1. Check the local cluster's cache
2. Broadcast an IPC request to all clusters to find the channel
3. Fall back to a direct Discord REST API call

## Methods

### fetch

Fetches information about a channel by its ID.

```ts
async fetch(channelId: string): Promise<ChannelInfo | null>
```

| Parameter | Type | Description |
|-----------|------|-------------|
| `channelId` | `string` | The ID of the channel to fetch. |

**Returns:** `Promise<ChannelInfo | null>` -- Channel information or `null` if not found.

```ts
const channel = await cluster.channels.fetch('123456789012345678');
if (channel) {
    console.log(`#${channel.name} (type: ${channel.type})`);
}
```

### send

Sends a message to a channel. Supports text content, embeds, components, and file attachments.

```ts
async send(
    channelId: string,
    payload: any,
    filePaths?: FilePath[]
): Promise<SendResult>
```

| Parameter | Type | Description |
|-----------|------|-------------|
| `channelId` | `string` | The ID of the channel to send to. |
| `payload` | `any` | The message payload (content, embeds, components, etc.). |
| `filePaths` | `FilePath[]` | Optional array of file paths to attach. |

**Returns:** `Promise<SendResult>` -- Result indicating success or failure with the message ID.

```ts
const result = await cluster.channels.send('123456789012345678', {
    content: 'Hello from another cluster!',
});

if (result.success) {
    console.log(`Sent message: ${result.messageId}`);
}

const withFiles = await cluster.channels.send(
    '123456789012345678',
    { content: 'Here is a file' },
    [{ path: '/tmp/report.txt', name: 'report.txt' }]
);
```

### edit

Edits an existing message in a channel using the Discord REST API.

```ts
async edit(
    channelId: string,
    messageId: string,
    payload: object
): Promise<SendResult>
```

| Parameter | Type | Description |
|-----------|------|-------------|
| `channelId` | `string` | The ID of the channel containing the message. |
| `messageId` | `string` | The ID of the message to edit. |
| `payload` | `object` | The updated message payload. |

**Returns:** `Promise<SendResult>` -- Result indicating success or failure.

```ts
const result = await cluster.channels.edit(
    '123456789012345678',
    '987654321098765432',
    { content: 'Updated content' }
);
```

### delete

Deletes a message from a channel using the Discord REST API.

```ts
async delete(
    channelId: string,
    messageId: string
): Promise<{ success: boolean; error?: string }>
```

| Parameter | Type | Description |
|-----------|------|-------------|
| `channelId` | `string` | The ID of the channel containing the message. |
| `messageId` | `string` | The ID of the message to delete. |

```ts
const result = await cluster.channels.delete(
    '123456789012345678',
    '987654321098765432'
);

if (!result.success) {
    console.error(`Failed to delete: ${result.error}`);
}
```

## Interfaces

### ChannelInfo

```ts
interface ChannelInfo {
    id: string;
    name: string;
    type: number;
    guildId: string | null;
}
```

| Field | Type | Description |
|-------|------|-------------|
| `id` | `string` | The channel's snowflake ID. |
| `name` | `string` | The channel's name. |
| `type` | `number` | The Discord channel type (0 = text, 2 = voice, etc.). |
| `guildId` | `string \| null` | The parent guild's ID, or `null` for DM channels. |

### SendResult

```ts
interface SendResult {
    success: boolean;
    messageId?: string;
    error?: string;
}
```

| Field | Type | Description |
|-------|------|-------------|
| `success` | `boolean` | Whether the operation succeeded. |
| `messageId` | `string` | The ID of the sent or edited message (present on success). |
| `error` | `string` | Error message (present on failure). |

### FilePath

```ts
interface FilePath {
    path: string;
    name: string;
}
```

| Field | Type | Description |
|-------|------|-------------|
| `path` | `string` | Absolute or relative file system path to the file. |
| `name` | `string` | The filename to use when attaching to the message. |
