# Realtime Networking & Synchronization Specification

## 1. Realtime Communication Channels

In TeemChat, clients communicate over two strictly isolated channel pipelines:

| Channel Identifier | Type | Mechanism | Latency Profile | Payload Structure |
| :--- | :--- | :--- | :--- | :--- |
| `space:$spaceId:world` | Ephemeral WebSocket | `broadcast` & `presence` | ~20ms - 50ms | Coordinates `(x, y)`, direction, speed, speech bubble |
| `public:messages:$roomId` | Database WAL Replication | `postgresChanges` | ~150ms - 300ms | PostgreSQL record (`id`, `room_id`, `sender_id`, `content`) |

> **Critical Rule**: Never mix persistent chat queries and high-frequency movement broadcasts in the same channel. PostgreSQL replication generates WAL (write-ahead log) traffic; ephemeral movement must never hit the database disk.

---

## 2. Bandwidth & Rate-Limiting Constraints

### Client-Side Rate Limit (`realtime_client` SDK)
- The Supabase client library enforces an internal socket throttle:
  ```dart
  eventsPerSecondLimitMs = 100 // 10 events per second limit
  ```
- Any packet emitted faster than 100ms is queued or discarded with `rate limited`.

### Server-Side Rate Limit & Heartbeat
- If a client bombards the Realtime broker at 60 FPS (every frame tick), the server disconnects the socket with:
  ```
  Realtime channel status: CLOSED, error: null
  ```
- **Rule for Movement Broadcasting**:
  - Broadcast movement **only when the player is actively moving** (`isMoving == true`).
  - When stationary (`isMoving == false`), broadcast **at most once** on stop transition (`force = true`), then pause all movement broadcasting.
  - Throttle movement broadcasts to **minimum 100ms interval** (10 packets/second maximum).
  - Do NOT call `_channel.track(...)` every 3 seconds while standing still; let standard presence heartbeats maintain presence state.

---

## 3. Presence Lifecycle & Identity Contracts

### Unique Client Keys
Each browser tab or window instantiates a unique `clientInstanceId`:
```dart
clientInstanceId = '${currentUserId}_${DateTime.now().microsecondsSinceEpoch}_${++_instanceCounter}'
```

### Channel Registration
```dart
_channel = client.channel(
  'space:$spaceId:world',
  opts: RealtimeChannelConfig(
    key: clientInstanceId, // Avoid presence key collisions
    ack: false,
  ),
);
```

### Filtering Inbound Packets
- Always ignore packets originated from `senderClientId == clientInstanceId`.
- Never use simple `senderUserId == currentUserId` filtering if testing multiple guest tabs on the same computer with guest sessions.

---

## 4. Reconnection & Resilience Requirements

If a channel status changes to `CLOSED`, `TIMED_OUT`, or `CHANNEL_ERROR`:
1. Mark `_isSubscribed = false`.
2. Do not leave the service disconnected.
3. Schedule an exponential backoff reconnect attempt (1s, 2s, 5s) to rejoin `space:$spaceId:world`.
4. On resubscription, re-track presence so the player reappears in other participants' worlds.
