import { Rect } from '../collision';
import { BuildingDefinition } from '../map/buildings';
import { renderPixelAvatar } from '../render/avatar';
import { AvatarConfig } from '@/lib/models/avatar';
import { VIS_HIDDEN, VIS_PERIPHERAL, VIS_VISIBLE } from './fov';
import { NoiseEvent, SimTarget, Zombie, ZombieSim, ZOMBIE, ZOMBIE_STATES, inArc, wallsBetween, type Corpse } from './zombieSim';
import { ZombieVision } from './zombieVision';
import { ENTRANCE_STATES, Entrance, EntranceKind, EntranceState, MAX_PLANKS, applyEntranceAction, isBarrier } from './entrances';
import { TILE_ENTRANCE, TILE_INTERIOR, TILE_OPAQUE, TILE_SOLID, inBounds, setEntrance, tileIndex, worldToTile } from './grid';
import { RECIPES, RECIPE_ORDER, craftSeconds, inputCount, recipeStatus, structureOf, type CraftContext, type RecipeCategory, type RecipeId } from './survival/crafting';
import {
  BUILD_REACH,
  PLACE_BLOCK_TEXT,
  STRUCTURES,
  STRUCTURE_KINDS,
  WORKBENCH_REACH,
  builtEntrance,
  placeBlock,
  type PlaceBlock,
  type StructureKind,
} from './survival/structures';
import {
  Side,
  badgePoint,
  drawEntranceReach,
  drawRoofDoorBadge,
  drawRoofEntranceMarker,
  entranceGroupId,
  exteriorSide,
} from './entranceCues';
import {
  AMMO_BOX,
  AMMO_NAMES,
  AmmoType,
  HEAVY_ATTACK,
  LootSpawn,
  MELEE_MUL_RANGE,
  MELEE_ORDER,
  WEAPONS,
  WEAPON_ORDER,
  WeaponId,
  castBullet,
  isMelee,
  meleeMultiplier,
  shotAngles,
  startingMag,
  type MeleeSpec,
  type WeaponSpec,
} from './weapons';
import { hash32, mulberry32 } from '../art/character/appearance';
import type {
  DoorActionType,
  EntranceRow,
  InvAck,
  ZombieBuildOp,
  ZombieDeath,
  ZombieDoorAction,
  ZombieInvOp,
  ZombieFx,
  ZombieRow,
  ZombieShot,
  ZombieSnapshot,
  ZombieStrike,
  ZombieSyncService,
} from '@/lib/services/zombieSync';
import type {
  AbilityFlag,
  Bag,
  ConsumableId,
  ContainerKind,
  DifficultyCoefficients,
  EquipSlot,
  InventoryItem,
  ItemCategory,
  ItemDefId,
  PlayerVitals,
  SpecialZombieType,
  StatusEffect,
  StatusEffectKind,
} from './survival/types';
import {
  CONTAINER_CAPACITY,
  CONTAINER_LABELS,
  CONTAINER_REACH,
  ContainerStore,
  containerWeight,
  decodeItem,
  encodeItem,
  type ContainerRow,
  type ContainerSpawn,
  type ItemRow,
} from './survival/containers';
import { CATEGORY_ORDER } from './survival/items';
import { ABILITY_FLAGS, ZOMBIE_KINDS } from './survival/types';
import { addEffect, consume, damageVitals, freshVitals, tickVitals } from './survival/vitals';
import {
  AMMO_ROUND_KG,
  BAG_SLOTS,
  ITEM_DEFS,
  addItemToBag,
  addToBag,
  bagWeight,
  freshLoadout,
  removeFromBag,
  splitStack,
  stackWeight,
  useConsumable as applyConsumable,
} from './survival/inventory';
import { difficultyAt, rollZombieKind } from './survival/difficulty';
import {
  GAME_DAY_SECONDS,
  LAMPS_ON_BELOW,
  clockLabel,
  daylightVision,
  nightThreat,
  skyTint,
  timeOfDay,
  type DayPhase,
  type TimeOfDay,
} from './survival/daycycle';
import { BLOATER, CHARGER, SPECIAL_BEHAVIORS, SpecialsDirector, effectiveDamage, isSpecial, zombieKind } from './survival/specials';
import {
  CONDITION,
  applyConsumableCondition,
  carryCapacity,
  conditionMods,
  freshCondition,
  moodlesOf,
  onHurt,
  startle,
  tickCondition,
  type CharacterCondition,
  type Moodle,
} from './survival/condition';
import { levelProgress } from './survival/progression';
import {
  START_TEXT,
  SERVICE_ITEMS,
  TIRE_LABELS,
  VEHICLE,
  VEHICLE_ACTIONS,
  VEHICLE_ACTION_LABEL,
  VEHICLE_SPECS,
  applyService,
  canHotwire,
  corners,
  crashDamage,
  decodeVehicle,
  distanceTo,
  encodeVehicle,
  engineNoise,
  exitPoints,
  ramDamage,
  startEngine,
  stepVehicle,
  type ServiceReturn,
  type VehicleAction,
  type VehicleRow,
  type VehicleSpawn,
  type VehicleState,
} from './survival/vehicles';
import { BAIT_ITEMS, CROPS, CROP_IDS, FISH, FISHING, FORAGE, castLine, forage, stageOf, type ForageGround } from './survival/food';
import { TRUNK_ID_BASE, VehicleSystem } from './vehicleSystem';
import { FeedbackLayer, NoticeLog, SILENCE, Shake, proximity, type Ambience, type SoundEvent, type SoundId } from './feedback';
import { PLAYER_SAVE_VERSION, WORLD_SAVE_VERSION, type PlayerSave, type WorldSave } from './persistence';
import { NORMAL_RULES, applyRules, sameRules, sanitizeRules, type WorldRules } from './survival/balance';
import { HostGuard } from './hostGuard';
import type { GroundType } from '../map/mapRegistry';
import { WEATHER_LABEL, gameHours, indoorTemp, lightningBetween, powerOffHour, worldAt, type Weather, type WorldState } from './survival/world';
import { ageOn, agingClock, freshnessOf, isPerishable, spoilPenalty, type Freshness } from './survival/spoilage';
import {
  ACTION_ITEMS,
  ACTION_LABEL,
  CAMPFIRE,
  FIXTURE_INFO,
  FIXTURE_REACH,
  GENERATOR,
  HEAT_REACH,
  TOILET_FILLS,
  UTILITY_ACTIONS,
  applyUtilityAction,
  generatorRunning,
  initialState,
  isUtility,
  sanitizeState,
  tickUtility,
  utilityActions,
  utilityStatus,
  wireState,
  type FixtureKind,
  type UtilityAction,
  type UtilityKind,
  type WorldFixture,
} from './survival/utilities';
import {
  SKILLS,
  SKILL_BOOKS,
  SKILL_IDS,
  SKILL_XP,
  aimSpreadMul,
  barricadeTimeMul,
  bookMultiplier,
  firstAidHealMul,
  freshSkills,
  reloadTimeMul,
  repairAmount,
  trainSkill,
  wearChance,
  type BookVolume,
  type BooksRead,
  type SkillGroup,
  type SkillId,
  type SkillSet,
} from './survival/skills';
import {
  DEFAULT_BUILD,
  OCCUPATIONS,
  TRAITS,
  buildErrors,
  startingStats,
  survivorModifiers,
  type SurvivorBuild,
  type SurvivorModifiers,
} from './survival/survivor';
import {
  BODY_PARTS,
  PART_INFO,
  bandageTarget,
  bodyMoodles,
  canTreat,
  freshBody,
  infectionStage,
  injure,
  tickBody,
  treat as treatBody,
  woundLabel,
  type BodyMods,
  type BodyPart,
  type BodyState,
  type InfectionStage,
  type WoundKind,
} from './survival/body';
import { DEFAULT_TRAIT_ODDS, PACKED_NORMAL, packTraits, traitMul, unpackTraits } from './survival/zombieTraits';
import {
  SLEEP,
  SLEEP_BLOCK_TEXT,
  WAKE_TEXT,
  nearestRestSpot,
  sleepBlock,
  wakeReason,
  type RestSpot,
  type SleepSpot,
  type WakeReason,
} from './survival/sleep';
import type { IconName } from '@/lib/icons';
import { drawIcon } from '@/game/art/drawIcon';

// ============================================================
// ZOMBIE MODE — GAME CONTROLLER
// Owns vision (FOV + fog), the zombie sim, local player health and
// melee. WorldGame only forwards input/positions and draws what this
// hands back.
// Multiplayer (host-authoritative, see zombieSync.ts):
// - host:    runs ZombieSim, applies everyone's strikes and door actions,
//            broadcasts snapshots (nearby zombies, bites, kills, entrances)
// - client:  dead-reckons zombies between snapshots, sends strikes and door
//            actions to the host (doors are applied optimistically),
//            applies bites addressed to its own clientInstanceId
// - pending: channel not ready yet; vision only (falls back to local sim)
// Health stays local to each player; only the horde is shared.
// ============================================================

export interface ZombieHud {
  hp: number;
  maxHp: number;
  alive: number;
  kills: number;
  chasing: number;
  dead: boolean;
  /** Door/window within reach, for the context chip (null when none). */
  entrance: EntranceHud | null;
  weapon: WeaponHud;
  /** Weapons carried, in hotkey order. */
  owned: WeaponId[];
  /** Short-lived pickup / status message. */
  toast: string | null;
  toastIcon: IconName | null;
  hunger: number;
  hydration: number;
  stamina: number;
  /** Sprint is locked out until stamina recovers. */
  exhausted: boolean;
  sprinting: boolean;
  /** Sprint toggle (touch) is latched on. */
  sprintLatched: boolean;
  /** Active status effects. */
  effects: StatusEffect['kind'][];
  /** Food / drink / meds in the bag. */
  supplies: SupplyHud[];
  /** Bag fill (0–1) by slots or weight, whichever is fuller. */
  bagFill: number;
  /** Whole difficulty level (rises every few minutes). */
  threat: number;
  /** Specials hunting someone right now, for the warning chip. */
  specials: SpecialZombieType[];
  /** Resting in a safe spot (indoors, nothing hunting nearby). */
  safe: boolean;
  /** "Day 2 · 21:40" */
  clock: string;
  phase: DayPhase;
  flashlight: boolean;
  /** Active moodles (condition.ts), most urgent first. */
  moodles: Moodle[];
  /** Asleep, and where. */
  asleep: { spot: SleepSpot; quality: number } | null;
  /** Bed / sofa within reach (null: you'd sleep on the floor). */
  restSpot: RestSpot['kind'] | null;
  /** Full character sheet for the character panel. */
  character: CharacterHud;
  /** Wounds, fractures and treatments for the health panel. */
  injuries: BodyHud;
  /** A searchable container within reach (for the "Search" prompt). */
  container: { label: string; kind: ContainerKind; open: boolean } | null;
  /** The open container's contents (null when no loot window is open). */
  loot: LootHud | null;
  /** Your full inventory (only while the inventory or a loot window is open). */
  inventory: InventoryHud | null;
  /** Character creation is open: not in the world yet. */
  creating: boolean;
  /** Fetching your saved survivor (the creator waits). */
  loadingSurvivor: boolean;
  /** Recipes (only while the crafting screen is open). */
  recipes: RecipeHud[] | null;
  build: BuildHud;
  survivor: SurvivorHud;
  skills: SkillHud[];
  /** Weather, temperature, season, power and water (world.ts). */
  world: WorldHud;
  /** A generator, rain collector, campfire, farm plot, snare, vehicle, tap, toilet, stove, pump or fountain within reach. */
  worldAction: WorldActionHud | null;
  /** The vehicle you're in, or inspecting. */
  vehicle: VehicleHud | null;
  /** Recent notifications, oldest first (the newest is also `toast`). */
  toasts: { id: number; text: string; icon: IconName | null }[];
  /** Notification history, newest first (only while the survival menu is open). */
  log: { id: number; text: string; icon: IconName | null; ago: string }[] | null;
  /** What the map shows (only while the survival menu is open). */
  map: MapHud | null;
  /** Multiplayer sleep: how many survivors are asleep (time only speeds up when everyone is). */
  sleepers: { asleep: number; total: number } | null;
  /** The world rules in force (difficulty preset or custom). */
  rules: WorldRules;
}

export interface MapHud {
  /** World size, px. */
  w: number;
  h: number;
  player: { x: number; y: number; a: number };
  others: { x: number; y: number }[];
  vehicles: { x: number; y: number; a: number; mine: boolean }[];
  built: { x: number; y: number; kind: StructureKind }[];
  /** Your safehouse's building footprint. */
  safehouse: { x: number; y: number; w: number; h: number } | null;
  /** Fuel pumps and fountains. */
  points: { x: number; y: number; kind: 'pump' | 'fountain' }[];
  helicopter: { x: number; y: number } | null;
}

export interface VehicleHud {
  id: number;
  label: string;
  icon: IconName;
  inside: boolean;
  driving: boolean;
  speedKmh: number;
  engineOn: boolean;
  /** Litres. */
  fuel: number;
  tank: number;
  parts: { label: string; value: number }[];
  seats: string;
  trunkKg: number;
  key: string;
  /** Repairs and part swaps you could do (outside only). */
  services: { id: string; label: string; ok: boolean; reason: string | null }[];
}

export interface WorldHud {
  weather: Weather;
  label: string;
  icon: IconName;
  /** Outdoor air, whole °C. */
  tempC: number;
  season: string;
  power: boolean;
  water: boolean;
  /** A helicopter is overhead somewhere on the map. */
  helicopter: boolean;
}

export interface WorldActionHud {
  label: string;
  icon: IconName;
  status: string;
  /** E does the first one that's ok. */
  actions: { id: string; label: string; ok: boolean; reason: string | null }[];
}

export interface RecipeHud {
  id: RecipeId;
  name: string;
  category: RecipeCategory;
  icon: IconName;
  description: string;
  /** Learned (magazine recipes start unknown). */
  known: boolean;
  ok: boolean;
  missing: string[];
  inputs: { name: string; qty: number; have: number }[];
  tools: string[];
  skill: string | null;
  workbench: boolean;
  seconds: number;
  /** Places a structure instead of making items. */
  structure: boolean;
}

export interface BuildHud {
  /** Placing a structure: on the tile you face. */
  placing: { label: string; icon: IconName; valid: boolean; reason: string | null } | null;
  /** Crafting or building in progress (0–1). */
  progress: { label: string; value: number } | null;
  /** A built structure in reach (for Dismantle). `hp` 0–1 for walls, fences and doors. */
  near: { label: string; icon: IconName; hp: number | null; problem: string | null } | null;
  /** The building you're in, and whose safehouse it is ('you', someone's name, or null). */
  safehouse: { name: string; owner: string | null; problem: string | null } | null;
  /** You have a safehouse somewhere. */
  mine: boolean;
}

export interface SurvivorHud {
  name: string;
  occupation: string;
  occupationIcon: IconName;
  traits: { label: string; positive: boolean }[];
}

export interface SkillHud {
  id: SkillId;
  label: string;
  group: SkillGroup;
  icon: IconName;
  level: number;
  /** 0–1 towards the next level. */
  progress: number;
  practice: string;
  effect: string;
  practisable: boolean;
  /** XP multiplier from a skill book at the current level (1 = none). */
  book: number;
}

export type InvAction = 'use' | 'equip' | 'unequip' | 'wield' | 'drop' | 'split' | 'destroy' | 'put' | 'take' | 'repair';

export interface ItemHud {
  /** 'b:uid' bag · 'w:weapon' · 'a:ammo' · 'e:slot' worn · 'c:index' in the open container. */
  key: string;
  name: string;
  icon: IconName;
  category: ItemCategory;
  qty: number;
  /** kg for the whole stack. */
  weight: number;
  /** 0–1 for things that wear out. */
  cond: number | null;
  mag: number | null;
  description: string;
  /** Wearable stats ("+6 kg carry · warmth +8 °C"). */
  detail: string | null;
  equipped: boolean;
  wielded: boolean;
  /** Waiting for the host to confirm. */
  pending: boolean;
  /** Perishable food: how fresh it is. */
  freshness: Freshness | null;
  actions: InvAction[];
}

export interface InventoryHud {
  weight: number;
  capacity: number;
  items: ItemHud[];
}

export interface LootHud {
  id: number;
  label: string;
  kind: ContainerKind;
  items: ItemHud[];
  weight: number;
  /** kg it can hold (null: unlimited, e.g. the ground). */
  capacity: number | null;
}

export type PartStatus = 'scratched' | 'wounded' | 'bleeding' | 'bandaged' | 'broken' | 'splinted';

export interface BodyHud {
  /** 0–100 after painkillers. */
  pain: number;
  /** Worst status per injured part (for the body diagram). */
  parts: Partial<Record<BodyPart, PartStatus>>;
  wounds: { id: number; part: string; label: string; bleeding: boolean }[];
  fractures: { part: string; splinted: boolean }[];
  painkillers: boolean;
  /** Treatments in the bag that would do something right now. */
  canBandage: boolean;
  canDisinfect: boolean;
  canSplint: boolean;
  canPainkill: boolean;
  /** Visible symptoms only: the infection hides until it makes you sick. */
  sick: 'none' | 'queasy' | 'feverish' | 'terminal';
}

export interface CharacterHud {
  fatigue: number;
  stress: number;
  panic: number;
  boredom: number;
  unhappiness: number;
  /** °C, one decimal. */
  bodyTemp: number;
  /** kg, one decimal. */
  bodyWeight: number;
  /** 0–100, how soaked you are. */
  wet: number;
  fitness: { level: number; progress: number };
  strength: { level: number; progress: number };
  /** Bag weight and strength-based capacity (kg, one decimal). */
  carryKg: number;
  carryMaxKg: number;
  /** Why you can't sleep right now (null = you can). */
  sleepBlocked: string | null;
}

export interface SupplyHud {
  id: ConsumableId;
  name: string;
  icon: IconName;
  qty: number;
}

export interface WeaponHud {
  id: WeaponId;
  name: string;
  icon: IconName;
  /** Rounds in the magazine (null for melee). */
  mag: number | null;
  magSize: number;
  /** Spare rounds for this weapon's ammo type. */
  reserve: number;
  /** 0–1 while reloading, else 0. */
  reloading: number;
  /** Melee wear left (0–1); null for guns and fists. */
  durability: number | null;
}

export interface EntranceHud {
  kind: EntranceKind;
  state: EntranceState;
  planks: number;
  /** 0–1 while boarding up, else 0. */
  progress: number;
}

/** An exterior door/window drawn on its building's roof. */
interface RoofEntrance {
  tile: number;
  side: Side;
  /** Door badge position (world px), set on one leaf per door. */
  badge?: { x: number; y: number };
}

export const PLAYER_MAX_HP = 100;
/** Zombies on a standard 1680×1080 map; larger maps scale up (capped). */
const BASE_POPULATION = 18;
const MAX_POPULATION = 80;
/** Hordes: zombies the host keeps within LOCAL_RADIUS_TILES of each player. */
const LOCAL_TARGET = 30;
const LOCAL_RADIUS_TILES = 45;
/** Groups spawn in this ring around a player: just outside sight (14 tiles), inside sync range. */
const SPAWN_RING_MIN_TILES = 16;
const SPAWN_RING_MAX_TILES = 40;
const GROUP_MIN = 3;
const GROUP_MAX = 6;
/** Idle zombies farther than this from every player are recycled near players. */
const DESPAWN_TILES = 80;
/** Global cap so several spread-out players each get their own crowd. */
const GLOBAL_CAP = 150;
const BASE_MAP_AREA = 1680 * 1080;
const RESPAWN_CHECK_SECONDS = 3;
const REGEN_DELAY = 6;
/** Passive healing while well fed and watered (hunger & hydration ≥ WELL_FED). */
const WELL_FED = 60;
const WELL_FED_REGEN = 1.5;
/** Sprint speed multiplier (stamina-limited, see survival/vitals.ts). */
export const SPRINT_MUL = 1.45;
const SPRINT_FOOTSTEP_RADIUS = 6;
/** A safe spot needs no hunting zombie within this many tiles. */
const SAFE_CLEAR_TILES = 10;
const USE_COOLDOWN = 0.8;
/** Alive caps per special, so a long match doesn't become all dreadnoughts. */
const SPECIAL_CAPS: Record<SpecialZombieType, number> = { charger: 4, bloater: 6, dreadnought: 1 };
/** Shove: pushes zombies back and may knock them down. Stomp: finishes a downed one. */
const SHOVE = { range: 26, arc: (100 * Math.PI) / 180, push: 16, downChance: 0.45, stamina: 4, cooldown: 0.6, noise: 3 } as const;
const STOMP = { range: 20, damage: 55, stamina: 3, cooldown: 0.7, noise: 4 } as const;
/** Share of buildings with a burglar alarm, and how long / loud it wails once tripped. */
const ALARM = { chancePct: 20, seconds: 60, noiseRadius: 25, noiseEvery: 2.5, hearTiles: 50 } as const;
/** A door or window breaking makes this much noise (tiles). */
const BREAK_NOISE: Record<EntranceKind, number> = { window: 12, door: 10, wall: 12, fence: 8 };
/** Noise maker: buzzes after `delay` s, a `radius`-tile noise every `every` s for `seconds`. */
const LURE = { delay: 3, seconds: 30, radius: 20, every: 2 } as const;
/** Boarding up costs a plank and two nails and needs a hammer. */
const BARRICADE_COST = [
  { def: 'planks' as ItemDefId, qty: 1 },
  { def: 'nails' as ItemDefId, qty: 2 },
];
/** Seconds before someone the infection killed gets back up. */
const TURN_SECONDS = 15;
const FX_SECONDS: Record<ZombieFx['k'], number> = { i: 0.5, b: 0.9, r: 1.6, c: 0.7, a: ALARM.seconds, n: LURE.delay + LURE.seconds, g: 0.1 };

/** Host world events: distant gunfire (heard, pulls zombies) and horde migrations (silent), in real seconds. */
const WORLD_EVENTS = {
  gunshotEvery: [240, 480] as const,
  gunshotTiles: [30, 45] as const,
  gunshotRadius: 25,
  /** Players within this many tiles hear the shots. */
  gunshotHearTiles: 60,
  migrationEvery: [300, 600] as const,
  migrationRadius: 40,
  /** Thunder: a noise this loud somewhere near a player. */
  thunderRadius: 16,
  heliRadius: 30,
  heliEvery: 2,
} as const;

type WorldTarget =
  | { type: 'utility'; tile: number; kind: UtilityKind }
  | { type: 'fixture'; index: number; kind: FixtureKind }
  | { type: 'vehicle'; id: number }
  | { type: 'forage'; ground: ForageGround };

/** Longest physics step for a car (s); longer frames are split. */
const VEHICLE_MAX_STEP = 1 / 60;
/** "just now", "2 min ago" (match time). */
function agoLabel(seconds: number): string {
  if (seconds < 20) return 'just now';
  if (seconds < 90) return `${Math.round(seconds)} s ago`;
  return `${Math.round(seconds / 60)} min ago`;
}

/** What tending a utility sounds like. */
const UTILITY_SOUND: Record<UtilityAction, SoundId> = {
  toggle: 'switch',
  refuel: 'pour',
  repair: 'hammer',
  fill: 'pour',
  stoke: 'rustle',
  plant: 'rustle',
  water: 'pour',
  harvest: 'rustle',
  clear: 'rustle',
  bait: 'rustle',
  collect: 'rustle',
};

/** Headlight pool radius (tiles). */
const HEADLIGHT_TILES = 5;
/** A driver tells everyone about their car at most this often (pose rides on movement broadcasts). */
const VEHICLE_SEND_SECONDS = 0.5;
/** Host frees a vehicle whose driver has been gone this long. */
const DRIVER_TIMEOUT_SECONDS = 5;
const FORAGE_LABEL: Record<ForageGround, string> = { grass: 'Grass', park: 'Park land', dirt: 'Bare dirt' };
/** Skill practice from tending plots and traps. */
const UTILITY_XP: Partial<Record<UtilityAction, { skill: SkillId; amount: number }>> = {
  plant: { skill: 'farming', amount: 3 },
  water: { skill: 'farming', amount: 1 },
  harvest: { skill: 'farming', amount: 8 },
  bait: { skill: 'trapping', amount: 1 },
  collect: { skill: 'trapping', amount: 8 },
};
const VEHICLE_DONE: Record<VehicleAction, string | null> = {
  enter: null,
  ride: null,
  exit: null,
  refuel: 'Poured in a can of fuel',
  siphon: 'Siphoned a can of fuel',
  hotwire: 'Hotwired it — the engine will turn over now',
  tire: 'Fitted the spare tyre',
  battery: 'Fitted the battery',
  engine: 'Patched up the engine',
  windows: 'Taped over the windows',
  body: 'Welded the panels',
  takeTire: 'Took a tyre off',
  takeBattery: 'Took the battery out',
};

const WEATHER_ICON: Record<Weather, IconName> = { clear: 'sun', cloudy: 'cloud', fog: 'fog', rain: 'cloudRain', storm: 'cloudLightning', snow: 'cloudSnow' };
/** Toast when the weather turns (nothing for clearing skies). */
const WEATHER_START: Partial<Record<Weather, string>> = {
  fog: 'Fog is rolling in',
  rain: "It's starting to rain — it covers your footsteps",
  storm: 'A storm is breaking',
  snow: "It's snowing",
};
const UTILITY_EVENT: Record<'outOfFuel' | 'brokeDown' | 'burntOut' | 'full' | 'ripe' | 'withered' | 'caught', string> = {
  ripe: 'Your crops are ripe',
  withered: 'Your crops have died',
  caught: 'Something is caught in your snare',
  outOfFuel: 'The generator ran out of fuel',
  brokeDown: 'The generator broke down',
  burntOut: 'The campfire burnt out',
  full: 'The rain collector is full',
};
const ACTION_DONE: Record<UtilityAction, (kind: UtilityKind) => string> = {
  toggle: () => 'Switched the generator',
  refuel: () => 'Poured fuel into the generator',
  repair: () => 'Patched up the generator',
  fill: () => 'Filled a bottle with rainwater — boil it first',
  stoke: () => 'Fed the fire',
  plant: () => 'Planted',
  water: () => 'Watered',
  harvest: () => 'Harvested',
  clear: () => 'Cleared the plot',
  bait: () => 'Baited the snare',
  collect: () => 'Took the catch',
};
const SWING_VISUAL_SECONDS = 0.18;
const WOUND_NOUN: Record<WoundKind, string> = { scratch: 'Scratched', laceration: 'Laceration', bite: 'Bitten' };
const STAGE_TEXT: Record<InfectionStage, string> = {
  none: '',
  incubating: '',
  queasy: 'You feel queasy…',
  feverish: "You're burning up…",
  terminal: 'You can barely stand…',
};

/** Buildings rigged with an alarm (stable per building id). */
export function isAlarmed(buildingKey: string): boolean {
  return (hash32(`${buildingKey}:alarm`) >>> 0) % 100 < ALARM.chancePct;
}

const maxDurability = (w: WeaponId) => WEAPONS[w].melee?.durability ?? Infinity;

/** Body parts each worn slot covers. */
const COVERS: Record<EquipSlot, BodyPart[]> = {
  outer: ['torso', 'neck', 'leftArm', 'rightArm'],
  hands: ['leftHand', 'rightHand'],
  back: [],
};
/** Stacks "Take all" grabs per press (each is a request to the host). */
const LOOT_ALL_MAX = 8;
/** A request the host never answers is given up after this long (s). */
const INV_TIMEOUT_SECONDS = 6;
/** Host checks emptied shop shelves for restocking this often (s). */
const CONTAINER_RESTOCK_SECONDS = 5;
/** Containers per snapshot when resending changed ones to late joiners. */
const CONTAINER_RESEND_BATCH = 40;
const FOOTSTEP_INTERVAL = 0.5;
const FOOTSTEP_RADIUS = 3;
const DEATH_SECONDS = 2.2;
/** How close (px, feet to tile centre) a door/window must be to interact. */
const DOOR_REACH = 26;
const BARRICADE_SECONDS = 1.5;
const HAMMER_NOISE_RADIUS = 9;
const DOOR_NOISE_RADIUS = 2;
const WINDOW_SMASH_DAMAGE = 40;
/** Pickup radius (px, feet to item). */
const PICKUP_RADIUS = 16;
/** Client gunfire is batched into one `zshot` per window (s) to respect the socket budget. */
const SHOT_BATCH_SECONDS = 0.25;
const TRACER_SECONDS = 0.09;
/** Night lighting: lamp pool radius, how far away lamps are seen, muzzle flash light. */
const LAMP_RADIUS_TILES = 4;
const LAMP_SIGHT_TILES = 26;
const MUZZLE_LIGHT_SECONDS = 0.15;
const MUZZLE_LIGHT_TILES = 5;
const FLASHLIGHT_HALF_ANGLE = (20 * Math.PI) / 180;
/** A lit flashlight at night is a small noise every couple of seconds. */
const FLASHLIGHT_NOISE_SECONDS = 2;
const FLASHLIGHT_NOISE_RADIUS = 3;
/** A tap during a cooldown (or the equip delay) still fires when it ends. */
const PRESS_BUFFER_SECONDS = 0.35;
const TOAST_SECONDS = 2.2;
/** Loot disc colour per item type, so food, drinks and meds read apart on the floor. */
const LOOT_DISC: Record<ItemCategory, string> = {
  food: '#D97706',
  drink: '#0284C7',
  stimulant: '#CA8A04',
  medical: '#DC2626',
  weapon: '#52525B',
  ammo: '#4D7C0F',
  clothing: '#7C3AED',
  bag: '#7C3AED',
  tool: '#78716C',
  material: '#78716C',
  electronics: '#0891B2',
  farming: '#16A34A',
  vehicle: '#57534E',
  literature: '#9333EA',
  misc: '#71717A',
};
/** Bullets leave from torso height above the feet. */
const MUZZLE_LIFT = 12;
/** Host only sends zombies within this distance (px) of some player. */
export const INTEREST_RADIUS = 45 * 16;
/** Full entrance list resend interval (s) so late joiners converge. */
const ENTRANCE_RESEND_SECONDS = 5;

/** Sprite size matching players so zombies read at the same scale. */
const ZOMBIE_SPRITE = 36;

const ZOMBIE_LOOKS: AvatarConfig[] = [
  { skinColor: '#8FAF6E', shirtColor: '#5B6B4A', hairColor: '#3A3328', hairStyle: 'short', accessory: 'none', topStyle: 'tshirt', bottomStyle: 'pants', bottomColor: '#3B3F4A', shoesColor: '#2B2B33' },
  { skinColor: '#9BB27A', shirtColor: '#7A3B3B', hairColor: '#2B2530', hairStyle: 'buzz', accessory: 'none', topStyle: 'tshirt', bottomStyle: 'pants', bottomColor: '#4A3B2E', shoesColor: '#2B2B33' },
  { gender: 'female', skinColor: '#8AA673', shirtColor: '#4B5563', hairColor: '#5B4636', hairStyle: 'long', accessory: 'none', bottomColor: '#374151', shoesColor: '#2B2B33' },
  { skinColor: '#A3B58A', shirtColor: '#D6D3C4', hairColor: '#6B6B6B', hairStyle: 'spiky', accessory: 'none', topStyle: 'tshirt', bottomStyle: 'pants', bottomColor: '#1F2937', shoesColor: '#2B2B33' },
];

function toDirection(facing: number): 'up' | 'down' | 'left' | 'right' {
  const c = Math.cos(facing);
  const s = Math.sin(facing);
  if (Math.abs(c) > Math.abs(s)) return c > 0 ? 'right' : 'left';
  return s > 0 ? 'down' : 'up';
}

export interface ZombieFrameInput {
  feetX: number;
  feetY: number;
  moveX: number;
  moveY: number;
  insideBuildingId: string | null;
  /**
   * Unclamped real seconds since the last frame (capped by the caller). The
   * match clock — and so the 1 hour = 1 day cycle — runs on real time even
   * when the frame dt is clamped on a slow device. Defaults to dt.
   */
  realDt?: number;
  /** Other players' feet points, keyed by clientInstanceId (zombies chase them too). */
  others: (SimTarget & { moving?: boolean })[];
}

type Authority = 'host' | 'client' | 'pending';

/** Host snapshot cadence (s). ~3 Hz keeps us well inside the shared 10 events/s socket budget. */
const SNAPSHOT_INTERVAL = 0.3;
/** Send at least this often even when nothing changed, so clients see the host is alive. */
const SNAPSHOT_HEARTBEAT = 1;
/** If the channel never becomes ready, simulate locally after this long. */
const PENDING_FALLBACK_SECONDS = 5;
/** Special looks (drawn scaled around the feet; see drawZombie). */
const SPECIAL_LOOKS: Record<SpecialZombieType, { look: AvatarConfig; scale: number; filter: string }> = {
  charger: {
    look: { skinColor: '#9C8F6A', shirtColor: '#7F1D1D', hairColor: '#1C1917', hairStyle: 'buzz', accessory: 'none', topStyle: 'tshirt', bottomStyle: 'pants', bottomColor: '#292524', shoesColor: '#1C1917' },
    scale: 1.3,
    filter: 'none',
  },
  bloater: {
    look: { skinColor: '#A3C46B', shirtColor: '#65A30D', hairColor: '#3F3F2E', hairStyle: 'short', accessory: 'none', topStyle: 'tshirt', bottomStyle: 'pants', bottomColor: '#3F6212', shoesColor: '#2B2B33' },
    scale: 1.25,
    filter: 'saturate(1.4)',
  },
  dreadnought: {
    look: { skinColor: '#8A8F98', shirtColor: '#4B5563', hairColor: '#111827', hairStyle: 'buzz', accessory: 'none', topStyle: 'tshirt', bottomStyle: 'pants', bottomColor: '#1F2937', shoesColor: '#111827' },
    scale: 1.75,
    filter: 'contrast(1.2)',
  },
};

/** Dead-reckoning speed per wire state index (matches ZOMBIE_STATES order). */
const NET_SPEED = [0, ZOMBIE.wanderSpeed, ZOMBIE.wanderSpeed * 1.6, ZOMBIE.chaseSpeed, 0, 0, ZOMBIE.wanderSpeed * 1.2, ZOMBIE.wanderSpeed, ZOMBIE.wanderSpeed * 1.3, 0];

/** A survivor's body on the ground. */
const CORPSE_LOOK: AvatarConfig = { skinColor: '#C9A27E', shirtColor: '#3B6EA5', hairColor: '#4A3728', hairStyle: 'short', accessory: 'none', topStyle: 'tshirt', bottomStyle: 'pants', bottomColor: '#374151', shoesColor: '#1F2937' };

interface NetTrack {
  /** Extrapolated authoritative position. */
  x: number;
  y: number;
  goalX: number;
  goalY: number;
  speed: number;
}

export class ZombieMode {
  readonly vision: ZombieVision;
  readonly sim: ZombieSim;
  /** Special-infected strategies + gas clouds (abilities run on the host; hazards everywhere). */
  readonly director: SpecialsDirector;
  vitals: PlayerVitals = freshVitals();
  /** Fatigue, moodles, body temperature, weight, fitness, strength (local, like vitals). */
  condition: CharacterCondition = freshCondition();
  kills = 0;
  /** Supplies only: guns, mags and ammo keep their own slots below. */
  private bag: Bag = freshLoadout().bag;
  private uidSeq = 0;
  private sprintHeld = false;
  private sprintLatched = false;
  private sprinting = false;
  private speedMul = 1;
  private canAct = true;
  private safe = false;
  private useCooldown = 0;
  /** Match clock (s): the host counts it, clients take it from snapshots. */
  private elapsed = 0;
  private difficulty: DifficultyCoefficients = difficultyAt(0);
  private waveTimer = 0;
  private outFx: ZombieFx[] = [];
  private fx: (ZombieFx & { age: number })[] = [];
  /** Host: match second each restocking item was taken. */
  private takenAt: Map<number, number> = new Map();
  private restocked: Set<number> = new Set();
  private sinceHurt = 99;
  private swingAge = 99;
  private swingFacing = 0;
  private swingRequested = false;
  private footstepTimer = 0;
  private respawnTimer = 0;
  private deadTimer = 0;
  private hurtFlash = 0;
  private animTime = 0;
  private hudKey = '';
  private feet = { x: 0, y: 0 };
  private pendingNoises: NoiseEvent[] = [];
  /** Zombies in the peripheral ring this frame (drawn on top of fog). */
  private sensed: Zombie[] = [];

  // Networking
  private net: ZombieSyncService | null = null;
  private authority: Authority = 'host';
  private pendingTime = 0;
  private snapshotTimer = 0;
  private sinceSnapshot = 0;
  private seq = 0;
  private lastSnapKey = '';
  private outBites: [string, number][] = [];
  private outKills: Map<string, number> = new Map();
  private remoteStrikes: { strike: ZombieStrike; from: string }[] = [];
  private lastHostId: string | null = null;
  private lastHostSeq = -1;
  private tracks: Map<number, NetTrack> = new Map();

  // Doors, windows, barricades
  private remoteDoors: { door: ZombieDoorAction; from: string }[] = [];
  /** Entrance tiles changed this snapshot window (host). */
  private changedEntrances: Set<number> = new Set();
  /** Every entrance tile that differs from the map default (host; resent periodically). */
  private dirtyEntrances: Set<number> = new Set();
  private entranceResendTimer = 0;
  private lastMemberCount = 0;
  private barricade: { tile: number; t: number } | null = null;
  private nearEntrance: { tile: number; e: Entrance } | null = null;
  /** Exterior doors/windows grouped by building index (built lazily; the layout never changes). */
  private exteriorByBuilding: Map<number, RoofEntrance[]> | null = null;
  private readonly targetPopulation: number;
  private readonly worldHeight: number;
  private readonly hordeRng: () => number;
  private lastTargets: SimTarget[] = [];

  // Weapons & loot
  private weapon: WeaponId = 'axe';
  /** Fists are always there; the axe is the starting weapon. */
  private owned: Set<WeaponId> = new Set(['fists', 'axe']);
  /** Melee hits left per weapon (it breaks at 0). */
  private durability: Partial<Record<WeaponId, number>> = { axe: maxDurability('axe') };
  private meleeRng = mulberry32((Date.now() ^ 0x68e31da4) & 0x7fffffff);
  private shoveCooldown = 0;
  private swingKind: 'swing' | 'heavy' | 'shove' | 'stomp' = 'swing';
  private swingRange = WEAPONS.axe.range;
  private swingArc = (120 * Math.PI) / 180;

  // Injuries & infection (local, like vitals)
  body: BodyState = freshBody();
  private pain = 0;
  private bodyMods: BodyMods = tickBody(freshBody(), { dt: 0, timeScale: 1 }).mods;
  private lastStage: InfectionStage = 'none';
  private injuryRng = mulberry32((Date.now() ^ 0x2545f491) & 0x7fffffff);

  // World events (host): broken doors/windows, alarms, bodies
  private brokenSeen: Set<number> = new Set();
  private alarmsTriggered: Set<string> = new Set();
  private alarms: { x: number; y: number; left: number; next: number }[] = [];
  private remoteDeaths: { death: ZombieDeath; from: string }[] = [];
  private corpseKey = '';

  // Survivor (character creation) & skills
  /** Skill levels (local, like vitals). */
  skills: SkillSet = freshSkills();
  private booksRead: BooksRead = {};
  survivor: SurvivorBuild = { ...DEFAULT_BUILD };
  private mods: SurvivorModifiers = survivorModifiers(DEFAULT_BUILD);
  /** Survival spaces ask for a survivor before playing and after each death. */
  private requireCharacterCreation = false;
  /** In the world (false while creating a character). */
  private ready = true;

