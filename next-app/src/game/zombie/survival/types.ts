import type { AmmoType, WeaponId } from '../weapons';
import type { Zombie } from '../zombieSim';

// ============================================================
// ZOMBIE MODE — SURVIVAL DOMAIN MODELS (pure types, DOM-free)
// Extends the existing horde sim (zombieSim.ts) and weapons
// (weapons.ts) instead of replacing them: walkers stay `Zombie`,
// specials are `ZombieEntity` = Zombie + kind/armour/ability state.
// All ids that identify a *player in the world* are clientInstanceIds.
// ============================================================

// ---------------------------------------------------------------- roles

/** Who may start/stop a match. Mapped from `space_members.role`. */
export type SessionRole = 'ROOM_ADMIN' | 'MOD_OPERATOR' | 'SURVIVOR';

// ---------------------------------------------------------------- vitals

export type MovementIntent = 'idle' | 'walk' | 'sprint';

export type StatusEffectKind =
  /** Energy drink: speed boost, no exhaustion penalty. */
  | 'stimulant'
  /** Bloater gas: HP per second. */
  | 'poison'
  /** Bloater gas / starvation: movement multiplier. */
  | 'slow'
  /** Charger impact: can't move or attack. */
  | 'knockdown'
  /** Gas cloud: vision radius multiplier. */
  | 'blinded'
  /** Food / bandage: slow HP regen (hp per second). */
  | 'regen';

export interface StatusEffect {
  kind: StatusEffectKind;
  /** Seconds left. */
  remaining: number;
  /** Kind-specific strength (hp/s for poison, speed or vision multiplier for slow/blinded/stimulant). */
  magnitude: number;
  /** Source tag so re-applying the same hazard refreshes instead of stacking. */
  source?: string;
}

export interface PlayerVitals {
  /** 0–100. Reaching 0 = death. */
  health: number;
  /** 0–100, 100 = full. Depletes over time. */
  hunger: number;
  /** 0–100, 100 = full. Depletes faster while sprinting. */
  hydration: number;
  /** 0–100. Spent by sprinting/dodging. */
  stamina: number;
  /** True after stamina hit 0 until it recovers past the threshold (no sprinting). */
  exhausted: boolean;
  effects: StatusEffect[];
}

// ---------------------------------------------------------------- items

export type ItemCategory = 'food' | 'drink' | 'stimulant' | 'medical' | 'weapon' | 'ammo';

/** What a consumable does when used. Deltas are applied instantly; `regen` over time. */
export interface ConsumableEffect {
  hunger?: number;
  hydration?: number;
  stamina?: number;
  health?: number;
  /** Slow health regen: hp/s for `seconds`. */
  regen?: { hpPerSecond: number; seconds: number };
  /** Applied status effects (e.g. stimulant). */
  effects?: StatusEffect[];
}

export type ConsumableId =
  | 'canned_beans'
  | 'chips'
  | 'apple'
  | 'bread'
  | 'water_bottle'
  | 'soda'
  | 'energy_drink'
  | 'coffee'
  | 'bandage';

export type ItemDefId = ConsumableId | `weapon:${WeaponId}` | `ammo:${AmmoType}`;

export interface ItemDef {
  id: ItemDefId;
  name: string;
  icon: string;
  category: ItemCategory;
  /** kg per unit. */
  weight: number;
  /** Units per bag slot. */
  maxStack: number;
  consume?: ConsumableEffect;
  /** Seconds the player is busy using it (eating, bandaging). */
  useSeconds?: number;
}

export interface InventoryItem {
  /** Unique per stack, assigned by the host (so pickups/drops can be reconciled). */
  uid: string;
  def: ItemDefId;
  qty: number;
}

export interface WeaponItem extends InventoryItem {
  def: `weapon:${WeaponId}`;
  weapon: WeaponId;
  /** Rounds currently in the magazine. */
  mag: number;
  qty: 1;
}

export type AmmoPouch = Record<AmmoType, number>;

export interface QuickSlots {
  primary: WeaponItem | null;
  secondary: WeaponItem | null;
  /** uid of a consumable stack inside the bag (hotkey "use"). */
  consumableUid: string | null;
  /** Ammo lives outside the bag so reloading never digs through slots. */
  ammo: AmmoPouch;
}

export interface Bag {
  slots: number;
  maxWeight: number;
  items: InventoryItem[];
}

export interface Loadout {
  bag: Bag;
  quick: QuickSlots;
}

// ---------------------------------------------------------------- loot / POIs

export type PoiKind = 'grocery' | 'convenience' | 'pharmacy' | 'police' | 'house';

export interface PointOfInterest {
  id: string;
  kind: PoiKind;
  /** World px bounds (building footprint). */
  x: number;
  y: number;
  w: number;
  h: number;
  /** Safe zones regen stamina and stabilise vitals; zombies avoid nothing, so barricade them. */
  safeZone?: boolean;
}

