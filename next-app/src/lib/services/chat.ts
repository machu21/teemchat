import { supabase } from '../supabase';
import { ChatMessageModel } from '../models/chat';
import { UserSession } from '../models/user';
import { RealtimeChannel } from '@supabase/supabase-js';

const UUID_REGEX = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

export class ChatService {
  private static profileNameCache: Map<string, string> = new Map();

  static async fetchMessages(roomId: string): Promise<ChatMessageModel[]> {
    try {
      const cutoff = new Date(Date.now() - 30 * 1000).toISOString();
      const { data, error } = await supabase
        .from('messages')
        .select('*, profiles:sender_id(display_name)')
        .eq('room_id', roomId)
        .gte('created_at', cutoff)
        .order('created_at', { ascending: true })
        .limit(50);

      if (error || !data) return [];

      return data.map((item) => {
        const profile = item.profiles as { display_name?: string } | null;
        return {
          id: item.id,
          roomId: item.room_id,
          spaceId: item.space_id,
          senderId: item.sender_id,
          senderName: profile?.display_name || item.sender_name || 'Explorer',
          content: item.content,
          createdAt: item.created_at,
          isDirectMessage: Boolean(item.conversation_id),
        };
      });
    } catch (e) {
      console.warn('Error fetching room messages:', e);
      return [];
    }
  }

  static async sendMessage(params: {
    roomId: string;
    spaceId: string;
    content: string;
    session: UserSession | null;
  }): Promise<ChatMessageModel | null> {
    const { roomId, spaceId, content, session } = params;
    const trimmed = content.trim();
    if (!trimmed) return null;

    const fallbackMsg: ChatMessageModel = {
      id: `local-${Date.now()}`,
      roomId,
      spaceId,
      senderId: session?.id || 'guest-local',
      senderName: session?.displayName || 'You',
      content: trimmed,
      createdAt: new Date().toISOString(),
    };

    const isValidSpaceUuid = UUID_REGEX.test(spaceId);
    const isValidSessionUuid = UUID_REGEX.test(session?.id || '');

    if (!isValidSpaceUuid || !isValidSessionUuid || !session) {
      return fallbackMsg;
    }

    try {
      const { data, error } = await supabase
        .from('messages')
        .insert({
          room_id: roomId,
          space_id: spaceId,
          sender_id: session.id,
          content: trimmed,
        })
        .select('*, profiles:sender_id(display_name)')
        .single();

      if (error || !data) return fallbackMsg;

      const profile = data.profiles as { display_name?: string } | null;
      return {
        id: data.id,
        roomId: data.room_id,
        spaceId: data.space_id,
        senderId: data.sender_id,
        senderName: profile?.display_name || session.displayName,
        content: data.content,
        createdAt: data.created_at,
      };
    } catch (e) {
      console.warn('Error persisting message in DB:', e);
      return fallbackMsg;
    }
  }

  static listenToRoomMessages(
    roomId: string,
    onMessage: (msg: ChatMessageModel) => void,
    onDeleted?: (id: string) => void
  ): RealtimeChannel {
    const channel = supabase
      .channel(`public:messages:${roomId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'messages',
          filter: `room_id=eq.${roomId}`,
        },
        async (payload) => {
          const rec = payload.new as {
            id: string;
            room_id: string;
            space_id: string;
            sender_id: string;
            content: string;
            created_at: string;
            conversation_id?: string;
          };
          let senderName = 'Explorer';

          if (rec.sender_id) {
            if (this.profileNameCache.has(rec.sender_id)) {
              senderName = this.profileNameCache.get(rec.sender_id)!;
            } else {
              const { data: p } = await supabase
                .from('profiles')
                .select('display_name')
                .eq('id', rec.sender_id)
                .maybeSingle();
              if (p?.display_name) {
                senderName = p.display_name;
                this.profileNameCache.set(rec.sender_id, senderName);
              }
            }
          }

          onMessage({
            id: rec.id,
            roomId: rec.room_id,
            spaceId: rec.space_id,
            senderId: rec.sender_id,
            senderName,
            content: rec.content,
            createdAt: rec.created_at,
            isDirectMessage: Boolean(rec.conversation_id),
          });
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'DELETE',
          schema: 'public',
          table: 'messages',
          filter: `room_id=eq.${roomId}`,
        },
        (payload) => {
          const old = payload.old as { id?: string };
          if (old?.id && onDeleted) {
            onDeleted(old.id);
          }
        }
      )
      .subscribe();

    return channel;
  }
}
