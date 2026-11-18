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

## 4.7 Day / night cycle (implemented)

- **Clock** (`survival/daycycle.ts`):
  - 1 real hour is 1 game day, and a match starts at 08:00. It is derived from `ZombieMode.elapsed`, which the host broadcasts as `el` in every snapshot, so there are no extra messages and it survives handover.
  - `elapsed` advances on real time (`ZombieFrameInput.realDt`, capped at 5 s) instead of the clamped physics `dt`, so slow devices don't stretch the day.
- **Light.** `lightAt` is 1 from 07:00 to 18:00 and 0 from 20:00 to 05:00, smoothstepped through dawn and dusk.
- **Vision** (`daylightVision`):
  - It ranges from 7 tiles / 90° / 1.5 tiles peripheral at night to 18 tiles / 120° / 2.5 by day. `ZombieVision.setDaylight` quantises it, and gas (`setViewScale`) still multiplies on top.
  - The flashlight (rebindable action `flashlight`, default G, plus a 🔦 HUD button) gives a 40° beam with daylight reach.
  - `setLights` adds lit pools: street lamps after dusk (4 tiles, seen up to 26 tiles away) and your muzzle flash (5 tiles for 0.15 s). They count as visible when you have line of sight.
- **Rendering.**
  - `ZombieMode.renderScreen(..., camera)` draws a sky-tint darkness layer with light holes: your glow, lamps, the beam and muzzle flashes. A warm wash appears at dawn and dusk, with lamp halos on top.
  - The fog mask darkens with `setDarkness` (remembered tiles go from alpha 175 to 228).
- **Night threat** (`nightThreat`):
  - Zombies are ×1.15 faster (`ZombieSim.speedScale` on the host; clients dead-reckon with the same multiplier) and the local horde target is ×1.3.
  - A lit flashlight at night emits a 3-tile noise every 2 s, but only for the host's own player (clients' flashlights aren't synced).
- **HUD:** a clock chip ("Day 2 · 21:40" with phase icon) and toasts at dusk, nightfall and dawn.

## 4.8 Stores are easy to find (implemented)

- **Convenience stores** are a building kind (`convenience` in `map/city/templates.ts`).
  - Interior: the `convenienceFloor` room has a till, snack shelves and drinks fridges.
  - Looks: bright green roof, red sign, red-and-white awning stripe.
  - Stock: the biggest restocking snack and drink supply of any shop.
- **Placement.** Every suburban block with an even `bi + bj` gets one on its first lot (an open paved forecourt with a bin, no yard fence). Two more are pinned on Market Street (`overrides.ts`: Market Mini-Mart, Downtown Express), and the commercial district can roll more.
- **Names are unique.** A repeat gets its street ("FreshMart Grocery · Elm St") and then a number. The generic shops no longer include "Corner Store".
- **Shop variants.** Hardware, books, thrift, electronics, sports, diner and laundromat each have their own icon, wall colour and sign colour.
- **Signs.** Every store and landmark has `CityBuilding.sign`. `renderCityRoof` draws a storefront board (icon + name) on the street edge and a big icon roundel mid-roof.
- **Zone pill.** In the survival city it shows the building's icon and name while you're inside it.

## 4.9 Finding the way in (implemented)

Closed roofs cover the outer walls, so doors and windows used to be invisible from the street. `game/zombie/entranceCues.ts` adds two cues.

- **Roof markers.** `WorldGame` calls `ZombieMode.renderRoofEntrances(ctx, footprint)` right after drawing each roof, with the same alpha and lift offset.
  - Doors get a notch in the parapet, an awning stub toward the street, and a round icon badge on the awning (one per double door, via `entranceGroupId`).
  - Windows get a glass strip on the parapet.
  - Colour shows state: green = passable (open/broken), yellow = closed door, blue = closed window, red = locked, brown = boarded.
  - An entrance is exterior when a 4-neighbour tile has `buildingIndex === 0` (`exteriorSide`). The list is cached per building index on first use, since the layout never changes.
- **Reach highlight.** `renderWorld` draws a pulsing outline around the opening in reach (every leaf of a double door), above the fog, with a tag naming its state ("Locked", "Boarded 3/4"). The screen-fixed entrance chip in `GameCanvas` still holds the action buttons.

