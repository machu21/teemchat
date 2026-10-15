# Canvas 2D Game Engine RAG (Formerly Flame Engine)

> [!NOTE]
> The Flutter/Flame engine has been migrated to a native HTML5 Canvas 2D game engine in Next.js (`next-app/src/game/`).
> For the comprehensive specification, consult [`canvas_game_engine.md`](file:///c:/Users/ACER.DESKTOP-FLMICGU/Documents/antigravity/clever-carson/.agents/rag/canvas_game_engine.md).

## Summary of Migration & Canvas Engine Architecture

1. **Engine Entrypoint**:
   - Flutter's `GameWidget(game: _game)` has been replaced by the React client component `<GameCanvas />` (`next-app/src/game/GameCanvas.tsx`).
   - Pure TypeScript game loop is managed by `WorldGame` (`next-app/src/game/WorldGame.ts`) using `requestAnimationFrame`.

2. **Lifecycle Management**:
   - React `useEffect` handles instantiation, canvas context acquisition, input event listeners (`keydown`, `keyup`, `resize`, touch joystick), and clean teardown (`game.destroy()`).
   - Always cancel `requestAnimationFrame` on component unmount to prevent background processing leaks.

3. **Rendering & Performance**:
   - World tilemap is pre-rendered onto an offscreen canvas (`createPreRenderedWorldMap`) and drawn with a single `ctx.drawImage` slice per frame.
   - Entities (`PlayerEntity`, `RemotePlayerEntity`, `CompanionEntity`, `FurnitureEntity`) are depth-sorted by Y coordinates before drawing.

For detailed lifecycle stages, remote player reconciliation, and collision physics, see [`canvas_game_engine.md`](file:///c:/Users/ACER.DESKTOP-FLMICGU/Documents/antigravity/clever-carson/.agents/rag/canvas_game_engine.md).

