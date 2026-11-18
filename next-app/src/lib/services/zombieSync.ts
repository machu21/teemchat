import { RealtimeChannel } from '@supabase/supabase-js';
import { supabase, removeRealtimeChannel, cleanupExistingChannel } from '../supabase';
import type { ContainerRow, ItemRow } from '@/game/zombie/survival/containers';
import type { VehicleRow } from '@/game/zombie/survival/vehicles';
import type { WorldRules } from '@/game/zombie/survival/balance';

// ============================================================
// ZOMBIE MODE — REALTIME SYNC (host-authoritative)
// - Separate channel `space:{id}:zombies` so zombie traffic never
//   competes with movement/chat handlers on `space:{id}:world`
// - Host = longest-present *live* member of this channel's presence
//   (see HostElection: silent hosts are suspected and skipped, and an
//   epoch on every snapshot makes a frozen host that wakes up yield
//   instead of overwriting the horde)
// - Host → all: `zsnap` (~3 Hz, skipped when nothing changed, 1 s heartbeat)
// - Client → host: `zstrike` (melee swings / shoves, ≤2/s), `zdoor` (door/window actions),
//   `zshot` (gunfire, batched ~4/s while shooting), `zloot` (pickups),
//   `zdeath` (where you died and what you carried, so the host can leave a body; rare),
//   `zinv` (take from / put into a container, drop on the ground; acked in `zsnap.ia`),
//   `zbuild` (place / dismantle a structure, claim / release a safehouse, use a utility,
//   board / service a vehicle; acked in `zsnap.ia`)
// - Driver → all: `zveh` (the vehicle they drive, ≤ 2/s; its position between
//   these follows the driver's normal movement broadcasts)
// Budget: the shared socket allows ~10 events/s per client, and
// movement already uses up to 10/s while walking — keep these rare.
// ============================================================

/**
 * One zombie row: [id, x, y, goalX, goalY, stateIndex, hp, variant, kind?, ability?, traits?] (ints).
 * kind = ZOMBIE_KINDS index, ability = ABILITY_FLAGS index (both in game/zombie/survival/types.ts; omitted for idle walkers).
 * traits = packTraits() (game/zombie/survival/zombieTraits.ts); omitted when all normal.
 * Append-only: older clients ignore the trailing elements.
 */
export type ZombieRow = [number, number, number, number, number, number, number, number, number?, number?, number?];

/**
 * One-shot special-infected effect: i = charger impact on `id` (dmg `d`, knockdown),
 * b = bloater burst (damage + gas cloud at x,y), r = dreadnought roar, c = charger breach,
 * a = a building alarm went off at x,y (wails for a minute), n = a noise maker dropped at x,y.
 */
export interface ZombieFx {
  /** i impact · b burst · r roar · c breach · a alarm · n noise maker · g distant gunfire. */
  k: 'i' | 'b' | 'r' | 'c' | 'a' | 'n' | 'g';
  x: number;
  y: number;
  id?: string;
  d?: number;
}

export interface ZombieSnapshot {
  /** Sequence number, monotonic per host. */
  s: number;
  z: ZombieRow[];
  /** Bites this window: [targetClientId, damage]. */
  b?: [string, number][];
  /** Kill credits this window: [strikerClientId, kills]. */
  k?: [string, number][];
  /**
   * Entrances (doors/windows) that differ from the map default:
   * [tileIndex, stateIndex, planks, hp]. Changes since the last snapshot are
   * always included; the full list is resent every few seconds for late joiners.
   */
  d?: EntranceRow[];
  /** Loot ids taken (changes since last snapshot; full list resent periodically). */
  t?: number[];
  /** 1 when `t` is the full taken list (replace, so restocked items reappear for everyone). */
  tf?: 1;
  /** Loot ids restocked since the last snapshot. */
  r?: number[];
  /** Match clock (s) — drives the difficulty curve on every client. */
  el?: number;
  /**
   * Seconds the time of day has been fast-forwarded by the host sleeping alone.
   * Clients show the clock at `el + sk`; difficulty stays on `el`.
   */
  sk?: number;
  /** Corpses on the ground: [id, x, y]. Sent whenever the list changes (full list). */
  c?: [number, number, number][];
  /** Containers whose contents changed (full contents each); resent periodically for late joiners. */
  cs?: ContainerRow[];
  /** Answers to `zinv` / `zbuild` requests: [clientId, requestId, ok 0|1, ...taken item (takes only)]. */
  ia?: InvAck[];
  /**
   * Every built structure: [tile, STRUCTURE_KINDS index, crate container id?], or for generators,
   * rain collectors and campfires [tile, kind, -1, ...state]. Full list when it changes.
   */
  bs?: number[][];
  /** Vehicles that changed (all that differ from their seeded state on the periodic resend). */
  vh?: VehicleRow[];
  /** The world rules (difficulty), when they change and on the periodic resend. Clients sanitise them. */
  cfg?: WorldRules;
  /** Multiplayer sleep: [asleep, total] survivors. */
  sl?: [number, number];
  /** Safehouse claims: [buildingId, owner clientId, survivor name]. Full list when it changes. */
  sh?: [string, string, string][];
  /** Special-infected effects since the last snapshot. */
  x?: ZombieFx[];
}

