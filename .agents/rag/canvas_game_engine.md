# HTML5 Canvas 2D Game Engine RAG

## 1. Engine Lifecycle in Next.js & React 19

The 2D game engine is embedded in React via `<GameCanvas />` (`next-app/src/game/GameCanvas.tsx`):

```tsx
'use client';
import { GameCanvas } from '@/game/GameCanvas';

export default function SpaceView({ space }) {
  return <GameCanvas space={space} />;
}
```

### Component Lifecycle & React Hook Hygiene
1. **Mount (`useEffect`)**:
   - Acquires the `HTMLCanvasElement` ref and 2D context (`getContext('2d')`).
   - Attaches `WorldSyncService` callbacks (`onRemotePlayersChanged`, `onChatMessage`).
   - Instantiates `new WorldGame({ canvas, initialX, initialY, displayName, avatarConfig, space, syncService })`.
   - Starts the `requestAnimationFrame` game loop via `game.start()`.
   - Attaches window resize and mobile touch listeners.
2. **Game Loop (`requestAnimationFrame`)**:
   - `WorldGame.loop(timestamp)` computes delta time `dt = (timestamp - lastTime) / 1000`.
   - Calls `update(dt)` for physics, inputs, and collisions.
   - Calls `render()` to draw pre-rendered map, entities, and HUD.
   - Re-enqueues next frame: `this.animFrameId = requestAnimationFrame(this.loop)`.
3. **Unmount & Cleanup**:
   - In React's `useEffect` return cleanup callback:
     ```ts
     return () => {
       game.destroy(); // removes keydown/keyup listeners and cancels requestAnimationFrame
       window.removeEventListener('resize', handleResize);
     };
     ```
   - **Crucial Rule**: Never leave an active `requestAnimationFrame` or window event listener attached when navigating away from the canvas.

---

## 2. Remote Avatar Reconciliation Pattern

`WorldGame` maintains two data structures for player synchronization:
- `syncService`: tracks incoming network states (`Map<string, RemotePlayerState>`).
- `remoteAvatars`: `Map<string, RemotePlayerEntity>` (active entities rendered on canvas).

### Reconciliation Flow (`onRemotePlayersChanged`)
```ts
syncService.onRemotePlayersChanged = (players: Map<string, RemotePlayerState>) => {
  // 1. Add or update remote avatars
  players.forEach((state, userId) => {
    if (userId === currentUserId) return;
    
    let avatar = this.remoteAvatars.get(userId);
    if (!avatar) {
      avatar = new RemotePlayerEntity(userId, state.displayName, state.avatarConfig, state.x, state.y);
      this.remoteAvatars.set(userId, avatar);
    }
    avatar.updateState({
      x: state.x,
      y: state.y,
      direction: state.direction,
      isMoving: state.isMoving,
      speechBubble: state.speechBubble,
      speechExpiresAt: state.speechExpiresAt,
    });
  });

  // 2. Remove disconnected avatars
  for (const [userId] of this.remoteAvatars) {
    if (!players.has(userId)) {
      this.remoteAvatars.delete(userId);
    }
  }
};
```

---

## 3. Coordinate System, Camera & Collision

- **Map bounds**: `WORLD_WIDTH = 1280`, `WORLD_HEIGHT = 960` (80x60 grid of 16px tiles).
- **Spawn point**: `(420, 300)` in Verdant Village center.
- **Spawn Jitter**: Jitter spawn coordinates by `± 24px` to avoid exact overlapping when multiple players spawn concurrently.
- **Camera Follow**: `Camera.follow(player, viewportWidth, viewportHeight)` clamped to `[0, WORLD_WIDTH - viewportWidth]` and `[0, WORLD_HEIGHT - viewportHeight]`.
- **AABB Collision**: Tested against `BOUNDARY_WALLS` and interactive `furniture` obstacles in `collision.ts`.

---

## 4. Performance Optimizations

1. **Pre-Rendered World Map**:
   - Static ground tiles, paths, fences, and water are pre-rendered once onto an offscreen canvas (`createPreRenderedWorldMap()`).
   - Each frame simply renders `ctx.drawImage(preRenderedMap, ...)` clipped to camera view, avoiding thousands of individual tile draw calls per tick.
2. **Y-Sorted Depth Rendering**:
   - Player, remote avatars, companion, and furniture entities are sorted by their Y coordinate (`y + height`) before drawing to guarantee correct visual occlusion.
