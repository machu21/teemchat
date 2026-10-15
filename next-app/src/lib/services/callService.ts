import { supabase, removeRealtimeChannel, cleanupExistingChannel } from '../supabase';
import { RealtimeChannel } from '@supabase/supabase-js';
import { IncomingCallModel, CallParticipantModel, CallType } from '../models/call';
import { AvatarConfig } from '../models/avatar';

export interface CallSignalingEvent {
  type: 'ring' | 'answered' | 'declined' | 'joined' | 'left' | 'ended' | 'state_sync';
  roomId: string;
  callType: CallType;
  conversationId: string;
  senderId: string;
  senderName: string;
  senderAvatar?: AvatarConfig;
  title: string;
  isVideo: boolean;
  timestamp: number;
  participantState?: Partial<CallParticipantModel>;
}

export class CallService {
  private static channel: RealtimeChannel | null = null;
  private static listeners: Set<(event: CallSignalingEvent) => void> = new Set();
  private static currentUserId: string | null = null;

  static init(userId: string): void {
    if (this.channel && this.currentUserId === userId) return;

    if (this.channel) {
      removeRealtimeChannel(this.channel);
      this.channel = null;
    }

    cleanupExistingChannel('teem_call_signaling');

    this.currentUserId = userId;
    const chan = supabase.channel('teem_call_signaling');

    chan
      .on('broadcast', { event: 'call_event' }, ({ payload }) => {
        if (!payload) return;
        const event = payload as CallSignalingEvent;
        // Notify all registered listeners
        this.listeners.forEach((fn) => fn(event));
      })
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          // Connected to call signaling
        }
      });

    this.channel = chan;
  }

  static subscribe(fn: (event: CallSignalingEvent) => void): () => void {
    this.listeners.add(fn);
    return () => {
      this.listeners.delete(fn);
    };
  }

  static async broadcastEvent(event: Omit<CallSignalingEvent, 'timestamp'>): Promise<void> {
    const fullEvent: CallSignalingEvent = {
      ...event,
      timestamp: Date.now(),
    };

    if (this.channel) {
      try {
        await this.channel.send({
          type: 'broadcast',
          event: 'call_event',
          payload: fullEvent,
        });
      } catch (err) {
        console.warn('Call signaling broadcast error:', err);
      }
    }
  }

  static cleanup(): void {
    if (this.channel) {
      removeRealtimeChannel(this.channel);
      this.channel = null;
    }
    this.listeners.clear();
    this.currentUserId = null;
  }
}
