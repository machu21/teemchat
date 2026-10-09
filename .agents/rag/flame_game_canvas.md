# Flame 2D Game Canvas Engine RAG

## 1. Flame Game Lifecycle in Flutter Web

Flame games are integrated into Flutter via the `GameWidget`:
```dart
GameWidget(game: _game)
```

### Component Lifecycle Stages
1. **`onLoad()`**:
   - Runs asynchronously **only once** when the game component is first loaded into memory.
   - Used for loading sprites, initializing maps (`WorldMapComponent`), creating local player avatar (`PlayerAvatar`), setting camera bounds.
2. **`onMount()`**:
   - Runs **every time** the game is mounted into the active Flutter element tree.
   - **Crucial Rule**: Any listeners to external services (like `syncService.remotePlayers.addListener`) that might be cleaned up on unmount **must be re-attached in `onMount()`**!
3. **`onRemove()`**:
   - Runs when the component is unmounted from the tree (e.g., during parent widget rebuilds or route pops).
   - If listeners are removed in `onRemove()`, they will remain dead unless restored in `onMount()`.

---

## 2. Remote Avatar Management Pattern

`WorldGame` maintains two collections for other players:
- `syncService.remotePlayers`: `ValueNotifier<Map<String, RemotePlayerState>>` (the raw network state dictionary).
- `remoteAvatars`: `Map<String, RemotePlayerAvatar>` (Flame `PositionComponent` instances added to the game world).

### Reconciliation Logic
In `_onRemotePlayersChanged()`:
1. **New remote player detected**:
   ```dart
   final avatar = RemotePlayerAvatar(
     userId: userId,
     displayName: state.displayName,
     config: state.avatarConfig,
     position: Vector2(state.x, state.y),
   );
   avatar.priority = 10;
   remoteAvatars[userId] = avatar;
   add(avatar);
   ```
2. **Existing player state updated**:
   ```dart
   avatar.updateState(
     newX: state.x,
     newY: state.y,
     direction: state.direction,
     moving: state.isMoving,
     speech: state.speechBubble,
     expiresAt: state.speechExpiresAt,
   );
   ```
3. **Player left / disconnected**:
   ```dart
   remoteAvatars.removeWhere((userId, avatar) {
     if (!players.containsKey(userId)) {
       remove(avatar);
       return true;
     }
     return false;
   });
   ```

---

## 3. Coordinate System & Spawning

- Map bounds: `WorldMapComponent.mapWidth` x `WorldMapComponent.mapHeight` (approx 1280 x 960).
- Standard spawn point: `(420.0, 300.0)` in Verdant Village plaza.
- Camera follow: `camera.followComponent(player)`. Clamped with `Rect.fromLTWH(0, 0, mapWidth, mapHeight)`.
- If two players spawn at identical `(420, 300)` coordinates and do not move, one avatar will be rendered directly atop the other. Jittering spawn points by a small randomized offset (e.g. `± 24px`) guarantees immediate visual visibility.
