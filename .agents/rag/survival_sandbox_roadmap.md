# Survival Sandbox Roadmap (Zomboid-style expansion)

Living checklist for turning Zombie Survival spaces into a deep survival sandbox.
The city map (`next-app/src/game/map/city/`) is **fixed and must not be regenerated or replaced**: every phase builds on top of it.

Legend: `[x]` done and tested · `[~]` partial (what is missing is noted) · `[ ]` pending

---

## 1. Technical assessment (2026-11-17)

### Stack and architecture

| Concern | What exists |
| :--- | :--- |
| Engine | Custom HTML5 Canvas 2D engine (`WorldGame.ts`, RAF loop), Next.js 16 + React 19 + TypeScript |
| Survival controller | `game/zombie/zombieMode.ts` (`ZombieMode`): owns vision, horde, weapons, loot, vitals and the HUD model. `WorldGame` forwards input and draws what it returns |
| Pure survival modules | `game/zombie/survival/`: `vitals.ts`, `daycycle.ts`, `difficulty.ts`, `inventory.ts`, `specials.ts`, `factions.ts`, `session.ts`, `types.ts`. DOM-free and unit-tested |
| Map | `zombie_city`: 420 × 270 tiles (16 px), generated from a **fixed seed** in `map/city/cityPlan.ts`, adapted by `map/city/cityMap.ts`, streamed in 512 px chunks. Buildings have 1–4 floors (upper floors live in an off-map band), rooms, furniture (`bed`, `sofa`, `fridge`, shelves…), doors and windows |
| Tile grid | `zombie/grid.ts` + `zombieGrid.ts`: SOLID / OPAQUE / INTERIOR / ENTRANCE flags, building index, stairs portals |
| Player controller | `WorldGame` (keyboard via rebindable `lib/settings/controls.ts`, touch joystick, click-to-move), 12 × 10 survival hitbox, jumping over low walls |
| Zombie AI | `zombieSim.ts`: idle / wander / investigate / chase / attack / attack_entrance, Dial flow field, noise BFS through walls and doors, spatial hash separation. Specials (charger, bloater, dreadnought) in `specials.ts` |
| Vision | Symmetric shadowcasting FOV cone + fog mask (`fov.ts`, `fovMask.ts`, `zombieVision.ts`), daylight / flashlight / lamps |
| Combat | Fire axe melee + 5 firearms (`weapons.ts`), hitscan bullets on the grid, noise per shot, reload, ammo pouch |
| Loot | Seeded floor loot per building kind (`map/city/cityLoot.ts`), walk-over pickup, restocking shops, 12-slot / 20 kg supply bag |
| Doors / windows | Open / closed / locked / barricaded / broken state machine (`entrances.ts`), host-validated |
| Multiplayer | Host-authoritative client over Supabase Realtime (`lib/services/zombieSync.ts`): host election with epochs, ~3 Hz snapshots, client strikes / shots / doors / loot. Vitals are local per player |
| Persistence | **None** for survival state. The match clock and horde live only while the space has players |
| UI | Survival HUD inside `game/GameCanvas.tsx` (health, hunger, thirst, stamina, effects, weapon bar, supplies, clock, entrance chip, toasts) |

### Implemented vs. missing (per brief section)

- **Already implemented:** zombie detection by sight and sound, state machine, door / window / barricade attacks, hordes and waves, melee + firearms with noise, loot by building type, day / night, hunger / thirst / stamina, multiplayer horde sync.
- **Partially implemented:** health (single HP pool, no body parts), inventory (bag only for consumables, no containers UI), time (no sleep), zombie variants (specials only, no per-zombie stat randomisation), population (local horde target, no regions / migration).
- **Missing:** fatigue, sleep, moodles (stress, panic, boredom, unhappiness), body temperature, body weight, fitness / strength, infection, body-part injuries, containers, crafting, skills, character creation, building, utilities, weather, vehicles, farming, save / load.

### Integration decisions

- Extend `ZombieMode` and the `survival/` modules; do not fork a second controller.
- New character systems are **pure modules** (`survival/condition.ts`, `survival/progression.ts`) ticked by `ZombieMode.updateVitals`, so they can later run on a Node authority unchanged.
- Character state stays **local to its owner**, like vitals today. Only world-level effects (the clock) cross the wire.
- Map data is read, never rewritten: new systems consume `MapThemeConfig` fields derived from the existing plan (for example `restSpots` from `CityFloor.furniture`).
- Refactors needed later: `GameCanvas.tsx` HUD is large; new panels go in `components/world/survival/` instead of growing it further.

---

## 2. Checklist

