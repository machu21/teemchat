import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createGuestSession, UserSession } from '../src/lib/models/user';
import {
  BETA_FREE_MEMBERSHIP,
  FOUNDING_DISCOUNT,
  MAP_LIMITS,
  PLAN_LIMITS,
  PLAN_NAMES,
  PLAN_PRICES,
  TEAM_SEAT_PRICE,
  actualPlan,
  canUseCallVideo,
  capacityLimitFor,
  effectivePlan,
  hasMemberAccess,
  mapLimitFor,
  membershipLabel,
  planLimits,
  type PlanId,
} from '../src/lib/membership';

let ownedMaps = 0;
const inserted: Record<string, unknown>[] = [];

vi.mock('../src/lib/supabase', () => ({
  supabase: {
    from: () => ({
      select: () => ({
        eq: () =>
          Promise.resolve({
            data: Array.from({ length: ownedMaps }, (_, i) => ({ id: `space-${i}` })),
            error: null,
          }),
      }),
      insert: (payload: Record<string, unknown>) => {
        inserted.push(payload);
        return {
          select: () => ({
            single: () =>
              Promise.resolve({
                data: { ...payload, id: '11111111-1111-4111-8111-111111111111' },
                error: null,
              }),
          }),
        };
      },
      delete: () => ({ eq: () => ({ then: () => undefined }) }),
    }),
  },
}));

import { SpaceService } from '../src/lib/services/spaces';

const ownerId = '22222222-2222-4222-8222-222222222222';

function accountSession(plan: PlanId = 'free', isPaid = plan !== 'free'): UserSession {
  return { ...createGuestSession('Owner'), id: ownerId, isGuest: false, plan, isPaid };
}

describe('membership plan constants', () => {
  it('defines prices, limits, team seats, and founding discount', () => {
    expect(BETA_FREE_MEMBERSHIP).toBe(true);
    expect(PLAN_PRICES).toEqual({
      plus: { month: 4, year: 36 },
      host: { month: 12, year: 108 },
    });
    expect(TEAM_SEAT_PRICE).toEqual({ month: 6, year: 54, minSeats: 5 });
    expect(FOUNDING_DISCOUNT).toBe(0.5);
    expect(PLAN_NAMES).toEqual({ free: 'Free', plus: 'Plus', host: 'Host', team: 'Team' });
    expect(PLAN_LIMITS.free).toEqual({ maps: 1, capacity: 15, callVideo: false });
    expect(PLAN_LIMITS.plus).toEqual({ maps: 10, capacity: 50, callVideo: true });
    expect(PLAN_LIMITS.host).toEqual({ maps: 25, capacity: 150, callVideo: true });
    expect(PLAN_LIMITS.team).toEqual({ maps: 100, capacity: 250, callVideo: true });
  });
});

describe('membership rules (beta on)', () => {
  it('upgrades free accounts to Plus limits, never guests', () => {
    expect(effectivePlan(accountSession('free'), true)).toBe('plus');
    expect(effectivePlan(accountSession('host'), true)).toBe('host');
    expect(effectivePlan(createGuestSession('Guest'), true)).toBe('free');
    expect(effectivePlan(null, true)).toBe('free');

    expect(hasMemberAccess(accountSession('free'), true)).toBe(true);
    expect(hasMemberAccess(createGuestSession('Guest'), true)).toBe(false);
    expect(hasMemberAccess(null, true)).toBe(false);
  });

  it('sets map, capacity, and call video limits in beta', () => {
    expect(mapLimitFor(accountSession('free'), true)).toBe(MAP_LIMITS.member);
    expect(capacityLimitFor(accountSession('free'), true)).toBe(50);
    expect(canUseCallVideo(accountSession('free'), true)).toBe(true);

    expect(mapLimitFor(createGuestSession('Guest'), true)).toBe(MAP_LIMITS.free);
    expect(capacityLimitFor(createGuestSession('Guest'), true)).toBe(15);
    expect(canUseCallVideo(createGuestSession('Guest'), true)).toBe(false);
  });

  it('labels beta, paid, and guest accounts', () => {
    expect(membershipLabel(accountSession('free'), true)).toBe('Beta Member');
    expect(membershipLabel(accountSession('plus'), true)).toBe('Plus Member');
    expect(membershipLabel(accountSession('host'), true)).toBe('Host');
    expect(membershipLabel(accountSession('team'), true)).toBe('Team');
    expect(membershipLabel(createGuestSession('Guest'), true)).toBe('Guest');
  });
});

describe('membership rules (beta off)', () => {
  it('enforces Free limits on unpaid accounts and unlocks paid plans', () => {
    const free = accountSession('free', false);
    const plus = accountSession('plus', true);
    const host = accountSession('host', true);
    const team = accountSession('team', true);
    const guest = createGuestSession('Guest');

    expect(actualPlan(free)).toBe('free');
    expect(effectivePlan(free, false)).toBe('free');
    expect(hasMemberAccess(free, false)).toBe(false);
    expect(mapLimitFor(free, false)).toBe(1);
    expect(capacityLimitFor(free, false)).toBe(15);
    expect(canUseCallVideo(free, false)).toBe(false);
    expect(membershipLabel(free, false)).toBe('Free Account');

    expect(planLimits(plus, false)).toEqual({ maps: 10, capacity: 50, callVideo: true });
    expect(planLimits(host, false)).toEqual({ maps: 25, capacity: 150, callVideo: true });
    expect(planLimits(team, false)).toEqual({ maps: 100, capacity: 250, callVideo: true });
    expect(planLimits(guest, false)).toEqual({ maps: 1, capacity: 15, callVideo: false });
  });
});

describe('SpaceService.createSpace map limit & capacity', () => {
  beforeEach(() => {
    inserted.length = 0;
    ownedMaps = 0;
    SpaceService.clearGuestMaps();
  });

  it('lets an unpaid registered account create a second map during the beta with Plus capacity', async () => {
    ownedMaps = 1;
    await SpaceService.createSpace({ name: 'Second Map', slug: 'second-map' }, accountSession('free'));
    expect(inserted).toHaveLength(1);
    expect(inserted[0].max_capacity).toBe(50);
  });

  it('uses Host capacity (150) when a Host creates a space', async () => {
    await SpaceService.createSpace({ name: 'Big Arena', slug: 'big-arena' }, accountSession('host'));
    expect(inserted).toHaveLength(1);
    expect(inserted[0].max_capacity).toBe(150);
  });

  it('refuses a map past the Plus limit and prompts Host upgrade', async () => {
    ownedMaps = PLAN_LIMITS.plus.maps;
    await expect(
      SpaceService.createSpace({ name: 'One Too Many', slug: 'one-too-many' }, accountSession('free'))
    ).rejects.toThrow(`limit of ${PLAN_LIMITS.plus.maps} maps`);
    expect(inserted).toHaveLength(0);
  });
});