  // Inventory & containers
  private store: ContainerStore = new ContainerStore([], 0);
  private nearContainerId: number | null = null;
  private openContainerId: number | null = null;
  private inventoryOpen = false;
  /** Worn bag and clothes. */
  equipped: Partial<Record<EquipSlot, InventoryItem>> = {};
  private invReq = 0;
  /** Requests waiting for the host: takes / puts (the item), builds (materials to refund), dismantles (what you'll get back), claims. */
  private pendingInv = new Map<
    number,
    {
      op: 'take' | 'put' | 'build' | 'dismantle' | 'claim' | 'utility' | 'vehicle';
      c: number;
      item?: InventoryItem;
      at: number;
      refund?: InventoryItem[];
      reward?: InventoryItem[];
      label?: string;
      act?: VehicleAction;
    }
  >();

  // Crafting & building
  private knownRecipes: Set<RecipeId> = new Set();
  private craftOpen = false;
  private crafting: { id: RecipeId; t: number; total: number } | null = null;
  private placing: { id: RecipeId; kind: StructureKind } | null = null;
  private constructing: { id: RecipeId; kind: StructureKind; tile: number; t: number; total: number } | null = null;
  /** Built structures by tile (clients mirror the host's list). */
  private built = new Map<number, { kind: StructureKind; container?: number; state?: number[] }>();
  private builtKey = '';

  // World simulation (survival/world.ts, utilities.ts): weather, power, water, events
  private worldSeed = 0;
  private worldWidth = 0;
  private fixtures: WorldFixture[] = [];
  private world: WorldState = worldAt(0, 0, 1, { w: 1, h: 1 });
  private worldClock = 0;
  private worldAnnounced: { power: boolean; water: boolean; weather: Weather; heli: boolean } | null = null;
  /** Running generators this frame (world px), for power checks. */
  private powerSources: { x: number; y: number }[] = [];
  /** Burning campfires this frame (world px): light, warmth and cooking. */
  private fires: { x: number; y: number }[] = [];
  /** Toilet tank fills used, per fixture (this player only). */
  private toiletUses = new Map<number, number>();
  private worldTarget: WorldTarget | null = null;
  // Host-only world events
  private generatorNoiseTimer = 0;
  private heliNoiseTimer = 0;
  private gunshotTimer: number = WORLD_EVENTS.gunshotEvery[0];
  private migrationTimer: number = WORLD_EVENTS.migrationEvery[0];
  private eventRng = mulberry32(0x5eed);

  // Vehicles (survival/vehicles.ts, vehicleSystem.ts)
  private vehicles: VehicleSystem;
  /** The vehicle you're in (driving or riding). */
  private myVehicle: number | null = null;
  /** The vehicle whose Inspect panel is open. */
  private vehiclePanel: number | null = null;
  private exitTo: { x: number; y: number } | null = null;
  private extraExitBlocked: ((box: Rect) => boolean) | null = null;
  private vehicleSendTimer = 0;
  private hornCooldown = 0;
  private crankCooldown = 0;
  private ramCooldown = 0;
  private engineNoiseTimer = 0;
  private remoteVehicleRows: { row: VehicleRow; from: string; horn: boolean }[] = [];
  private driverSeen = new Map<number, number>();
  // Food production (survival/food.ts): ground, fishing spots, foraged patches, timed actions
  private groundAt: (x: number, y: number) => GroundType | null = () => null;
  private fishStock = new Map<number, { left: number; at: number }>();
  private forageCells = new Map<string, number>();
  private activity: { kind: 'fish' | 'forage' | 'hotwire'; t: number; total: number; label: string; target: number } | null = null;

  // Feedback (feedback.ts): sound events for WorldGame's SurvivalAudio, floaters, shake, notifications
  private sfx: SoundEvent[] = [];
  private feedback = new FeedbackLayer();
  private shake = new Shake();
  private notices = new NoticeLog();
  private fxRng = mulberry32(0xf00d);
  private groanTimer = 2;
  private lastFlash = 0;
  private menuOpen = false;
  private lastOthers: SimTarget[] = [];

  // Persistence and rules (persistence.ts, survival/balance.ts)
  private rules: WorldRules = { ...NORMAL_RULES };
  private sentRules = '';
  /** A snapshot from some host arrived: the world is already running, a save must not replace it. */
  private hadHostState = false;
  private pendingWorldSave: WorldSave | null = null;
  /** Died since WorldGame last asked (it deletes the survivor save: permadeath). */
  private diedFlag = false;
  private loadingSurvivor = false;
  /** Host: request rate limits per client. */
  private guard = new HostGuard();
  /** Host: who is asleep (multiplayer sleep); clients: the host's count. */
  private sleepers = new Map<string, boolean>();
  private sleepCount: { asleep: number; total: number } | null = null;
  private sentSleep = false;
  private sentSleepKey = '';
  /** Host: snapshot bytes sent (stats overlay). */
  private netBytes = 0;
  private netBytesAt = 0;
  private netRate = 0;
  /** Host: a client said the rules changed (WorldGame reloads them from the database). */
  onRulesChanged?: () => void;
  private nearBuiltTile: number | null = null;
  private remoteBuild: { op: ZombieBuildOp; from: string }[] = [];
  /** Safehouse claims by building id. */
  private claims = new Map<string, { owner: string; name: string }>();
  private claimsKey = '';
  private insideBuilding: string | null = null;
  private readonly buildingById = new Map<string, BuildingDefinition>();
  private lures: { x: number; y: number; delay: number; left: number; next: number }[] = [];
  private remoteInv: { op: ZombieInvOp; from: string }[] = [];
  private outAcks: InvAck[] = [];
  private containerRestockTimer = 0;
  private containerResendCursor = 0;
  private lootRng = mulberry32((Date.now() ^ 0x51ed27) & 0x7fffffff);
  private mags: Partial<Record<WeaponId, number>> = {};
  private reserve: Record<AmmoType, number> = { '9mm': 0, '12ga': 0, '556': 0, '762': 0, belt: 0 };
  private fireCooldown = 0;
  private reloadT = -1;
  private triggerHeld = false;
  /** Seconds since the last trigger press / attack() (a press is buffered through cooldowns). */
  private pressAge = 99;
  private aim: number | null = null;
  private shotRng = mulberry32(Date.now() & 0xffff);
  private readonly loot: LootSpawn[];
  private taken: Set<number> = new Set();
  /** Loot ids taken since the last snapshot (host). */
  private changedLoot: Set<number> = new Set();
  private remoteShots: { shot: ZombieShot; from: string }[] = [];
  private remoteLoot: { id: number; from: string }[] = [];
  /** Client: gunfire waiting to be sent to the host. */
  private shotBatch: ZombieShot | null = null;
  private shotBatchAge = 0;
  private tracers: { x1: number; y1: number; x2: number; y2: number; age: number }[] = [];
  private muzzleAge = 99;
  private toast: { text: string; icon: IconName | null; age: number } | null = null;

  // Day / night
  private tod: TimeOfDay = timeOfDay(0);
  private flashlightOn = false;
  private flashlightNoiseTimer = 0;
  /** Street lamps: ground point (light pool) and head (glow), world px. */
  private lamps: { x: number; y: number; headX: number; headY: number }[] = [];
  private darkCanvas: HTMLCanvasElement | null = null;
  private lastPhase: DayPhase | null = null;
  /**
   * Seconds the shared clock has been fast-forwarded by sleeping (host counts
   * it, clients take it from `zsnap.sk`). Only the time of day uses it; the
   * difficulty curve and restocks stay on the real match clock.
   */
  private clockSkip = 0;

  // Character condition & sleep
  private restSpots: RestSpot[] = [];
  private nearRest: RestSpot | null = null;
  private sleeping: { spot: SleepSpot; quality: number } | null = null;
  /** Melee swings / shots this frame (fitness, strength, boredom). */
  private swingsThisFrame = 0;
  private shotsThisFrame = 0;
  private hurtThisFrame = false;
  /** Zombies chasing within CONDITION.threatTiles, and the nearest one (tiles). */
  private hunters = 0;
  private nearestHunterTiles = Infinity;

  onHudChanged?: (hud: ZombieHud) => void;

  constructor(
    structuralWalls: Rect[],
    buildings: BuildingDefinition[],
    worldWidth: number,
    worldHeight: number,
    seed: number = Date.now() & 0xffff,
    entrances: Entrance[] = [],
    lowWalls: Rect[] = [],
    loot: LootSpawn[] = []
  ) {
    this.loot = loot;
    this.vision = new ZombieVision(structuralWalls, buildings, worldWidth, worldHeight, entrances, lowWalls);
    // Zombies spawn on the outdoor map (and ground floors) — never the off-map upper-floor band;
    // they reach upper floors by following players up the stairs.
    this.sim = new ZombieSim(this.vision.grid, { x: 32, y: 32, w: worldWidth - 64, h: worldHeight - 64 }, seed);
    this.director = new SpecialsDirector(this.sim);
    this.vehicles = new VehicleSystem(this.vision.grid);
    // A crowd of individuals: the odd sprinter, the half-blind shambler
    this.sim.traitOdds = DEFAULT_TRAIT_ODDS;
    for (const b of buildings) this.buildingById.set(b.id, b);
    // Nothing spawns inside a claimed safehouse
    this.sim.spawnBlocked = (x, y) => this.claims.size > 0 && this.claimAt(x, y) !== null;
    this.worldHeight = worldHeight;
    this.worldWidth = worldWidth;
    this.hordeRng = mulberry32(seed ^ 0x9e3779b9);
    const areaRatio = (worldWidth * worldHeight) / BASE_MAP_AREA;
    this.targetPopulation = Math.min(MAX_POPULATION, Math.round(BASE_POPULATION * Math.sqrt(areaRatio) * 1.1));
  }

  /** Current health (0–100); vitals own it. */
  get hp(): number {
    return this.vitals.health;
  }

  /** Shift held (desktop). */
  setSprint(held: boolean) {
    this.sprintHeld = held;
  }

  /** Sprint toggle (touch button). Returns the new state. */
  toggleSprint(): boolean {
    this.sprintLatched = !this.sprintLatched;
    return this.sprintLatched;
  }

  /**
   * Eats / drinks / uses one supply. Without an id, picks what you need most
   * (meds when hurt, drink when thirsty, food when hungry, stimulant when exhausted).
   */
  useSupply(id?: ConsumableId, uid?: string): boolean {
    if (this.deadTimer > 0 || this.useCooldown > 0 || !this.canAct || this.sleeping || !this.ready) return false;
    const pick = id ?? this.bestSupply();
    const stack = uid ? this.bag.items.find((i) => i.uid === uid) : pick ? this.pickStack(pick) : undefined;
    if (!stack) {
      if (!id) this.showToast('Nothing you need right now');
      return false;
    }
    // Skill books are read, not used up
    // Recipe magazines teach and are kept
    const teaches = ITEM_DEFS[stack.def].consume?.teaches;
    if (teaches) {
      const learn = RECIPE_ORDER.filter((r) => RECIPES[r].magazine === teaches);
      if (learn.every((r) => this.knownRecipes.has(r))) {
        this.showToast(`You already know everything in the ${ITEM_DEFS[stack.def].name}`, 'newspaper');
        return false;
      }
      for (const r of learn) this.knownRecipes.add(r);
      this.useCooldown = USE_COOLDOWN;
      this.showToast(`Learned: ${learn.map((r) => RECIPES[r].name).join(', ')}`, 'newspaper');
      return true;
    }
    const book = ITEM_DEFS[stack.def].consume?.skillBook;
    if (book) return this.readSkillBook(book.skill, book.volume, ITEM_DEFS[stack.def].name);
    // Disinfectant and splints are only used up when there's something to treat
    const treatment = ITEM_DEFS[stack.def].consume?.treat;
    if ((treatment === 'disinfect' || treatment === 'splint') && !canTreat(this.body, treatment)) {
      this.showToast(treatment === 'splint' ? 'Nothing to splint' : 'No wounds to disinfect', ITEM_DEFS[stack.def].icon);
      return false;
    }
    const fresh = this.freshnessIn(stack, 'bag');
    const r = applyConsumable({ bag: this.bag, quick: freshLoadout().quick }, this.vitals, stack.uid);
    if (!r.used) return false;
    this.bag = r.loadout.bag;
    this.vitals = r.vitals;
    this.useCooldown = USE_COOLDOWN;
    const def = ITEM_DEFS[stack.def];
    this.condition = applyConsumableCondition(this.condition, def.consume);
    // Stale food is less filling; rotten food makes you ill
    const penalty = fresh && def.consume ? spoilPenalty(def.consume, fresh) : null;
    if (penalty) {
      this.vitals = consume(this.vitals, penalty);
      this.condition = applyConsumableCondition(this.condition, penalty);
    }
    // The empty bottle stays with you
    if (def.consume?.leaves) {
      const left: InventoryItem = { uid: `l${this.uidSeq++}`, def: def.consume.leaves, qty: 1 };
      if (!this.receiveItem(left, true)) this.dropToGround(left);
    }
    const verb =
      def.category === 'drink' || def.category === 'stimulant' ? 'Drank' : def.category === 'medical' ? 'Used' : def.category === 'literature' ? 'Read' : 'Ate';
    let message = fresh === 'rotten' ? `Ate rotten ${def.name.toLowerCase()} — you feel sick` : fresh === 'stale' ? `Ate stale ${def.name.toLowerCase()}` : `${verb} ${def.name}`;
    if (stack.def === 'tainted_water' || stack.def === 'raw_meat') message += ' — that may make you ill';
    if (def.consume?.lure) {
      // Dropped at your feet: the host runs it, clients ask the host to
      if (this.authority === 'host') this.addLure(this.feet.x, this.feet.y);
      else this.net?.sendStrike({ x: Math.round(this.feet.x), y: Math.round(this.feet.y), f: 0, k: 'lure' });
      message = 'Dropped a noise maker — get clear';
    }
    if (treatment) {
      const t = treatBody(this.body, treatment);
      this.body = t.body;
      if (treatment !== 'painkiller' && (t.part || treatment === 'disinfect')) this.train('firstAid', SKILL_XP.treatment);
      const where = t.part ? PART_INFO[t.part].label.toLowerCase() : '';
      if (treatment === 'bandage' && t.part) message = `Bandaged your ${where}`;
      else if (treatment === 'splint' && t.part) message = `Splinted your ${where}`;
      else if (treatment === 'disinfect') message = 'Disinfected your wounds';
      else if (treatment === 'painkiller') message = 'Took painkillers';
    }
    this.showToast(message, def.icon);
    this.sound(def.category === 'drink' || def.category === 'stimulant' ? 'drink' : def.category === 'medical' ? 'bandage' : def.category === 'literature' ? 'ui' : 'eat');
    return true;
  }

  private bestSupply(): ConsumableId | null {
    const v = this.vitals;
    const haveItem = (id: ConsumableId) => this.bag.items.some((i) => i.def === id);
    // Injuries come first: stop the bleeding, set the bone, kill the pain
    if (bandageTarget(this.body)?.bleeding && haveItem('bandage')) return 'bandage';
    if (this.body.fractures.some((f) => !f.splinted) && haveItem('splint')) return 'splint';
    if (this.pain > 40 && this.body.painkiller <= 0 && haveItem('painkillers')) return 'painkillers';
    const has = (cat: string): ConsumableId | undefined =>
      cat === 'medical'
        ? haveItem('bandage') ? 'bandage' : undefined
        : (this.bag.items.find((i) => ITEM_DEFS[i.def].category === cat)?.def as ConsumableId | undefined);
    const needs: [number, string][] = [
      [100 - v.health, 'medical'],
      [100 - v.hydration, 'drink'],
      [100 - v.hunger, 'food'],
      [Math.max(v.exhausted ? 90 : 80 - v.stamina, this.condition.fatigue - 60), 'stimulant'],
    ];
    needs.sort((a, b) => b[0] - a[0]);
    for (const [need, cat] of needs) {
      if (need <= 10) break;
      const id = has(cat);
      if (id) return id;
    }
    return null;
  }

  /** Queue a melee swing (applied on the next update). */
  attack() {
    if (this.deadTimer > 0 || this.sleeping || !this.ready) return;
    this.swingRequested = true;
  }

  /**
   * Shove (V / HUD button): pushes zombies in front back and may knock them
   * down (stronger survivors topple more). With a downed zombie at your feet
   * it becomes a stomp. Returns true when it happened.
   */
  shove(): boolean {
    if (this.deadTimer > 0 || this.sleeping || !this.ready || !this.canAct || this.shoveCooldown > 0) return false;
    const f = this.aim ?? this.vision.getFacing();
    const x = this.feet.x;
    const y = this.feet.y - 4;
    const stomp = this.sim.downedNear(x, y, f, STOMP.range) !== null;
    const cost = stomp ? STOMP.stamina : SHOVE.stamina;
    const winded = this.vitals.stamina < cost;
    this.vitals = { ...this.vitals, stamina: Math.max(0, this.vitals.stamina - cost) };
    const strength = this.condition.strength.level;
    this.sound(stomp ? 'hit' : 'shove');
    const mul = stomp
      ? meleeMultiplier({ strengthLevel: strength, bodyMul: this.bodyMods.meleeMul, tired: this.condition.fatigue >= 75, winded, heavy: false, crit: false })
      : (0.6 + 0.08 * strength) * (winded ? 0.5 : 1) * this.bodyMods.meleeMul;
    const strike: ZombieStrike = { x: Math.round(x), y: Math.round(y), f: Math.round(f * 1000) / 1000, k: stomp ? 'stomp' : 'shove', m: Math.round(mul * 100) / 100 };
    this.shoveCooldown = stomp ? STOMP.cooldown : SHOVE.cooldown;
    this.swingAge = 0;
    this.swingFacing = f;
    this.swingKind = stomp ? 'stomp' : 'shove';
    this.swingRange = stomp ? STOMP.range : SHOVE.range;
    this.swingArc = stomp ? Math.PI / 3 : SHOVE.arc;
    this.swingsThisFrame++;
    if (this.authority === 'host') this.remoteStrikes.push({ strike, from: this.selfId() });
    else if (this.authority === 'client') this.net?.sendStrike(strike);
    return true;
  }

  /** Jumping needs two working legs; says why when it can't. */
  tryJump(): boolean {
    if (this.sleeping || this.deadTimer > 0) return false;
    if (!this.bodyMods.canJump) {
      this.showToast("Can't jump on a broken leg", 'bone');
      return false;
    }
    return true;
  }

  // ------------------------------------------------------------ sleep API

  /** Beds and sofas from the map (MapThemeConfig.restSpots). */
  setRestSpots(spots: RestSpot[]) {
    this.restSpots = spots;
  }

  isAsleep(): boolean {
    return !!this.sleeping;
  }

  /**
   * Sleep key / HUD button: lies down in the nearest bed or sofa (or on the
   * floor), or gets up if already asleep. Returns true when the state changed.
   */
  sleepAction(): boolean {
    if (this.sleeping) {
      this.wakeUp('manual');
      return true;
    }
    if (this.deadTimer > 0 || !this.ready) return false;
    const block = sleepBlock(this.condition, this.vitals, this.nearestHunterTiles, this.bodySleepInfo());
    if (block) {
      if (SLEEP_BLOCK_TEXT[block]) this.showToast(SLEEP_BLOCK_TEXT[block], 'bed');
      return false;
    }
    const spot: SleepSpot = this.nearRest?.kind ?? 'floor';
    this.sleeping = { spot, quality: SLEEP.quality[spot] };
    this.barricade = null;
    this.triggerHeld = false;
    this.reloadT = -1;
    this.showToast(spot === 'floor' ? 'You curl up on the floor…' : `You lie down on the ${spot}…`, 'moon');
    return true;
  }

  /** Gets up (manual) or is woken (threat, hurt, hunger, rested). */
  wakeUp(reason: WakeReason = 'manual') {
    if (!this.sleeping) return;
    this.sleeping = null;
    if (reason === 'threat' || reason === 'hurt') {
      const calm = this.condition.panic;
      this.condition = startle(this.condition);
      this.condition.panic = Math.min(100, calm + (this.condition.panic - calm) * this.mods.panicMul);
    }
    this.showToast(WAKE_TEXT[reason], reason === 'rested' ? 'sun' : reason === 'manual' ? 'bed' : 'warning');
  }


  // ------------------------------------------------------------ inventory & containers

  /** Searchable furniture from the map (MapThemeConfig.containers). Same seed on every client. */
  setContainers(spawns: ContainerSpawn[], seed: number) {
    this.store = new ContainerStore(spawns, seed);
    this.store.agingClock = this.agingClockNow;
    this.addTrunks();
  }

  /** The inventory screen is open (the HUD then carries the full item list). */
  setInventoryOpen(open: boolean) {
    this.inventoryOpen = open;
  }

  /** E next to a container: opens its loot window, or closes the one that's open. */
  toggleLoot(): boolean {
    if (this.openContainerId !== null) {
      this.openContainerId = null;
      return true;
    }
    if (this.nearContainerId === null || this.sleeping || this.deadTimer > 0 || !this.ready) return false;
    this.openContainerId = this.nearContainerId;
    return true;
  }

  closeLoot() {
    this.openContainerId = null;
  }

  /** Weight worn (bag, clothes). */
  private equippedWeight(): number {
    let w = 0;
    for (const it of Object.values(this.equipped)) if (it) w += stackWeight(it);
    return w;
  }

  /** Everything you carry: bag, weapons, ammo and what you wear (kg). */
  carriedWeight(): number {
    let w = bagWeight(this.bag) + this.equippedWeight();
    for (const id of this.owned) if (id !== 'fists') w += WEAPONS[id].weight;
    for (const k of Object.keys(this.reserve) as AmmoType[]) w += this.reserve[k] * AMMO_ROUND_KG;
    return w;
  }

  /** Strength sets the base; a worn bag adds to it. */
  capacity(): number {
    const back = this.equipped.back;
    return carryCapacity(this.condition.strength) + this.mods.carryKg + (back ? ITEM_DEFS[back.def].equip?.capacityKg ?? 0 : 0);
  }

  /** Why an item can't come with you right now (null = it can). */
  private cannotReceive(item: InventoryItem): string | null {
    if (item.def.startsWith('weapon:')) {
      const w = item.def.slice(7) as WeaponId;
      if (this.owned.has(w)) return `You already carry a ${WEAPONS[w].name}`;
    }
    if (this.carriedWeight() + stackWeight(item) > this.capacity() + 1e-6) return 'Too heavy to carry';
    if (!item.def.startsWith('weapon:') && !item.def.startsWith('ammo:') && this.bag.items.length >= this.bag.slots) return 'No room in your bag';
    return null;
  }

  /**
   * An item arrives in your hands: ammo to the pouch, weapons to your belt
   * (keeping their wear and magazine), everything else into the bag.
   * `force` skips the weight limit (the host already handed it over).
   */
  private receiveItem(item: InventoryItem, force = false): boolean {
    if (!force && this.cannotReceive(item)) return false;
    if (item.def.startsWith('ammo:')) {
      const a = item.def.slice(5) as AmmoType;
      this.reserve[a] += item.qty;
      return true;
    }
    if (item.def.startsWith('weapon:')) {
      const w = item.def.slice(7) as WeaponId;
      if (this.owned.has(w)) return false;
      this.owned.add(w);
      const max = maxDurability(w);
      if (Number.isFinite(max)) this.durability[w] = Math.max(1, Math.round((item.cond ?? 1) * max));
      if (WEAPONS[w].ammo) this.mags[w] = item.mag ?? 0;
      return true;
    }
    const r = addItemToBag(this.bag, { ...item, uid: `s${this.uidSeq++}` }, force);
    if (r.added) {
      this.bag = r.bag;
      this.gotItem(item);
    }
    return r.added;
  }

  /** "+2 Planks" over your head, and a blip. */
  private gotItem(item: InventoryItem) {
    this.sound('pickup');
    this.feedback.text(this.feet.x, this.feet.y - 34, `+${item.qty} ${ITEM_DEFS[item.def].name}`, '#86EFAC', 10);
  }

  /** Takes an item out of your inventory by its HUD key ('b:uid', 'w:weapon', 'a:ammo', 'e:slot'). */
  private removeByKey(key: string, qty?: number): InventoryItem | null {
    const [kind, ref] = [key.slice(0, 1), key.slice(2)];
    if (kind === 'b') {
      const it = this.bag.items.find((i) => i.uid === ref);
      if (!it) return null;
      const n = Math.min(it.qty, Math.max(1, Math.floor(qty ?? it.qty)));
      this.bag = removeFromBag(this.bag, ref, n).bag;
      return { ...it, qty: n };
    }
    if (kind === 'w') {
      const w = ref as WeaponId;
      if (w === 'fists' || !this.owned.has(w)) return null;
      const max = maxDurability(w);
      const item: InventoryItem = { uid: key, def: `weapon:${w}`, qty: 1 };
      if (Number.isFinite(max)) item.cond = Math.max(0, (this.durability[w] ?? max) / max);
      if (WEAPONS[w].ammo) item.mag = this.mags[w] ?? 0;
      this.owned.delete(w);
      delete this.durability[w];
      delete this.mags[w];
      if (this.weapon === w) {
        this.weapon = MELEE_ORDER.find((m) => this.owned.has(m)) ?? 'fists';
        this.reloadT = -1;
      }
      return item;
    }
    if (kind === 'a') {
      const a = ref as AmmoType;
      const n = Math.min(this.reserve[a] ?? 0, Math.floor(qty ?? this.reserve[a] ?? 0));
      if (n <= 0) return null;
      this.reserve[a] -= n;
      return { uid: key, def: `ammo:${a}`, qty: n };
    }
    if (kind === 'e') {
      const slot = ref as EquipSlot;
      const it = this.equipped[slot];
      if (!it) return null;
      delete this.equipped[slot];
      return it;
    }
    return null;
  }

  /** Something you couldn't keep (or a failed hand-over) lands at your feet. */
  private dropToGround(item: InventoryItem) {
    this.requestPut(-1, item);
  }

  /** Put into container `c` (-1: the ground at your feet). The host applies it; clients wait for the ack. */
  private requestPut(c: number, item: InventoryItem) {
    if (this.authority === 'host') {
      const target = c === -1 ? this.store.groundPileAt(this.feet.x, this.feet.y) : this.store.get(c);
      if (target && this.store.put(target.id, item)) return;
      this.receiveItem(item, true);
      this.showToast('No room in there', 'package');
      return;
    }
    if (this.authority !== 'client' || !this.net) {
      this.receiveItem(item, true);
      this.showToast('Still connecting…', 'package');
      return;
    }
    const r = ++this.invReq;
    this.pendingInv.set(r, { op: 'put', c, item, at: this.elapsed });
    this.net.sendInv({ r, c, o: 'p', it: encodeItem(item) });
  }

  /** Take the stack at `index` from the open container. */
  lootTake(index: number): boolean {
    const id = this.openContainerId;
    const c = id === null ? null : this.store.get(id);
    const it = c?.contents[index];
    if (!c || !it || this.deadTimer > 0) return false;
    if ([...this.pendingInv.values()].some((p) => p.op === 'take' && p.c === c.id && p.item?.def === it.def)) return false;
    const why = this.cannotReceive(it);
    if (why) {
      this.showToast(why, ITEM_DEFS[it.def].icon);
      return false;
    }
    if (this.authority === 'host') {
      const taken = this.store.take(c.id, it.def, it.qty, this.elapsed, index);
      if (!taken) return false;
      if (!this.receiveItem(taken, true)) this.dropToGround(taken);
      return true;
    }
    if (this.authority !== 'client' || !this.net) {
      this.showToast('Still connecting…', 'package');
      return false;
    }
    const r = ++this.invReq;
    this.pendingInv.set(r, { op: 'take', c: c.id, item: { ...it }, at: this.elapsed });
    this.net.sendInv({ r, c: c.id, o: 't', it: encodeItem(it), i: index });
    return true;
  }

  /** Take everything that fits (a few stacks at a time, to respect the socket budget). */
  lootTakeAll(): number {
    const id = this.openContainerId;
    const c = id === null ? null : this.store.get(id);
    if (!c) return 0;
    let n = 0;
    for (let i = c.contents.length - 1; i >= 0 && n < LOOT_ALL_MAX; i--) {
      if (this.cannotReceive(c.contents[i])) continue;
      if (this.lootTake(i)) n++;
    }
    if (!n && c.contents.length) this.showToast('Too heavy to carry', 'backpack');
    return n;
  }

  /** Inventory screen actions on one entry (keys from the HUD). */
  inventoryAction(key: string, action: InvAction): boolean {
    if (this.deadTimer > 0 || this.sleeping) return false;
    const [kind, ref] = [key.slice(0, 1), key.slice(2)];
    switch (action) {
      case 'use': {
        const it = this.bag.items.find((i) => i.uid === ref);
        return !!it && this.useSupply(it.def as ConsumableId, it.uid);
      }
      case 'wield':
        return kind === 'w' && this.selectWeapon(ref as WeaponId);
      case 'equip': {
        const it = this.bag.items.find((i) => i.uid === ref);
        const spec = it ? ITEM_DEFS[it.def].equip : undefined;
        if (!it || !spec) return false;
        this.bag = removeFromBag(this.bag, it.uid, it.qty).bag;
        const old = this.equipped[spec.slot];
        this.equipped[spec.slot] = { ...it, qty: 1 };
        if (old) this.receiveItem(old, true);
        this.showToast(`Wearing ${ITEM_DEFS[it.def].name}`, ITEM_DEFS[it.def].icon);
        return true;
      }
      case 'unequip': {
        const it = this.removeByKey(key);
        if (!it) return false;
        this.receiveItem(it, true);
        return true;
      }
      case 'split': {
        const it = this.bag.items.find((i) => i.uid === ref);
        if (!it || it.qty < 2) return false;
        this.bag = splitStack(this.bag, it.uid, Math.floor(it.qty / 2), () => `s${this.uidSeq++}`);
        return true;
      }
      case 'drop':
      case 'put': {
        const target = action === 'put' ? this.openContainerId : -1;
        if (target === null) return false;
        const it = this.removeByKey(key);
        if (!it) return false;
        this.requestPut(target, it);
        return true;
      }
      case 'repair':
        return this.repair(key);
      case 'destroy': {
        const it = this.removeByKey(key);
        if (it) this.showToast(`Destroyed ${ITEM_DEFS[it.def].name}`, ITEM_DEFS[it.def].icon);
        return !!it;
      }
    }
    return false;
  }

  /** Everything on you, as items (for the body you leave behind). */
  private allCarried(): InventoryItem[] {
    const out: InventoryItem[] = this.bag.items.map((i) => ({ ...i }));
    for (const it of Object.values(this.equipped)) if (it) out.push({ ...it });
    for (const w of this.owned) {
      if (w === 'fists') continue;
      const max = maxDurability(w);
      const it: InventoryItem = { uid: `w:${w}`, def: `weapon:${w}`, qty: 1 };
      if (Number.isFinite(max)) it.cond = Math.max(0, (this.durability[w] ?? max) / max);
      if (WEAPONS[w].ammo) it.mag = this.mags[w] ?? 0;
      out.push(it);
    }
    for (const a of Object.keys(this.reserve) as AmmoType[]) {
      if (this.reserve[a] > 0) out.push({ uid: `a:${a}`, def: `ammo:${a}`, qty: this.reserve[a] });
    }
    return out;
  }

  /** Warmth and bite protection from what you wear (condition wears protection down). */
  private clothing(): { insulation: number; protection: Partial<Record<BodyPart, number>> } {
    let insulation = 0;
    const protection: Partial<Record<BodyPart, number>> = {};
    for (const [slot, it] of Object.entries(this.equipped) as [EquipSlot, InventoryItem | undefined][]) {
      const spec = it ? ITEM_DEFS[it.def].equip : undefined;
      if (!it || !spec) continue;
      insulation += spec.insulation ?? 0;
      const p = (spec.protection ?? 0) * (it.cond ?? 1);
      for (const part of COVERS[slot]) protection[part] = Math.max(protection[part] ?? 0, p);
    }
    // Thick Skinned: a little extra on every part, on top of clothes
    if (this.mods.protection > 0) {
      for (const part of BODY_PARTS) protection[part] = 1 - (1 - (protection[part] ?? 0)) * (1 - this.mods.protection);
    }
    return { insulation, protection };
  }

  /** Host: inventory requests from clients, checked against where we last saw them. */
  private handleRemoteInv(others: SimTarget[]) {
    const ops = this.remoteInv;
    this.remoteInv = [];
    for (const { op, from } of ops) {
      const who = others.find((o) => o.id === from);
      const item = decodeItem(op.it, 'r');
      let ok = false;
      let taken: InventoryItem | null = null;
      if (who && item) {
        if (op.c === -1) {
          if (op.o === 'p') ok = this.store.put(this.store.groundPileAt(who.x, who.y).id, item);
        } else {
          const c = this.store.get(op.c);
          if (c && this.containerDistance(c, who.x, who.y) <= CONTAINER_REACH * 2 + 8) {
            if (op.o === 't') {
              taken = this.store.take(op.c, item.def, item.qty, this.elapsed, typeof op.i === 'number' ? op.i : -1);
              ok = !!taken;
            } else {
              ok = this.store.put(op.c, item);
            }
          }
        }
      }
      this.outAcks.push(taken ? [from, op.r, 1, ...encodeItem(taken)] : [from, op.r, ok ? 1 : 0]);
    }
  }

  /** Client: the host answered our requests. */
  private applyAcks(acks: InvAck[]) {
    const selfId = this.net?.selfId;
    for (const ack of acks) {
      if (!Array.isArray(ack) || ack[0] !== selfId) continue;
      const p = this.pendingInv.get(ack[1]);
      if (!p) continue;
      this.pendingInv.delete(ack[1]);
      if (p.op === 'take') {
        if (ack[2] !== 1) {
          this.showToast('Someone got there first', 'package');
          continue;
        }
        const got = decodeItem(ack.slice(3), `s${this.uidSeq++}`);
        if (got && !this.receiveItem(got, true)) this.dropToGround(got);
      } else if (p.op === 'build') {
        if (ack[2] !== 1) {
          for (const it of p.refund ?? []) this.receiveItem(it, true);
          this.showToast("Couldn't build there", 'close');
        }
      } else if (p.op === 'dismantle') {
        if (ack[2] === 1) for (const it of p.refund ?? []) if (!this.receiveItem(it, true)) this.dropToGround(it);
      } else if (p.op === 'claim') {
        if (ack[2] !== 1) this.showToast("Couldn't claim it", 'house');
      } else if (p.op === 'vehicle') {
        if (ack[2] === 1) {
          const got = ack.length > 3 ? decodeItem(ack.slice(3), `v${this.uidSeq++}`) : null;
          if (got && !this.receiveItem(got, true)) this.dropToGround(got);
          if (p.act) this.afterVehicleOp(p.c, p.act);
          if (p.label) this.showToast(p.label, 'car');
        } else if (p.act !== 'exit') {
          for (const it of p.refund ?? []) this.receiveItem(it, true);
          this.showToast("Couldn't do that", 'close');
        }
      } else if (p.op === 'utility') {
        if (ack[2] === 1) {
          for (const it of p.reward ?? []) if (!this.receiveItem(it, true)) this.dropToGround(it);
          // A harvest or a catch comes back with the ack
          const got = ack.length > 3 ? decodeItem(ack.slice(3), `u${this.uidSeq++}`) : null;
          if (got && !this.receiveItem(got, true)) this.dropToGround(got);
          if (p.label) this.showToast(got ? `${p.label}: ${got.qty} × ${ITEM_DEFS[got.def].name}` : p.label, 'check');
        } else {
          for (const it of p.refund ?? []) this.receiveItem(it, true);
          this.showToast("Couldn't do that", 'close');
        }
      } else if (ack[2] !== 1 && p.item) {
        this.receiveItem(p.item, true);
        this.showToast('No room in there', 'package');
      }
    }
  }

  /** Requests the host never answered (it left, the channel dropped): give puts back, forget takes. */
  private expirePending() {
    for (const [r, p] of this.pendingInv) {
      if (this.elapsed - p.at < INV_TIMEOUT_SECONDS) continue;
      this.pendingInv.delete(r);
      if (p.op === 'put' && p.item) this.receiveItem(p.item, true);
      if (p.op === 'build' || p.op === 'utility' || (p.op === 'vehicle' && p.act !== 'exit')) for (const it of p.refund ?? []) this.receiveItem(it, true);
    }
  }

  /** The nearest container you could search (no wall in between). */
  private findNearContainer(): number | null {
    const fx = this.feet.x;
    const fy = this.feet.y - 4;
    const g = this.vision.grid;
    const c = this.store.near(fx, fy, CONTAINER_REACH, (box) => {
      const w = box.w ?? 0;
      const h = box.h ?? 0;
      const px = Math.max(box.x, Math.min(box.x + w, fx));
      const py = Math.max(box.y, Math.min(box.y + h, fy));
      return wallsBetween(g, fx, fy, px, py, 1) === 0;
    });
    return c ? c.id : null;
  }

  private itemHud(key: string, it: InventoryItem, actions: InvAction[], extra: Partial<ItemHud> = {}): ItemHud {
    const d = ITEM_DEFS[it.def];
    const e = d.equip;
    const detail = e
      ? [e.capacityKg ? `+${e.capacityKg} kg carry` : '', e.insulation ? `warmth +${e.insulation} °C` : '', e.protection ? `bite protection ${Math.round(e.protection * (it.cond ?? 1) * 100)}%` : '']
          .filter(Boolean)
          .join(' · ')
      : null;
    return {
      key,
      name: d.name,
      icon: d.icon,
      category: d.category,
      qty: it.qty,
      weight: Math.round(stackWeight(it) * 100) / 100,
      cond: it.cond ?? null,
      mag: it.mag ?? null,
      description: d.description,
      detail: detail || null,
      equipped: false,
      wielded: false,
      pending: false,
      freshness: isPerishable(it.def) ? this.freshnessIn(it, key.startsWith('c:') ? (this.openContainer()?.kind ?? 'bag') : 'bag') : null,
      actions,
      ...extra,
    };
  }

  /** Your inventory as the HUD shows it (only built while a panel is open). */
  private inventoryHud(): InventoryHud {
    const loot = this.openContainerId !== null;
    const items: ItemHud[] = [];
    for (const [slot, it] of Object.entries(this.equipped) as [EquipSlot, InventoryItem | undefined][]) {
      if (!it) continue;
      const actions: InvAction[] = ['unequip', ...(this.canRepair(`e:${slot}`) ? ['repair' as const] : []), ...(loot ? ['put' as const] : []), 'drop', 'destroy'];
      items.push(this.itemHud(`e:${slot}`, it, actions, { equipped: true }));
    }
    for (const w of WEAPON_ORDER) {
      if (!this.owned.has(w)) continue;
      const max = maxDurability(w);
      const it: InventoryItem = { uid: w, def: `weapon:${w}`, qty: 1 };
      if (Number.isFinite(max)) it.cond = Math.max(0, (this.durability[w] ?? max) / max);
      if (WEAPONS[w].ammo) it.mag = this.mags[w] ?? 0;
      const actions: InvAction[] =
        w === 'fists'
          ? []
          : [...(w !== this.weapon ? ['wield' as const] : []), ...(this.canRepair(`w:${w}`) ? ['repair' as const] : []), ...(loot ? ['put' as const] : []), 'drop', 'destroy'];
      if (w === 'fists' && w !== this.weapon) actions.push('wield');
      items.push(this.itemHud(`w:${w}`, it, actions, { wielded: w === this.weapon, weight: w === 'fists' ? 0 : WEAPONS[w].weight }));
    }
    for (const a of Object.keys(this.reserve) as AmmoType[]) {
      if (this.reserve[a] > 0) items.push(this.itemHud(`a:${a}`, { uid: a, def: `ammo:${a}`, qty: this.reserve[a] }, [...(loot ? ['put' as const] : []), 'drop', 'destroy']));
    }
    for (const it of this.bag.items) {
      const d = ITEM_DEFS[it.def];
      const actions: InvAction[] = [];
      if (d.consume) actions.push('use');
      if (d.equip) actions.push('equip');
      if (this.canRepair(`b:${it.uid}`)) actions.push('repair');
      if (loot) actions.push('put');
      actions.push('drop');
      if (it.qty > 1) actions.push('split');
      actions.push('destroy');
      items.push(this.itemHud(`b:${it.uid}`, it, actions));
    }
    items.sort((p, q) => CATEGORY_ORDER[p.category] - CATEGORY_ORDER[q.category] || Number(q.equipped) - Number(p.equipped) || p.name.localeCompare(q.name));
    return { weight: Math.round(this.carriedWeight() * 10) / 10, capacity: Math.round(this.capacity() * 10) / 10, items };
  }

