import { supabase } from '../supabase';
import { GroupConversationModel, SocialMessageModel } from '../models/social';
import { defaultAvatarConfig } from '../models/avatar';
import { RealtimeChannel } from '@supabase/supabase-js';

const DEMO_GROUPS: GroupConversationModel[] = [
  {
    id: 'demo-squad-1',
    name: 'Pixel Explorers HQ',
    icon: '🚀',
    createdBy: 'bot-companion-1',
    lastMessageAt: new Date().toISOString(),
    lastPreview: 'Ready for the campfire hangout tonight?',
    membersCount: 4,
  },
  {
    id: 'demo-squad-2',
    name: 'Retro Game Night',
    icon: '👾',
    createdBy: 'bot-companion-2',
    lastMessageAt: new Date(Date.now() - 3600000).toISOString(),
    lastPreview: 'Arcade zone tournament at 8PM!',
    membersCount: 3,
  },
];

export class GroupChatService {
  private static localMessageCache: Map<string, SocialMessageModel[]> = new Map();

  static async getUserGroups(userId: string): Promise<GroupConversationModel[]> {
    if (!userId) return DEMO_GROUPS;

    try {
      const { data: memberRows, error: mErr } = await supabase
        .from('group_conversation_members')
        .select('conversation_id')
        .eq('user_id', userId);

      if (mErr || !memberRows || memberRows.length === 0) {
        return DEMO_GROUPS;
      }

      const convIds = memberRows.map((r) => r.conversation_id);

      const { data: convs, error: cErr } = await supabase
        .from('group_conversations')
        .select('*')
        .in('id', convIds)
        .order('last_message_at', { ascending: false });

      if (cErr || !convs || convs.length === 0) {
        return DEMO_GROUPS;
      }

      return convs.map((c) => ({
        id: c.id,
        name: c.name,
        icon: c.icon || '👾',
        createdBy: c.created_by,
        lastMessageAt: c.last_message_at,
        lastPreview: c.last_preview || 'New group created',
        membersCount: 3,
      }));
    } catch (e) {
      console.warn('Error fetching group conversations, fallback to demo squads:', e);
      return DEMO_GROUPS;
    }
  }

  static async createGroup(params: {
    name: string;
    icon: string;
    creatorId: string;
    memberIds: string[];
  }): Promise<GroupConversationModel | null> {
    const { name, icon, creatorId, memberIds } = params;
    const trimmedName = name.trim();
    if (!trimmedName) return null;

    try {
      const { data: conv, error } = await supabase
        .from('group_conversations')
        .insert({
          name: trimmedName,
          icon: icon || '👾',
          created_by: creatorId,
          last_preview: 'Squad group formed',
        })
        .select('*')
        .single();

      if (error || !conv) {
        // Fallback local group
        const localGroup: GroupConversationModel = {
          id: `local-group-${Date.now()}`,
          name: trimmedName,
          icon: icon || '👾',
          createdBy: creatorId,
          lastMessageAt: new Date().toISOString(),
          lastPreview: 'Squad group formed',
          membersCount: memberIds.length + 1,
        };
        return localGroup;
      }

      const membersToInsert = [
        { conversation_id: conv.id, user_id: creatorId, role: 'owner' },
        ...memberIds.map((mId) => ({ conversation_id: conv.id, user_id: mId, role: 'member' })),
      ];

      await supabase.from('group_conversation_members').insert(membersToInsert);

      return {
        id: conv.id,
        name: conv.name,
        icon: conv.icon,
        createdBy: conv.created_by,
        lastMessageAt: conv.last_message_at,
        lastPreview: conv.last_preview,
        membersCount: membersToInsert.length,
      };
    } catch (e) {
      console.warn('Error creating group chat:', e);
      return {
        id: `local-group-${Date.now()}`,
        name: trimmedName,
        icon: icon || '👾',
        createdBy: creatorId,
        lastMessageAt: new Date().toISOString(),
        lastPreview: 'Squad group formed',
        membersCount: memberIds.length + 1,
      };
    }
  }

  static async fetchMessages(conversationId: string): Promise<SocialMessageModel[]> {
    try {
      const { data, error } = await supabase
        .from('group_messages')
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
        isGroup: true,
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
      id: `grp-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      conversationId,
      senderId,
      senderName,
      content: trimmed,
      createdAt: new Date().toISOString(),
      isGroup: true,
    };

    const current = this.localMessageCache.get(conversationId) || [];
    this.localMessageCache.set(conversationId, [...current, localMsg]);

    try {
      const { data, error } = await supabase
        .from('group_messages')
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

        await supabase
          .from('group_conversations')
          .update({
            last_message_at: data.created_at,
            last_preview: trimmed.slice(0, 50),
          })
          .eq('id', conversationId);
      }
    } catch (e) {
      console.warn('Group message sent locally (DB sync notice):', e);
    }

    return localMsg;
  }

  static subscribeToGroup(
    conversationId: string,
    onMessage: (msg: SocialMessageModel) => void
  ): RealtimeChannel {
    const channel = supabase
      .channel(`group_messages:${conversationId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'group_messages',
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
            isGroup: true,
          });
        }
      )
      .subscribe();

    return channel;
  }
}
