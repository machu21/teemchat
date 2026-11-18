import type { AmmoType, WeaponId } from '../weapons';
import type { Zombie } from '../zombieSim';
import type { IconName } from '@/lib/icons';
import type { SkillId } from './skills';
import type { MagazineId } from './crafting';

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

export type ItemCategory =
  | 'food'
  | 'drink'
  | 'stimulant'
  | 'medical'
  | 'weapon'
  | 'ammo'
  | 'clothing'
  | 'bag'
  | 'tool'
  | 'material'
  | 'electronics'
  | 'farming'
  | 'vehicle'
  | 'literature'
  | 'misc';

/** Where a worn item goes. */
export type EquipSlot = 'back' | 'outer' | 'hands';

/** Wearables: bags add carry capacity, clothes keep you warm and turn teeth. */
export interface EquipSpec {
  slot: EquipSlot;
  /** Extra carry capacity (kg) while worn (bags). */
  capacityKg?: number;
  /** °C added to the ambient temperature your body feels (clothes). */
  insulation?: number;
  /** 0–1 chance a zombie hit on a covered part leaves no wound (scaled by condition). */
  protection?: number;
}

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
  /** Character condition deltas (survival/condition.ts): caffeine wakes you, treats cheer you up. */
  fatigue?: number;
  boredom?: number;
  unhappiness?: number;
  stress?: number;
  /** Medical treatment applied to the body (survival/body.ts). */
  treat?: 'bandage' | 'disinfect' | 'splint' | 'painkiller';
  /** A skill book: reading it multiplies XP for that skill over a range of levels (kept after reading). */
  skillBook?: { skill: SkillId; volume: 1 | 2 };
  /** A recipe magazine: reading it teaches its recipes (kept after reading). */
  teaches?: MagazineId;
  /** A noise maker: dropped at your feet, it buzzes and pulls zombies in. */
  lure?: true;
  /** °C of body heat it gives back when you're cold (hot food). */
  warmth?: number;
  /** What's left in your hands afterwards (an empty bottle). */
  leaves?: ItemDefId;
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
  | 'bandage'
  | 'disinfectant'
  | 'painkillers'
  | 'splint'
  | 'book'
  | 'magazine'
  | 'noise_maker'
  | 'tainted_water'
  | 'raw_meat'
  | 'cooked_meat'
  | 'hot_soup'
  // Phase 7: grown, foraged, fished and trapped food
  | 'tomato'
  | 'carrot'
  | 'potato'
  | 'cabbage'
  | 'berries'
  | 'mushrooms'
  | 'herbs'
  | 'fish_minnow'
  | 'fish_perch'
  | 'fish_carp'
  | 'fish_catfish'
  | 'cooked_fish'
  | 'vegetable_stew'
  | 'salad'
  | `mag:${MagazineId}`;

/** Non-consumable gear: clothing, bags, tools, materials, electronics, farming, vehicle parts, misc. */
export type GearId =
  | 'winter_jacket'
  | 'leather_jacket'
  | 'hoodie'
  | 'work_gloves'
  | 'school_bag'
  | 'duffel_bag'
  | 'hiking_bag'
  | 'screwdriver'
  | 'saw'
  | 'wrench'
  | 'nails'
  | 'duct_tape'
  | 'scrap_metal'
  | 'battery'
  | 'radio'
  | 'tomato_seeds'
  | 'carrot_seeds'
  | 'gas_can'
  | 'car_battery'
  | 'spare_tire'
  | 'lighter'
  | 'rope'
  | 'thread'
  | 'planks'
  | 'rags'
  | 'metal_sheet'
  | 'electronics_scrap'
  | 'blowtorch'
  | 'empty_bottle'
  | 'gas_can_full'
  | 'generator'
  // Phase 7
  | 'potato_seeds'
  | 'cabbage_seeds'
  | 'shovel'
  | 'fishing_rod'
  | 'worms'
  | 'branch'
  | 'stone'
  | 'dead_rabbit'
  | 'dead_squirrel'
  | 'dead_bird'
  | 'dead_rat';

/** Skill books, two volumes per skill. */
export type SkillBookId = `book:${SkillId}:${1 | 2}`;

export type ItemDefId = ConsumableId | GearId | SkillBookId | `weapon:${WeaponId}` | `ammo:${AmmoType}`;

export interface ItemDef {
  id: ItemDefId;
  name: string;
  icon: IconName;
  category: ItemCategory;
  /** kg per unit. */
  weight: number;
  /** Units per bag slot. */
  maxStack: number;
  consume?: ConsumableEffect;
  /** Seconds the player is busy using it (eating, bandaging). */
  useSeconds?: number;
  /** One line for the inspect view. */
  description: string;
  /** Wearable (bags and clothes). */
  equip?: EquipSpec;
}

export interface InventoryItem {
  /** Unique per stack, assigned by the host (so pickups/drops can be reconciled). */
  uid: string;
  def: ItemDefId;
  qty: number;
  /** Condition 0–1 for things that wear out (melee weapons, clothes). Absent = new. */
  cond?: number;
  /** Rounds in the magazine (guns). */
  mag?: number;
  /** Perishable food: its "birth" on the aging clock of where it is (spoilage.ts). */
  rot?: number;
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

/** Furniture you can search, plus piles: `ground` (dropped items) and `corpse` (a dead survivor's things). */
export type ContainerKind =
  | 'shelf'
  | 'fridge'
  | 'register'
  | 'crate'
  | 'cabinet'
  | 'counter'
  | 'desk'
  | 'locker'
  | 'checkout'
  | 'ground'
  | 'corpse'
  /** A vehicle's trunk (moves with the vehicle). */
  | 'trunk';

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
  /** Owner (building id for furniture, 'pile' for dropped items and bodies). */
  poiId: string;
  x: number;
  y: number;
  /** Footprint (world px); 0 for piles. */
  w?: number;
  h?: number;
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
