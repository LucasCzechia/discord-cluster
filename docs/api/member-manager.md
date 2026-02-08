# MemberManager

The `MemberManager` provides cross-cluster guild member operations including fetching member info, managing roles, banning, and kicking. It is accessible from any cluster via `cluster.members`.

## Import

The MemberManager is automatically instantiated on the ClusterClient. You do not need to import it directly.

```ts
const memberManager = cluster.members;
```

## Lookup Strategy

When fetching a member, the manager follows this resolution order:

1. Check the local cluster's guild cache and fetch the member from it
2. Send an IPC request to the cluster that should own the guild (based on shard calculation)
3. Fall back to a direct Discord REST API call

## Methods

### fetch

Fetches information about a guild member.

```ts
async fetch(guildId: string, userId: string): Promise<MemberInfo | null>
```

| Parameter | Type | Description |
|-----------|------|-------------|
| `guildId` | `string` | The ID of the guild. |
| `userId` | `string` | The ID of the user. |

**Returns:** `Promise<MemberInfo | null>` -- Member information or `null` if not found.

```ts
const member = await cluster.members.fetch('111111111', '222222222');
if (member) {
    console.log(`${member.displayName} joined at ${new Date(member.joinedAt)}`);
    console.log(`Roles: ${member.roles.join(', ')}`);
}
```

### addRole

Adds a single role to a guild member using the Discord REST API.

```ts
async addRole(
    guildId: string,
    userId: string,
    roleId: string,
    reason?: string
): Promise<RolesResult>
```

| Parameter | Type | Description |
|-----------|------|-------------|
| `guildId` | `string` | The ID of the guild. |
| `userId` | `string` | The ID of the user. |
| `roleId` | `string` | The ID of the role to add. |
| `reason` | `string` | Optional audit log reason. |

**Returns:** `Promise<RolesResult>` -- Result with `success`, `added`, and `removed` counts.

```ts
const result = await cluster.members.addRole(
    '111111111', '222222222', '333333333', 'Verified'
);
```

### removeRole

Removes a single role from a guild member using the Discord REST API.

```ts
async removeRole(
    guildId: string,
    userId: string,
    roleId: string,
    reason?: string
): Promise<RolesResult>
```

| Parameter | Type | Description |
|-----------|------|-------------|
| `guildId` | `string` | The ID of the guild. |
| `userId` | `string` | The ID of the user. |
| `roleId` | `string` | The ID of the role to remove. |
| `reason` | `string` | Optional audit log reason. |

**Returns:** `Promise<RolesResult>` -- Result with `success`, `added`, and `removed` counts.

```ts
const result = await cluster.members.removeRole(
    '111111111', '222222222', '333333333', 'Timeout expired'
);
```

### manageRoles

Adds and removes multiple roles in a single call. Operations are performed sequentially.

```ts
async manageRoles(
    guildId: string,
    userId: string,
    options: ManageRolesOptions
): Promise<RolesResult>
```

| Parameter | Type | Description |
|-----------|------|-------------|
| `guildId` | `string` | The ID of the guild. |
| `userId` | `string` | The ID of the user. |
| `options` | `ManageRolesOptions` | Object specifying roles to add, remove, and an optional reason. |

**Returns:** `Promise<RolesResult>` -- Result with counts of roles added and removed.

```ts
const result = await cluster.members.manageRoles('111111111', '222222222', {
    add: ['333333333', '444444444'],
    remove: ['555555555'],
    reason: 'Role update via automation',
});

console.log(`Added ${result.added}, removed ${result.removed}`);
```

### ban

Bans a user from a guild using the Discord REST API.

```ts
async ban(
    guildId: string,
    userId: string,
    options?: { reason?: string; deleteMessageSeconds?: number }
): Promise<{ success: boolean; error?: string }>
```

| Parameter | Type | Description |
|-----------|------|-------------|
| `guildId` | `string` | The ID of the guild. |
| `userId` | `string` | The ID of the user to ban. |
| `options.reason` | `string` | Optional audit log reason. |
| `options.deleteMessageSeconds` | `number` | Number of seconds of messages to delete (0-604800). |

```ts
await cluster.members.ban('111111111', '222222222', {
    reason: 'Spam',
    deleteMessageSeconds: 86400,
});
```

### kick

Kicks a user from a guild using the Discord REST API.

```ts
async kick(
    guildId: string,
    userId: string,
    reason?: string
): Promise<{ success: boolean; error?: string }>
```

| Parameter | Type | Description |
|-----------|------|-------------|
| `guildId` | `string` | The ID of the guild. |
| `userId` | `string` | The ID of the user to kick. |
| `reason` | `string` | Optional audit log reason. |

```ts
await cluster.members.kick('111111111', '222222222', 'Rule violation');
```

## Interfaces

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

| Field | Type | Description |
|-------|------|-------------|
| `id` | `string` | The user's snowflake ID. |
| `displayName` | `string` | The member's display name (nickname or global name). |
| `username` | `string` | The user's username. |
| `avatar` | `string` | URL to the user's avatar. |
| `roles` | `string[]` | Array of role IDs the member has. |
| `joinedAt` | `number \| null` | Unix timestamp (ms) of when the member joined, or `null`. |
| `premiumSince` | `number \| null` | Unix timestamp (ms) of when the member started boosting, or `null`. |

### RolesResult

```ts
interface RolesResult {
    success: boolean;
    added?: number;
    removed?: number;
    error?: string;
}
```

| Field | Type | Description |
|-------|------|-------------|
| `success` | `boolean` | Whether the operation succeeded. |
| `added` | `number` | Number of roles added. |
| `removed` | `number` | Number of roles removed. |
| `error` | `string` | Error message (present on failure). |

### ManageRolesOptions

```ts
interface ManageRolesOptions {
    add?: string[];
    remove?: string[];
    reason?: string;
}
```

| Field | Type | Description |
|-------|------|-------------|
| `add` | `string[]` | Array of role IDs to add. Defaults to `[]`. |
| `remove` | `string[]` | Array of role IDs to remove. Defaults to `[]`. |
| `reason` | `string` | Optional audit log reason for the role changes. |