  private lootHud(): LootHud | null {
    const c = this.openContainerId === null ? null : this.store.get(this.openContainerId);
    if (!c) return null;
    const pending = new Set<string>();
    for (const p of this.pendingInv.values()) if (p.op === 'take' && p.c === c.id && p.item) pending.add(p.item.def);
    const cap = CONTAINER_CAPACITY[c.kind];
    return {
      id: c.id,
      label: CONTAINER_LABELS[c.kind],
      kind: c.kind,
      items: c.contents.map((it, i) => this.itemHud(`c:${i}`, it, ['take'], { pending: pending.has(it.def) })),
      weight: Math.round(containerWeight(c) * 10) / 10,
      capacity: Number.isFinite(cap) ? cap : null,
    };
  }


  // ------------------------------------------------------------ survivor & skills

  /** Survival spaces: a survivor must be created before the first spawn and after every death. */
  /** While the saved survivor is being fetched, the creator waits (so a new one can't overwrite it). */
  setLoadingSurvivor(on: boolean) {
    this.loadingSurvivor = on;
  }

  setRequireCharacterCreation(on: boolean) {
    this.requireCharacterCreation = on;
    if (on && this.deadTimer <= 0) this.ready = false;
  }

  /** Waiting for character creation (not in the world yet). */
  isCreating(): boolean {
    return !this.ready;
  }

  /**
   * Starts a new life with this build: starting fitness, strength and skills,
   * trait effects and occupation gear. Returns the problems (empty = started).
   */
  createSurvivor(build: SurvivorBuild): string[] {
    const errors = buildErrors(build);
    if (errors.length) return errors;
    if (this.deadTimer > 0) return ['Wait until you are back on your feet.'];
    const s = startingStats(build);
    this.survivor = { name: build.name.trim(), occupation: build.occupation, traits: [...build.traits] };
    this.mods = survivorModifiers(this.survivor);
    this.skills = s.skills;
    this.booksRead = {};
    this.knownRecipes = new Set();
    this.vitals = freshVitals();
    this.body = freshBody();
    this.pain = 0;
    this.lastStage = 'none';
    this.condition = { ...freshCondition(), fitness: { level: s.fitness, xp: 0 }, strength: { level: s.strength, xp: 0 } };
    const occ = OCCUPATIONS[build.occupation];
    for (const it of occ.items) this.receiveItem({ uid: `o${this.uidSeq++}`, def: it.def, qty: it.qty }, true);
    this.ready = true;
    this.showToast(`${this.survivor.name}, ${occ.label}`, occ.icon);
    return [];
  }

  /** Adds XP to a skill with every multiplier (traits, books) and announces level-ups. */
  private train(skill: SkillId, amount: number) {
    if (amount <= 0) return;
    const r = trainSkill(this.skills, skill, amount, { learnMul: this.mods.learnMul * this.rules.xp, combatMul: this.mods.combatXpMul, books: this.booksRead });
    this.skills = r.set;
    if (r.leveledUp) {
      this.showToast(`${SKILLS[skill].label} up — level ${this.skills[skill].level}`, SKILLS[skill].icon);
      this.sound('level');
      this.feedback.text(this.feet.x, this.feet.y - 46, `${SKILLS[skill].label} ${this.skills[skill].level}`, '#FACC15', 13);
    }
  }

  /** Reading a skill book (you keep it). */
  private readSkillBook(skill: SkillId, volume: BookVolume, name: string): boolean {
    const read = this.booksRead[skill] ?? [];
    if (read.includes(volume)) {
      this.showToast(`You've already read ${name}`, 'bookText');
      return false;
    }
    this.booksRead = { ...this.booksRead, [skill]: [...read, volume] };
    this.useCooldown = USE_COOLDOWN;
    const b = SKILL_BOOKS[volume];
    this.showToast(`Read ${name}: ${SKILLS[skill].label} ×${b.mul} XP to level ${b.to + 1}`, 'bookText');
    return true;
  }

  private reloadSeconds(spec: WeaponSpec): number {
    return spec.reloadSeconds * reloadTimeMul(this.skills.reloading.level);
  }

  private barricadeSeconds(): number {
    return BARRICADE_SECONDS * barricadeTimeMul(this.skills.carpentry.level);
  }

  private hasItem(def: string): boolean {
    return this.bag.items.some((i) => i.def === def);
  }

  private useUpOne(def: string) {
    const it = this.bag.items.find((i) => i.def === def);
    if (it) this.bag = removeFromBag(this.bag, it.uid, 1).bag;
  }

  /** Weapons mend with duct tape (Maintenance), clothes with thread (Tailoring). */
  private canRepair(key: string): boolean {
    const [kind, ref] = [key.slice(0, 1), key.slice(2)];
    if (kind === 'w') {
      const max = maxDurability(ref as WeaponId);
      return Number.isFinite(max) && (this.durability[ref as WeaponId] ?? max) < max && this.hasItem('duct_tape');
    }
    const it = kind === 'e' ? this.equipped[ref as EquipSlot] : kind === 'b' ? this.bag.items.find((i) => i.uid === ref) : undefined;
    return !!it && !!ITEM_DEFS[it.def].equip?.protection && (it.cond ?? 1) < 1 && this.hasItem('thread');
  }

  private repair(key: string): boolean {
    if (!this.canRepair(key)) return false;
    const [kind, ref] = [key.slice(0, 1), key.slice(2)];
    if (kind === 'w') {
      const w = ref as WeaponId;
      const max = maxDurability(w);
      this.useUpOne('duct_tape');
      this.durability[w] = Math.min(max, (this.durability[w] ?? max) + Math.round(repairAmount(this.skills.maintenance.level) * max));
      this.train('maintenance', SKILL_XP.repair);
      this.showToast(`Taped up your ${WEAPONS[w].name}`, WEAPONS[w].icon);
      return true;
    }
    this.useUpOne('thread');
    const mend = (it: InventoryItem): InventoryItem => ({ ...it, cond: Math.min(1, (it.cond ?? 1) + repairAmount(this.skills.tailoring.level)) });
    if (kind === 'e') {
      const it = this.equipped[ref as EquipSlot];
      if (it) this.equipped[ref as EquipSlot] = mend(it);
    } else {
      this.bag = { ...this.bag, items: this.bag.items.map((i) => (i.uid === ref ? mend(i) : i)) };
    }
    this.train('tailoring', SKILL_XP.mend);
    this.showToast('Mended with thread', 'shirt');
    return true;
  }

  private skillHud(): SkillHud[] {
    return SKILL_IDS.map((id) => ({
      id,
      label: SKILLS[id].label,
      group: SKILLS[id].group,
      icon: SKILLS[id].icon,
      level: this.skills[id].level,
      progress: Math.round(levelProgress(this.skills[id]) * 20) / 20,
      practice: SKILLS[id].practice,
      effect: SKILLS[id].effect,
      practisable: SKILLS[id].practisable,
      book: bookMultiplier(this.booksRead[id], this.skills[id].level),
    }));
  }

  private survivorHud(): SurvivorHud {
    const occ = OCCUPATIONS[this.survivor.occupation];
    return {
      name: this.survivor.name,
      occupation: occ.label,
      occupationIcon: occ.icon,
      traits: this.survivor.traits.map((t) => ({ label: TRAITS[t].label, positive: TRAITS[t].cost > 0 })),
    };
  }


  // ------------------------------------------------------------ crafting & building

  /** The crafting screen is open (the HUD then carries the recipe list). */
  setCraftOpen(open: boolean) {
    this.craftOpen = open;
  }

  /** How many of an item you have: bag stacks, ammo in the pouch, 1 per carried weapon. */
  private countItem(def: ItemDefId): number {
    if (def.startsWith('weapon:')) return this.owned.has(def.slice(7) as WeaponId) ? 1 : 0;
    if (def.startsWith('ammo:')) return this.reserve[def.slice(5) as AmmoType] ?? 0;
    let n = 0;
    for (const it of this.bag.items) if (it.def === def) n += it.qty;
    return n;
  }

  /**
   * Takes materials out of the bag (an input's `alt` items count too); returns
   * exactly what was taken, condition and age included, to refund a refused build
   * or to know the condition of a part being fitted.
   */
  private spend(list: { def: ItemDefId; qty: number; alt?: ItemDefId[] }[]): InventoryItem[] {
    const out: InventoryItem[] = [];
    for (const { def, qty, alt } of list) {
      let left = qty;
      for (const d of [def, ...(alt ?? [])]) {
        for (const it of [...this.bag.items]) {
          if (left <= 0) break;
          if (it.def !== d) continue;
          const n = Math.min(left, it.qty);
          this.bag = removeFromBag(this.bag, it.uid, n).bag;
          out.push({ ...it, uid: `r${this.uidSeq++}`, qty: n });
          left -= n;
        }
      }
    }
    return out;
  }

  private nearWorkbench(): boolean {
    const g = this.vision.grid;
    for (const [tile, b] of this.built) {
      if (b.kind !== 'workbench') continue;
      const c = tile % g.cols;
      const x = (c + 0.5) * g.tileSize;
      const y = ((tile - c) / g.cols + 0.5) * g.tileSize;
      if (Math.hypot(x - this.feet.x, y - this.feet.y) <= WORKBENCH_REACH) return true;
    }
    return false;
  }

  private craftContext(): CraftContext {
    return { count: (d) => this.countItem(d), skills: this.skills, known: this.knownRecipes, nearWorkbench: this.nearWorkbench(), nearHeat: this.nearHeat() };
  }

  /**
   * Starts a recipe: items are made after a short stand-still; structures put
   * you into placement (a ghost on the tile you face; E or "Build here" to put it up).
   */
  craft(id: RecipeId): boolean {
    const r = RECIPES[id];
    if (!r || this.deadTimer > 0 || this.sleeping || !this.ready) return false;
    const st = recipeStatus(r, this.craftContext(), (d) => ITEM_DEFS[d].name);
    if (!st.ok) {
      this.showToast(`Can't make ${r.name}: ${st.missing[0]}`, r.icon);
      return false;
    }
    const kind = structureOf(r);
    this.crafting = null;
    this.constructing = null;
    if (kind) {
      this.placing = { id, kind };
      this.showToast(`Placing ${STRUCTURES[kind].label}: face a spot and press E`, STRUCTURES[kind].icon);
      return true;
    }
    this.placing = null;
    this.crafting = { id, t: 0, total: craftSeconds(r, this.skills, this.nearWorkbench()) };
    return true;
  }

  /** Stops crafting, placing or building. */
  cancelCraft() {
    if (this.crafting || this.placing || this.constructing) this.showToast('Stopped', 'close');
    this.crafting = null;
    this.placing = null;
    this.constructing = null;
  }

  isPlacing(): boolean {
    return this.placing !== null;
  }

  /** Your survival hitbox (WorldGame.playerHitbox): 12 × 10 px, 6 either side of the feet, 8 up and 2 down. */
  private selfBox(): Rect {
    return { x: this.feet.x - 6, y: this.feet.y - 8, w: 12, h: 10 };
  }

  /**
   * The tile in front of you (where a placed structure goes): probed far
   * enough from the hitbox centre that it never overlaps your own hitbox.
   */
  private targetTile(): { col: number; row: number; tile: number } {
    const g = this.vision.grid;
    const f = this.aim ?? this.vision.getFacing();
    const x = this.feet.x + Math.cos(f) * 23;
    const y = this.feet.y - 3 + Math.sin(f) * 23;
    const { col, row } = worldToTile(g, x, y);
    return { col, row, tile: tileIndex(g, col, row) };
  }

  /** Why a structure can't go on `tile` for `owner` (null = it can). */
  private placeProblem(tile: number, owner: string, from: { x: number; y: number }, kind?: StructureKind): PlaceBlock | null {
    const g = this.vision.grid;
    const col = tile % g.cols;
    const row = (tile - col) / g.cols;
    const x = (col + 0.5) * g.tileSize;
    const y = (row + 0.5) * g.tileSize;
    if (Math.hypot(x - from.x, y - from.y) > BUILD_REACH * 1.6) return 'tooFar';
    // Plots and snares go in the ground, outdoors
    const k = kind ?? this.constructing?.kind ?? this.placing?.kind;
    if (k && STRUCTURES[k].soil) {
      const ground = inBounds(g, col, row) ? this.groundAt(x, y) : null;
      if ((ground !== 'grass' && ground !== 'park' && ground !== 'dirt') || g.flags[tile] & TILE_INTERIOR) return 'notSoil';
    }
    // No building on top of a car
    if (this.vehicles.blocksBox({ x: col * g.tileSize + 1, y: row * g.tileSize + 1, w: g.tileSize - 2, h: g.tileSize - 2 })) return 'solid';
    // Other players (host's list) and zombies by their feet; ourselves by our real hitbox
    const selfId = this.selfId();
    const occupants = [...this.lastTargets.filter((t) => t.id !== selfId), ...this.sim.zombies];
    const block = placeBlock(g, col, row, occupants);
    if (block) return block;
    const me = this.selfBox();
    const ts = g.tileSize;
    if (owner === selfId && me.x < (col + 1) * ts && me.x + me.w > col * ts && me.y < (row + 1) * ts && me.y + me.h > row * ts) return 'occupied';
    const claim = this.claimAt(x, y);
    if (claim && claim.owner !== owner) return 'safehouse';
    return null;
  }

  /** E while placing: start building on the tile you face. */
  confirmPlacement(): boolean {
    if (!this.placing || this.constructing) return false;
    const r = RECIPES[this.placing.id];
    const st = recipeStatus(r, this.craftContext(), (d) => ITEM_DEFS[d].name);
    if (!st.ok) {
      this.showToast(`Can't build: ${st.missing[0]}`, r.icon);
      return true;
    }
    const t = this.targetTile();
    const problem = this.placeProblem(t.tile, this.selfId(), { x: this.feet.x, y: this.feet.y - 4 });
    if (problem) {
      this.showToast(PLACE_BLOCK_TEXT[problem], 'close');
      return true;
    }
    const spec = STRUCTURES[this.placing.kind];
    this.constructing = { id: this.placing.id, kind: this.placing.kind, tile: t.tile, t: 0, total: craftSeconds(r, this.skills, false, spec.seconds) };
    return true;
  }

  /** Crafting / building timers, run every frame. Moving away interrupts. */
  private updateCrafting(dt: number, moving: boolean) {
    if (this.deadTimer > 0 || this.sleeping || !this.ready) {
      this.crafting = null;
      this.constructing = null;
      if (this.deadTimer > 0) this.placing = null;
      return;
    }
    if (this.crafting) {
      if (moving) {
        this.crafting = null;
        this.showToast('Crafting interrupted', 'close');
      } else if ((this.crafting.t += dt) >= this.crafting.total) {
        const r = RECIPES[this.crafting.id];
        this.crafting = null;
        const st = recipeStatus(r, this.craftContext(), (d) => ITEM_DEFS[d].name);
        if (!st.ok) {
          this.showToast(`Can't make ${r.name}: ${st.missing[0]}`, r.icon);
        } else if ('items' in r.output) {
          this.spend(r.inputs);
          for (const out of r.output.items) {
            const it: InventoryItem = { uid: `k${this.uidSeq++}`, def: out.def, qty: out.qty };
            if (!this.receiveItem(it, true)) this.dropToGround(it);
          }
          this.train(r.xp.skill, r.xp.amount);
          this.showToast(`Made ${r.name}`, r.icon);
          this.sound('craft');
        }
      }
    }
    if (this.constructing) {
      const c = this.constructing;
      const problem = this.placeProblem(c.tile, this.selfId(), { x: this.feet.x, y: this.feet.y - 4 });
      if (moving || problem) {
        this.constructing = null;
        this.showToast(problem ? PLACE_BLOCK_TEXT[problem] : 'Building interrupted', 'close');
      } else if ((c.t += dt) >= c.total) {
        this.constructing = null;
        const r = RECIPES[c.id];
        if (!recipeStatus(r, this.craftContext(), (d) => ITEM_DEFS[d].name).ok) {
          this.showToast(`Can't build: missing materials`, r.icon);
          this.placing = null;
          return;
        }
        const refund = this.spend(r.inputs);
        this.train(r.xp.skill, r.xp.amount);
        this.requestBuild(c.kind, c.tile, refund);
        const g = this.vision.grid;
        const col = c.tile % g.cols;
        this.feedback.burst('dust', (col + 0.5) * g.tileSize, ((c.tile - col) / g.cols + 0.5) * g.tileSize, 8, '#D6D3D1');
        this.sound('hammer');
        // Keep placing while you can afford another
        if (!recipeStatus(r, this.craftContext(), (d) => ITEM_DEFS[d].name).ok) this.placing = null;
      }
    }
  }

  private requestBuild(kind: StructureKind, tile: number, refund: InventoryItem[]) {
    if (this.authority === 'host') {
      if (this.placeStructure(kind, tile, this.selfId())) {
        this.showToast(`Built a ${STRUCTURES[kind].label.toLowerCase()}`, STRUCTURES[kind].icon);
      } else {
        for (const it of refund) this.receiveItem(it, true);
        this.showToast("Couldn't build there", 'close');
      }
      return;
    }
    if (this.authority !== 'client' || !this.net) {
      for (const it of refund) this.receiveItem(it, true);
      this.showToast('Still connecting…', 'hammer');
      return;
    }
    const r = ++this.invReq;
    this.pendingInv.set(r, { op: 'build', c: tile, at: this.elapsed, refund });
    this.net.sendBuild({ r, o: 'b', k: STRUCTURE_KINDS.indexOf(kind), t: tile });
  }

  /** Host: puts a structure on the grid (validated). */
  private placeStructure(kind: StructureKind, tile: number, owner: string, from?: { x: number; y: number }, level = 0): boolean {
    const g = this.vision.grid;
    const col = tile % g.cols;
    const row = (tile - col) / g.cols;
    const at = from ?? { x: (col + 0.5) * g.tileSize, y: (row + 0.5) * g.tileSize };
    if (!STRUCTURES[kind] || this.placeProblem(tile, owner, at, kind)) return false;
    const container = this.addStructureLocal(kind, tile);
    if (kind === 'crate') {
      const pile = this.store.createPile('crate', (col + 0.5) * g.tileSize, (row + 0.5) * g.tileSize, []);
      this.built.set(tile, { kind, container: pile.id });
    } else {
      this.built.set(tile, { kind, container });
    }
    // Generators, rain collectors and campfires start with their own state
    if (isUtility(kind)) this.built.get(tile)!.state = initialState(kind, owner === this.selfId() ? this.skills.trapping.level : level);
    return true;
  }

  /** Puts a structure on this client's grid (host and clients). */
  private addStructureLocal(kind: StructureKind, tile: number, container?: number): number | undefined {
    const g = this.vision.grid;
    const col = tile % g.cols;
    const row = (tile - col) / g.cols;
    const spec = STRUCTURES[kind];
    if (spec.as === 'entrance') {
      setEntrance(g, builtEntrance(kind, col, row));
      this.sim.changedEntrances.add(tile);
      this.brokenSeen.delete(tile);
    } else if (spec.as === 'solid') {
      g.flags[tile] |= TILE_SOLID;
    }
    this.built.set(tile, { kind, container });
    this.sim.invalidateFlow();
    this.vision.invalidate();
    return container;
  }

  /** Takes a structure off this client's grid. Returns the crate's contents (host). */
  private removeStructureLocal(tile: number): InventoryItem[] {
    const b = this.built.get(tile);
    if (!b) return [];
    const g = this.vision.grid;
    this.built.delete(tile);
    if (STRUCTURES[b.kind].as === 'entrance') {
      g.entrances.delete(tile);
      g.flags[tile] &= ~(TILE_ENTRANCE | TILE_SOLID | TILE_OPAQUE);
      this.dirtyEntrances.delete(tile);
      this.changedEntrances.delete(tile);
      this.sim.changedEntrances.delete(tile);
    } else if (STRUCTURES[b.kind].as === 'solid') {
      g.flags[tile] &= ~TILE_SOLID;
    }
    this.sim.invalidateFlow();
    this.vision.invalidate();
    return b.container !== undefined && this.authority === 'host' ? this.store.removePileById(b.container) : [];
  }

  /** The built structure within reach (for the Dismantle prompt). */
  private findNearBuilt(): number | null {
    const g = this.vision.grid;
    let best: number | null = null;
    let bestD = BUILD_REACH;
    for (const tile of this.built.keys()) {
      const c = tile % g.cols;
      const d = Math.hypot((c + 0.5) * g.tileSize - this.feet.x, ((tile - c) / g.cols + 0.5) * g.tileSize - (this.feet.y - 4));
      if (d <= bestD) {
        best = tile;
        bestD = d;
      }
    }
    return best;
  }

  private dismantleProblem(tile: number): string | null {
    const b = this.built.get(tile);
    if (!b) return 'Nothing to take down';
    for (const group of STRUCTURES[b.kind].dismantle.tools) {
      if (!group.some((t) => this.countItem(t) > 0)) return `Needs ${group.map((t) => ITEM_DEFS[t].name).join(' or ')}`;
    }
    return null;
  }

  /** Takes the nearby structure down and gets some materials back (a crate's contents spill out). */
  dismantleNear(): boolean {
    if (this.deadTimer > 0 || this.sleeping || !this.ready) return false;
    const tile = this.nearBuiltTile;
    if (tile === null) return false;
    const why = this.dismantleProblem(tile);
    if (why) {
      this.showToast(why, 'hammer');
      return false;
    }
    const kind = this.built.get(tile)!.kind;
    const returns = STRUCTURES[kind].dismantle.returns.map((r) => ({ uid: `d${this.uidSeq++}`, def: r.def, qty: r.qty }));
    if (this.authority === 'host') {
      this.finishDismantle(tile, this.feet);
      for (const it of returns) if (!this.receiveItem(it, true)) this.dropToGround(it);
      this.showToast(`Took down the ${STRUCTURES[kind].label.toLowerCase()}`, STRUCTURES[kind].icon);
      return true;
    }
    if (this.authority !== 'client' || !this.net) return false;
    const r = ++this.invReq;
    this.pendingInv.set(r, { op: 'dismantle', c: tile, at: this.elapsed, refund: returns });
    this.net.sendBuild({ r, o: 'd', t: tile });
    return true;
  }

  /** Host: removes a structure; a crate's contents land on the ground. */
  private finishDismantle(tile: number, at: { x: number; y: number }) {
    const spill = this.removeStructureLocal(tile);
    for (const it of spill) this.store.put(this.store.groundPileAt(at.x, at.y).id, it);
  }

  /** The claim covering a world point, if any. */
  private claimAt(x: number, y: number): { owner: string; name: string; building: string } | null {
    for (const [id, c] of this.claims) {
      const b = this.buildingById.get(id);
      if (!b) continue;
      const f = b.footprint;
      if (x >= f.x && x < f.x + f.w && y >= f.y && y < f.y + f.h) return { ...c, building: id };
    }
    return null;
  }

  private claimProblem(buildingId: string | null): string | null {
    if (!buildingId || !this.buildingById.has(buildingId)) return 'Go inside a building to claim it';
    const c = this.claims.get(buildingId);
    if (c && c.owner !== this.selfId()) return `This is ${c.name}'s safehouse`;
    if (c) return null;
    if (this.nearestHunterTiles <= SAFE_CLEAR_TILES) return 'Clear out the zombies first';
    return null;
  }

  /** Claims the building you're in as your safehouse (one per survivor): no zombies spawn inside, and only you can build there. */
  claimSafehouse(): boolean {
    const id = this.insideBuilding;
    const why = this.claimProblem(id);
    if (why || !id) {
      this.showToast(why ?? 'Go inside a building to claim it', 'house');
      return false;
    }
    if (this.claims.get(id)?.owner === this.selfId()) return false;
    if (this.authority === 'host') {
      this.applyClaim(id, this.selfId(), this.survivor.name);
      this.showToast(`${this.buildingById.get(id)?.name ?? 'This building'} is your safehouse`, 'house');
      return true;
    }
    if (this.authority !== 'client' || !this.net) return false;
    const r = ++this.invReq;
    this.pendingInv.set(r, { op: 'claim', c: 0, at: this.elapsed });
    this.net.sendBuild({ r, o: 'c', b: id, n: this.survivor.name.slice(0, 24) });
    return true;
  }

  releaseSafehouse(): boolean {
    const mine = [...this.claims].find(([, c]) => c.owner === this.selfId());
    if (!mine) return false;
    if (this.authority === 'host') this.claims.delete(mine[0]);
    else if (this.authority === 'client' && this.net) {
      const r = ++this.invReq;
      this.pendingInv.set(r, { op: 'claim', c: 0, at: this.elapsed });
      this.net.sendBuild({ r, o: 'u' });
    }
    this.showToast('You gave up your safehouse', 'house');
    return true;
  }

  /** Host: one claim per player; claiming a new building releases the old one. */
  private applyClaim(buildingId: string, owner: string, name: string) {
    for (const [id, c] of this.claims) if (c.owner === owner) this.claims.delete(id);
    this.claims.set(buildingId, { owner, name: name.slice(0, 24) || 'Survivor' });
  }

  /** Host: building / safehouse requests from clients, checked against where we last saw them. */
  private handleRemoteBuild(others: SimTarget[]) {
    const ops = this.remoteBuild;
    this.remoteBuild = [];
    for (const { op, from } of ops) {
      const who = others.find((o) => o.id === from);
      let ok = false;
      let item: ItemRow | null = null;
      if (who) {
        if (op.o === 'b' && typeof op.t === 'number' && typeof op.k === 'number') {
          const kind = STRUCTURE_KINDS[op.k];
          ok = !!kind && this.placeStructure(kind, op.t, from, { x: who.x, y: who.y - 4 }, typeof op.l === 'number' ? op.l : 0);
        } else if (op.o === 'd' && typeof op.t === 'number' && this.built.has(op.t)) {
          const g = this.vision.grid;
          const c = op.t % g.cols;
          const d = Math.hypot((c + 0.5) * g.tileSize - who.x, ((op.t - c) / g.cols + 0.5) * g.tileSize - who.y);
          if (d <= BUILD_REACH * 2) {
            this.finishDismantle(op.t, who);
            ok = true;
          }
        } else if (op.o === 'c' && typeof op.b === 'string' && this.buildingById.has(op.b)) {
          const f = this.buildingById.get(op.b)!.footprint;
          const inside = who.x >= f.x && who.x < f.x + f.w && who.y >= f.y && who.y < f.y + f.h;
          const taken = this.claims.get(op.b);
          if (inside && (!taken || taken.owner === from)) {
            this.applyClaim(op.b, from, typeof op.n === 'string' ? op.n : 'Survivor');
            ok = true;
          }
        } else if (op.o === 'u') {
          for (const [id, c] of this.claims) if (c.owner === from) this.claims.delete(id);
          ok = true;
        } else if (op.o === 's') {
          this.sleepers.set(from, op.a === 1);
          ok = true;
        } else if (op.o === 'r') {
          // An admin changed the rules: re-read them from the database (only admins can write there)
          this.onRulesChanged?.();
          ok = true;
        } else if (op.o === 'g' && typeof op.t === 'number' && typeof op.a === 'number') {
          // Generator / rain collector / campfire, within reach of where we last saw them
          const g = this.vision.grid;
          const c = op.t % g.cols;
          const d = Math.hypot((c + 0.5) * g.tileSize - who.x, ((op.t - c) / g.cols + 0.5) * g.tileSize - who.y);
          const action = UTILITY_ACTIONS[op.a];
          if (action && d <= BUILD_REACH * 2) {
            const r = this.applyUtility(op.t, action, typeof op.k === 'number' ? op.k : 0, typeof op.c === 'number' ? op.c : 0);
            ok = !('error' in r);
            const g0 = 'gives' in r ? r.gives?.find((x) => x.qty > 0) : undefined;
            if (g0) item = encodeItem({ uid: 'a', def: g0.def, qty: g0.qty });
          }
        } else if (op.o === 'v' && typeof op.t === 'number' && typeof op.a === 'number') {
          // Board / leave / service a vehicle, from near it (leaving: from anywhere)
          const v = this.vehicles.get(op.t);
          const action = VEHICLE_ACTIONS[op.a];
          if (v && action) {
            const close = distanceTo(v, VEHICLE_SPECS[v.kind], who.x, who.y - 4) <= VEHICLE.reach * 2.5;
            if (action === 'exit' || close) {
              const pump = action === 'refuel' && op.c === -1;
              const r = this.applyVehicle(op.t, action, from, {
                cond: typeof op.c === 'number' && op.c >= 0 ? Math.min(1, op.c / 100) : 1,
                level: typeof op.k === 'number' ? Math.max(0, Math.min(10, op.k)) : 0,
                pump,
              });
              ok = !('error' in r);
              const g0 = 'gives' in r ? r.gives[0] : undefined;
              if (g0) item = encodeItem({ uid: 'a', def: g0.def, qty: 1, ...(g0.cond !== undefined ? { cond: g0.cond } : {}) });
            }
          }
        }
      }
      this.outAcks.push(item && ok ? [from, op.r, 1, ...item] : [from, op.r, ok ? 1 : 0]);
    }
  }

  /** Client: the host's list of structures replaces ours. */
  private applyBuiltRows(rows: number[][]) {
    const want = new Map<number, { kind: StructureKind; container?: number; state?: number[] }>();
    for (const row of rows) {
      if (!Array.isArray(row)) continue;
      const [tile, k, container] = row;
      const kind = STRUCTURE_KINDS[k];
      if (!kind || typeof tile !== 'number') continue;
      want.set(tile, {
        kind,
        container: typeof container === 'number' && container >= 0 ? container : undefined,
        state: isUtility(kind) ? sanitizeState(kind, row.slice(3)) : undefined,
      });
    }
    for (const tile of [...this.built.keys()]) {
      const w = want.get(tile);
      if (!w || w.kind !== this.built.get(tile)!.kind) this.removeStructureLocal(tile);
    }
    for (const [tile, w] of want) {
      if (!this.built.has(tile)) this.addStructureLocal(w.kind, tile, w.container);
      this.built.get(tile)!.state = w.state;
    }
  }

  /** A structure on the wire: [tile, kind, container?] or, for utilities, [tile, kind, container | -1, ...state]. */
  private builtRow(tile: number, b: { kind: StructureKind; container?: number; state?: number[] }): number[] {
    const k = STRUCTURE_KINDS.indexOf(b.kind);
    if (b.state && isUtility(b.kind)) return [tile, k, b.container ?? -1, ...wireState(b.kind, b.state)];
    return b.container !== undefined ? [tile, k, b.container] : [tile, k];
  }

  // ------------------------------------------------------------ world simulation

  /**
   * Weather, seasons, the power / water shut-offs and events come from this
   * seed and the shared match clock (world.ts), so every client agrees
   * without traffic. Fixtures: taps, toilets, stoves and fuel pumps.
   */
  setWorld(seed: number, fixtures: WorldFixture[]) {
    this.worldSeed = seed >>> 0;
    this.fixtures = fixtures;
    this.eventRng = mulberry32(this.worldSeed ^ 0x5eed);
    this.worldAnnounced = null;
    this.store.agingClock = this.agingClockNow;
    this.updateWorld();
  }

  getWorld(): WorldState {
    return this.world;
  }

  /** Spoilage clock for a place, right now (fridges slow down while the mains are on). */
  private readonly agingClockNow = (where: ContainerKind | 'bag'): number =>
    agingClock(where, gameHours(this.elapsed + this.clockSkip), powerOffHour(this.worldSeed, this.rules.powerOffDays));

  private freshnessIn(it: InventoryItem, where: ContainerKind | 'bag'): Freshness | null {
    if (!isPerishable(it.def)) return null;
    return freshnessOf(it.def, ageOn(it, this.agingClockNow(where)));
  }

  private openContainer() {
    return this.openContainerId === null ? null : this.store.get(this.openContainerId);
  }

  /** The stack to eat: the oldest food that hasn't gone off yet (else any). */
  private pickStack(def: ItemDefId): InventoryItem | undefined {
    const stacks = this.bag.items.filter((i) => i.def === def);
    if (stacks.length < 2 || !isPerishable(def)) return stacks[0];
    const now = this.agingClockNow('bag');
    const good = stacks.filter((s) => freshnessOf(def, ageOn(s, now)) !== 'rotten');
    const pool = good.length ? good : stacks;
    return pool.reduce((a, b) => (ageOn(b, now) > ageOn(a, now) ? b : a));
  }

  /** Recomputes the world for this frame (every client) and announces changes. */
  private updateWorld() {
    const clock = this.elapsed + this.clockSkip;
    // Non-hosts track the clock too, so a client promoted to host doesn't "catch up" hours of fuel and growth
    if (this.authority !== 'host') this.worldClock = clock;
    this.world = worldAt(this.worldSeed, clock, this.tod.light, { w: this.worldWidth, h: this.worldHeight }, this.rules);

    // Running generators and burning fires, from the (synced) structure list
    const g = this.vision.grid;
    this.powerSources = [];
    this.fires = [];
    for (const [tile, b] of this.built) {
      if (!b.state) continue;
      const c = tile % g.cols;
      const p = { x: (c + 0.5) * g.tileSize, y: ((tile - c) / g.cols + 0.5) * g.tileSize };
      if (b.kind === 'generator' && generatorRunning(b.state)) this.powerSources.push(p);
      else if (b.kind === 'campfire' && b.state[0] > 0) this.fires.push(p);
    }

    // Food without an age yet (just crafted or picked up) starts fresh now
    if (this.bag.items.some((i) => i.rot === undefined && isPerishable(i.def))) {
      const now = this.agingClockNow('bag');
      this.bag = { ...this.bag, items: this.bag.items.map((i) => (i.rot === undefined && isPerishable(i.def) ? { ...i, rot: now } : i)) };
    }

    const w = this.world;
    // Thunder follows the flash
    if (w.flash > 0 && this.lastFlash === 0) {
      this.sfx.push({ id: 'thunder', vol: 0.8, delay: 0.4 + this.fxRng() * 1.2 });
      this.shake.add(0.12);
    }
    this.lastFlash = w.flash;
    const prev = this.worldAnnounced;
    this.worldAnnounced = { power: w.power, water: w.water, weather: w.weather, heli: !!w.helicopter };
    if (!prev || !this.ready) return;
    if (prev.power && !w.power) this.showToast('The power has gone out. Fridges are warming up', 'powerOff');
    else if (prev.water && !w.water) this.showToast('The taps have run dry', 'tap');
    else if (!prev.heli && w.helicopter) this.showToast('A helicopter overhead — everything is following it', 'helicopter');
    else if (prev.weather !== w.weather && WEATHER_START[w.weather]) this.showToast(WEATHER_START[w.weather]!, WEATHER_ICON[w.weather]);
  }

  /** Mains power, or a running generator within reach of (x, y). */
  private poweredAt(x: number, y: number): boolean {
    if (this.world.power) return true;
    if (!this.powerSources.length) return false;
    const r2 = (GENERATOR.radiusTiles * this.vision.grid.tileSize) ** 2;
    return this.powerSources.some((p) => (p.x - x) ** 2 + (p.y - y) ** 2 <= r2);
  }

  /** °C of warmth from a campfire close by. */
  private fireWarmth(x: number, y: number): number {
    const r = CAMPFIRE.warmthTiles * this.vision.grid.tileSize;
    return this.fires.some((f) => Math.hypot(f.x - x, f.y - y) <= r) ? CAMPFIRE.warmth : 0;
  }

  /** A working stove or a burning campfire within reach: cooking recipes need one. */
  private nearHeat(): boolean {
    const fx = this.feet.x;
    const fy = this.feet.y - 4;
    if (this.fires.some((f) => Math.hypot(f.x - fx, f.y - fy) <= HEAT_REACH)) return true;
    for (const f of this.fixtures) {
      if (f.kind !== 'stove') continue;
      if (ContainerStore.distance(f, fx, fy) <= HEAT_REACH && this.poweredAt(f.x, f.y)) return true;
    }
    return false;
  }

  /**
   * What you're next to, in priority order: a utility structure (generator,
   * rain collector, campfire, farm plot, snare), a vehicle, a fixture (tap,
   * toilet, stove, pump, fountain), else open ground you could forage.
   */
  private findWorldTarget(): WorldTarget | null {
    if (this.nearBuiltTile !== null) {
      const b = this.built.get(this.nearBuiltTile);
      if (b && isUtility(b.kind)) return { type: 'utility', tile: this.nearBuiltTile, kind: b.kind };
    }
    const fx = this.feet.x;
    const fy = this.feet.y - 4;
    const car = this.vehicles.near(fx, fy, VEHICLE.reach);
    if (car) return { type: 'vehicle', id: car.id };
    const g = this.vision.grid;
    let best = -1;
    let bestD = FIXTURE_REACH;
    for (let i = 0; i < this.fixtures.length; i++) {
      const f = this.fixtures[i];
      // Cheap reject before the exact distance
      if (Math.abs(f.x - fx) > 80 || Math.abs(f.y - fy) > 80) continue;
      const d = ContainerStore.distance(f, fx, fy);
      if (d > bestD) continue;
      const px = Math.max(f.x, Math.min(f.x + f.w, fx));
      const py = Math.max(f.y, Math.min(f.y + f.h, fy));
      if (wallsBetween(g, fx, fy, px, py, 1) !== 0) continue;
      best = i;
      bestD = d;
    }
    if (best >= 0) return { type: 'fixture', index: best, kind: this.fixtures[best].kind };
    // Open ground outdoors: forage
    if (this.insideBuilding === null && this.nearContainerId === null) {
      const ground = this.groundAt(fx, fy);
      if (ground === 'grass' || ground === 'park' || ground === 'dirt') return { type: 'forage', ground };
    }
    return null;
  }