## 4.10 Character condition and sleep (implemented, sandbox Phase 1)

Roadmap and checklist for the whole sandbox expansion: [`survival_sandbox_roadmap.md`](survival_sandbox_roadmap.md).

- **Condition** (`survival/condition.ts`, pure): fatigue, stress, panic, boredom, unhappiness, body temperature, body weight, fitness and strength (levels on `survival/progression.ts`, shared with future skills).
  - `conditionMods(c, load)` feeds `tickVitals` through the new optional `VitalsContext.mods` (hunger, thirst, stamina regen, sprint cost) and multiplies movement speed and FOV radius.
  - `tickCondition(c, ctx)` runs once per frame in `ZombieMode.updateVitals`, after `tickVitals`. Temperature uses daylight and indoors; hypothermia / hyperthermia drain HP.
  - Strength sets the bag limit (`carryCapacity`: 14 / 20 / 26 kg at level 0 / 5 / 10). Fitness scales sprint cost and stamina recovery.
  - Consumables carry optional `fatigue` / `boredom` / `unhappiness` / `stress` deltas.
  - Local to the owner, like vitals: nothing goes on the wire. Respawn resets it.
- **Sleep** (`survival/sleep.ts` + `ZombieMode.sleepAction / wakeUp / isAsleep`):
  - Rest spots come from the city plan's existing furniture (`cityRestSpots` → `MapThemeConfig.restSpots`). In the generated city all beds are on upper floors; ground floors have sofas. Anywhere else you sleep on the floor (quality 0.55).
  - Blocked when not tired (< 25), panicked, hungry / thirsty, or with a zombie hunting within 15 tiles. Woken by damage, a hunter within 8 tiles, hunger, being fully rested, a move key, or the Get up button.
  - Asleep, your own needs run 40× faster at 15 % metabolism, healing 6 HP per game hour × quality. Movement, weapons, doors, pickups and supplies are blocked.
  - **Shared clock:** only when the host is alone in the match does `clockSkip` grow; it travels as `zsnap.sk` and every client shows the time of day at `el + sk`. Difficulty and restocks stay on `el`. With others present, the sleeper alone fast-forwards.
- **UI** (`components/world/survival/SurvivalCharacter.tsx`): moodle chips in the survival card, a character panel (P or the HUD button), a Sleep prompt by beds and sofas, and a sleep overlay. Keys: `sleep` (Z) and `character` (P) in `lib/settings/controls.ts`.
- Tests: `survival/condition.test.ts` (pure) and `zombie/character.test.ts` (wired through `ZombieMode`).

## 4.11 Injuries, zombie traits and melee (implemented, sandbox Phase 2)

- **Body** (`survival/body.ts`, pure, local to the owner): 11 parts, each with wounds (scratch / laceration / bite) and fractures.
  - `ZombieMode.takeDamage(amount, effects, source)`: `bite` rolls a part (zombies grab arms and hands) and a wound, scales damage by part (neck ×1.6, hand ×0.6), and may give the infection (`BODY.infectChance`). `impact` (charger) may break an arm or leg.
  - Open wounds bleed until bandaged and block natural healing; undisinfected deep wounds fester (sepsis stops healing and hurts). Bandages get dirty after 180 s.
  - Fractures: leg = slow, no jump or sprint (splint restores sprint); arm = weak swings and shaky aim. Painkillers ×0.3 pain for 150 s.
  - Infection: hidden incubation, then queasy (0.35), feverish (0.6, no regen), terminal (0.85, HP drain); 1.0 kills. Death while terminal leaves a corpse that rises after 15 s.
  - Treatments are consumables with `consume.treat`. Disinfectant and splints are refused (not used up) when there's nothing to treat. `C` picks bandage > splint > painkillers before food and drink.
