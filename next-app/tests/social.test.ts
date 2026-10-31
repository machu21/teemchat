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

  it('supports temporary guest friendships with localStorage persistence', () => {
    const guestFriend = {
      id: 'temp-friend-1',
      userId: 'guest_9999',
      username: 'guest_9999',
      displayName: 'Explorer #9999',
      status: 'available' as const,
      avatarConfig: {
        skinColor: '#FCD5B5',
        shirtColor: '#3B82F6',
        hairColor: '#37271E',
        hairStyle: 'short' as const,
        accessory: 'none' as const,
      },
      isOnline: true,
      isTemporary: true,
    };

    FriendService.saveTemporaryFriend(guestFriend);
    const tempFriends = FriendService.getTemporaryFriends();
    expect(tempFriends.some((f) => f.userId === 'guest_9999')).toBe(true);

    FriendService.removeTemporaryFriend('guest_9999');
    const updated = FriendService.getTemporaryFriends();
    expect(updated.some((f) => f.userId === 'guest_9999')).toBe(false);
  });

  it('allows guests to send and accept temporary friend requests', async () => {
    const sender = 'guest_1001';
    const receiver = 'guest_1002';

    const sendRes = await FriendService.sendFriendRequest(sender, receiver, {
      displayName: 'Explorer #1001',
    });
    expect(sendRes.success).toBe(true);

    const pending = FriendService.getTemporaryRequests();
    expect(pending.outgoing.some((r) => r.senderId === sender)).toBe(true);

    // Simulate receiver getting and accepting request
    const req = pending.outgoing.find((r) => r.senderId === sender);
    if (req) {
      FriendService.saveTemporaryRequest(req, 'incoming');
      const acceptRes = await FriendService.respondToRequest(req.id, 'accept', {
        userId: receiver,
        displayName: 'Explorer #1002',
      });
      expect(acceptRes).toBe(true);
      const friends = FriendService.getTemporaryFriends();
      expect(friends.some((f) => f.userId === sender)).toBe(true);
      // Clean up
      FriendService.removeTemporaryFriend(sender);
    }
  });
});
