/**
 * Membership rules (see the billing plan doc).
 *
 * During the beta, every registered (non-guest) account gets Member features for free;
 * the AI add-on is the only paid product and is enforced server-side
 * (check_and_increment_ai_usage). Flip BETA_FREE_MEMBERSHIP to false when the
 * paid Member plan launches.
 */
export const BETA_FREE_MEMBERSHIP = true;

/** Maps an account may own. */
export const MAP_LIMITS = { free: 1, member: 10 } as const;

type MembershipSession = { isGuest: boolean; isPaid: boolean } | null | undefined;

export function hasMemberAccess(session: MembershipSession): boolean {
  if (!session || session.isGuest) return false;
  return session.isPaid || BETA_FREE_MEMBERSHIP;
}

export function mapLimitFor(session: MembershipSession): number {
  return hasMemberAccess(session) ? MAP_LIMITS.member : MAP_LIMITS.free;
}

/** Short label shown next to the user's name. */
export function membershipLabel(session: MembershipSession): string {
  if (!session || session.isGuest) return 'Guest';
  if (session.isPaid) return 'Paid Member';
  return BETA_FREE_MEMBERSHIP ? 'Beta Member' : 'Free Account';
}
