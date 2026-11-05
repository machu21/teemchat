import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createGuestSession, UserSession } from '../src/lib/models/user';
import {
  BETA_FREE_MEMBERSHIP,
  MAP_LIMITS,
  hasMemberAccess,
  mapLimitFor,
  membershipLabel,
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

function accountSession(isPaid = false): UserSession {
  return { ...createGuestSession('Owner'), id: ownerId, isGuest: false, isPaid };
}

describe('membership rules (beta)', () => {
  it('runs with free Member access for the beta', () => {
    expect(BETA_FREE_MEMBERSHIP).toBe(true);
  });

  it('gives every registered account Member access, never guests', () => {
    expect(hasMemberAccess(accountSession(false))).toBe(true);
    expect(hasMemberAccess(accountSession(true))).toBe(true);
    expect(hasMemberAccess(createGuestSession('Guest'))).toBe(false);
    expect(hasMemberAccess(null)).toBe(false);
  });

  it('sets map limits by membership', () => {
    expect(mapLimitFor(accountSession(false))).toBe(MAP_LIMITS.member);
    expect(mapLimitFor(createGuestSession('Guest'))).toBe(MAP_LIMITS.free);
  });

  it('labels beta, paid and guest accounts', () => {
    expect(membershipLabel(accountSession(false))).toBe('Beta Member');
    expect(membershipLabel(accountSession(true))).toBe('Paid Member');
    expect(membershipLabel(createGuestSession('Guest'))).toBe('Guest');
  });
});

describe('SpaceService.createSpace map limit', () => {
  beforeEach(() => {
    inserted.length = 0;
    ownedMaps = 0;
    SpaceService.clearGuestMaps();
  });

  it('lets an unpaid registered account create a second map during the beta', async () => {
    ownedMaps = 1;
    await SpaceService.createSpace({ name: 'Second Map', slug: 'second-map' }, accountSession(false));
    expect(inserted).toHaveLength(1);
  });

  it('refuses a map past the Member limit', async () => {
    ownedMaps = MAP_LIMITS.member;
    await expect(
      SpaceService.createSpace({ name: 'One Too Many', slug: 'one-too-many' }, accountSession(false))
    ).rejects.toThrow(`limit of ${MAP_LIMITS.member} maps`);
    expect(inserted).toHaveLength(0);
  });
});