- **Zombie traits** (`survival/zombieTraits.ts`): speed, strength, sight, hearing and toughness tiers rolled on their own RNG stream. `ZombieSim.traitOdds` is null by default (tests, social maps); `ZombieMode` sets `DEFAULT_TRAIT_ODDS`. Specials drop traits. Wire: `ZombieRow[10]` = `packTraits()`, only when not all-normal.
- **Sim states** (`ZOMBIE_STATES` appended): `search` after a lost target reaches the last sighting, then `return` home; `feed` on corpses (sight and hearing ×0.45, sated 60 s after); `down` after a shove or heavy hit (no senses or bites, gets up after ~2.5 s).
- **Corpses**: `sim.addCorpse(x, y, turnIn?)`. Host deaths add one directly; clients send `zdeath {x, y, t?}` and the host checks it against their last position. The full list travels in `zsnap.c` when it changes (and on the periodic resend).
- **Melee** (`weapons.ts`): fists, axe, bat, crowbar, pipe, hammer, knife, plank, all on hotkey 1 (`selectSlot` cycles). Each has arc, stamina, durability, crit, knockback, heavy flag and knockdown chance. A sprinting swing with a heavy weapon is a power attack. The swinger computes `meleeMultiplier` (strength, fatigue, injuries, winded, heavy, crit) and sends `zstrike {w, m, h}`; the host clamps `m` to 0.2–4. Wear is judged locally; at 0 the weapon breaks.
- **Shove / stomp** (V): `zstrike {k: 'shove' | 'stomp'}`. Shove knocks down with `0.45 × strength factor`; stomp hits the nearest downed zombie in front for 55 × multiplier.
- **Gun spread** ×(1 + panic/100) × body spread (pain, broken arm).
- **Breaks and alarms** (host, `onEntranceChanged`): any entrance that becomes `broken` emits noise (window 12, door 10). ~20 % of buildings (`isAlarmed(buildingKey)`, the entrance id prefix) have an alarm: a 25-tile noise every 2.5 s for 60 s, once per match, announced with fx `a`.
- **UI**: health section in the character panel (`SurvivalHealth.tsx`: body diagram, wounds, pain, treatment buttons), weapon wear bar and Shove button in the weapon bar, moodles `bleeding`, `pain`, `fracture`, `sick`.
- Tests: `survival/body.test.ts`, `zombie/combat.test.ts`.

## 4.12 Inventory, containers and looting (implemented, sandbox Phase 3)

- **Items** (`survival/items.ts` + `inventory.ts` `ITEM_DEFS`): consumables, weapons, ammo and 22 gear items. Each def has name, icon, category, weight, `maxStack`, `description`, and optionally `consume` or `equip` (`slot` back / outer / hands, `capacityKg`, `insulation`, `protection`). `InventoryItem` may carry `cond` (0–1) and `mag`. `CATEGORY_GROUPS` orders the inventory screen.
- **Carrying** (`ZombieMode`): weapons stay on the belt (`owned` set, one per type, wear in `durability`, rounds in `mags`), ammo in the pouch (`reserve`), worn items in `equipped`, everything else in the `bag`. `carriedWeight()` sums all four; `capacity()` = `carryCapacity(strength)` + worn bag. Each frame `bag.maxWeight` is set to what's left, so the bag can't overfill; floor guns and container takes check the total. `load > 1` slows you (`conditionMods`), with an "Overloaded" heavy-load moodle.
- **Wearing**: insulation feeds `tickCondition({ insulation })` (felt ambient temperature); protection feeds `injure(..., protection)` per covered part (outer: torso, neck, arms; hands: hands). A turned bite costs the garment 6 % condition.
- **Containers** (`survival/containers.ts` `ContainerStore`):
  - Map containers come from `MapThemeConfig.containers` (`map/city/cityContainers.ts`): every fridge, shelf, cabinet, counter, locker, desk and checkout in the city plan, table chosen by building kind, shop variant (by icon), room kind and furniture. `TABLE_RULES` sets rolls, empty chance and restock.
  - Contents are rolled lazily from `(seed, id)` with `lootMul` 1, so all clients agree without traffic. `WorldGame` seeds with `hash32('<mapTheme>:containers')`.
  - Piles (`PILE_ID_BASE`+): `ground` for drops (merged within 20 px, removed when empty), `corpse` for a dead survivor's belongings.
  - Spatial buckets (128 px) for `near()`; reach 24 px with a wall check.
