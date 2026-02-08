# Transparent API

discord-cluster provides four transparent managers that let you access guilds, channels, members, and users across all clusters as if they were local. Every manager follows the same resolution strategy:

1. **Local cache** -- check the current cluster's discord.js cache
2. **IPC** -- ask the correct cluster (or all clusters) via IPC
3. **REST** -- fall back to the Discord API

All managers are available as properties on the `ClusterClient` instance.

> See the API reference for [GuildManager](/api/guild-manager), [ChannelManager](/api/channel-manager), [MemberManager](/api/member-manager), and [UserManager](/api/user-manager).

```ts
const cluster = new ClusterClient(client);

cluster.guilds    // GuildManager
cluster.channels  // ChannelManager
cluster.members   // MemberManager
cluster.users     // UserManager
```

## GuildManager

### `guilds.fetch(guildId)`

Fetches guild information. Checks the local cache first, then routes to the cluster that owns the guild via IPC, then falls back to the REST API.

```ts
const guild = await cluster.guilds.fetch('123456789012345678');
if (guild) {
  console.log(guild.name);
  console.log(guild.memberCount);
}
```

**Returns:** `Promise<GuildInfo | null>`

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

The IPC routing is deterministic -- `findGuild(guildId)` calculates which cluster owns a guild based on Discord's shard formula, so only one IPC request is made instead of broadcasting to all clusters.

### `guilds.count()`

Returns the total guild count across all clusters.

```ts
const total = await cluster.guilds.count();
console.log(`Serving ${total} guilds`);
```

**Returns:** `Promise<number>`

Uses `ipc.requestAll` internally and sums the results with `ResultCollection.sum()`.

## ChannelManager

### `channels.fetch(channelId)`

Fetches channel information. Checks the local cache, then broadcasts to all clusters via IPC, then falls back to REST.

```ts
const channel = await cluster.channels.fetch('123456789012345678');
if (channel) {
  console.log(channel.name);
  console.log(channel.type);
}
```

**Returns:** `Promise<ChannelInfo | null>`

```ts
interface ChannelInfo {
  id: string;
  name: string | null;
  type: number;
  guildId: string | null;
}
```

Unlike `GuildManager.fetch`, channel lookups broadcast to all clusters because there is no deterministic way to map a channel ID to a specific cluster.

### `channels.send(channelId, payload, filePaths?)`

Sends a message to a channel, regardless of which cluster owns it.

```ts
const result = await cluster.channels.send('123456789012345678', {
  content: 'Hello from another cluster!',
});

if (result.success) {
  console.log(`Message sent: ${result.messageId}`);
}
```

With file attachments:

```ts
const result = await cluster.channels.send(
  '123456789012345678',
  { content: 'Here is the file' },
  [{ path: '/tmp/report.pdf', name: 'report.pdf' }],
);
```

**Returns:** `Promise<SendResult>`

```ts
interface SendResult {
  success: boolean;
  messageId?: string;
  error?: string;
}
```

Resolution order: local cache (send directly) -> IPC broadcast (find a cluster that has the channel) -> REST API.

### `channels.edit(channelId, messageId, payload)`

Edits a message in a channel via the REST API.

```ts
const result = await cluster.channels.edit(
  '123456789012345678',
  '987654321098765432',
  { content: 'Updated content' },
);
```

**Returns:** `Promise<SendResult>`

### `channels.delete(channelId, messageId)`

Deletes a message from a channel via the REST API.

```ts
const result = await cluster.channels.delete(
  '123456789012345678',
  '987654321098765432',
);

if (result.success) {
  console.log('Message deleted');
}
```

**Returns:** `Promise<{ success: boolean; error?: string }>`

## MemberManager

### `members.fetch(guildId, userId)`

Fetches member information. Checks the local cache, then routes to the owning cluster via IPC, then falls back to REST.

```ts
const member = await cluster.members.fetch(
  '123456789012345678',
  '987654321098765432',
);

if (member) {
  console.log(member.displayName);
  console.log(member.roles);
}
```

**Returns:** `Promise<MemberInfo | null>`

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

Like `GuildManager.fetch`, this uses deterministic routing based on the guild ID.

### `members.addRole(guildId, userId, roleId, reason?)`

Adds a role to a member via the REST API.

```ts
const result = await cluster.members.addRole(
  '123456789012345678',
  '987654321098765432',
  '111222333444555666',
  'Verified user',
);
```

**Returns:** `Promise<RolesResult>`

### `members.removeRole(guildId, userId, roleId, reason?)`

Removes a role from a member via the REST API.

```ts
const result = await cluster.members.removeRole(
  '123456789012345678',
  '987654321098765432',
  '111222333444555666',
);
```

**Returns:** `Promise<RolesResult>`

### `members.manageRoles(guildId, userId, options)`

Adds and removes multiple roles in a single call.

```ts
const result = await cluster.members.manageRoles(
  '123456789012345678',
  '987654321098765432',
  {
    add: ['111222333444555666', '222333444555666777'],
    remove: ['333444555666777888'],
    reason: 'Role sync',
  },
);

console.log(`Added: ${result.added}, Removed: ${result.removed}`);
```

**Returns:** `Promise<RolesResult>`

```ts
interface RolesResult {
  success: boolean;
  added?: number;
  removed?: number;
  error?: string;
}
```

### `members.ban(guildId, userId, options?)`

Bans a member from a guild.

```ts
const result = await cluster.members.ban('123456789012345678', '987654321098765432', {
  reason: 'Spam',
  deleteMessageSeconds: 86400,
});
```

**Returns:** `Promise<{ success: boolean; error?: string }>`

### `members.kick(guildId, userId, reason?)`

Kicks a member from a guild.

```ts
const result = await cluster.members.kick(
  '123456789012345678',
  '987654321098765432',
  'Inactive',
);
```

**Returns:** `Promise<{ success: boolean; error?: string }>`

## UserManager

### `users.fetch(userId)`

Fetches user information. Checks the local cache first, then falls back to REST.

```ts
const user = await cluster.users.fetch('987654321098765432');
if (user) {
  console.log(user.username);
  console.log(user.bot);
}
```

**Returns:** `Promise<{ id: string; username: string; avatar: string; bot: boolean } | null>`

### `users.send(userId, payload)`

Sends a DM to a user. Creates a DM channel via REST and sends the message.

```ts
const result = await cluster.users.send('987654321098765432', {
  content: 'You have been warned.',
});

if (result.success) {
  console.log(`DM sent: ${result.messageId}`);
}
```

**Returns:** `Promise<SendResult>`

This always uses REST (creates DM channel then sends), so it works from any cluster regardless of cache state.
