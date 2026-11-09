import { supabase, removeRealtimeChannel, cleanupExistingChannel } from '../supabase';
import { AvatarConfig } from '../models/avatar';
import { RealtimeChannel } from '@supabase/supabase-js';

export interface PresenceUser {
  userId: string;
  displayName: string;
  avatarConfig: AvatarConfig;
  status: 'available' | 'away' | 'busy' | 'focus' | 'offline';
  statusMessage?: string;
  currentSpace?: {
    slug: string;
    name: string;
  };
  onlineAt: string;
}

export class DashboardPresenceService {
  private static channel: RealtimeChannel | null = null;
  private static activeUserId: string | null = null;
  private static trackedData: PresenceUser | null = null;
  private static onlineUsers: Map<string, PresenceUser> = new Map();
  private static listeners: Set<(users: PresenceUser[]) => void> = new Set();

  static init(user: {
    userId: string;
    displayName: string;
    avatarConfig: AvatarConfig;
    status?: 'available' | 'away' | 'busy' | 'focus' | 'offline';
    statusMessage?: string;
    currentSpace?: { slug: string; name: string };
  }): void {
    const presenceData: PresenceUser = {
      userId: user.userId,
      displayName: user.displayName,
      avatarConfig: user.avatarConfig,
      status: user.status || 'available',
      statusMessage: user.statusMessage,
      currentSpace: user.currentSpace,
      onlineAt: new Date().toISOString(),
    };

    // If channel is already actively tracking for this user, just update presence
    if (this.channel && this.activeUserId === user.userId) {
      this.trackedData = this.trackedData ?? presenceData;
      this.updatePresence(presenceData);
      return;
    }

    if (this.channel) {
      const old = this.channel;
      this.channel = null;
      old.untrack().catch(() => {});
      removeRealtimeChannel(old);
    }

    cleanupExistingChannel('dashboard:presence');
    this.trackedData = presenceData;

    const chan = supabase.channel('dashboard:presence', {
      config: { presence: { key: user.userId } },
    });

    chan
      .on('presence', { event: 'sync' }, () => {
        if (this.channel !== chan) return;
        this.syncFromChannel(chan);
      })
      .subscribe(async (status) => {
        // A replaced channel's late CLOSED callback must not touch the live one.
        if (this.channel !== chan) return;
        if (status === 'SUBSCRIBED') {
          await chan.track(this.trackedData ?? presenceData);
        } else {
          // CHANNEL_ERROR / TIMED_OUT / CLOSED: our view of who is online is now unknown.
          // Show everyone offline rather than freezing the last list; phoenix rejoins on
          // its own and the server re-sends full state on SUBSCRIBED.
          this.setOnlineUsers(new Map());
        }
      });

    this.channel = chan;
    this.activeUserId = user.userId;
    this.attachWindowListeners();
  }

  /** Dev-only: what this tab believes about presence (run `__teemPresence()` in the console). */
  static debugSnapshot() {
    return {
      buildMarker: 'presence-v3',
      activeUserId: this.activeUserId,
      channelState: this.channel?.state ?? null,
      socketConnected: supabase.realtime.isConnected(),
      listenerCount: this.listeners.size,
      onlineUsers: Array.from(this.onlineUsers.values()).map((u) => ({ userId: u.userId, name: u.displayName })),
      serverState: this.channel
        ? Object.fromEntries(
            Object.entries(this.channel.presenceState()).map(([k, v]) => [
              k,
              (v as unknown as PresenceUser[]).map((p) => p.displayName),
            ])
          )
        : null,
    };
  }

  private static syncFromChannel(chan: RealtimeChannel): void {
    const next = new Map<string, PresenceUser>();
    Object.values(chan.presenceState()).forEach((presences: unknown) => {
      if (Array.isArray(presences) && presences[0]) {
        const p = presences[0] as PresenceUser;
        if (p.userId) next.set(p.userId, p);
      }
    });
    this.setOnlineUsers(next);
  }

  private static setOnlineUsers(next: Map<string, PresenceUser>): void {
    this.onlineUsers = next;
    const userList = Array.from(next.values());
    this.listeners.forEach((fn) => fn(userList));
  }

  /**
   * Background tabs get throttled and can lose their socket without noticing for a while,
   * leaving a frozen "online" list. On refocus we re-check the connection; on tab close we
   * untrack so friends see us leave right away instead of after a socket timeout.
   */
  private static onVisible = (): void => {
    if (typeof document !== 'undefined' && document.visibilityState !== 'visible') return;
    const chan = DashboardPresenceService.channel;
    if (!chan) return;
    if (chan.state === 'joined' && supabase.realtime.isConnected()) {
      DashboardPresenceService.syncFromChannel(chan);
      return;
    }
    DashboardPresenceService.setOnlineUsers(new Map());
    if (!supabase.realtime.isConnected()) supabase.realtime.connect();
  };

  private static onPageHide = (): void => {
    DashboardPresenceService.channel?.untrack().catch(() => {});
  };

  private static listenersAttached = false;

  private static attachWindowListeners(): void {
    if (typeof window !== 'undefined' && process.env.NODE_ENV !== 'production') {
      (window as unknown as { __teemPresence?: () => unknown }).__teemPresence = () =>
        DashboardPresenceService.debugSnapshot();
    }
    if (this.listenersAttached || typeof window === 'undefined') return;
    document.addEventListener('visibilitychange', this.onVisible);
    window.addEventListener('focus', this.onVisible);
    window.addEventListener('online', this.onVisible);
    window.addEventListener('pagehide', this.onPageHide);
    this.listenersAttached = true;
  }

  private static detachWindowListeners(): void {
    if (!this.listenersAttached || typeof window === 'undefined') return;
    document.removeEventListener('visibilitychange', this.onVisible);
    window.removeEventListener('focus', this.onVisible);
    window.removeEventListener('online', this.onVisible);
    window.removeEventListener('pagehide', this.onPageHide);
    this.listenersAttached = false;
  }

  /** Explicitly leave presence (e.g. before sign-out) so friends see us go offline now. */
  static async leave(): Promise<void> {
    const chan = this.channel;
    if (chan) {
      try {
        // Don't let a dead socket stall sign-out for the default 10s push timeout.
        await Promise.race([chan.untrack(), new Promise((resolve) => setTimeout(resolve, 1500))]);
      } catch {
        // Channel already gone; cleanup below still removes it.
      }
    }
    this.cleanup();
  }

  static updatePresence(data: Partial<PresenceUser>): void {
    // track() replaces the whole payload, so merge with what we last tracked
    // (a partial payload would drop userId and break everyone's online map).
    if (!this.trackedData) return;
    this.trackedData = { ...this.trackedData, ...data, userId: this.trackedData.userId };
    if (this.channel) {
      this.channel.track(this.trackedData).catch(() => {});
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

  static getOnlineUsers(): PresenceUser[] {
    return Array.from(this.onlineUsers.values());
  }

  static cleanup(): void {
    this.detachWindowListeners();
    const chan = this.channel;
    this.channel = null;
    if (chan) {
      // Untrack before leaving so the server drops our presence immediately.
      chan.untrack().catch(() => {});
      removeRealtimeChannel(chan);
    }
    this.activeUserId = null;
    this.trackedData = null;
    this.onlineUsers = new Map();
    this.listeners.clear();
  }
}
