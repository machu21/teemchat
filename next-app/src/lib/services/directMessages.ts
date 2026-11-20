import { supabase, cleanupExistingChannel, removeRealtimeChannel } from '../supabase';
import { DirectConversationModel, SocialMessageModel, FriendModel } from '../models/social';
import { defaultAvatarConfig } from '../models/avatar';
import { messagePreview } from '../games/types';
import { RealtimeChannel } from '@supabase/supabase-js';
import { CryptoService } from './cryptoService';
import { E2EEManager } from './e2eeManager';
import { EMAIL_VERIFY_REQUIRED_MESSAGE, isKnownUnverified } from '../auth/emailVerification';

/** The recipient does not accept messages from this sender (block, privacy or Family Mode). */
export class DirectMessageNotAllowedError extends Error {
  constructor(message = 'This player only accepts messages from friends.') {
    super(message);
    this.name = 'DirectMessageNotAllowedError';
  }
}

export class DirectMessageService {
  private static localMessageCache: Map<string, SocialMessageModel[]> = new Map();
  private static conversationParticipants: Map<string, { userOne: string; userTwo: string }> = new Map();
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

  static async getOrCreateConversation(currentUserId: string, otherUserId: string): Promise<string> {
    const [u1, u2] = currentUserId < otherUserId ? [currentUserId, otherUserId] : [otherUserId, currentUserId];

    try {
      const { data, error } = await supabase
        .from('buddy_conversations')
        .select('id')
        .eq('user_one', u1)
        .eq('user_two', u2)
        .maybeSingle();

      if (error) console.warn('Error looking up buddy conversation:', error.message);
      if (data?.id) {
        this.conversationParticipants.set(data.id, { userOne: u1, userTwo: u2 });
        return data.id;
      }

      const { data: created, error: cErr } = await supabase
        .from('buddy_conversations')
        .insert({
          user_one: u1,
          user_two: u2,
          last_preview: 'Conversation started',
        })
        .select('id')
        .single();

      if (cErr) console.warn('Error creating buddy conversation:', cErr.message);
      if (created?.id) {
        this.conversationParticipants.set(created.id, { userOne: u1, userTwo: u2 });
        return created.id;
      }
    } catch (e) {
      console.warn('Error with buddy conversation, fallback to deterministic id:', e);
    }

    const fallbackId = `local-dm-${u1.slice(0, 8)}-${u2.slice(0, 8)}`;
    this.conversationParticipants.set(fallbackId, { userOne: u1, userTwo: u2 });
    return fallbackId;
  }

