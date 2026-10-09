# TeemChat Engineering Review: Multi-Agent Analysis & Architectural Proposal

**Date**: October 7, 2026  
**Review Lead**: `senior_developer` (Principal Architect)  
**Contributing Specialists**: `frontend_engineer` (Lead 2D Canvas & UI), `backend_developer` (Lead Realtime Systems & Services)  
**Status**: Analysis Complete • Zero Code Changes Applied (Awaiting User Authorization)

---

## Executive Summary

This review addresses two core topics raised by the product team:
1. **The Avatar Invisibility Phenomenon**: Guests and registered users can exchange chat messages in real time, but their 2D pixel avatars do not render on screen.
2. **Chat Ephemerality (30-Second Hard Removal)**: Architectural feasibility and implementation design for automatically deleting chat messages every 30 seconds across both the Flutter client and the Supabase PostgreSQL database.
3. **Agent RAG Memory Integration**: Creation of an indexed persistent knowledge base under [`.agents/rag/`](file:///c:/Users/ACER.DESKTOP-FLMICGU/Documents/antigravity/clever-carson/.agents/rag/) so our specialized engineering team retains cross-session domain memory.

---

## Part 1: Root Cause Analysis — Why Chat Works, But Avatars Don't

### The Key Paradox
- **Chat works** because it operates via **PostgreSQL Database Replication** (`RealtimeListenTypes.postgresChanges` on table `public.messages`). When a user or guest posts a message, it is written to PostgreSQL via standard REST/PostgREST. Because guest sessions are provisioned as real authenticated users in `auth.users` with valid JWTs, Supabase's PostgreSQL WAL replication streams the `INSERT` event to both browser tabs cleanly.
- **Avatars fail to appear** because they operate over an entirely different pipeline: **Ephemeral WebSocket Broadcast and Presence** (`space:$spaceId:world`). This pipeline has suffered a cascading failure across three distinct layers.

```
┌────────────────────────────────────────────────────────────────────────┐
│                        WHY CHAT WORKS (DB WAL)                         │
│                                                                        │
│  Client A ──► POST /messages ──► Postgres WAL ──► Realtime Replication │
│                                                          │             │
│  Client B ◄──────────────────────────────────────────────┘             │
│  (Independent channel `public:messages:room`, authenticated via JWT)   │
└────────────────────────────────────────────────────────────────────────┘

┌────────────────────────────────────────────────────────────────────────┐
│                      WHY AVATARS FAIL (WEBSOCKET)                      │
│                                                                        │
│  WorldGame.update() @ 60 FPS ──► 60 pkts/sec Broadcast Flood           │
│                                            │                           │
│  Supabase client throttles (max 10/sec) ───┼──► 'rate limited' drop    │
│  Realtime broker detects socket flood ─────┴──► Channel: CLOSED        │
│                                                                        │
│  Flutter widget rebuilds ──► Flame onRemove() ──► Listener detached!   │
│  Result: remotePlayers map never triggers UI updates.                  │
└────────────────────────────────────────────────────────────────────────┘
```

---

### Root Cause 1: WebSocket Broadcast Flooding & Channel Force-Close
- In [`world_game.dart:345`](file:///c:/Users/ACER.DESKTOP-FLMICGU/Documents/antigravity/clever-carson/lib/features/world/game/world_game.dart#L345), `update(dt)` runs at 60 FPS. Every tick, it calls `syncService?.broadcastMovement(...)`.
- In [`world_sync_service.dart:391`](file:///c:/Users/ACER.DESKTOP-FLMICGU/Documents/antigravity/clever-carson/lib/core/services/world_sync_service.dart#L391), movement broadcasting is only throttled to 50ms (20 packets/sec), and it broadcasts **even when the character is completely stationary** (`isMoving == false`).
- In addition, every 3 seconds, `_channel?.track(...)` sends another heavy presence payload.
- In Supabase's `realtime_client`, the client socket enforces `eventsPerSecondLimitMs = 100` (10 packets/sec maximum). Over 50% of the movement packets are dropped client-side with `'rate limited'`.
- The Supabase server-side Realtime broker flags the connection as flooded and terminates the channel:
  ```
  >>> [WorldSyncService] Realtime channel status: CLOSED, error: null
  ```
- In `world_sync_service.dart:294`, when status is `CLOSED`, `_isSubscribed = false`. **There is zero reconnect or retry logic**, leaving the channel permanently dead for movement and presence!

---

### Root Cause 2: Flame Lifecycle & Listener Detachment in Flutter Web
- In [`world_game.dart:243`](file:///c:/Users/ACER.DESKTOP-FLMICGU/Documents/antigravity/clever-carson/lib/features/world/game/world_game.dart#L243), the listener `syncService?.remotePlayers.addListener(_onRemotePlayersChanged)` is attached inside `onLoad()`.
- In [`world_game.dart:324`](file:///c:/Users/ACER.DESKTOP-FLMICGU/Documents/antigravity/clever-carson/lib/features/world/game/world_game.dart#L324):
  ```dart
  @override
  void onRemove() {
    syncService?.remotePlayers.removeListener(_onRemotePlayersChanged);
    super.onRemove();
  }
  ```
- In Flame, `onLoad()` is only executed **once** in the lifetime of a game component instance.
- Whenever Flutter rebuilds [`WorldScreen`](file:///c:/Users/ACER.DESKTOP-FLMICGU/Documents/antigravity/clever-carson/lib/features/world/world_screen.dart) (for example, when `_game.loaded` completes at line 247, when opening chat or companion modals, or when changing zones), Flutter's widget tree unmounts the game component, triggering `onRemove()`.
- Flame unhooks `_onRemotePlayersChanged`. Because there is **no `onMount()` override**, the listener is never re-attached. Even if `remotePlayers` receives data, `WorldGame` never knows and never creates the `RemotePlayerAvatar` components!

---

### Root Cause 3: Pixel-Exact Spawn Collision
- Both users spawn at exact default coordinates `(420.0, 300.0)`.
- If two players are connected simultaneously without active movement packets, their avatars render at the identical pixel location, creating the illusion that only one avatar exists.

---

## Part 2: Feasibility & Architecture of 30-Second Chat Hard-Removal

### Is it possible?
**Yes, 100% possible, highly scalable, and straightforward.**

### Recommended Architecture: Dual-Tier Synchronized Pruning

#### 1. Database Tier: Automatic PostgreSQL Statement Trigger
Instead of relying on external cron schedulers or third-party workers, author an idempotent statement-level trigger on `public.messages`:

```sql
-- Migration: Automatic 30-Second Chat TTL Hard-Removal
create or replace function public.purge_expired_messages()
returns trigger
language plpgsql
security definer
as $$
begin
  delete from public.messages
  where created_at < now() - interval '30 seconds';
  return new;
end;
$$;

drop trigger if exists trg_purge_expired_messages on public.messages;
create trigger trg_purge_expired_messages
after insert on public.messages
for each statement
execute function public.purge_expired_messages();
```

*Why this is optimal*:
- Every time a new message is posted in any room, PostgreSQL immediately prunes all records older than 30 seconds across the table.
- Requires zero background workers, zero external cron daemons, and zero maintenance overhead.
- Because `public.messages` is in `supabase_realtime`, any client listening for `DELETE` events will be notified immediately!

#### 2. Frontend Tier: Local 1-Second Prune Timer & Realtime DELETE Listener
In [`WorldScreen`](file:///c:/Users/ACER.DESKTOP-FLMICGU/Documents/antigravity/clever-carson/lib/features/world/world_screen.dart):
- Add a periodic 1-second `Timer`:
  ```dart
  Timer? _messageCleanupTimer;

  void _startMessageCleanupTimer() {
    _messageCleanupTimer?.cancel();
    _messageCleanupTimer = Timer.periodic(const Duration(seconds: 1), (_) {
      if (!mounted) return;
      final now = DateTime.now();
      final before = _messages.length;
      _messages.removeWhere((msg) => now.difference(msg.createdAt).inSeconds >= 30);
      if (_messages.length != before) {
        setState(() {});
      }
    });
  }
  ```
- In [`ChatService.listenToRoomMessages`](file:///c:/Users/ACER.DESKTOP-FLMICGU/Documents/antigravity/clever-carson/lib/core/services/chat_service.dart#L135), add a listener for `RealtimeListenTypes.postgresChanges` on `event: 'DELETE'` so that records removed by PostgreSQL are instantly purged from the UI without delay.

---

## Part 3: Specialized Agent Findings & Recommendations

### 1. Principal Architect (`senior_developer`)
> **System Architecture Verdict**:
> "The architectural separation between persistent relational tables and high-frequency game broadcast is sound, but we committed two cardinal sins of real-time systems:
> 1. Unbounded client broadcast: flooding a WebSocket with 60 FPS tick data when the player is not even moving.
> 2. Failure to respect Flutter's widget lifecycle: binding a `ChangeNotifier` in `onLoad()` but only removing it in `onRemove()` without an `onMount()` restore.
> 
> My recommendation: We implement strict deadband broadcasting (only send packets if `isMoving == true` or on transition stop, capped at 10 Hz), re-attach listeners in `onMount()`, and add auto-reconnection to `WorldSyncService`. For the 30-second chat removal, the PostgreSQL trigger + 1s Flutter prune timer is the cleanest, zero-infrastructure path."

### 2. Lead Frontend & Canvas Engineer (`frontend_engineer`)
> **Canvas & Lifecycle Findings**:
> "From the Flame engine standpoint:
> 1. In `WorldGame`, `_onRemotePlayersChanged` was going completely silent after the first Flutter `setState()`. We must implement `onMount()` and ensure `syncService?.remotePlayers.addListener(_onRemotePlayersChanged)` is always active whenever the game canvas is mounted in the element tree.
> 2. In `WorldGame.update(dt)`, calling `broadcastMovement` 60 times a second on the main render thread is causing micro-jank and socket congestion. We should only invoke it when `player.isMoving` or when the player stops.
> 3. We should add a ±32px random offset to initial player spawn coordinates in `(420, 300)` so new arrivals don't render directly behind existing avatars.
> 4. For the 30-second chat cleanup, our `NeoCard` chat panel will feel remarkably responsive and fluid with a 1-second timer that smoothly pops expired messages out of the list."

### 3. Lead Backend & Systems Developer (`backend_developer`)
> **Networking & Realtime Findings**:
> "From the network and Supabase protocol perspective:
> 1. In `WorldSyncService`, our `_channel.subscribe` handler currently accepts `CLOSED` as a terminal state. We need an automatic exponential backoff reconnect strategy (e.g., reconnecting after 1s, 2s, 5s) so network blips never permanently freeze multiplayer.
> 2. The client throttle of 50ms (20/sec) is exceeding Supabase's internal limit of 10/sec (`eventsPerSecondLimitMs = 100`). We must increase the throttle interval to 100ms (10/sec) and stop broadcasting when stationary.
> 3. In `_handlePresenceUpdate`, we should ensure that tab instances are keyed cleanly by `clientInstanceId` rather than just `currentUserId` to allow easy local multi-tab testing.
> 4. For the 30s chat removal, listening to `event: 'DELETE'` on `messages` in `ChatService` completes the loop seamlessly."

---

## Part 4: Step-by-Step Resolution Blueprint (Awaiting Approval)

When you are ready to proceed with implementation, the team will execute the following surgical changes:

1. **Phase 1: Realtime Network Stabilization (`WorldSyncService`)**
   - Restrict movement broadcasting: send only when `isMoving == true` or on transition stop (`force: true`).
   - Increase minimum broadcast interval to 100ms (10 Hz).
   - Add auto-reconnect logic on channel `CLOSED` / `CHANNEL_ERROR`.
   - Prevent redundant `_channel.track()` calls when stationary.

2. **Phase 2: Flame Lifecycle & Canvas Synchronization (`WorldGame`)**
   - Override `onMount()` in `WorldGame` to ensure `remotePlayers` listener is always re-attached.
   - Offset spawn coordinates by random jitter `(±24px)` around plaza center.

3. **Phase 3: 30-Second Chat Hard-Removal (Database & Client)**
   - Author SQL migration: `supabase/migrations/20261007_chat_30s_ttl_cleanup.sql` adding statement trigger `trg_purge_expired_messages`.
   - Update `world_screen.dart`: add 1-second periodic timer to prune `_messages` where `age >= 30s`.
   - Update `chat_service.dart`: subscribe to `DELETE` events on `messages` table.

4. **Phase 4: Verification & Quality Assurance**
   - Validate with Chrome DevTools across two live sessions (guest & registered).
   - Verify `flutter analyze` passes with 0 warnings.
