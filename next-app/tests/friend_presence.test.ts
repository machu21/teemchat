import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { FriendModel } from '../src/lib/models/social';
import type { PresenceUser } from '../src/lib/services/dashboardPresence';

let onlineUsers: PresenceUser[] = [];
let presenceListener: ((users: PresenceUser[]) => void) | null = null;

vi.mock('../src/lib/services/dashboardPresence', () => ({
  DashboardPresenceService: {
    init: vi.fn(),
    updatePresence: vi.fn(),
    cleanup: vi.fn(),
    getOnlineUsers: () => onlineUsers,
    subscribe: (fn: (users: PresenceUser[]) => void) => {
      presenceListener = fn;
      fn(onlineUsers);
      return () => {
        presenceListener = null;
      };
    },
  },
}));

const matt: FriendModel = {
  id: 'f1',
  userId: 'matt-id',
  username: 'matt',
  displayName: 'Matt',
  status: 'available',
  avatarConfig: {} as FriendModel['avatarConfig'],
  isOnline: true, // stale value from an old load / localStorage temp friend
};

vi.mock('../src/lib/services/friends', () => ({
  FriendService: {
    getFriends: vi.fn(async () => [{ ...matt }]),
    getPendingRequests: vi.fn(async () => ({ incoming: [], outgoing: [] })),
    subscribeToRequests: vi.fn(),
    unsubscribeRequests: vi.fn(),
  },
}));
vi.mock('../src/lib/services/directMessages', () => ({
  DirectMessageService: {
    getConversations: vi.fn(async () => []),
    getOrCreateConversation: vi.fn(async () => 'conv-1'),
  },
}));
vi.mock('../src/lib/services/groupChat', () => ({
  GroupChatService: { getUserGroups: vi.fn(async () => []) },
}));

import { useSocialStore } from '../src/stores/social';

const mattPresence = { userId: 'matt-id', displayName: 'Matt', status: 'available', onlineAt: '' } as PresenceUser;

describe('friend online status', () => {
  beforeEach(() => {
    useSocialStore.getState().cleanupSocial();
    onlineUsers = [];
    presenceListener = null;
  });

  it('shows a friend offline when they have no presence, even if the loaded row says online', async () => {
    await useSocialStore.getState().initSocial('me', 'Me', {} as FriendModel['avatarConfig']);
    expect(useSocialStore.getState().friends[0].isOnline).toBe(false);
  });

  it('follows presence join and leave, and refreshes keep the presence value', async () => {
    await useSocialStore.getState().initSocial('me', 'Me', {} as FriendModel['avatarConfig']);

    onlineUsers = [mattPresence];
    presenceListener?.(onlineUsers);
    expect(useSocialStore.getState().friends[0].isOnline).toBe(true);

    onlineUsers = [];
    presenceListener?.(onlineUsers);
    expect(useSocialStore.getState().friends[0].isOnline).toBe(false);

    await useSocialStore.getState().refreshFriends('me');
    expect(useSocialStore.getState().friends[0].isOnline).toBe(false);
  });

  it('keeps an open DM header in step with presence, ignoring a stale friend copy', async () => {
    await useSocialStore.getState().initSocial('me', 'Me', {} as FriendModel['avatarConfig']);

    // Caller passes a stale "online" friend, but Matt has no presence.
    await useSocialStore.getState().openDirectChat({ ...matt, isOnline: true }, 'me');
    expect(useSocialStore.getState().activeChat).toMatchObject({ isOnline: false, statusText: 'Offline' });

    onlineUsers = [mattPresence];
    presenceListener?.(onlineUsers);
    expect(useSocialStore.getState().activeChat).toMatchObject({ isOnline: true, statusText: 'Online' });

    onlineUsers = [];
    presenceListener?.(onlineUsers);
    expect(useSocialStore.getState().activeChat).toMatchObject({ isOnline: false, statusText: 'Offline' });
  });
});
