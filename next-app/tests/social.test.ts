import { describe, it, expect, vi } from 'vitest';

vi.mock('../src/lib/supabase', () => ({
  supabase: {
    from: vi.fn(() => ({
      select: vi.fn().mockReturnThis(),
      or: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      neq: vi.fn().mockReturnThis(),
      in: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue({ data: [], error: null }),
      maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
      single: vi.fn().mockResolvedValue({ data: null, error: null }),
      insert: vi.fn().mockReturnThis(),
      update: vi.fn().mockReturnThis(),
      delete: vi.fn().mockReturnThis(),
    })),
    channel: vi.fn(() => ({
      on: vi.fn().mockReturnThis(),
      subscribe: vi.fn().mockReturnThis(),
      unsubscribe: vi.fn().mockResolvedValue('ok'),
      track: vi.fn().mockResolvedValue(true),
      teardown: vi.fn(),
    })),
    getChannels: vi.fn(() => []),
    removeChannel: vi.fn().mockResolvedValue('ok'),
  },
  removeRealtimeChannel: vi.fn(),
  cleanupExistingChannel: vi.fn(),
}));

import { FriendService } from '../src/lib/services/friends';
import { DirectMessageService } from '../src/lib/services/directMessages';

describe('Social Hub Unit Tests', () => {
  it('returns demo friends fallback when database returns empty or unmigrated', async () => {
    const friends = await FriendService.getFriends('user-abc');
    expect(friends).toBeDefined();
    expect(friends.length).toBeGreaterThan(0);
    expect(friends[0].displayName).toBeDefined();
  });

  it('generates canonical conversation id deterministically for DMs', async () => {
    const u1 = 'user-1111-aaaa';
    const u2 = 'user-2222-bbbb';

    const convId1 = await DirectMessageService.getOrCreateConversation(u1, u2);
    const convId2 = await DirectMessageService.getOrCreateConversation(u2, u1);

    expect(convId1).toBe(convId2);
    expect(convId1).toContain('local-dm');
  });

  it('rejects sending friend request to oneself', async () => {
    const res = await FriendService.sendFriendRequest('user-self', 'user-self');
    expect(res.success).toBe(false);
    expect(res.message).toContain('yourself');
  });

  it('returns empty list when searching with empty query', async () => {
    const results = await FriendService.searchUsers('   ', 'current-user');
    expect(results).toEqual([]);
  });

  it('subscribes to friend requests idempotently without duplicate errors', () => {
    const cb1 = vi.fn();
    const cb2 = vi.fn();

    const ch1 = FriendService.subscribeToRequests('user-123', cb1);
    expect(ch1).toBeDefined();

    // Calling it again with the same user reuses the active channel without error
    const ch2 = FriendService.subscribeToRequests('user-123', cb2);
    expect(ch2).toBe(ch1);

    // Unsubscribing one listener keeps channel until all listeners are removed
    FriendService.unsubscribeRequests(cb1);
    FriendService.unsubscribeRequests(cb2);
  });
});
