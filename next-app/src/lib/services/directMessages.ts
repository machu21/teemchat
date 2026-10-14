import { supabase } from '../supabase';
import { DirectConversationModel, SocialMessageModel } from '../models/social';
import { defaultAvatarConfig } from '../models/avatar';
import { RealtimeChannel } from '@supabase/supabase-js';

export class DirectMessageService {
  private static localMessageCache: Map<string, SocialMessageModel[]> = new Map();

  static async getOrCreateConversation(currentUserId: string, otherUserId: string): Promise<string> {
    const [u1, u2] = currentUserId < otherUserId ? [currentUserId, otherUserId] : [otherUserId, currentUserId];

    try {
      const { data, error } = await supabase
        .from('buddy_conversations')
        .select('id')
        .eq('user_one', u1)
        .eq('user_two', u2)
        .maybeSingle();

      if (data?.id) return data.id;

      const { data: created, error: cErr } = await supabase
        .from('buddy_conversations')
        .insert({
          user_one: u1,
          user_two: u2,
          last_preview: 'Conversation started',
        })
        .select('id')
        .single();

      if (created?.id) return created.id;
    } catch (e) {
      console.warn('Error with buddy conversation, fallback to deterministic id:', e);
    }

    return `local-dm-${u1.slice(0, 8)}-${u2.slice(0, 8)}`;
  }

  static async getConversations(currentUserId: string): Promise<DirectConversationModel[]> {
    if (!currentUserId) return [];

    try {
      const { data, error } = await supabase
        .from('buddy_conversations')
        .select('*')
        .or(`user_one.eq.${currentUserId},user_two.eq.${currentUserId}`)
        .order('last_message_at', { ascending: false });

      if (error || !data || data.length === 0) return [];

      const otherUserIds = data.map((c) => (c.user_one === currentUserId ? c.user_two : c.user_one));

      const { data: profiles } = await supabase
        .from('profiles')
        .select('id, username, display_name, status, status_message, avatar_config')
        .in('id', otherUserIds);

      const pMap = new Map((profiles || []).map((p) => [p.id, p]));

      return data.map((c) => {
        const otherId = c.user_one === currentUserId ? c.user_two : c.user_one;
        const profile = pMap.get(otherId);

        return {
          id: c.id,
          userOne: c.user_one,
          userTwo: c.user_two,
          otherUser: {
            id: otherId,
            displayName: profile?.display_name || profile?.username || 'Explorer',
            username: profile?.username || 'explorer',
            avatarConfig: profile?.avatar_config || defaultAvatarConfig,
            isOnline: true,
            status: (profile?.status as any) || 'available',
            statusMessage: profile?.status_message || undefined,
          },
          lastMessageAt: c.last_message_at,
          lastPreview: c.last_preview || 'No messages yet',
          unreadCount: 0,
        };
      });
    } catch (e) {
      console.warn('Error fetching buddy conversations:', e);
      return [];
    }
  }

  static async fetchMessages(conversationId: string): Promise<SocialMessageModel[]> {
    try {
      const { data, error } = await supabase
        .from('direct_messages')
        .select('*, sender:sender_id(display_name, avatar_config)')
        .eq('conversation_id', conversationId)
        .order('created_at', { ascending: true })
        .limit(100);

      if (error || !data) {
        return this.localMessageCache.get(conversationId) || [];
      }

      const list: SocialMessageModel[] = data.map((row: any) => ({
        id: row.id,
        conversationId: row.conversation_id,
        senderId: row.sender_id,
        senderName: row.sender?.display_name || 'Explorer',
        senderAvatar: row.sender?.avatar_config || defaultAvatarConfig,
        content: row.content,
        createdAt: row.created_at,
        isGroup: false,
      }));

      this.localMessageCache.set(conversationId, list);
      return list;
    } catch (e) {
      return this.localMessageCache.get(conversationId) || [];
    }
  }

  static async sendMessage(params: {
    conversationId: string;
    senderId: string;
    senderName: string;
    content: string;
  }): Promise<SocialMessageModel> {
    const { conversationId, senderId, senderName, content } = params;
    const trimmed = content.trim();

    const localMsg: SocialMessageModel = {
      id: `dm-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      conversationId,
      senderId,
      senderName,
      content: trimmed,
      createdAt: new Date().toISOString(),
      isGroup: false,
    };

    const current = this.localMessageCache.get(conversationId) || [];
    this.localMessageCache.set(conversationId, [...current, localMsg]);

    try {
      const { data, error } = await supabase
        .from('direct_messages')
        .insert({
          conversation_id: conversationId,
          sender_id: senderId,
          content: trimmed,
        })
        .select('id, created_at')
        .single();

      if (!error && data) {
        localMsg.id = data.id;
        localMsg.createdAt = data.created_at;

        // Update buddy conversation preview
        await supabase
          .from('buddy_conversations')
          .update({
            last_message_at: data.created_at,
            last_preview: trimmed.slice(0, 50),
          })
          .eq('id', conversationId);
      }
    } catch (e) {
      console.warn('Direct message sent locally (DB sync notice):', e);
    }

    return localMsg;
  }

  static subscribeToConversation(
    conversationId: string,
    onMessage: (msg: SocialMessageModel) => void
  ): RealtimeChannel {
    const channel = supabase
      .channel(`direct_messages:${conversationId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'direct_messages',
          filter: `conversation_id=eq.${conversationId}`,
        },
        async (payload) => {
          const row = payload.new as any;
          let senderName = 'Explorer';
          const { data: p } = await supabase
            .from('profiles')
            .select('display_name, avatar_config')
            .eq('id', row.sender_id)
            .maybeSingle();

          if (p?.display_name) senderName = p.display_name;

          onMessage({
            id: row.id,
            conversationId: row.conversation_id,
            senderId: row.sender_id,
            senderName,
            senderAvatar: p?.avatar_config || defaultAvatarConfig,
            content: row.content,
            createdAt: row.created_at,
            isGroup: false,
          });
        }
      )
      .subscribe();

    return channel;
  }
}
