import { Rect } from '../collision';
import { BuildingDefinition } from '../map/buildings';
import { renderPixelAvatar } from '../render/avatar';
import { AvatarConfig } from '@/lib/models/avatar';
import { VIS_HIDDEN, VIS_PERIPHERAL, VIS_VISIBLE } from './fov';
import { NoiseEvent, SimTarget, Zombie, ZombieSim, ZOMBIE, ZOMBIE_STATES } from './zombieSim';
import { ZombieVision } from './zombieVision';
import { ENTRANCE_STATES, Entrance, EntranceKind, EntranceState, MAX_PLANKS, applyEntranceAction } from './entrances';
import { TILE_ENTRANCE, TILE_SOLID, inBounds, setEntrance, tileIndex, worldToTile } from './grid';
import {
  AMMO_BOX,
  AMMO_NAMES,
  AmmoType,
  LootSpawn,
  WEAPONS,
  WEAPON_ORDER,
  WeaponId,
  castBullet,
  shotAngles,
  startingMag,
} from './weapons';
import { mulberry32 } from '../art/character/appearance';
import type {
  DoorActionType,
  EntranceRow,
  ZombieDoorAction,
  ZombieRow,
  ZombieShot,
  ZombieSnapshot,
  ZombieStrike,
  ZombieSyncService,
} from '@/lib/services/zombieSync';

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
}

export interface WeaponHud {
  id: WeaponId;
  name: string;
  icon: string;
  /** Rounds in the magazine (null for melee). */
  mag: number | null;
  magSize: number;
  /** Spare rounds for this weapon's ammo type. */
  reserve: number;
  /** 0–1 while reloading, else 0. */
  reloading: number;
}

export interface EntranceHud {
  kind: EntranceKind;
  state: EntranceState;
  planks: number;
  /** 0–1 while boarding up, else 0. */
  progress: number;
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
const REGEN_PER_SECOND = 3;
const SWING_RANGE = 36;
const SWING_ARC = (120 * Math.PI) / 180;
const SWING_DAMAGE = 40;
const SWING_VISUAL_SECONDS = 0.18;
const FOOTSTEP_INTERVAL = 0.5;
const FOOTSTEP_RADIUS = 3;
const SWING_NOISE_RADIUS = 5;
const DEATH_SECONDS = 2.2;
/** How close (px, feet to tile centre) a door/window must be to interact. */
const DOOR_REACH = 26;
const BARRICADE_SECONDS = 1.5;
const HAMMER_NOISE_RADIUS = 9;
const DOOR_NOISE_RADIUS = 2;
const WINDOW_SMASH_DAMAGE = 40;
const WINDOW_SMASH_NOISE_RADIUS = 10;
/** Pickup radius (px, feet to item). */
const PICKUP_RADIUS = 16;
/** Client gunfire is batched into one `zshot` per window (s) to respect the socket budget. */
const SHOT_BATCH_SECONDS = 0.25;
const TRACER_SECONDS = 0.09;
/** A tap during a cooldown (or the equip delay) still fires when it ends. */
const PRESS_BUFFER_SECONDS = 0.35;
const TOAST_SECONDS = 2.2;
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
/** Dead-reckoning speed per wire state index (matches ZOMBIE_STATES order). */
const NET_SPEED = [0, ZOMBIE.wanderSpeed, ZOMBIE.wanderSpeed * 1.6, ZOMBIE.chaseSpeed, 0, 0];

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
  hp = PLAYER_MAX_HP;
  kills = 0;
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
  private readonly targetPopulation: number;
  private readonly worldHeight: number;
  private readonly hordeRng: () => number;
  private lastTargets: SimTarget[] = [];

