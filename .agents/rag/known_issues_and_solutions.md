# Known Issues & Verified Solutions RAG

## Bug #1: "Chat Works Between Guests & Users, but Avatars Do Not Appear on Screen"

### Symptoms
- Guests and registered users in the same space receive text messages from each other.
- Neither user sees the other user's 2D character avatar inside the Flame canvas.

### Root Cause Analysis

1. **Protocol Discrepancy (Postgres Replication vs. Ephemeral WebSocket)**:
   - Text chat writes to table `public.messages` and is replicated via `RealtimeListenTypes.postgresChanges`. Guests are authentic users in `auth.users` via `provision_guest_account`, so RLS allows reads and writes.
   - Avatars rely on ephemeral WebSocket broadcast (`event: 'movement'`) and presence (`space:$spaceId:world`).
2. **Channel Flooding & Socket Disconnection (`CLOSED, error: null`)**:
   - `WorldGame.update(dt)` runs at 60 FPS and calls `syncService.broadcastMovement` continuously even when the player is completely stationary (`isMoving == false`).
   - The Supabase client library limits broadcasts to 10 events/second (`eventsPerSecondLimitMs = 100`).
   - The flood of unthrottled movement packets combined with periodic `_channel.track()` calls overwhelms the Realtime socket, causing the server to shut the channel (`CLOSED`).
   - `WorldSyncService` lacked reconnection logic, leaving the channel permanently closed.
3. **Flame Widget Lifecycle Listener Detachment**:
   - In `world_game.dart`, `syncService.remotePlayers.addListener(_onRemotePlayersChanged)` was attached inside `onLoad()`.
   - In `onRemove()`, `syncService.remotePlayers.removeListener(_onRemotePlayersChanged)` was called.
   - When Flutter rebuilds `WorldScreen` (e.g. on `loaded.then`, modal open, or zone change), Flame unmounts and remounts components. Because `onLoad()` only runs once, the listener was permanently stripped and never re-attached.
4. **Identical Spawn Coordinates Collision**:
   - Both players spawn at exact coordinates `(420.0, 300.0)`. Without movement broadcasts, the avatars render directly on top of each other.

### Verified Architecture Fix
1. **Throttle Movement & Only Broadcast on Movement / Stop**:
   - Only call `broadcastMovement` if `player.isMoving` or on the single frame the player halts (`force: true`).
   - Throttle broadcasts to a minimum of 100ms.
2. **Add Auto-Reconnect to Realtime Channel**:
   - On `CLOSED` or `CHANNEL_ERROR`, initiate an automatic reconnect timer.
3. **Implement `onMount()` in Flame `WorldGame`**:
   - Re-attach `syncService.remotePlayers.addListener(_onRemotePlayersChanged)` in `onMount()`.
4. **Jitter Initial Spawn Coordinates**:
   - Offset initial coordinates by `(420 + offset, 300 + offset)` to prevent pixel-exact visual overlap.
