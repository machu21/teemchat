import { supabase, cleanupExistingChannel } from '../supabase';
import { GroupConversationModel, SocialMessageModel } from '../models/social';
import { defaultAvatarConfig } from '../models/avatar';
import { messagePreview } from '../games/types';
import { RealtimeChannel } from '@supabase/supabase-js';
import { CryptoService } from './cryptoService';
import { E2EEManager } from './e2eeManager';

export class GroupChatService {
  private static localMessageCache: Map<string, SocialMessageModel[]> = new Map();
  private static senderProfileCache: Map<string, { displayName: string; avatarConfig: typeof defaultAvatarConfig }> =
    new Map();

  private static async resolveSenderProfile(
    senderId: string
  ): Promise<{ displayName: string; avatarConfig: typeof defaultAvatarConfig }> {
    const cached = this.senderProfileCache.get(senderId);
    if (cached) return cached;

    try {
      const { data: p } = await supabase
        .from('profiles')
        .select('display_name, avatar_config')
        .eq('id', senderId)
        .maybeSingle();

      const resolved = {
        displayName: p?.display_name || 'Explorer',
        avatarConfig: (p?.avatar_config as unknown as typeof defaultAvatarConfig) || defaultAvatarConfig,
      };
      this.senderProfileCache.set(senderId, resolved);
      return resolved;
    } catch {
      return { displayName: 'Explorer', avatarConfig: defaultAvatarConfig };
    }
  }

  static async getUserGroups(userId: string): Promise<GroupConversationModel[]> {
    if (!userId) return [];

    try {
      const { data: memberRows, error: mErr } = await supabase
        .from('group_conversation_members')
        .select('conversation_id')
        .eq('user_id', userId);

      if (mErr || !memberRows || memberRows.length === 0) {
        return [];
      }

      const convIds = memberRows.map((r) => r.conversation_id);

      const { data: convs, error: cErr } = await supabase
        .from('group_conversations')
        .select('*')
        .in('id', convIds)
        .order('last_message_at', { ascending: false });

      if (cErr || !convs || convs.length === 0) {
        return [];
      }

      return convs.map((c) => {
        const cachedMsgs = this.localMessageCache.get(c.id);
        const lastCached = cachedMsgs && cachedMsgs.length > 0 ? cachedMsgs[cachedMsgs.length - 1] : null;
        const rawPreview = c.last_preview || 'New group created';
        const resolvedPreview =
          lastCached && (rawPreview === '[Encrypted message]' || CryptoService.isEncrypted(rawPreview))
            ? messagePreview(lastCached.content).slice(0, 50)
            : rawPreview;

        return {
          id: c.id,
          name: c.name,
          icon: c.icon || 'logo',
          createdBy: c.created_by || '',
          lastMessageAt: c.last_message_at,
          lastPreview: resolvedPreview,
          membersCount: 3,
        };
      });
    } catch (e) {
      console.warn('Error fetching group conversations, returning none:', e);
      return [];
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
          icon: icon || 'logo',
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
          icon: icon || 'logo',
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

      // Provision and distribute symmetric AES-256-GCM Squad room key to members
      await E2EEManager.initGroupKey(conv.id, [creatorId, ...memberIds]).catch(() => null);

      return {
        id: conv.id,
        name: conv.name,
        icon: conv.icon || 'logo',
        createdBy: conv.created_by || '',
        lastMessageAt: conv.last_message_at,
        lastPreview: conv.last_preview || '',
        membersCount: membersToInsert.length,
      };
    } catch (e) {
      console.warn('Error creating group chat:', e);
      return {
        id: `local-group-${Date.now()}`,
        name: trimmedName,
        icon: icon || 'logo',
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

      const list: SocialMessageModel[] = await Promise.all(
        (data as unknown as Array<{
          id: string;
          conversation_id: string;
          sender_id: string;
          content: string;
          created_at: string;
          sender?: { display_name?: string; avatar_config?: unknown };
        }>).map(async (row) => {
          const senderName = row.sender?.display_name || 'Explorer';
          const senderAvatar =
            (row.sender?.avatar_config as unknown as typeof defaultAvatarConfig) || defaultAvatarConfig;
          if (row.sender?.display_name) {
            this.senderProfileCache.set(row.sender_id, { displayName: senderName, avatarConfig: senderAvatar });
          }

          let resolvedContent = row.content;
          if (CryptoService.isEncrypted(row.content)) {
            try {
              resolvedContent = await E2EEManager.decryptGroupMessage(conversationId, row.content);
            } catch {
              resolvedContent = '[Encrypted message]';
            }
          }

          return {
            id: row.id,
            conversationId: row.conversation_id,
            senderId: row.sender_id,
            senderName,
            senderAvatar,
            content: resolvedContent,
            createdAt: row.created_at,
            isGroup: true,
          };
        })
      );

      this.localMessageCache.set(conversationId, list);
      return list;
    } catch {
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

    let wireContent = trimmed;
    try {
      wireContent = await E2EEManager.encryptGroupMessage(conversationId, trimmed);
    } catch (e) {
      console.warn('[GroupChatService] Encryption failed, falling back to plaintext:', e);
    }

    try {
      const { data, error } = await supabase
        .from('group_messages')
        .insert({
          conversation_id: conversationId,
          sender_id: senderId,
          content: wireContent,
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
            last_preview: CryptoService.isEncrypted(wireContent)
              ? '[Encrypted message]'
              : messagePreview(trimmed).slice(0, 50),
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
    const topic = `group_messages:${conversationId}`;
    cleanupExistingChannel(topic);

    const channel = supabase
      .channel(topic)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'group_messages',
          filter: `conversation_id=eq.${conversationId}`,
        },
        async (payload) => {
          const row = payload.new as {
            id: string;
            conversation_id: string;
            sender_id: string;
            content: string;
            created_at: string;
          };
          const profile = await this.resolveSenderProfile(row.sender_id);

          let content = row.content;
          if (CryptoService.isEncrypted(content)) {
            try {
              content = await E2EEManager.decryptGroupMessage(conversationId, content);
            } catch {
              content = '[Encrypted message]';
            }
          }

          const msg: SocialMessageModel = {
            id: row.id,
            conversationId: row.conversation_id,
            senderId: row.sender_id,
            senderName: profile.displayName,
            senderAvatar: profile.avatarConfig,
            content,
            createdAt: row.created_at,
            isGroup: true,
          };

          const prev = this.localMessageCache.get(conversationId) || [];
          if (!prev.some((m) => m.id === msg.id)) {
            this.localMessageCache.set(conversationId, [...prev, msg]);
          }
          onMessage(msg);
        }
      )
      .subscribe();

    return channel;
  }
}