  static async getConversationParticipants(conversationId: string): Promise<{ userOne: string; userTwo: string } | null> {
    if (this.conversationParticipants.has(conversationId)) {
      return this.conversationParticipants.get(conversationId) || null;
    }

    try {
      const { data } = await supabase
        .from('buddy_conversations')
        .select('user_one, user_two')
        .eq('id', conversationId)
        .maybeSingle();

      if (data?.user_one && data?.user_two) {
        const entry = { userOne: data.user_one, userTwo: data.user_two };
        this.conversationParticipants.set(conversationId, entry);
        return entry;
      }
    } catch {}

    return null;
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

      data.forEach((c) => {
        this.conversationParticipants.set(c.id, { userOne: c.user_one, userTwo: c.user_two });
      });

      const otherUserIds = data.map((c) => (c.user_one === currentUserId ? c.user_two : c.user_one));

      const { data: profiles } = await supabase
        .from('profiles')
        .select('id, username, display_name, status, status_message, avatar_config, public_key')
        .in('id', otherUserIds);

      const pMap = new Map((profiles || []).map((p) => [p.id, p]));

      // Prime peer public key & sender profile caches for E2EE and zero-N+1 realtime updates
      (profiles || []).forEach((p) => {
        const rec = p as Record<string, unknown>;
        if (typeof rec.public_key === 'string' && rec.public_key) {
          E2EEManager.registerPeerPublicKey(p.id, rec.public_key);
        }
        this.senderProfileCache.set(p.id, {
          displayName: p.display_name || p.username || 'Explorer',
          avatarConfig: (p.avatar_config as unknown as typeof defaultAvatarConfig) || defaultAvatarConfig,
        });
      });

      return data.map((c) => {
        const otherId = c.user_one === currentUserId ? c.user_two : c.user_one;
        const profile = pMap.get(otherId);
        const cachedMsgs = this.localMessageCache.get(c.id);
        const lastCached = cachedMsgs && cachedMsgs.length > 0 ? cachedMsgs[cachedMsgs.length - 1] : null;
        const rawPreview = c.last_preview || 'No messages yet';
        const resolvedPreview =
          lastCached && (rawPreview === '[Encrypted message]' || CryptoService.isEncrypted(rawPreview))
            ? messagePreview(lastCached.content).slice(0, 50)
            : rawPreview;

        return {
          id: c.id,
          userOne: c.user_one,
          userTwo: c.user_two,
          otherUser: {
            id: otherId,
            displayName: profile?.display_name || profile?.username || 'Explorer',
            username: profile?.username || 'explorer',
            avatarConfig: profile?.avatar_config || defaultAvatarConfig,
            isOnline: false, // overlaid from dashboard presence in the social store
            status: (profile?.status as FriendModel['status']) || 'available',
            statusMessage: profile?.status_message || undefined,
          },
          lastMessageAt: c.last_message_at,
          lastPreview: resolvedPreview,
          unreadCount: 0,
        };
      });
    } catch (e) {
      console.warn('Error fetching buddy conversations:', e);
      return [];
    }
  }

  static async fetchMessages(
    conversationId: string,
    peerUserId?: string,
    currentUserId?: string
  ): Promise<SocialMessageModel[]> {
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

      // Resolve peer user ID for E2EE decryption (distinguishing caller from peer)
      let targetPeerId = peerUserId;
      if (!targetPeerId) {
        const me = currentUserId || E2EEManager.getCurrentUserId();
        const participants = await this.getConversationParticipants(conversationId);
        if (participants && me) {
          targetPeerId = participants.userOne === me ? participants.userTwo : participants.userOne;
        }
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
            const me = currentUserId || E2EEManager.getCurrentUserId();
            const peer = targetPeerId || (row.sender_id !== me ? row.sender_id : '');
            if (peer) {
              try {
                resolvedContent = await E2EEManager.decryptDM({
                  conversationId,
                  peerUserId: peer,
                  content: row.content,
                });
              } catch (err) {
                console.warn('[DirectMessageService] Failed to decrypt DM row:', err);
                resolvedContent = '[Encrypted message]';
              }
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
            isGroup: false,
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
    recipientId?: string;
  }): Promise<SocialMessageModel> {
    const { conversationId, senderId, senderName, content, recipientId } = params;
    const trimmed = content.trim();

    // RLS refuses DMs from unverified email accounts; say why before trying.
    if (isKnownUnverified()) {
      throw new DirectMessageNotAllowedError(EMAIL_VERIFY_REQUIRED_MESSAGE);
    }

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

    // Resolve recipient for E2EE encryption
    let targetPeerId = recipientId;
    if (!targetPeerId) {
      const participants = await this.getConversationParticipants(conversationId);
      if (participants) {
        targetPeerId = participants.userOne === senderId ? participants.userTwo : participants.userOne;
      }
    }

    let wireContent = trimmed;
    if (targetPeerId) {
      try {
        wireContent = await E2EEManager.encryptDM({
          conversationId,
          peerUserId: targetPeerId,
          content: trimmed,
        });
      } catch (err) {
        console.warn('[DirectMessageService] Encryption failed, falling back to plaintext:', err);
      }
    }

    let notAllowed = false;
    try {
      const { data, error } = await supabase
        .from('direct_messages')
        .insert({
          conversation_id: conversationId,
          sender_id: senderId,
          content: wireContent,
        })
        .select('id, created_at')
        .single();

      // 42501 = RLS rejected the insert (blocked, or a friends-only / Family Mode recipient)
      if (error?.code === '42501') notAllowed = true;

      if (!error && data) {
        localMsg.id = data.id;
        localMsg.createdAt = data.created_at;

        // Update buddy conversation preview with zero-knowledge indicator
        await supabase
          .from('buddy_conversations')
          .update({
            last_message_at: data.created_at,
            last_preview: CryptoService.isEncrypted(wireContent)
              ? '[Encrypted message]'
              : messagePreview(trimmed).slice(0, 50),
          })
          .eq('id', conversationId);
      }
    } catch (e) {
      console.warn('Direct message sent locally (DB sync notice):', e);
    }

    if (notAllowed) {
      // Never deliver over broadcast what the database refused to store.
      this.localMessageCache.set(
        conversationId,
        (this.localMessageCache.get(conversationId) || []).filter((m) => m.id !== localMsg.id)
      );
      throw new DirectMessageNotAllowedError();
    }

    // Broadcast message across realtime topic for instant peer delivery
    const dmTopic = `direct_messages:${conversationId}`;
    const dmChan = supabase.channel(dmTopic);
    dmChan.subscribe((status) => {
      if (status === 'SUBSCRIBED') {
        dmChan
          .send({
            type: 'broadcast',
            event: 'dm_message',
            payload: {
              ...localMsg,
              content: wireContent, // Peer receives encrypted wire payload
            },
          })
          .then(() => {
            removeRealtimeChannel(dmChan);
          });
      }
    });

    return localMsg;
  }

  static subscribeToConversation(
    conversationId: string,
    onMessage: (msg: SocialMessageModel) => void,
    peerUserId?: string
  ): RealtimeChannel {
    const topic = `direct_messages:${conversationId}`;
    cleanupExistingChannel(topic);

    const channel = supabase
      .channel(topic)
      .on('broadcast', { event: 'dm_message' }, async (envelope) => {
        try {
          const raw = envelope.payload || envelope;
          const data = (raw.payload && typeof raw.payload === 'object' ? raw.payload : raw) as SocialMessageModel;
          if (data && data.conversationId === conversationId) {
            let content = data.content;
            if (CryptoService.isEncrypted(content)) {
              const peer = peerUserId || data.senderId;
              try {
                content = await E2EEManager.decryptDM({
                  conversationId,
                  peerUserId: peer,
                  content,
                });
              } catch (err) {
                console.warn('[DirectMessageService] Broadcast decryption failed:', err);
                content = '[Encrypted message]';
              }
            }
            const decryptedMsg = { ...data, content };
            const prev = this.localMessageCache.get(conversationId) || [];
            if (!prev.some((m) => m.id === decryptedMsg.id)) {
              this.localMessageCache.set(conversationId, [...prev, decryptedMsg]);
            }
            onMessage(decryptedMsg);
          }
        } catch (err) {
          console.warn('Error handling broadcast dm_message:', err);
        }
      })
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'direct_messages',
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
            const peer = peerUserId || row.sender_id;
            try {
              content = await E2EEManager.decryptDM({
                conversationId,
                peerUserId: peer,
                content,
              });
            } catch (err) {
              console.warn('[DirectMessageService] DB change decryption failed:', err);
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
            isGroup: false,
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