  /** What you could do at a fixture right now. */
  private fixtureActions(index: number): { id: string; label: string; ok: boolean; reason: string | null }[] {
    const f = this.fixtures[index];
    const bottles = this.countItem('empty_bottle');
    if (f.kind === 'tap') {
      if (!this.world.water) return [];
      return [
        { id: 'f:drink', label: 'Drink', ok: this.vitals.hydration < 98, reason: this.vitals.hydration < 98 ? null : "You're not thirsty" },
        { id: 'f:fill', label: 'Fill bottles', ok: bottles > 0, reason: bottles > 0 ? null : 'No empty bottles' },
      ];
    }
    if (f.kind === 'toilet') {
      // While the mains run the tank refills; after that it's what's left in it
      const left = this.world.water ? Infinity : TOILET_FILLS - (this.toiletUses.get(index) ?? 0);
      const reason = left <= 0 ? 'The tank is empty' : bottles <= 0 ? 'No empty bottles' : null;
      return [{ id: 'f:fill', label: 'Fill a bottle (tainted)', ok: !reason, reason }];
    }
    if (f.kind === 'fountain') {
      const rod = this.countItem('fishing_rod') > 0;
      const stock = this.fishStockAt(index);
      const fishWhy = !rod ? 'Needs a fishing rod' : stock <= 0 ? 'Fished out for now' : null;
      return [
        { id: 'f:fish', label: 'Fish', ok: !fishWhy, reason: fishWhy },
        { id: 'f:fill', label: 'Fill a bottle (tainted)', ok: bottles > 0, reason: bottles > 0 ? null : 'No empty bottles' },
      ];
    }
    if (f.kind === 'pump') {
      const powered = this.poweredAt(f.x, f.y);
      const cans = this.countItem('gas_can');
      const reason = !powered ? 'No power to the pump' : cans <= 0 ? 'No empty gas can' : null;
      const out = [{ id: 'f:fuel', label: 'Fill gas can', ok: !reason, reason }];
      // A car pulled up at the pump fills straight from it
      const car = this.vehicles.near(f.x + f.w / 2, f.y + f.h / 2, 40);
      if (car) {
        const full = car.fuel >= VEHICLE_SPECS[car.kind].tank - 0.5;
        const why = !powered ? 'No power to the pump' : car.driver ? 'Someone is driving it' : full ? 'The tank is full' : null;
        out.push({ id: `f:pumpcar:${car.id}`, label: `Fill the ${VEHICLE_SPECS[car.kind].label.toLowerCase()}`, ok: !why, reason: why });
      }
      return out;
    }
    return [];
  }

  private fixtureStatus(f: WorldFixture): string {
    if (f.kind === 'tap') return this.world.water ? 'Running water' : 'The water is off';
    if (f.kind === 'toilet') return this.world.water ? 'Water in the tank' : 'Tank water: boil it before drinking';
    if (f.kind === 'stove') return this.poweredAt(f.x, f.y) ? 'Working: cook from the crafting menu' : 'No power';
    if (f.kind === 'fountain') return 'Fish in the basin; the water needs boiling';
    return this.poweredAt(f.x, f.y) ? 'The pump has power' : 'No power';
  }

  private worldActionHud(): WorldActionHud | null {
    const t = this.worldTarget;
    if (!t) return null;
    if (t.type === 'fixture') {
      const f = this.fixtures[t.index];
      return { label: FIXTURE_INFO[f.kind].label, icon: FIXTURE_INFO[f.kind].icon, status: this.fixtureStatus(f), actions: this.fixtureActions(t.index) };
    }
    if (t.type === 'vehicle') return this.vehicleActionHud(t.id);
    if (t.type === 'forage') {
      const picked = (this.forageCells.get(this.forageCell()) ?? 0) > gameHours(this.elapsed + this.clockSkip);
      return {
        label: FORAGE_LABEL[t.ground],
        icon: 'leaf',
        status: picked ? 'Picked over — try somewhere else' : 'Search for berries, herbs, worms, branches, stones…',
        actions: [{ id: 'f:forage', label: 'Forage', ok: !picked, reason: picked ? 'Picked over — try somewhere else' : null }],
      };
    }
    const b = this.built.get(t.tile);
    if (!b?.state) return null;
    const state = b.state;
    const actions: WorldActionHud['actions'] = [];
    for (const a of utilityActions(t.kind, state)) {
      if (a === 'plant') {
        // One button per kind of seed you carry
        let any = false;
        CROP_IDS.forEach((crop, i) => {
          if (this.countItem(CROPS[crop].seed) <= 0) return;
          any = true;
          const why = this.utilityProblem(t.kind, state, a, i);
          actions.push({ id: `u:plant:${i}`, label: `Plant ${CROPS[crop].label.toLowerCase()}`, ok: !why, reason: why });
        });
        if (!any) actions.push({ id: 'u:plant', label: 'Plant', ok: false, reason: 'No seeds' });
        continue;
      }
      const why = this.utilityProblem(t.kind, state, a);
      actions.push({ id: `u:${a}`, label: ACTION_LABEL[a](t.kind, state), ok: !why, reason: why });
    }
    return { label: STRUCTURES[t.kind].label, icon: STRUCTURES[t.kind].icon, status: utilityStatus(t.kind, state), actions };
  }

  /** What's stopping you doing `a` (items you need, a full tank…). */
  private utilityProblem(kind: UtilityKind, state: number[], a: UtilityAction, param = 0): string | null {
    const need = ACTION_ITEMS[a];
    for (const s of need.spend) if (inputCount(s, (d) => this.countItem(d)) < s.qty) return `Needs ${ITEM_DEFS[s.def].name}${s.alt?.length ? ' (or similar)' : ''}`;
    for (const t of need.tools) if (this.countItem(t) < 1) return `Needs ${ITEM_DEFS[t].name}`;
    const r = applyUtilityAction(kind, state, a, this.utilityLevel(a), param);
    return 'error' in r ? r.error : null;
  }

  /** The skill that matters for a utility action. */
  private utilityLevel(a: UtilityAction): number {
    return a === 'repair' ? this.skills.electrical.level : a === 'harvest' ? this.skills.farming.level : 0;
  }

  /**
   * The world action chip / U (and E when nothing is searchable): does `id`
   * (or the first possible action) at the fixture, utility, vehicle or
   * patch of ground you're next to. Returns true when something happened.
   */
  worldAction(id?: string): boolean {
    if (this.deadTimer > 0 || this.sleeping || !this.ready || this.useCooldown > 0) return false;
    // In a vehicle the use key gets you out
    if (this.myVehicle !== null) return id === undefined || id === 'v:exit' ? this.exitVehicle() : false;
    const hud = this.worldActionHud();
    const t = this.worldTarget;
    if (!hud || !t) return false;
    const pick = id ? hud.actions.find((a) => a.id === id) : hud.actions.find((a) => a.ok);
    if (!pick) return false;
    if (!pick.ok) {
      this.showToast(pick.reason ?? "You can't do that", hud.icon);
      return true;
    }
    this.useCooldown = USE_COOLDOWN;
    if (t.type === 'fixture') return this.useFixture(t.index, pick.id);
    if (t.type === 'vehicle') return this.vehicleAction(t.id, pick.id.slice(2));
    if (t.type === 'forage') return this.startActivity('forage', FORAGE.searchSeconds, 'Foraging', -1);
    const [, a, param] = pick.id.split(':');
    return this.requestUtility(t.tile, t.kind, a as UtilityAction, param === undefined ? 0 : Number(param));
  }

  /** Taps, toilets, pumps and fountains are local: the shut-offs are deterministic, so no host round trip. */
  private useFixture(index: number, id: string): boolean {
    const f = this.fixtures[index];
    this.sound(id === 'f:drink' ? 'drink' : id === 'f:fish' || id === 'f:forage' ? 'ui' : 'pour', f.x + f.w / 2, f.y + f.h / 2);
    if (id === 'f:drink') {
      this.vitals = consume(this.vitals, { hydration: 40 });
      this.showToast('You drink from the tap', 'tap');
      return true;
    }
    if (id === 'f:fuel') {
      this.swapItem('gas_can', 'gas_can_full', 1);
      this.showToast('Filled a gas can', 'fuel');
      return true;
    }
    if (id.startsWith('f:pumpcar:')) return this.vehicleAction(Number(id.slice(10)), 'pump');
    if (id === 'f:fish') return this.startActivity('fish', FISHING.castSeconds, 'Fishing', index);
    if (f.kind === 'tap') {
      const n = this.countItem('empty_bottle');
      this.swapItem('empty_bottle', 'water_bottle', n);
      this.showToast(`Filled ${n} bottle${n === 1 ? '' : 's'} with clean water`, 'droplet');
      return true;
    }
    // Toilet tank or fountain basin: one bottle at a time, tainted
    this.swapItem('empty_bottle', 'tainted_water', 1);
    if (f.kind === 'toilet' && !this.world.water) this.toiletUses.set(index, (this.toiletUses.get(index) ?? 0) + 1);
    this.showToast(`Filled a bottle from the ${f.kind === 'toilet' ? 'toilet tank' : 'fountain'} — boil it first`, f.kind === 'toilet' ? 'toilet' : 'droplets');
    return true;
  }

  /** Replaces `qty` of one item with another (empty bottle → water), spilling what doesn't fit. */
  private swapItem(from: ItemDefId, to: ItemDefId, qty: number) {
    const spent = this.spend([{ def: from, qty }]);
    const got = spent.reduce((s, it) => s + it.qty, 0);
    if (got <= 0) return;
    const it: InventoryItem = { uid: `w${this.uidSeq++}`, def: to, qty: got };
    if (!this.receiveItem(it, true)) this.dropToGround(it);
  }

  /** Utility structures: the host applies the action; clients ask and wait for an ack (which carries any harvest or catch). */
  private requestUtility(tile: number, kind: UtilityKind, a: UtilityAction, param = 0): boolean {
    const need = ACTION_ITEMS[a];
    const label = ACTION_DONE[a](kind);
    const level = this.utilityLevel(a);
    const spendList = a === 'plant' ? [{ def: CROPS[CROP_IDS[param]].seed, qty: 1 }] : need.spend;
    const xp = UTILITY_XP[a];
    const b = this.built.get(tile);
    const ts = this.vision.grid.tileSize;
    const col = tile % this.vision.grid.cols;
    if (b) this.sound(UTILITY_SOUND[a], (col + 0.5) * ts, ((tile - col) / this.vision.grid.cols + 0.5) * ts);
    if (this.authority === 'host') {
      const r = this.applyUtility(tile, a, level, param);
      if ('error' in r) {
        this.showToast(r.error, STRUCTURES[kind].icon);
        return false;
      }
      this.spend(spendList);
      for (const g of [...need.gives, ...(r.gives ?? [])]) {
        if (g.qty <= 0) continue;
        const it: InventoryItem = { uid: `u${this.uidSeq++}`, def: g.def, qty: g.qty };
        if (!this.receiveItem(it, true)) this.dropToGround(it);
      }
      if (xp) this.train(xp.skill, xp.amount);
      this.showToast(r.gives?.length ? `${label}: ${r.gives.map((g) => `${g.qty} × ${ITEM_DEFS[g.def].name}`).join(', ')}` : label, STRUCTURES[kind].icon);
      return true;
    }
    if (this.authority !== 'client' || !this.net) {
      this.showToast('Still connecting…', STRUCTURES[kind].icon);
      return false;
    }
    // Pay up front; the ack hands over what it gives (or the refund)
    const refund = this.spend(spendList);
    const reward = need.gives.map((g) => ({ uid: `u${this.uidSeq++}`, def: g.def, qty: g.qty }));
    if (xp) this.train(xp.skill, xp.amount);
    const r = ++this.invReq;
    this.pendingInv.set(r, { op: 'utility', c: tile, at: this.elapsed, refund, reward, label });
    this.net.sendBuild({ r, o: 'g', t: tile, a: UTILITY_ACTIONS.indexOf(a), k: level, c: param });
    return true;
  }

  /** Host: applies a utility action. Returns why it failed, or what it hands over. */
  private applyUtility(tile: number, a: UtilityAction, level: number, param = 0): { error: string } | { gives?: { def: ItemDefId; qty: number }[] } {
    const b = this.built.get(tile);
    if (!b || !b.state || !isUtility(b.kind)) return { error: 'Nothing there' };
    const r = applyUtilityAction(b.kind, b.state, a, Math.max(0, Math.min(10, level)), param);
    if ('error' in r) return r;
    b.state = r.state;
    return { gives: r.gives };
  }

  // ------------------------------------------------------------ vehicles

  /** Parked cars from the map (seeded condition, same on every client). Call once. */
  setVehicles(spawns: VehicleSpawn[], seed: number) {
    if (this.vehicles.size > 0) return;
    this.vehicles = new VehicleSystem(this.vision.grid, spawns, seed);
    this.vehicles.onGridChanged = () => this.sim.invalidateFlow();
    this.sim.invalidateFlow();
    this.addTrunks();
  }

  /** Each vehicle's trunk is a seeded container that moves with it. */
  private addTrunks() {
    for (const v of this.vehicles.vehicles.values()) {
      const spec = VEHICLE_SPECS[v.kind];
      const p = this.vehicles.trunkAt(v);
      this.store.addSpawn(
        { id: VehicleSystem.trunkId(v), kind: 'trunk', owner: `vehicle:${v.id}`, x: p.x, y: p.y, w: 0, h: 0, table: spec.trunkTable, rolls: 2, empty: 0.3, respawn: null },
        spec.trunkKg
      );
    }
  }

  /** Ground under a point (farm plots, snares, foraging). */
  setGround(fn: (x: number, y: number) => GroundType | null) {
    this.groundAt = fn;
  }

  /** Extra obstacle check when exiting a vehicle (WorldGame furniture, indoor walls, etc.). */
  setExitBlocked(fn: ((box: Rect) => boolean) | null) {
    this.extraExitBlocked = fn;
  }

  private myVehicleState(): VehicleState | null {
    return this.myVehicle === null ? null : (this.vehicles.get(this.myVehicle) ?? null);
  }

  /** In a vehicle (driving or riding). */
  inVehicle(): boolean {
    return this.myVehicle !== null;
  }

  isDriving(): boolean {
    return this.myVehicleState()?.driver === this.selfId();
  }

  /** Where your feet are while in a vehicle. */
  seat(): { x: number; y: number } | null {
    const v = this.myVehicleState();
    return v ? { x: v.x, y: v.y } : null;
  }

  vehicleMoving(): boolean {
    return Math.abs(this.myVehicleState()?.speed ?? 0) > 1;
  }

  /** Someone (by clientInstanceId) is inside a vehicle: their avatar isn't drawn. */
  isInVehicle(clientId: string): boolean {
    return this.vehicles.occupiedBy(clientId) !== null;
  }

  getVehicles(): VehicleSystem {
    return this.vehicles;
  }

  /** Horn (Space while driving): loud, and every zombie around hears it. */
  honk(): boolean {
    const v = this.myVehicleState();
    if (!v || v.driver !== this.selfId() || this.hornCooldown > 0) return false;
    this.hornCooldown = 1;
    this.sound('horn', v.x, v.y);
    if (this.authority === 'host') this.pendingNoises.push({ x: v.x, y: v.y, radius: VEHICLE.hornNoise });
    else this.net?.sendVehicle(encodeVehicle(v), true);
    this.showToast('Honk!', 'megaphone');
    return true;
  }

  /** Vehicle panel buttons: Inspect (toggle), services, horn, get out. */
  vehicleCommand(id: number, action: string): boolean {
    if (action === 'exit') return this.exitVehicle();
    if (action === 'horn') return this.honk();
    if (action === 'inspect') {
      this.vehiclePanel = this.vehiclePanel === id ? null : id;
      return true;
    }
    if (this.deadTimer > 0 || this.sleeping || !this.ready || this.useCooldown > 0 || this.myVehicle !== null) return false;
    const v = this.vehicles.get(id);
    if (!v || distanceTo(v, VEHICLE_SPECS[v.kind], this.feet.x, this.feet.y - 4) > VEHICLE.reach + 16) return false;
    this.useCooldown = USE_COOLDOWN;
    return this.vehicleAction(id, action);
  }

  /** The chip for a vehicle you're standing at. */
  private vehicleActionHud(id: number): WorldActionHud | null {
    const v = this.vehicles.get(id);
    if (!v) return null;
    const spec = VEHICLE_SPECS[v.kind];
    const self = this.selfId();
    const actions: WorldActionHud['actions'] = [];
    const busy = v.driver !== null && v.driver !== self;
    actions.push({ id: 'v:enter', label: VEHICLE_ACTION_LABEL.enter, ok: !busy, reason: busy ? 'Someone is driving it' : null });
    if (busy) {
      const full = v.passengers.length >= spec.seats - 1;
      actions.push({ id: 'v:ride', label: VEHICLE_ACTION_LABEL.ride, ok: !full, reason: full ? 'No free seats' : null });
    }
    actions.push({ id: 'v:trunk', label: 'Trunk', ok: true, reason: null });
    if (!v.keys && !v.hotwired) {
      const can = canHotwire(OCCUPATIONS[this.survivor.occupation].perks, this.skills.electrical.level, this.skills.mechanics.level);
      actions.push({ id: 'v:hotwire', label: VEHICLE_ACTION_LABEL.hotwire, ok: can && !busy, reason: can ? (busy ? 'Someone is driving it' : null) : 'Burglars, or Electrical 1 + Mechanics 2' });
    }
    actions.push({ id: 'v:inspect', label: this.vehiclePanel === id ? 'Close' : 'Inspect', ok: true, reason: null });
    const key = v.keys ? 'keys in it' : v.hotwired ? 'hotwired' : 'no key';
    return {
      label: spec.label,
      icon: spec.icon,
      status: `Fuel ${v.fuel.toFixed(1)} / ${spec.tank} L · ${key}`,
      actions,
    };
  }

  /** The vehicle panel (Inspect): parts and what you can do about them. */
  private vehicleHud(): VehicleHud | null {
    const inside = this.myVehicleState();
    const id = inside?.id ?? this.vehiclePanel;
    if (id === null) return null;
    const v = this.vehicles.get(id);
    if (!v) return null;
    // The panel closes when you walk away
    if (!inside && distanceTo(v, VEHICLE_SPECS[v.kind], this.feet.x, this.feet.y - 4) > VEHICLE.reach + 16) return null;
    const spec = VEHICLE_SPECS[v.kind];
    const p = v.parts;
    const services = inside
      ? []
      : (['refuel', 'siphon', 'tire', 'battery', 'engine', 'windows', 'body', 'takeTire', 'takeBattery'] as VehicleAction[]).map((a) => {
          const why = this.serviceProblem(v, a);
          return { id: `v:${a}`, label: VEHICLE_ACTION_LABEL[a], ok: !why, reason: why };
        });
    return {
      id: v.id,
      label: spec.label,
      icon: spec.icon,
      inside: !!inside,
      driving: inside?.driver === this.selfId(),
      speedKmh: Math.round((Math.abs(v.speed) / 16) * 3.6),
      engineOn: v.engineOn,
      fuel: Math.round(v.fuel * 10) / 10,
      tank: spec.tank,
      parts: [
        { label: 'Engine', value: Math.round(p.engine) },
        { label: 'Battery', value: Math.round(p.battery) },
        ...TIRE_LABELS.map((label, i) => ({ label, value: Math.round(p.tires[i]) })),
        { label: 'Doors & panels', value: Math.round(p.body) },
        { label: 'Windows', value: Math.round(p.windows) },
      ],
      seats: `${(v.driver ? 1 : 0) + v.passengers.length} / ${spec.seats}`,
      trunkKg: spec.trunkKg,
      key: v.keys ? 'Keys in the ignition' : v.hotwired ? 'Hotwired' : 'No key',
      services,
    };
  }

  /** What's stopping a service (items, tools, skill, the car's state). */
  private serviceProblem(v: VehicleState, a: VehicleAction): string | null {
    const need = SERVICE_ITEMS[a];
    if (need) {
      for (const s of need.spend) if (this.countItem(s.def) < s.qty) return `Needs ${ITEM_DEFS[s.def].name}`;
      for (const t of need.tools) if (this.countItem(t) < 1) return `Needs ${ITEM_DEFS[t].name}`;
      if (need.skill && this.skills[need.skill.id].level < need.skill.level) return `${SKILLS[need.skill.id].label} ${need.skill.level}`;
    }
    const r = applyService(v, a, { cond: 1, level: this.skills.mechanics.level });
    return 'error' in r ? r.error : null;
  }

  /** A vehicle chip / panel button. */
  private vehicleAction(id: number, action: string): boolean {
    const v = this.vehicles.get(id);
    if (!v) return false;
    if (action === 'inspect') {
      this.vehiclePanel = this.vehiclePanel === id ? null : id;
      return true;
    }
    if (action === 'trunk') {
      this.vehiclePanel = null;
      this.openContainerId = VehicleSystem.trunkId(v);
      this.showToast(`Opened the ${VEHICLE_SPECS[v.kind].label.toLowerCase()}'s trunk`, 'package');
      return true;
    }
    if (action === 'hotwire') return this.startActivity('hotwire', VEHICLE.hotwireSeconds, 'Hotwiring', id);
    if (action === 'pump') {
      // Straight from a powered pump: a full tank, no can needed
      return this.requestVehicle(id, 'refuel', { pump: true });
    }
    if (!(VEHICLE_ACTIONS as readonly string[]).includes(action)) return false;
    return this.requestVehicle(id, action as VehicleAction);
  }

  /**
   * Boarding, leaving and servicing go through the host (one driver per car,
   * parts and fuel stay consistent). Items are spent up front and refunded
   * if the host says no; parts taken off come back in the ack.
   */
  private requestVehicle(id: number, a: VehicleAction, opts: { pump?: boolean } = {}): boolean {
    const v = this.vehicles.get(id);
    if (!v) return false;
    if (a !== 'enter' && a !== 'ride' && a !== 'exit' && a !== 'hotwire' && !opts.pump) {
      const why = this.serviceProblem(v, a);
      if (why) {
        this.showToast(why, VEHICLE_SPECS[v.kind].icon);
        return false;
      }
    }
    const need = opts.pump ? undefined : SERVICE_ITEMS[a];
    const spent = need ? this.spend(need.spend) : [];
    const cond = spent.find((it) => it.def === 'spare_tire' || it.def === 'car_battery')?.cond ?? 1;
    const level = need?.skill?.id === 'metalworking' ? this.skills.metalworking.level : this.skills.mechanics.level;
    const label = opts.pump ? 'Filled the tank at the pump' : VEHICLE_DONE[a];
    if (this.authority === 'host') {
      const r = this.applyVehicle(id, a, this.selfId(), { cond, level, pump: opts.pump });
      if ('error' in r) {
        for (const it of spent) this.receiveItem(it, true);
        this.showToast(r.error, VEHICLE_SPECS[v.kind].icon);
        return false;
      }
      for (const g of r.gives) {
        const it: InventoryItem = { uid: `v${this.uidSeq++}`, def: g.def, qty: 1, ...(g.cond !== undefined ? { cond: g.cond } : {}) };
        if (!this.receiveItem(it, true)) this.dropToGround(it);
      }
      this.afterVehicleOp(id, a);
      if (label) this.showToast(label, VEHICLE_SPECS[v.kind].icon);
      return true;
    }
    if (this.authority !== 'client' || !this.net) {
      for (const it of spent) this.receiveItem(it, true);
      this.showToast('Still connecting…', VEHICLE_SPECS[v.kind].icon);
      return false;
    }
    const r = ++this.invReq;
    this.pendingInv.set(r, { op: 'vehicle', c: id, at: this.elapsed, refund: spent, label: label ?? undefined, act: a });
    // A pump fill is sent as a refuel with c = -1 (no can)
    this.net.sendBuild({ r, o: 'v', t: id, a: VEHICLE_ACTIONS.indexOf(a), k: level, c: opts.pump ? -1 : Math.round(cond * 100) });
    return true;
  }

  /** Host: boards, unboards or services a vehicle for `who`. */
  private applyVehicle(
    id: number,
    a: VehicleAction,
    who: string,
    opts: { cond?: number; level?: number; pump?: boolean } = {}
  ): { error: string } | { gives: ServiceReturn[] } {
    const v = this.vehicles.get(id);
    if (!v) return { error: 'It is gone' };
    const spec = VEHICLE_SPECS[v.kind];
    if (a === 'enter') {
      if (v.driver && v.driver !== who) return { error: 'Someone is driving it' };
      if (this.vehicles.occupiedBy(who) && this.vehicles.occupiedBy(who)?.id !== id) return { error: "You're in another vehicle" };
      this.vehicles.set({ ...v, driver: who, passengers: v.passengers.filter((p) => p !== who) });
      this.driverSeen.set(id, this.elapsed);
      return { gives: [] };
    }
    if (a === 'ride') {
      if (v.passengers.includes(who)) return { gives: [] };
      if (v.passengers.length >= spec.seats - 1) return { error: 'No free seats' };
      this.vehicles.set({ ...v, passengers: [...v.passengers, who] });
      return { gives: [] };
    }
    if (a === 'exit') {
      if (v.driver === who) this.vehicles.set({ ...v, driver: null, speed: 0, engineOn: false });
      else this.vehicles.set({ ...v, passengers: v.passengers.filter((p) => p !== who) });
      return { gives: [] };
    }
    if (a === 'refuel' && opts.pump) {
      if (v.driver) return { error: 'Someone is driving it' };
      if (v.fuel >= spec.tank - 0.5) return { error: 'The tank is full' };
      // Only where a powered pump actually is
      const pump = this.fixtures.find((f) => f.kind === 'pump' && distanceTo(v, spec, f.x + f.w / 2, f.y + f.h / 2) <= 40);
      if (!pump || !this.poweredAt(pump.x, pump.y)) return { error: 'No working pump here' };
      this.vehicles.set({ ...v, fuel: spec.tank });
      return { gives: [] };
    }
    const r = applyService(v, a, { cond: opts.cond, level: opts.level });
    if ('error' in r) return r;
    this.vehicles.set(r.state);
    return { gives: r.gives };
  }

  /** After a confirmed vehicle op (host or ack): board / leave locally, train Mechanics. */
  private afterVehicleOp(id: number, a: VehicleAction) {
    const v = this.vehicles.get(id);
    if (!v) return;
    const self = this.selfId();
    if (a === 'enter' || a === 'ride') {
      this.myVehicle = id;
      this.vehiclePanel = null;
      this.openContainerId = null;
      this.crafting = null;
      this.placing = null;
      this.constructing = null;
      this.activity = null;
      if (a === 'enter') {
        // We drive it from here: mark it ours right away
        if (v.driver !== self) this.vehicles.set({ ...v, driver: self });
        this.tryStart();
      } else {
        this.showToast(`Riding in the ${VEHICLE_SPECS[v.kind].label.toLowerCase()}`, VEHICLE_SPECS[v.kind].icon);
      }
      return;
    }
    if (a === 'exit') return;
    if (a === 'hotwire') this.train('electrical', 4);
    else if (a !== 'refuel' && a !== 'siphon') this.train(a === 'body' ? 'metalworking' : 'mechanics', a === 'engine' ? 10 : 5);
  }

  /** Turn the key (or touch the wires). */
  private tryStart(): boolean {
    const v = this.myVehicleState();
    if (!v || v.driver !== this.selfId() || v.engineOn) return false;
    this.crankCooldown = 1;
    const r = startEngine(v, this.vehicleRng());
    this.vehicles.set(r.state);
    this.sound(r.result === 'started' ? 'engine_start' : 'engine_fail', v.x, v.y);
    if (r.result === 'started') {
      this.showToast('The engine turns over', 'engine');
      this.vehicleSendTimer = 0;
      return true;
    }
    this.showToast(START_TEXT[r.result], r.result === 'noFuel' ? 'fuel' : r.result === 'deadBattery' ? 'battery' : 'engine');
    return false;
  }

  /** Get out (U / E, or the HUD button). The car is left where it stands. */
  exitVehicle(force = false): boolean {
    const v = this.myVehicleState();
    if (!v) {
      this.myVehicle = null;
      return false;
    }
    if (!force && Math.abs(v.speed) > 40) {
      this.showToast('Slow down first', 'warning');
      return false;
    }
    const spec = VEHICLE_SPECS[v.kind];
    const self = this.selfId();
    // Out on the first free side (checking the full player hitbox, not just the centre tile)
    const g = this.vision.grid;
    const ts = g.tileSize;
    const isSolidTileBox = (box: Rect): boolean => {
      const c0 = Math.floor(box.x / ts);
      const c1 = Math.floor((box.x + box.w - 0.01) / ts);
      const r0 = Math.floor(box.y / ts);
      const r1 = Math.floor((box.y + box.h - 0.01) / ts);
      for (let r = r0; r <= r1; r++) {
        for (let c = c0; c <= c1; c++) {
          if (!inBounds(g, c, r) || (g.flags[tileIndex(g, c, r)] & TILE_SOLID) !== 0) return true;
        }
      }
      return false;
    };
    const spot = exitPoints(v, spec).find((p) => {
      const box = { x: p.x - 6, y: p.y - 8, w: 12, h: 10 };
      return !this.vehicles.blocksBox(box) && !this.isBlocked(box) && !isSolidTileBox(box) && !this.extraExitBlocked?.(box);
    });
    if (!spot && !force) {
      this.showToast("There's no room to get out", 'warning');
      return false;
    }
    const out = spot ?? { x: v.x, y: v.y + spec.width };
    const driver = v.driver === self;
    // Final position for everyone, then let go of it
    const parked: VehicleState = driver ? { ...v, speed: 0, engineOn: false, driver: null } : { ...v, passengers: v.passengers.filter((p) => p !== self) };
    this.myVehicle = null;
    this.exitTo = out;
    if (this.authority === 'host') {
      this.vehicles.set(parked);
    } else if (this.net) {
      if (driver) this.net.sendVehicle(encodeVehicle({ ...v, speed: 0, engineOn: false }));
      this.vehicles.set(parked);
      const r = ++this.invReq;
      this.pendingInv.set(r, { op: 'vehicle', c: v.id, at: this.elapsed, act: 'exit' });
      this.net.sendBuild({ r, o: 'v', t: v.id, a: VEHICLE_ACTIONS.indexOf('exit') });
    }
    return true;
  }

  /** Pools of light ahead of every running vehicle. */
  private headlights(): { x: number; y: number }[] {
    const out: { x: number; y: number }[] = [];
    for (const v of this.vehicles.vehicles.values()) {
      if (!v.engineOn) continue;
      const reach = VEHICLE_SPECS[v.kind].length / 2 + HEADLIGHT_TILES * 8;
      out.push({ x: v.x + Math.cos(v.angle) * reach, y: v.y + Math.sin(v.angle) * reach });
    }
    return out;
  }

  /** Distance to a container; a trunk counts from anywhere around its vehicle. */
  private containerDistance(c: { id: number; kind: ContainerKind; x: number; y: number; w?: number; h?: number }, x: number, y: number): number {
    if (c.kind === 'trunk') {
      const v = this.vehicles.get(c.id - TRUNK_ID_BASE);
      if (v) return distanceTo(v, VEHICLE_SPECS[v.kind], x, y);
    }
    return ContainerStore.distance(c, x, y);
  }

  // ------------------------------------------------------------ persistence (persistence.ts)

  isHost(): boolean {
    return this.authority === 'host';
  }

  /**
   * The whole shared world as a save: a full snapshot (every zombie, not
   * just the ones near players) plus host bookkeeping. Cars are saved
   * parked and empty.
   */
  exportWorld(): WorldSave {
    const snap: ZombieSnapshot = {
      s: 0,
      z: this.sim.zombies.map((z) => this.zombieRow(z)),
      el: Math.round(this.elapsed),
      sk: Math.round(this.clockSkip),
      d: [...this.dirtyEntrances].map((t) => this.entranceRow(t)).filter((r): r is EntranceRow => !!r),
      t: [...this.taken],
      tf: 1,
      c: this.sim.corpses.map((c) => [c.id, Math.round(c.x), Math.round(c.y)]),
      cs: [...this.store.dirty].map((id) => this.store.encode(id)).filter((r): r is ContainerRow => !!r),
      bs: [...this.built].map(([tile, b]) => this.builtRow(tile, b)),
      sh: [...this.claims].map(([id, c]) => [id, c.owner, c.name]),
      vh: [...this.vehicles.dirty]
        .map((id) => this.vehicles.get(id))
        .filter((v): v is VehicleState => !!v)
        .map((v) => encodeVehicle({ ...v, driver: null, passengers: [], speed: 0, engineOn: false })),
    };
    return { v: WORLD_SAVE_VERSION, elapsed: this.elapsed, skip: this.clockSkip, snap, alarms: [...this.alarmsTriggered], at: Date.now() };
  }

  /** A saved world to load if this client ends up starting the world (see update). */
  offerWorldSave(save: WorldSave) {
    if (!this.hadHostState) this.pendingWorldSave = save;
  }

  /** Loads a saved world: through the snapshot path, then the host takes it over. */
  private importWorld(save: WorldSave) {
    const snap = { ...save.snap, b: undefined, k: undefined, ia: undefined, x: undefined };
    this.applySnapshotData(snap);
    this.elapsed = save.elapsed;
    this.clockSkip = save.skip;
    // No catch-up for the jump to the saved clock: fuel, crops and fires carry on from where they were
    this.worldClock = this.elapsed + this.clockSkip;
    // Everything loaded is "changed" for late joiners and the next save
    for (const row of save.snap.d ?? []) {
      this.dirtyEntrances.add(row[0]);
      if (ENTRANCE_STATES[row[1]] === 'broken') this.brokenSeen.add(row[0]);
    }
    for (const row of save.snap.cs ?? []) this.store.dirty.add(row[0]);
    for (const a of save.alarms) this.alarmsTriggered.add(a);
    this.tracks.clear();
    this.sim.adopt();
    this.director.adoptAll();
    this.entranceResendTimer = 0;
    // Loading isn't an event: no break sounds or splinters for what was already broken
    this.sfx = [];
    this.feedback.floaters = [];
    this.showToast('The world carries on where it was left', 'save');
  }

  /** Your survivor as a save (null while creating one or dead). */
  exportPlayer(): PlayerSave | null {
    if (!this.ready || this.deadTimer > 0) return null;
    return {
      v: PLAYER_SAVE_VERSION,
      survivor: { name: this.survivor.name, occupation: this.survivor.occupation, traits: [...this.survivor.traits] },
      pos: { x: Math.round(this.feet.x), y: Math.round(this.feet.y) },
      vitals: { ...this.vitals, effects: [] },
      condition: this.condition,
      body: this.body,
      skills: this.skills,
      booksRead: this.booksRead,
      recipes: [...this.knownRecipes],
      bag: this.bag.items,
      equipped: Object.fromEntries(Object.entries(this.equipped).filter(([, it]) => !!it)) as Record<string, InventoryItem>,
      weapons: {
        owned: [...this.owned],
        current: this.weapon,
        durability: { ...this.durability } as Record<string, number>,
        mags: { ...this.mags } as Record<string, number>,
        reserve: { ...this.reserve },
      },
      at: Date.now(),
    };
  }

  /**
   * Brings a saved survivor back (only while the creator would otherwise
   * show). Returns false if the save doesn't fit this version of the game.
   */
  importPlayer(s: PlayerSave): boolean {
    if (this.ready || this.deadTimer > 0) return false;
    const build = { name: s.survivor.name, occupation: s.survivor.occupation, traits: s.survivor.traits } as SurvivorBuild;
    if (!OCCUPATIONS[build.occupation] || buildErrors(build).some((e) => !/point/i.test(e))) return false;
    const num = (v: unknown, lo: number, hi: number, d: number) => (typeof v === 'number' && Number.isFinite(v) ? Math.max(lo, Math.min(hi, v)) : d);
    const lvl = (v: unknown, d: { level: number; xp: number }) => {
      const o = (v ?? {}) as { level?: unknown; xp?: unknown };
      return { level: Math.round(num(o.level, 0, 10, d.level)), xp: num(o.xp, 0, 1e7, 0) };
    };
    this.survivor = { name: build.name.trim() || 'Survivor', occupation: build.occupation, traits: [...build.traits] };
    this.mods = survivorModifiers(this.survivor);
    const v = s.vitals as Record<string, unknown>;
    const fv = freshVitals();
    this.vitals = {
      ...fv,
      health: num(v.health, 1, 100, fv.health),
      hunger: num(v.hunger, 0, 100, fv.hunger),
      hydration: num(v.hydration, 0, 100, fv.hydration),
      stamina: num(v.stamina, 0, 100, fv.stamina),
    };
    const c = s.condition as Record<string, unknown>;
    const fc = freshCondition();
    this.condition = {
      fatigue: num(c.fatigue, 0, 100, fc.fatigue),
      stress: num(c.stress, 0, 100, 0),
      panic: 0,
      boredom: num(c.boredom, 0, 100, 0),
      unhappiness: num(c.unhappiness, 0, 100, 0),
      bodyTemp: num(c.bodyTemp, 30, 42, fc.bodyTemp),
      bodyWeight: num(c.bodyWeight, 40, 140, fc.bodyWeight),
      wet: num(c.wet, 0, 100, 0),
      fitness: lvl(c.fitness, fc.fitness),
      strength: lvl(c.strength, fc.strength),
    };
    const b = s.body as Partial<BodyState>;
    this.body =
      Array.isArray(b.wounds) && Array.isArray(b.fractures)
        ? { ...freshBody(), ...b, painkiller: num(b.painkiller, 0, 1e4, 0), nextId: num(b.nextId, 1, 1e9, 1) }
        : freshBody();
    const sk = s.skills as Record<string, unknown>;
    const base = freshSkills();
    this.skills = Object.fromEntries(SKILL_IDS.map((id) => [id, lvl(sk[id], base[id])])) as SkillSet;
    this.booksRead = s.booksRead as BooksRead;
    this.knownRecipes = new Set(s.recipes.filter((r): r is RecipeId => r in RECIPES));
    this.bag = { ...this.bag, items: s.bag };
    this.equipped = {};
    for (const slot of ['back', 'outer', 'hands'] as EquipSlot[]) if (s.equipped[slot]) this.equipped[slot] = s.equipped[slot];
    const owned = s.weapons.owned.filter((w): w is WeaponId => (WEAPON_ORDER as readonly string[]).includes(w));
    this.owned = new Set<WeaponId>(['fists', ...owned]);
    this.durability = {};
    this.mags = {};
    for (const w of this.owned) {
      if (s.weapons.durability[w] !== undefined) this.durability[w] = s.weapons.durability[w];
      if (s.weapons.mags[w] !== undefined) this.mags[w] = s.weapons.mags[w];
    }
    for (const a of Object.keys(this.reserve) as AmmoType[]) this.reserve[a] = Math.round(num(s.weapons.reserve[a], 0, 9999, 0));
    this.weapon = this.owned.has(s.weapons.current as WeaponId) ? (s.weapons.current as WeaponId) : 'fists';
    this.pain = 0;
    this.lastStage = 'none';
    this.ready = true;
    this.showToast(`Welcome back, ${this.survivor.name}`, OCCUPATIONS[build.occupation].icon);
    return true;
  }

  /** True once after each death (WorldGame deletes the survivor save: permadeath). */
  takeDeath(): boolean {
    const d = this.diedFlag;
    this.diedFlag = false;
    return d;
  }

  // ------------------------------------------------------------ world rules (balance.ts)

  /** Rules from the database (the host spreads them; clients take the host's). */
  setRules(rules: WorldRules) {
    const r = sanitizeRules(rules);
    if (sameRules(r, this.rules)) return;
    this.rules = r;
  }

  getRules(): WorldRules {
    return this.rules;
  }

  /** After an admin saved new rules: the host reloads them (clients ask the host to). */
  announceRulesChanged() {
    if (this.authority === 'host') this.onRulesChanged?.();
    else if (this.authority === 'client' && this.net) this.net.sendBuild({ r: ++this.invReq, o: 'r' });
  }

  // ------------------------------------------------------------ multiplayer sleep

