import { describe, it, expect } from 'vitest';
import {
  ageBandFromBirthDate,
  ageOn,
  parseBirthDate,
  restrictionsFor,
  validateBirthDate,
} from '../src/lib/safety/ageBand';

const NOW = new Date(Date.UTC(2026, 10, 7)); // 2026-11-07

describe('ageBand', () => {
  it('parses strict calendar dates only', () => {
    expect(parseBirthDate('2010-02-28')).toEqual({ y: 2010, m: 2, d: 28 });
    expect(parseBirthDate('2010-02-30')).toBeNull();
    expect(parseBirthDate('2010-2-3')).toBeNull();
    expect(parseBirthDate('not a date')).toBeNull();
  });

  it('counts whole years and turns a year older on the birthday', () => {
    expect(ageOn('2013-11-07', NOW)).toBe(13);
    expect(ageOn('2013-11-08', NOW)).toBe(12);
    expect(ageOn('2008-11-07', NOW)).toBe(18);
    expect(ageOn('2008-11-08', NOW)).toBe(17);
  });

  it('maps ages to bands at the 13 and 18 boundaries', () => {
    expect(ageBandFromBirthDate('2013-11-08', NOW)).toBe('child');
    expect(ageBandFromBirthDate('2013-11-07', NOW)).toBe('teen');
    expect(ageBandFromBirthDate('2008-11-08', NOW)).toBe('teen');
    expect(ageBandFromBirthDate('2008-11-07', NOW)).toBe('adult');
    expect(ageBandFromBirthDate(null, NOW)).toBe('unknown');
    expect(ageBandFromBirthDate('garbage', NOW)).toBe('unknown');
  });

  it('rejects future and implausible birth dates', () => {
    expect(validateBirthDate('2027-01-01', NOW)).toMatch(/future/);
    expect(validateBirthDate('1890-01-01', NOW)).toMatch(/real/);
    expect(validateBirthDate('2000-13-01', NOW)).toMatch(/valid/);
    expect(validateBirthDate('2000-06-15', NOW)).toBeNull();
  });

  it('locks every restriction on for children regardless of prefs', () => {
    const r = restrictionsFor('child', { chatFilter: false, dmPrivacy: 'everyone' });
    expect(r).toEqual({
      familyMode: true,
      filterOn: true,
      chatFilterLocked: true,
      dmFriendsOnly: true,
      dmPrivacyLocked: true,
      voiceFriendsOnly: true,
      zombieAllowed: false,
    });
  });

  it('keeps teens and unknown ages on friends-only DMs but lets them toggle the filter', () => {
    for (const band of ['teen', 'unknown'] as const) {
      const r = restrictionsFor(band, { chatFilter: false, dmPrivacy: 'everyone' });
      expect(r.familyMode).toBe(false);
      expect(r.filterOn).toBe(false);
      expect(r.dmFriendsOnly).toBe(true);
      expect(r.dmPrivacyLocked).toBe(true);
      expect(r.zombieAllowed).toBe(true);
    }
  });

  it('lets adults open DMs to everyone', () => {
    const r = restrictionsFor('adult', { chatFilter: true, dmPrivacy: 'everyone' });
    expect(r.dmFriendsOnly).toBe(false);
    expect(r.dmPrivacyLocked).toBe(false);
    expect(r.voiceFriendsOnly).toBe(false);
  });
});
