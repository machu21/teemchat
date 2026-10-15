# System Architecture RAG

## 1. High-Level Architecture Topology

TeemChat is a 2D virtual office and multiplayer hangout application constructed with the following layers:

```
┌────────────────────────────────────────────────────────┐
│        NEXT.JS 16 (REACT 19) CLIENT / CAPACITOR        │
│                                                        │
│  ┌─────────────────────────┐  ┌─────────────────────┐  │
│  │   Neo-Brutalism UI      │  │  HTML5 Canvas 2D    │  │
│  │   (CSS Modules / React) │  │  (Game Loop @60FPS) │  │
│  └────────────┬────────────┘  └──────────┬──────────┘  │
│               │                          │             │
│               ▼                          ▼             │
│  ┌──────────────────────────────────────────────────┐  │
│  │      ZUSTAND STORES & TYPESCRIPT SERVICES        │  │
│  │  session.ts │ social.ts │ theme.ts               │  │
│  │  worldSync.ts │ spaces.ts │ livekit.ts           │  │
│  │  chat.ts │ directMessages.ts │ friends.ts        │  │
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

- **Frontend UI**: Next.js 16 (App Router), React 19, Neo-brutalism design system (`next-app/src/components/neo/`, CSS Modules, `colors.ts`).
- **2D Game Engine**: Custom HTML5 Canvas 2D engine (`next-app/src/game/WorldGame.ts`, `GameCanvas.tsx`, `camera.ts`, `collision.ts`, `entities/`, `map/`, `render/`).
- **Mobile Packaging**: Capacitor 8 (`@capacitor/core`, `@capacitor/android`, `@capacitor/ios`) for iOS and Android native app shells.
- **State Management**: Zustand 5 (`next-app/src/stores/session.ts`, `social.ts`, `theme.ts`).
- **Backend as a Service (BaaS)**: Supabase (`@supabase/supabase-js: ^2.117.3`).
- **Realtime Networking**:
  - `postgres_changes`: Used for database change streams (`public:messages` filtered by `room_id`).
  - `broadcast`: Used for high-frequency peer-to-peer packets (avatar movement, speech bubbles, typing indicators).
  - `presence`: Used for online member tracking, coordinates `(x, y)`, and initial sync (`space:$spaceId:world`).
- **Voice / Media**: LiveKit WebRTC client (`livekit-client`) with Euclidean distance proximity audio attenuation and server token issuance (`livekit-server-sdk` in Route Handlers).

---

## 3. Separation of Concerns & State Boundaries

1. **Space Page** (`next-app/src/app/space/[spaceId]/page.tsx` & `next-app/src/app/page.tsx`):
   - Hosts the `<GameCanvas space={space} />` component.
   - Manages top navigation bar, HUD, zone announcements, chat modal overlay, avatar customization drawer, and buddy messenger.
   - Subscribes to Zustand stores (`useSessionStore`, `useSocialStore`, `useThemeStore`).
2. **`WorldGame`** (`next-app/src/game/WorldGame.ts`):
   - Pure TypeScript HTML5 Canvas 2D engine.
   - Renders pre-rendered tilemaps, local `PlayerEntity`, collection of `RemotePlayerEntity` instances, interactive furniture, and AI companion.
   - Camera follow with clamped map bounds (`camera.ts`).
   - Listens to `WorldSyncService` remote player updates and dispatches throttled local movement.
3. **`WorldSyncService`** (`next-app/src/lib/services/worldSync.ts`):
   - Connects to Supabase Realtime channel `space:$spaceId:world`.
   - Tracks presence payload (`userId`, `clientInstanceId`, `displayName`, `avatarConfig`, `x`, `y`).
   - Dispatches broadcast movements and listens to incoming broadcast movements with exponential backoff auto-reconnection.
4. **`ChatService` & `DirectMessageService`** (`next-app/src/lib/services/chat.ts`, `directMessages.ts`):
   - Handles text chat message persistence to `public.messages` and `public.direct_messages`.
   - Subscribes to PostgreSQL database replication on table `messages`.