  /** Everyone in the world is asleep (alone counts): only then does time speed up. */
  private everyoneAsleep(others: SimTarget[]): boolean {
    // Everyone on the channel counts (someone who hasn't appeared in the world yet is awake)
    const members = this.net?.memberCount() ?? 1;
    if (members <= 1) return true;
    const asleep = others.filter((o) => this.sleepers.get(o.id) === true).length;
    return asleep >= members - 1;
  }

  /** Host: asleep / total (null when playing alone); clients: the host's count. */
  private sleepSummary(): { asleep: number; total: number } | null {
    if (this.authority !== 'host') return this.sleepCount;
    const others = this.lastOthers;
    if (!others.length) return null;
    let asleep = this.sleeping ? 1 : 0;
    for (const o of others) if (this.sleepers.get(o.id)) asleep++;
    return { asleep, total: others.length + 1 };
  }

  /** Clients tell the host when they fall asleep / wake up. */
  private reportSleep() {
    const asleep = !!this.sleeping;
    if (asleep === this.sentSleep || this.authority !== 'client' || !this.net) return;
    this.sentSleep = asleep;
    this.net.sendBuild({ r: ++this.invReq, o: 's', a: asleep ? 1 : 0 });
  }

  // ------------------------------------------------------------ stats (performance overlay)

  private countBytes(snap: ZombieSnapshot) {
    this.netBytes += JSON.stringify(snap).length;
    if (this.elapsed - this.netBytesAt >= 2) {
      this.netRate = this.netBytes / Math.max(0.001, this.elapsed - this.netBytesAt);
      this.netBytes = 0;
      this.netBytesAt = this.elapsed;
    }
  }

  /** Numbers for the performance overlay. */
  netStats(): { role: Authority; zombies: number; bytesPerSecond: number; droppedRequests: number; vehicles: number; structures: number } {
    return {
      role: this.authority,
      zombies: this.sim.zombies.length,
      bytesPerSecond: Math.round(this.netRate),
      droppedRequests: this.guard.droppedTotal,
      vehicles: this.vehicles.size,
      structures: this.built.size,
    };
  }


  // ------------------------------------------------------------ feedback API

  /** Queues a sound (WorldGame plays it through SurvivalAudio). */
  private sound(id: SoundId, x?: number, y?: number, vol?: number) {
    if (this.sfx.length < 64) this.sfx.push(x === undefined ? { id, vol } : { id, x, y, vol });
  }

  /** This frame's sounds (and clears the queue). */
  drainSounds(): SoundEvent[] {
    const out = this.sfx;
    this.sfx = [];
    return out;
  }

  /** The continuous sounds around you right now. */
  ambience(): Ambience {
    if (!this.ready || this.deadTimer > 0) return SILENCE;
    const w = this.world;
    const fx = this.feet.x;
    const fy = this.feet.y;
    const car = this.myVehicleState();
    const nearest = (pts: { x: number; y: number }[]) => pts.reduce((m, p) => Math.min(m, Math.hypot(p.x - fx, p.y - fy)), Infinity);
    const hp = this.vitals.health;
    return {
      rain: w.fx.precipitation * (w.weather === 'snow' ? 0.3 : 1),
      wind: w.weather === 'storm' ? 1 : w.weather === 'snow' ? 0.4 : w.weather === 'rain' ? 0.2 : 0,
      sheltered: this.insideBuilding !== null || !!car,
      engine: car?.engineOn ? Math.min(1, Math.abs(car.speed) / VEHICLE_SPECS[car.kind].maxSpeed) : null,
      heartbeat: hp < 30 ? Math.round(70 + (30 - hp) * 2.5) : 0,
      helicopter: w.helicopter ? proximity(Math.hypot(w.helicopter.x - fx, w.helicopter.y - fy), 1800) : 0,
      generator: proximity(nearest(this.powerSources), 260),
      fire: proximity(nearest(this.fires), 180),
    };
  }

  /** Screen shake offset (world px) for WorldGame's camera. */
  shakeOffset(): { x: number; y: number } {
    return this.shake.offset(this.animTime);
  }

  /** Survival settings: screen shake and floating numbers. */
  setFeedback(opts: { shake: boolean; numbers: boolean }) {
    this.shake.enabled = opts.shake;
    this.feedback.numbers = opts.numbers;
  }

  /** The survival menu (map, log, settings) is open: the HUD then carries the map and the log. */
  setMenuOpen(open: boolean) {
    this.menuOpen = open;
  }

  private fxSound(f: { k: ZombieFx['k']; x: number; y: number }) {
    const id: SoundId | null = f.k === 'a' ? 'alarm' : f.k === 'g' ? 'distant_shots' : f.k === 'n' ? 'lure' : f.k === 'b' ? 'burst' : f.k === 'r' ? 'roar' : f.k === 'i' ? 'hit' : f.k === 'c' ? 'wood_break' : null;
    if (id) this.sound(id, f.x, f.y);
    if (f.k === 'b' && Math.hypot(f.x - this.feet.x, f.y - this.feet.y) < 160) this.shake.add(0.35);
    if (f.k === 'b') this.feedback.burst('blood', f.x, f.y, 14, '#65A30D');
  }

  /** A door or window giving way: splinters or glass, and a sound. */
  private breakFeedback(kind: EntranceKind, x: number, y: number) {
    this.sound(kind === 'window' ? 'glass' : 'wood_break', x, y);
    this.feedback.burst(kind === 'window' ? 'spark' : 'dust', x, y, 8, kind === 'window' ? '#BAE6FD' : '#A16207');
  }

  /** Every few seconds, a nearby hunting zombie groans (you hear them before you see them). */
  private updateGroans(dt: number) {
    this.groanTimer -= dt;
    if (this.groanTimer > 0) return;
    this.groanTimer = 1.5 + this.fxRng() * 3;
    const r2 = (12 * this.vision.grid.tileSize) ** 2;
    let best: Zombie | null = null;
    let bestD = r2;
    for (const z of this.sim.zombies) {
      const d = (z.x - this.feet.x) ** 2 + (z.y - this.feet.y) ** 2;
      if (d < bestD && (z.state === 'chase' || z.state === 'attack' || this.fxRng() < 0.2)) {
        best = z;
        bestD = d;
      }
    }
    if (best) this.sound('groan', best.x, best.y);
  }

  /** What the map panel draws (rounded so the HUD only updates on visible moves). */
  private mapHud(): MapHud {
    const r = (v: number) => Math.round(v / 8) * 8;
    const g = this.vision.grid;
    const mine = this.myVehicle;
    const claim = [...this.claims].find(([, c]) => c.owner === this.selfId());
    const home = claim ? this.buildingById.get(claim[0])?.footprint ?? null : null;
    const built: MapHud['built'] = [];
    for (const [tile, b] of this.built) {
      const c = tile % g.cols;
      built.push({ x: (c + 0.5) * g.tileSize, y: ((tile - c) / g.cols + 0.5) * g.tileSize, kind: b.kind });
    }
    return {
      w: this.worldWidth,
      h: this.worldHeight,
      player: { x: r(this.feet.x), y: r(this.feet.y), a: Math.round((this.aim ?? this.vision.getFacing()) * 4) / 4 },
      others: this.lastOthers.map((o) => ({ x: r(o.x), y: r(o.y) })),
      vehicles: [...this.vehicles.vehicles.values()].map((v) => ({ x: r(v.x), y: r(v.y), a: Math.round(v.angle * 2) / 2, mine: v.id === mine })),
      built,
      safehouse: home ? { x: home.x, y: home.y, w: home.w, h: home.h } : null,
      points: this.fixtures.filter((f) => f.kind === 'pump' || f.kind === 'fountain').map((f) => ({ x: f.x + f.w / 2, y: f.y + f.h / 2, kind: f.kind as 'pump' | 'fountain' })),
      helicopter: this.world.helicopter ? { x: r(this.world.helicopter.x), y: r(this.world.helicopter.y) } : null,
    };
  }

  /** Where WorldGame should put you after getting out (consumed once). */
  takeExitPoint(): { x: number; y: number } | null {
    const p = this.exitTo;
    this.exitTo = null;
    return p;
  }

  private vehicleRng(): number {
    return this.injuryRng();
  }

  /**
   * Driving (you're the driver): physics against the map, fuel, crashes,
   * running zombies down, and telling everyone where the car is.
   */
  private updateVehicle(dt: number, input: ZombieFrameInput) {
    this.hornCooldown = Math.max(0, this.hornCooldown - dt);
    this.crankCooldown = Math.max(0, this.crankCooldown - dt);
    this.ramCooldown = Math.max(0, this.ramCooldown - dt);
    const v = this.myVehicleState();
    if (!v) {
      this.myVehicle = null;
      return;
    }
    const self = this.selfId();
    if (v.driver !== self && !v.passengers.includes(self)) {
      // The host gave the seat to someone else (or we left on another device)
      this.myVehicle = null;
      return;
    }
    if (this.deadTimer > 0) {
      this.exitVehicle(true);
      return;
    }
    if (v.driver !== self) return;
    const spec = VEHICLE_SPECS[v.kind];
    const ctl = { throttle: -input.moveY, steer: input.moveX };
    if (!v.engineOn && ctl.throttle !== 0 && this.crankCooldown <= 0) this.tryStart();
    const cur = this.vehicles.get(v.id)!;
    // Never a negative or long step (a stalled tab must not throw the car through a wall): small sub-steps
    const total = Math.max(0, Math.min(dt, VEHICLE_MAX_STEP * 4));
    const n = Math.max(1, Math.ceil(total / VEHICLE_MAX_STEP));
    let r = { state: cur, crash: 0, stalled: false, moved: 0 };
    for (let k = 0; k < n; k++) {
      const sub = stepVehicle(r.state, ctl, total / n, (x, y) => this.vehicles.blockedPoint(cur.id, x, y));
      r = { state: sub.state, crash: Math.max(r.crash, sub.crash), stalled: r.stalled || sub.stalled, moved: r.moved + sub.moved };
    }
    let next = r.state;
    if (r.crash > VEHICLE.crashDamage) {
      const c = crashDamage(next, r.crash);
      next = c.state;
      if (c.driverHurt > 0) this.takeDamage(c.driverHurt, [], 'impact');
      this.showToast(r.crash > VEHICLE.crashHurt ? 'Crash!' : 'Bump', 'warning');
      this.sound('crash', next.x, next.y, Math.min(1, r.crash / 150));
      this.shake.add(Math.min(0.7, r.crash / 250));
      this.feedback.burst('spark', next.x + Math.cos(next.angle) * 26, next.y + Math.sin(next.angle) * 26, 10, '#FDE68A');
      if (this.authority === 'host') this.pendingNoises.push({ x: next.x, y: next.y, radius: 12 });
    }
    if (r.stalled) this.showToast('Out of fuel — the engine dies', 'fuel');
    // Running zombies down
    if (Math.abs(next.speed) > 20 && this.ramCooldown <= 0) {
      const outline = corners(next, spec, 3);
      const hit = this.sim.zombies.some((z) => distanceTo(next, spec, z.x, z.y) <= 3);
      if (hit) {
        this.ramCooldown = 0.25;
        const speed = Math.abs(next.speed);
        this.sound('hit', next.x, next.y);
        this.shake.add(0.15);
        for (const z of this.sim.zombies) if (distanceTo(next, spec, z.x, z.y) <= 3) this.feedback.burst('blood', z.x, z.y - 10, 8, '#991B1B');
        if (this.authority === 'host') this.kills += this.ramZombies(outline, next.x, next.y, speed);
        else this.net?.sendStrike({ x: Math.round(next.x), y: Math.round(next.y), f: Math.round(next.angle * 1000) / 1000, m: Math.round(speed), k: 'ram' });
        next = ramDamage(next, speed);
      }
    }
    this.vehicles.set(next);
    const trunk = this.vehicles.trunkAt(next);
    this.store.moveSpawn(VehicleSystem.trunkId(next), trunk.x, trunk.y);
    // Everyone else follows the car through our movement broadcasts; this carries the rest (≤ 2/s)
    this.vehicleSendTimer -= dt;
    if (this.authority !== 'host' && this.net && this.vehicleSendTimer <= 0) {
      this.vehicleSendTimer = VEHICLE_SEND_SECONDS;
      this.net.sendVehicle(encodeVehicle(next));
    }
  }

  /** Host: zombies inside a moving car's outline. Returns kills. */
  private ramZombies(outline: { x: number; y: number }[], x: number, y: number, speed: number): number {
    const damage = speed * VEHICLE.ramDamage * this.rules.playerDamage;
    return this.sim.ram(outline, x, y, damage, speed > VEHICLE.ramSpeed, (z) => effectiveDamage(z, 1, 'blunt')).kills;
  }

  /**
   * Every client: other people's cars follow their drivers' broadcast feet;
   * driver updates (`zveh`) carry angle, fuel and parts. Host only: engine
   * noise, horns and drivers who vanished.
   */
  private updateOtherVehicles(dt: number, others: SimTarget[]) {
    const self = this.selfId();
    const host = this.authority === 'host';
    // Driver updates
    const updates = this.remoteVehicleRows;
    this.remoteVehicleRows = [];
    for (const { row, from, horn } of updates) {
      const have = this.vehicles.get(typeof row[0] === 'number' ? row[0] : -1);
      if (!have || have.driver !== from) continue;
      const v = decodeVehicle(row);
      if (!v) continue;
      // Occupancy is the host's call, not the driver's
      this.vehicles.set({ ...v, driver: have.driver, passengers: have.passengers });
      const trunk = this.vehicles.trunkAt(v);
      this.store.moveSpawn(VehicleSystem.trunkId(v), trunk.x, trunk.y);
      if (horn) this.sound('horn', v.x, v.y);
      if (host && horn) this.pendingNoises.push({ x: v.x, y: v.y, radius: VEHICLE.hornNoise });
    }
    for (const v of this.vehicles.vehicles.values()) {
      if (!v.driver || v.driver === self) continue;
      const d = others.find((o) => o.id === v.driver);
      if (d) {
        this.driverSeen.set(v.id, this.elapsed);
        if (Math.abs(d.x - v.x) > 0.5 || Math.abs(d.y - v.y) > 0.5) {
          v.x = d.x;
          v.y = d.y;
          const trunk = this.vehicles.trunkAt(v);
          this.store.moveSpawn(VehicleSystem.trunkId(v), trunk.x, trunk.y);
        }
      } else if (host && this.elapsed - (this.driverSeen.get(v.id) ?? this.elapsed) > DRIVER_TIMEOUT_SECONDS) {
        // The driver left (closed the tab): the car stops where it was
        this.vehicles.set({ ...v, driver: null, speed: 0, engineOn: false });
      } else if (!this.driverSeen.has(v.id)) {
        this.driverSeen.set(v.id, this.elapsed);
      }
    }
    if (!host) return;
    // Engines are loud
    this.engineNoiseTimer -= dt;
    if (this.engineNoiseTimer <= 0) {
      this.engineNoiseTimer = 1.5;
      for (const v of this.vehicles.vehicles.values()) {
        const radius = engineNoise(v);
        if (radius > 0) this.pendingNoises.push({ x: v.x, y: v.y, radius });
      }
    }
  }

  // ------------------------------------------------------------ fishing, foraging, hotwiring

  /** Starts a timed action (standing still): fishing, foraging, hotwiring. */
  private startActivity(kind: 'fish' | 'forage' | 'hotwire', seconds: number, label: string, target: number): boolean {
    this.crafting = null;
    this.placing = null;
    this.constructing = null;
    this.activity = { kind, t: 0, total: seconds, label, target };
    return true;
  }

  private updateActivity(dt: number, moving: boolean) {
    const a = this.activity;
    if (!a) return;
    if (moving || this.deadTimer > 0 || this.sleeping || this.myVehicle !== null) {
      this.activity = null;
      if (moving) this.showToast(`Stopped ${a.label.toLowerCase()}`, 'close');
      return;
    }
    if ((a.t += dt) < a.total) return;
    this.activity = null;
    if (a.kind === 'hotwire') this.requestVehicle(a.target, 'hotwire');
    else if (a.kind === 'fish') this.finishCast(a.target);
    else this.finishForage();
  }

  /** Casts left at a fishing spot (they come back over time). */
  private fishStockAt(index: number): number {
    const s = this.fishStock.get(index);
    if (!s) return FISHING.stock;
    const hours = gameHours(this.elapsed + this.clockSkip) - s.at;
    return Math.min(FISHING.stock, s.left + Math.floor(hours / FISHING.recoverHours));
  }

  private finishCast(index: number) {
    const rod = this.bag.items.find((i) => i.def === 'fishing_rod');
    if (!rod) {
      this.showToast('Needs a fishing rod', 'fishingHook');
      return;
    }
    const baitStack = this.bag.items.find((i) => BAIT_ITEMS.includes(i.def));
    const stock = this.fishStockAt(index);
    const caught = castLine(
      { level: this.skills.fishing.level, baited: !!baitStack, light: this.tod.light, weather: this.world.weather, stock },
      this.vehicleRng(),
      this.vehicleRng()
    );
    if (baitStack) this.bag = removeFromBag(this.bag, baitStack.uid, 1).bag;
    this.sound('splash');
    this.fishStock.set(index, { left: Math.max(0, stock - 1), at: gameHours(this.elapsed + this.clockSkip) });
    // The rod wears, and a big fish can snap it
    const big = caught === 'carp' || caught === 'catfish';
    const wear = (rod.cond ?? 1) - (big && this.vehicleRng() < FISHING.snapChance ? 1 : 0.03);
    this.bag = { ...this.bag, items: this.bag.items.filter((i) => i.uid !== rod.uid || wear > 0).map((i) => (i.uid === rod.uid ? { ...i, cond: wear } : i)) };
    if (wear <= 0) this.showToast('Your fishing rod snapped!', 'fishingHook');
    if (!caught) {
      this.train('fishing', 1);
      if (wear > 0) this.showToast(baitStack ? 'Nothing bites. The bait is gone' : 'Nothing bites', 'fishingHook');
      return;
    }
    const it: InventoryItem = { uid: `f${this.uidSeq++}`, def: FISH[caught].item, qty: 1 };
    if (!this.receiveItem(it, true)) this.dropToGround(it);
    this.train('fishing', big ? 10 : 5);
    if (wear > 0) this.showToast(`Caught: ${ITEM_DEFS[it.def].name}`, 'fish');
  }

  /** The patch of ground you're on (foraging picks a patch over for a while). */
  private forageCell(): string {
    const size = FORAGE.cellTiles * this.vision.grid.tileSize;
    return `${Math.floor(this.feet.x / size)},${Math.floor(this.feet.y / size)}`;
  }

  private finishForage() {
    const ground = this.groundAt(this.feet.x, this.feet.y - 4);
    if (ground !== 'grass' && ground !== 'park' && ground !== 'dirt') return;
    const now = gameHours(this.elapsed + this.clockSkip);
    const cell = this.forageCell();
    if ((this.forageCells.get(cell) ?? 0) > now) {
      this.showToast('Picked over — try somewhere else', 'leaf');
      return;
    }
    const found = forage(
      { ground, season: this.world.season, level: this.skills.foraging.level, light: this.tod.light, flashlight: this.flashlightOn },
      [this.vehicleRng(), this.vehicleRng(), this.vehicleRng()]
    );
    this.forageCells.set(cell, now + FORAGE.recoverHours);
    this.sound('rustle');
    this.train('foraging', found ? 5 : 2);
    if (!found) {
      this.showToast('Nothing useful here', 'leaf');
      return;
    }
    const it: InventoryItem = { uid: `fg${this.uidSeq++}`, def: found.def, qty: found.qty };
    if (!this.receiveItem(it, true)) this.dropToGround(it);
    this.showToast(`Found ${found.qty} × ${ITEM_DEFS[found.def].name}`, ITEM_DEFS[found.def].icon);
  }

  /** The air you feel: the weather, a building (heated with power), a car (its heater with the engine on), a campfire. */
  private ambientAt(indoors: boolean, x: number, y: number): number {
    const car = this.myVehicleState();
    const base = indoors
      ? indoorTemp(this.world.outdoorTemp, this.poweredAt(x, y))
      : car
        ? this.world.outdoorTemp + (car.engineOn ? 14 : 4)
        : this.world.outdoorTemp;
    return base + this.fireWarmth(x, y);
  }

  private gunshotToast(x: number, y: number) {
    if (Math.hypot(x - this.feet.x, y - this.feet.y) <= WORLD_EVENTS.gunshotHearTiles * this.vision.grid.tileSize) {
      this.showToast('Gunshots in the distance…', 'crosshair');
    }
  }

  /**
   * Host: utilities (fuel, rain, fire), generator noise, thunder, the
   * helicopter, distant gunfire and horde migrations. Zombies hear less in
   * the rain and see less in fog.
   */
  private updateWorldHost(dt: number, players: SimTarget[]) {
    const w = this.world;
    const g = this.vision.grid;
    const ts = g.tileSize;
    const clock = this.elapsed + this.clockSkip;
    // Clock jumps (a snapshot from a previous host, a long sleep) are capped
    const hours = Math.max(0, Math.min(2, gameHours(clock) - gameHours(this.worldClock)));
    const from = this.worldClock;
    this.worldClock = clock;
    this.sim.hearingMul = w.fx.hearingMul;
    this.sim.sightMul = w.fx.visionMul;

    // Utilities
    this.generatorNoiseTimer -= dt;
    const hum = this.generatorNoiseTimer <= 0;
    if (hum) this.generatorNoiseTimer = GENERATOR.noiseEvery;
    for (const [tile, b] of this.built) {
      if (!b.state || !isUtility(b.kind)) continue;
      const c = tile % g.cols;
      const x = (c + 0.5) * ts;
      const y = ((tile - c) / g.cols + 0.5) * ts;
      const rain = g.flags[tile] & TILE_INTERIOR ? 0 : w.fx.precipitation;
      const r = tickUtility(b.kind, b.state, hours, hours * (GAME_DAY_SECONDS / 24), rain, {
        season: w.season,
        temp: w.outdoorTemp,
        weather: w.weather,
        rng: this.eventRng,
      });
      b.state = r.state;
      if (r.event && Math.hypot(x - this.feet.x, y - this.feet.y) <= 12 * ts) this.showToast(UTILITY_EVENT[r.event], STRUCTURES[b.kind].icon);
      if (hum && b.kind === 'generator' && generatorRunning(b.state)) this.pendingNoises.push({ x, y, radius: GENERATOR.noiseRadius });
    }
    if (!players.length || from <= 0) return;
    const rng = this.eventRng;
    const pickPlayer = () => players[Math.floor(rng() * players.length)];
    const around = (p: SimTarget, minTiles: number, maxTiles: number) => {
      const a = rng() * Math.PI * 2;
      const d = (minTiles + rng() * (maxTiles - minTiles)) * ts;
      return {
        x: Math.max(32, Math.min(this.worldWidth - 32, p.x + Math.cos(a) * d)),
        y: Math.max(32, Math.min(this.worldHeight - 32, p.y + Math.sin(a) * d)),
      };
    };

    // Thunder rolls in somewhere near someone
    for (let n = lightningBetween(this.worldSeed, from, clock, w.weather); n > 0; n--) {
      const p = around(pickPlayer(), 10, 25);
      this.pendingNoises.push({ ...p, radius: WORLD_EVENTS.thunderRadius });
    }
    // The helicopter drags everything along under it
    if (w.helicopter) {
      this.heliNoiseTimer -= dt;
      if (this.heliNoiseTimer <= 0) {
        this.heliNoiseTimer = WORLD_EVENTS.heliEvery;
        this.pendingNoises.push({ x: w.helicopter.x, y: w.helicopter.y, radius: WORLD_EVENTS.heliRadius });
      }
    }
    // Someone else's fight, a few blocks away
    this.gunshotTimer -= dt;
    if (this.gunshotTimer <= 0) {
      const [lo, hi] = WORLD_EVENTS.gunshotEvery;
      this.gunshotTimer = lo + rng() * (hi - lo);
      const p = around(pickPlayer(), WORLD_EVENTS.gunshotTiles[0], WORLD_EVENTS.gunshotTiles[1]);
      this.pendingNoises.push({ ...p, radius: WORLD_EVENTS.gunshotRadius });
      const fx: ZombieFx = { k: 'g', x: Math.round(p.x), y: Math.round(p.y) };
      this.fx.push({ ...fx, age: 0 });
      this.outFx.push(fx);
      this.gunshotToast(p.x, p.y);
    }
    // Hordes drift: a far-off sound nobody hears pulls a crowd across the map
    this.migrationTimer -= dt;
    if (this.migrationTimer <= 0) {
      const [lo, hi] = WORLD_EVENTS.migrationEvery;
      this.migrationTimer = lo + rng() * (hi - lo);
      const p = around(pickPlayer(), 45, 70);
      this.pendingNoises.push({ ...p, radius: WORLD_EVENTS.migrationRadius });
    }
  }

  private worldHud(): WorldHud {
    const w = this.world;
    return {
      weather: w.weather,
      label: WEATHER_LABEL[w.weather],
      // A clear night shows the moon, not the sun
      icon: w.weather === 'clear' && this.tod.light < 0.25 ? 'moon' : WEATHER_ICON[w.weather],
      tempC: Math.round(w.outdoorTemp),
      season: w.season[0].toUpperCase() + w.season.slice(1),
      power: w.power,
      water: w.water,
      helicopter: !!w.helicopter,
    };
  }

  /** Rain, snow, fog, gloom, lightning and the helicopter's shadow (screen space). */
  private renderWeather(ctx: CanvasRenderingContext2D, w: number, h: number, cam?: { x: number; y: number; zoom: number }) {
    const wx = this.world;
    const fx = wx.fx;
    const indoors = this.insideBuilding !== null;
    ctx.save();
    // Overcast daylight
    if (fx.gloom > 0 && this.tod.light > 0.05) {
      ctx.fillStyle = `rgba(51, 65, 85, ${(fx.gloom * 0.45 * this.tod.light).toFixed(3)})`;
      ctx.fillRect(0, 0, w, h);
    }
    if (!indoors && wx.weather === 'fog') {
      const g = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.12, w / 2, h / 2, Math.max(w, h) * 0.6);
      g.addColorStop(0, 'rgba(203, 213, 225, 0.05)');
      g.addColorStop(1, 'rgba(203, 213, 225, 0.55)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
    }
    if (!indoors && fx.precipitation > 0) {
      const snow = wx.weather === 'snow';
      const count = Math.round(((w * h) / (snow ? 6000 : 4500)) * fx.precipitation);
      const t = this.animTime;
      ctx.fillStyle = 'rgba(241, 245, 249, 0.85)';
      ctx.strokeStyle = 'rgba(186, 214, 254, 0.45)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (let i = 0; i < count; i++) {
        // Stable per-drop offsets; drops fall and wrap
        const ox = ((i * 7919) % 1009) / 1009;
        const oy = ((i * 104729) % 1013) / 1013;
        if (snow) {
          const y = (oy * (h + 20) + t * (30 + (i % 5) * 6)) % (h + 20) - 10;
          const x = (ox * w + Math.sin(t * 0.8 + i) * 10 + w) % w;
          ctx.rect(x, y, 2, 2);
        } else {
          const y = (oy * (h + 40) + t * (520 + (i % 7) * 40)) % (h + 40) - 20;
          const x = (ox * (w + 40) - t * 60 + (w + 40) * 4) % (w + 40) - 20;
          ctx.moveTo(x, y);
          ctx.lineTo(x - 3, y + 11);
        }
      }
      if (snow) ctx.fill();
      else ctx.stroke();
    }
    if (wx.flash > 0) {
      ctx.fillStyle = `rgba(248, 250, 252, ${(wx.flash * (indoors ? 0.18 : 0.45)).toFixed(3)})`;
      ctx.fillRect(0, 0, w, h);
    }
    // The helicopter: a shadow and a blur of rotor sweeping over the city
    const heli = wx.helicopter;
    if (heli && cam) {
      const sx = (heli.x - cam.x) * cam.zoom;
      const sy = (heli.y - cam.y) * cam.zoom;
      if (sx > -200 && sy > -200 && sx < w + 200 && sy < h + 200) {
        const s = 64 * cam.zoom;
        ctx.translate(sx, sy);
        ctx.rotate(heli.heading);
        ctx.fillStyle = 'rgba(15, 23, 42, 0.35)';
        ctx.beginPath();
        ctx.ellipse(0, 0, s * 0.45, s * 0.2, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillRect(-s * 0.95, -s * 0.05, s * 0.55, s * 0.1);
        ctx.strokeStyle = 'rgba(15, 23, 42, 0.25)';
        ctx.lineWidth = Math.max(2, s * 0.05);
        const spin = this.animTime * 30;
        ctx.beginPath();
        ctx.moveTo(Math.cos(spin) * s * 0.7, Math.sin(spin) * s * 0.7);
        ctx.lineTo(-Math.cos(spin) * s * 0.7, -Math.sin(spin) * s * 0.7);
        ctx.stroke();
      }
    }
    ctx.restore();
  }


  /** A noise maker at (x, y): buzzes after a moment and pulls zombies in for half a minute. */
  private addLure(x: number, y: number) {
    this.lures.push({ x, y, delay: LURE.delay, left: LURE.seconds, next: 0 });
    const fx: ZombieFx = { k: 'n', x: Math.round(x), y: Math.round(y) };
    this.fx.push({ ...fx, age: 0 });
    this.outFx.push(fx);
  }

  private recipeHud(): RecipeHud[] {
    const ctx = this.craftContext();
    const nameOf = (d: ItemDefId) => ITEM_DEFS[d].name;
    return RECIPE_ORDER.map((id) => {
      const r = RECIPES[id];
      const st = recipeStatus(r, ctx, nameOf);
      const kind = structureOf(r);
      return {
        id,
        name: r.name,
        category: r.category,
        icon: r.icon,
        description: r.description,
        known: st.known,
        ok: st.ok,
        missing: st.missing,
        inputs: r.inputs.map((i) => ({ name: nameOf(i.def) + (i.alt?.length ? ' (or similar)' : ''), qty: i.qty, have: inputCount(i, (d) => this.countItem(d)) })),
        tools: r.tools.map((g) => g.map(nameOf).join(' or ')),
        skill: r.skill ? `${SKILLS[r.skill.id].label} ${r.skill.level}` : null,
        workbench: !!r.workbench,
        seconds: Math.round(craftSeconds(r, this.skills, ctx.nearWorkbench, kind ? STRUCTURES[kind].seconds : r.seconds) * 10) / 10,
        structure: !!kind,
      };
    });
  }

  private buildHud(): BuildHud {
    const g = this.vision.grid;
    let placing: BuildHud['placing'] = null;
    if (this.placing) {
      const t = this.targetTile();
      const problem = this.placeProblem(t.tile, this.selfId(), { x: this.feet.x, y: this.feet.y - 4 });
      placing = { label: STRUCTURES[this.placing.kind].label, icon: STRUCTURES[this.placing.kind].icon, valid: !problem, reason: problem ? PLACE_BLOCK_TEXT[problem] : null };
    }
    const progress = this.crafting
      ? { label: RECIPES[this.crafting.id].name, value: Math.min(1, this.crafting.t / this.crafting.total) }
      : this.constructing
        ? { label: STRUCTURES[this.constructing.kind].label, value: Math.min(1, this.constructing.t / this.constructing.total) }
        : this.activity
          ? { label: this.activity.label, value: Math.min(1, this.activity.t / this.activity.total) }
          : null;
    let near: BuildHud['near'] = null;
    if (this.nearBuiltTile !== null && !this.placing) {
      const b = this.built.get(this.nearBuiltTile);
      if (b) {
        const e = g.entrances.get(this.nearBuiltTile);
        near = {
          label: STRUCTURES[b.kind].label,
          icon: STRUCTURES[b.kind].icon,
          hp: e ? Math.round((e.hp / STRUCTURES[b.kind].hp) * 20) / 20 : null,
          problem: this.dismantleProblem(this.nearBuiltTile),
        };
      }
    }
    const inside = this.insideBuilding && this.buildingById.has(this.insideBuilding) ? this.insideBuilding : null;
    const claim = inside ? this.claims.get(inside) : undefined;
    const safehouse = inside
      ? {
          name: this.buildingById.get(inside)?.name ?? 'Building',
          owner: claim ? (claim.owner === this.selfId() ? 'you' : claim.name) : null,
          problem: claim?.owner === this.selfId() ? null : this.claimProblem(inside),
        }
      : null;
    return { placing, progress, near, safehouse, mine: [...this.claims.values()].some((c) => c.owner === this.selfId()) };
  }

  /** Lets other systems (voice, music) make noise. */
  emitNoise(n: NoiseEvent) {
    this.pendingNoises.push(n);
  }

  isDead(): boolean {
    return this.deadTimer > 0;
  }

  /** Connects this mode to the shared horde. Without it the horde is local-only. */
  attachNet(net: ZombieSyncService) {
    this.net = net;
    this.authority = 'pending';
    net.onSnapshot = (snap, from) => this.applySnapshot(snap, from);
    // Every client request passes the host's rate limits first (hostGuard.ts)
    const ok = (from: string, kind: Parameters<HostGuard['allow']>[1]) => this.guard.allow(from, kind, this.elapsed);
    net.onStrike = (strike, from) => ok(from, 'strike') && this.remoteStrikes.push({ strike, from });
    net.onDoor = (door, from) => ok(from, 'door') && this.remoteDoors.push({ door, from });
    net.onShot = (shot, from) => ok(from, 'shot') && this.remoteShots.push({ shot, from });
    net.onLoot = (id, from) => ok(from, 'loot') && this.remoteLoot.push({ id, from });
    net.onDeath = (death, from) => ok(from, 'death') && this.remoteDeaths.push({ death, from });
    net.onInv = (op, from) => ok(from, 'inv') && this.remoteInv.push({ op, from });
    net.onBuild = (op, from) => ok(from, op.o === 'v' ? 'vehicle' : 'build') && this.remoteBuild.push({ op, from });
    net.onVehicle = (row, from, horn) => this.remoteVehicleRows.push({ row, from, horn });
  }

  // ------------------------------------------------------------ weapons API

  /** Trigger state (F key / fire button). Auto weapons fire while held. */
  setTrigger(down: boolean) {
    if (down && (this.sleeping || !this.ready)) return;
    if (down && !this.triggerHeld) this.pressAge = 0;
    this.triggerHeld = down;
  }

  /** Mouse aim in radians, or null to aim with movement. */
  setAim(angle: number | null) {
    this.aim = angle;
    this.vision.setAim(angle);
  }

  selectWeapon(id: WeaponId): boolean {
    if (!this.owned.has(id) || id === this.weapon) return false;
    this.weapon = id;
    this.reloadT = -1;
    this.fireCooldown = Math.max(this.fireCooldown, 0.25);
    return true;
  }

  /** Next (+1) / previous (-1) carried weapon. */
  cycleWeapon(dir: 1 | -1 = 1) {
    const list = WEAPON_ORDER.filter((w) => this.owned.has(w));
    const i = list.indexOf(this.weapon);
    this.selectWeapon(list[(i + dir + list.length) % list.length]);
  }

  /** Hotkeys 1–6: the carried weapon in that slot. Melee weapons all share 1, so pressing it again cycles them. */
  selectSlot(slot: number): boolean {
    const list = WEAPON_ORDER.filter((w) => this.owned.has(w) && WEAPONS[w].slot === slot);
    if (!list.length) return false;
    const i = list.indexOf(this.weapon);
    return this.selectWeapon(list[(i + 1) % list.length]) || i >= 0;
  }

  reload(): boolean {
    const spec = WEAPONS[this.weapon];
    if (!spec.ammo || this.reloadT >= 0 || this.deadTimer > 0 || this.sleeping) return false;
    if ((this.mags[this.weapon] ?? 0) >= spec.magSize || this.reserve[spec.ammo] <= 0) return false;
    this.reloadT = 0;
    this.sound('reload');
    return true;
  }

  /** Movement multiplier: weapon weight × vitals (hunger, gas, knockdown, stimulant) × sprint. */
  moveMultiplier(): number {
    if (this.sleeping || !this.ready) return 0;
    return WEAPONS[this.weapon].moveMul * this.speedMul * (this.sprinting ? SPRINT_MUL : 1);
  }

  getWeapon(): WeaponId {
    return this.weapon;
  }

  /** Street lamp props (sprite top-left, 24 × 48). They light up after dusk. */
  setLamps(lamps: { x: number; y: number }[]) {
    this.lamps = lamps.map((l) => ({ x: l.x + 12, y: l.y + 40, headX: l.x + 12, headY: l.y + 6 }));
  }

  /** Flashlight toggle (G / HUD button). Returns the new state. */
  toggleFlashlight(): boolean {
    this.flashlightOn = !this.flashlightOn;
    this.showToast(this.flashlightOn ? 'Flashlight on — zombies may notice' : 'Flashlight off', 'flashlight');
    return this.flashlightOn;
  }

  getTimeOfDay(): TimeOfDay {
    return this.tod;
  }

  /** Daylight, darkness, flashlight and light pools for this frame's vision. */
  private applyDaylight(feetX: number, feetY: number) {
    const t = this.tod;
    // Keen Hearing / Hard of Hearing widen or shrink the always-aware ring
    const dv = daylightVision(t.light);
    this.vision.setDaylight({ ...dv, peripheral: dv.peripheral * this.mods.peripheralMul });
    this.vision.setDarkness(1 - t.light);
    this.vision.setFlashlight(this.flashlightOn);
    const lights: { x: number; y: number; r: number }[] = [];
    if (t.light < LAMPS_ON_BELOW) {
      const reach2 = (LAMP_SIGHT_TILES * this.vision.grid.tileSize) ** 2;
      for (const l of this.lamps) {
        if ((l.x - feetX) ** 2 + (l.y - feetY) ** 2 <= reach2 && this.poweredAt(l.x, l.y)) lights.push({ x: l.x, y: l.y, r: LAMP_RADIUS_TILES });
      }
      // Campfires light their surroundings too
      for (const f of this.fires) {
        if ((f.x - feetX) ** 2 + (f.y - feetY) ** 2 <= reach2) lights.push({ x: f.x, y: f.y, r: CAMPFIRE.lightTiles });
      }
      // Headlights on running vehicles
      for (const h of this.headlights()) {
        if ((h.x - feetX) ** 2 + (h.y - feetY) ** 2 <= reach2) lights.push({ x: h.x, y: h.y, r: HEADLIGHT_TILES });
      }
    }
    if (this.muzzleAge < MUZZLE_LIGHT_SECONDS) lights.push({ x: feetX, y: feetY, r: MUZZLE_LIGHT_TILES });
    this.vision.setLights(lights);

    // Announce the turn of the day
    if (this.lastPhase !== null && t.phase !== this.lastPhase) {
      if (t.phase === 'dusk') this.showToast('Night is falling…', 'sunset');
      else if (t.phase === 'night') this.showToast('Night — they move faster in the dark', 'moon');
      else if (t.phase === 'dawn') this.showToast('Dawn breaks', 'sunrise');
    }
    this.lastPhase = t.phase;
  }

  private showToast(text: string, icon: IconName | null = null) {
    this.toast = { text, icon, age: 0 };
    this.notices.push(text, icon, this.elapsed);
  }