export type ContainerKind = 'shelf' | 'fridge' | 'register' | 'crate' | 'cabinet';

export interface LootTableEntry {
  def: ItemDefId;
  weight: number;
  min: number;
  max: number;
}

export interface LootContainer {
  /** Stable id (map-seeded), used on the wire. */
  id: number;
  kind: ContainerKind;
  poiId: string;
  x: number;
  y: number;
  /** Table key into LOOT_TABLES. */
  table: string;
  /** Rolls per refill (before difficulty scaling). */
  rolls: number;
  /** null = one-time loot; otherwise seconds until it can refill after being emptied. */
  respawnSeconds: number | null;
  /** Match-clock second the container was emptied (null = never looted). */
  lootedAt: number | null;
  contents: InventoryItem[];
}

// ---------------------------------------------------------------- factions

export type Relation = 'TEAM_ALLY' | 'NEUTRAL_SURVIVOR' | 'INFECTED';

export interface Squad {
  id: string;
  leader: string;
  members: string[];
  /** Pending invites: clientInstanceId → expiry (match seconds). */
  invites: Record<string, number>;
}

// ---------------------------------------------------------------- infected

export type SpecialZombieType = 'charger' | 'bloater' | 'dreadnought';
export type ZombieKind = 'walker' | SpecialZombieType;
/** Wire order for ZombieKind (index is sent over the network). Append only. */
export const ZOMBIE_KINDS: readonly ZombieKind[] = ['walker', 'charger', 'bloater', 'dreadnought'];

/** Wire values for an active ability (ZombieRow[9]). Append only. */
export const ABILITY_FLAGS = ['none', 'windup', 'charging', 'recover', 'fuse', 'roar'] as const;
export type AbilityFlag = (typeof ABILITY_FLAGS)[number];

/** Design-level phase; derived from the sim's ZombieState + ability state. */
export type AiPhase = 'patrol' | 'alert' | 'chase' | 'attack' | 'ability';

export type DamageType = 'ballistic' | 'melee' | 'blunt' | 'toxic' | 'explosive';

export type AbilityState =
  | { kind: 'none' }
  | { kind: 'charge'; phase: 'ready' | 'windup' | 'charging' | 'recover'; timer: number; dirX: number; dirY: number; cooldown: number; hit: string[] }
  | { kind: 'bloat'; fuse: number | null; burst: boolean }
  | { kind: 'roar'; cooldown: number; roaring: number };

export interface ZombieEntity extends Zombie {
  kind: ZombieKind;
  maxHp: number;
  /** Damage multipliers per type (1 = normal, 0.35 = calcified plates). */
  armor: Partial<Record<DamageType, number>>;
  /** Knockback resistance; also used by the charger's impact. */
  mass: number;
  ability: AbilityState;
}

/** Lingering area hazard (bloater gas). */
export interface Hazard {
  id: number;
  kind: 'toxic_gas';
  x: number;
  y: number;
  /** World px. */
  radius: number;
  remaining: number;
}

// ---------------------------------------------------------------- match

export type MatchPhase = 'lobby' | 'running' | 'ended';

export interface DifficultyCoefficients {
  /** 0 = start, rises with match time. */
  level: number;
  /** Seconds between spawn waves (lower = harder). */
  spawnIntervalSeconds: number;
  /** Population cap multiplier on the map's base cap. */
  populationMul: number;
  /** Sight / hearing radius multiplier. */
  aggroMul: number;
  /** Walker speed multiplier. */
  speedMul: number;
  /** Probability per spawned zombie of each special. */
  specialChance: Record<SpecialZombieType, number>;
  /** Loot container roll multiplier (lower = scarcer). */
  lootMul: number;
  /** Hunger / hydration decay multiplier. */
  decayMul: number;
}

export interface SurvivorState {
  clientInstanceId: string;
  userId: string;
  name: string;
  x: number;
  y: number;
  vitals: PlayerVitals;
  loadout: Loadout;
  squadId: string | null;
  alive: boolean;
  kills: number;
}

export interface GameState {
  phase: MatchPhase;
  /** userId of the admin/mod who started the match. */
  startedBy: string | null;
  /** Epoch ms of the start (shared, so every client derives the same clock). */
  startedAtMs: number | null;
  /** Match seconds elapsed (authority clock). */
  elapsed: number;
  difficulty: DifficultyCoefficients;
  survivors: Record<string, SurvivorState>;
  squads: Record<string, Squad>;
  containers: LootContainer[];
  hazards: Hazard[];
  // Zombies (walkers and specials) live in ZombieSim.zombies; specials are
  // recognised with isSpecial() from specials.ts.
}
