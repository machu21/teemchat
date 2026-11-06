import { create } from 'zustand';
import { FriendModel, FriendRequestModel, DirectConversationModel, GroupConversationModel } from '../lib/models/social';
import { AvatarConfig } from '../lib/models/avatar';
import { FriendService } from '../lib/services/friends';
import { DirectMessageService } from '../lib/services/directMessages';
import { GroupChatService } from '../lib/services/groupChat';
import { DashboardPresenceService, PresenceUser } from '../lib/services/dashboardPresence';

interface ActiveChatSession {
  type: 'dm' | 'group';
  id: string;
  title: string;
  icon?: string;
  otherUserId?: string;
  avatarConfig?: AvatarConfig;
  statusText?: string;
  /** The friend's saved profile status message, used when presence has none. */
  statusMessage?: string;
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

/**
 * Online status comes only from the dashboard presence channel. The DB has no
 * notion of "online", so anything loaded from it is overlaid with the current
 * presence snapshot — otherwise a refresh would mark closed sessions online.
 */
function applyPresenceToFriends(friends: FriendModel[], onlineMap: Map<string, PresenceUser>): FriendModel[] {
  return friends.map((f) => {
    const presence = onlineMap.get(f.userId);
    return {
      ...f,
      isOnline: Boolean(presence),
      currentSpace: presence ? presence.currentSpace : undefined,
      status: presence?.status || f.status,
      statusMessage: presence?.statusMessage || f.statusMessage,
    };
  });
}

function applyPresenceToConversations(
  conversations: DirectConversationModel[],
  onlineMap: Map<string, PresenceUser>
): DirectConversationModel[] {
  return conversations.map((c) => ({
    ...c,
    otherUser: { ...c.otherUser, isOnline: onlineMap.has(c.otherUser.id) },
  }));
}

function dmStatusText(presence: PresenceUser | undefined, fallbackStatusMessage?: string): string {
  if (presence?.currentSpace) return `In ${presence.currentSpace.name}`;
  return presence?.statusMessage || fallbackStatusMessage || (presence ? 'Online' : 'Offline');
}

/** Keeps an open DM header in step with the other user's live presence. */
function applyPresenceToActiveChat(
  chat: ActiveChatSession | null,
  onlineMap: Map<string, PresenceUser>
): ActiveChatSession | null {
  if (!chat || chat.type !== 'dm' || !chat.otherUserId) return chat;
  const presence = onlineMap.get(chat.otherUserId);
  const isOnline = Boolean(presence);
  const statusText = dmStatusText(presence, chat.statusMessage);
  if (chat.isOnline === isOnline && chat.statusText === statusText) return chat;
  return { ...chat, isOnline, statusText };
}

function currentOnlineMap(): Map<string, PresenceUser> {
  return new Map(DashboardPresenceService.getOnlineUsers().map((u) => [u.userId, u]));
}

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
      set({
        friends: applyPresenceToFriends(get().friends, onlineMap),
        conversations: applyPresenceToConversations(get().conversations, onlineMap),
        activeChat: applyPresenceToActiveChat(get().activeChat, onlineMap),
      });
    });

    // 3. Load initial datasets
    await Promise.all([
      get().refreshFriends(userId),
      get().refreshRequests(userId),
      get().refreshConversations(userId),
      get().refreshGroups(userId),
    ]);

    // 4. Realtime subscription for requests & social events
    FriendService.subscribeToRequests(userId, () => {
      get().refreshRequests(userId);
      get().refreshFriends(userId);
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
    set({ friends: applyPresenceToFriends(data, currentOnlineMap()) });
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
    set({ conversations: applyPresenceToConversations(list, currentOnlineMap()) });
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

    // Status comes from live presence, not the caller's (possibly stale) copy of the friend.
    const chat: ActiveChatSession = {
      type: 'dm',
      id: conversationId,
      title: friend.displayName,
      otherUserId: friend.userId,
      avatarConfig: friend.avatarConfig,
      statusMessage: friend.statusMessage,
    };
    set({
      isDrawerOpen: true,
      activeDrawerTab: 'dms',
      activeChat: applyPresenceToActiveChat(chat, currentOnlineMap()),
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
