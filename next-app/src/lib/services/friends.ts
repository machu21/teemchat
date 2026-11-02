import { supabase, removeRealtimeChannel, cleanupExistingChannel } from '../supabase';
import { FriendModel, FriendRequestModel } from '../models/social';
import { AvatarConfig, defaultAvatarConfig, normalizeAvatarConfig } from '../models/avatar';
import { RealtimeChannel } from '@supabase/supabase-js';
import { DashboardPresenceService } from './dashboardPresence';

const UUID_REGEX = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

export class FriendService {
  private static requestsChannel: RealtimeChannel | null = null;
  private static activeUserId: string | null = null;
  private static requestListeners: Set<() => void> = new Set();
  private static memoryTempFriends: FriendModel[] = [];
  private static memoryIncomingRequests: FriendRequestModel[] = [];
  private static memoryOutgoingRequests: FriendRequestModel[] = [];

  static getTemporaryFriends(): FriendModel[] {
    if (typeof localStorage !== 'undefined') {
      try {
        const raw = localStorage.getItem('teem_temporary_friends');
        if (raw) {
          const parsed = JSON.parse(raw);
          // Drop legacy demo bots that older builds let users "befriend"
          if (Array.isArray(parsed)) {
            return parsed.filter((f: FriendModel) => !String(f?.userId).startsWith('bot-'));
          }
        }
      } catch {}
    }
    return this.memoryTempFriends;
  }

  static saveTemporaryFriend(friend: FriendModel): void {
    // Seed from storage so a fresh page load doesn't overwrite previously saved friends
    this.memoryTempFriends = [...this.getTemporaryFriends()];
    if (!this.memoryTempFriends.some((f) => f.userId === friend.userId)) {
      this.memoryTempFriends.push({ ...friend, isTemporary: true });
    }
    if (typeof localStorage !== 'undefined') {
      try {
        localStorage.setItem('teem_temporary_friends', JSON.stringify(this.memoryTempFriends));
      } catch {}
    }
  }

  static removeTemporaryFriend(friendUserId: string): void {
    this.memoryTempFriends = this.getTemporaryFriends().filter((f) => f.userId !== friendUserId);
    if (typeof localStorage !== 'undefined') {
      try {
        localStorage.setItem('teem_temporary_friends', JSON.stringify(this.memoryTempFriends));
      } catch {}
    }
  }

  static getTemporaryRequests(): {
    incoming: FriendRequestModel[];
    outgoing: FriendRequestModel[];
  } {
    if (typeof localStorage !== 'undefined') {
      try {
        const inRaw = localStorage.getItem('teem_temporary_requests_incoming');
        const outRaw = localStorage.getItem('teem_temporary_requests_outgoing');
        const incoming = inRaw ? JSON.parse(inRaw) : this.memoryIncomingRequests;
        const outgoing = outRaw ? JSON.parse(outRaw) : this.memoryOutgoingRequests;
        return {
          incoming: Array.isArray(incoming) ? incoming : [],
          outgoing: Array.isArray(outgoing) ? outgoing : [],
        };
      } catch {}
    }
    return {
      incoming: this.memoryIncomingRequests,
      outgoing: this.memoryOutgoingRequests,
    };
  }

  static saveTemporaryRequest(req: FriendRequestModel, type: 'incoming' | 'outgoing'): void {
    const { incoming, outgoing } = this.getTemporaryRequests();
    if (type === 'incoming') {
      if (!incoming.some((r) => r.id === req.id || r.senderId === req.senderId)) {
        incoming.push(req);
        this.memoryIncomingRequests = incoming;
        if (typeof localStorage !== 'undefined') {
          try {
            localStorage.setItem('teem_temporary_requests_incoming', JSON.stringify(incoming));
          } catch {}
        }
      }
    } else {
      if (!outgoing.some((r) => r.id === req.id || r.receiverId === req.receiverId)) {
        outgoing.push(req);
        this.memoryOutgoingRequests = outgoing;
        if (typeof localStorage !== 'undefined') {
          try {
            localStorage.setItem('teem_temporary_requests_outgoing', JSON.stringify(outgoing));
          } catch {}
        }
      }
    }
  }