  // Weapons & loot
  private weapon: WeaponId = 'axe';
  private owned: Set<WeaponId> = new Set(['axe']);
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
  private toast: { text: string; age: number } | null = null;

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
    this.worldHeight = worldHeight;
    this.hordeRng = mulberry32(seed ^ 0x9e3779b9);
    const areaRatio = (worldWidth * worldHeight) / BASE_MAP_AREA;
    this.targetPopulation = Math.min(MAX_POPULATION, Math.round(BASE_POPULATION * Math.sqrt(areaRatio) * 1.1));
  }

  /** Queue a melee swing (applied on the next update). */
  attack() {
    if (this.deadTimer > 0) return;
    this.swingRequested = true;
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
    net.onStrike = (strike, from) => this.remoteStrikes.push({ strike, from });
    net.onDoor = (door, from) => this.remoteDoors.push({ door, from });
    net.onShot = (shot, from) => this.remoteShots.push({ shot, from });
    net.onLoot = (id, from) => this.remoteLoot.push({ id, from });
  }

  // ------------------------------------------------------------ weapons API

  /** Trigger state (F key / fire button). Auto weapons fire while held. */
  setTrigger(down: boolean) {
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

  reload(): boolean {
    const spec = WEAPONS[this.weapon];
    if (!spec.ammo || this.reloadT >= 0 || this.deadTimer > 0) return false;
    if ((this.mags[this.weapon] ?? 0) >= spec.magSize || this.reserve[spec.ammo] <= 0) return false;
    this.reloadT = 0;
    return true;
  }

  /** Movement multiplier from the equipped weapon (machine gun is heavy). */
  moveMultiplier(): number {
    return WEAPONS[this.weapon].moveMul;
  }

  getWeapon(): WeaponId {
    return this.weapon;
  }

  private showToast(text: string) {
    this.toast = { text, age: 0 };
  }

  private pickUp(spawn: LootSpawn) {
    const item = spawn.item;
    if (item.kind === 'weapon') {
      const spec = WEAPONS[item.weapon];
      if (this.owned.has(item.weapon)) {
        // Duplicate gun: strip it for ammo
        if (spec.ammo) this.reserve[spec.ammo] += Math.ceil(AMMO_BOX[spec.ammo] / 2);
        this.showToast(`${spec.icon} ${spec.name} → +ammo`);
      } else {
        this.owned.add(item.weapon);
        this.mags[item.weapon] = startingMag(item.weapon);
        if (this.weapon === 'axe') this.selectWeapon(item.weapon);
        this.showToast(`${spec.icon} Picked up ${spec.name} [${spec.slot}]`);
      }
    } else {
      this.reserve[item.ammo] += AMMO_BOX[item.ammo];
      this.showToast(`📦 +${AMMO_BOX[item.ammo]} ${AMMO_NAMES[item.ammo]}`);
    }
  }

  /** Walk over loot to grab it (optimistic on clients; the host broadcasts what's gone). */
  private updatePickups() {
    if (this.deadTimer > 0) return;
    const r2 = PICKUP_RADIUS * PICKUP_RADIUS;
    for (const l of this.loot) {
      if (this.taken.has(l.id)) continue;
      const dx = l.x - this.feet.x;
      const dy = l.y - (this.feet.y - 4);
      if (dx * dx + dy * dy > r2) continue;
      this.taken.add(l.id);
      this.pickUp(l);
      if (this.authority === 'host') this.changedLoot.add(l.id);
      else this.net?.sendLoot(l.id);
    }
  }

  /** Lose guns and ammo on death (the axe stays). */
  private dropEverything() {
    this.owned = new Set(['axe']);
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
      if (this.reloadT >= spec.reloadSeconds) {
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
    if (!want || this.fireCooldown > 0 || this.deadTimer > 0 || this.reloadT >= 0) return null;
    this.pressAge = 99; // consumed

    const aim = this.aim ?? this.vision.getFacing();
    if (!spec.ammo) {
      this.fireCooldown = spec.cooldown;
      this.swingAge = 0;
      this.swingFacing = aim;
      return { x: this.feet.x, y: this.feet.y - 6, f: aim };
    }

    const mag = this.mags[this.weapon] ?? 0;
    if (mag <= 0) {
      // Dry fire: reload if we can, else a click
      if (!this.reload()) this.showToast(`No ${AMMO_NAMES[spec.ammo]}`);
      this.fireCooldown = 0.3;
      return null;
    }
    this.mags[this.weapon] = mag - 1;
    this.fireCooldown = spec.cooldown;
    this.muzzleAge = 0;
    const angles = shotAngles(spec, aim, this.shotRng).map((a) => Math.round(a * 1000) / 1000);
    const x = Math.round(this.feet.x);
    const y = Math.round(this.feet.y - MUZZLE_LIFT);

    // Tracers from what this client can see (the host's result may differ slightly)
    const targets = this.sim.zombies.map((z) => ({ id: z.id, x: z.x, y: z.y }));
    for (const a of angles) {
      const r = castBullet(this.vision.grid, targets, x, y, a, spec.range);
      this.tracers.push({ x1: x, y1: y, x2: r.endX, y2: r.endY, age: 0 });
    }

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
        if (r.targetId !== null && this.sim.damageZombie(r.targetId, spec.damage, a)) kills++;
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
      }
    }
    return false;
  }

  /** Calls `fn` for each door/window whose tile overlaps the world rect. */
  forEachEntranceIn(left: number, top: number, right: number, bottom: number, fn: (e: Entrance) => void) {
    const g = this.vision.grid;
    const ts = g.tileSize;
    for (const e of g.entrances.values()) {
      const x = e.col * ts;
      const y = e.row * ts;
      if (x + ts >= left && x <= right && y + ts >= top && y <= bottom) fn(e);
    }
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
        if (!e) continue;
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
    if (this.deadTimer > 0) return false;
    const near = this.findNearEntrance();
    if (!near) return false;
    if (action === 'addPlank') {
      // Broken windows/doors can (and should) be boarded up; open ones must be closed first
      if (near.e.state === 'open' || near.e.planks >= MAX_PLANKS) return false;
      this.barricade = { tile: near.tile, t: 0 };
      return true;
    }
    if (applyEntranceAction(near.e, { type: action }) === near.e) return false;
    this.performDoor(near.tile, action);
    return true;
  }

  /** Applies locally (optimistic on clients, authoritative on the host) and forwards to the host. */
  private performDoor(tile: number, action: DoorActionType) {
    this.applyDoor(tile, action);
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
    const base = (id: string) => id.replace(/:\d+$/, '');
    const group = [tile];
    const c = tile % g.cols;
    for (const n of [tile - 1, tile + 1, tile - g.cols, tile + g.cols]) {
      if ((n === tile - 1 && c === 0) || (n === tile + 1 && c === g.cols - 1)) continue;
      const o = g.entrances.get(n);
      if (o && o.kind === 'door' && base(o.id) === base(e.id)) group.push(n);
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

  private takeDamage(amount: number) {
    if (this.deadTimer > 0) return;
    this.hp = Math.max(0, this.hp - amount);
    this.sinceHurt = 0;
    this.hurtFlash = 1;
  }

  /**
   * Advances the mode. Returns 'respawn' on the frame the player should be
   * moved back to spawn after dying.
   */
  update(dt: number, input: ZombieFrameInput): 'respawn' | null {
    this.animTime += dt;
    this.feet = { x: input.feetX, y: input.feetY };
    this.vision.update(dt, input.feetX, input.feetY, input.moveX, input.moveY, input.insideBuildingId);

    const auth = this.resolveAuthority(dt);
    if (auth !== this.authority) {
      // Promoted: continue the horde from the last snapshot we received
      if (auth === 'host') this.sim.adopt();
      if (auth === 'client') this.lastHostSeq = -1;
      this.authority = auth;
      this.snapshotTimer = 0;
      this.remoteStrikes = [];
    }

    // Weapons: melee swing, gunfire, reload (visuals local; damage resolved by the host)
    this.swingAge += dt;
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
      } else if ((this.barricade.t += dt) >= BARRICADE_SECONDS) {
        this.performDoor(this.barricade.tile, 'addPlank');
        this.barricade = null;
      }
    }
    this.nearEntrance = this.findNearEntrance();

    if (this.authority === 'host') {
      this.updateHost(dt, input, swung ? strike : null);
    } else if (this.authority === 'client') {
      if (strike) this.net?.sendStrike(strike);
      this.updateClient(dt);
    }
    this.pendingNoises = this.authority === 'host' ? this.pendingNoises : [];

    this.sinceHurt += dt;
    this.hurtFlash = Math.max(0, this.hurtFlash - dt * 2.5);
    if (this.sinceHurt > REGEN_DELAY && this.hp > 0) {
      this.hp = Math.min(PLAYER_MAX_HP, this.hp + REGEN_PER_SECOND * dt);
    }

    let result: 'respawn' | null = null;
    if (this.hp <= 0 && this.deadTimer <= 0) {
      this.deadTimer = DEATH_SECONDS;
      this.dropEverything();
      if (this.authority === 'host') this.sim.calm();
    } else if (this.deadTimer > 0) {
      this.deadTimer -= dt;
      if (this.deadTimer <= 0) {
        this.hp = PLAYER_MAX_HP;
        this.sinceHurt = 99;
        result = 'respawn';
      }
    }

    this.emitHud();
    return result;
  }

  /** Authoritative simulation: spawning, AI, everyone's strikes, snapshots. */
  private updateHost(dt: number, input: ZombieFrameInput, ownStrike: ZombieStrike | null) {
    const selfId = this.selfId();
    const self: SimTarget = { id: selfId, x: input.feetX, y: input.feetY };
    // Upstairs players are fair game too: zombies follow them up the stairs
    const targets: SimTarget[] = [...input.others];
    if (this.deadTimer <= 0) targets.push(self);
    this.lastTargets = [self, ...input.others];

    // Hordes follow the players: groups spawn just out of sight around each
    // player until their neighbourhood is busy; stragglers far from everyone recycle
    this.respawnTimer -= dt;
    if (this.sim.zombies.length === 0 || this.respawnTimer <= 0) {
      this.respawnTimer = RESPAWN_CHECK_SECONDS;
      this.replenishHordes([self, ...input.others]);
    }

    // Footsteps: ours from input, everyone else's from their movement broadcasts
    const noises = this.pendingNoises;
    this.pendingNoises = [];
    this.footstepTimer -= dt;
    if (this.footstepTimer <= 0) {
      this.footstepTimer = FOOTSTEP_INTERVAL;
      if (input.moveX !== 0 || input.moveY !== 0) {
        noises.push({ x: input.feetX, y: input.feetY, radius: FOOTSTEP_RADIUS });
      }
      for (const o of input.others) {
        if (o.moving) noises.push({ x: o.x, y: o.y, radius: FOOTSTEP_RADIUS });
      }
    }

    // Loot claimed by clients (first come, first served)
    const claims = this.remoteLoot;
    this.remoteLoot = [];
    for (const { id } of claims) {
      if (id < 0 || id >= this.loot.length || this.taken.has(id)) continue;
      this.taken.add(id);
      this.changedLoot.add(id);
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
      const { kills } = this.sim.strike(strike.x, strike.y, strike.f, SWING_RANGE, SWING_ARC, SWING_DAMAGE);
      if (from === selfId) this.kills += kills;
      else if (kills > 0) this.outKills.set(from, (this.outKills.get(from) ?? 0) + kills);
      noises.push({ x: strike.x, y: strike.y, radius: SWING_NOISE_RADIUS });
      if (this.smashWindows(strike)) noises.push({ x: strike.x, y: strike.y, radius: WINDOW_SMASH_NOISE_RADIUS });
    }
    this.resolveShots(noises);

    for (const b of this.sim.tick(dt, targets, noises)) {
      if (b.targetId === selfId) this.takeDamage(b.damage);
      else this.outBites.push([b.targetId, b.damage]);
    }

    // Entrance changes (players or zombies) → sync + vision
    if (this.sim.changedEntrances.size > 0) {
      for (const t of this.sim.changedEntrances) {
        this.changedEntrances.add(t);
        this.dirtyEntrances.add(t);
      }
      this.sim.changedEntrances.clear();
      this.vision.invalidate();
    }

    if (this.net) this.maybeSendSnapshot(dt);
  }

  /** Keeps ~LOCAL_TARGET zombies around every player (ground floors only), in groups. */
  private replenishHordes(players: SimTarget[]) {
    const ground = players.filter((p) => p.y < this.worldHeight);
    this.sim.despawnFar(players, DESPAWN_TILES, GROUP_MAX);
    const localTarget = Math.min(LOCAL_TARGET, this.targetPopulation);
    const cap = Math.min(GLOBAL_CAP, Math.max(this.targetPopulation, localTarget * Math.max(1, ground.length)));
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
  }

  /** Melee shatters closed glass windows in the swing arc. Returns true if any broke. */
  private smashWindows(strike: ZombieStrike): boolean {
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
        if (d > SWING_RANGE) continue;
        let diff = Math.atan2(y - strike.y, x - strike.x) - strike.f;
        diff = Math.atan2(Math.sin(diff), Math.cos(diff));
        if (Math.abs(diff) > SWING_ARC / 2) continue;
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
    const rows: ZombieRow[] = near.map((z) => [
      z.id,
      Math.round(z.x),
      Math.round(z.y),
      Math.round(z.goalX),
      Math.round(z.goalY),
      ZOMBIE_STATES.indexOf(z.state),
      Math.ceil(z.hp),
      z.variant,
    ]);
    const key = JSON.stringify(rows);
    this.entranceResendTimer -= SNAPSHOT_INTERVAL;
    // Someone joined: bring them up to date with doors and taken loot right away
    const members = this.net?.memberCount() ?? 0;
    if (members > this.lastMemberCount) this.entranceResendTimer = 0;
    this.lastMemberCount = members;
    const resendAll = this.entranceResendTimer <= 0 && (this.dirtyEntrances.size > 0 || this.taken.size > 0);
    const hasEvents =
      this.outBites.length > 0 || this.outKills.size > 0 || this.changedEntrances.size > 0 || this.changedLoot.size > 0 || resendAll;
    if (key === this.lastSnapKey && !hasEvents && this.sinceSnapshot < SNAPSHOT_HEARTBEAT) return;

    const snap: ZombieSnapshot = { s: ++this.seq, z: rows };
    const entranceTiles = resendAll ? this.dirtyEntrances : this.changedEntrances;
    if (entranceTiles.size > 0) {
      snap.d = [...entranceTiles].map((t) => this.entranceRow(t)).filter((r): r is EntranceRow => !!r);
    }
    const lootIds = resendAll ? this.taken : this.changedLoot;
    if (lootIds.size > 0) snap.t = [...lootIds];
    if (resendAll) this.entranceResendTimer = ENTRANCE_RESEND_SECONDS;
    this.changedEntrances = new Set();
    this.changedLoot = new Set();
    if (this.outBites.length) snap.b = this.outBites;
    if (this.outKills.size) snap.k = [...this.outKills.entries()];
    this.net?.sendSnapshot(snap);
    this.lastSnapKey = key;
    this.sinceSnapshot = 0;
    this.outBites = [];
    this.outKills = new Map();
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

    const existing = new Map(this.sim.zombies.map((z) => [z.id, z]));
    const next: Zombie[] = [];
    const seen = new Set<number>();
    for (const [id, x, y, goalX, goalY, stateIdx, hp, variant] of snap.z) {
      const state = ZOMBIE_STATES[stateIdx] ?? 'idle';
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
      z.hp = hp;
      z.state = state;
      z.goalX = goalX;
      z.goalY = goalY;
      z.variant = variant;
      this.tracks.set(id, { x, y, goalX, goalY, speed: NET_SPEED[stateIdx] ?? 0 });
      seen.add(id);
      next.push(z);
    }
    for (const id of this.tracks.keys()) if (!seen.has(id)) this.tracks.delete(id);
    this.sim.zombies = next;

    if (snap.d?.length) {
      const g = this.vision.grid;
      for (const [tile, stateIdx, planks, hp] of snap.d) {
        const e = g.entrances.get(tile);
        const state = ENTRANCE_STATES[stateIdx];
        if (!e || !state) continue;
        if (e.state === state && e.planks === planks && e.hp === hp) continue;
        setEntrance(g, { ...e, state, planks, hp });
      }
      this.sim.invalidateFlow();
      this.vision.invalidate();
    }

    for (const id of snap.t ?? []) this.taken.add(id);

    const selfId = this.net.selfId;
    for (const [target, dmg] of snap.b ?? []) if (target === selfId) this.takeDamage(dmg);
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
    const hud: ZombieHud = {
      hp: Math.ceil(this.hp),
      maxHp: PLAYER_MAX_HP,
      alive: this.sim.zombies.length,
      kills: this.kills,
      chasing: this.sim.zombies.filter((z) => z.state === 'chase' || z.state === 'attack').length,
      dead: this.deadTimer > 0,
      entrance: this.nearEntrance
        ? {
            kind: this.nearEntrance.e.kind,
            state: this.nearEntrance.e.state,
            planks: this.nearEntrance.e.planks,
            progress: this.barricade ? Math.min(1, this.barricade.t / BARRICADE_SECONDS) : 0,
          }
        : null,
      weapon: this.weaponHud(),
      owned: WEAPON_ORDER.filter((w) => this.owned.has(w)),
      toast: this.toast?.text ?? null,
    };
    const ent = hud.entrance;
    const wk = `${hud.weapon.id}${hud.weapon.mag}/${hud.weapon.reserve}/${Math.round(hud.weapon.reloading * 10)}|${hud.owned.join(',')}|${hud.toast ?? ''}`;
    const entKey = ent ? `${ent.kind}${ent.state}${ent.planks}${Math.round(ent.progress * 10)}` : '-';
    const key = `${hud.hp}|${hud.alive}|${hud.kills}|${hud.chasing}|${hud.dead}|${entKey}|${wk}`;
    if (key === this.hudKey) return;
    this.hudKey = key;
    this.onHudChanged?.(hud);
  }

  private weaponHud(): WeaponHud {
    const spec = WEAPONS[this.weapon];
    return {
      id: spec.id,
      name: spec.name,
      icon: spec.icon,
      mag: spec.ammo ? (this.mags[this.weapon] ?? 0) : null,
      magSize: spec.magSize,
      reserve: spec.ammo ? this.reserve[spec.ammo] : 0,
      reloading: this.reloadT >= 0 && spec.reloadSeconds > 0 ? Math.min(1, this.reloadT / spec.reloadSeconds) : 0,
    };
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
    const lurch = z.moving ? Math.sin(this.animTime * 6 + z.id) * 1.5 : 0;
    ctx.translate(Math.floor(z.x - 16 + lurch), Math.floor(z.y - 30));
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
    if (z.sinceHit < 0.15 && !sensed) ctx.filter = 'sepia(1) saturate(6) hue-rotate(-50deg) brightness(1.2)';
    renderPixelAvatar(ctx, ZOMBIE_LOOKS[z.variant % ZOMBIE_LOOKS.length], ZOMBIE_SPRITE, toDirection(z.facing), frame);
    ctx.filter = 'none';

    // Health pip bar once damaged
    if (z.hp < 100 && !sensed) {
      ctx.fillStyle = '#111111';
      ctx.fillRect(6, -4, 20, 4);
      ctx.fillStyle = '#EF4444';
      ctx.fillRect(7, -3, Math.max(0, (18 * z.hp) / 100), 2);
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

  private drawSwing(ctx: CanvasRenderingContext2D) {
    const t = this.swingAge / SWING_VISUAL_SECONDS;
    ctx.save();
    ctx.globalAlpha = 1 - t;
    ctx.strokeStyle = '#FDE047';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(this.feet.x, this.feet.y - 6, SWING_RANGE * (0.7 + 0.3 * t), this.swingFacing - SWING_ARC / 2, this.swingFacing + SWING_ARC / 2);
    ctx.stroke();
    ctx.restore();
  }

  /** World-space fog (call after entities, camera transform applied). */
  renderWorld(ctx: CanvasRenderingContext2D) {
    this.vision.render(ctx);
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
    if (l.item.kind === 'ammo') {
      px(-6, -6, 12, 8, '#3F6212');
      px(-6, -6, 12, 2, '#65A30D');
      px(-4, -3, 8, 2, '#FDE047');
      px(-6, 1, 12, 1, '#1A2E05');
    } else {
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

  /** Screen-space overlays: hurt vignette + death fade. */
  renderScreen(ctx: CanvasRenderingContext2D, w: number, h: number) {
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
    this.vision.dispose();
    this.sim.clear();
    this.tracks.clear();
    if (this.net) {
      this.net.onSnapshot = undefined;
      this.net.onStrike = undefined;
      this.net.onDoor = undefined;
      this.net = null;
    }
    this.onHudChanged = undefined;
  }
}
