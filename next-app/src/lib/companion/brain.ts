import { CompanionEventType, LineTemplate, pickLine } from './lines';
import { CompanionSpecies } from './types';

/** Minimum gap between unprompted bubbles. */
export const PROACTIVE_COOLDOWN_MS = 45_000;
/** Per-event-type cooldowns on top of the global one. */
const EVENT_COOLDOWN_MS: Partial<Record<CompanionEventType, number>> = {
  zone_enter: 90_000,
  friend_nearby: 120_000,
  long_session: 45 * 60_000,
  late_night: 60 * 60_000,
};
/** Events that bypass the global cooldown (the owner caused them directly). */
const IMMEDIATE_EVENTS: ReadonlySet<CompanionEventType> = new Set(['tapped', 'guide_arrived', 'reminder_due', 'wake_up']);

export interface CompanionCue extends LineTemplate {
  event: CompanionEventType;
}

export interface CompanionBrainOptions {
  species: CompanionSpecies;
  ownerName: string;
  now?: () => number;
  random?: () => number;
}

/**
 * Decides when the companion speaks up on its own. Pure and synchronous: the
 * caller feeds it world events and renders any cue it returns.
 */
export class CompanionBrain {
  private species: CompanionSpecies;
  private ownerName: string;
  private readonly now: () => number;
  private readonly random: () => number;
  private lastSpokeAt = -Infinity;
  private lastByEvent = new Map<CompanionEventType, number>();
  private greetedFriends = new Set<string>();
  private lastText: string | undefined;
  private muted = false;
  private survival = false;

  constructor(opts: CompanionBrainOptions) {
    this.species = opts.species;
    this.ownerName = opts.ownerName;
    this.now = opts.now ?? (() => Date.now());
    this.random = opts.random ?? Math.random;
  }

  setIdentity(species: CompanionSpecies, ownerName: string) {
    this.species = species;
    this.ownerName = ownerName;
  }

  /** Zombie Survival spaces switch to tense, tactical lines. */
  setSurvival(on: boolean) {
    this.survival = on;
  }

  /** While the owner is typing to the companion, it does not interrupt. */
  setMuted(muted: boolean) {
    this.muted = muted;
  }

  /** Mark that the companion just spoke (e.g. an AI reply) so proactive lines back off. */
  noteSpoke() {
    this.lastSpokeAt = this.now();
  }

  notify(event: CompanionEventType, vars: { zone?: string; name?: string } = {}): CompanionCue | null {
    const t = this.now();
    const immediate = IMMEDIATE_EVENTS.has(event);
    if (this.muted && !immediate) return null;
    if (!immediate && t - this.lastSpokeAt < PROACTIVE_COOLDOWN_MS) return null;

    const eventGap = EVENT_COOLDOWN_MS[event];
    const lastForEvent = this.lastByEvent.get(event);
    if (eventGap && lastForEvent !== undefined && t - lastForEvent < eventGap) return null;

    if (event === 'friend_nearby') {
      const key = (vars.name ?? '').toLowerCase();
      if (!key || this.greetedFriends.has(key)) return null;
      this.greetedFriends.add(key);
    }

    const line = pickLine(this.species, event, { owner: this.ownerName, ...vars }, this.random, this.lastText, this.survival);
    this.lastSpokeAt = t;
    this.lastByEvent.set(event, t);
    this.lastText = line.text;
    return { ...line, event };
  }
}

/** Late night = 23:00–04:59 local. */
export function isLateNight(date: Date): boolean {
  const h = date.getHours();
  return h >= 23 || h < 5;
}
