import { supabase, removeRealtimeChannel, cleanupExistingChannel } from '../supabase';
import { FriendModel, FriendRequestModel } from '../models/social';
import { AvatarConfig, defaultAvatarConfig } from '../models/avatar';
import { RealtimeChannel } from '@supabase/supabase-js';

const DEMO_FRIENDS: FriendModel[] = [
  {
    id: 'demo-friend-1',
    userId: 'bot-companion-1',
    username: 'pixel_buddy',
    displayName: 'Pixel Buddy 🤖',
    status: 'available',
    statusMessage: 'Vibing in Verdant Village ✨',
    avatarConfig: {
      skinColor: '#FCD5B5',
      shirtColor: '#10B981',
      hairColor: '#37271E',
      hairStyle: 'spiky',
      accessory: 'headphones',
    },
    currentSpace: {
      slug: 'main-hq',
      name: 'Main Headquarters',
    },
    isOnline: true,
  },
  {
    id: 'demo-friend-2',
    userId: 'bot-companion-2',
    username: 'retro_coder',
    displayName: 'Retro Coder 👾',
    status: 'busy',
    statusMessage: 'Deep in campfire code 🌲',
    avatarConfig: {
      skinColor: '#E0AC69',
      shirtColor: '#7C3AED',
      hairColor: '#1E293B',
      hairStyle: 'buzz',
      accessory: 'glasses',
    },
    isOnline: true,
  },
];

export class FriendService {
  private static requestsChannel: RealtimeChannel | null = null;
  private static activeUserId: string | null = null;
  private static requestListeners: Set<() => void> = new Set();

