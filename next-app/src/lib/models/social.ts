import { AvatarConfig } from './avatar';

export interface FriendModel {
  id: string; // Friendship ID or User ID
  userId: string;
  username: string;
  displayName: string;
  status: 'available' | 'away' | 'busy' | 'offline';
  statusMessage?: string;
  avatarConfig: AvatarConfig;
  currentSpace?: {
    slug: string;
    name: string;
  };
  isOnline: boolean;
  lastSeenAt?: string;
}

export interface FriendRequestModel {
  id: string;
  senderId: string;
  receiverId: string;
  status: 'pending' | 'accepted' | 'declined';
  createdAt: string;
  sender?: {
    id: string;
    username: string;
    displayName: string;
    avatarConfig: AvatarConfig;
  };
  receiver?: {
    id: string;
    username: string;
    displayName: string;
    avatarConfig: AvatarConfig;
  };
}

export interface GroupMemberModel {
  id: string;
  conversationId: string;
  userId: string;
  role: 'owner' | 'admin' | 'member';
  displayName: string;
  avatarConfig?: AvatarConfig;
  joinedAt: string;
}

export interface GroupConversationModel {
  id: string;
  name: string;
  icon: string;
  createdBy: string;
  lastMessageAt: string;
  lastPreview?: string;
  membersCount: number;
  members?: GroupMemberModel[];
}

export interface DirectConversationModel {
  id: string;
  userOne: string;
  userTwo: string;
  otherUser: {
    id: string;
    displayName: string;
    username: string;
    avatarConfig: AvatarConfig;
    isOnline: boolean;
    status: 'available' | 'away' | 'busy' | 'offline';
    statusMessage?: string;
  };
  lastMessageAt: string;
  lastPreview?: string;
  unreadCount: number;
}

export interface SocialMessageModel {
  id: string;
  conversationId: string;
  senderId: string;
  senderName: string;
  senderAvatar?: AvatarConfig;
  content: string;
  createdAt: string;
  isGroup: boolean;
}
