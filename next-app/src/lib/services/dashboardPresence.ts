import { supabase } from '../supabase';
import { AvatarConfig } from '../models/avatar';
import { RealtimeChannel } from '@supabase/supabase-js';

export interface PresenceUser {
  userId: string;
  displayName: string;
  avatarConfig: AvatarConfig;
  status: 'available' | 'away' | 'busy' | 'offline';
  statusMessage?: string;
  currentSpace?: {
    slug: string;
    name: string;
  };
  onlineAt: string;
}

export class DashboardPresenceService {
  private static channel: RealtimeChannel | null = null;
  private static onlineUsers: Map<string, PresenceUser> = new Map();
  private static listeners: Set<(users: PresenceUser[]) => void> = new Set();

  static init(user: {
    userId: string;
    displayName: string;
    avatarConfig: AvatarConfig;
    status?: 'available' | 'away' | 'busy' | 'offline';
    statusMessage?: string;
    currentSpace?: { slug: string; name: string };
  }): void {
    if (this.channel) {
      this.channel.unsubscribe();
    }

    const presenceData: PresenceUser = {
      userId: user.userId,
      displayName: user.displayName,
      avatarConfig: user.avatarConfig,
      status: user.status || 'available',
      statusMessage: user.statusMessage,
      currentSpace: user.currentSpace,
      onlineAt: new Date().toISOString(),
    };

    const chan = supabase.channel('dashboard:presence', {
      config: { presence: { key: user.userId } },
    });

    chan
      .on('presence', { event: 'sync' }, () => {
        const state = chan.presenceState();
        this.onlineUsers.clear();

        Object.values(state).forEach((presences: any) => {
          if (Array.isArray(presences) && presences[0]) {
            const p = presences[0] as PresenceUser;
            this.onlineUsers.set(p.userId, p);
          }
        });

        const userList = Array.from(this.onlineUsers.values());
        this.listeners.forEach((fn) => fn(userList));
      })
      .subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
          await chan.track(presenceData);
        }
      });

    this.channel = chan;
  }

  static updatePresence(data: Partial<PresenceUser>): void {
    if (this.channel) {
      this.channel.track(data);
    }
  }

  static subscribe(fn: (users: PresenceUser[]) => void): () => void {
    this.listeners.add(fn);
    fn(Array.from(this.onlineUsers.values()));

    return () => {
      this.listeners.delete(fn);
    };
  }

  static getOnlineUser(userId: string): PresenceUser | undefined {
    return this.onlineUsers.get(userId);
  }

  static cleanup(): void {
    if (this.channel) {
      this.channel.unsubscribe();
      this.channel = null;
    }
    this.onlineUsers.clear();
    this.listeners.clear();
  }
}