  /** Returns false when the item stays on the ground (bag full). */
  private pickUp(spawn: LootSpawn): boolean {
    const item = spawn.item;
    if (item.kind === 'supply') {
      const def = ITEM_DEFS[item.supply];
      const r = addToBag(this.bag, item.supply, 1, () => `s${this.uidSeq++}`);
      if (!r.added) {
        if (this.toast?.text !== 'Bag full') this.showToast('Bag full', 'backpack');
        return false;
      }
      this.bag = r.bag;
      this.showToast(`+1 ${def.name}`, def.icon);
      this.gotItem({ uid: '', def: item.supply, qty: 1 });
      return true;
    }
    if (item.kind === 'weapon') {
      const spec = WEAPONS[item.weapon];
      if (spec.melee) {
        const max = spec.melee.durability;
        if (this.owned.has(item.weapon)) {
          // A second one only helps if yours is worn: swap it for the fresh one
          if ((this.durability[item.weapon] ?? max) >= max) return false;
          this.durability[item.weapon] = max;
          this.showToast(`Swapped for a fresh ${spec.name}`, spec.icon);
          return true;
        }
        this.owned.add(item.weapon);
        this.durability[item.weapon] = max;
        if (this.weapon === 'fists') this.selectWeapon(item.weapon);
        this.showToast(`Picked up ${spec.name} [1]`, spec.icon);
        return true;
      }
      if (this.owned.has(item.weapon)) {
        // Duplicate gun: strip it for ammo
        if (spec.ammo) this.reserve[spec.ammo] += Math.ceil(AMMO_BOX[spec.ammo] / 2);
        this.showToast(`${spec.name}: +ammo`, spec.icon);
      } else {
        if (this.carriedWeight() + spec.weight > this.capacity()) {
          if (this.toast?.text !== 'Too heavy to carry') this.showToast('Too heavy to carry', spec.icon);
          return false;
        }
        this.owned.add(item.weapon);
        this.mags[item.weapon] = startingMag(item.weapon);
        if (isMelee(this.weapon)) this.selectWeapon(item.weapon);
        this.showToast(`Picked up ${spec.name} [${spec.slot}]`, spec.icon);
      }
    } else if (item.kind === 'ammo') {
      this.reserve[item.ammo] += AMMO_BOX[item.ammo];
      this.showToast(`+${AMMO_BOX[item.ammo]} ${AMMO_NAMES[item.ammo]}`, 'package');
    }
    return true;
  }

  /** Walk over loot to grab it (optimistic on clients; the host broadcasts what's gone). */
  private updatePickups() {
    if (this.deadTimer > 0 || this.sleeping || !this.ready) return;
    const r2 = PICKUP_RADIUS * PICKUP_RADIUS;
    for (const l of this.loot) {
      if (this.taken.has(l.id)) continue;
      const dx = l.x - this.feet.x;
      const dy = l.y - (this.feet.y - 4);
      if (dx * dx + dy * dy > r2) continue;
      if (!this.pickUp(l)) continue;
      this.taken.add(l.id);
      if (this.authority === 'host') this.markTaken(l.id);
      else this.net?.sendLoot(l.id);
    }
  }

  /** Host bookkeeping for a taken item (restocking items start their timer). */
  private markTaken(id: number) {
    this.changedLoot.add(id);
    if (this.loot[id]?.respawn) this.takenAt.set(id, this.elapsed);
  }

  /** Host: stores restock once their timer runs out (slower as loot gets scarce). */
  private restockLoot() {
    const mul = Math.max(0.25, this.difficulty.lootMul);
    for (const [id, at] of this.takenAt) {
      const respawn = this.loot[id]?.respawn;
      if (!respawn || this.elapsed - at < respawn / mul) continue;
      this.takenAt.delete(id);
      this.taken.delete(id);
      this.changedLoot.delete(id);
      this.restocked.add(id);
    }
  }

  /** Lose guns, ammo and supplies on death (the axe stays). */
  private dropEverything() {
    this.bag = { slots: BAG_SLOTS, maxWeight: carryCapacity(this.condition.strength), items: [] };
    this.equipped = {};
    this.openContainerId = null;
    this.owned = new Set(['fists', 'axe']);
    this.durability = { axe: maxDurability('axe') };
    this.mags = {};
    for (const k of Object.keys(this.reserve) as AmmoType[]) this.reserve[k] = 0;
    this.weapon = 'axe';
    this.reloadT = -1;
    this.triggerHeld = false;
  }

  /**
   * Fire / swing / reload for this frame. Returns a melee strike to resolve, or
   * null. Gunfire is resolved here on the host, or batched to the host on clients.
   */
  private updateWeapon(dt: number): ZombieStrike | null {
    const spec = WEAPONS[this.weapon];
    this.fireCooldown = Math.max(0, this.fireCooldown - dt);
    this.muzzleAge += dt;

    if (this.reloadT >= 0 && spec.ammo) {
      this.reloadT += dt;
      if (this.reloadT >= this.reloadSeconds(spec)) {
        this.train('reloading', SKILL_XP.reload);
        const mag = this.mags[this.weapon] ?? 0;
        const take = Math.min(spec.magSize - mag, this.reserve[spec.ammo]);
        this.mags[this.weapon] = mag + take;
        this.reserve[spec.ammo] -= take;
        this.reloadT = -1;
      }
    }

    if (this.swingRequested) this.pressAge = 0;
    this.swingRequested = false;
    this.pressAge += dt;
    const want = this.pressAge <= PRESS_BUFFER_SECONDS || (this.triggerHeld && spec.auto);
    if (!want || this.fireCooldown > 0 || this.deadTimer > 0 || this.reloadT >= 0 || !this.canAct) return null;
    this.pressAge = 99; // consumed

    const aim = this.aim ?? this.vision.getFacing();
    if (spec.melee) return this.swingMelee(spec, spec.melee, aim);
    if (!spec.ammo) return null;

    const mag = this.mags[this.weapon] ?? 0;
    if (mag <= 0) {
      // Dry fire: reload if we can, else a click
      this.sound('empty');
      if (!this.reload()) this.showToast(`No ${AMMO_NAMES[spec.ammo]}`);
      this.fireCooldown = 0.3;
      return null;
    }
    this.mags[this.weapon] = mag - 1;
    this.fireCooldown = spec.cooldown;
    this.muzzleAge = 0;
    this.sound(spec.ammo === '12ga' ? 'shot_shotgun' : spec.ammo === '9mm' ? 'shot_light' : 'shot_heavy', this.feet.x, this.feet.y);
    this.shake.add(spec.ammo === '12ga' ? 0.2 : 0.08);
    this.shotsThisFrame++;
    // Panic, pain and a broken arm all shake the aim
    const spreadMul = (1 + this.condition.panic / 100) * this.bodyMods.spreadMul * aimSpreadMul(this.skills.aiming.level);
    const angles = shotAngles(spec, aim, this.shotRng, spreadMul).map((a) => Math.round(a * 1000) / 1000);
    const x = Math.round(this.feet.x);
    const y = Math.round(this.feet.y - MUZZLE_LIFT);

    // Tracers from what this client can see (the host's result may differ slightly)
    const targets = this.sim.zombies.map((z) => ({ id: z.id, x: z.x, y: z.y }));
    let hits = 0;
    for (const a of angles) {
      const r = castBullet(this.vision.grid, targets, x, y, a, spec.range);
      this.tracers.push({ x1: x, y1: y, x2: r.endX, y2: r.endY, age: 0 });
      if (r.targetId !== null) hits++;
    }
    // Aiming: every shot teaches a little, a hit (as this client sees it) more
    this.train('aiming', SKILL_XP.shot + Math.min(hits, 2) * SKILL_XP.hit);

    if (this.authority === 'host') {
      this.remoteShots.push({ shot: { x, y, w: this.weapon, a: angles }, from: this.selfId() });
    } else if (this.authority === 'client') {
      if (this.shotBatch && this.shotBatch.w === this.weapon) {
        this.shotBatch.a.push(...angles);
      } else {
        this.flushShots();
        this.shotBatch = { x, y, w: this.weapon, a: angles };
        this.shotBatchAge = 0;
      }
    }
    if (this.mags[this.weapon] === 0 && this.reserve[spec.ammo] > 0) this.reload();
    return null;
  }

  /**
   * One melee swing: costs stamina (a winded swing is weak), a sprinting swing
   * with a heavy weapon is a power attack, crits double the damage, and every
   * swing that connects wears the weapon down. Returns the strike for the host.
   */
  private swingMelee(spec: WeaponSpec, m: MeleeSpec, aim: number): ZombieStrike {
    const heavy = m.heavy && this.sprinting;
    const cost = m.stamina * (heavy ? HEAVY_ATTACK.staminaMul : 1);
    const winded = this.vitals.stamina < cost;
    this.vitals = { ...this.vitals, stamina: Math.max(0, this.vitals.stamina - cost) };
    const crit = this.meleeRng() < m.crit;
    const mul = meleeMultiplier({
      strengthLevel: this.condition.strength.level,
      bodyMul: this.bodyMods.meleeMul,
      tired: this.condition.fatigue >= 75,
      winded,
      heavy,
      crit,
    });
    this.fireCooldown = spec.cooldown * (heavy ? HEAVY_ATTACK.cooldownMul : 1);
    this.swingAge = 0;
    this.swingFacing = aim;
    this.swingKind = heavy ? 'heavy' : 'swing';
    this.swingRange = spec.range;
    this.swingArc = m.arc;
    this.swingsThisFrame++;
    const x = this.feet.x;
    const y = this.feet.y - 6;
    this.sound('swing');
    // Wear: one point per swing that connects (judged on what this client sees)
    if (this.sim.zombies.some((z) => inArc(z, x, y, aim, spec.range, m.arc))) {
      // Feedback from what this client sees: blood, an estimated damage number, a thud
      const dmg = Math.round(spec.damage * mul);
      for (const z of this.sim.zombies) {
        if (!inArc(z, x, y, aim, spec.range, m.arc)) continue;
        this.feedback.burst('blood', z.x, z.y - 12, heavy || crit ? 9 : 5, '#991B1B');
        this.feedback.text(z.x, z.y - 30, crit ? `${dmg}!` : `${dmg}`, crit ? '#FB923C' : '#FDE047', crit ? 13 : 11);
      }
      this.sound('hit', x, y);
      this.shake.add(heavy ? 0.22 : 0.08);
      this.train('maintenance', SKILL_XP.meleeHit);
      // Maintenance: a skilled hand doesn't wear every swing
      if (Number.isFinite(m.durability) && this.meleeRng() < wearChance(this.skills.maintenance.level)) {
        const left = (this.durability[spec.id] ?? m.durability) - 1;
        this.durability[spec.id] = left;
        if (left <= 0) this.breakWeapon(spec);
      }
    }
    const strike: ZombieStrike = { x, y, f: aim, w: spec.id, m: Math.round(mul * this.rules.playerDamage * 100) / 100 };
    if (heavy) strike.h = 1;
    return strike;
  }

  /** A worn-out weapon falls apart; the next melee weapon (or your fists) comes up. */
  private breakWeapon(spec: WeaponSpec) {
    this.owned.delete(spec.id);
    delete this.durability[spec.id];
    this.showToast(`Your ${spec.name} broke!`, spec.icon);
    this.weapon = MELEE_ORDER.find((w) => this.owned.has(w)) ?? 'fists';
    this.owned.add('fists');
  }

  private flushShots() {
    if (this.shotBatch && this.shotBatch.a.length) this.net?.sendShot(this.shotBatch);
    this.shotBatch = null;
  }

  /** Host: resolve every queued shot (ours + clients'), crediting kills and shattering glass. */
  private resolveShots(noises: NoiseEvent[]) {
    const shots = this.remoteShots;
    this.remoteShots = [];
    const selfId = this.selfId();
    for (const { shot, from } of shots) {
      const spec = WEAPONS[shot.w as WeaponId];
      if (!spec || !spec.ammo) continue;
      let kills = 0;
      for (const a of shot.a.slice(0, 64)) {
        const targets = this.sim.zombies.map((z) => ({ id: z.id, x: z.x, y: z.y }));
        const r = castBullet(this.vision.grid, targets, shot.x, shot.y, a, spec.range);
        for (const t of r.windows) {
          const e = this.vision.grid.entrances.get(t);
          if (e) this.sim.setEntranceState(t, applyEntranceAction(e, { type: 'damage', amount: 999 }));
        }
        if (r.targetId !== null && this.director.damage(r.targetId, spec.damage * this.rules.playerDamage, 'ballistic', a)) kills++;
      }
      if (from === selfId) this.kills += kills;
      else if (kills > 0) this.outKills.set(from, (this.outKills.get(from) ?? 0) + kills);
      // Gunshots are LOUD: one noise per batch at the shooter
      noises.push({ x: shot.x, y: shot.y + MUZZLE_LIFT, radius: spec.noise });
    }
  }

  /** True if `box` (world px) overlaps a door/window that currently blocks movement. */
  isBlocked(box: Rect): boolean {
    const g = this.vision.grid;
    const ts = g.tileSize;
    const c0 = Math.floor(box.x / ts);
    const c1 = Math.floor((box.x + box.w - 0.01) / ts);
    const r0 = Math.floor(box.y / ts);
    const r1 = Math.floor((box.y + box.h - 0.01) / ts);
    for (let r = r0; r <= r1; r++) {
      for (let c = c0; c <= c1; c++) {
        if (!inBounds(g, c, r)) continue;
        const f = g.flags[tileIndex(g, c, r)];
        if ((f & TILE_ENTRANCE) && (f & TILE_SOLID)) return true;
        // Crates and workbenches
        if (f & TILE_SOLID && this.built.has(tileIndex(g, c, r))) return true;
      }
    }
    // Vehicles (not the one you're in)
    return this.vehicles.blocksBox(box, this.myVehicle ?? -1);
  }

  /** Calls `fn` for each door/window whose tile overlaps the world rect. */
  forEachEntranceIn(left: number, top: number, right: number, bottom: number, fn: (e: Entrance) => void) {
    const g = this.vision.grid;
    const ts = g.tileSize;
    for (const e of g.entrances.values()) {
      const x = e.col * ts;
      const y = e.row * ts;
      // Built structures are drawn by drawStructure, not the map's door renderer
      if (!e.built && x + ts >= left && x <= right && y + ts >= top && y <= bottom) fn(e);
    }
  }

  /**
   * Draws a marker on the roof edge for every exterior door/window of the
   * building whose footprint is `f` (world px). Call right after drawing that
   * roof, with the same transform and alpha.
   */
  renderRoofEntrances(ctx: CanvasRenderingContext2D, f: Rect) {
    const g = this.vision.grid;
    const ts = g.tileSize;
    const { col, row } = worldToTile(g, f.x + f.w / 2, f.y + f.h / 2);
    if (!inBounds(g, col, row)) return;
    const list = this.exteriorEntrances().get(g.buildingIndex[tileIndex(g, col, row)]);
    if (!list) return;
    const inside = (x: number, y: number) => x >= f.x && x <= f.x + f.w && y >= f.y && y <= f.y + f.h;
    const badges: { e: Entrance; at: { x: number; y: number } }[] = [];
    for (const { tile, side, badge } of list) {
      const e = g.entrances.get(tile);
      if (!e) continue;
      // Upper-floor shells share the building index; keep only this footprint's openings
      if (!inside((e.col + 0.5) * ts, (e.row + 0.5) * ts)) continue;
      drawRoofEntranceMarker(ctx, e, side, ts);
      if (badge) badges.push({ e, at: badge });
    }
    for (const b of badges) drawRoofDoorBadge(ctx, b.e, b.at);
  }

  private exteriorEntrances(): Map<number, RoofEntrance[]> {
    if (this.exteriorByBuilding) return this.exteriorByBuilding;
    const g = this.vision.grid;
    const map = new Map<number, RoofEntrance[]>();
    const doorGroups = new Map<string, { leaves: Entrance[]; first: RoofEntrance }>();
    for (const [tile, e] of g.entrances) {
      if (e.built) continue;
      const bi = g.buildingIndex[tile];
      if (bi === 0) continue;
      const side = exteriorSide(g, e);
      if (!side) continue;
      const entry: RoofEntrance = { tile, side };
      const list = map.get(bi);
      if (list) list.push(entry);
      else map.set(bi, [entry]);
      if (e.kind !== 'door') continue;
      const group = doorGroups.get(entranceGroupId(e));
      if (group) group.leaves.push(e);
      else doorGroups.set(entranceGroupId(e), { leaves: [e], first: entry });
    }
    // One badge per opening, centred across double-door leaves
    for (const { leaves, first } of doorGroups.values()) first.badge = badgePoint(leaves, first.side, g.tileSize);
    this.exteriorByBuilding = map;
    return map;
  }

  /** Nearest door/window within reach of the player's feet. */
  private findNearEntrance(): { tile: number; e: Entrance } | null {
    const g = this.vision.grid;
    const { col, row } = worldToTile(g, this.feet.x, this.feet.y);
    let best: { tile: number; e: Entrance } | null = null;
    let bestD = DOOR_REACH;
    for (let r = row - 2; r <= row + 2; r++) {
      for (let c = col - 2; c <= col + 2; c++) {
        if (!inBounds(g, c, r)) continue;
        const tile = tileIndex(g, c, r);
        const e = g.entrances.get(tile);
        if (!e || isBarrier(e)) continue;
        const d = Math.hypot((c + 0.5) * g.tileSize - this.feet.x, (r + 0.5) * g.tileSize - this.feet.y);
        if (d <= bestD) {
          best = { tile, e };
          bestD = d;
        }
      }
    }
    return best;
  }

  /**
   * Player door/window action on the entrance within reach. 'addPlank' starts a
   * BARRICADE_SECONDS hammering action (cancelled by walking away). Returns false
   * if nothing is in reach or the action doesn't apply.
   */
  doorAction(action: DoorActionType): boolean {
    if (this.deadTimer > 0 || this.sleeping) return false;
    const near = this.findNearEntrance();
    if (!near) return false;
    if (action === 'addPlank') {
      // Broken windows/doors can (and should) be boarded up; open ones must be closed first
      if (near.e.state === 'open' || near.e.planks >= MAX_PLANKS) return false;
      if (!this.owned.has('hammer') || BARRICADE_COST.some((c) => this.countItem(c.def) < c.qty)) {
        this.showToast('Boarding up needs a hammer, a plank and 2 nails', 'hammer');
        return false;
      }
      this.barricade = { tile: near.tile, t: 0 };
      return true;
    }
    if (action === 'removePlank' && !this.owned.has('hammer') && !this.owned.has('crowbar')) {
      this.showToast('Prying planks off needs a hammer or a crowbar', 'hammer');
      return false;
    }
    if (applyEntranceAction(near.e, { type: action }) === near.e) return false;
    this.performDoor(near.tile, action);
    // The plank comes back (the nails bend)
    if (action === 'removePlank') {
      const plank: InventoryItem = { uid: `p${this.uidSeq++}`, def: 'planks', qty: 1 };
      if (!this.receiveItem(plank, true)) this.dropToGround(plank);
    }
    return true;
  }

  /** Applies locally (optimistic on clients, authoritative on the host) and forwards to the host. */
  private performDoor(tile: number, action: DoorActionType) {
    this.applyDoor(tile, action);
    const g = this.vision.grid;
    const col = tile % g.cols;
    this.sound(action === 'addPlank' ? 'hammer' : action === 'removePlank' ? 'pry' : 'door', (col + 0.5) * g.tileSize, ((tile - col) / g.cols + 0.5) * g.tileSize);
    if (this.authority === 'client') this.net?.sendDoor({ t: tile, a: action });
  }

  /**
   * Tiles that act as one opening with `tile`: the leaves of a double door
   * (adjacent door entrances whose ids differ only by a `:N` leaf suffix).
   */
  private linkedEntranceTiles(tile: number): number[] {
    const g = this.vision.grid;
    const e = g.entrances.get(tile);
    if (!e || e.kind !== 'door') return [tile];
    const group = [tile];
    const c = tile % g.cols;
    for (const n of [tile - 1, tile + 1, tile - g.cols, tile + g.cols]) {
      if ((n === tile - 1 && c === 0) || (n === tile + 1 && c === g.cols - 1)) continue;
      const o = g.entrances.get(n);
      if (o && o.kind === 'door' && entranceGroupId(o) === entranceGroupId(e)) group.push(n);
    }
    return group;
  }

  private applyDoor(tile: number, action: DoorActionType) {
    const g = this.vision.grid;
    let changed = false;
    // Double doors open, close, lock and get boarded together
    for (const t of this.linkedEntranceTiles(tile)) {
      const e = g.entrances.get(t);
      if (!e) continue;
      const next = applyEntranceAction(e, { type: action });
      if (next === e) continue;
      this.setEntranceLocal(t, next);
      changed = true;
    }
    if (!changed) return;
    const c = tile % g.cols;
    const x = (c + 0.5) * g.tileSize;
    const y = ((tile - c) / g.cols + 0.5) * g.tileSize;
    this.pendingNoises.push({ x, y, radius: action === 'addPlank' || action === 'removePlank' ? HAMMER_NOISE_RADIUS : DOOR_NOISE_RADIUS });
  }

  /** Writes an entrance into the shared grid, keeping sim, vision and sync bookkeeping in step. */
  private setEntranceLocal(tile: number, next: Entrance) {
    if (this.authority === 'host') {
      this.sim.setEntranceState(tile, next);
    } else {
      setEntrance(this.vision.grid, next);
      this.sim.invalidateFlow();
    }
    this.vision.invalidate();
  }

  /** 'host' | 'client' | 'pending' — exposed for the HUD / debugging. */
  getAuthority(): Authority {
    return this.authority;
  }

  private selfId(): string {
    return this.net?.selfId ?? 'self';
  }

  private resolveAuthority(dt: number): Authority {
    if (!this.net) return 'host';
    if (this.net.isReady()) {
      this.pendingTime = 0;
      return this.net.isHost() ? 'host' : 'client';
    }
    // Realtime unavailable: keep playing solo rather than showing an empty world
    this.pendingTime += dt;
    if (this.authority !== 'pending') return this.authority;
    return this.pendingTime > PENDING_FALLBACK_SECONDS ? 'host' : 'pending';
  }

  /**
   * Damage to the local player. `bite`: a zombie attack lands on a body part
   * (scratch / laceration / bite, maybe the infection). `impact`: a charger
   * slam that can break a limb. `other`: blasts and the like.
   */
  private takeDamage(amount: number, effects: StatusEffect[] = [], source: 'bite' | 'impact' | 'other' = 'other') {
    if (this.deadTimer > 0 || !this.ready) return;
    // Zombie strength (rules)
    if (source !== 'other') amount *= this.rules.zombieStrength;
    // In a car with its windows in, zombies claw at the glass instead of you
    const car = source === 'bite' ? this.myVehicleState() : null;
    if (car && car.parts.windows > 0) {
      if (car.driver === this.selfId() || this.authority === 'host') {
        this.vehicles.set({ ...car, parts: { ...car.parts, windows: Math.max(0, car.parts.windows - amount * 0.8) } });
      }
      if (this.toast?.text !== 'Zombies are clawing at the windows!') this.showToast('Zombies are clawing at the windows!', 'warning');
      this.sound('hit', undefined, undefined, 0.5);
      this.shake.add(0.08);
      return;
    }
    if (source !== 'other') {
      const r = injure(this.body, this.injuryRng, source === 'bite' ? 'zombie' : 'impact', this.clothing().protection, this.mods.infectionMul * this.rules.infection);
      this.body = r.body;
      amount *= r.damageMul * (source === 'bite' ? this.mods.woundDamageMul : 1);
      if (r.blocked) {
        // The covering garment takes the hit and wears a little
        const slot = (Object.keys(COVERS) as EquipSlot[]).find((s) => COVERS[s].includes(r.part) && this.equipped[s]);
        const worn = slot ? this.equipped[slot] : undefined;
        if (slot && worn) {
          this.equipped[slot] = { ...worn, cond: Math.max(0, (worn.cond ?? 1) - 0.06) };
          this.showToast(`Your ${ITEM_DEFS[worn.def].name} turned the bite`, ITEM_DEFS[worn.def].icon);
        }
      }
      const part = PART_INFO[r.part].label.toLowerCase();
      if (r.wound) this.showToast(`${WOUND_NOUN[r.wound.kind]} on your ${part}!`, r.wound.kind === 'scratch' ? 'warning' : 'droplets');
      else if (r.fracture) this.showToast(`Your ${part} is broken!`, 'bone');
    }
    this.vitals = damageVitals(this.vitals, amount, effects);
    if (amount >= 1) {
      this.sound('hurt');
      this.shake.add(Math.min(0.6, 0.15 + amount / 40));
      this.feedback.text(this.feet.x, this.feet.y - 30, `-${Math.round(amount)}`, '#F87171', 13);
      this.feedback.burst('blood', this.feet.x, this.feet.y - 14, 4, '#B91C1C');
    }
    const calm = this.condition.panic;
    this.condition = onHurt(this.condition, amount);
    // Brave / Cowardly / Veteran scale the jolt of panic
    this.condition.panic = Math.min(100, calm + (this.condition.panic - calm) * this.mods.panicMul);
    this.hurtThisFrame = true;
    this.sinceHurt = 0;
    this.hurtFlash = 1;
  }

  /** Charger knockdown: the same effect on host and clients. */
  private static knockdown(): StatusEffect[] {
    return [{ kind: 'knockdown', remaining: CHARGER.knockdownSeconds, magnitude: 1, source: 'charger' }];
  }

  /**
   * Advances the mode. Returns 'respawn' on the frame the player should be
   * moved back to spawn after dying.
   */
  update(dt: number, input: ZombieFrameInput): 'respawn' | null {
    this.animTime += dt;
    this.feet = { x: input.feetX, y: input.feetY };
    // Match clock (real time): clients are corrected by every snapshot
    const realDt = input.realDt ?? dt;
    this.elapsed += realDt;
    // Sleeping fast-forwards the time of day once every survivor is asleep (the difficulty clock keeps real time)
    if (this.sleeping && this.authority === 'host' && this.everyoneAsleep(input.others)) {
      this.clockSkip += realDt * (SLEEP.timeScale - 1);
    }
    // World time speed (rules): the host runs the clock faster or slower; clients follow `sk`
    if (this.authority === 'host' && this.rules.timeSpeed !== 1) this.clockSkip += realDt * (this.rules.timeSpeed - 1);
    this.reportSleep();
    this.tod = timeOfDay(this.elapsed + this.clockSkip);
    this.updateWorld();
    this.applyDaylight(input.feetX, input.feetY);
    this.vision.update(dt, input.feetX, input.feetY, input.moveX, input.moveY, input.insideBuildingId);
    this.difficulty = applyRules(difficultyAt(this.elapsed), this.rules);

    const auth = this.resolveAuthority(dt);
    if (auth !== this.authority) {
      // Promoted: continue the horde from the last snapshot we received
      if (auth === 'host') {
        this.sim.adopt();
        this.director.adoptAll();
      }
      if (auth === 'client') this.lastHostSeq = -1;
      this.authority = auth;
      if (auth !== 'host') this.sleepers.clear();
      this.snapshotTimer = 0;
      this.remoteStrikes = [];
    }

    // Weapons: melee swing, gunfire, reload (visuals local; damage resolved by the host)
    this.swingAge += dt;
    this.shoveCooldown = Math.max(0, this.shoveCooldown - dt);
    const strike = this.updateWeapon(dt);
    const swung = strike !== null;
    this.updatePickups();
    for (const t of this.tracers) t.age += dt;
    this.tracers = this.tracers.filter((t) => t.age < TRACER_SECONDS);
    if (this.toast && (this.toast.age += dt) > TOAST_SECONDS) this.toast = null;
    if (this.shotBatch && (this.shotBatchAge += dt) >= SHOT_BATCH_SECONDS) this.flushShots();

    // Boarding up: hold position for BARRICADE_SECONDS; walking away or dying cancels
    if (this.barricade) {
      const near = this.findNearEntrance();
      if (this.deadTimer > 0 || !near || near.tile !== this.barricade.tile) {
        this.barricade = null;
      } else if ((this.barricade.t += dt) >= this.barricadeSeconds()) {
        // Materials are checked again at the end (they may have been dropped meanwhile)
        if (!this.owned.has('hammer') || BARRICADE_COST.some((c) => this.countItem(c.def) < c.qty)) {
          this.showToast('Boarding up needs a hammer, a plank and 2 nails', 'hammer');
        } else {
          this.performDoor(this.barricade.tile, 'addPlank');
          this.train('carpentry', SKILL_XP.plank);
          this.spend(BARRICADE_COST);
        }
        this.barricade = null;
      }
    }
    this.nearEntrance = this.findNearEntrance();
    this.nearContainerId = this.deadTimer > 0 || this.sleeping || !this.ready ? null : this.findNearContainer();
    if (this.openContainerId !== null) {
      const open = this.store.get(this.openContainerId);
      // Walking away (or the pile being emptied) closes the loot window
      if (!open || this.deadTimer > 0 || this.containerDistance(open, this.feet.x, this.feet.y - 4) > CONTAINER_REACH + 12) this.openContainerId = null;
    }
    this.expirePending();
    this.insideBuilding = input.insideBuildingId;
    this.nearBuiltTile = this.deadTimer > 0 || !this.ready ? null : this.findNearBuilt();
    this.updateCrafting(dt, input.moveX !== 0 || input.moveY !== 0);
    // A saved world loads only into a fresh host (never over a world someone is already running)
    if (this.pendingWorldSave) {
      if (this.hadHostState) this.pendingWorldSave = null;
      else if (this.authority === 'host') {
        this.importWorld(this.pendingWorldSave);
        this.pendingWorldSave = null;
      }
    }
    this.updateVehicle(dt, input);
    this.updateOtherVehicles(dt, input.others);
    this.updateActivity(dt, this.myVehicle === null && (input.moveX !== 0 || input.moveY !== 0));
    this.worldTarget = this.deadTimer > 0 || !this.ready || this.sleeping || this.myVehicle !== null ? null : this.findWorldTarget();
    if (this.vehiclePanel !== null && this.myVehicle === null && this.worldTarget?.type !== 'vehicle') this.vehiclePanel = null;

    if (this.authority === 'host') {
      this.updateHost(dt, input, swung ? strike : null);
    } else if (this.authority === 'client') {
      if (strike) this.net?.sendStrike(strike);
      this.updateClient(dt);
    }
    this.pendingNoises = this.authority === 'host' ? this.pendingNoises : [];
    if (this.authority !== 'host') this.director.tickHazards(dt);
    // New effects (host-made or from a snapshot) make their sound once
    for (const f of this.fx) if (f.age === 0) this.fxSound(f);
    for (const f of this.fx) f.age += dt;
    this.feedback.update(realDt);
    this.shake.update(realDt);
    this.lastOthers = input.others;
    this.updateGroans(dt);
    this.fx = this.fx.filter((f) => f.age < FX_SECONDS[f.k]);

    this.sinceHurt += dt;
    this.hurtFlash = Math.max(0, this.hurtFlash - dt * 2.5);
    this.updateVitals(dt, input);

    let result: 'respawn' | null = null;
    if (this.hp <= 0 && this.deadTimer <= 0) {
      this.deadTimer = DEATH_SECONDS;
      this.diedFlag = true;
      this.sound('death');
      this.shake.add(0.8);
      this.sleeping = null;
      this.crafting = null;
      this.placing = null;
      this.constructing = null;
      this.leaveCorpse();
      this.dropEverything();
      if (this.authority === 'host') this.sim.calm();
    } else if (this.deadTimer > 0) {
      this.deadTimer -= dt;
      if (this.deadTimer <= 0) {
        this.vitals = freshVitals();
        this.condition = freshCondition();
        this.skills = freshSkills();
        this.booksRead = {};
        this.knownRecipes = new Set();
        // A new life: survival spaces ask for a new survivor
        if (this.requireCharacterCreation) this.ready = false;
        this.body = freshBody();
        this.pain = 0;
        this.lastStage = 'none';
        this.bag = { ...this.bag, maxWeight: carryCapacity(this.condition.strength) };
        this.sinceHurt = 99;
        result = 'respawn';
      }
    }

    this.emitHud();
    return result;
  }

  /**
   * Hunger, thirst, stamina, gas, knockdown and the character condition
   * (fatigue, moodles, temperature, weight, fitness, strength) → this frame's
   * movement and vision modifiers. Also runs sleep: lying down freezes you,
   * fast-forwards your own needs, and threats / hunger / damage wake you.
   */
  private updateVitals(dt: number, input: ZombieFrameInput) {
    this.useCooldown = Math.max(0, this.useCooldown - dt);
    const swings = this.swingsThisFrame;
    const shots = this.shotsThisFrame;
    const hurt = this.hurtThisFrame;
    this.swingsThisFrame = 0;
    this.shotsThisFrame = 0;
    this.hurtThisFrame = false;
    if (this.deadTimer > 0 || !this.ready) {
      this.sprinting = false;
      return;
    }
    const tile = this.vision.grid.tileSize;
    const indoors = input.insideBuildingId !== null;

    // One pass over the horde: hunters near me (threat, panic, sleep) and the safe-spot test
    let hunters = 0;
    let nearest2 = Infinity;
    const threat2 = (CONDITION.threatTiles * tile) ** 2;
    for (const z of this.sim.zombies) {
      if (z.state !== 'chase' && z.state !== 'attack') continue;
      const d2 = (z.x - input.feetX) ** 2 + (z.y - input.feetY) ** 2;
      if (d2 < nearest2) nearest2 = d2;
      if (d2 <= threat2) hunters++;
    }
    this.hunters = hunters;
    this.nearestHunterTiles = Number.isFinite(nearest2) ? Math.sqrt(nearest2) / tile : Infinity;
    // Safe spot: indoors with nothing hunting within SAFE_CLEAR_TILES
    this.safe = indoors && this.nearestHunterTiles > SAFE_CLEAR_TILES;
    this.nearRest = this.restSpots.length ? nearestRestSpot(this.restSpots, input.feetX, input.feetY) : null;

    // Woken up? (manual waking comes through wakeUp())
    if (this.sleeping) {
      const why = wakeReason(this.condition, this.vitals, this.nearestHunterTiles, hurt);
      if (why) this.wakeUp(why);
    }
    const asleep = this.sleeping;
    const scale = asleep ? SLEEP.timeScale : 1;
    // In a vehicle the controls drive it: you sit still
    const moving = !asleep && this.myVehicle === null && (input.moveX !== 0 || input.moveY !== 0);
    const wantsSprint = moving && (this.sprintHeld || this.sprintLatched);

    let v = this.vitals;
    const gas = this.director.hazardEffectsAt(input.feetX, input.feetY);
    for (const e of gas) v = { ...v, effects: addEffect(v.effects, e) };

    // The bag may hold whatever capacity is left after weapons, ammo and what you wear
    const capacity = this.capacity();
    const carried = this.carriedWeight();
    const bagLimit = Math.max(0, capacity - (carried - bagWeight(this.bag)));
    if (this.bag.maxWeight !== bagLimit) this.bag = { ...this.bag, maxWeight: bagLimit };
    const load = carried / capacity;
    const mods = conditionMods(this.condition, load);
    // Wounds bleed, hurt and heal; the infection runs its course
    const bt = tickBody(this.body, { dt, timeScale: scale, healMul: this.mods.healMul * firstAidHealMul(this.skills.firstAid.level) });
    this.body = bt.body;
    this.pain = bt.pain;
    this.bodyMods = bt.mods;

    const r = tickVitals(v, {
      // Asleep: personal time runs `scale`× faster at a slow metabolism. Safe-zone
      // healing is replaced by the sleep heal below so a nap isn't a full heal.
      dt: dt * scale,
      intent: wantsSprint ? 'sprint' : moving ? 'walk' : 'idle',
      inSafeZone: asleep ? false : this.safe,
      resting: asleep ? false : !moving && this.sinceHurt > REGEN_DELAY && bt.mods.canRegen,
      decayMul: this.difficulty.decayMul * (asleep ? SLEEP.metabolism : 1),
      mods: {
        ...mods,
        staminaRegenMul: mods.staminaRegenMul * bt.mods.staminaRegenMul,
        hungerMul: mods.hungerMul * this.mods.hungerMul * this.rules.hunger,
        hydrationMul: mods.hydrationMul * this.mods.thirstMul * this.rules.thirst,
      },
    });
    v = r.vitals;
    if (asleep) {
      if (v.hunger >= 30 && v.hydration >= 30 && v.health > 0 && bt.mods.canRegen) {
        const gameHours = (dt * scale * 24) / GAME_DAY_SECONDS;
        v = { ...v, health: Math.min(PLAYER_MAX_HP, v.health + SLEEP.healPerGameHour * asleep.quality * gameHours) };
      }
    } else if (bt.mods.canRegen && this.sinceHurt > REGEN_DELAY && v.hunger >= WELL_FED && v.hydration >= WELL_FED && v.health > 0) {
      v = { ...v, health: Math.min(PLAYER_MAX_HP, v.health + WELL_FED_REGEN * dt) };
    }
    // Starvation / poison are "hurt" too: no passive regen while they tick
    if (r.damage > 0) this.sinceHurt = Math.min(this.sinceHurt, REGEN_DELAY / 2);
    const sprinting = wantsSprint && r.canSprint && mods.canSprint && bt.mods.canSprint;

    const c = tickCondition(this.condition, {
      dt,
      timeScale: scale,
      intent: sprinting ? 'sprint' : moving ? 'walk' : 'idle',
      sleep: asleep ? { quality: asleep.quality } : null,
      indoors,
      light: this.tod.light,
      // The weather outside, or the building's air (heated while there's power); a campfire warms you
      ambient: this.ambientAt(indoors, input.feetX, input.feetY),
      // A roof over your head: a building, or a car with its windows in
      precipitation: indoors || (this.myVehicleState()?.parts.windows ?? 0) > 0 ? 0 : this.world.fx.precipitation,
      hunters,
      nearestHunterTiles: this.nearestHunterTiles,
      safe: this.safe,
      vitals: v,
      load,
      swings,
      shots,
      insulation: this.clothing().insulation,
      learnMul: this.mods.learnMul,
      fatigueMul: this.mods.fatigueMul * this.rules.fatigue,
      panicMul: this.mods.panicMul,
      exposureMul: this.mods.exposureMul,
    });
    this.condition = c.condition;
    if (c.damage > 0) {
      v = { ...v, health: Math.max(0, v.health - c.damage) };
      this.sinceHurt = Math.min(this.sinceHurt, REGEN_DELAY / 2);
    }
    if (bt.damage > 0) {
      v = { ...v, health: Math.max(0, v.health - bt.damage) };
      this.sinceHurt = Math.min(this.sinceHurt, REGEN_DELAY / 2);
    }
    if (bt.stage !== this.lastStage) {
      if (STAGE_TEXT[bt.stage]) this.showToast(STAGE_TEXT[bt.stage], 'thermometer');
      this.lastStage = bt.stage;
    }
    for (const w of bt.healed) this.showToast(`Your ${PART_INFO[w.part].label.toLowerCase()} has healed`, 'heart');
    for (const stat of c.leveled) {
      const lvl = this.condition[stat].level;
      this.showToast(`${stat === 'fitness' ? 'Fitness' : 'Strength'} up — level ${lvl}`, stat === 'fitness' ? 'footprints' : 'dumbbell');
    }

    this.vitals = v;
    this.speedMul = r.speedMul * mods.speedMul * bt.mods.speedMul;
    this.canAct = r.canAct;
    this.sprinting = sprinting;
    // Eyes closed while asleep: only the immediate surroundings stay visible
    // Fog, rain and snow shorten how far you see outdoors
    const weatherVision = indoors ? 1 : this.world.fx.visionMul;
    this.vision.setViewScale(r.visionMul * mods.visionMul * this.mods.visionMul * weatherVision * (asleep ? 0.2 : 1));
  }

