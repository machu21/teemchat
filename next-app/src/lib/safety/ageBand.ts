/**
 * Age bands and the Family Mode restrictions derived from them.
 * Mirrors private.age_band_of() in supabase/migrations/20261110_safety_family_mode.sql:
 * the database is the source of truth, this copy drives the UI.
 */

export type AgeBand = 'child' | 'teen' | 'adult' | 'unknown';
export type DmPrivacy = 'everyone' | 'friends';

export interface SafetyPrefs {
  chatFilter: boolean;
  dmPrivacy: DmPrivacy;
}

export interface SafetyRestrictions {
  /** Under-13 account: every restriction is forced on and cannot be loosened. */
  familyMode: boolean;
  filterOn: boolean;
  chatFilterLocked: boolean;
  dmFriendsOnly: boolean;
  dmPrivacyLocked: boolean;
  /** Only friends' voices are audible in spaces. */
  voiceFriendsOnly: boolean;
  zombieAllowed: boolean;
}

export const DEFAULT_SAFETY_PREFS: SafetyPrefs = { chatFilter: true, dmPrivacy: 'friends' };

export const MIN_AGE = 0;
export const MAX_AGE = 120;

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** Parses a strict YYYY-MM-DD string as a calendar date (no timezone shifting). */
export function parseBirthDate(value: string): { y: number; m: number; d: number } | null {
  const match = ISO_DATE.exec(value.trim());
  if (!match) return null;
  const y = Number(match[1]);
  const m = Number(match[2]);
  const d = Number(match[3]);
  const probe = new Date(Date.UTC(y, m - 1, d));
  if (probe.getUTCFullYear() !== y || probe.getUTCMonth() !== m - 1 || probe.getUTCDate() !== d) {
    return null;
  }
  return { y, m, d };
}

/** Whole years between the birth date and `now` (UTC calendar). Null for invalid dates. */
export function ageOn(birthDate: string, now: Date = new Date()): number | null {
  const parsed = parseBirthDate(birthDate);
  if (!parsed) return null;
  const ny = now.getUTCFullYear();
  const nm = now.getUTCMonth() + 1;
  const nd = now.getUTCDate();
  let age = ny - parsed.y;
  if (nm < parsed.m || (nm === parsed.m && nd < parsed.d)) age -= 1;
  return age;
}

/** Returns an error message, or null when the date is acceptable. */
export function validateBirthDate(birthDate: string, now: Date = new Date()): string | null {
  const age = ageOn(birthDate, now);
  if (age === null) return 'Please enter a valid date.';
  if (age < MIN_AGE) return 'Birth date cannot be in the future.';
  if (age > MAX_AGE) return 'Please enter a real birth date.';
  return null;
}

export function ageBandFromBirthDate(birthDate: string | null | undefined, now: Date = new Date()): AgeBand {
  if (!birthDate) return 'unknown';
  const age = ageOn(birthDate, now);
  if (age === null || age < 0) return 'unknown';
  if (age < 13) return 'child';
  if (age < 18) return 'teen';
  return 'adult';
}

export function isAgeBand(value: unknown): value is AgeBand {
  return value === 'child' || value === 'teen' || value === 'adult' || value === 'unknown';
}

export function restrictionsFor(band: AgeBand, prefs: SafetyPrefs = DEFAULT_SAFETY_PREFS): SafetyRestrictions {
  if (band === 'child') {
    return {
      familyMode: true,
      filterOn: true,
      chatFilterLocked: true,
      dmFriendsOnly: true,
      dmPrivacyLocked: true,
      voiceFriendsOnly: true,
      zombieAllowed: false,
    };
  }
  // Teens and not-yet-verified users keep friends-only DMs (the database enforces it).
  const minor = band !== 'adult';
  return {
    familyMode: false,
    filterOn: prefs.chatFilter,
    chatFilterLocked: false,
    dmFriendsOnly: minor || prefs.dmPrivacy === 'friends',
    dmPrivacyLocked: minor,
    voiceFriendsOnly: false,
    zombieAllowed: true,
  };
}

export const AGE_BAND_LABEL: Record<AgeBand, string> = {
  child: 'Under 13 · Family Mode',
  teen: 'Teen (13–17)',
  adult: 'Adult (18+)',
  unknown: 'Age not set',
};
