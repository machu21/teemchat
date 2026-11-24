/**
 * Who sees ads, and what kind.
 *
 * Ads are a Free/Guest-only revenue stream: anyone paying for a plan sees none.
 * The check uses `actualPlan` (what the account pays for), not `effectivePlan`,
 * so the beta's free Plus upgrade does not hide ads.
 *
 * Children (under 13) never see ads (COPPA / Google Families policy). Teens and
 * accounts with no birth date on file get non-personalized ads only. Adults get
 * personalized ads only after they consent (UMP/CMP on top of this).
 */
import { actualPlan, type MembershipSession } from '@/lib/membership';
import type { AgeBand } from '@/lib/safety/ageBand';

export type AdMode = 'none' | 'non_personalized' | 'personalized';

export interface AdEligibilityInput {
  session: MembershipSession;
  ageBand: AgeBand;
  /** False until the viewer's age band has loaded: show nothing while unknown. */
  ageBandLoaded: boolean;
  /** Runtime kill switch: public.billing_settings.ads_enabled. */
  adsEnabled: boolean;
  /** The viewer agreed to personalized ads (consent platform result). */
  personalizedConsent?: boolean;
}

export function adModeFor({
  session,
  ageBand,
  ageBandLoaded,
  adsEnabled,
  personalizedConsent = false,
}: AdEligibilityInput): AdMode {
  if (!adsEnabled || !session || !ageBandLoaded) return 'none';
  if (actualPlan(session) !== 'free') return 'none';
  if (ageBand === 'child') return 'none';
  if (ageBand === 'adult' && personalizedConsent) return 'personalized';
  return 'non_personalized';
}

/** Minimum gap between two interstitials for the same viewer. */
export const INTERSTITIAL_COOLDOWN_MS = 10 * 60 * 1000;

export function interstitialDue(lastShownAt: number | null, now: number = Date.now()): boolean {
  if (lastShownAt === null || !Number.isFinite(lastShownAt)) return true;
  return now - lastShownAt >= INTERSTITIAL_COOLDOWN_MS;
}