/** [tileIndex, stateIndex (ENTRANCE_STATES), planks, hp]. */
export type EntranceRow = [number, number, number, number];

/** Gunfire batched by a client (~4 Hz while shooting); the host resolves the bullets. */
export interface ZombieShot {
  x: number;
  y: number;
  /** WeaponId. */
  w: string;
  /** Bullet / pellet angles fired since the last batch (radians, 3 dp). */
  a: number[];
}

/** Player door/window action sent to the host, which validates and applies it. */
export type DoorActionType = 'toggle' | 'lock' | 'unlock' | 'addPlank' | 'removePlank';

export interface ZombieDoorAction {
  /** Entrance tile index (stable: the survival map is fixed). */
  t: number;
  a: DoorActionType;
}

export interface ZombieStrike {
  x: number;
  y: number;
  /** Facing (radians). */
  f: number;
  /** Melee WeaponId (absent: the fire axe). */
  w?: string;
  /** Damage multiplier from the swinger's strength, injuries, crits (the host clamps it). */
  m?: number;
  /** 1 = power attack (sprinting swing with a heavy weapon). */
  h?: 1;
  /** A shove, or a stomp on a downed zombie, instead of a swing; 'lure' drops a noise maker at x, y. */
  k?: 'shove' | 'stomp' | 'lure' | 'ram';
}

/** A client died here; `t` = 1 when the infection killed them (the body will rise). */
export interface ZombieDeath {
  x: number;
  y: number;
  t?: 1;
  /** Everything they carried, left on the body. */
  i?: ItemRow[];
}

/**
 * Inventory request to the host: `o` = 't' take from container `c`, 'p' put into it.
 * `c` = -1 means "the ground at my feet". The host checks reach and stock, then acks.
 */
export interface ZombieInvOp {
  /** Request id (per client). */
  r: number;
  c: number;
  o: 't' | 'p';
  /** The item: [def, qty, cond?, mag?]. For takes, `i` hints the stack index. */
  it: ItemRow;
  i?: number;
}

/**
 * Building request to the host. `o`: 'b' build structure `k` (STRUCTURE_KINDS index) on tile `t`,
 * 'd' dismantle the structure on `t`, 'c' claim building `b` as your safehouse (name `n`), 'u' give it up,
 * 'g' use the utility on `t` (generator, rain collector, campfire, farm plot, snare; action `a`, UTILITY_ACTIONS
 * index; `k` = the relevant skill level; `c` = crop to plant), 'v' board / leave / service vehicle `t`
 * (action `a`, VEHICLE_ACTIONS index; `k` = skill level, `c` = condition 0–100 of the part fitted).
 * For 'b', `l` = the builder's Trapping level (snares). 's' = I'm asleep (`a` 1) / awake (0), for
 * multiplayer sleep; 'r' = an admin changed the world rules (the host re-reads them from the database).
 */
export interface ZombieBuildOp {
  r: number;
  o: 'b' | 'd' | 'c' | 'u' | 'g' | 'v' | 's' | 'r';
  a?: number;
  c?: number;
  l?: number;
  k?: number;
  t?: number;
  b?: string;
  n?: string;
}

/** [clientId, requestId, ok, def?, qty?, cond?, mag?] */
export type InvAck = [string, number, 0 | 1, ...([] | ItemRow)];

export interface PresenceMember {
  key: string;
  joinedAt: number;
}

/** A host silent for this long is presumed gone (frozen tab, ghost presence). */
export const HOST_TIMEOUT_MS = 3500;
const WATCHDOG_MS = 1000;

/**
 * Deterministic host election: the longest-present member wins (ties broken
 * by smallest key). Seniority matters — a newcomer must never take over
 * before it has received the current horde.
 */
export function electHost(members: PresenceMember[]): string | null {
  let best: PresenceMember | null = null;
  for (const m of members) {
    if (!best || m.joinedAt < best.joinedAt || (m.joinedAt === best.joinedAt && m.key < best.key)) best = m;
  }
  return best ? best.key : null;
}

