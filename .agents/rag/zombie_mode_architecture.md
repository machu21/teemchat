# Zombie Mode Architecture (Zomboid-style survival)

Status: **playable as its own space type**.
- **Zombie Survival spaces:** `spaces.mode = 'zombie'`, migration `supabase/migrations/20261104_space_mode.sql`. They always run zombie mode on the fixed `zombie_city` map. `?mode=zombie` remains as a dev-only override.
- **City:** generated from a fixed seed in `next-app/src/game/map/city/` and adapted in `city/cityMap.ts`. It is 6720×4320 px (420×270 tiles) and is streamed in 512 px chunks (`map/chunkedMap.ts`).
- **Buildings:** 1–4 floors linked by `stairs` / `stairsUp`. Zombies climb using stairs portals in the flow field.
- **Doors, windows and barricades:** host-authoritative over `zdoor` and the snapshot `d` rows.
- **Zoom:** survival locks it to 100–200 %.
- **Not built yet:** voice-driven noise, and persisting barricades after a space empties.

Zombie Mode is an opt-in **space mode** (`spaces.mode = 'zombie'`). Casual spaces never load any of this code. Use a dynamic `import()` so the zombie bundle stays out of the default route.

---

## 0. Fit with the current stack (read this first)

| Concern | What exists today | What Zombie Mode adds |
| :--- | :--- | :--- |
| World coords | 1680×1080 px, AABB `Rect[]` walls (`collision.ts`) | A **16px tile grid** (105×68) generated from the same map, used for FOV / pathing / sound |
| Buildings | `map/buildings.ts`: footprint, door, roof pre-render, roof lift (`roofProgress`) | Reused as-is for the roof cutaway. The grid adds `TILE_INTERIOR` + `buildingIndex` |
| Networking | Supabase Realtime `space:{id}:world` (presence + broadcast, ≤10 msg/s/client) | A second channel `space:{id}:zombies` for the authority's snapshots + player actions |
| Server | **No game server.** Next.js route handlers (stateless) + Supabase | Phase 1: **host-authoritative client**. Phase 2 (optional): a small Node authority process |
| Voice | LiveKit, distance → volume | Local mic RMS → noise events → zombie hearing |

The pasted brief assumes a Node.js WebSocket backend. TeemChat doesn't have one, so the design below runs on Supabase in phase 1 and treats a dedicated server as an upgrade path, not a requirement.

---

## 1. Map data & interior cutaway

### 1.1 Grid schema (`grid.ts`)

```ts
interface TileGrid {
  cols, rows, tileSize: 16;
  flags: Uint8Array;          // TILE_SOLID | TILE_OPAQUE | TILE_INTERIOR | TILE_ENTRANCE
  buildingIndex: Uint8Array;  // 0 = outdoors, n = BUILDINGS[n-1]
  entrances: Map<tileIdx, Entrance>;
}
```

Render layers stay what the engine already does well:

| Layer | Storage | Drawn |
| :--- | :--- | :--- |
| Ground + floors | pre-rendered offscreen canvas (`worldMap.ts`) | once, `drawImage` per frame |
| Walls (lower half) | part of pre-render | once |
| Furniture, players, zombies, wall tops | Y-sorted `renderList` | per frame |
| Roof | per-building offscreen canvas (`roofLayers`) | alpha = `1 - roofProgress` |
| Fog / FOV mask | `FovMaskRenderer` (cols×rows px canvas, upscaled) | per FOV recompute |
| Collision | `TileGrid.flags` (SOLID) + existing `Rect[]` | — |

**Authoring:** keep the TypeScript map modules (`map/maps/*.ts`) as the single source and **derive** the grid by rasterising `boundaryWalls`, furniture footprints and building footprints into `flags` at load. That's one `buildZombieGrid(mapConfig, buildings)` function and no second format to keep in sync. Move to Tiled JSON only if designers start hand-painting maps. Its layers would then map 1:1: `ground`, `walls`, `furniture`, `roof`, `collision`, an `entrances` object layer.

