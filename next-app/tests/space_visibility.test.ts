import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createGuestSession, UserSession } from '../src/lib/models/user';

const inserted: Record<string, unknown>[] = [];

vi.mock('../src/lib/supabase', () => ({
  supabase: {
    from: () => ({
      select: () => ({
        eq: () => Promise.resolve({ data: [], error: null }),
      }),
      insert: (payload: Record<string, unknown>) => {
        inserted.push(payload);
        return {
          select: () => ({
            single: () =>
              Promise.resolve({
                data: {
                  ...payload,
                  id: '11111111-1111-4111-8111-111111111111',
                  join_code: payload.join_code ?? 'RANDOM42',
                },
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

function memberSession(): UserSession {
  return { ...createGuestSession('Owner'), id: ownerId, isGuest: false, isPaid: true };
}

function guestSession(): UserSession {
  return { ...createGuestSession('Guest'), id: ownerId };
}

describe('SpaceService.createSpace visibility', () => {
  beforeEach(() => {
    inserted.length = 0;
    SpaceService.clearGuestMaps();
  });

  it('creates a private space with a DB-generated join code instead of the slug', async () => {
    const space = await SpaceService.createSpace(
      { name: 'Secret Base', slug: 'secret-base', visibility: 'private' },
      memberSession()
    );
    expect(inserted[0].visibility).toBe('private');
    expect(inserted[0].join_code).toBeNull();
    expect(space.visibility).toBe('private');
    expect(space.joinCode).toBe('RANDOM42');
  });

  it('defaults to public and keeps the slug as join code', async () => {
    const space = await SpaceService.createSpace(
      { name: 'Town Square', slug: 'town-square' },
      memberSession()
    );
    expect(inserted[0].visibility).toBe('public');
    expect(inserted[0].join_code).toBe('town-square');
    expect(space.visibility).toBe('public');
  });

  it('keeps the chosen visibility for guest temporary maps', async () => {
    const space = await SpaceService.createSpace(
      { name: 'Guest Hideout', slug: 'guest-hideout', visibility: 'private' },
      guestSession()
    );
    expect(inserted[0].visibility).toBe('private');
    expect(space.visibility).toBe('private');
  });
});
