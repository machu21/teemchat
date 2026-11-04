import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createGuestSession, UserSession } from '../src/lib/models/user';

const inserted: Record<string, unknown>[] = [];
const updated: Record<string, unknown>[] = [];
let storedMode: string = 'social';

vi.mock('../src/lib/supabase', () => ({
  supabase: {
    from: () => ({
      select: () => ({
        eq: () => {
          const result = Promise.resolve({ data: [], error: null });
          return Object.assign(result, {
            maybeSingle: () => Promise.resolve({ data: { mode: storedMode }, error: null }),
          });
        },
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
      update: (payload: Record<string, unknown>) => {
        updated.push(payload);
        return { eq: () => Promise.resolve({ error: null }) };
      },
      delete: () => ({ eq: () => ({ then: () => undefined }) }),
    }),
  },
}));

import { SpaceService, mapSpaceRow } from '../src/lib/services/spaces';

const ownerId = '22222222-2222-4222-8222-222222222222';
const spaceId = '33333333-3333-4333-8333-333333333333';

function memberSession(): UserSession {
  return { ...createGuestSession('Owner'), id: ownerId, isGuest: false, isPaid: true };
}

function guestSession(): UserSession {
  return { ...createGuestSession('Guest'), id: ownerId };
}

describe('mapSpaceRow', () => {
  const baseRow = { id: spaceId, name: 'Town', slug: 'town', map_theme: 'cafe' };

  it("defaults mode to 'social' when the row has no mode", () => {
    expect(mapSpaceRow(baseRow).mode).toBe('social');
    expect(mapSpaceRow({ ...baseRow, mode: null }).mode).toBe('social');
  });

  it("passes through 'zombie'", () => {
    const space = mapSpaceRow({ ...baseRow, mode: 'zombie', map_theme: 'zombie_city' });
    expect(space.mode).toBe('zombie');
    expect(space.mapTheme).toBe('zombie_city');
  });

  it('honours an explicit isTemporary override', () => {
    expect(mapSpaceRow({ ...baseRow, is_temporary: true }).isTemporary).toBe(true);
    expect(mapSpaceRow({ ...baseRow, is_temporary: true }, { isTemporary: false }).isTemporary).toBe(false);
  });
});

describe('SpaceService.createSpace mode', () => {
  beforeEach(() => {
    inserted.length = 0;
    SpaceService.clearGuestMaps();
  });

  it("forces the zombie_city map and survival category for mode 'zombie'", async () => {
    const space = await SpaceService.createSpace(
      { name: 'Last Stand', slug: 'last-stand', mapTheme: 'cafe', category: 'Social', mode: 'zombie' },
      memberSession()
    );
    expect(inserted[0].map_theme).toBe('zombie_city');
    expect(inserted[0].category).toBe('survival');
    expect(inserted[0].mode).toBe('zombie');
    expect(space.mode).toBe('zombie');
    expect(space.mapTheme).toBe('zombie_city');
  });

  it('keeps the chosen map and social mode by default', async () => {
    const space = await SpaceService.createSpace(
      { name: 'Cafe Crew', slug: 'cafe-crew', mapTheme: 'cafe' },
      memberSession()
    );
    expect(inserted[0].map_theme).toBe('cafe');
    expect(inserted[0].mode).toBeUndefined();
    expect(space.mode).toBe('social');
  });

  it('keeps zombie mode for guest temporary maps', async () => {
    const space = await SpaceService.createSpace(
      { name: 'Guest Siege', slug: 'guest-siege', mode: 'zombie' },
      guestSession()
    );
    expect(inserted[0].map_theme).toBe('zombie_city');
    expect(space.mode).toBe('zombie');
    expect(SpaceService.getGuestTemporaryMap()?.mode).toBe('zombie');
  });
});

describe('SpaceService.updateSpace on survival spaces', () => {
  beforeEach(() => {
    updated.length = 0;
    SpaceService.clearGuestMaps();
  });

  it('drops map theme changes for survival spaces', async () => {
    storedMode = 'zombie';
    await SpaceService.updateSpace(spaceId, { mapTheme: 'cafe', name: 'Renamed' });
    expect(updated[0].map_theme).toBeUndefined();
    expect(updated[0].name).toBe('Renamed');
  });

  it('still applies map theme changes for social spaces', async () => {
    storedMode = 'social';
    await SpaceService.updateSpace(spaceId, { mapTheme: 'cafe' });
    expect(updated[0].map_theme).toBe('cafe');
  });
});
