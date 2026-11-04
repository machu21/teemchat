import type { DamageType, Relation, Squad } from './types';

// ============================================================
// ZOMBIE MODE — FACTIONS & DAMAGE ROUTING (pure)
// Open PvPvE: anyone not on your team is fair game. Friends from the
// platform friends list are allied automatically; squads are ad-hoc pacts.
// Players are identified by clientInstanceId; friendships are by userId,
// so callers pass a clientInstanceId → userId lookup.
// ============================================================

export const SQUAD_MAX = 4;
export const INVITE_TTL_SECONDS = 30;

export interface FactionContext {
  /** clientInstanceId → userId for everyone in the match. */
  userOf: (clientInstanceId: string) => string | undefined;
  /** userId → set of friend userIds (accepted friendships only). */
  friendsOf: (userId: string) => ReadonlySet<string>;
  /** clientInstanceId → squad id (null if solo). */
  squadOf: (clientInstanceId: string) => string | null;
}

/**
 * Relation of `target` as seen by `viewer`. `target` is a clientInstanceId,
 * or `zombie:<id>` for infected.
 */
export function relationOf(viewer: string, target: string, ctx: FactionContext): Relation {
  if (target.startsWith('zombie:')) return 'INFECTED';
  if (viewer === target) return 'TEAM_ALLY';
  const sq = ctx.squadOf(viewer);
  if (sq !== null && sq === ctx.squadOf(target)) return 'TEAM_ALLY';
  const a = ctx.userOf(viewer);
  const b = ctx.userOf(target);
  if (!a || !b) return 'NEUTRAL_SURVIVOR';
  // Same account in two tabs, or mutual platform friends
  if (a === b || ctx.friendsOf(a).has(b) || ctx.friendsOf(b).has(a)) return 'TEAM_ALLY';
  return 'NEUTRAL_SURVIVOR';
}

/** Multiplier applied to damage dealt by `attacker` to a target of `relation`. */
export function damageMultiplier(relation: Relation, type: DamageType, friendlyFire = false): number {
  switch (relation) {
    case 'INFECTED':
      return 1;
    case 'NEUTRAL_SURVIVOR':
      // PvP is on but softened so a single shotgun blast doesn't one-shot
      return type === 'explosive' ? 0.75 : 0.6;
    case 'TEAM_ALLY':
      // Explosions (bloater bursts) still hurt allies — standing in the gas is your fault
      return friendlyFire || type === 'explosive' || type === 'toxic' ? 0.5 : 0;
  }
}

// ---------------------------------------------------------------- squads

export function createSquad(id: string, leader: string): Squad {
  return { id, leader, members: [leader], invites: {} };
}

export function inviteToSquad(s: Squad, from: string, to: string, now: number): Squad {
  if (!s.members.includes(from) || s.members.includes(to) || s.members.length >= SQUAD_MAX) return s;
  return { ...s, invites: { ...s.invites, [to]: now + INVITE_TTL_SECONDS } };
}

export function acceptInvite(s: Squad, who: string, now: number): Squad {
  const exp = s.invites[who];
  if (exp === undefined || exp < now || s.members.length >= SQUAD_MAX) return s;
  const invites = { ...s.invites };
  delete invites[who];
  return { ...s, members: [...s.members, who], invites };
}

/** Removes a member (leave or betrayal); leadership passes to the next member. Null = disbanded. */
export function leaveSquad(s: Squad, who: string): Squad | null {
  const members = s.members.filter((m) => m !== who);
  if (!members.length) return null;
  return { ...s, members, leader: s.leader === who ? members[0] : s.leader };
}