### Phase 1 — Core foundation
- [x] Project inspection and technical assessment (this file)
- [x] Existing map integration: beds and sofas from the city plan become rest spots (`MapThemeConfig.restSpots`)
- [x] Character data model (`CharacterCondition`): fatigue, stress, panic, boredom, unhappiness, body temperature, body weight, fitness, strength
- [x] Survival statistics tick with real effects on movement, stamina, vision, metabolism and health
- [x] Endurance: existing stamina now scaled by fitness, carried load, temperature, stress and unhappiness
- [x] Carry capacity from strength (bag max weight)
- [x] Fitness / strength XP and levels (sprinting, melee swings, heavy carrying)
- [x] Food and drink also change fatigue, boredom, unhappiness and stress
- [x] Time progression: sleep fast-forwards the shared clock when you are alone in the match (`zsnap.sk`)
- [x] Basic interactions: sleep in a bed / on a sofa / on the floor, wake up (manually, rested, threatened or hurt), character panel
- [x] Moodles in the HUD (shown only when active)
- [~] Multiplayer sleep: the sleeper fast-forwards their own needs, but the shared clock only skips when they are alone. Pending: "everyone asleep" vote (Phase 9)
- [x] Health per body part, injuries and infection (done in Phase 2)

### Phase 2 — Zombie and combat
- [x] Body-part damage (11 parts): scratches, lacerations, bites, bleeding, fractures, pain, festering wounds
- [x] Treatment: bandage (worst wound first, dirty bandages), disinfectant, splint, painkillers
- [x] Infection from zombie wounds: hidden incubation → queasy → feverish → terminal → death; the body rises as a zombie
- [x] Zombie traits per zombie (speed, strength, sight, hearing, toughness; configurable odds), synced so clients dead-reckon sprinters
- [x] New states: search (lost target), return (walk home), feed (corpses, distracted), down (knocked over)
- [x] Corpses: player deaths (host and clients via `zdeath`) leave bodies that draw feeders; synced in `zsnap.c`
- [x] Melee: 7 weapons + fists, durability (breaks), stamina per swing, crits, knockback, power attack (sprint + heavy weapon)
- [x] Shove (V) knocks zombies down; stomp finishes downed ones
- [x] Panic, pain and a broken arm widen gun spread; strength, fatigue, injuries and stamina scale melee damage
- [x] Broken doors / windows make noise; ~20 % of buildings have an alarm that wails for a minute
- [x] Health panel (body diagram, wounds, treatment buttons), weapon wear bar, shove button, new moodles
- [~] Zombies attacking other survivors: they already hunt every player in the match; NPC survivors don't exist yet
- [ ] Gunshot / horn noise for vehicles (Phase 7), alarms tied to electricity (Phase 6)

### Phase 3 — Inventory and looting
- [x] Item database: every item has name, description, icon, category, weight, stack limit; worn / weapon items carry condition (and magazine)
- [x] 12 categories (food, drinks, weapons, ammo, medical, clothing + bags, tools, materials, electronics, farming, vehicle parts, books + misc), 24 new items
- [x] Carry weight = bag + weapons + ammo + worn items; capacity = strength + worn bag; over the limit slows you
- [x] Wearables: bags (+6 / 9 / 13 kg), jackets and gloves (warmth into body temperature, bite protection that wears down)
- [x] Books and magazines cure boredom
- [x] Inventory screen (I): grouped by category, inspect, use, wear / take off, hold, drop, split, destroy (confirm)
- [x] 1,762 searchable containers from the city's existing furniture, seeded per container (no traffic until changed), 24 themed loot tables by building, shop type, room and furniture, configurable rolls / empty chance / restock
- [x] Loot window (E): take, take all, put, drag and drop between columns (desktop)
- [x] Dropped items make ground piles; your body keeps everything you carried
- [x] Host-authoritative transfers (`zinv` + acks), conflict-safe, reach-checked, with timeouts; container state synced in `zsnap.cs`
- [~] Persistence across restarts (containers survive while the match runs; saving is Phase 9)
- [~] Library / warehouse loot: the city has no such buildings (the map is fixed); the bookshop and back-room storage cover them

### Phase 4 — Skills and progression
- [x] 14 skills on `survival/progression.ts` (XP, levels, level-up toasts), shown in the character panel
- [x] Practised now: Aiming (shots / hits), Reloading, Maintenance (melee hits, tape repairs), First Aid (treatments), Carpentry (boarding up), Tailoring (mending with thread); each improves its activity
- [~] Cooking, Farming, Fishing, Trapping, Foraging, Mechanics, Electrical, Metalworking: levels, occupations and books work; practising them comes with their phases (5–7)
- [x] Skill books (Vol. 1: levels 0–4 ×3, Vol. 2: 5–9 ×2.5), kept after reading, placed in themed loot
- [x] XP multipliers: Fast / Slow Learner, Pacifist (weapon skills), books
- [x] Repairs: duct tape on weapons, thread on clothes
- [x] Character creation on entering a survival space and after every death: name, look (gender presentation, skin, hair, facial hair, clothes), 13 occupations, 26 point-based traits with exclusions; last build remembered on the device
- [x] Look reaches other players via one presence re-track (`worldSync.setAvatarConfig`); the profile avatar is untouched
- [ ] Recipe unlocks (moved to Phase 5 with crafting)
- [ ] Burglar hotwiring (perk stored; vehicles are Phase 7)