  /** Authoritative simulation: spawning, AI, everyone's strikes, snapshots. */
  private updateHost(dt: number, input: ZombieFrameInput, ownStrike: ZombieStrike | null) {
    const selfId = this.selfId();
    const self: SimTarget = { id: selfId, x: input.feetX, y: input.feetY };
    // Upstairs players are fair game too: zombies follow them up the stairs
    const targets: SimTarget[] = [...input.others];
    // Not a target while dead or still creating a character
    if (this.deadTimer <= 0 && this.ready) targets.push(self);
    this.lastTargets = [self, ...input.others];

    // Hordes follow the players: groups spawn just out of sight around each
    // player until their neighbourhood is busy; stragglers far from everyone recycle
    this.sim.aggroMul = this.difficulty.aggroMul;
    this.respawnTimer -= dt;
    if ((this.sim.zombies.length === 0 || this.respawnTimer <= 0) && this.rules.respawn > 0) {
      this.respawnTimer = RESPAWN_CHECK_SECONDS / this.rules.respawn;
      this.replenishHordes([self, ...input.others]);
    }
    // Waves: on top of topping up, an extra group arrives every spawnIntervalSeconds
    this.waveTimer += dt;
    if (this.waveTimer >= this.difficulty.spawnIntervalSeconds) {
      this.waveTimer = 0;
      this.spawnWave([self, ...input.others]);
    }
    this.restockLoot();
    this.handleRemoteInv(input.others);
    this.containerRestockTimer -= dt;
    if (this.containerRestockTimer <= 0) {
      this.containerRestockTimer = CONTAINER_RESTOCK_SECONDS;
      this.store.restock(this.elapsed, this.difficulty.lootMul, this.lootRng);
    }
    // Solo: nobody to tell about container changes
    if (!this.net) this.store.changed.clear();

    // Footsteps: ours from input, everyone else's from their movement broadcasts
    const noises = this.pendingNoises;
    this.pendingNoises = [];
    this.footstepTimer -= dt;
    if (this.footstepTimer <= 0) {
      this.footstepTimer = FOOTSTEP_INTERVAL;
      if (this.myVehicle === null && (input.moveX !== 0 || input.moveY !== 0)) {
        // Sprinting is loud
        noises.push({ x: input.feetX, y: input.feetY, radius: this.sprinting ? SPRINT_FOOTSTEP_RADIUS : FOOTSTEP_RADIUS });
      }
      for (const o of input.others) {
        if (o.moving && !this.vehicles.occupiedBy(o.id)) noises.push({ x: o.x, y: o.y, radius: FOOTSTEP_RADIUS });
      }
    }

    // Loot claimed by clients (first come, first served)
    const claims = this.remoteLoot;
    this.remoteLoot = [];
    for (const { id } of claims) {
      if (id < 0 || id >= this.loot.length || this.taken.has(id)) continue;
      this.taken.add(id);
      this.markTaken(id);
    }

    // Bodies of clients who died (only near where we last saw them)
    const deaths = this.remoteDeaths;
    this.remoteDeaths = [];
    for (const { death, from } of deaths) {
      const who = input.others.find((o) => o.id === from);
      if (!who || Math.hypot(who.x - death.x, who.y - death.y) > 64) continue;
      this.sim.addCorpse(death.x, death.y, death.t === 1 ? TURN_SECONDS : undefined);
      // Their things stay on the body
      const items = (Array.isArray(death.i) ? death.i.slice(0, 80) : [])
        .map((row, k) => decodeItem(row, `d${k}`))
        .filter((it): it is InventoryItem => !!it);
      if (items.length) this.store.createPile('corpse', death.x, death.y, items);
    }

    // Door actions from clients: only within reach of where we last saw them
    const doors = this.remoteDoors;
    this.remoteDoors = [];
    for (const { door, from } of doors) {
      const who = input.others.find((o) => o.id === from);
      const g = this.vision.grid;
      const c = door.t % g.cols;
      const x = (c + 0.5) * g.tileSize;
      const y = ((door.t - c) / g.cols + 0.5) * g.tileSize;
      if (!who || Math.hypot(who.x - x, who.y - y) > DOOR_REACH * 2) continue;
      this.applyDoor(door.t, door.a);
    }

    // Strikes: our own plus any received from clients since last frame
    const strikes = this.remoteStrikes;
    this.remoteStrikes = [];
    if (ownStrike) strikes.push({ strike: ownStrike, from: selfId });
    for (const { strike, from } of strikes) {
      if (strike.k === 'ram') {
        // A client's car hit zombies: only from the car they're driving, near where it is
        const car = this.vehicles.occupiedBy(from);
        if (car && car.driver === from && Math.hypot(car.x - strike.x, car.y - strike.y) <= 64) {
          const spec = VEHICLE_SPECS[car.kind];
          const speed = Math.max(0, Math.min(spec.maxSpeed, strike.m ?? 0));
          const kills = this.ramZombies(corners({ x: strike.x, y: strike.y, angle: strike.f }, spec, 3), strike.x, strike.y, speed);
          if (kills > 0) this.outKills.set(from, (this.outKills.get(from) ?? 0) + kills);
        }
        continue;
      }
      if (strike.k === 'lure') {
        // Only where the sender actually is
        const who = from === selfId ? self : input.others.find((o) => o.id === from);
        if (who && Math.hypot(who.x - strike.x, who.y - strike.y) <= 48) this.addLure(strike.x, strike.y);
        continue;
      }
      const kills = this.resolveStrike(strike, noises);
      if (from === selfId) this.kills += kills;
      else if (kills > 0) this.outKills.set(from, (this.outKills.get(from) ?? 0) + kills);
    }
    this.resolveShots(noises);

    for (const b of this.director.scaleBites(this.sim.tick(dt, targets, noises))) {
      if (b.targetId === selfId) this.takeDamage(b.damage, [], 'bite');
      else this.outBites.push([b.targetId, Math.round(b.damage)]);
    }
    if (this.sim.risen.length) {
      const near = (SAFE_CLEAR_TILES * 2.5 * this.vision.grid.tileSize) ** 2;
      if (this.sim.risen.some((z) => (z.x - input.feetX) ** 2 + (z.y - input.feetY) ** 2 <= near)) {
        this.showToast('A body is getting back up…', 'skull');
      }
      this.sim.risen.length = 0;
    }

    // Special infected: charges, bursts and roars (after the sim moved everyone)
    for (const e of this.director.tick(dt, targets)) {
      let fx: ZombieFx;
      if (e.type === 'impact') {
        fx = { k: 'i', x: Math.round(e.x), y: Math.round(e.y), id: e.targetId, d: e.damage };
        if (e.targetId === selfId) this.takeDamage(e.damage, ZombieMode.knockdown(), 'impact');
      } else if (e.type === 'burst') {
        fx = { k: 'b', x: Math.round(e.x), y: Math.round(e.y) };
        this.applyBurstToSelf(e.x, e.y);
        this.pendingNoises.push({ x: e.x, y: e.y, radius: 8 });
      } else if (e.type === 'roar') {
        fx = { k: 'r', x: Math.round(e.x), y: Math.round(e.y) };
      } else {
        const g = this.vision.grid;
        const c = e.tile % g.cols;
        fx = { k: 'c', x: Math.round((c + 0.5) * g.tileSize), y: Math.round(((e.tile - c) / g.cols + 0.5) * g.tileSize) };
        this.pendingNoises.push({ x: fx.x, y: fx.y, radius: 14 });
      }
      this.fx.push({ ...fx, age: 0 });
      this.outFx.push(fx);
    }

    // Entrance changes (players or zombies) → sync + vision
    if (this.sim.changedEntrances.size > 0) {
      for (const t of this.sim.changedEntrances) {
        this.changedEntrances.add(t);
        this.dirtyEntrances.add(t);
        this.onEntranceChanged(t);
      }
      this.sim.changedEntrances.clear();
      this.vision.invalidate();
    }

    this.handleRemoteBuild(input.others);
    // Noise makers buzz for half a minute after a short delay
    for (const l of this.lures) {
      if ((l.delay -= dt) > 0) continue;
      l.left -= dt;
      l.next -= dt;
      if (l.next <= 0) {
        l.next = LURE.every;
        this.pendingNoises.push({ x: l.x, y: l.y, radius: LURE.radius });
      }
    }
    if (this.lures.length) this.lures = this.lures.filter((l) => l.delay > 0 || l.left > 0);
    // Alarms wail for a minute, pulling in everything within earshot
    for (const a of this.alarms) {
      a.left -= dt;
      a.next -= dt;
      if (a.next <= 0) {
        a.next = ALARM.noiseEvery;
        this.pendingNoises.push({ x: a.x, y: a.y, radius: ALARM.noiseRadius });
      }
    }
    if (this.alarms.length) this.alarms = this.alarms.filter((a) => a.left > 0);

    // Nights are faster; a beam in the dark draws attention
    this.sim.speedScale = nightThreat(this.tod.light).speedMul * this.rules.zombieSpeed;
    this.flashlightNoiseTimer -= dt;
    if (this.flashlightOn && this.tod.light < LAMPS_ON_BELOW && this.flashlightNoiseTimer <= 0) {
      this.flashlightNoiseTimer = FLASHLIGHT_NOISE_SECONDS;
      this.pendingNoises.push({ x: input.feetX, y: input.feetY, radius: FLASHLIGHT_NOISE_RADIUS });
    }

    this.updateWorldHost(dt, [self, ...input.others]);

    if (this.net) this.maybeSendSnapshot(dt);
  }

  /** Bloater burst within reach of us: damage now, gas does the rest. */
  private applyBurstToSelf(x: number, y: number) {
    if (Math.hypot(this.feet.x - x, this.feet.y - y) <= BLOATER.burstRadiusTiles * this.vision.grid.tileSize) {
      this.takeDamage(BLOATER.burstDamage);
    }
  }

  /** Newly spawned zombies: difficulty speed, and a roll to become a special (capped per type). */
  private dressSpawns(from: number) {
    const counts: Record<SpecialZombieType, number> = { charger: 0, bloater: 0, dreadnought: 0 };
    for (let i = 0; i < from; i++) {
      const z = this.sim.zombies[i];
      if (isSpecial(z)) counts[z.kind as SpecialZombieType]++;
    }
    for (let i = from; i < this.sim.zombies.length; i++) {
      const z = this.sim.zombies[i];
      const kind = rollZombieKind(this.difficulty, this.hordeRng());
      if (kind !== 'walker' && counts[kind] < SPECIAL_CAPS[kind]) {
        counts[kind]++;
        this.director.promote(z, kind);
        z.leader = undefined; // specials roam on their own
        z.traits = undefined; // specials have their own stats
      }
      z.speedMul = (z.speedMul ?? 1) * this.difficulty.speedMul;
    }
  }

  /** One extra group near a random player, ignoring the local target (still under the global cap). */
  private spawnWave(players: SimTarget[]) {
    const ground = players.filter((p) => p.y < this.worldHeight);
    if (!ground.length) return;
    const cap = Math.min(GLOBAL_CAP, Math.round(this.targetPopulation * this.difficulty.populationMul) * Math.max(1, ground.length));
    const n = Math.min(cap - this.sim.zombies.length, GROUP_MIN + Math.floor(this.hordeRng() * (GROUP_MAX - GROUP_MIN + 1)));
    if (n <= 0) return;
    const p = ground[Math.floor(this.hordeRng() * ground.length)];
    const from = this.sim.zombies.length;
    this.sim.spawnGroup(p.x, p.y, SPAWN_RING_MIN_TILES, SPAWN_RING_MAX_TILES, n, players, SPAWN_RING_MIN_TILES - 1);
    this.dressSpawns(from);
  }

  /** Keeps ~LOCAL_TARGET zombies (× difficulty) around every player (ground floors only), in groups. */
  private replenishHordes(players: SimTarget[]) {
    const ground = players.filter((p) => p.y < this.worldHeight);
    this.sim.despawnFar(players, DESPAWN_TILES, GROUP_MAX);
    const population = Math.round(this.targetPopulation * this.difficulty.populationMul);
    const localTarget = Math.min(
      Math.round(LOCAL_TARGET * this.difficulty.populationMul * nightThreat(this.tod.light).hordeMul),
      Math.round(population * nightThreat(this.tod.light).hordeMul)
    );
    const cap = Math.min(GLOBAL_CAP, Math.max(population, localTarget * Math.max(1, ground.length)));
    const from = this.sim.zombies.length;
    for (const p of ground) {
      // Several groups per check when an area is empty (first spawn), one otherwise
      for (let g = 0; g < 4; g++) {
        const missing = localTarget - this.sim.countNear(p.x, p.y, LOCAL_RADIUS_TILES);
        const budget = cap - this.sim.zombies.length;
        const n = Math.min(missing, budget, GROUP_MIN + Math.floor(this.hordeRng() * (GROUP_MAX - GROUP_MIN + 1)));
        if (n <= 0) break;
        this.sim.spawnGroup(p.x, p.y, SPAWN_RING_MIN_TILES, SPAWN_RING_MAX_TILES, n, players, SPAWN_RING_MIN_TILES - 1);
        if (missing <= GROUP_MAX) break;
      }
    }
    // despawnFar may have shrunk the list before `from` was read; dress only the new tail
    this.dressSpawns(Math.min(from, this.sim.zombies.length));
  }

  /** Host: one swing, shove or stomp (ours or a client's). Returns kills. */
  private resolveStrike(s: ZombieStrike, noises: NoiseEvent[]): number {
    const claimed = typeof s.m === 'number' && Number.isFinite(s.m) ? s.m : 1;
    const mul = Math.min(MELEE_MUL_RANGE[1], Math.max(MELEE_MUL_RANGE[0], claimed));
    if (s.k === 'shove') {
      this.sim.shove(s.x, s.y, s.f, SHOVE.range, SHOVE.arc, SHOVE.push, Math.min(0.9, SHOVE.downChance * mul));
      noises.push({ x: s.x, y: s.y, radius: SHOVE.noise });
      return 0;
    }
    if (s.k === 'stomp') {
      const r = this.sim.stomp(s.x, s.y, s.f, STOMP.range + 4, STOMP.damage * mul, (z) => effectiveDamage(z, 1, 'blunt'));
      if (r.hit) noises.push({ x: s.x, y: s.y, radius: STOMP.noise });
      return r.kill ? 1 : 0;
    }
    const id = s.w && Object.prototype.hasOwnProperty.call(WEAPONS, s.w) ? (s.w as WeaponId) : 'axe';
    const spec = WEAPONS[id].melee ? WEAPONS[id] : WEAPONS.axe;
    const melee = spec.melee;
    if (!melee) return 0;
    const heavy = s.h === 1 && melee.heavy;
    const { kills } = this.sim.strike(s.x, s.y, s.f, spec.range, melee.arc, spec.damage * mul, (z) => effectiveDamage(z, 1, 'melee'), {
      knockback: melee.knockback * (heavy ? HEAVY_ATTACK.knockbackMul : 1),
      downChance: Math.min(0.9, melee.downChance + (heavy ? HEAVY_ATTACK.downBonus : 0)),
    });
    noises.push({ x: s.x, y: s.y, radius: spec.noise });
    this.smashWindows(s, spec.range, melee.arc);
    return kills;
  }

  /** Host: a door or window that just broke makes a racket, and may set off its building's alarm. */
  private onEntranceChanged(tile: number) {
    const e = this.vision.grid.entrances.get(tile);
    if (!e || e.state !== 'broken' || this.brokenSeen.has(tile)) return;
    this.brokenSeen.add(tile);
    const ts = this.vision.grid.tileSize;
    const x = (e.col + 0.5) * ts;
    const y = (e.row + 0.5) * ts;
    this.breakFeedback(e.kind, x, y);
    this.pendingNoises.push({ x, y, radius: BREAK_NOISE[e.kind] });
    const building = e.id.split(':')[0];
    // Alarms run on mains power (or a generator nearby)
    if (e.built || !isAlarmed(building) || this.alarmsTriggered.has(building) || !this.poweredAt(x, y)) return;
    this.alarmsTriggered.add(building);
    this.alarms.push({ x, y, left: ALARM.seconds, next: 0 });
    const fx: ZombieFx = { k: 'a', x: Math.round(x), y: Math.round(y) };
    this.fx.push({ ...fx, age: 0 });
    this.outFx.push(fx);
    this.alarmToast(x, y);
  }

  private alarmToast(x: number, y: number) {
    if (Math.hypot(x - this.feet.x, y - this.feet.y) <= ALARM.hearTiles * this.vision.grid.tileSize) {
      this.showToast('An alarm is going off!', 'bellRing');
    }
  }

  /** Your body stays behind: zombies feed on it, and if the infection killed you it gets back up. */
  private leaveCorpse() {
    const turned = infectionStage(this.body) === 'terminal';
    const x = Math.round(this.feet.x);
    const y = Math.round(this.feet.y);
    // Everything you carried stays on your body for whoever finds it
    const items = this.allCarried();
    if (this.authority === 'host') {
      this.sim.addCorpse(x, y, turned ? TURN_SECONDS : undefined);
      if (items.length) this.store.createPile('corpse', x, y, items);
    } else if (this.authority === 'client') {
      const death: ZombieDeath = turned ? { x, y, t: 1 } : { x, y };
      if (items.length) death.i = items.map(encodeItem);
      this.net?.sendDeath?.(death);
    }
    if (turned) this.showToast('The infection took you…', 'biohazard');
  }

  private bodySleepInfo(): { bleeding: boolean; pain: number } {
    return { bleeding: this.body.wounds.some((w) => w.bleeding && !w.bandaged), pain: this.pain };
  }

  /** Melee shatters closed glass windows in the swing arc. Returns true if any broke. */
  private smashWindows(strike: ZombieStrike, range: number, arc: number): boolean {
    const g = this.vision.grid;
    const { col, row } = worldToTile(g, strike.x, strike.y);
    let smashed = false;
    for (let r = row - 2; r <= row + 2; r++) {
      for (let c = col - 2; c <= col + 2; c++) {
        if (!inBounds(g, c, r)) continue;
        const tile = tileIndex(g, c, r);
        const e = g.entrances.get(tile);
        if (!e || e.kind !== 'window' || (e.state !== 'closed' && e.state !== 'locked')) continue;
        const x = (c + 0.5) * g.tileSize;
        const y = (r + 0.5) * g.tileSize;
        const d = Math.hypot(x - strike.x, y - strike.y);
        if (d > range) continue;
        let diff = Math.atan2(y - strike.y, x - strike.x) - strike.f;
        diff = Math.atan2(Math.sin(diff), Math.cos(diff));
        if (Math.abs(diff) > arc / 2) continue;
        const next = applyEntranceAction(e, { type: 'damage', amount: WINDOW_SMASH_DAMAGE });
        if (next === e) continue;
        this.sim.setEntranceState(tile, next);
        smashed = smashed || next.state === 'broken';
      }
    }
    return smashed;
  }

  private entranceRow(tile: number): EntranceRow | null {
    const e = this.vision.grid.entrances.get(tile);
    if (!e) return null;
    return [tile, ENTRANCE_STATES.indexOf(e.state), e.planks, Math.ceil(e.hp)];
  }

  private maybeSendSnapshot(dt: number) {
    this.snapshotTimer -= dt;
    this.sinceSnapshot += dt;
    if (this.snapshotTimer > 0) return;
    this.snapshotTimer = SNAPSHOT_INTERVAL;

    // Interest management: only zombies near some player travel over the wire
    const r2 = INTEREST_RADIUS * INTEREST_RADIUS;
    const near = this.sim.zombies.filter((z) =>
      this.lastTargets.some((t) => (t.x - z.x) * (t.x - z.x) + (t.y - z.y) * (t.y - z.y) <= r2)
    );
    const rows: ZombieRow[] = near.map((z) => this.zombieRow(z));
    const key = JSON.stringify(rows);
    this.entranceResendTimer -= SNAPSHOT_INTERVAL;
    // Someone joined: bring them up to date with doors and taken loot right away
    const members = this.net?.memberCount() ?? 0;
    if (members > this.lastMemberCount) this.entranceResendTimer = 0;
    this.lastMemberCount = members;
    const resendAll =
      this.entranceResendTimer <= 0 &&
      (this.dirtyEntrances.size > 0 ||
        this.taken.size > 0 ||
        this.takenAt.size > 0 ||
        this.sim.corpses.length > 0 ||
        this.store.dirty.size > 0 ||
        this.built.size > 0 ||
        this.claims.size > 0);
    let builtKey = '';
    for (const [tile, b] of this.built) builtKey += `${this.builtRow(tile, b).join(',')};`;
    let claimsKey = '';
    for (const [id, c] of this.claims) claimsKey += `${id}:${c.owner};`;
    const builtChanged = builtKey !== this.builtKey || claimsKey !== this.claimsKey;
    let corpseKey = '';
    for (const c of this.sim.corpses) corpseKey += `${c.id},`;
    const corpsesChanged = corpseKey !== this.corpseKey;
    const hasEvents =
      this.outBites.length > 0 ||
      this.outKills.size > 0 ||
      this.changedEntrances.size > 0 ||
      this.changedLoot.size > 0 ||
      this.restocked.size > 0 ||
      this.outFx.length > 0 ||
      corpsesChanged ||
      this.store.changed.size > 0 ||
      this.outAcks.length > 0 ||
      builtChanged ||
      this.vehicles.changed.size > 0 ||
      JSON.stringify(this.rules) !== this.sentRules ||
      resendAll;
    if (key === this.lastSnapKey && !hasEvents && this.sinceSnapshot < SNAPSHOT_HEARTBEAT) return;

    const snap: ZombieSnapshot = { s: ++this.seq, z: rows, el: Math.round(this.elapsed) };
    if (this.clockSkip !== 0) snap.sk = Math.round(this.clockSkip);
    const rulesKey = JSON.stringify(this.rules);
    if (rulesKey !== this.sentRules || resendAll) {
      snap.cfg = this.rules;
      this.sentRules = rulesKey;
    }
    const sleep = this.sleepSummary();
    const sleepKey = sleep ? `${sleep.asleep}/${sleep.total}` : '';
    if (sleepKey !== this.sentSleepKey || (resendAll && sleep)) {
      snap.sl = sleep ? [sleep.asleep, sleep.total] : [0, 0];
      this.sentSleepKey = sleepKey;
    }
    const entranceTiles = resendAll ? this.dirtyEntrances : this.changedEntrances;
    if (entranceTiles.size > 0) {
      snap.d = [...entranceTiles].map((t) => this.entranceRow(t)).filter((r): r is EntranceRow => !!r);
    }
    if (resendAll) {
      // Full list replaces the client's (so restocked items reappear even if a delta was missed)
      snap.t = [...this.taken];
      snap.tf = 1;
    } else if (this.changedLoot.size > 0) {
      snap.t = [...this.changedLoot];
    }
    if (this.restocked.size > 0) snap.r = [...this.restocked];
    if (corpsesChanged || (resendAll && this.sim.corpses.length)) {
      snap.c = this.sim.corpses.map((c) => [c.id, Math.round(c.x), Math.round(c.y)]);
    }
    this.corpseKey = corpseKey;
    const vehicleRows = this.vehicles.rows(resendAll);
    if (vehicleRows.length) snap.vh = vehicleRows;
    if (builtChanged || resendAll) {
      snap.bs = [...this.built].map(([tile, b]) => this.builtRow(tile, b));
      snap.sh = [...this.claims].map(([id, c]) => [id, c.owner, c.name]);
    }
    this.builtKey = builtKey;
    this.claimsKey = claimsKey;
    const containerRows = this.containerRows(resendAll);
    if (containerRows.length) snap.cs = containerRows;
    if (this.outAcks.length) {
      snap.ia = this.outAcks;
      this.outAcks = [];
    }
    if (this.outFx.length) snap.x = this.outFx.slice(0, 16);
    if (resendAll) this.entranceResendTimer = ENTRANCE_RESEND_SECONDS;
    this.changedEntrances = new Set();
    this.changedLoot = new Set();
    this.restocked = new Set();
    this.outFx = [];
    if (this.outBites.length) snap.b = this.outBites;
    if (this.outKills.size) snap.k = [...this.outKills.entries()];
    this.net?.sendSnapshot(snap);
    this.countBytes(snap);
    this.lastSnapKey = key;
    this.sinceSnapshot = 0;
    this.outBites = [];
    this.outKills = new Map();
  }

  /** Changed containers (all of them, in batches, on a full resend). */
  private containerRows(resendAll: boolean): ContainerRow[] {
    const ids = new Set(this.store.changed);
    if (resendAll && this.store.dirty.size) {
      const dirty = [...this.store.dirty];
      for (let k = 0; k < Math.min(CONTAINER_RESEND_BATCH, dirty.length); k++) {
        ids.add(dirty[(this.containerResendCursor + k) % dirty.length]);
      }
      this.containerResendCursor = (this.containerResendCursor + CONTAINER_RESEND_BATCH) % dirty.length;
    }
    const rows: ContainerRow[] = [];
    for (const id of ids) {
      const row = this.store.encode(id);
      if (row) rows.push(row);
    }
    this.store.changed.clear();
    return rows;
  }

  /** Wire flag for an active ability (0 = none). */
  private static abilityFlag(z: Zombie): AbilityFlag {
    if (!isSpecial(z)) return 'none';
    const a = z.ability;
    if (a.kind === 'charge') return a.phase === 'ready' ? 'none' : a.phase;
    if (a.kind === 'bloat') return a.fuse !== null && !a.burst ? 'fuse' : 'none';
    if (a.kind === 'roar') return a.roaring > 0 ? 'roar' : 'none';
    return 'none';
  }

  private zombieRow(z: Zombie): ZombieRow {
    const kind = ZOMBIE_KINDS.indexOf(zombieKind(z));
    const flag = ABILITY_FLAGS.indexOf(ZombieMode.abilityFlag(z));
    let gx = z.goalX;
    let gy = z.goalY;
    // A charge ignores the flow field: send where the dash is heading so clients can extrapolate it
    if (isSpecial(z) && z.ability.kind === 'charge' && z.ability.phase === 'charging') {
      const reach = CHARGER.speed * Math.max(0, z.ability.timer);
      gx = z.x + z.ability.dirX * reach;
      gy = z.y + z.ability.dirY * reach;
    }
    const row: ZombieRow = [z.id, Math.round(z.x), Math.round(z.y), Math.round(gx), Math.round(gy), ZOMBIE_STATES.indexOf(z.state), Math.ceil(z.hp), z.variant];
    const traits = z.traits ? packTraits(z.traits) : PACKED_NORMAL;
    if (traits !== PACKED_NORMAL) row.push(kind, flag, traits);
    else if (kind > 0 || flag > 0) row.push(kind, flag);
    return row;
  }

  /** Mirrors a wire ability flag into a replica's ability state (drawing reads the same fields as the host). */
  private static applyFlag(z: Zombie, flag: AbilityFlag) {
    if (!isSpecial(z)) return;
    const a = z.ability;
    z.locked = flag !== 'none';
    if (a.kind === 'charge') a.phase = flag === 'windup' || flag === 'charging' || flag === 'recover' ? flag : 'ready';
    else if (a.kind === 'bloat') a.fuse = flag === 'fuse' ? 0.3 : null;
    else if (a.kind === 'roar') a.roaring = flag === 'roar' ? 1 : 0;
  }

  /** Effects from the host: VFX for everyone; impacts / bursts / gas land on whoever they hit. */
  private applyFx(list: ZombieFx[]) {
    const selfId = this.net?.selfId;
    for (const f of list) {
      this.fx.push({ ...f, age: 0 });
      if (f.k === 'i' && f.id === selfId) this.takeDamage(f.d ?? CHARGER.impactDamage, ZombieMode.knockdown(), 'impact');
      if (f.k === 'a') this.alarmToast(f.x, f.y);
      if (f.k === 'g') this.gunshotToast(f.x, f.y);
      if (f.k === 'b') {
        this.director.addHazard(f.x, f.y);
        this.applyBurstToSelf(f.x, f.y);
      }
    }
  }

  /** Replica: replace the horde with the host's view and settle bites/kills addressed to us. */
  private applySnapshot(snap: ZombieSnapshot, from: string) {
    if (!this.net || this.authority === 'host' || from !== this.net.getHostId()) return;
    if (from !== this.lastHostId) {
      this.lastHostId = from;
      this.lastHostSeq = -1;
    }
    if (snap.s <= this.lastHostSeq) return;
    this.lastHostSeq = snap.s;
    this.hadHostState = true;
    if (snap.cfg) this.rules = sanitizeRules(snap.cfg);
    if (Array.isArray(snap.sl)) this.sleepCount = snap.sl[1] > 1 ? { asleep: snap.sl[0], total: snap.sl[1] } : null;
    this.applySnapshotData(snap);
  }

  /** A snapshot's contents onto this client's world (also how a saved world is loaded). */
  private applySnapshotData(snap: ZombieSnapshot) {

    const existing = new Map(this.sim.zombies.map((z) => [z.id, z]));
    const next: Zombie[] = [];
    const seen = new Set<number>();
    for (const [id, x, y, goalX, goalY, stateIdx, hp, variant, kindIdx = 0, flagIdx = 0, packed = PACKED_NORMAL] of snap.z) {
      const state = ZOMBIE_STATES[stateIdx] ?? 'idle';
      const kind = ZOMBIE_KINDS[kindIdx] ?? 'walker';
      const flag = ABILITY_FLAGS[flagIdx] ?? 'none';
      let z = existing.get(id);
      if (!z) {
        z = {
          id, x, y, hp, state, goalX, goalY,
          facing: Math.PI / 2, timer: 0, attackCooldown: 0, senseCooldown: 0,
          targetId: null, sinceHit: 99, moving: false, variant,
        };
      } else if (hp < z.hp) {
        z.sinceHit = 0;
      }
      if (kind !== 'walker' && zombieKind(z) !== kind) SPECIAL_BEHAVIORS[kind].init(z);
      if (kind === 'walker' && packed !== PACKED_NORMAL && !z.traits) {
        // Sprinters must dead-reckon at their own pace
        z.traits = unpackTraits(packed);
        z.speedMul = traitMul(z.traits, 'speed');
        z.maxHp = Math.round(ZOMBIE.maxHp * traitMul(z.traits, 'toughness'));
      }
      ZombieMode.applyFlag(z, flag);
      z.hp = hp;
      z.state = state;
      z.goalX = goalX;
      z.goalY = goalY;
      z.variant = variant;
      const speed =
        flag === 'charging'
          ? CHARGER.speed
          : z.locked
            ? 0
            : (NET_SPEED[stateIdx] ?? 0) * (z.speedMul ?? 1) * nightThreat(this.tod.light).speedMul;
      this.tracks.set(id, { x, y, goalX, goalY, speed });
      seen.add(id);
      next.push(z);
    }
    for (const id of this.tracks.keys()) if (!seen.has(id)) this.tracks.delete(id);
    this.sim.zombies = next;

    // Structures before entrance rows, so rows for new walls find their entrance
    if (snap.bs) this.applyBuiltRows(snap.bs);
    for (const row of snap.vh ?? []) {
      const v = this.vehicles.applyRow(row, this.net?.selfId ?? null);
      if (v) {
        const trunk = this.vehicles.trunkAt(v);
        this.store.moveSpawn(VehicleSystem.trunkId(v), trunk.x, trunk.y);
      }
    }
    if (snap.sh) {
      this.claims = new Map();
      for (const [id, owner, name] of snap.sh) if (typeof id === 'string' && typeof owner === 'string') this.claims.set(id, { owner, name: String(name).slice(0, 24) });
    }
    if (snap.d?.length) {
      const g = this.vision.grid;
      for (const [tile, stateIdx, planks, hp] of snap.d) {
        const e = g.entrances.get(tile);
        const state = ENTRANCE_STATES[stateIdx];
        if (!e || !state) continue;
        if (e.state === state && e.planks === planks && e.hp === hp) continue;
        if (state === 'broken' && e.state !== 'broken') this.breakFeedback(e.kind, (e.col + 0.5) * g.tileSize, (e.row + 0.5) * g.tileSize);
        setEntrance(g, { ...e, state, planks, hp });
      }
      this.sim.invalidateFlow();
      this.vision.invalidate();
    }

    if (snap.tf) this.taken = new Set(snap.t ?? []);
    else for (const id of snap.t ?? []) this.taken.add(id);
    for (const id of snap.r ?? []) this.taken.delete(id);
    if (typeof snap.el === 'number') this.elapsed = snap.el;
    if (typeof snap.sk === 'number') this.clockSkip = snap.sk;
    if (snap.c) this.sim.corpses = snap.c.map(([id, x, y]) => ({ id, x, y, ttl: ZOMBIE.corpseSeconds }));
    for (const row of snap.cs ?? []) this.store.apply(row);
    if (snap.ia?.length) this.applyAcks(snap.ia);
    if (snap.x?.length) this.applyFx(snap.x);

    const selfId = this.net?.selfId;
    for (const [target, dmg] of snap.b ?? []) if (target === selfId) this.takeDamage(dmg, [], 'bite');
    for (const [striker, n] of snap.k ?? []) if (striker === selfId) this.kills += n;
  }

  /** Smooth replicas: extrapolate toward each zombie's goal, then ease the drawn position onto it. */
  private updateClient(dt: number) {
    const ease = Math.min(1, dt * 10);
    for (const z of this.sim.zombies) {
      z.sinceHit += dt;
      const t = this.tracks.get(z.id);
      if (!t) continue;
      const gdx = t.goalX - t.x;
      const gdy = t.goalY - t.y;
      const gd = Math.hypot(gdx, gdy);
      if (gd > 0.5 && t.speed > 0) {
        const step = Math.min(gd, t.speed * dt);
        t.x += (gdx / gd) * step;
        t.y += (gdy / gd) * step;
      }
      const dx = t.x - z.x;
      const dy = t.y - z.y;
      const d = Math.hypot(dx, dy);
      if (d > 48) {
        z.x = t.x;
        z.y = t.y;
      } else {
        z.x += dx * ease;
        z.y += dy * ease;
      }
      z.moving = d > 0.5 || (gd > 0.5 && t.speed > 0);
      if (gd > 1) z.facing = Math.atan2(gdy, gdx);
    }
  }

  private emitHud() {
    const hp = Math.ceil(this.hp);
    const alive = this.sim.zombies.length;
    const dead = this.deadTimer > 0;
    const hunger = Math.ceil(this.vitals.hunger);
    const hydration = Math.ceil(this.vitals.hydration);
    const stamina = Math.ceil(this.vitals.stamina);
    const threat = Math.floor(this.difficulty.level);
    const clock = clockLabel(this.tod);

    let chasing = 0;
    const specialSet = new Set<SpecialZombieType>();
    for (const z of this.sim.zombies) {
      const active = z.state === 'chase' || z.state === 'attack';
      if (active) chasing++;
      if ((active || z.locked) && isSpecial(z)) {
        specialSet.add(zombieKind(z) as SpecialZombieType);
      }
    }

    const spec = WEAPONS[this.weapon];
    const mag = spec.ammo ? (this.mags[this.weapon] ?? 0) : null;
    const reserve = spec.ammo ? this.reserve[spec.ammo] : 0;
    const reloading = this.reloadT >= 0 && spec.reloadSeconds > 0 ? Math.min(1, this.reloadT / this.reloadSeconds(spec)) : 0;

    let ownedKey = '';
    for (const w of WEAPON_ORDER) {
      if (this.owned.has(w)) ownedKey += (ownedKey ? ',' : '') + w;
    }

    const entProgress = this.barricade ? Math.min(1, this.barricade.t / this.barricadeSeconds()) : 0;
    const entKey = this.nearEntrance
      ? `${this.nearEntrance.e.kind}${this.nearEntrance.e.state}${this.nearEntrance.e.planks}${Math.round(entProgress * 10)}`
      : '-';

    const effects: StatusEffectKind[] = [];
    for (const e of this.vitals.effects) {
      if (e.kind === 'regen' && this.vitals.health >= PLAYER_MAX_HP) continue;
      if (!effects.includes(e.kind)) effects.push(e.kind);
    }

    let supplyKey = '';
    for (const it of this.bag.items) {
      supplyKey += `${it.def}:${it.qty};`;
    }

    const specials = [...specialSet];
    const durability =
      spec.melee && Number.isFinite(spec.melee.durability)
        ? Math.max(0, (this.durability[spec.id] ?? spec.melee.durability) / spec.melee.durability)
        : null;
    const wk = `${spec.id}${mag}/${reserve}/${Math.round(reloading * 10)}|${ownedKey}|${this.toast?.text ?? ''}|${durability === null ? '' : Math.round(durability * 50)}`;
    const vk = `${hunger}|${hydration}|${Math.round(stamina / 2)}|${this.vitals.exhausted}|${this.sprinting}|${this.sprintLatched}|${effects.join(',')}|${supplyKey}|${threat}|${specials.join(',')}|${this.safe}`;
    const character = this.characterHud();
    const load = character.carryKg / Math.max(1, character.carryMaxKg);
    const moodles = [...bodyMoodles(this.body, this.pain), ...moodlesOf(this.condition, load)];
    const injuries = this.bodyHud();
    let moodleKey = JSON.stringify(injuries);
    for (const m of moodles) moodleKey += `${m.id}${m.level}`;
    const ck = `${moodleKey}|${this.sleeping?.spot ?? ''}|${this.nearRest?.kind ?? ''}|${Object.values(character).map((x) => (typeof x === 'object' && x ? `${x.level}:${x.progress}` : x)).join(',')}`;
    const near = this.nearContainerId === null ? null : this.store.get(this.nearContainerId);
    const container = near ? { label: CONTAINER_LABELS[near.kind], kind: near.kind, open: this.openContainerId === near.id } : null;
    const loot = this.lootHud();
    const inventory = this.inventoryOpen || loot ? this.inventoryHud() : null;
    const ik = `${container ? `${container.label}${container.open}` : '-'}|${loot || inventory ? JSON.stringify([loot, inventory]) : ''}`;
    const skills = this.skillHud();
    const sk = `${this.ready}|${this.loadingSurvivor}|${this.survivor.name}|${this.survivor.occupation}|${skills.map((s) => `${s.level}:${s.progress}:${s.book}`).join(',')}`;
    const recipes = this.craftOpen ? this.recipeHud() : null;
    const build = this.buildHud();
    const world = this.worldHud();
    const worldAction = this.worldActionHud();
    const vehicle = this.vehicleHud();
    const toasts = this.notices.recent(this.elapsed, TOAST_SECONDS).map((n) => ({ id: n.id, text: n.text, icon: n.icon as IconName | null }));
    const log = this.menuOpen
      ? this.notices.history
          .slice()
          .reverse()
          .map((n) => ({ id: n.id, text: n.text, icon: n.icon as IconName | null, ago: agoLabel(this.elapsed - n.at) }))
      : null;
    const map = this.menuOpen ? this.mapHud() : null;
    const bk = JSON.stringify([recipes, build, world, worldAction, vehicle, toasts, log, map, this.sleepSummary(), this.rules]);
    const key = `${hp}|${alive}|${this.kills}|${chasing}|${dead}|${entKey}|${wk}|${vk}|${clock}|${this.flashlightOn}|${ck}|${ik}|${sk}|${bk}`;
    if (key === this.hudKey) return;
    this.hudKey = key;

    const hud: ZombieHud = {
      hp,
      maxHp: PLAYER_MAX_HP,
      alive,
      kills: this.kills,
      chasing,
      dead,
      entrance: this.nearEntrance
        ? {
          kind: this.nearEntrance.e.kind,
          state: this.nearEntrance.e.state,
          planks: this.nearEntrance.e.planks,
          progress: entProgress,
        }
        : null,
      weapon: {
        id: spec.id,
        name: spec.name,
        icon: spec.icon,
        mag,
        magSize: spec.magSize,
        reserve,
        reloading,
        durability,
      },
      owned: WEAPON_ORDER.filter((w) => this.owned.has(w)),
      toast: this.toast?.text ?? null,
      toastIcon: this.toast?.icon ?? null,
      hunger,
      hydration,
      stamina,
      exhausted: this.vitals.exhausted,
      sprinting: this.sprinting,
      sprintLatched: this.sprintLatched,
      effects,
      supplies: this.supplyHud(),
      bagFill: Math.min(1, this.carriedWeight() / this.capacity()),
      threat,
      specials,
      safe: this.safe,
      clock,
      phase: this.tod.phase,
      flashlight: this.flashlightOn,
      moodles,
      asleep: this.sleeping ? { ...this.sleeping } : null,
      restSpot: this.nearRest?.kind ?? null,
      character,
      injuries,
      container,
      loot,
      inventory,
      creating: !this.ready && !this.loadingSurvivor,
      loadingSurvivor: !this.ready && this.loadingSurvivor,
      recipes,
      build,
      survivor: this.survivorHud(),
      skills,
      world,
      worldAction,
      vehicle,
      toasts,
      log,
      map,
      sleepers: this.sleepSummary(),
      rules: this.rules,
    };
    this.onHudChanged?.(hud);
  }