  static removeTemporaryRequest(requestId: string): void {
    const { incoming, outgoing } = this.getTemporaryRequests();
    this.memoryIncomingRequests = incoming.filter((r) => r.id !== requestId);
    this.memoryOutgoingRequests = outgoing.filter((r) => r.id !== requestId);
    if (typeof localStorage !== 'undefined') {
      try {
        localStorage.setItem('teem_temporary_requests_incoming', JSON.stringify(this.memoryIncomingRequests));
        localStorage.setItem('teem_temporary_requests_outgoing', JSON.stringify(this.memoryOutgoingRequests));
      } catch {}
    }
  }

  static broadcastSocialEvent(
    type: 'friend_request' | 'friend_response',
    payload: Record<string, unknown>
  ): void {
    const targetUserId = (type === 'friend_request' ? payload.receiverId : payload.senderId) as string;
    if (!targetUserId) return;

    const targetTopic = `social:requests:${targetUserId}`;
    const targetChannel = supabase.channel(targetTopic);
    targetChannel.subscribe((status) => {
      if (status === 'SUBSCRIBED') {
        targetChannel.send({
          type: 'broadcast',
          event: 'social_event',
          payload: { type, payload },
        }).then(() => {
          removeRealtimeChannel(targetChannel);
        });
      }
    });
  }

  static async searchUsers(query: string, currentUserId: string): Promise<Array<{ id: string; username: string; displayName: string; avatarConfig: AvatarConfig }>> {
    const clean = query.trim().toLowerCase().replace(/^@/, '');
    if (!clean) return [];

    // 1. Search online presences from DashboardPresenceService (includes active guest users)
    const onlineMatches = DashboardPresenceService.getOnlineUsers()
      .filter((ou) =>
        ou.userId !== currentUserId &&
        (ou.userId.toLowerCase().includes(clean) ||
          ou.displayName.toLowerCase().includes(clean))
      )
      .map((ou) => ({
        id: ou.userId,
        username: ou.userId.startsWith('guest_') ? ou.userId : `user_${ou.userId.slice(0, 5)}`,
        displayName: ou.displayName,
        avatarConfig: ou.avatarConfig,
      }));

    try {
      let queryBuilder = supabase
        .from('profiles')
        .select('id, username, display_name, avatar_config');

      // Only apply .neq('id', currentUserId) if currentUserId is a valid UUID
      if (UUID_REGEX.test(currentUserId)) {
        queryBuilder = queryBuilder.neq('id', currentUserId);
      }

      const { data, error } = await queryBuilder
        .or(`username.ilike.%${clean}%,display_name.ilike.%${clean}%`)
        .limit(10);

      const dbUsers: Array<{ id: string; username: string; displayName: string; avatarConfig: AvatarConfig }> = [];
      if (!error && data) {
        data.forEach((p) => {
          if (p.id !== currentUserId) {
            dbUsers.push({
              id: p.id,
              username: p.username || 'explorer',
              displayName: p.display_name || p.username || 'Explorer',
              avatarConfig: p.avatar_config || defaultAvatarConfig,
            });
          }
        });
      }

      // Merge and deduplicate by id
      const seen = new Set<string>();
      const combined: Array<{ id: string; username: string; displayName: string; avatarConfig: AvatarConfig }> = [];

      for (const u of [...onlineMatches, ...dbUsers]) {
        if (!seen.has(u.id)) {
          seen.add(u.id);
          combined.push(u);
        }
      }

      // Direct guest handle query fallback (e.g. searching guest_1234 or explorer #1234)
      if (clean.startsWith('guest_') || clean.length === 4) {
        const tag = clean.replace(/^guest_/i, '').toUpperCase();
        const candidateId = `guest_${tag.toLowerCase()}`;
        if (!seen.has(candidateId) && candidateId !== currentUserId) {
          combined.push({
            id: candidateId,
            username: candidateId,
            displayName: `Explorer #${tag}`,
            avatarConfig: defaultAvatarConfig,
          });
        }
      }

      return combined;
    } catch (e) {
      console.warn('Error searching profiles:', e);
      return onlineMatches;
    }
  }