### Phase 5 — Crafting and base building
- [x] 15 recipes (materials used up, tools kept, skill level, workbench, time, result) across Carpentry, Metalworking, Electrical, Tailoring, Medical; crafting trains the recipe's skill
- [x] Crafting screen (K) showing available and unavailable recipes with exactly what's missing
- [x] Recipe unlocks: 3 recipe magazines (metalwork, electronics, sewing), kept after reading; skill-gated recipes
- [x] Buildable: wooden wall, metal wall, fence, wooden door (open / lock / board), crate (storage), workbench (faster crafting, needed for metalwork)
- [x] Placement on the tile you face (ghost, E / Build here), timed construction, dismantling with tools for some materials back
- [x] Zombies route to and batter down walls, fences and doors (health, cracks, rubble); built over again
- [x] Barricades now cost a plank + 2 nails and need a hammer; pulling a plank returns it
- [x] Safehouse claims: one per survivor, no zombie spawns inside, only the owner builds there
- [x] Host-authoritative builds / dismantles / claims (`zbuild` + acks with refunds), synced lists (`zsnap.bs`, `zsnap.sh`)
- [x] Noise maker (electrical craft) to lure zombies
- [ ] Floors, stairs, roofs: the city's buildings and floors are fixed map data; new levels would need a map-layer system (not planned)
- [ ] Built windows; rain collectors and generators (Phase 6, they need weather and power); cooking (Phase 6)
- [ ] Structures outlast the match only with saving (Phase 9)

### Phase 6 — World simulation
- [x] Deterministic world timeline from (space seed, match clock): seasons (a week each), weather blocks, power and water shut-offs, helicopter flights, lightning; no network traffic for any of it
- [x] Electricity: mains power fails on a seeded hour of days 2–4; street lamps, alarms, stoves, fuel pumps and indoor heating need it
- [x] Generators (found loot, set up with Electrical 1): fuel, wear, repair, on / off, loud hum, power within 12 tiles
- [x] Water: taps run until a seeded hour of days 3–5; toilet tanks give a few tainted bottles; rain collectors fill outdoors in rain / snow; empty bottles are kept and refilled
- [x] Weather: clear, cloudy, fog, rain, storm, snow (winter); cuts your view and zombies' sight, rain masks quiet noises, thunder draws zombies; rendered (gloom, rain / snow, fog, lightning)
- [x] Temperature: outdoor air by season, day / night and weather; indoor air heated only with power; wetness chills you and halves clothing warmth; campfires warm you
- [x] Food spoilage: fresh / stale / rotten with penalties (food poisoning); fridges slow it until the power fails
- [x] Cooking (Cooking skill now practisable): boil water, cook meat, hot soup, at a working stove or a campfire
- [x] Events: helicopter fly-overs (days 1–3) pull zombies along, distant gunfire, silent horde migrations, thunder; burglar alarms only with power
- [x] HUD: weather / temperature / power chip, world action prompt (U), freshness tags, wetness on the character sheet
- [ ] Generators don't keep fridges cold (fridge aging follows the mains timeline only)
- [ ] Toilet tanks and fuel pumps are tracked per player (not synced); fuel pumps never run dry
- [ ] Vehicle fuel use waits for Phase 7; weather / power state isn't saved between matches (Phase 9)

### Phase 7 — Vehicles and food production
- [x] The map's 312 parked cars are drivable vehicles in the same spots: sedans, pickups, vans, box trucks, police cars, ambulances (seeded fuel, engine, battery, tyres, panels, windows, keys)
- [x] Enter / drive / exit (U or E; W / S / A / D or the joystick; Space horn), passengers, arcade physics against walls, fences, buildings and other cars; crash damage and driver injury
- [x] Fuel (litres, burned by distance and idling), gas cans, siphoning, filling up at powered fuel pumps; battery charge, starting failures on worn engines, hotwiring (Burglar, or Electrical 1 + Mechanics 2)
- [x] Inspect panel: engine, battery, four tyres, doors / panels, windows; fit spare tyres and batteries (old parts come back with their wear), repair the engine (Mechanics), tape windows, weld panels
- [x] Trunks: per-vehicle containers (capacity by kind, seeded loot: police and ambulance kits)
- [x] Engine and horn noise attracts zombies; cars knock down / kill zombies; zombies claw at the windows instead of the driver; parked cars block zombies and players
- [x] Headlights at night
- [x] Farming: dig plots in grass / dirt outdoors (shovel), four crops with seasons, water (bottles and rain), health, frost, growth stages, rotting, harvest scaled by health and Farming
- [x] Trapping: snares, bait, catches over game hours (weather and Trapping), butchering
- [x] Fishing: rod, bait, catch odds (Fishing, twilight, rain), four fish gated by skill, spots that fish out and recover, rod wear
- [x] Foraging: grass / park / dirt, seasonal tables (berries, mushrooms, herbs, worms, branches, stones), darkness and winter penalties, picked-over patches
- [x] Food: raw / cooked fish, stews, salad, vegetables with spoil times; all skills now practisable
- [ ] Only one fishing spot (the park fountain): the city has no ponds or rivers; adding water to the map is a separate decision
- [ ] Bicycles / motorbikes, towing, vehicle keys as items, locked cars

