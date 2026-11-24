import { describe, it, expect } from 'vitest';
import {
  adModeFor,
  interstitialDue,
  INTERSTITIAL_COOLDOWN_MS,
  type AdEligibilityInput,
} from '../src/lib/ads/eligibility';

const free = { isGuest: false, isPaid: false, plan: 'free' as const };
const guest = { isGuest: true, isPaid: false, plan: 'free' as const };

function input(overrides: Partial<AdEligibilityInput> = {}): AdEligibilityInput {
  return {
    session: free,
    ageBand: 'adult',
    ageBandLoaded: true,
    adsEnabled: true,
    personalizedConsent: false,
    ...overrides,
  };
}

describe('adModeFor', () => {
  it('shows nothing when the kill switch is off', () => {
    expect(adModeFor(input({ adsEnabled: false }))).toBe('none');
  });

  it('shows nothing without a session or before the age band loads', () => {
    expect(adModeFor(input({ session: null }))).toBe('none');
    expect(adModeFor(input({ ageBandLoaded: false }))).toBe('none');
  });

  it('shows nothing to paying accounts', () => {
    for (const plan of ['plus', 'host', 'team'] as const) {
      expect(adModeFor(input({ session: { isGuest: false, isPaid: true, plan } }))).toBe('none');
    }
    expect(adModeFor(input({ session: { isGuest: false, isPaid: true } }))).toBe('none');
  });

  it('never shows ads to children, even guests or with consent', () => {
    expect(adModeFor(input({ ageBand: 'child', personalizedConsent: true }))).toBe('none');
    expect(adModeFor(input({ session: guest, ageBand: 'child' }))).toBe('none');
  });

  it('shows non-personalized ads to guests, teens and unknown ages', () => {
    expect(adModeFor(input({ session: guest, ageBand: 'unknown' }))).toBe('non_personalized');
    expect(adModeFor(input({ ageBand: 'teen', personalizedConsent: true }))).toBe('non_personalized');
    expect(adModeFor(input({ ageBand: 'unknown', personalizedConsent: true }))).toBe('non_personalized');
  });

  it('personalizes only for adults who consented', () => {
    expect(adModeFor(input())).toBe('non_personalized');
    expect(adModeFor(input({ personalizedConsent: true }))).toBe('personalized');
  });

  it('still shows ads to free accounts that get Plus limits during the beta', () => {
    // effectivePlan() would say "plus" for this account during the beta; ads follow actualPlan().
    expect(adModeFor(input({ session: { isGuest: false, isPaid: false } }))).toBe('non_personalized');
  });
});

describe('interstitialDue', () => {
  it('is due the first time and after the cooldown', () => {
    expect(interstitialDue(null)).toBe(true);
    expect(interstitialDue(Number.NaN)).toBe(true);
    expect(interstitialDue(1_000, 1_000 + INTERSTITIAL_COOLDOWN_MS)).toBe(true);
  });

  it('is not due inside the cooldown', () => {
    expect(interstitialDue(1_000, 1_000 + INTERSTITIAL_COOLDOWN_MS - 1)).toBe(false);
  });
});
