# Known Issues & Verified Solutions RAG

## Bug #1: "Chat Works Between Guests & Users, but Avatars Do Not Appear on Screen"

### Symptoms
- Guests and registered users in the same space receive text messages from each other.
- Neither user sees the other user's 2D character avatar inside the canvas.

### Root Cause Analysis

1. **Protocol Discrepancy (Postgres Replication vs. Ephemeral WebSocket)**:
   - Text chat writes to table `public.messages` and is replicated via `postgres_changes`. Guests are authentic users in `auth.users` via `provision_guest_account`, so RLS allows reads and writes.
   - Avatars rely on ephemeral WebSocket broadcast (`event: 'movement'`) and presence (`space:$spaceId:world`).
2. **Channel Flooding & Socket Disconnection (`CLOSED, error: null`)**:
   - The game loop runs at 60 FPS. If movement broadcasts are dispatched every frame even when stationary (`isMoving === false`), the Realtime broker socket gets flooded.
   - `@supabase/supabase-js` limits broadcasts to 10 events/second (minimum 100ms interval).
   - Flooding causes the socket to disconnect with status `CLOSED`.
   - Without automatic reconnect logic, the channel remains permanently closed.
3. **Canvas / React Hook Listener Teardown**:
   - In React 19 StrictMode / hot reload, components mount, unmount, and remount.
   - If `WorldSyncService.onRemotePlayersChanged` callback is detached or replaced without re-binding to the active `WorldGame` instance, incoming avatar movements are ignored.
4. **Identical Spawn Coordinates Collision**:
   - When players spawn at the exact same default coordinates `(420, 300)` and remain stationary, avatars render directly on top of each other.

### Verified Architecture Fix
1. **Throttle Movement & Only Broadcast on Movement / Stop**:
   - In `next-app/src/lib/services/worldSync.ts`: Only dispatch `broadcastMovement` if `player.isMoving` or on the single frame the player stops (`force === true`).
   - Throttle broadcasts to a minimum of 100ms (`MIN_BROADCAST_INTERVAL_MS = 100`).
2. **Auto-Reconnect to Realtime Channel**:
   - On `CLOSED`, `TIMED_OUT`, or `CHANNEL_ERROR`, initiate an exponential backoff reconnect attempt and re-track presence.
3. **React `useEffect` Lifecycle Hygiene in `GameCanvas.tsx`**:
   - Ensure `syncService.onRemotePlayersChanged` is wired directly to the active `WorldGame` instance on mount and cleanly torn down via `game.destroy()` on unmount.
4. **Jitter Initial Spawn Coordinates**:
   - Offset initial coordinates by `(420 + randomOffset, 300 + randomOffset)` to prevent pixel-exact visual overlap.