/**
 * Pure host-election state machine (no I/O, unit-tested).
 * - Presence can contain ghosts (a leave that never arrived) and hosts can
 *   freeze (background tabs pause requestAnimationFrame), so a host that
 *   stays silent for HOST_TIMEOUT_MS is suspected and skipped.
 * - Each takeover bumps an epoch carried on every snapshot. Snapshots from an
 *   older epoch are ignored, and a host that hears a newer epoch yields.
 */
export class HostElection {
  hostId: string | null = null;
  /** Highest epoch seen; ours while we're host. */
  epoch = 0;
  private members: PresenceMember[] = [];
  private suspects: Set<string> = new Set();
  private lastHeard: Map<string, number> = new Map();
  private electedAt = 0;

  constructor(readonly selfId: string) {}

  hasMember(key: string): boolean {
    return this.members.some((m) => m.key === key);
  }

  memberCount(): number {
    return this.members.length;
  }

  isHost(): boolean {
    return this.hostId === this.selfId;
  }

  /** Presence changed. Returns true if the host changed. */
  setMembers(members: PresenceMember[], now: number): boolean {
    this.members = members;
    const keys = new Set(members.map((m) => m.key));
    for (const k of this.suspects) if (!keys.has(k)) this.suspects.delete(k);
    for (const k of this.lastHeard.keys()) if (!keys.has(k)) this.lastHeard.delete(k);
    return this.elect(now);
  }

  /** A snapshot arrived. Returns false if it is stale (older epoch) and must be ignored. */
  heard(from: string, epoch: number, now: number): boolean {
    if (epoch < this.epoch) return false;
    if (epoch > this.epoch) {
      this.epoch = epoch;
      // Someone took over while we were frozen: step down
      if (this.isHost()) this.suspects.add(this.selfId);
    }
    this.lastHeard.set(from, now);
    this.suspects.delete(from);
    this.elect(now);
    return true;
  }

  /** Periodic liveness check. Returns true if the host changed. */
  watchdog(now: number): boolean {
    if (!this.hostId || this.isHost()) return false;
    const last = this.lastHeard.get(this.hostId) ?? this.electedAt;
    if (now - last <= HOST_TIMEOUT_MS) return false;
    this.suspects.add(this.hostId);
    return this.elect(now);
  }

  private elect(now: number): boolean {
    const live = this.members.filter((m) => !this.suspects.has(m.key));
    const next = electHost(live.length > 0 ? live : this.members);
    if (next === this.hostId) return false;
    this.hostId = next;
    this.electedAt = now;
    if (next === this.selfId) this.epoch += 1;
    return true;
  }
}

export class ZombieSyncService {
  readonly selfId: string;
  readonly spaceId: string;
  private channel: RealtimeChannel | null = null;
  private isSubscribed = false;
  private isDisposed = false;
  private presenceReady = false;
  private election: HostElection;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private watchdogTimer: ReturnType<typeof setInterval> | null = null;
  private reconnectAttempts = 0;
  private readonly joinedAt = Date.now();

  onSnapshot?: (snap: ZombieSnapshot, fromId: string) => void;
  onStrike?: (strike: ZombieStrike, fromId: string) => void;
  onDoor?: (action: ZombieDoorAction, fromId: string) => void;
  onShot?: (shot: ZombieShot, fromId: string) => void;
  onLoot?: (lootId: number, fromId: string) => void;
  onDeath?: (death: ZombieDeath, fromId: string) => void;
  onInv?: (op: ZombieInvOp, fromId: string) => void;
  onBuild?: (op: ZombieBuildOp, fromId: string) => void;
  /** A driver's vehicle update (everyone listens; `h` = the horn sounded). */
  onVehicle?: (row: VehicleRow, fromId: string, horn: boolean) => void;

  constructor(params: { spaceId: string; clientInstanceId: string }) {
    this.spaceId = params.spaceId;
    this.selfId = params.clientInstanceId;
    this.election = new HostElection(this.selfId);
  }