  static async getFriends(currentUserId: string): Promise<FriendModel[]> {
    const tempFriends = this.getTemporaryFriends();

    if (!currentUserId || !UUID_REGEX.test(currentUserId)) {
      return tempFriends;
    }

    try {
      const { data, error } = await supabase
        .from('friendships')
        .select('id, user_one, user_two, created_at')
        .or(`user_one.eq.${currentUserId},user_two.eq.${currentUserId}`);

      if (error || !data || data.length === 0) {
        return tempFriends;
      }

      const friendUserIds = data.map((row) => (row.user_one === currentUserId ? row.user_two : row.user_one));

      const { data: profiles, error: pError } = await supabase
        .from('profiles')
        .select('id, username, display_name, status, status_message, avatar_config, updated_at')
        .in('id', friendUserIds);

      if (pError || !profiles) {
        return tempFriends;
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

      const seen = new Set<string>();
      const combined: FriendModel[] = [];
      for (const f of [...tempFriends, ...results]) {
        if (!seen.has(f.userId)) {
          seen.add(f.userId);
          combined.push(f);
        }
      }

      return combined;
    } catch (e) {
      console.warn('Error fetching friends, falling back to temporary friends:', e);
      return tempFriends;
    }
  }

  /**
   * Realtime broadcasts carry whatever sender the client claims, so an in-space request is only
   * trusted when a matching pending row exists. Returns the DB request (id + sender profile) or null.
   */
  static async verifyIncomingRequest(
    senderId: string,
    receiverId: string
  ): Promise<{ id: string; senderName: string; senderAvatar: AvatarConfig } | null> {
    if (!UUID_REGEX.test(senderId) || !UUID_REGEX.test(receiverId)) return null;
    const { data, error } = await supabase
      .from('friend_requests')
      .select('id, sender:sender_id(display_name, avatar_config)')
      .eq('sender_id', senderId)
      .eq('receiver_id', receiverId)
      .eq('status', 'pending')
      .maybeSingle();
    if (error || !data) return null;
    const sender = (data as unknown as {
      sender: { display_name?: string; avatar_config?: unknown } | null;
    }).sender;
    return {
      id: data.id as string,
      senderName: sender?.display_name || 'Explorer',
      senderAvatar: normalizeAvatarConfig(sender?.avatar_config),
    };
  }

  /** True when the DB records that `receiverId` accepted `senderId`'s request. */
  static async isRequestAccepted(senderId: string, receiverId: string): Promise<boolean> {
    if (!UUID_REGEX.test(senderId) || !UUID_REGEX.test(receiverId)) return false;
    const { data, error } = await supabase
      .from('friend_requests')
      .select('id')
      .eq('sender_id', senderId)
      .eq('receiver_id', receiverId)
      .eq('status', 'accepted')
      .maybeSingle();
    return !error && Boolean(data);
  }

  static async getPendingRequests(currentUserId: string): Promise<{
    incoming: FriendRequestModel[];
    outgoing: FriendRequestModel[];
  }> {
    const rawTemp = this.getTemporaryRequests();
    // Account-to-account requests live in the DB; temp copies from older builds would bypass
    // accept_friend_request, so ignore them.
    const isLocalPair = (r: FriendRequestModel) =>
      !(UUID_REGEX.test(r.senderId) && UUID_REGEX.test(r.receiverId));
    const tempRequests = {
      incoming: rawTemp.incoming.filter(isLocalPair),
      outgoing: rawTemp.outgoing.filter(isLocalPair),
    };

    if (!currentUserId || !UUID_REGEX.test(currentUserId)) {
      return tempRequests;
    }

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

      if (error || !data) return tempRequests;

      const incoming: FriendRequestModel[] = [...tempRequests.incoming];
      const outgoing: FriendRequestModel[] = [...tempRequests.outgoing];
      const seenReqIds = new Set<string>([...incoming.map((r) => r.id), ...outgoing.map((r) => r.id)]);

      (data as unknown as Array<{
        id: string;
        sender_id: string;
        receiver_id: string;
        status: FriendRequestModel['status'];
        created_at: string;
        sender: { id: string; username: string; display_name: string; avatar_config: AvatarConfig } | null;
        receiver: { id: string; username: string; display_name: string; avatar_config: AvatarConfig } | null;
      }>).forEach((row) => {
        if (seenReqIds.has(row.id)) return;
        seenReqIds.add(row.id);

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

  static async sendFriendRequest(
    senderId: string,
    receiverId: string,
    senderProfile?: { displayName?: string; avatarConfig?: AvatarConfig },
    receiverProfile?: { displayName?: string; avatarConfig?: AvatarConfig }
  ): Promise<{ success: boolean; message?: string }> {
    if (senderId === receiverId) {
      return { success: false, message: 'You cannot send a friend request to yourself.' };
    }

    const requestId = `req_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const newOutgoingReq: FriendRequestModel = {
      id: requestId,
      senderId,
      receiverId,
      status: 'pending',
      createdAt: new Date().toISOString(),
      sender: {
        id: senderId,
        username: senderId.startsWith('guest_') ? senderId : 'explorer',
        displayName:
          senderProfile?.displayName ||
          (senderId.startsWith('guest_')
            ? `Explorer #${senderId.replace(/^guest_/i, '').slice(-4).toUpperCase()}`
            : 'Explorer'),
        avatarConfig: senderProfile?.avatarConfig || defaultAvatarConfig,
      },
      receiver: {
        id: receiverId,
        username: receiverId.startsWith('guest_') ? receiverId : 'explorer',
        displayName:
          receiverProfile?.displayName ||
          (receiverId.startsWith('guest_')
            ? `Explorer #${receiverId.replace(/^guest_/i, '').slice(-4).toUpperCase()}`
            : 'Explorer'),
        avatarConfig: receiverProfile?.avatarConfig || defaultAvatarConfig,
      },
    };

    const senderName = newOutgoingReq.sender?.displayName || 'Explorer';
    const senderAvatar = newOutgoingReq.sender?.avatarConfig || defaultAvatarConfig;

    // Account-to-account requests are DB-backed: the DB id is what accept_friend_request needs,
    // so no temporary copy is kept and the broadcast carries the real id.
    if (UUID_REGEX.test(senderId) && UUID_REGEX.test(receiverId)) {
      try {
        const { data, error } = await supabase
          .from('friend_requests')
          .insert({ sender_id: senderId, receiver_id: receiverId, status: 'pending' })
          .select('id')
          .single();

        if (error || !data) {
          if (error?.code === '23505') {
            return { success: false, message: 'Friend request already sent.' };
          }
          console.warn('Friend request insert error notice:', error?.message);
          return { success: false, message: 'Could not send friend request. Please try again.' };
        }

        this.broadcastSocialEvent('friend_request', {
          requestId: data.id,
          senderId,
          senderName,
          senderAvatar,
          receiverId,
          createdAt: newOutgoingReq.createdAt,
        });
        return { success: true, message: 'Friend request sent! 🎉' };
      } catch (e: unknown) {
        console.warn('Notice inserting DB friend request:', e);
        return { success: false, message: 'Could not send friend request. Please try again.' };
      }
    }

    // Local-only guests have no DB rows: keep the request client-side and deliver it by broadcast
    this.saveTemporaryRequest(newOutgoingReq, 'outgoing');
    this.broadcastSocialEvent('friend_request', {
      requestId,
      senderId,
      senderName,
      senderAvatar,
      receiverId,
      createdAt: newOutgoingReq.createdAt,
    });

    return { success: true, message: 'Friend request sent! 🎉' };
  }

  static async respondToRequest(
    requestId: string,
    action: 'accept' | 'decline',
    currentProfile?: { userId: string; displayName?: string; avatarConfig?: AvatarConfig },
    // In-space requests arrive over the world channel, so they may not be in the temp store yet
    fallbackRequest?: { senderId: string; senderName?: string; senderAvatar?: AvatarConfig }
  ): Promise<boolean> {
    try {
      if (UUID_REGEX.test(requestId)) {
        if (action === 'accept') {
          const { data, error } = await supabase.rpc('accept_friend_request', {
            p_request_id: requestId,
          });
          if (error || data !== true) {
            console.warn('accept_friend_request notice:', error?.message || 'request not found');
            return false;
          }
          const senderId =
            fallbackRequest?.senderId ||
            this.getTemporaryRequests().incoming.find((r) => r.id === requestId)?.senderId;
          if (senderId) {
            // Lets the sender's dashboard refresh its friends list right away
            this.broadcastSocialEvent('friend_response', {
              requestId,
              senderId,
              receiverId: currentProfile?.userId,
              receiverName: currentProfile?.displayName || 'Explorer',
              receiverAvatar: currentProfile?.avatarConfig || defaultAvatarConfig,
              action: 'accept',
            });
          }
          return true;
        }

        const { error } = await supabase
          .from('friend_requests')
          .update({ status: 'declined', updated_at: new Date().toISOString() })
          .eq('id', requestId);
        return !error;
      }

      const { incoming } = this.getTemporaryRequests();
      const tempReq = incoming.find((r) => r.id === requestId);
      if (tempReq) this.removeTemporaryRequest(requestId);
      if (action !== 'accept') return true;

      const senderId = tempReq?.senderId || fallbackRequest?.senderId;
      if (!senderId) return false;

      const newFriend: FriendModel = {
        id: `temp_friend_${senderId}_${Date.now()}`,
        userId: senderId,
        username: tempReq?.sender?.username || senderId,
        displayName: tempReq?.sender?.displayName || fallbackRequest?.senderName || 'Explorer',
        status: 'available',
        avatarConfig: tempReq?.sender?.avatarConfig || fallbackRequest?.senderAvatar || defaultAvatarConfig,
        isOnline: true,
        isTemporary: true,
      };
      this.saveTemporaryFriend(newFriend);

      this.broadcastSocialEvent('friend_response', {
        requestId,
        senderId,
        receiverId: tempReq?.receiverId || currentProfile?.userId,
        receiverName: currentProfile?.displayName || 'Explorer',
        receiverAvatar: currentProfile?.avatarConfig || defaultAvatarConfig,
        action: 'accept',
      });

      return true;
    } catch (e) {
      console.warn('Error responding to friend request:', e);
      return false;
    }
  }

  static async removeFriend(friendshipId: string): Promise<boolean> {
    try {
      this.removeTemporaryFriend(friendshipId);

      if (UUID_REGEX.test(friendshipId)) {
        const { error } = await supabase.from('friendships').delete().eq('id', friendshipId);
        return !error;
      }
      return true;
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

    const channel = supabase.channel(topic);

    // Broadcast listener for instant peer-to-peer guest friend events
    channel.on('broadcast', { event: 'social_event' }, (envelope) => {
      try {
        const raw = envelope.payload || envelope;
        const data = (raw.payload && typeof raw.payload === 'object' ? raw.payload : raw) as Record<string, unknown>;
        const type = data.type as string;
        const payload = data.payload as Record<string, unknown>;

        if (type === 'friend_request') {
          if (payload.receiverId === userId) {
            const req: FriendRequestModel = {
              id: payload.requestId as string,
              senderId: payload.senderId as string,
              receiverId: payload.receiverId as string,
              status: 'pending',
              createdAt: (payload.createdAt as string) || new Date().toISOString(),
              sender: {
                id: payload.senderId as string,
                username: payload.senderId as string,
                displayName: (payload.senderName as string) || 'Explorer',
                avatarConfig: normalizeAvatarConfig(payload.senderAvatar),
              },
            };
            FriendService.saveTemporaryRequest(req, 'incoming');
            FriendService.requestListeners.forEach((fn) => {
              try {
                fn();
              } catch {}
            });
          }
        } else if (type === 'friend_response') {
          if (payload.senderId === userId && payload.action === 'accept') {
            // Account users read friendships from the DB; the broadcast only triggers a refresh
            if (UUID_REGEX.test(userId)) {
              FriendService.requestListeners.forEach((fn) => {
                try {
                  fn();
                } catch {}
              });
              return;
            }
            const newFriend: FriendModel = {
              id: `temp_friend_${payload.receiverId}_${Date.now()}`,
              userId: payload.receiverId as string,
              username: payload.receiverId as string,
              displayName: (payload.receiverName as string) || 'Explorer',
              status: 'available',
              avatarConfig: normalizeAvatarConfig(payload.receiverAvatar),
              isOnline: true,
              isTemporary: true,
            };
            FriendService.saveTemporaryFriend(newFriend);
            FriendService.removeTemporaryRequest(payload.requestId as string);
            FriendService.requestListeners.forEach((fn) => {
              try {
                fn();
              } catch {}
            });
          }
        }
      } catch (err) {
        console.warn('Error handling broadcast social_event:', err);
      }
    });

    if (UUID_REGEX.test(userId)) {
      channel.on(
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
      );
    }

    channel.subscribe();

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