### 1.2 Roof / wall occlusion

The basic roof lift already exists: `resolveBuildingAt` (with exit hysteresis), `stepRoofProgress`, `easeOutCubic`. Zombie Mode adds three things on top:

1. **Roof of *your* building lifts; others stay.** Already true: `roofProgress` is per building.
2. **Exterior south-facing wall cutaway.** Walls whose tile row is below the player inside the same `buildingIndex` are drawn at `alpha = 0.25` (or as a 4px "stub") so the room isn't hidden by its own front wall. Do it per tile in the wall-top pass: `if (buildingIndex[t] === insideIdx && row > playerRow) ctx.globalAlpha = 0.25`.
3. **Interior visibility comes from FOV, not the roof.** With the roof lifted, rooms you can't see into are still dark because `FovMaskRenderer` draws `ALPHA_REMEMBERED` / `ALPHA_UNSEEN` over them. This gives the Zomboid "peek through the doorway" feel without a separate raycast.

Upper floors (later): one `TileGrid` per Z level. Render `z ≤ playerZ`, and cut away `z > playerZ` with the same roof-lift alpha.

### 1.3 Interactive entrances (`entrances.ts`)

```
           toggle              lock
  open  ◀──────────▶ closed ─────────▶ locked
                      │  ▲  ◀─────────
             addPlank │  │ removePlank (planks → 0)
                      ▼  │
                   barricaded ──damage (planks soak 25 each)──▶ closed ──damage (hp→0)──▶ broken
```

| State | Blocks movement | Blocks sight | Sound damping |
| :--- | :---: | :---: | :---: |
| open / broken | – | – | 1.0 |
| closed door / locked | ✓ | ✓ | 0.4 |
| closed window (glass) | ✓ | – | 0.6 |
| barricaded | ✓ | ✓ | 0.35 |

`applyEntranceAction` is pure and immutable. The authority applies it, diffs, and broadcasts only the changed entrance. `setEntrance` keeps the grid's SOLID/OPAQUE bits in sync, so FOV and pathing pick up the change on the next tick.

**Persistence:** barricades should survive a host leaving. Store them in `zombie_entrances (space_id, entrance_id, state, planks, hp, updated_at)`, written by the host **only on change** (not per tick), with RLS that allows writes to members of the space (guests included). Database Manager owns this migration.

---

## 2. Visibility & fog of war

### 2.1 Directional cone (`fov.ts`)