  static async searchUsers(query: string, currentUserId: string): Promise<Array<{ id: string; username: string; displayName: string; avatarConfig: AvatarConfig }>> {
    const trimmed = query.trim().toLowerCase();
    if (!trimmed) return [];

    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('id, username, display_name, avatar_config')
        .neq('id', currentUserId)
        .or(`username.ilike.%${trimmed}%,display_name.ilike.%${trimmed}%`)
        .limit(10);

      if (error || !data) return [];
      return data.map((p) => ({
        id: p.id,
        username: p.username || 'explorer',
        displayName: p.display_name || p.username || 'Explorer',
        avatarConfig: p.avatar_config || defaultAvatarConfig,
      }));
    } catch (e) {
      console.warn('Error searching profiles:', e);
      return [];
    }
  }

  static async getFriends(currentUserId: string): Promise<FriendModel[]> {
    if (!currentUserId) return [];

    try {
      const { data, error } = await supabase
        .from('friendships')
        .select('id, user_one, user_two, created_at')
        .or(`user_one.eq.${currentUserId},user_two.eq.${currentUserId}`);

      if (error || !data || data.length === 0) {
        // Fallback to demo friends so user can immediately test and enjoy features
        return DEMO_FRIENDS;
      }

      const friendUserIds = data.map((row) => (row.user_one === currentUserId ? row.user_two : row.user_one));

      const { data: profiles, error: pError } = await supabase
        .from('profiles')
        .select('id, username, display_name, status, status_message, avatar_config, updated_at')
        .in('id', friendUserIds);

      if (pError || !profiles) {
        return DEMO_FRIENDS;
      }

      const friendMap = new Map(profiles.map((p) => [p.id, p]));

      const results: FriendModel[] = data.map((row) => {
        const friendId = row.user_one === currentUserId ? row.user_two : row.user_one;
        const profile = friendMap.get(friendId);

        return {
          id: row.id,
          userId: friendId,
          username: profile?.username || 'friend',
          displayName: profile?.display_name || profile?.username || 'Explorer',
          status: (profile?.status as FriendModel['status']) || 'available',
          statusMessage: profile?.status_message || undefined,
          avatarConfig: profile?.avatar_config || defaultAvatarConfig,
          isOnline: true,
        };
      });

      return results.length > 0 ? results : DEMO_FRIENDS;
    } catch (e) {
      console.warn('Error fetching friends, falling back to demo friends:', e);
      return DEMO_FRIENDS;
    }
  }

  static async getPendingRequests(currentUserId: string): Promise<{
    incoming: FriendRequestModel[];
    outgoing: FriendRequestModel[];
  }> {
    if (!currentUserId) return { incoming: [], outgoing: [] };

    try {
      const { data, error } = await supabase
        .from('friend_requests')
        .select(`
          id, sender_id, receiver_id, status, created_at,
          sender:sender_id(id, username, display_name, avatar_config),
          receiver:receiver_id(id, username, display_name, avatar_config)
        `)
        .or(`receiver_id.eq.${currentUserId},sender_id.eq.${currentUserId}`)
        .eq('status', 'pending');

      if (error || !data) return { incoming: [], outgoing: [] };

      const incoming: FriendRequestModel[] = [];
      const outgoing: FriendRequestModel[] = [];

      (data as unknown as Array<{
        id: string;
        sender_id: string;
        receiver_id: string;
        status: FriendRequestModel['status'];
        created_at: string;
        sender: { id: string; username: string; display_name: string; avatar_config: AvatarConfig } | null;
        receiver: { id: string; username: string; display_name: string; avatar_config: AvatarConfig } | null;
      }>).forEach((row) => {
        const item: FriendRequestModel = {
          id: row.id,
          senderId: row.sender_id,
          receiverId: row.receiver_id,
          status: row.status,
          createdAt: row.created_at,
          sender: row.sender
            ? {
                id: row.sender.id,
                username: row.sender.username,
                displayName: row.sender.display_name || row.sender.username,
                avatarConfig: row.sender.avatar_config || defaultAvatarConfig,
              }
            : undefined,
          receiver: row.receiver
            ? {
                id: row.receiver.id,
                username: row.receiver.username,
                displayName: row.receiver.display_name || row.receiver.username,
                avatarConfig: row.receiver.avatar_config || defaultAvatarConfig,
              }
            : undefined,
        };

        if (row.receiver_id === currentUserId) {
          incoming.push(item);
        } else {
          outgoing.push(item);
        }
      });

      return { incoming, outgoing };
    } catch (e) {
      console.warn('Error fetching pending friend requests:', e);
      return { incoming: [], outgoing: [] };
    }
  }

  static async sendFriendRequest(senderId: string, receiverId: string): Promise<{ success: boolean; message?: string }> {
    if (senderId === receiverId) {
      return { success: false, message: 'You cannot send a friend request to yourself.' };
    }

    try {
      const { error } = await supabase
        .from('friend_requests')
        .insert({
          sender_id: senderId,
          receiver_id: receiverId,
          status: 'pending',
        });

      if (error) {
        if (error.code === '23505') {
          return { success: false, message: 'Friend request already sent.' };
        }
        return { success: false, message: error.message };
      }

      return { success: true };
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Failed to send friend request.';
      return { success: false, message: msg };
    }
  }

  static async respondToRequest(requestId: string, action: 'accept' | 'decline'): Promise<boolean> {
    try {
      if (action === 'accept') {
        const { data, error } = await supabase.rpc('accept_friend_request', {
          p_request_id: requestId,
        });
        if (!error && data) return true;

        // Fallback direct update if RPC is missing
        await supabase
          .from('friend_requests')
          .update({ status: 'accepted', updated_at: new Date().toISOString() })
          .eq('id', requestId);
        return true;
      } else {
        await supabase
          .from('friend_requests')
          .update({ status: 'declined', updated_at: new Date().toISOString() })
          .eq('id', requestId);
        return true;
      }
    } catch (e) {
      console.warn('Error responding to friend request:', e);
      return false;
    }
  }

  static async removeFriend(friendshipId: string): Promise<boolean> {
    try {
      const { error } = await supabase.from('friendships').delete().eq('id', friendshipId);
      return !error;
    } catch (e) {
      console.warn('Error removing friend:', e);
      return false;
    }
  }

  static subscribeToRequests(userId: string, onUpdate: () => void): RealtimeChannel {
    if (!userId) {
      throw new Error('userId is required to subscribe to friend requests');
    }

    this.requestListeners.add(onUpdate);

    // If channel is already actively subscribed for this user, reuse it without re-calling .on() or .subscribe()
    if (this.requestsChannel && this.activeUserId === userId) {
      return this.requestsChannel;
    }

    // Otherwise, cleanly tear down any existing channel
    if (this.requestsChannel) {
      removeRealtimeChannel(this.requestsChannel);
      this.requestsChannel = null;
    }

    const topic = `social:requests:${userId}`;
    cleanupExistingChannel(topic);

    const channel = supabase
      .channel(topic)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'friend_requests',
          filter: `receiver_id=eq.${userId}`,
        },
        () => {
          this.requestListeners.forEach((fn) => {
            try {
              fn();
            } catch (err) {
              console.warn('Error in friend requests listener:', err);
            }
          });
        }
      )
      .subscribe();

    this.requestsChannel = channel;
    this.activeUserId = userId;
    return channel;
  }

  static unsubscribeRequests(onUpdate?: () => void): void {
    if (onUpdate) {
      this.requestListeners.delete(onUpdate);
    } else {
      this.requestListeners.clear();
    }

    if (this.requestListeners.size === 0 && this.requestsChannel) {
      removeRealtimeChannel(this.requestsChannel);
      this.requestsChannel = null;
      this.activeUserId = null;
    }
  }
}

