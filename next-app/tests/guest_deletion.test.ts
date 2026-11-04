import { describe, it, expect, vi } from 'vitest';

const ME = '11111111-1111-4111-8111-111111111111';
const LIVE_FRIEND = '22222222-2222-4222-8222-222222222222';
const DELETED_GUEST = '33333333-3333-4333-8333-333333333333';

const mocks = vi.hoisted(() => ({
  tables: {} as Record<string, unknown[]>,
}));

vi.mock('../src/lib/supabase', () => {
  const query = (table: string) => {
    const result = Promise.resolve({ data: mocks.tables[table] ?? [], error: null });
    const builder: Record<string, unknown> = {
      select: () => builder,
      or: () => builder,
      in: () => builder,
      eq: () => builder,
      then: result.then.bind(result),
    };
    return builder;
  };
  return {
    supabase: {
      from: vi.fn((table: string) => query(table)),
    },
    removeRealtimeChannel: vi.fn(),
    cleanupExistingChannel: vi.fn(),
  };
});

import { FriendService } from '../src/lib/services/friends';

describe('Deleted guest friends', () => {
  it('skips friendships whose profile no longer exists', async () => {
    mocks.tables.friendships = [
      { id: 'f1', user_one: ME, user_two: LIVE_FRIEND, created_at: '' },
      { id: 'f2', user_one: DELETED_GUEST, user_two: ME, created_at: '' },
    ];
    mocks.tables.profiles = [{ id: LIVE_FRIEND, username: 'pal', display_name: 'Pal' }];

    const friends = await FriendService.getFriends(ME);
    expect(friends.map((f) => f.userId)).toEqual([LIVE_FRIEND]);
  });
});