  connect(): void {
    if (this.isDisposed) return;
    const topic = `space:${this.spaceId}:zombies`;
    try {
      if (this.channel) {
        removeRealtimeChannel(this.channel);
        this.channel = null;
      }
      cleanupExistingChannel(topic);

      const channel = supabase.channel(topic, {
        config: {
          presence: { key: this.selfId },
          broadcast: { self: false, ack: false },
        },
      });
      this.channel = channel;

      channel.on('broadcast', { event: 'zsnap' }, (envelope) => {
        const msg = envelope.payload as { from?: string; e?: number; snap?: ZombieSnapshot } | undefined;
        if (!msg?.from || !msg.snap || msg.from === this.selfId) return;
        if (!this.election.heard(msg.from, typeof msg.e === 'number' ? msg.e : 0, Date.now())) return;
        this.onSnapshot?.(msg.snap, msg.from);
      });

      channel.on('broadcast', { event: 'zstrike' }, (envelope) => {
        const msg = envelope.payload as { from?: string; strike?: ZombieStrike } | undefined;
        if (!msg?.from || !msg.strike || msg.from === this.selfId) return;
        // Only the host simulates; everyone else ignores strikes
        if (!this.isHost()) return;
        this.onStrike?.(msg.strike, msg.from);
      });

      channel.on('broadcast', { event: 'zdoor' }, (envelope) => {
        const msg = envelope.payload as { from?: string; door?: ZombieDoorAction } | undefined;
        if (!msg?.from || !msg.door || msg.from === this.selfId) return;
        if (!this.isHost()) return;
        this.onDoor?.(msg.door, msg.from);
      });

      channel.on('broadcast', { event: 'zshot' }, (envelope) => {
        const msg = envelope.payload as { from?: string; shot?: ZombieShot } | undefined;
        if (!msg?.from || !msg.shot || msg.from === this.selfId || !this.isHost()) return;
        this.onShot?.(msg.shot, msg.from);
      });

      channel.on('broadcast', { event: 'zloot' }, (envelope) => {
        const msg = envelope.payload as { from?: string; i?: number } | undefined;
        if (!msg?.from || typeof msg.i !== 'number' || msg.from === this.selfId || !this.isHost()) return;
        this.onLoot?.(msg.i, msg.from);
      });

      channel.on('broadcast', { event: 'zinv' }, (envelope) => {
        const msg = envelope.payload as { from?: string; op?: ZombieInvOp } | undefined;
        if (!msg?.from || !msg.op || msg.from === this.selfId || !this.isHost()) return;
        const { r, c, o, it } = msg.op;
        if (typeof r !== 'number' || typeof c !== 'number' || (o !== 't' && o !== 'p') || !Array.isArray(it)) return;
        this.onInv?.(msg.op, msg.from);
      });

      channel.on('broadcast', { event: 'zbuild' }, (envelope) => {
        const msg = envelope.payload as { from?: string; op?: ZombieBuildOp } | undefined;
        if (!msg?.from || !msg.op || msg.from === this.selfId || !this.isHost()) return;
        if (typeof msg.op.r !== 'number' || !['b', 'd', 'c', 'u', 'g', 'v', 's', 'r'].includes(msg.op.o)) return;
        this.onBuild?.(msg.op, msg.from);
      });

      channel.on('broadcast', { event: 'zveh' }, (envelope) => {
        const msg = envelope.payload as { from?: string; v?: VehicleRow; h?: 1 } | undefined;
        if (!msg?.from || !Array.isArray(msg.v) || msg.from === this.selfId) return;
        this.onVehicle?.(msg.v, msg.from, msg.h === 1);
      });

      channel.on('broadcast', { event: 'zdeath' }, (envelope) => {
        const msg = envelope.payload as { from?: string; d?: ZombieDeath } | undefined;
        if (!msg?.from || !msg.d || msg.from === this.selfId || !this.isHost()) return;
        if (typeof msg.d.x !== 'number' || typeof msg.d.y !== 'number') return;
        this.onDeath?.(msg.d, msg.from);
      });

      channel.on('presence', { event: 'sync' }, () => this.refreshMembers());
      channel.on('presence', { event: 'join' }, () => this.refreshMembers());
      channel.on('presence', { event: 'leave' }, () => this.refreshMembers());

      channel.subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
          this.isSubscribed = true;
          this.reconnectAttempts = 0;
          try {
            // Stable across reconnects so a host that blips keeps its seniority
            await channel.track({ client_id: this.selfId, joined_at: this.joinedAt });
          } catch (e) {
            console.warn('[ZombieSync] presence track failed:', e);
          }
          this.refreshMembers();
        } else if (status === 'CLOSED' || status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          this.isSubscribed = false;
          this.presenceReady = false;
          this.scheduleReconnect();
        }
      });

      if (!this.watchdogTimer) {
        this.watchdogTimer = setInterval(() => this.election.watchdog(Date.now()), WATCHDOG_MS);
      }
    } catch (e) {
      console.error('[ZombieSync] connect error:', e);
      this.scheduleReconnect();
    }
  }

  private scheduleReconnect() {
    if (this.isDisposed) return;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    const delay = [1000, 2000, 5000][Math.min(this.reconnectAttempts, 2)];
    this.reconnectAttempts++;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      if (this.isDisposed || this.isSubscribed) return;
      this.connect();
    }, delay);
  }

  private refreshMembers() {
    if (!this.channel) return;
    let members: PresenceMember[];
    try {
      const state = this.channel.presenceState() as Record<string, { joined_at?: number }[]>;
      members = Object.entries(state).map(([key, metas]) => ({
        key,
        joinedAt: Math.min(...metas.map((m) => (typeof m.joined_at === 'number' ? m.joined_at : Infinity))),
      }));
    } catch {
      return;
    }
    if (!members.some((m) => m.key === this.selfId)) return; // our own track hasn't landed yet
    this.presenceReady = true;
    this.election.setMembers(members, Date.now());
  }

  /** True once presence includes us and a host has been chosen. */
  isReady(): boolean {
    return this.isSubscribed && this.presenceReady && !!this.election.hostId;
  }

  isHost(): boolean {
    return this.isReady() && this.election.isHost();
  }

  getHostId(): string | null {
    return this.election.hostId;
  }

  /** How many players are in zombie mode here (the host resends full state when this grows). */
  memberCount(): number {
    return this.election.memberCount();
  }

  /** clientInstanceIds currently in zombie mode in this space (zombies only hunt these). */
  isMember(clientId: string): boolean {
    return this.election.hasMember(clientId);
  }

  sendSnapshot(snap: ZombieSnapshot): void {
    if (!this.channel || !this.isHost()) return;
    this.channel
      .send({ type: 'broadcast', event: 'zsnap', payload: { from: this.selfId, e: this.election.epoch, snap } })
      .catch(() => {});
  }

  sendStrike(strike: ZombieStrike): void {
    if (!this.channel || !this.isReady() || this.isHost()) return;
    this.channel
      .send({ type: 'broadcast', event: 'zstrike', payload: { from: this.selfId, strike } })
      .catch(() => {});
  }

  sendShot(shot: ZombieShot): void {
    if (!this.channel || !this.isReady() || this.isHost()) return;
    this.channel
      .send({ type: 'broadcast', event: 'zshot', payload: { from: this.selfId, shot } })
      .catch(() => {});
  }

  sendLoot(lootId: number): void {
    if (!this.channel || !this.isReady() || this.isHost()) return;
    this.channel
      .send({ type: 'broadcast', event: 'zloot', payload: { from: this.selfId, i: lootId } })
      .catch(() => {});
  }

  sendBuild(op: ZombieBuildOp): void {
    if (!this.channel || !this.isReady() || this.isHost()) return;
    this.channel
      .send({ type: 'broadcast', event: 'zbuild', payload: { from: this.selfId, op } })
      .catch(() => {});
  }

  /** The vehicle you're driving (to everyone; the caller keeps this ≤ 2/s). */
  sendVehicle(row: VehicleRow, horn = false): void {
    if (!this.channel || !this.isReady()) return;
    this.channel
      .send({ type: 'broadcast', event: 'zveh', payload: horn ? { from: this.selfId, v: row, h: 1 } : { from: this.selfId, v: row } })
      .catch(() => {});
  }

  sendInv(op: ZombieInvOp): void {
    if (!this.channel || !this.isReady() || this.isHost()) return;
    this.channel
      .send({ type: 'broadcast', event: 'zinv', payload: { from: this.selfId, op } })
      .catch(() => {});
  }

  sendDeath(death: ZombieDeath): void {
    if (!this.channel || !this.isReady() || this.isHost()) return;
    this.channel
      .send({ type: 'broadcast', event: 'zdeath', payload: { from: this.selfId, d: death } })
      .catch(() => {});
  }

  sendDoor(door: ZombieDoorAction): void {
    if (!this.channel || !this.isReady() || this.isHost()) return;
    this.channel
      .send({ type: 'broadcast', event: 'zdoor', payload: { from: this.selfId, door } })
      .catch(() => {});
  }

  disconnect(): void {
    this.isDisposed = true;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.watchdogTimer) {
      clearInterval(this.watchdogTimer);
      this.watchdogTimer = null;
    }
    this.isSubscribed = false;
    this.presenceReady = false;
    this.election = new HostElection(this.selfId);
    if (this.channel) {
      removeRealtimeChannel(this.channel);
      this.channel = null;
    }
    this.onSnapshot = undefined;
    this.onStrike = undefined;
    this.onDoor = undefined;
    this.onShot = undefined;
    this.onLoot = undefined;
    this.onDeath = undefined;
    this.onInv = undefined;
    this.onBuild = undefined;
    this.onVehicle = undefined;
  }
}