  /** Wounds, fractures and what you could treat them with (pain rounded to 5). */
  private bodyHud(): BodyHud {
    const b = this.body;
    const rank: Record<PartStatus, number> = { bandaged: 1, splinted: 2, scratched: 3, wounded: 4, broken: 5, bleeding: 6 };
    const parts: BodyHud['parts'] = {};
    const mark = (p: BodyPart, s: PartStatus) => {
      const cur = parts[p];
      if (!cur || rank[s] > rank[cur]) parts[p] = s;
    };
    for (const w of b.wounds) {
      mark(w.part, w.bleeding && !w.bandaged ? 'bleeding' : w.bandaged ? 'bandaged' : w.kind === 'scratch' ? 'scratched' : 'wounded');
    }
    for (const f of b.fractures) mark(f.part, f.splinted ? 'splinted' : 'broken');
    const have = (id: ConsumableId) => this.bag.items.some((i) => i.def === id);
    const stage = infectionStage(b);
    return {
      pain: Math.round(this.pain / 5) * 5,
      parts,
      wounds: b.wounds.map((w) => ({ id: w.id, part: PART_INFO[w.part].label, label: woundLabel(w), bleeding: w.bleeding && !w.bandaged })),
      fractures: b.fractures.map((f) => ({ part: PART_INFO[f.part].label, splinted: f.splinted })),
      painkillers: b.painkiller > 0,
      canBandage: have('bandage') && bandageTarget(b) !== null,
      canDisinfect: have('disinfectant') && canTreat(b, 'disinfect'),
      canSplint: have('splint') && canTreat(b, 'splint'),
      canPainkill: have('painkillers'),
      sick: stage === 'none' || stage === 'incubating' ? 'none' : stage,
    };
  }

  /** Character sheet, rounded so the HUD only re-renders on visible changes. */
  private characterHud(): CharacterHud {
    const c = this.condition;
    const block = this.sleeping ? null : sleepBlock(c, this.vitals, this.nearestHunterTiles, this.bodySleepInfo());
    return {
      fatigue: Math.round(c.fatigue),
      stress: Math.round(c.stress),
      panic: Math.round(c.panic),
      boredom: Math.round(c.boredom),
      unhappiness: Math.round(c.unhappiness),
      bodyTemp: Math.round(c.bodyTemp * 10) / 10,
      bodyWeight: Math.round(c.bodyWeight * 10) / 10,
      wet: Math.round(c.wet ?? 0),
      fitness: { level: c.fitness.level, progress: Math.round(levelProgress(c.fitness) * 20) / 20 },
      strength: { level: c.strength.level, progress: Math.round(levelProgress(c.strength) * 20) / 20 },
      carryKg: Math.round(this.carriedWeight() * 10) / 10,
      carryMaxKg: Math.round(this.capacity() * 10) / 10,
      sleepBlocked: block && block !== 'dead' ? SLEEP_BLOCK_TEXT[block] : null,
    };
  }

  private supplyHud(): SupplyHud[] {
    const by = new Map<ConsumableId, number>();
    for (const it of this.bag.items) {
      // Quick-use bar: food, drink, meds and reading only
      if (ITEM_DEFS[it.def].consume) by.set(it.def as ConsumableId, (by.get(it.def as ConsumableId) ?? 0) + it.qty);
    }
    return [...by].map(([id, qty]) => ({ id, qty, name: ITEM_DEFS[id].name, icon: ITEM_DEFS[id].icon }));
  }

  /** Depth-sortable draw calls for zombies the player can currently see or sense. */
  collectRenderables(ctx: CanvasRenderingContext2D, view: { left: number; top: number; right: number; bottom: number }) {
    const out: { y: number; draw: () => void }[] = [];
    this.sensed = [];
    for (const z of this.sim.zombies) {
      if (z.x < view.left || z.x > view.right || z.y < view.top || z.y > view.bottom) continue;
      const vis = this.vision.visibilityAt(z.x, z.y);
      if (vis === VIS_HIDDEN) continue;
      // Sensed-but-unseen zombies are drawn over the fog as silhouettes (see renderWorld)
      if (vis === VIS_PERIPHERAL) this.sensed.push(z);
      else out.push({ y: z.y + 2, draw: () => this.drawZombie(ctx, z, false) });
    }
    if (this.swingAge < SWING_VISUAL_SECONDS) {
      out.push({ y: this.feet.y + 3, draw: () => this.drawSwing(ctx) });
    }
    for (const [tile, b] of this.built) {
      const g = this.vision.grid;
      const c = tile % g.cols;
      const x = c * g.tileSize;
      const y = ((tile - c) / g.cols) * g.tileSize;
      if (x + g.tileSize < view.left || x > view.right || y + g.tileSize < view.top || y > view.bottom) continue;
      // Plots and snares lie flat: everything walks over them
      const flat = STRUCTURES[b.kind].as === 'floor';
      out.push({ y: flat ? y - g.tileSize : y + g.tileSize - 2, draw: () => this.drawStructure(ctx, x, y, b.kind, g.entrances.get(tile), b.state) });
    }
    for (const v of this.vehicles.vehicles.values()) {
      if (v.x < view.left - 40 || v.x > view.right + 40 || v.y < view.top - 40 || v.y > view.bottom + 40) continue;
      // Parked cars are part of the scenery; a moving one only where you can see
      if (v.driver && v.driver !== this.selfId() && this.vision.visibilityAt(v.x, v.y) === VIS_HIDDEN) continue;
      const half = VEHICLE_SPECS[v.kind].width / 2;
      out.push({ y: v.y + half, draw: () => this.vehicles.draw(ctx, v, this.animTime) });
    }
    for (const p of this.store.piles()) {
      if (p.kind === 'crate') continue; // drawn as its structure
      if (p.x < view.left || p.x > view.right || p.y < view.top || p.y > view.bottom) continue;
      if (this.vision.visibilityAt(p.x, p.y) !== VIS_VISIBLE) continue;
      out.push({ y: p.y - 10, draw: () => this.drawPile(ctx, p.x, p.y, p.kind) });
    }
    for (const c of this.sim.corpses) {
      if (c.x < view.left || c.x > view.right || c.y < view.top || c.y > view.bottom) continue;
      if (this.vision.visibilityAt(c.x, c.y) !== VIS_VISIBLE) continue;
      out.push({ y: c.y - 8, draw: () => this.drawCorpse(ctx, c) });
    }
    for (const l of this.loot) {
      if (this.taken.has(l.id)) continue;
      if (l.x < view.left || l.x > view.right || l.y < view.top || l.y > view.bottom) continue;
      if (this.vision.visibilityAt(l.x, l.y) !== VIS_VISIBLE) continue;
      out.push({ y: l.y - 4, draw: () => this.drawLoot(ctx, l) });
    }
    return out;
  }

  private drawZombie(ctx: CanvasRenderingContext2D, z: Zombie, sensed: boolean) {
    ctx.save();
    // Sprite box is 32 wide with feet ~28px down (same anchor as players)
    const special = isSpecial(z) ? SPECIAL_LOOKS[z.kind as SpecialZombieType] : null;
    // Sprinters lurch faster
    const gait = z.traits?.speed === 2 ? 10 : 6;
    const lurch = z.moving ? Math.sin(this.animTime * gait + z.id) * 1.5 : 0;
    if (special) {
      // Scale around the feet so big specials still stand on their tile
      ctx.translate(Math.floor(z.x + lurch), Math.floor(z.y + 2));
      ctx.scale(special.scale, special.scale);
      ctx.translate(-16, -32);
    } else {
      ctx.translate(Math.floor(z.x - 16 + lurch), Math.floor(z.y - 30));
    }
    if (z.state === 'down') {
      // Knocked flat: lie the sprite down around its feet
      ctx.translate(16, 30);
      ctx.rotate(Math.cos(z.facing) >= 0 ? Math.PI / 2 : -Math.PI / 2);
      ctx.translate(-16, -30);
    } else if (z.state === 'feed' && !z.moving) {
      // Hunched over a body
      ctx.translate(16, 30);
      ctx.scale(1, 0.82);
      ctx.translate(-16, -30);
    }
    if (special && !sensed) this.drawAbilityTell(ctx, z);
    if (sensed) {
      ctx.globalAlpha = 0.7;
      ctx.filter = 'brightness(0.25) saturate(0.4)';
    }

    ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
    ctx.beginPath();
    ctx.ellipse(16, 32, 10, 4, 0, 0, Math.PI * 2);
    ctx.fill();

    const frame = z.moving ? Math.floor(this.animTime * 4 + z.id) % 4 : 0;
    // Red hit flash (ctx.filter is ignored where unsupported, e.g. older Safari)
    if (special && !sensed) ctx.filter = special.filter;
    if (z.sinceHit < 0.15 && !sensed) ctx.filter = 'sepia(1) saturate(6) hue-rotate(-50deg) brightness(1.2)';
    const look = special ? special.look : ZOMBIE_LOOKS[z.variant % ZOMBIE_LOOKS.length];
    renderPixelAvatar(ctx, look, ZOMBIE_SPRITE, toDirection(z.facing), frame);
    ctx.filter = 'none';

    // Health pip bar once damaged (specials always show theirs)
    const maxHp = isSpecial(z) ? z.maxHp : (z.maxHp ?? ZOMBIE.maxHp);
    if ((z.hp < maxHp || special) && !sensed) {
      ctx.fillStyle = '#111111';
      ctx.fillRect(6, -4, 20, 4);
      ctx.fillStyle = special ? '#F59E0B' : '#EF4444';
      ctx.fillRect(7, -3, Math.max(0, (18 * z.hp) / maxHp), 2);
    }

    // Alert marker while chasing
    if ((z.state === 'chase' || z.state === 'attack') && !sensed) {
      ctx.font = 'bold 10px "Plus Jakarta Sans", monospace, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillStyle = '#EF4444';
      ctx.fillText('!', 16, -8);
    }
    ctx.restore();
  }

  /** Telegraphs (sprite-local coords): charger windup glow, bloater swelling, dreadnought roar. */
  private drawAbilityTell(ctx: CanvasRenderingContext2D, z: Zombie) {
    if (!isSpecial(z)) return;
    const a = z.ability;
    const pulse = 0.5 + 0.5 * Math.sin(this.animTime * 18);
    if (a.kind === 'charge' && (a.phase === 'windup' || a.phase === 'charging')) {
      ctx.fillStyle = `rgba(239, 68, 68, ${0.25 + 0.35 * pulse})`;
      ctx.beginPath();
      ctx.ellipse(16, 30, 14, 6, 0, 0, Math.PI * 2);
      ctx.fill();
    } else if (a.kind === 'charge' && a.phase === 'recover') {
      drawIcon(ctx, 'sparkles', 16, -12, 10, { color: '#FDE047', strokeWidth: 2.6 });
    } else if (a.kind === 'bloat' && a.fuse !== null) {
      ctx.fillStyle = `rgba(132, 204, 22, ${0.3 + 0.4 * pulse})`;
      ctx.beginPath();
      ctx.arc(16, 18, 16 + pulse * 3, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  private drawSwing(ctx: CanvasRenderingContext2D) {
    const t = this.swingAge / SWING_VISUAL_SECONDS;
    ctx.save();
    ctx.globalAlpha = 1 - t;
    ctx.strokeStyle =
      this.swingKind === 'heavy' ? '#F97316' : this.swingKind === 'shove' ? '#E5E7EB' : this.swingKind === 'stomp' ? '#EF4444' : '#FDE047';
    ctx.lineWidth = this.swingKind === 'heavy' ? 4.5 : 3;
    ctx.beginPath();
    ctx.arc(this.feet.x, this.feet.y - 6, this.swingRange * (0.7 + 0.3 * t), this.swingFacing - this.swingArc / 2, this.swingFacing + this.swingArc / 2);
    ctx.stroke();
    ctx.restore();
  }

  /** A farm plot: tilled rows, and the crop at its stage. */
  private drawPlot(ctx: CanvasRenderingContext2D, x: number, y: number, s?: number[]) {
    ctx.fillStyle = s && s[2] > 40 ? '#4A3220' : '#6B4A2E';
    ctx.fillRect(x + 1, y + 1, 14, 14);
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    for (let k = 0; k < 3; k++) ctx.fillRect(x + 2, y + 4 + k * 4, 12, 1);
    if (!s || s[0] < 0) return;
    const stage = stageOf(s);
    const crop = CROP_IDS[s[0]];
    const dead = stage === 'dead' || stage === 'rotten';
    const green = dead ? '#78716C' : '#22C55E';
    const h = stage === 'seedling' ? 2 : stage === 'young' ? 4 : 6;
    for (let k = 0; k < 3; k++) {
      const px = x + 4 + k * 4;
      const py = y + 4 + k * 4;
      ctx.fillStyle = green;
      ctx.fillRect(px, py - h, 2, h);
      ctx.fillRect(px - 1, py - h, 4, 1);
      if (stage === 'ripe') {
        ctx.fillStyle = crop === 'tomato' ? '#DC2626' : crop === 'carrot' ? '#F97316' : crop === 'potato' ? '#C2A36B' : '#16A34A';
        ctx.fillRect(px - 1, py - 2, 4, 3);
      }
    }
  }

  /** A built wall, fence, door, crate or workbench (tile top-left x, y). Damaged walls show cracks. */
  private drawStructure(ctx: CanvasRenderingContext2D, x: number, y: number, kind: StructureKind, e?: Entrance, state?: number[]) {
    const T = 16;
    const broken = e?.state === 'broken';
    ctx.save();
    if (broken) {
      // Rubble
      ctx.fillStyle = kind === 'metal_wall' ? '#6B7280' : '#7C4A21';
      ctx.fillRect(x + 1, y + 9, 6, 3);
      ctx.fillRect(x + 8, y + 11, 6, 3);
      ctx.fillRect(x + 4, y + 13, 5, 2);
      ctx.restore();
      return;
    }
    switch (kind) {
      case 'wood_wall':
      case 'metal_wall': {
        const metal = kind === 'metal_wall';
        // Front face plus a top lip, so it reads as standing up
        ctx.fillStyle = metal ? '#4B5563' : '#6B4423';
        ctx.fillRect(x, y - 6, T, T + 6);
        ctx.fillStyle = metal ? '#9CA3AF' : '#A0693A';
        ctx.fillRect(x, y - 6, T, 4);
        ctx.fillStyle = metal ? '#374151' : '#4A2F18';
        for (let k = 0; k < 4; k++) ctx.fillRect(x, y - 1 + k * 4, T, 1);
        if (metal) {
          ctx.fillStyle = '#D1D5DB';
          for (const [dx, dy] of [[2, 0], [13, 0], [2, 12], [13, 12]]) ctx.fillRect(x + dx, y + dy, 1, 1);
        }
        break;
      }
      case 'fence':
        ctx.fillStyle = '#7C4A21';
        ctx.fillRect(x + 1, y - 4, 3, T + 2);
        ctx.fillRect(x + 12, y - 4, 3, T + 2);
        ctx.fillStyle = '#A0693A';
        ctx.fillRect(x, y + 1, T, 3);
        ctx.fillRect(x, y + 8, T, 3);
        break;
      case 'wood_door':
        if (e?.state === 'open') {
          ctx.fillStyle = '#6B4626';
          ctx.fillRect(x, y, 3, T);
        } else {
          ctx.fillStyle = '#4A2F18';
          ctx.fillRect(x, y - 4, T, T + 4);
          ctx.fillStyle = '#8A5A30';
          ctx.fillRect(x + 1, y - 3, T - 2, T + 2);
          ctx.fillStyle = e?.state === 'locked' ? '#C0392B' : '#E8C33A';
          ctx.fillRect(x + 11, y + 6, 2, 2);
        }
        if (e?.state === 'barricaded') {
          ctx.fillStyle = '#7A5230';
          for (let k = 0; k < e.planks; k++) ctx.fillRect(x - 1, y - 2 + k * 4, T + 2, 3);
        }
        break;
      case 'crate':
        ctx.fillStyle = '#8B5A2B';
        ctx.fillRect(x + 1, y - 2, T - 2, T);
        ctx.strokeStyle = '#4A2F18';
        ctx.lineWidth = 1;
        ctx.strokeRect(x + 1.5, y - 1.5, T - 3, T - 1);
        ctx.beginPath();
        ctx.moveTo(x + 2, y - 1);
        ctx.lineTo(x + T - 2, y + T - 3);
        ctx.stroke();
        break;
      case 'workbench':
        ctx.fillStyle = '#5B3A1E';
        ctx.fillRect(x + 1, y + 8, 2, 7);
        ctx.fillRect(x + T - 3, y + 8, 2, 7);
        ctx.fillStyle = '#A0693A';
        ctx.fillRect(x, y + 2, T, 6);
        drawIcon(ctx, 'hammer', x + 8, y + 2, 7, { color: '#E5E7EB', strokeWidth: 2.6 });
        break;
      case 'farm_plot':
        this.drawPlot(ctx, x, y, state);
        break;
      case 'snare_trap': {
        ctx.strokeStyle = '#7C4A21';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(x + 3, y + 13);
        ctx.lineTo(x + 8, y + 4);
        ctx.lineTo(x + 13, y + 13);
        ctx.stroke();
        ctx.strokeStyle = '#D6C7A1';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(x + 8, y + 11, 3, 0, Math.PI * 2);
        ctx.stroke();
        if (state && state[0] >= 0) {
          ctx.fillStyle = '#8B6B4A';
          ctx.beginPath();
          ctx.ellipse(x + 8, y + 11, 4, 2.5, 0, 0, Math.PI * 2);
          ctx.fill();
        }
        break;
      }
      case 'generator': {
        const running = !!state && generatorRunning(state);
        ctx.fillStyle = '#B45309';
        ctx.fillRect(x + 1, y - 1, T - 2, T - 2);
        ctx.fillStyle = '#1F2937';
        ctx.fillRect(x + 3, y + 2, T - 6, 6);
        // Shakes a little and shows a green light while it runs
        ctx.fillStyle = running ? '#22C55E' : '#7F1D1D';
        ctx.fillRect(x + T - 5, y + 10, 2, 2);
        if (running) {
          ctx.fillStyle = 'rgba(120, 113, 108, 0.5)';
          const puff = (((this.animTime * 1.5) % 1) + 1) % 1;
          ctx.beginPath();
          ctx.arc(x + 4, y - 3 - puff * 8, 2 + puff * 3, 0, Math.PI * 2);
          ctx.fill();
        }
        break;
      }
      case 'rain_collector': {
        const fill = state ? Math.min(1, state[0] / 20) : 0;
        ctx.fillStyle = '#6B4423';
        ctx.fillRect(x + 2, y - 2, T - 4, T);
        ctx.fillStyle = '#3B82F6';
        ctx.fillRect(x + 4, y + 12 - Math.round(fill * 12), T - 8, Math.round(fill * 12));
        ctx.fillStyle = '#A0693A';
        ctx.fillRect(x, y - 3, T, 2);
        break;
      }
      case 'campfire': {
        const lit = !!state && state[0] > 0;
        ctx.fillStyle = '#57534E';
        for (const [dx, dy] of [[1, 10], [6, 13], [11, 10], [3, 5], [10, 5]]) ctx.fillRect(x + dx, y + dy, 4, 3);
        ctx.fillStyle = '#7C4A21';
        ctx.fillRect(x + 3, y + 8, 10, 2);
        if (lit) {
          const flick = 0.75 + 0.25 * Math.sin(this.animTime * 14 + x);
          ctx.fillStyle = '#F97316';
          ctx.beginPath();
          ctx.moveTo(x + 4, y + 9);
          ctx.lineTo(x + 8, y + 9 - 9 * flick);
          ctx.lineTo(x + 12, y + 9);
          ctx.fill();
          ctx.fillStyle = '#FDE047';
          ctx.beginPath();
          ctx.moveTo(x + 6, y + 9);
          ctx.lineTo(x + 8, y + 9 - 5 * flick);
          ctx.lineTo(x + 10, y + 9);
          ctx.fill();
        }
        break;
      }
    }
    // Cracks as walls, fences and doors take damage
    const spec = STRUCTURES[kind];
    if (e && spec.hp > 0 && e.hp < spec.hp * 0.6) {
      ctx.strokeStyle = 'rgba(17, 17, 17, 0.75)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x + 4, y - 2);
      ctx.lineTo(x + 7, y + 5);
      ctx.lineTo(x + 5, y + 10);
      if (e.hp < spec.hp * 0.3) {
        ctx.moveTo(x + 11, y);
        ctx.lineTo(x + 9, y + 7);
        ctx.lineTo(x + 12, y + 13);
      }
      ctx.stroke();
    }
    ctx.restore();
  }

  /** Dropped things (a sack) or a dead survivor's belongings (a backpack). */
  private drawPile(ctx: CanvasRenderingContext2D, x: number, y: number, kind: ContainerKind) {
    ctx.save();
    ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
    ctx.beginPath();
    ctx.ellipse(x, y + 3, 8, 3, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = kind === 'corpse' ? '#7C2D12' : '#A16207';
    ctx.strokeStyle = '#18181B';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.roundRect(x - 6, y - 8, 12, 10, 3);
    ctx.fill();
    ctx.stroke();
    drawIcon(ctx, kind === 'corpse' ? 'backpack' : 'package', x, y - 3, 8, { color: '#FEF3C7', strokeWidth: 2.4 });
    ctx.restore();
  }

  /** A body on the ground: blood pool and a grey, still figure. */
  private drawCorpse(ctx: CanvasRenderingContext2D, c: Corpse) {
    ctx.save();
    ctx.fillStyle = 'rgba(127, 29, 29, 0.55)';
    ctx.beginPath();
    ctx.ellipse(c.x + 2, c.y + 1, 15, 6, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.translate(Math.floor(c.x), Math.floor(c.y));
    ctx.rotate(Math.PI / 2);
    ctx.translate(-16, -30);
    ctx.filter = 'grayscale(0.7) brightness(0.75)';
    renderPixelAvatar(ctx, CORPSE_LOOK, ZOMBIE_SPRITE, 'down', 0);
    ctx.filter = 'none';
    ctx.restore();
  }

  /** World-space fog (call after entities, camera transform applied). */
  renderWorld(ctx: CanvasRenderingContext2D) {
    this.renderWorldInner(ctx);
    // Damage numbers, pickups, blood and sparks over everything
    this.feedback.draw(ctx);
  }

  private renderWorldInner(ctx: CanvasRenderingContext2D) {
    // Gas clouds sit under the fog (you only see the parts you can see)
    for (const h of this.director.hazards) {
      const fade = Math.min(1, h.remaining / 2);
      const wobble = 1 + 0.05 * Math.sin(this.animTime * 2 + h.id);
      const g = ctx.createRadialGradient(h.x, h.y, 0, h.x, h.y, h.radius * wobble);
      g.addColorStop(0, `rgba(132, 204, 22, ${0.45 * fade})`);
      g.addColorStop(1, 'rgba(101, 163, 13, 0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(h.x, h.y, h.radius * wobble, 0, Math.PI * 2);
      ctx.fill();
    }
    this.vision.render(ctx);
    this.drawFx(ctx);
    // The opening the interact key acts on reads through the fog
    if (this.nearEntrance && this.deadTimer <= 0) {
      const g = this.vision.grid;
      const leaves: Entrance[] = [];
      for (const t of this.linkedEntranceTiles(this.nearEntrance.tile)) {
        const e = g.entrances.get(t);
        if (e) leaves.push(e);
      }
      drawEntranceReach(ctx, leaves, g.tileSize, 0.5 + 0.5 * Math.sin(this.animTime * 5));
    }
    // Placement ghost on the tile you face
    if (this.placing && this.deadTimer <= 0) {
      const g = this.vision.grid;
      const t = this.targetTile();
      const bad = this.placeProblem(t.tile, this.selfId(), { x: this.feet.x, y: this.feet.y - 4 });
      const pulse = 0.5 + 0.5 * Math.sin(this.animTime * 6);
      ctx.save();
      ctx.globalAlpha = 0.45 + 0.25 * pulse;
      ctx.fillStyle = bad ? '#EF4444' : '#22C55E';
      ctx.fillRect(t.col * g.tileSize, t.row * g.tileSize, g.tileSize, g.tileSize);
      ctx.globalAlpha = 1;
      ctx.strokeStyle = bad ? '#7F1D1D' : '#14532D';
      ctx.lineWidth = 1.5;
      ctx.strokeRect(t.col * g.tileSize + 0.75, t.row * g.tileSize + 0.75, g.tileSize - 1.5, g.tileSize - 1.5);
      drawIcon(ctx, STRUCTURES[this.placing.kind].icon, (t.col + 0.5) * g.tileSize, (t.row + 0.5) * g.tileSize, 10, { color: '#FFFFFF', strokeWidth: 2.4 });
      if (this.constructing) {
        ctx.strokeStyle = '#FDE047';
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.arc((t.col + 0.5) * g.tileSize, (t.row + 0.5) * g.tileSize, 11, -Math.PI / 2, -Math.PI / 2 + 2 * Math.PI * (this.constructing.t / this.constructing.total));
        ctx.stroke();
      }
      ctx.restore();
    }
    // The container E would search, outlined
    const near = this.nearContainerId === null || this.nearEntrance ? null : this.store.get(this.nearContainerId);
    if (near && this.deadTimer <= 0) {
      ctx.save();
      ctx.strokeStyle = `rgba(253, 224, 71, ${0.55 + 0.35 * Math.sin(this.animTime * 5)})`;
      ctx.lineWidth = 2;
      const w = near.w ?? 0;
      const h = near.h ?? 0;
      if (w > 0) ctx.strokeRect(near.x + 1, near.y + 1, w - 2, h - 2);
      else ctx.strokeRect(near.x - 8, near.y - 10, 16, 14);
      ctx.restore();
    }
    for (const z of this.sensed) this.drawZombie(ctx, z, true);
    // Tracers + muzzle flash read through the fog (you see your own gunfire)
    if (this.tracers.length) {
      ctx.save();
      ctx.lineWidth = 1.5;
      for (const t of this.tracers) {
        ctx.globalAlpha = 1 - t.age / TRACER_SECONDS;
        ctx.strokeStyle = '#FDE68A';
        ctx.beginPath();
        ctx.moveTo(t.x1, t.y1);
        ctx.lineTo(t.x2, t.y2);
        ctx.stroke();
      }
      ctx.restore();
    }
    if (this.muzzleAge < 0.06) {
      const a = this.aim ?? this.vision.getFacing();
      ctx.save();
      ctx.fillStyle = '#FBBF24';
      ctx.globalAlpha = 0.9;
      ctx.beginPath();
      ctx.arc(this.feet.x + Math.cos(a) * 14, this.feet.y - MUZZLE_LIFT + Math.sin(a) * 14, 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }

  /** Special-infected one-shots: impact burst, bloater pop, roar shockwave, breach dust. */
  private drawFx(ctx: CanvasRenderingContext2D) {
    if (!this.fx.length) return;
    ctx.save();
    for (const f of this.fx) {
      if (f.k === 'g') continue;
      if (f.k === 'n') {
        // Noise maker: a small box with yellow rings once it starts buzzing
        ctx.globalAlpha = 1;
        ctx.fillStyle = '#3F3F46';
        ctx.fillRect(f.x - 3, f.y - 3, 6, 5);
        if (f.age >= LURE.delay) {
          const pulse = (f.age * 2.5) % 1;
          ctx.globalAlpha = 0.8 * (1 - pulse);
          ctx.strokeStyle = '#FACC15';
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.arc(f.x, f.y, 4 + pulse * 26, 0, Math.PI * 2);
          ctx.stroke();
        }
        continue;
      }
      if (f.k === 'a') {
        // Alarm: a red beacon pulsing twice a second for the whole minute
        const pulse = (f.age * 2) % 1;
        ctx.globalAlpha = 0.85 * (1 - pulse);
        ctx.strokeStyle = '#EF4444';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(f.x, f.y, 6 + pulse * 42, 0, Math.PI * 2);
        ctx.stroke();
        continue;
      }
      const t = f.age / FX_SECONDS[f.k];
      ctx.globalAlpha = 1 - t;
      if (f.k === 'r') {
        // Roar: two expanding rings out to the rally radius
        ctx.strokeStyle = '#F59E0B';
        ctx.lineWidth = 3;
        for (const lag of [0, 0.25]) {
          const r = Math.max(0, t - lag) * 30 * this.vision.grid.tileSize;
          ctx.beginPath();
          ctx.arc(f.x, f.y, r, 0, Math.PI * 2);
          ctx.stroke();
        }
      } else if (f.k === 'b') {
        ctx.fillStyle = '#84CC16';
        ctx.beginPath();
        ctx.arc(f.x, f.y, (0.3 + t) * BLOATER.burstRadiusTiles * this.vision.grid.tileSize, 0, Math.PI * 2);
        ctx.fill();
      } else {
        ctx.fillStyle = f.k === 'i' ? '#EF4444' : '#A8A29E';
        for (let i = 0; i < 8; i++) {
          const a = (i / 8) * Math.PI * 2;
          const r = 6 + t * 18;
          ctx.fillRect(f.x + Math.cos(a) * r - 2, f.y - 8 + Math.sin(a) * r - 2, 4, 4);
        }
      }
    }
    ctx.restore();
  }

  /** Pixel-art pickup: gun silhouette or ammo box, with a pulsing glow so loot reads at a glance. */
  private drawLoot(ctx: CanvasRenderingContext2D, l: LootSpawn) {
    const x = Math.round(l.x);
    const y = Math.round(l.y);
    const pulse = 0.35 + 0.25 * Math.sin(this.animTime * 4 + l.id);
    ctx.save();
    ctx.fillStyle = `rgba(253, 224, 71, ${pulse})`;
    ctx.beginPath();
    ctx.ellipse(x, y + 2, 11, 5, 0, 0, Math.PI * 2);
    ctx.fill();
    const px = (dx: number, dy: number, w: number, h: number, c: string) => {
      ctx.fillStyle = c;
      ctx.fillRect(x + dx, y + dy, w, h);
    };
    if (l.item.kind === 'supply') {
      // White icon on a disc coloured by item type, with a dark ring so it reads on any floor
      const def = ITEM_DEFS[l.item.supply];
      ctx.fillStyle = '#18181B';
      ctx.beginPath();
      ctx.arc(x, y - 3, 10, 0, Math.PI * 2);
      ctx.fill();
      drawIcon(ctx, def.icon, x, y - 3, 17, { color: '#FFFFFF', background: LOOT_DISC[def.category], pad: 0.2, strokeWidth: 2.4 });
    } else if (l.item.kind === 'ammo') {
      px(-6, -6, 12, 8, '#3F6212');
      px(-6, -6, 12, 2, '#65A30D');
      px(-4, -3, 8, 2, '#FDE047');
      px(-6, 1, 12, 1, '#1A2E05');
    } else if (l.item.kind === 'weapon') {
      const long = l.item.weapon !== 'pistol';
      const accent = l.item.weapon === 'ak47' ? '#92400E' : l.item.weapon === 'shotgun' ? '#78350F' : '#3F3F46';
      if (long) {
        px(-9, -5, 16, 3, '#27272A'); // barrel + body
        px(-9, -5, 4, 4, accent); // stock
        px(-1, -2, 3, 4, '#27272A'); // grip
        if (l.item.weapon === 'mg') px(2, -2, 5, 3, '#52525B'); // box mag
        else px(3, -2, 2, 4, '#3F3F46'); // magazine
      } else {
        px(-5, -5, 10, 3, '#27272A');
        px(-4, -2, 3, 5, '#3F3F46');
      }
    }
    ctx.restore();
  }

  /**
   * Sun and night: a sky-tinted darkness layer over the world with light
   * punched out for your glow, lamps, the flashlight beam and muzzle flashes.
   */
  private renderNight(ctx: CanvasRenderingContext2D, w: number, h: number, cam: { x: number; y: number; zoom: number }) {
    const tint = skyTint(this.tod);
    if (tint.warm.a > 0.01) {
      ctx.save();
      ctx.fillStyle = `rgba(${tint.warm.r}, ${tint.warm.g}, ${tint.warm.b}, ${tint.warm.a})`;
      ctx.fillRect(0, 0, w, h);
      ctx.restore();
    }
    const a = tint.night.a;
    if (a < 0.01 || typeof document === 'undefined') return;
    const canvas = (this.darkCanvas ??= document.createElement('canvas'));
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
    }
    const d = canvas.getContext('2d');
    if (!d) return;
    const ts = this.vision.grid.tileSize * cam.zoom;
    const sx = (x: number) => (x - cam.x) * cam.zoom;
    const sy = (y: number) => (y - cam.y) * cam.zoom;
    d.globalCompositeOperation = 'source-over';
    d.clearRect(0, 0, w, h);
    d.fillStyle = `rgba(${tint.night.r}, ${tint.night.g}, ${tint.night.b}, ${a})`;
    d.fillRect(0, 0, w, h);
    d.globalCompositeOperation = 'destination-out';
    const hole = (x: number, y: number, r: number, strength: number) => {
      const g = d.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, `rgba(0, 0, 0, ${strength})`);
      g.addColorStop(1, 'rgba(0, 0, 0, 0)');
      d.fillStyle = g;
      d.beginPath();
      d.arc(x, y, r, 0, Math.PI * 2);
      d.fill();
    };
    const px = sx(this.feet.x);
    const py = sy(this.feet.y - 10);
    hole(px, py, 2.5 * ts, 0.7); // your own faint glow
    const lampsOn = this.tod.light < LAMPS_ON_BELOW;
    for (const f of this.fires) hole(sx(f.x), sy(f.y), CAMPFIRE.lightTiles * ts, 0.85);
    for (const h of this.headlights()) hole(sx(h.x), sy(h.y), HEADLIGHT_TILES * ts, 0.8);
    if (lampsOn) {
      for (const l of this.lamps) {
        if (!this.poweredAt(l.x, l.y)) continue;
        const lx = sx(l.x);
        const ly = sy(l.y);
        if (lx < -200 || ly < -200 || lx > w + 200 || ly > h + 200) continue;
        hole(lx, ly, LAMP_RADIUS_TILES * ts, 0.85);
      }
    }
    if (this.flashlightOn) {
      const aim = this.aim ?? this.vision.getFacing();
      const reach = 18 * ts;
      const g = d.createRadialGradient(px, py, 0, px, py, reach);
      g.addColorStop(0, 'rgba(0, 0, 0, 0.95)');
      g.addColorStop(0.75, 'rgba(0, 0, 0, 0.7)');
      g.addColorStop(1, 'rgba(0, 0, 0, 0)');
      d.fillStyle = g;
      d.beginPath();
      d.moveTo(px, py);
      d.arc(px, py, reach, aim - FLASHLIGHT_HALF_ANGLE, aim + FLASHLIGHT_HALF_ANGLE);
      d.closePath();
      d.fill();
    }
    if (this.muzzleAge < MUZZLE_LIGHT_SECONDS) {
      hole(px, py, MUZZLE_LIGHT_TILES * ts, 0.9 * (1 - this.muzzleAge / MUZZLE_LIGHT_SECONDS));
    }
    ctx.drawImage(canvas, 0, 0);

    // Warm lamp halos on top of the darkness
    if (lampsOn) {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      for (const l of this.lamps) {
        if (!this.poweredAt(l.x, l.y)) continue;
        const hx = sx(l.headX);
        const hy = sy(l.headY);
        if (hx < -100 || hy < -100 || hx > w + 100 || hy > h + 100) continue;
        const g = ctx.createRadialGradient(hx, hy, 0, hx, hy, 1.6 * ts);
        g.addColorStop(0, `rgba(253, 224, 140, ${0.35 * a})`);
        g.addColorStop(1, 'rgba(253, 224, 140, 0)');
        ctx.fillStyle = g;
        ctx.fillRect(hx - 1.6 * ts, hy - 1.6 * ts, 3.2 * ts, 3.2 * ts);
      }
      ctx.restore();
    }
  }

  /** Screen-space overlays: night, gas haze, hurt vignette, knockdown, death fade. */
  renderScreen(ctx: CanvasRenderingContext2D, w: number, h: number, cam?: { x: number; y: number; zoom: number }) {
    if (cam) this.renderNight(ctx, w, h, cam);
    this.renderWeather(ctx, w, h, cam);
    if (this.vitals.effects.some((e) => e.kind === 'blinded')) {
      ctx.save();
      ctx.fillStyle = 'rgba(77, 124, 15, 0.28)';
      ctx.fillRect(0, 0, w, h);
      ctx.restore();
    }
    if (!this.canAct && this.deadTimer <= 0) {
      ctx.save();
      ctx.font = 'bold 22px "Plus Jakarta Sans", sans-serif';
      ctx.textAlign = 'center';
      ctx.fillStyle = '#FDE047';
      ctx.strokeStyle = '#18181B';
      ctx.lineWidth = 4;
      ctx.strokeText('KNOCKED DOWN', w / 2, h * 0.32);
      ctx.fillText('KNOCKED DOWN', w / 2, h * 0.32);
      ctx.restore();
    }
    const lowHp = this.hp < 35 ? (35 - this.hp) / 35 : 0;
    const strength = Math.max(this.hurtFlash, lowHp * 0.6);
    if (strength > 0.01) {
      const g = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.3, w / 2, h / 2, Math.max(w, h) * 0.7);
      g.addColorStop(0, 'rgba(185, 28, 28, 0)');
      g.addColorStop(1, `rgba(185, 28, 28, ${0.55 * strength})`);
      ctx.save();
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
      ctx.restore();
    }
    if (this.deadTimer > 0) {
      ctx.save();
      ctx.globalAlpha = Math.min(1, (DEATH_SECONDS - this.deadTimer) / 0.6) * 0.8;
      ctx.fillStyle = '#12121A';
      ctx.fillRect(0, 0, w, h);
      ctx.restore();
    }
  }

  dispose() {
    if (this.darkCanvas) {
      this.darkCanvas.width = 0;
      this.darkCanvas.height = 0;
      this.darkCanvas = null;
    }
    this.vision.dispose();
    this.sim.clear();
    this.director.clear();
    this.tracks.clear();
    this.fx = [];
    if (this.net) {
      this.net.onSnapshot = undefined;
      this.net.onStrike = undefined;
      this.net.onDoor = undefined;
      this.net = null;
    }
    this.onHudChanged = undefined;
  }
}