### Phase 8 — UI and polish
- [x] Sound: 37 synthesized one-shots (gunfire by calibre, swings, hits, groans, doors, glass, alarms, thunder, horns, crashes, pickups, eating, crafting, level-ups…) placed in stereo by distance; ambience loops (rain / snow, storm wind, your engine, heartbeat at low health, helicopter, generators, campfires), muffled under a roof
- [x] Visual feedback: floating damage numbers (crits highlighted), "+N item" pickups, level-up text, blood / spark / dust particles, screen shake on hits, gunfire, crashes and bursts
- [x] Notifications: up to three stacked toasts (newest last, repeats merged) and a notification log
- [x] Survival menu (M, or the map button): city map (ground, buildings, districts, you, survivors, vehicles, your builds, safehouse, pumps, fountain, helicopter), log, settings, controls
- [x] Settings: volume, sound effects, ambience, screen shake, floating numbers (saved per device)
- [x] Controls list with keys and gamepad buttons; gamepad support (standard mapping: sticks move / aim, buttons go through the key handlers)
- [x] Inventory search; crafting search and a "can make now" filter; trunk icons; key hints for U and M
- [x] Mobile: the clock chip keeps its five buttons on their own row
- [ ] Recorded audio / music; menus navigable with the gamepad (the pad plays the game, panels still need a pointer)
- [ ] Difficulty presets and per-server balancing settings (brief §19): need server-owned config, planned with Phase 9