- **Symmetric shadowcasting** (Albert Ford's variant). It runs in O(r²) per call and is independent of map size: r = 14 is about 600 tiles, well under 0.1 ms.
- Occlusion is computed for the full circle **first**, then each revealed tile is classified:
  - `VIS_VISIBLE`: inside `viewRadius` **and** within `±coneAngle/2` of facing (default 110°)
  - `VIS_PERIPHERAL`: inside `peripheralRadius` (default 2.5 tiles) in any direction
  - `VIS_HIDDEN`: everything else
- Facing = last movement direction (`facingFromVelocity`). Optionally, desktop uses aim-to-mouse while holding Shift.
- Recompute only when the player changes tile or turns more than about 5°, not every frame. Reuse the output buffer (`computeFov(grid, p, prev)`).

### 2.2 Rendering

`FovMaskRenderer` writes **one pixel per tile** into a 105×68 canvas and draws it upscaled with smoothing on. Bilinear filtering gives soft shadow edges for one `drawImage` per frame. Tiles you've seen before keep `ALPHA_REMEMBERED`, so you remember the layout but not where the zombies are.

Insert it in `WorldGame.render()` **after** the Y-sorted `renderList` and **before** `renderDoorHighlight()` / HUD.

Entity culling: zombies with `visibilityAt(...) === VIS_HIDDEN` are **not drawn**. `VIS_PERIPHERAL` zombies are drawn as a silhouette or a "sound ping". Other players are always drawn (it's co-op), but at 40% alpha when hidden.

### 2.3 Client vs. server authority (anti-spoiler)

Supabase broadcast delivers the **same payload to every subscriber**. Per-client interest management isn't possible on it, so in phase 1 any client *could* read every zombie position from the socket. Options, in order of cost:

| Phase | Authority | Hidden-entity protection |
| :--- | :--- | :--- |
| 1 (ship) | Host client (below) | **Cosmetic only.** Clients receive all zombies and the cone hides them. Acceptable for co-op PvE: cheating only spoils your own fun |
| 1.5 | Host client | **Coarse interest culling:** snapshots are split per 8×8-tile region (`zombies:r{n}` events), and clients only *render* regions near them. Still not secure, but it cuts bandwidth |
| 2 | Node authority (`ws` + the same pure modules) | **Real:** the server runs `computeFov` per player (cheap) and sends each socket only zombies with `vis ≠ HIDDEN` plus a 1-tile margin, and noise "pings" for the rest |

Everything under `src/game/zombie/` is deliberately DOM-free (except `fovMask.ts`). Phase 2 is a deployment change, not a rewrite.

---

## 3. Audio & proximity voice → survival mechanics

### 3.1 Voice draws zombies ("shh" mechanic)

- Use a local `AnalyserNode` on the **local** mic track (already captured for LiveKit) to read RMS at 10 Hz.
- RMS above a threshold → `noise = { x, y, radius: lerp(3, 12 tiles, loudness) }`. Push-to-talk off plus whispering stays under the threshold.
- Send noise to the authority as an event on `space:{id}:zombies`: `{ t:'noise', x, y, r, from: clientInstanceId }`. Throttle it to 1 per 500 ms per client, because noise doesn't need to be precise.
- Footsteps (running), gunshots, smashing windows, and barricade hammering emit the same event with fixed radii. A HUD noise meter shows the player how loud they are.

### 3.2 Propagation through walls / doors

The authority runs a **bounded BFS (Dijkstra-lite) from the noise tile** over the grid:
- Open tile costs 1. Wall costs `1 / 0.15` (sound through walls is heavily muffled). Entrances cost `1 / entranceSoundDamping(e)`.
- Zombies on tiles with `cost ≤ radius` hear it and get `targetTile = noise tile` plus `alert = 1 - cost/radius`.
- Cap the BFS at `radius ≤ 12` tiles (≤ ~450 nodes) and batch all noises received in a tick into one multi-source BFS.

The same costs drive **LiveKit voice between players**: multiply the existing distance gain by a wall-occlusion factor from a cheap Bresenham line test (`walls crossed → gain × 0.5ⁿ`), so voices through a closed door sound muffled.

### 3.3 Ambient loops (room context)

One `AudioContext` with three looped `AudioBufferSourceNode`s cross-faded by context:
- outdoors (`buildingIndex === 0`): wind + distant moans. Moan gain scales with zombie count in a 20-tile radius.
- indoors: low room tone, plus a lowpass filter (`BiquadFilterNode`, ~800 Hz) on the outdoor bed.
- barricade rattle: a one-shot positional `PannerNode` per entrance that receives `damage` events.

All nodes are disconnected and `ctx.close()` is called in `dispose()`, same as the RAF and channel teardown rules.

---

## 4. Zombie AI & sync

### 4.1 Pathfinding: flow fields, not per-zombie A*

Hordes share goals, so compute **one flow field per target** and let every zombie read from it:
- Multi-source BFS / Dijkstra from all *alive players' tiles* over `TILE_SOLID`. **Barricaded entrances count as passable at a high cost (≈ 8)**, so zombies route to them and attack instead of giving up.
- 105×68 = 7.1k tiles: well under 1 ms per rebuild. Rebuild when any player changes tile (debounced to 4 Hz) or an entrance changes.
- Zombies only follow the field in `CHASING`. `WANDERING` uses random tile targets with a tiny local A* (≤ 64 nodes) or straight-line steering.
- Local avoidance: a spatial hash (2×2-tile buckets) plus simple separation steering, so hordes funnel through doors without overlapping.
- Hierarchical A* (building-level graph → tile level) is only worth adding if maps grow past ~50k tiles.

### 4.2 Zombie state machine (authority only)

```
IDLE ──(random 4–10s)──▶ WANDER ──▶ IDLE
  │  heard noise / saw player           │
  └──────────────▶ INVESTIGATE (go to noise tile) ──saw player──▶ CHASE
                          │ lost (8s)                            │ adjacent
                          ▼                                      ▼
                        WANDER                                ATTACK (player)
                                           blocked by entrance on path → ATTACK_BARRICADE
```

Zombie "sight" uses the **same `computeFov`** with a wider cone (180°), a short radius (6 tiles), and recompute only every 500 ms. Hearing carries most of the detection, which makes stealth meaningful.

### 4.3 Tick & sync (implemented: host-authoritative over Supabase)

Code: `next-app/src/lib/services/zombieSync.ts` (channel + `HostElection`), `next-app/src/game/zombie/zombieMode.ts` (host/client roles). Tests: `tests/zombie_sync.test.ts`, `src/game/zombie/zombieMode.test.ts`.

- **Host election (`HostElection`, pure):** the longest-present member of `space:{id}:zombies` presence (`joined_at`, stable across reconnects) hosts. Seniority stops a newcomer from taking over before it has the horde.
  - **Liveness:** a host silent for `HOST_TIMEOUT_MS` (3.5 s) is suspected and skipped. This covers ghost presence entries whose leave never arrived (seen in dev with StrictMode remounts) and hosts whose background tab paused `requestAnimationFrame`.
  - **Epochs:** every takeover bumps an epoch that is sent on each snapshot. Snapshots from an older epoch are dropped, and a host that hears a newer epoch steps down, so a frozen host that wakes up never overwrites the horde.
  - A promoted client calls `ZombieSim.adopt()` on the last snapshot it received, so no zombies are lost.
- **Simulation:** the host runs `ZombieSim` inside the normal game loop. Clients dead-reckon each zombie toward its goal at its state's speed and ease the drawn position onto that (they snap if more than 48 px off).
- **Wire format** (`zsnap`, ~3 Hz, skipped when nothing changed, 1 s heartbeat):

```ts
{ from, e: epoch, snap: { s: seq, z: [[id, x, y, goalX, goalY, stateIdx, hp, variant], ...], b?: [[targetClientId, dmg]], k?: [[strikerClientId, kills]] } }
```

- **Client → host:** only `zstrike {x, y, f}` (melee swings, ≤2/s). The host derives footstep noise from players' existing movement broadcasts, so clients send no noise events.
- **Budget:** the socket allows ~10 events/s per client and walking already uses up to 10/s on `space:{id}:world`. That's why snapshots run at ~3 Hz rather than 10.
- **Health is local** to each player. Only the horde, bites and kill credits are shared. Zombies only hunt players who are in this channel's presence (that is, who also have zombie mode on).
- **Known gaps:**
  - Two tabs signed in as the same user see the horde in sync, but `worldSync` merges them into one avatar, so the host can't target the second tab.
  - Positions travel to every client, so hiding zombies from cheaters (§2.3) is cosmetic only.
- **Never** put zombie positions in Postgres or `supabase_realtime` publications.

Phase 2 swaps "host client" for a Node process that runs the same tick module and adds per-socket FOV culling (§2.3).

---

## 4.4 City, floors and entrances (implemented)

- **Map plumbing.**
  - `MapThemeConfig` gained `size`, `renderChunk`, `renderEntrance`, `entrances` and `hiddenFromPicker`.
  - `zombie_city` is a lazy getter on `MAP_REGISTRY`, so the city is only generated when a survival space opens. `getAllMapConfigs()` skips it.
- **Stairs.**
  - `UpperLevel.stairsUp` chains floors, and `getStairLinks()` lists every flight.
  - The floor selector walks one flight at a time and ignores the other flight in a shared stairwell (`WorldGame.stairGoal`).
  - `buildZombieGrid()` turns each trigger tile into a portal (`grid.portalOut` / `portalIn`) to the arrival tile.
- **Flow field.** It uses Dial's algorithm: walk costs 1, a portal 3, and a closed or barricaded entrance 8. Zombies whose next step is a portal climb (0.6 s); if it is a blocked entrance, they switch to `attack_entrance`, and planks soak damage first.
- **Entrances on the wire.** The client optimistically applies its action and sends `zdoor {t: tileIndex, a}`. The host validates reach (≤ 2 × `DOOR_REACH`) and broadcasts changed rows `[tile, ENTRANCE_STATES idx, planks, hp]` in `zsnap.d`, plus every changed entrance every 5 s for late joiners.
- **Scale.**
  - Population scales with map area (80 on the city).
  - The host only sends zombies within 45 tiles of some player.
  - Wall collision uses `WallIndex` buckets.

## 4.5 Player scale, doors, zoom and jumping (implemented)

- **City scale.** Blocks are ~52 × 46 tiles on a 7 × 5 grid. Rooms are at least 5 tiles (`MIN_ROOM`). Front doors are double doors, and interior doorways are 2 tiles wide (`DOOR_W`).
- **Double doors.** The two leaves are linked (`ZombieMode.linkedEntranceTiles`) and open, close, lock and get boarded together.
- **Survival hitbox.** It is 12 × 10 around the feet (`WorldGame.playerHitbox`). Social maps keep 16 × 16.
- **Indoor zoom.** Indoors the camera eases to 180 %, and indoor and outdoor zoom are remembered separately (`WorldGame.survivalZoom`).
- **Jumping.**
  - Space or the ⤴ button starts a 0.45 s hop that lifts the sprite 14 px.
  - Mid-air, `MapThemeConfig.lowWalls` (fences, parked cars, dumpsters, pumps, bins) and benches are ignored. Walls, closed doors and closed windows still block.
  - Landing on top of an obstacle is postponed for up to 0.35 s. Landing makes noise (radius 4).
  - `lowWalls` are `TILE_SOLID` but not `TILE_OPAQUE` in the zombie grid: zombies path around them and can still see over them.
  - Jumps are not synced, so other players see you pass through.

## 4.6 Weapons and loot (implemented)

- **Weapons** (`zombie/weapons.ts`): Fire Axe (melee, default), Pistol, Shotgun (8 pellets), M16, AK-47 and Machine Gun (100-round belt, 0.75× movement). Each has damage, cooldown, range, spread, magazine size, reload time, ammo type and noise.
- **Bullets.** `castBullet()` is hitscan on the tile grid. Opaque tiles stop bullets, and closed glass windows shatter while the bullet continues. The first zombie body circle hit takes the damage, measured at torso height.
- **Noise.** Gunshots are loud: one noise per shot batch, with radius 18–30 tiles. Noises of 12+ tiles lose only a quarter of their reach per wall (`LOUD_NOISE_RADIUS`). Zombies now hear on every tick, not only on their 4 Hz sense tick.
- **Loot** (`map/city/cityLoot.ts`): seeded per building kind. The police station is the full armory; houses, apartments, offices and shops have weighted tables. Items sit on open floor tiles. You walk over them to pick up; a duplicate gun gives ammo instead. Dying drops everything except the axe.
- **Controls.** F fires (hold for automatic weapons), R reloads, Q or 1–6 switches weapon. The mouse aims and turns the vision cone, falling back to movement direction 2.5 s after the mouse stops. On touch, use the HUD fire button (hold for auto), the slot buttons and R. A press during a cooldown is buffered for 0.35 s.
- **Sync** (host-authoritative):
  - Clients batch gunfire into `zshot {x, y, w, a[]}` every 0.25 s while shooting. The host casts the bullets, credits kills in `k`, and shatters windows into `d`.
  - Pickups are applied optimistically and sent as `zloot {i}`. The host broadcasts taken ids in `zsnap.t`, resends the full list periodically, and resends immediately when someone joins.
  - Remote players' tracers and muzzle flashes are not shown yet.

## 4.7 Survival layer: vitals, bag, factions, specials

Code: `next-app/src/game/zombie/survival/`, tests in `survival.test.ts` (pure) and the "survival layer" block of `zombieMode.test.ts` (wired). Everything is DOM-free and deterministic.

**Wired into `ZombieMode`:** vitals, sprint, supplies, the difficulty clock and the three specials.
- **Vitals.** `ZombieMode.vitals` replaces the old `hp` field; `hp` is now a getter. The old flat regen is gone: you heal while well fed (hunger and hydration ≥ 60), from food or meds, or by resting somewhere safe (indoors with nothing hunting within 10 tiles).
- **Sprint.** Hold Shift; touch devices get the 🏃 toggle. It costs stamina and makes louder footsteps (radius 6). `moveMultiplier()` = weapon × vitals × sprint.
- **Supplies.** City loot gains `{ kind: 'supply' }` spawns from a separate RNG stream, so gun ids are unchanged. Groceries, shops, gas stations and pharmacies restock every 300 s ÷ `lootMul`; other buildings are one-time. Supplies go into the bag (12 slots, 20 kg). C, or a tap on a HUD supply, uses one. Guns and ammo keep their existing slots and pouch.
- **Difficulty.** The host counts `elapsed` and sends it as `zsnap.el`. Every client derives `difficultyAt(elapsed)`, which drives: walker speed, sim aggro, population and waves, special rolls (capped at 4 chargers, 6 bloaters, 1 dreadnought), loot restock, and vitals decay.
- **Specials** run on the host through `SpecialsDirector`.
  - Damage is armour-aware: melee via `sim.strike(..., scale)`, bullets via `director.damage`. Bites are scaled by type.
  - Rows carry `[..., kind, abilityFlag]`. Clients mirror ability state with `applyFlag`; a charging Charger's goal row points along the dash.
  - One-shot effects travel in `zsnap.x`: `i` impact + knockdown, `b` burst + gas, `r` roar, `c` breach.
  - Gas clouds tick on every client, applying poison, slow and blinded, and shrinking the FOV via `ZombieVision.setViewScale`.
- **Loot sync.** `zsnap.tf = 1` marks a full taken-list resend that replaces the client's set, and `zsnap.r` lists restocked ids.

**Not wired yet:** factions/PvP and squads, and the admin/mod match gate (needs `zombie_matches`, below). Until then the match clock starts when a host first runs the horde.

| Module | What it owns |
| :--- | :--- |
| `types.ts` | `PlayerVitals`, `InventoryItem`, `WeaponItem`, `Bag`, `QuickSlots`, `LootContainer`, `ZombieEntity` (= `Zombie` + kind/armour/ability), `SpecialZombieType`, `GameState`, `Relation` |
| `difficulty.ts` | `difficultyAt(elapsed)`: spawn interval, population, aggro, speed, special chances, loot and decay multipliers. `FixedStep` is a 20 Hz accumulator with capped catch-up |
| `vitals.ts` | `tickVitals`: hunger/hydration decay (hydration ×2.5 sprinting), stamina + exhaustion lock, starvation/dehydration HP drain, safe-zone stabilise. Status effects: stimulant, poison, slow, blinded, knockdown, regen |
| `inventory.ts` | Slot + weight bag with stacking, ammo pouch auto-stack, quick reload, duplicate gun → ammo, consumables, POI container presets, loot tables, respawn timers or one-time flags |
| `factions.ts` | `relationOf`: same account / mutual friend / same squad → `TEAM_ALLY`, otherwise `NEUTRAL_SURVIVOR`, `zombie:*` → `INFECTED`. `damageMultiplier` (no ally bullets, softened PvP). Squad invites with TTL |
| `session.ts` | `space_members.role` → `ROOM_ADMIN` / `MOD_OPERATOR` / `SURVIVOR`; start/end gate; clock from a shared `startedAtMs`; `validateMove` (anti-teleport rubber-band, stairs portals allowed) |
| `specials.ts` | Strategy per special + `SpecialsDirector` (run right after `sim.tick`). Charger: windup → straight charge → knockdown/breach → stun. Bloater: proximity fuse or death → burst + 10 s gas hazard. Dreadnought: armour (ballistic ×0.35) + roar every 14 s that `rallyHorde`s zombies within 30 tiles |

`ZombieSim` gained three optional hooks for this: `add(x, y)`, `Zombie.locked` (an ability owns movement, so the sim skips AI), and `Zombie.speedMul`.

### Sync plan (fits the existing `space:{id}:zombies` channel and budget)

- **High frequency (horde).** Keep `zsnap` at ~3 Hz with client dead-reckoning.
  - Append `kind` (`ZOMBIE_KINDS` index) as the 9th `ZombieRow` element, append-only.
  - Send ability phase only while an ability is active, as a 10th element: charge direction is needed so clients can extrapolate a 210 px/s dash between snapshots. Without it the dash looks like teleporting.
- **One-shot effects.** Send them as an immediate `zfx` broadcast, not inside the snapshot: `impact`, `breach`, `burst`, `roar`.
  - Clients play the VFX/SFX, add hazards locally, and the impacted player applies `damageVitals` itself, the same way bites work today.
  - Breaches still arrive authoritatively through `zsnap.d`.
- **Vitals stay local** to each player, like HP today. Broadcast only what others render (alive, downed, maybe a health bucket) on the existing world presence/broadcast. Never send vitals per tick.
- **Low frequency (loot).** Do container takes the same way as `zloot`: optimistic locally, `zloot {c: containerId, u: uid}` to the host, host broadcasts changes, plus a periodic full resend for late joiners.
  - Respawns are derived from the match clock, so they need no extra traffic.
  - Container contents are seeded from `(mapSeed, containerId, refill time)`, so the host only sends *taken* uids.
- **Match state.** Broadcast can't prove who sent a message, so the admin/mod gate must live in Postgres.
  - Add a `zombie_matches (space_id pk, phase, started_by, started_at)` table. Its RLS lets `space_members.role in ('owner','admin','moderator')` update it.
  - Clients read it through `postgres_changes`: low frequency, which is fine.
  - Every client computes `difficultyAt((now - started_at)/1000)` locally. A promoted host resumes the same curve with no handoff.
  - Database Manager owns this migration.
- **Host handoff gap.** `adopt()` resets ability state, because snapshots don't carry it. A charger mid-dash simply stops. That's acceptable.
- **Rendering.** The client sim stays in the RAF loop, using `FixedStep` for the host sim and interpolating with `alpha`. Network handlers only write into buffers that the next frame reads. No React state per snapshot: the HUD stays on its existing change-key throttle.

## 5. Integration checklist (next steps)

1. `buildZombieGrid(mapConfig, buildings)`: rasterise current walls, furniture and building footprints into a `TileGrid`.
2. `WorldGame`: when `space.mode === 'zombie'`, own a `FovResult` + `FovMaskRenderer`, recompute on tile or facing change, render after `renderList`, and `dispose()` in teardown.
3. `ZombieSyncService` (`lib/services/zombieSync.ts`): channel, host election, snapshot/event handlers, `removeChannel` on teardown.
4. `zombieSim.ts` (pure): state machine, flow field, noise BFS, tick(dt) → delta. Unit-test it the same way as `fov.test.ts`.
5. Migration: `spaces.mode`, `zombie_entrances` + RLS (guests are `auth.users`, so policies keyed on `auth.uid()` membership work for them).
6. HUD: noise meter, health, an "Enter/Exit" prompt for entrances (reuse `DoorPrompt`), Neo-brutalist tokens.
