/**
 * Membership plans and beta rules.
 *
 * During the beta (BETA_FREE_MEMBERSHIP = true), every registered (non-guest)
 * account gets Plus limits for free. The AI Companion add-on is a separate
 * subscription enforced server-side. Flip BETA_FREE_MEMBERSHIP to false (and
 * update public.billing_settings.beta_free_membership = false) at launch.
 */
export const BETA_FREE_MEMBERSHIP = true;

export type PlanId = 'free' | 'plus' | 'host' | 'team';
export type PaidPlanId = 'plus' | 'host';
export type BillingInterval = 'month' | 'year';

export interface PlanLimits {
  maps: number;
  capacity: number;
  callVideo: boolean;
}

export const PLAN_LIMITS: Record<PlanId, PlanLimits> = {
  free: { maps: 1, capacity: 15, callVideo: false },
  plus: { maps: 10, capacity: 50, callVideo: true },
  host: { maps: 25, capacity: 150, callVideo: true },
  team: { maps: 100, capacity: 250, callVideo: true },
};

export const PLAN_PRICES: Record<PaidPlanId, Record<BillingInterval, number>> = {
  plus: { month: 4, year: 36 },
  host: { month: 12, year: 108 },
};

export const TEAM_SEAT_PRICE = { month: 6, year: 54, minSeats: 5 } as const;

export const FOUNDING_DISCOUNT = 0.5;

export const PLAN_NAMES: Record<PlanId, string> = {
  free: 'Free',
  plus: 'Plus',
  host: 'Host',
  team: 'Team',
};

/** Legacy map-limit constant kept for backwards compatibility. */
export const MAP_LIMITS = { free: PLAN_LIMITS.free.maps, member: PLAN_LIMITS.plus.maps } as const;

export type MembershipSession = {
  isGuest: boolean;
  isPaid: boolean;
  plan?: PlanId;
} | null | undefined;

const VALID_PLANS = new Set<PlanId>(['free', 'plus', 'host', 'team']);

/** The plan the user actually pays for (ignoring beta free-upgrade). */
export function actualPlan(session: MembershipSession): PlanId {
  if (!session || session.isGuest) return 'free';
  if (session.plan && VALID_PLANS.has(session.plan)) return session.plan;
  return session.isPaid ? 'plus' : 'free';
}

/** The plan enforced for limits (free accounts get Plus during beta). */
export function effectivePlan(
  session: MembershipSession,
  betaFreeMembership = BETA_FREE_MEMBERSHIP
): PlanId {
  if (!session || session.isGuest) return 'free';
  const plan = actualPlan(session);
  if (plan === 'free' && betaFreeMembership) return 'plus';
  return plan;
}

export function planLimits(
  session: MembershipSession,
  betaFreeMembership = BETA_FREE_MEMBERSHIP
): PlanLimits {
  return PLAN_LIMITS[effectivePlan(session, betaFreeMembership)];
}

export function hasMemberAccess(
  session: MembershipSession,
  betaFreeMembership = BETA_FREE_MEMBERSHIP
): boolean {
  if (!session || session.isGuest) return false;
  return effectivePlan(session, betaFreeMembership) !== 'free';
}

export function mapLimitFor(
  session: MembershipSession,
  betaFreeMembership = BETA_FREE_MEMBERSHIP
): number {
  return planLimits(session, betaFreeMembership).maps;
}

export function capacityLimitFor(
  session: MembershipSession,
  betaFreeMembership = BETA_FREE_MEMBERSHIP
): number {
  return planLimits(session, betaFreeMembership).capacity;
}

export function canUseCallVideo(
  session: MembershipSession,
  betaFreeMembership = BETA_FREE_MEMBERSHIP
): boolean {
  return planLimits(session, betaFreeMembership).callVideo;
}

/** Short label shown next to the user's name. */
export function membershipLabel(
  session: MembershipSession,
  betaFreeMembership = BETA_FREE_MEMBERSHIP
): string {
  if (!session || session.isGuest) return 'Guest';
  const plan = actualPlan(session);
  if (plan === 'plus') return 'Plus Member';
  if (plan === 'host') return 'Host';
  if (plan === 'team') return 'Team';
  return betaFreeMembership ? 'Beta Member' : 'Free Account';
}
