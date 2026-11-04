import type { GameState, SessionRole } from './types';
import { difficultyAt } from './difficulty';

// ============================================================
// ZOMBIE MODE — MATCH LIFECYCLE & MOVEMENT INTEGRITY (pure)
// ============================================================

/** Maps `space_members.role` ('owner' | 'admin' | 'moderator' | 'member' | 'guest'). */
export function sessionRoleFromMember(role: string | null | undefined): SessionRole {
  if (role === 'owner' || role === 'admin') return 'ROOM_ADMIN';
  if (role === 'moderator') return 'MOD_OPERATOR';
  return 'SURVIVOR';
}

export function canControlMatch(role: SessionRole): boolean {
  return role === 'ROOM_ADMIN' || role === 'MOD_OPERATOR';
}

export function lobbyState(): GameState {
  return { phase: 'lobby', startedBy: null, startedAtMs: null, elapsed: 0, difficulty: difficultyAt(0), survivors: {}, squads: {}, containers: [], hazards: [] };
}

/**
 * Starts the match. The role must come from the database (RLS-checked),
 * never from a broadcast payload — see the sync notes in the RAG doc.
 */
export function startMatch(s: GameState, userId: string, role: SessionRole, nowMs: number): GameState {
  if (s.phase === 'running' || !canControlMatch(role)) return s;
  return { ...s, phase: 'running', startedBy: userId, startedAtMs: nowMs, elapsed: 0, difficulty: difficultyAt(0) };
}

export function endMatch(s: GameState, role: SessionRole): GameState {
  if (s.phase !== 'running' || !canControlMatch(role)) return s;
  return { ...s, phase: 'ended' };
}

/** Advances the match clock from the shared start time (so a new host resumes the same curve). */
export function syncClock(s: GameState, nowMs: number): GameState {
  if (s.phase !== 'running' || s.startedAtMs === null) return s;
  const elapsed = Math.max(0, (nowMs - s.startedAtMs) / 1000);
  return { ...s, elapsed, difficulty: difficultyAt(elapsed) };
}

// ---------------------------------------------------------------- spatial integrity

export interface MoveSample {
  x: number;
  y: number;
  /** Sender timestamp (ms). */
  t: number;
}

export interface MoveRules {
  /** Fastest legal speed (px/s) — sprint × stimulant × weapon. */
  maxSpeed: number;
  /** Tolerance for jitter / batching (px). */
  slack: number;
  /** Legal discontinuities (stairs portals): returns true if a→b is a portal hop. */
  isPortal?: (ax: number, ay: number, bx: number, by: number) => boolean;
}

/**
 * Host-side check that a survivor moved continuously. Returns the position
 * to accept: the new one if legal, otherwise the furthest legal point along
 * the same direction (rubber-banding instead of trusting a warp).
 */
export function validateMove(prev: MoveSample, next: MoveSample, rules: MoveRules): { x: number; y: number; ok: boolean } {
  const dx = next.x - prev.x;
  const dy = next.y - prev.y;
  const dist = Math.hypot(dx, dy);
  const dt = Math.max(0, Math.min(1, (next.t - prev.t) / 1000));
  const allowed = rules.maxSpeed * dt + rules.slack;
  if (dist <= allowed || rules.isPortal?.(prev.x, prev.y, next.x, next.y)) return { x: next.x, y: next.y, ok: true };
  const k = allowed / dist;
  return { x: prev.x + dx * k, y: prev.y + dy * k, ok: false };
}
