import type { PlayerVitals } from './types';
import type { CharacterCondition } from './condition';

// ============================================================
// ZOMBIE MODE — SLEEP RULES (pure)
// Where you can sleep, when you're allowed to, and what wakes you.
// While asleep the sleeper's own needs run SLEEP.timeScale× faster
// (a night passes in about half a minute). The shared match clock only
// jumps ahead when the sleeper is alone in the match (ZombieMode).
// ============================================================

export type RestKind = 'bed' | 'sofa';
export type SleepSpot = RestKind | 'floor';

/** A bed or sofa from the map (world px, the furniture's collider box). */
export interface RestSpot {
  kind: RestKind;
  x: number;
  y: number;
  w: number;
  h: number;
}

export const SLEEP = {
  /** Personal time multiplier while asleep (and clock speed when alone). */
  timeScale: 40,
  /** Hunger / thirst decay multiplier while asleep (slow metabolism). */
  metabolism: 0.15,
  /** Healing per game hour asleep (× quality), when not starving. */
  healPerGameHour: 6,
  /** Fatigue needed before you can fall asleep. */
  minFatigue: 25,
  /** Can't settle down with a zombie hunting within this many tiles. */
  blockThreatTiles: 15,
  /** A zombie hunting within this many tiles wakes you. */
  wakeThreatTiles: 8,
  maxPanic: 30,
  /** Too hungry / thirsty to sleep below this; woken below `wakeNeeds`. */
  minNeeds: 15,
  wakeNeeds: 8,
  quality: { bed: 1, sofa: 0.8, floor: 0.55 } as Record<SleepSpot, number>,
  /** px from the feet to the furniture's edge. */
  reach: 20,
} as const;

/** The closest bed or sofa within reach of the feet (beds win ties). */
export function nearestRestSpot(spots: readonly RestSpot[], x: number, y: number, reach: number = SLEEP.reach): RestSpot | null {
  let best: RestSpot | null = null;
  let bestD = reach * reach;
  for (const s of spots) {
    const dx = x < s.x ? s.x - x : x > s.x + s.w ? x - (s.x + s.w) : 0;
    const dy = y < s.y ? s.y - y : y > s.y + s.h ? y - (s.y + s.h) : 0;
    const d = dx * dx + dy * dy;
    if (d < bestD || (d === bestD && best?.kind === 'sofa' && s.kind === 'bed')) {
      best = s;
      bestD = d;
    }
  }
  return best;
}

export type SleepBlock = 'dead' | 'notTired' | 'threat' | 'panic' | 'hungry' | 'thirsty' | 'bleeding' | 'pain';

export const SLEEP_BLOCK_TEXT: Record<SleepBlock, string> = {
  dead: '',
  notTired: "You're not tired enough to sleep",
  threat: "Can't sleep — zombies are hunting nearby",
  panic: 'Too panicked to sleep',
  hungry: 'Too hungry to sleep — eat something first',
  thirsty: 'Too thirsty to sleep — drink something first',
  bleeding: "You're bleeding — bandage it before you sleep",
  pain: 'Too much pain to sleep — painkillers would help',
};

/** Pain above this keeps you awake. */
export const SLEEP_MAX_PAIN = 60;

/** Why you can't fall asleep right now (null = you can). */
export function sleepBlock(
  c: CharacterCondition,
  v: PlayerVitals,
  nearestHunterTiles: number,
  body: { bleeding: boolean; pain: number } = { bleeding: false, pain: 0 }
): SleepBlock | null {
  if (v.health <= 0) return 'dead';
  if (nearestHunterTiles <= SLEEP.blockThreatTiles) return 'threat';
  if (body.bleeding) return 'bleeding';
  if (body.pain > SLEEP_MAX_PAIN) return 'pain';
  if (c.panic > SLEEP.maxPanic) return 'panic';
  if (v.hunger < SLEEP.minNeeds) return 'hungry';
  if (v.hydration < SLEEP.minNeeds) return 'thirsty';
  if (c.fatigue < SLEEP.minFatigue) return 'notTired';
  return null;
}

export type WakeReason = 'rested' | 'threat' | 'hurt' | 'hungry' | 'thirsty' | 'manual';

export const WAKE_TEXT: Record<WakeReason, string> = {
  rested: 'You wake up rested',
  threat: 'You jolt awake — something is coming!',
  hurt: 'You wake up screaming!',
  hungry: 'You wake up starving',
  thirsty: 'You wake up parched',
  manual: 'You get up',
};

/** Whether something wakes you this frame (manual waking is handled by the caller). */
export function wakeReason(c: CharacterCondition, v: PlayerVitals, nearestHunterTiles: number, hurt: boolean): WakeReason | null {
  if (hurt) return 'hurt';
  if (nearestHunterTiles <= SLEEP.wakeThreatTiles) return 'threat';
  if (v.hunger < SLEEP.wakeNeeds) return 'hungry';
  if (v.hydration < SLEEP.wakeNeeds) return 'thirsty';
  if (c.fatigue <= 0) return 'rested';
  return null;
}