### Phase 9 — Multiplayer and persistence
- [x] Tables (migration `20261119_survival_persistence.sql`, also in `schema.sql`): `survival_world_saves` (two slots per space), `survival_player_saves` (one per user per space), `survival_rules`; idempotent, RLS on all three, not in realtime
- [x] World save: clock, every zombie, doors / windows / barricades, taken loot, changed containers (incl. trunks), structures with state (generators, crops, traps, fires…), safehouse claims, changed vehicles, bodies, alarms; loaded only into a fresh host, through the snapshot path
- [x] Survivor save: build, position, vitals, condition, injuries / infection, skills, books, recipes, bag, worn gear, weapons and ammo; permadeath deletes it; the creator waits while it loads
- [x] Autosave (world every 60 s from the host, survivor every 30 s) and on tab hide / leave; two alternating slots so an interrupted or corrupt save falls back to the previous one; validation on load
- [x] Difficulty presets (Beginner, Normal, Survival, Hardcore) and Custom (population, speed, strength, detection, infection, hunger, thirst, fatigue, loot, XP, power / water days, time speed, weather, respawn, player damage), set by space admins (RLS), spread to every client by the host
- [x] Multiplayer sleep: time only speeds up once every survivor sleeps (count shown while asleep)
- [x] Host request rate limits per client and kind (dropped floods are counted)
- [x] Server-side validation path: rule changes are re-read from the database (only admins can write there); all host logic stays in pure modules that a dedicated server could run
- [x] Performance: budget tests (host frame, snapshot size, save size) and an in-game stats overlay
- [ ] The migration must be applied to the Supabase project before saving works (until then the game runs and says so)
- [ ] A dedicated authoritative server (the host is still a player's browser)

---

## 3. Phase reports

### Phase 1 (2026-11-17) — awaiting approval

- **New files:** `game/zombie/survival/condition.ts`, `progression.ts`, `sleep.ts`, `condition.test.ts`; `game/zombie/character.test.ts`; `components/world/survival/SurvivalCharacter.tsx` + `survival.module.css`.
- **Modified:** `zombieMode.ts` (condition tick, sleep, clock skip, HUD), `survival/vitals.ts` (optional `mods`), `survival/types.ts` + `inventory.ts` (consumable mood/fatigue deltas), `map/mapRegistry.ts` + `map/city/cityMap.ts` (`restSpots`, read-only), `WorldGame.ts` (sleep freeze, keys), `GameCanvas.tsx` (UI mount), `lib/settings/controls.ts` (Z sleep, P character), `lib/services/zombieSync.ts` (`sk`), `lib/icons/index.ts` (5 icons), `tests/controls_settings.test.ts`.
- **Tests:** 32 new (pure + wired). Full suite 1095/1095, lint 0 errors, production build OK. Browser check on the real city map: P panel, Z sleep by a sofa, clock fast-forward, move-key / button wake, moodles, 375 px dark mode.
- **Known limitations:** all city beds are upstairs (ground floors have sofas); sleeping only skips the shared clock when alone; condition is not saved across reloads (Phase 9); health is still one pool (body parts in Phase 2); no "panic → aim spread" or "strength → melee damage" yet (Phase 2).

### Phase 2 (2026-11-18) — awaiting approval

- **New files:** `survival/body.ts` (injuries, treatment, infection), `survival/zombieTraits.ts`, `survival/body.test.ts`, `zombie/combat.test.ts`, `components/world/survival/SurvivalHealth.tsx`.
- **Modified:** `zombieSim.ts` (traits, search / return / feed / down, corpses, shove, stomp, knockdown), `weapons.ts` (melee specs, power attack, spread multiplier), `zombieMode.ts` (wiring, host strike resolution, alarms, corpses, HUD), `lib/services/zombieSync.ts` (`zdeath`, `zsnap.c`, row traits, strike fields, `a` fx), `survival/types.ts` + `inventory.ts` (disinfectant, painkillers, splint), `survival/sleep.ts` (no sleep while bleeding / in pain), `survival/condition.ts` (body moodles), `map/city/cityLoot.ts` (gear pass on its own RNG stream: existing loot unchanged), `WorldGame.ts` (V shove, slot cycling, jump check), `lib/settings/controls.ts`, `lib/icons/index.ts`, `GameCanvas.tsx`, `SurvivalCharacter.tsx`.
- **Tests:** 44 new (19 pure, 25 sim + wired + sync). Full suite 1139/1139, lint 0 errors, build OK. Browser check on the city: traits on the live horde, melee and medicine loot present, bite wounds, bandage via the supply button, health panel, broken-leg jump block, downed zombie and corpse rendering.
- **Known limitations (Phase 2):** weapon wear is judged on the swinger's view of the horde (a swing the host resolves as a miss can still cost a point); specials ignore traits; each building's alarm can go off once per match and isn't tied to power yet (Phase 6); the host trusts a client's claimed melee multiplier within 0.2–4×; there are no NPC survivors for zombies to attack; injuries and infection reset on respawn and aren't saved (Phase 9).

### Phase 3 (2026-11-18) — awaiting approval

- **New files:** `survival/items.ts` (gear + descriptions + category groups), `survival/containers.ts` (ContainerStore, wire encoding), `map/city/cityContainers.ts`, `components/world/survival/SurvivalInventory.tsx`, `survival/containers.test.ts`, `zombie/inventory.test.ts`.
- **Modified:** `survival/types.ts` (categories, gear ids, equip spec, item condition / magazine, container kinds), `survival/inventory.ts` (item database merge, books, 24 loot tables, `addItemToBag`, `splitStack`, 40-slot weight-limited bag), `survival/condition.ts` (clothing warmth, overload penalty, overloaded moodle), `survival/body.ts` (clothing protection), `zombieMode.ts` (carry weight, equipment, containers, transfers, bodies, HUD), `lib/services/zombieSync.ts` (`zinv`, `zsnap.cs` / `ia`, items on `zdeath`), `map/mapRegistry.ts` + `map/city/cityMap.ts`, `WorldGame.ts` (E search, I inventory), `lib/settings/controls.ts`, `lib/icons/index.ts`, `GameCanvas.tsx`, `SurvivalCharacter.tsx` (prompt moved), `combat.test.ts`.
- **Tests:** 32 new (17 pure + city, 15 wired incl. multiplayer conflicts, rejections, timeouts). Full suite 1171/1171, lint 0 errors, build OK. Browser: grocery fridge and hardware shelf searched on the city map, take / take all / put back, inventory inspect, 375 px dark mode.
- **Fixed while testing:** a stack spilling into several bag stacks reused one uid (dropping or using one would hit the wrong stack).
- **Known limitations:** containers and piles live only as long as the match (Phase 9 saves them); you can't carry two of the same weapon (one per type on your belt); "Take all" grabs up to 8 stacks per press to stay inside the realtime message budget; full container resends to late joiners go 40 per snapshot; drag and drop is desktop-only (buttons everywhere).

### Phase 4 (2026-11-18) — awaiting approval

- **New files:** `survival/skills.ts` (skills, XP sources, books, effect curves), `survival/survivor.ts` (occupations, traits, build validation, modifiers, starting stats), `components/world/survival/SurvivalCreator.tsx`, `survival/skills.test.ts`, `zombie/skills.test.ts`.
- **Modified:** `zombieMode.ts` (skills + XP, repairs, skill books, survivor creation and the not-ready state, trait effects on hunger, thirst, fatigue, panic, exposure, healing, vision, hearing, protection, wound damage, infection, capacity), `survival/condition.ts` + `survival/body.ts` (trait hooks), `survival/types.ts` + `items.ts` + `inventory.ts` (skill books, thread, loot placement), `lib/services/worldSync.ts` (`setAvatarConfig`), `WorldGame.ts` (creation hooks, survivor look), `GameCanvas.tsx`, `SurvivalCharacter.tsx` (survivor line, Skills section), `SurvivalInventory.tsx` (Repair), `survival.module.css`, `combat.test.ts`, `tests/worldSync_social.test.ts`.
- **Tests:** 25 new (12 pure, 13 wired) + 1 sync. Full suite 1196/1196, lint 0 errors, build OK. Browser: creator on entry, point budget blocking an over-budget Veteran, Weak + Pacifist balancing it, Feminine look applied to the player, start, Skills panel, death bringing back "A new survivor" prefilled from the device, 375 px dark mode.
- **Fixed while testing:** switching to a feminine look kept a beard chosen earlier (the picker hides it); it's now cleared.
- **Known limitations (Phase 4):** eight skills can't be practised until their phases; recipe unlocks move to Phase 5; Burglar hotwiring waits for vehicles; in multiplayer, zombies may crowd a player who is still creating a character but can't hurt them; survivors aren't saved between visits (Phase 9).

### Phase 5 (2026-11-18) — awaiting approval

- **New files:** `survival/crafting.ts` (recipes, magazines, status, timing), `survival/structures.ts` (structure specs, built entrances, placement rules), `components/world/survival/SurvivalCrafting.tsx` (crafting screen, build prompts), `survival/crafting.test.ts`, `zombie/building.test.ts`.
- **Modified:** `entrances.ts` (wall / fence kinds, `built`, `isBarrier`), `zombieSim.ts` (`spawnBlocked`), `zombieMode.ts` (crafting, placement, construction, dismantling, barricade cost, noise makers, safehouses, host validation, sync, drawing, HUD), `survival/containers.ts` (crate piles), `survival/types.ts` + `items.ts` + `inventory.ts` (planks, rags, metal sheet, electronics scrap, blowtorch, noise maker, magazines, loot), `lib/services/zombieSync.ts` (`zbuild`, `zsnap.bs` / `sh`, lure strikes, `n` fx), `WorldGame.ts` (K, E to build), `lib/settings/controls.ts`, `lib/icons/index.ts`, `GameCanvas.tsx`, `SurvivalInventory.tsx`, `survival.module.css`, `zombieMode.test.ts` + `skills.test.ts` (boarding now needs a kit).
- **Tests:** 21 new (6 pure incl. a zombie battering a built wall, 15 wired incl. multiplayer builds, refunds, dismantles, claims). Full suite 1217/1217, lint 0 errors, build OK. Browser: crafting screen with live counts and missing items, Place → placement ghost → E → wall built (progress, materials, XP), walls / fence / crate built in all four directions, structures drawn (canvas pixel check), no console errors.
- **Fixed while testing:** the build target was too close to your own hitbox, so building facing down (and sometimes right) was refused as "Someone is standing there"; the target now sits clear of the hitbox and your own overlap uses the real hitbox.
- **Known limitations (Phase 5):** no new floors, stairs or roofs (fixed map levels); no built windows; rain collectors, generators and cooking wait for Phase 6; structures and claims last only for the match (Phase 9); dismantling has no ownership check (anyone can take any structure down); crates and workbenches aren't attacked by zombies (they walk around them).

### Phase 6 (2026-11-18) — awaiting approval

- **New files:** `survival/world.ts` (deterministic seasons, weather, shut-offs, helicopter, lightning), `survival/spoilage.ts` (aging clocks, freshness, penalties), `survival/utilities.ts` (fixtures, generators, rain collectors, campfires), tests `survival/world.test.ts`, `survival/spoilage.test.ts`, `survival/utilities.test.ts`, `zombie/worldSim.test.ts`.
- **Modified:** `zombieMode.ts` (world update, power checks, weather vision / hearing, temperature and wetness inputs, eating with spoilage and leftovers, fixture and utility actions, utility sync, host events, weather rendering, campfire light, HUD), `zombieSim.ts` (`hearingMul`, `sightMul`), `survival/condition.ts` (wetness, ambient, warmth), `survival/containers.ts` (rot on the wire, rebasing, seeded ages), `survival/inventory.ts` + `items.ts` + `types.ts` (tainted water, raw / cooked meat, soup, empty bottle, full gas can, generator, perishable stacking, loot), `survival/crafting.ts` (Cooking recipes, campfire, rain collector, generator, heat), `survival/structures.ts` (3 utility structures), `survival/skills.ts` (Cooking practisable), `map/city/cityMap.ts` + `mapRegistry.ts` (fixtures), `WorldGame.ts` (`setWorld`, U / E use), `lib/services/zombieSync.ts` (`zbuild` `g`, utility state in `bs`, fx `g`), `lib/settings/controls.ts` (`useObject`, U), `lib/icons/index.ts` (weather, power, water, cooking, helicopter icons), `GameCanvas.tsx` + `.module.css` (weather chip; mobile clock wraps beside the survival card), `SurvivalInventory.tsx`, `SurvivalCharacter.tsx`, `survival.module.css`, `crafting.test.ts` + `skills.test.ts` (wire order and Cooking now practisable).
- **Tests:** 42 new (29 pure, 13 wired incl. wetness, storms dulling zombie senses, taps before / after the shut-off, toilet tanks, spoilage and food poisoning, campfire cooking, generator power and noise, client refuel / start through the host and refund). Full suite 1259/1259, lint 0 errors, build OK. Browser (city map): 383 fixtures found (198 taps, 135 stoves, 46 toilets, 4 pumps); tap fills bottles via the prompt and U; storm renders (gloom, rain, toast, chip); generator and campfire drawn and ticking; after the power cut all 636 street lamps go dark while a campfire still lights its area; HUD checked at 375 and 320 px.
- **Fixed while testing:** the mobile clock chip ran under the survival card (worse with the weather tag), so it now wraps beside the card; mid-width toasts drop below the clock; clear nights show a moon; the generator smoke never draws with a negative radius; kitchen counters are both tap and container, so world actions got their own key (U).
- **Known limitations:** generators don't cool fridges (fridge aging follows the mains timeline); toilet tanks and fuel pumps are per player and pumps never run dry; zombie migration is a far-off noise rather than a scripted horde; weather, power and spoilage restart with each match (Phase 9); vehicles that use fuel arrive in Phase 7.

### Phase 7 (2026-11-18) — awaiting approval

- **New files:** `survival/vehicles.ts` (specs, seeded condition, physics, damage, starting, services, wire), `survival/food.ts` (farming, trapping, fishing, foraging), `zombie/vehicleSystem.ts` (grid stamping, collisions, sync rows, drawing), `components/world/survival/SurvivalVehicle.tsx` (driving bar, inspect panel), tests `survival/vehicles.test.ts`, `survival/food.test.ts`, `zombie/driving.test.ts`, `zombie/farming.test.ts`.
- **Modified:** `zombieMode.ts` (vehicles: boarding, driving, exits, trunks, services, hotwiring, ramming, window bites, headlights, sync; food: plots, snares, fishing, foraging, timed activities; world targets and HUD), `zombieSim.ts` (`ram`), `survival/utilities.ts` (plots and snares as utilities, harvest / catch hand-over, fountain fixtures), `survival/containers.ts` (trunk kind, per-container capacity, moving spawns), `survival/crafting.ts` (Outdoors category, recipe input alternatives, 8 recipes), `survival/structures.ts` (`floor` structures, soil placement), `survival/items.ts` + `inventory.ts` + `types.ts` + `spoilage.ts` (25 items, loot tables, spoil times), `survival/skills.ts` (Fishing, Trapping, Foraging, Mechanics, Electrical and Metalworking now practisable), `survival/survivor.ts`, `map/city/cityMap.ts` + `mapRegistry.ts` (vehicles from parked cars, ground lookup, fountains; cars no longer baked or low walls), `WorldGame.ts` (driving input, seat, exits, horn, hidden occupants), `lib/services/zombieSync.ts` (`zveh`, `vh`, `zbuild` `v`, ram strikes), `lib/icons/index.ts`, `GameCanvas.tsx` + `.module.css`, `SurvivalInventory.tsx`, `survival.module.css`.
- **Tests:** 50 new (28 pure, 22 wired incl. driving, parking stamps, exits, hotwiring, empty tank, window bites, ramming, negative / long frames, trunks, tyre swaps, refuelling, multiplayer boarding / driving / single driver / driver timeout, plots to harvest, soil rule, client harvest via the host, snares to butchering, fishing, foraging). Full suite 1309/1309, lint 0 errors, build OK. Browser (city map): 312 vehicles with trunks; the chip by a parked sedan; U to get in, the engine starts, W drives (the avatar rides along), S brakes, U gets out beside it; driving bar shown.
- **Fixed while testing:** the trunk window closed at once (reach was measured to the trunk point, now to the car); a negative frame time (seen with synthetic timestamps) could throw a car backwards, so car physics clamps and sub-steps every frame; on phones the clock chip now always puts its buttons on their own row.
- **Known limitations:** the city has one fountain and no ponds or rivers, so fishing has a single spot; a driven car's position for others follows the driver's movement broadcasts (smooth) but its angle arrives twice a second; passengers ride at the car's centre; cars don't collide with players on foot while driven (they pass through people); fuel pumps never run dry; vehicles, crops and traps reset with the match (Phase 9).

### Phase 8 (2026-11-18) — awaiting approval

- **New files:** `zombie/feedback.ts` (sound events, spatial mix, floaters, shake, notification log), `zombie/audio/survivalAudio.ts` (Web Audio synthesis: one-shots and ambience), `lib/settings/survivalSettings.ts`, `lib/input/gamepad.ts`, `game/map/mapImage.ts`, `components/world/survival/SurvivalMenu.tsx` (map, log, settings, controls), tests `zombie/feedback.test.ts`, `zombie/polish.test.ts`.
- **Modified:** `zombieMode.ts` (sound events at ~40 gameplay points, floaters, shake, toasts through the notice log, ambience, map / log HUD, menu flag), `WorldGame.ts` (audio unlock / play / ambience / stop, camera shake, gamepad polling, M key, map image, settings), `lib/settings/controls.ts` (`map`, M), `GameCanvas.tsx` + `.module.css` (toast stack, map button, menu, settings state, key hints, mobile chip spacing), `SurvivalInventory.tsx` (search, trunk icons), `SurvivalCrafting.tsx` (search, can-make filter), `survival.module.css`.
- **Tests:** 20 new (12 pure: placement and range, notifications, floaters, shake, settings parsing, unique default keys, gamepad sticks / buttons, map pixels; 8 wired: shot / empty / swing / hit / hurt / pickup / level-up sounds, damage numbers and blood, settings switching shake and numbers off, toast stack and log, map data, heartbeat / rain / shelter ambience). Full suite 1329/1329, lint 0 errors, build OK. Browser (city map): audio context running, all 37 sounds and every ambience loop played without errors; M opens the menu; the map draws streets, buildings, districts, vehicles and you; settings save and apply; controls list keys and pad buttons; three toasts stack and appear in the log.
- **Known limitations:** sounds are synthesized (no recorded audio or music); you only hear other players' gunfire through the zombie noise it causes, not as a sound; panels aren't navigable with a gamepad; balancing presets wait for server-owned settings (Phase 9).

### Phase 9 (2026-11-19) — awaiting approval

- **New files:** `supabase/migrations/20261119_survival_persistence.sql` (also appended to `schema.sql`), `zombie/persistence.ts` (save format, validation, slot recovery), `lib/services/survivalSave.ts` (save service and Supabase store), `zombie/survival/balance.ts` (world rules, presets), `zombie/hostGuard.ts` (request rate limits), `components/world/survival/SurvivalWorld.tsx` (World tab, performance overlay), tests `zombie/persistence.test.ts`, `zombie/saveLoad.test.ts`, `zombie/perf.test.ts`.
- **Modified:** `zombieMode.ts` (export / import world and survivor, permadeath flag, rules everywhere, shared sleep, rate-limited intake, snapshot `cfg` / `sl`, applySnapshot split, clock catch-up fixes, stats), `survival/world.ts` (rule-driven outage days and weather), `WorldGame.ts` (save lifecycle, autosave, flush on hide / leave, rules save, perf feed), `lib/services/zombieSync.ts` (`cfg`, `sl`, `zbuild` `s` / `r`), `lib/database.types.ts`, `lib/settings/survivalSettings.ts` (perf), `GameCanvas.tsx`, `SurvivalMenu.tsx`, `SurvivalCharacter.tsx`, `survival.module.css`, `survival/world.test.ts`, `.agents/rag/database_schema_and_rls.md`.
- **Tests:** 21 new (10 pure: save validation, slot fallback, the save service with failures, rules sanitising / presets / weather bias, rate limits; 8 wired: world round trip through JSON, no load over a running world, survivor round trip and permadeath, the creator waiting, hardcore rules and time speed, rules reaching clients, shared sleep, request floods; 3 performance budgets). Full suite 1350/1350, lint 0 errors, build OK. Measured: host frame median 0.74 ms (p95 1.37 ms) with 300 zombies and 4 survivors; largest snapshot 10.9 KB; world save with 400 zombies and 300 changed cars 31.5 KB in 1.3 ms. Browser (city map): World tab, presets, the save status reporting the missing tables, the creator appearing after the survivor lookup, the stats overlay (60 fps, update 1.1 ms, draw 2.6 ms).
- **Fixed while testing:** after loading a world (or being promoted to host) the utility clock caught up on the jump to the saved clock, burning two game hours of generator fuel and crop growth at once; the clock now carries over.
- **Known limitations:** the migration hasn't been applied to the Supabase project yet, so saving reports "not set up" until it is; the host is still a player's browser (no dedicated server), so validation is host-side plus RLS; survivor saves are written by their owner (like the rest of each player's own state); loot multipliers apply to restocks and respawns, not to containers' first contents (those must match on every client); fishing stock, foraged patches and toilet tanks are per player and not saved.
