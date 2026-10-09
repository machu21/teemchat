# System Architecture RAG

## 1. High-Level Architecture Topology

TeemChat is a 2D virtual office and multiplayer hangout application constructed with the following layers:

```
┌────────────────────────────────────────────────────────┐
│                   FLUTTER WEB CLIENT                   │
│                                                        │
│  ┌─────────────────────────┐  ┌─────────────────────┐  │
│  │   Neo-Brutalism UI      │  │   Flame 2D Canvas   │  │
│  │   (Widgets / Overlays)  │  │   (Game Loop @60FPS)│  │
│  └────────────┬────────────┘  └──────────┬──────────┘  │
│               │                          │             │
│               ▼                          ▼             │
│  ┌──────────────────────────────────────────────────┐  │
│  │               DART SERVICE LAYER                 │  │
│  │  AuthService │ WorldSyncService │ ChatService    │  │
│  │  LiveKitService │ CompanionService               │  │
│  └────────────┬──────────────────────────┬──────────┘  │
└───────────────┼──────────────────────────┼─────────────┘
                │                          │
        Postgres Replication       Ephemeral Broadcast &
          (Realtime WAL)              Presence WebSockets
                │                          │
                ▼                          ▼
     ┌──────────────────────┐   ┌──────────────────────┐
     │  SUPABASE POSTGRES   │   │  SUPABASE REALTIME   │
     │  (Profiles, Spaces,  │   │  (Presence cluster,  │
     │   Messages, RLS)     │   │   Broadcast router)  │
     └──────────────────────┘   └──────────────────────┘
                │
                ▼
     ┌──────────────────────┐
     │  LIVEKIT CLOUD SFU   │
     │  (Spatial Audio,     │
     │   Proximity math)    │
     └──────────────────────┘
```

---

## 2. Key Technology Stack

- **Frontend UI**: Flutter Web (CanvasKit / HTML renderer), Neo-brutalism design system (`lib/core/widgets/neo_components.dart`, `AppColors`).
- **2D Game Engine**: Flame Engine (`package:flame/game.dart`), `WorldGame`, `TileMapComponent`, `PlayerAvatar`, `RemotePlayerAvatar`.
- **Backend as a Service (BaaS)**: Supabase (`supabase_flutter: ^1.10.25`).
- **Realtime Networking**:
  - `RealtimeListenTypes.postgresChanges`: Used for database change streams (`public:messages:$roomId`).
  - `RealtimeListenTypes.broadcast`: Used for high-frequency peer-to-peer packets (movement, typing, bubbles).
  - `RealtimeListenTypes.presence`: Used for member tracking and joining state (`space:$spaceId:world`).
- **Voice / Media**: LiveKit WebRTC client (`livekit_client`) with Euclidean distance proximity attenuation.

---

## 3. Separation of Concerns & State Boundaries

1. **`WorldScreen`** (`lib/features/world/world_screen.dart`):
   - Hosts the `GameWidget(game: _game)`.
   - Manages top HUD, zone announcements, chat modal overlay, avatar customization drawer.
   - Responsible for service instantiation (`WorldSyncService`, `LiveKitService`).
2. **`WorldGame`** (`lib/features/world/game/world_game.dart`):
   - Inherits `FlameGame` with `HasCollisionDetection`.
   - Renders 16x16 tile map, local `PlayerAvatar`, collection of `RemotePlayerAvatar` components, and AI companion.
   - Camera follows local player with clamped world bounds.
   - Listens to `WorldSyncService.remotePlayers` (`ValueNotifier<Map<String, RemotePlayerState>>`).
3. **`WorldSyncService`** (`lib/core/services/world_sync_service.dart`):
   - Connects to Supabase Realtime channel `space:$spaceId:world`.
   - Tracks presence payload (`user_id`, `client_id`, `display_name`, `avatar_config`, `x`, `y`).
   - Dispatches broadcast movements and listens to incoming broadcast movements.
4. **`ChatService`** (`lib/core/services/chat_service.dart`):
   - Handles text chat message persistence to `public.messages`.
   - Subscribes to PostgreSQL database replication on table `messages`.