- **Authority**: the host applies its own takes / puts directly. Clients send `zinv {r, c, o: 't' | 'p', it, i?}` (`c = -1`: drop at my feet). The host checks reach against the client's last position (≤ 56 px), applies, and acks in `zsnap.ia` (`[clientId, r, ok, ...takenItem]`). Takes only land in the client's inventory on an ok ack; puts are removed at once and returned on a refusal or after 6 s without an answer. Changed containers go out in `zsnap.cs` (full contents), and dirty ones are resent 40 per snapshot on the periodic resend. Host restocks emptied shop containers every 5 s check.
- **Death**: everything carried goes into a `corpse` pile (clients send it as `zdeath.i`); you respawn with a fresh axe and can go back for the rest.
- **UI** (`SurvivalInventory.tsx`): inventory panel (I), loot window (E or the Search prompt) with take / take all / put and desktop drag and drop, bottom prompt stack for Search and Sleep.
- Tests: `survival/containers.test.ts`, `zombie/inventory.test.ts`.

## 4.13 Skills, survivor creation and traits (implemented, sandbox Phase 4)

- **Skills** (`survival/skills.ts`, pure): 14 `SkillId`s on `progression.ts` levels. `trainSkill(set, skill, xp, { learnMul, combatMul, books })` applies Fast / Slow Learner, Pacifist (weapon skills only) and book multipliers. `ZombieMode.train()` announces level-ups.
  - XP sources (`SKILL_XP`): shot 0.5 + hit 2 (hits judged on the shooter's view), reload 3, connecting melee swing 1, repair 6, treatment 6 (bandage on a wound, splint, disinfect), plank 8, mend 8.
  - Effects: `aimSpreadMul` (shot spread), `reloadTimeMul`, `wearChance` (melee wear per connecting swing), `firstAidHealMul` (wound and fracture healing), `barricadeTimeMul`, `repairAmount`.
  - `SKILLS[id].practisable` is false for cooking, farming, fishing, trapping, foraging, mechanics, electrical and metalworking until their phases.
- **Skill books**: `book:<skill>:<1|2>` items (`items.ts` `SKILL_BOOK_DEFS`) with `consume.skillBook`. `useSupply` reads instead of consuming; `booksRead` holds the volumes per skill. Vol. 1 ×3 for levels 0–4, Vol. 2 ×2.5 for 5–9.
- **Repairs** (`InvAction 'repair'`): weapons with `duct_tape` (Maintenance), clothes with `thread` (Tailoring).
- **Survivor** (`survival/survivor.ts`, pure): `OCCUPATIONS` (points, starting skills / fitness / strength, items, perks `desensitized` / `hotwire`), `TRAITS` (cost, effects, mutual `excludes`), `pointsLeft`, `buildErrors`, `canAddTrait`, `survivorModifiers` (folds traits into multipliers; desensitized sets panic to 0), `startingStats`, `parseBuild` (validates stored builds).
- **Creation flow**: `WorldGame` calls `setRequireCharacterCreation(true)`. Until `createSurvivor(build)` succeeds the player isn't `ready`: not a zombie target (host), ignores damage, frozen (`moveMultiplier` 0), can't act, vitals paused. Respawn resets condition and skills and sets `ready = false` again. `zombieCreateSurvivor(build, look)` also sets the look on the player and calls `worldSync.setAvatarConfig` (one social presence re-track via the track budget; the profile avatar isn't touched).
- **Trait hooks**: tickVitals `hungerMul` / `hydrationMul`; tickCondition `learnMul` / `fatigueMul` / `panicMul` / `exposureMul`; tickBody `healMul` (× First Aid); `injure(..., infectMul)`; bite damage × `woundDamageMul`; `clothing()` adds trait protection on every part; vision scale × `visionMul`; daylight peripheral × `peripheralMul`; `capacity()` + `carryKg`. `onHurt` / `startle` panic is scaled by `panicMul`.
- **UI**: `SurvivalCreator.tsx` (name, look with `PixelAvatar` preview, occupations, traits, points; last build in `localStorage` `teemchat.survivor.v1`), character panel survivor line and Skills section.
- Tests: `survival/skills.test.ts`, `zombie/skills.test.ts`, `tests/worldSync_social.test.ts` (look re-track).

## 4.14 Crafting, building and safehouses (implemented, sandbox Phase 5)

- **Recipes** (`survival/crafting.ts`, pure): `RECIPES` with `inputs` (used up), `tools` (kept; any one per group), optional `skill`, `workbench`, `magazine`, `seconds`, `output` (`items` or a `structure`) and `xp`. `recipeStatus(r, ctx, nameOf)` lists what's missing; `craftSeconds` speeds up with the recipe's skill and a workbench (×0.6). Magazines (`mag:<id>` items, `consume.teaches`) add recipes to `knownRecipes` (reset with each new survivor) and are kept.
- **Structures** (`survival/structures.ts`): `wood_wall`, `metal_wall`, `fence`, `wood_door` are entrances (`EntranceKind` gained `wall` / `fence`, `Entrance.built` names the structure). They reuse the entrance state machine: blocked flow-field tiles at cost 8, zombies `attack_entrance` them, `hp` → `broken` (passable rubble), damage rows in `zsnap.d`. `isBarrier` walls / fences can't be opened, locked or boarded; walls block sight. `crate` and `workbench` are plain `TILE_SOLID` tiles (zombies walk around); a crate is a `crate` pile in the `ContainerStore` that survives being emptied.
- **Flow** (`ZombieMode`): `craft(id)` starts an item timer or enters placement; `targetTile()` probes 23 px from the hitbox centre in the facing direction; `placeProblem` checks `placeBlock` (map bounds, solid, map entrances, stairs, others' feet), your own hitbox, reach and other players' safehouses; `confirmPlacement` (E) runs a timed build; moving cancels. Materials are spent when the build finishes and refunded if the host refuses. `dismantleNear()` needs the structure's tools and returns part of the materials; a crate's contents spill to the ground.
- **Barricades**: `doorAction('addPlank')` needs a hammer, 1 planks and 2 nails (checked at start and end); `removePlank` needs a hammer or crowbar and returns the plank.
- **Safehouses**: `claimSafehouse()` on the building you're in (no hunters within 10 tiles; one per player). `sim.spawnBlocked` keeps spawns out of claimed footprints; only the owner can build inside.
- **Noise maker**: `consume.lure`; the host adds a lure (3 s delay, 20-tile noise every 2 s for 30 s), clients send `zstrike {k: 'lure'}` (checked against their position). Fx `n`.
- **Sync**: clients send `zbuild {r, o: 'b' | 'd' | 'c' | 'u', k, t, b, n}`; the host validates against the sender's last position and acks in `zsnap.ia`. `zsnap.bs` (all structures `[tile, kind, container?]`) and `zsnap.sh` (claims) go out when they change and on the periodic resend; clients reconcile (`applyBuiltRows`) before entrance rows.
- **UI**: `SurvivalCrafting.tsx` (crafting screen by category, Place / Make, safehouse claim), build chips in the bottom prompt stack (placing, progress, Dismantle, safehouse owner), ghost tile on the canvas.
- Tests: `survival/crafting.test.ts`, `zombie/building.test.ts`.

## 4.15 World simulation: weather, power, water, spoilage, events (implemented, sandbox Phase 6)

- **Timeline** (`survival/world.ts`, pure): everything is a function of `(worldSeed, clock)` where `worldSeed = hash32(space.id + ':world')` (`ZombieMode.setWorld`) and `clock = elapsed + clockSkip` (already synced in `zsnap.el` / `sk`). `worldAt()` → hours, day, season (7 days each, from summer), weather (6-hour epochs split into seeded 3–6 h blocks; winter rain → snow; no afternoon fog), `WEATHER_FX` (vision, gloom, precipitation, zombie hearing, temperature), outdoor temperature, `power` / `water` (seeded shut-off hours, `WORLD.powerOffDays` / `waterOffDays`), helicopter position (`helicopterPlan`), lightning flash. `lightningBetween()` counts strikes for host thunder. `indoorTemp(outdoor, powered)`.
- **Utilities** (`survival/utilities.ts`, pure): map fixtures (`MapThemeConfig.fixtures`, from `cityFixtures(plan)`: stoves, kitchen counters → taps, toilets, fuel pumps) and stateful structures `generator` `[fuel, on, condition]`, `rain_collector` `[water]`, `campfire` `[seconds]` (appended to `STRUCTURE_KINDS`). `tickUtility`, `applyUtilityAction` (`UTILITY_ACTIONS` wire order), `utilityActions`, `sanitizeState` / `wireState` (rounded, so drift doesn't resend).
- **Power**: `poweredAt(x, y)` = mains, or a running generator within 12 tiles. Gates street lamps (vision lights and rendering), burglar alarms, stoves (heat for cooking), fuel pumps and indoor heating. Running generators add a 14-tile noise every 3 s (host).
- **Water and fire**: taps (while the mains run) drink / fill empty bottles; toilets give tainted bottles (3 per tank per player after the shut-off); rain collectors fill with outdoor precipitation; campfires burn 450 s per plank (3× faster in rain), light 4 tiles and warm by 14 °C within 3 tiles. Fixture actions are local (deterministic); utility actions go to the host as `zbuild {o: 'g', t, a, k: electrical}` with spend-then-ack / refund (`pendingInv` op `utility`).
- **Spoilage** (`survival/spoilage.ts`): `InventoryItem.rot` is the item's birth on its place's aging clock (bag / ground: game hours; fridge: `fridgeClock`, ×0.15 until `powerOffHour`). `ContainerStore.agingClock` rebases on `take` / `put`; seeded starting age per container (separate RNG stream); restocks age from now. Perishables only stack with the same batch; `ItemRow` carries rot as a 5th field (×10, `-1` placeholders for cond / mag). `spoilPenalty` for stale / rotten food; eating picks the oldest non-rotten stack.
- **Body**: `CharacterCondition.wet` (rain / snow outdoors, dries indoors) chills by up to 8 °C and halves clothing warmth; `ConditionContext.ambient` / `precipitation`; `ConsumableEffect.warmth` (hot food) and `leaves` (empty bottle).
- **Host events** (`updateWorldHost`): utilities tick on game hours, thunder noise near players, helicopter noise (30 tiles every 2 s), distant gunfire every 4–8 min (fx `g`, toast within 60 tiles), silent migration noise 45–70 tiles out every 5–10 min. `ZombieSim.hearingMul` (quiet noises only) and `sightMul` follow the weather.
- **Rendering / HUD**: `renderWeather` (gloom, fog haze, rain streaks / snow, lightning, helicopter shadow), campfire light holes; HUD `world` (weather, °C, season, power, water, helicopter) in the clock chip, `worldAction` prompt (U / `useObject`, E when nothing is searchable), `ItemHud.freshness`, `CharacterHud.wet`.
- Tests: `survival/world.test.ts`, `survival/spoilage.test.ts`, `survival/utilities.test.ts`, `zombie/worldSim.test.ts`.

## 4.16 Vehicles and food production (implemented, sandbox Phase 7)

- **Vehicles** (`survival/vehicles.ts`, pure): `VEHICLE_SPECS` (6 kinds), `spawnVehicle(spawn, seed)` (seeded condition), geometry (`corners`, `distanceTo`, `quadsOverlap`, `outlinePoints`, `exitPoints`, `trunkPoint`), `stepVehicle` (throttle / steer, top speed from engine and tyres, outline-vs-solid collision with bounce, fuel and battery), `crashDamage`, `ramDamage`, `startEngine`, `canHotwire`, `applyService` (`VEHICLE_ACTIONS` wire order), `encodeVehicle` / `decodeVehicle` (`VehicleRow`).
- **Vehicle system** (`zombie/vehicleSystem.ts`): every client builds the same cars from `MapThemeConfig.vehicles` (`cityVehicles(plan)`: the old baked `car` props, no longer drawn into chunks or added to `lowWalls`). Parked cars are stamped into the zombie grid (`TILE_SOLID`, ref-counted, only tiles that weren't solid); a driven car is unstamped. `blocksBox` (players on foot), `blockedPoint` (driving: unstamped solids + other cars' outlines), `rows` / `applyRow` (dirty vs. seed), `draw`. Trunks are `ContainerStore` spawns of kind `trunk` (id `TRUNK_ID_BASE + id`, per-container capacity, not position-indexed, moved with `moveSpawn`; reach measured to the car).
- **Driving** (`ZombieMode.updateVehicle`): the driver simulates their own car (sub-stepped, dt clamped to ≥ 0), auto-cranks on throttle, takes crash damage, rams zombies (host: `sim.ram`; client: `zstrike {k: 'ram'}`), moves the trunk, and sends `zveh` (≤ 2/s). Everyone else positions a driven car at its driver's broadcast feet; `zveh` carries angle, fuel, parts, engine and the horn. Host: engine noise every 1.5 s, horn noise, frees cars whose driver vanished (5 s). WorldGame: input drives the car, the avatar sits at `seat()` (hidden), U / E get out (`takeExitPoint`), Space honks, combat keys wait.
- **Ownership**: boarding, leaving and services go through the host as `zbuild {o: 'v', t, a, k, c}` (one driver per car; services refused while driven); acks carry parts handed back (old tyre / battery with condition). Snapshots carry `vh` rows for changed cars (all non-seed cars on resend).
- **Food** (`survival/food.ts`, pure): crops (`tickPlot`, `applyPlot`, `harvestYield`, stages), snares (`tickTrap`, `applyTrap`), fishing (`catchChance`, `castLine`), foraging (`forageChance`, `forage`, `FORAGE_TABLES`). Plots and snares are `floor` structures (walkable, `soil` placement via `MapThemeConfig.groundAt` / `cityGroundAt`) and utilities (`utilities.ts`: state in `bs`, host tick with weather / season / dice, actions `plant` (`c` = crop), `water`, `harvest`, `clear`, `bait`, `collect`; harvests and catches come back in the ack). Fishing (park fountains: `FixtureKind 'fountain'`) and foraging are personal timed activities (`startActivity`), with per-player stock / picked-over patches.
- **UI**: world chip for cars, plots, snares, fountains and foraging; `DrivingBar` and `VehiclePanel` (`components/world/survival/SurvivalVehicle.tsx`); `useObject` key (U).
- Tests: `survival/vehicles.test.ts`, `survival/food.test.ts`, `zombie/driving.test.ts`, `zombie/farming.test.ts`.

## 4.17 Sound, feedback, menu and gamepad (implemented, sandbox Phase 8)

- **Events, not audio** (`zombie/feedback.ts`): ZombieMode queues `SoundEvent`s (`sound(id, x, y, vol)`; `drainSounds()`), spawns floaters in a `FeedbackLayer` (text, blood, spark, dust; drawn last in `renderWorld`), feeds a trauma-style `Shake` (`shakeOffset()` read by WorldGame's camera translate), and logs every toast in a `NoticeLog` (HUD `toasts`, the newest three within the toast time; `log` while the menu is open). New effects (`fx` with age 0) make their sound once on every client, so host-made and snapshot effects sound the same. `ambience()` reports rain, wind, shelter, your engine, heartbeat, and nearby helicopter / generator / fire.
- **Audio** (`zombie/audio/survivalAudio.ts`): `SurvivalAudio` builds everything from oscillators and a noise buffer (no files, like `lib/utils/callSounds.ts`). `play(events, listener)` places one-shots with `spatialMix` (per-sound range, quadratic falloff, pan by x); `setAmbience` drives looping buses. Started by `unlock()` on the first key / pointer / joystick input (browser autoplay rules); stopped when survival ends.
- **Settings** (`lib/settings/survivalSettings.ts`): per-device localStorage (`teemchat.survival.settings.v1`), read after mount in GameCanvas, applied via `WorldGame.zombieSetSurvivalSettings` (audio levels, `setFeedback({shake, numbers})`).
- **Menu** (`components/world/survival/SurvivalMenu.tsx`, key `map` / M): Map (cached 1 px-per-tile image from `groundAt` + building footprints, `game/map/mapImage.ts`; markers from HUD `map`, only built while the menu is open), Log, Settings, Controls (bindings + `PAD_LABELS`).
- **Gamepad** (`lib/input/gamepad.ts`, pure `readPad`): WorldGame polls `navigator.getGamepads()` each frame; left stick → movement (or driving), right stick → aim, buttons are dispatched as their bound key's keydown / keyup so every context rule (doors, vehicles, placement) applies.
- Tests: `zombie/feedback.test.ts`, `zombie/polish.test.ts`.

## 4.18 Persistence, world rules, multiplayer hardening (implemented, sandbox Phase 9)

- **Tables** (`supabase/migrations/20261119_survival_persistence.sql`): `survival_world_saves` (space, slot 0/1, seq, version, state jsonb; read / write by anyone who may play there: members, or public / unlisted spaces, minus banned users; delete: admins), `survival_player_saves` (space, user; owner only), `survival_rules` (space; read by players, write by owner / admins). Size checks on the jsonb columns. Not in `supabase_realtime`.
- **Format** (`zombie/persistence.ts`, pure): `WorldSave` = full snapshot (`exportWorld`: every zombie, dirty entrances / containers / vehicles, built rows with state, claims, corpses, taken loot) + elapsed / skip / alarms. `PlayerSave` = the survivor (`exportPlayer` / `importPlayer`, values clamped on import). `validateWorldSave`, `validatePlayerSave`, `pickWorldSave` (newest valid slot; next seq), `slotFor`.
- **Service** (`lib/services/survivalSave.ts`): `SurvivalSaveService` over a `SaveStore` (Supabase by default), serialised writes, fail-soft statuses (`lastWorld`, `lastPlayer`, `worldReady` — the host only writes after a successful read). WorldGame: `startSaves` (rules, world → `offerWorldSave`, survivor → `importPlayer` while `setLoadingSurvivor`), `tickSaves` (autosave, permadeath via `takeDeath`), `flushSaves` (visibility hidden, dispose).
- **Loading the world**: `offerWorldSave` keeps it pending; it's imported only if this client becomes host before any other host's snapshot arrived (`hadHostState`). `importWorld` runs `applySnapshotData` (the client path), marks everything dirty, resets the utility clock (no catch-up), then `sim.adopt()`. Non-hosts keep `worldClock` current so promotions don't catch up either.
- **Rules** (`survival/balance.ts`): `WorldRules`, `PRESETS`, `sanitizeRules`, `applyRules` (folded into `difficulty` each frame), `WEATHER_BIAS`. Used by bites (strength), `injure` (infection), vitals (hunger / thirst), condition (fatigue), `train` (XP), strikes / shots / ramming (player damage), `sim.speedScale` (speed), respawn timers, `worldAt` / `powerOffHour` (outage days, weather), and the host's clock (`clockSkip` += time speed). Host sends `zsnap.cfg`; clients sanitise and use it. Admin edits: `zombieSaveRules` → DB → `announceRulesChanged` (`zbuild {o: 'r'}`) → host reloads from the DB.
- **Multiplayer**: shared sleep (`zbuild {o: 's', a}`; host `everyoneAsleep` against the channel member count; `zsnap.sl`), `HostGuard` token buckets on every client request (`zombie/hostGuard.ts`), `netStats()` for the overlay.
- **UI**: menu World tab (`SurvivalWorld.tsx`: presets, custom sliders, save status, Save now), `PerfOverlay`, "Looking for your survivor…" card, sleepers line in the sleep overlay.
- Tests: `zombie/persistence.test.ts`, `zombie/saveLoad.test.ts`, `zombie/perf.test.ts`.

## 5. Integration checklist (next steps)

1. `buildZombieGrid(mapConfig, buildings)`: rasterise current walls, furniture and building footprints into a `TileGrid`.
2. `WorldGame`: when `space.mode === 'zombie'`, own a `FovResult` + `FovMaskRenderer`, recompute on tile or facing change, render after `renderList`, and `dispose()` in teardown.
3. `ZombieSyncService` (`lib/services/zombieSync.ts`): channel, host election, snapshot/event handlers, `removeChannel` on teardown.
4. `zombieSim.ts` (pure): state machine, flow field, noise BFS, tick(dt) → delta. Unit-test it the same way as `fov.test.ts`.
5. Migration: `spaces.mode`, `zombie_entrances` + RLS (guests are `auth.users`, so policies keyed on `auth.uid()` membership work for them).
6. HUD: noise meter, health, an "Enter/Exit" prompt for entrances (reuse `DoorPrompt`), Neo-brutalist tokens.
