// ============================================================
// ZOMBIE MODE — INTERACTIVE ENTRANCES (doors, windows, barricades)
// - Entrance state lives on the tile grid so FOV, pathfinding and
//   sound propagation all read the same source of truth
// - Pure + engine-agnostic so it can run on a host client or a server
// ============================================================

/**
 * Doors and windows come with the map. Walls and fences are player-built
 * barriers (survival/structures.ts): they reuse the same state machine, so
 * zombies path to them, attack them and break them down like a door.
 */
export type EntranceKind = 'door' | 'window' | 'wall' | 'fence';
export type EntranceState = 'open' | 'closed' | 'locked' | 'barricaded' | 'broken';
/** Wire order for EntranceState (index is sent over the network). Append only. */
export const ENTRANCE_STATES: readonly EntranceState[] = ['open', 'closed', 'locked', 'barricaded', 'broken'];

export interface Entrance {
  id: string;
  kind: EntranceKind;
  col: number;
  row: number;
  state: EntranceState;
  /** Barricade planks remaining (0 when not barricaded). Zombies chew these down. */
  planks: number;
  /** Health of the door/window frame itself; reaching 0 breaks it. */
  hp: number;
  /** Player-built structure kind (survival/structures.ts); absent for the map's own doors and windows. */
  built?: string;
}

/** Walls and fences: can't be opened, locked or boarded. */
export function isBarrier(e: Entrance): boolean {
  return e.kind === 'wall' || e.kind === 'fence';
}

export const MAX_PLANKS = 4;
export const DOOR_HP = 100;
export const WINDOW_HP = 30;

/** Glass is see-through; wood and planks are not. */
export function entranceBlocksSight(e: Entrance): boolean {
  if (e.kind === 'wall') return e.state !== 'broken';
  if (e.kind === 'fence') return false;
  if (e.state === 'barricaded') return true;
  if (e.kind === 'window') return false;
  return e.state === 'closed' || e.state === 'locked';
}

/** Open doors and broken windows/doors can be walked through. */
export function entranceBlocksMovement(e: Entrance): boolean {
  return !(e.state === 'open' || e.state === 'broken');
}

/** Sound multiplier for noise passing through this entrance (1 = no damping). */
export function entranceSoundDamping(e: Entrance): number {
  if (e.kind === 'wall') return e.state === 'broken' ? 1 : 0.15;
  if (e.kind === 'fence') return 0.9;
  switch (e.state) {
    case 'open':
    case 'broken':
      return 1;
    case 'barricaded':
      return 0.35;
    default:
      return e.kind === 'window' ? 0.6 : 0.4;
  }
}

export type EntranceAction =
  | { type: 'toggle' }
  | { type: 'lock' }
  | { type: 'unlock' }
  | { type: 'addPlank' }
  | { type: 'removePlank' }
  | { type: 'damage'; amount: number };

/**
 * Applies an action and returns the next entrance (immutable so the host can
 * diff old vs. new and broadcast only changed entrances).
 * Invalid transitions return the same object reference.
 */
export function applyEntranceAction(e: Entrance, action: EntranceAction): Entrance {
  // Walls and fences only take damage
  if (isBarrier(e) && action.type !== 'damage') return e;
  switch (action.type) {
    case 'toggle':
      if (e.state === 'open') return { ...e, state: 'closed' };
      if (e.state === 'closed') return { ...e, state: 'open' };
      return e;
    case 'lock':
      return e.kind === 'door' && e.state === 'closed' ? { ...e, state: 'locked' } : e;
    case 'unlock':
      return e.state === 'locked' ? { ...e, state: 'closed' } : e;
    case 'addPlank': {
      if (e.state === 'open' || e.planks >= MAX_PLANKS) return e;
      return { ...e, state: 'barricaded', planks: e.planks + 1 };
    }
    case 'removePlank': {
      if (e.state !== 'barricaded') return e;
      const planks = e.planks - 1;
      return { ...e, planks, state: planks > 0 ? 'barricaded' : e.hp > 0 ? 'closed' : 'broken' };
    }
    case 'damage': {
      if (e.state === 'open' || e.state === 'broken' || action.amount <= 0) return e;
      // Planks soak damage first: one plank per 25 damage.
      if (e.state === 'barricaded') {
        const lost = Math.min(e.planks, Math.ceil(action.amount / 25));
        const planks = e.planks - lost;
        return { ...e, planks, state: planks > 0 ? 'barricaded' : e.hp > 0 ? 'closed' : 'broken' };
      }
      const hp = Math.max(0, e.hp - action.amount);
      return { ...e, hp, state: hp === 0 ? 'broken' : e.state };
    }
  }
}
