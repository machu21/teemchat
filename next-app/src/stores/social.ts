import { create } from 'zustand';
import { FriendModel, FriendRequestModel, DirectConversationModel, GroupConversationModel } from '../lib/models/social';
import { AvatarConfig } from '../lib/models/avatar';
import { FriendService } from '../lib/services/friends';
import { DirectMessageService } from '../lib/services/directMessages';
import { GroupChatService } from '../lib/services/groupChat';
import { DashboardPresenceService } from '../lib/services/dashboardPresence';

interface ActiveChatSession {
  type: 'dm' | 'group';
  id: string;
  title: string;
  icon?: string;
  otherUserId?: string;
  avatarConfig?: AvatarConfig;
  statusText?: string;
  isOnline?: boolean;
}

interface SocialStoreState {
  friends: FriendModel[];
  incomingRequests: FriendRequestModel[];
  outgoingRequests: FriendRequestModel[];
  conversations: DirectConversationModel[];
  groups: GroupConversationModel[];
  activeChat: ActiveChatSession | null;
  activeSocialUserId: string | null;
  isDrawerOpen: boolean;
  activeDrawerTab: 'dms' | 'groups' | 'friends';
  isSearchModalOpen: boolean;
  isCreateSquadModalOpen: boolean;
  unreadCount: number;

  initSocial: (userId: string, displayName: string, avatarConfig: AvatarConfig) => Promise<void>;
  cleanupSocial: () => void;
  refreshFriends: (userId: string) => Promise<void>;
  refreshRequests: (userId: string) => Promise<void>;
  refreshConversations: (userId: string) => Promise<void>;
  refreshGroups: (userId: string) => Promise<void>;

  openDrawer: (tab?: 'dms' | 'groups' | 'friends') => void;
  closeDrawer: () => void;
  setActiveDrawerTab: (tab: 'dms' | 'groups' | 'friends') => void;

  openDirectChat: (friend: FriendModel, currentUserId: string) => Promise<void>;
  openGroupChat: (group: GroupConversationModel) => void;
  closeActiveChat: () => void;

  setSearchModalOpen: (open: boolean) => void;
  setCreateSquadModalOpen: (open: boolean) => void;
}

let presenceUnsubscribe: (() => void) | null = null;

export const useSocialStore = create<SocialStoreState>((set, get) => ({
  friends: [],
  incomingRequests: [],
  outgoingRequests: [],
  conversations: [],
  groups: [],
  activeChat: null,
  activeSocialUserId: null,
  isDrawerOpen: false,
  activeDrawerTab: 'dms',
  isSearchModalOpen: false,
  isCreateSquadModalOpen: false,
  unreadCount: 0,

  initSocial: async (userId: string, displayName: string, avatarConfig: AvatarConfig) => {
    if (!userId) return;

    // If already initialized for this exact user, simply update presence without duplicate sockets
    if (get().activeSocialUserId === userId) {
      DashboardPresenceService.updatePresence({
        displayName,
        avatarConfig,
      });
      return;
    }

    set({ activeSocialUserId: userId });

    // Clean up any existing presence subscription callback
    if (presenceUnsubscribe) {
      presenceUnsubscribe();
      presenceUnsubscribe = null;
    }

    // 1. Announce presence on DashboardPresence channel
    DashboardPresenceService.init({
      userId,
      displayName,
      avatarConfig,
      status: 'available',
    });

    // 2. Presence listener to update online status & current space of friends
    presenceUnsubscribe = DashboardPresenceService.subscribe((onlineUsers) => {
      const onlineMap = new Map(onlineUsers.map((u) => [u.userId, u]));
      const currentFriends = get().friends;

      if (currentFriends.length > 0) {
        const updated = currentFriends.map((f) => {
          const presence = onlineMap.get(f.userId);
          return {
            ...f,
            isOnline: Boolean(presence) || f.userId.startsWith('bot-'),
            currentSpace: presence?.currentSpace || f.currentSpace,
            status: presence?.status || f.status,
            statusMessage: presence?.statusMessage || f.statusMessage,
          };
        });
        set({ friends: updated });
      }
    });

    // 3. Load initial datasets
    await Promise.all([
      get().refreshFriends(userId),
      get().refreshRequests(userId),
      get().refreshConversations(userId),
      get().refreshGroups(userId),
    ]);

    // 4. Realtime subscription for requests
    FriendService.subscribeToRequests(userId, () => {
      get().refreshRequests(userId);
    });
  },

  cleanupSocial: () => {
    if (presenceUnsubscribe) {
      presenceUnsubscribe();
      presenceUnsubscribe = null;
    }
    DashboardPresenceService.cleanup();
    FriendService.unsubscribeRequests();
    set({ activeSocialUserId: null });
  },


  refreshFriends: async (userId: string) => {
    const data = await FriendService.getFriends(userId);
    set({ friends: data });
  },

  refreshRequests: async (userId: string) => {
    const { incoming, outgoing } = await FriendService.getPendingRequests(userId);
    set({
      incomingRequests: incoming,
      outgoingRequests: outgoing,
      unreadCount: incoming.length,
    });
  },

  refreshConversations: async (userId: string) => {
    const list = await DirectMessageService.getConversations(userId);
    set({ conversations: list });
  },

  refreshGroups: async (userId: string) => {
    const list = await GroupChatService.getUserGroups(userId);
    set({ groups: list });
  },

  openDrawer: (tab) => {
    set({
      isDrawerOpen: true,
      activeDrawerTab: tab || get().activeDrawerTab,
    });
  },

  closeDrawer: () => {
    set({ isDrawerOpen: false });
  },

  setActiveDrawerTab: (tab) => {
    set({ activeDrawerTab: tab });
  },

  openDirectChat: async (friend: FriendModel, currentUserId: string) => {
    const conversationId = await DirectMessageService.getOrCreateConversation(currentUserId, friend.userId);

    set({
      isDrawerOpen: true,
      activeDrawerTab: 'dms',
      activeChat: {
        type: 'dm',
        id: conversationId,
        title: friend.displayName,
        otherUserId: friend.userId,
        avatarConfig: friend.avatarConfig,
        statusText: friend.currentSpace ? `In ${friend.currentSpace.name}` : friend.statusMessage || (friend.isOnline ? 'Online' : 'Offline'),
        isOnline: friend.isOnline,
      },
    });
  },

  openGroupChat: (group: GroupConversationModel) => {
    set({
      isDrawerOpen: true,
      activeDrawerTab: 'groups',
      activeChat: {
        type: 'group',
        id: group.id,
        title: group.name,
        icon: group.icon,
        statusText: `${group.membersCount} squad members`,
      },
    });
  },

  closeActiveChat: () => {
    set({ activeChat: null });
  },

  setSearchModalOpen: (open: boolean) => {
    set({ isSearchModalOpen: open });
  },

  setCreateSquadModalOpen: (open: boolean) => {
    set({ isCreateSquadModalOpen: open });
  },
}));
