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


---

## Bug #2: "Friends Both Online, but Messenger Shows Each Other Offline"

### Symptoms
- Two friends are on the dashboard, yet each sees the other as Offline in the Messenger / Friends panel, and status changes (Do not disturb, Focus) never arrive. A reload fixes it for a while.
- Supabase Realtime logs show `ClientPresenceRateLimitReached: :client_rate_limit_exceeded` for those users.

### Root Cause Analysis
- Supabase Realtime closes a presence channel when one client sends too many `channel.track()` calls on it (system message "Client presence rate limit exceeded"). Measured on this project (2026-11-17): the 6th track closed the channel at 1s, 2s and 3s spacing; one track every 6s never did, so the window is 15-30s with 5 tracks allowed. The counter is per channel join, so a fresh channel can track again immediately.
- supabase-js does not rejoin a channel the server closed, so the user stays off `dashboard:presence`: friends see them offline and they see everyone offline.
- What burned the budget: `onAuthStateChange` builds a new session object on every auth event (tab refocus fires `SIGNED_IN`), the dashboard re-runs `initSocial` for each one, and every `updatePresence` called `track()` even when nothing changed; status clicks added more.

### Verified Architecture Fix (`next-app/src/lib/services/dashboardPresence.ts`)
1. Skip `track()` when the payload (minus `onlineAt`) equals the last one sent.
2. Debounce updates (400ms) and cap sends at `TRACK_BUDGET` (4) per `TRACK_WINDOW_MS` (30s) per join; extra updates collapse into one trailing send of the latest state.
3. On `CLOSED` from the server, rebuild the channel with backoff (2s, 5s, 10s, 30s), and immediately on tab refocus; the new join re-tracks the current state.
- The budget lives in `next-app/src/lib/services/presenceBudget.ts` (`PresenceTrackBudget`); every presence channel must use it.

### Same Limit in Spaces (`space:<id>:world`, `worldSync.ts`)
- Old behaviour: a presence re-track on every stop (1/s) and on every peer join (the forced position broadcast for newcomers also queued a track). Live test: a player walking and stopping 20 times was rate-limited within 5s and kept hitting it on each rejoin; each of those rejoins was a "join" for everyone else, so idle players were rate-limited too.
- Fix: unchanged payloads are never re-sent; resting-position re-tracks may use only 2 of the 4 slots per 30s (`POSITION_TRACK_LIMIT`), so status / hand / sit / companion changes always have a slot and go out in ~250ms; the join track counts against a budget that resets on each SUBSCRIBED. Live movement still uses broadcasts, so positions stay real-time.
