import { supabase, removeRealtimeChannel, cleanupExistingChannel } from '../supabase';
import { AvatarConfig } from '../models/avatar';
import { RealtimeChannel } from '@supabase/supabase-js';
import { PresenceTrackBudget } from './presenceBudget';

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

// Presence rate limit: see presenceBudget.ts. A server-closed channel is rebuilt below.
export { TRACK_BUDGET, TRACK_WINDOW_MS } from './presenceBudget';
/** Rapid changes (clicking through statuses) collapse into one send of the latest state. */
export const TRACK_DEBOUNCE_MS = 400;
/** Backoff for rebuilding a channel the server closed (e.g. rate limit). */
const REJOIN_DELAYS_MS = [2_000, 5_000, 10_000, 30_000];

type UserInit = {
  userId: string;
  displayName: string;
  avatarConfig: AvatarConfig;
  status?: PresenceUser['status'];
  statusMessage?: string;
  currentSpace?: { slug: string; name: string };
};

/** What friends actually see; onlineAt is excluded so a re-init doesn't count as a change. */
function payloadKey(p: PresenceUser): string {
  return JSON.stringify([p.userId, p.displayName, p.avatarConfig, p.status, p.statusMessage ?? null, p.currentSpace ?? null]);
}

export class DashboardPresenceService {
  private static channel: RealtimeChannel | null = null;
  private static activeUserId: string | null = null;
  private static trackedData: PresenceUser | null = null;
  private static onlineUsers: Map<string, PresenceUser> = new Map();
  private static listeners: Set<(users: PresenceUser[]) => void> = new Set();

  // Track budget for the current channel join.
  private static joined = false;
  private static budget = new PresenceTrackBudget();
  private static lastSentKey: string | null = null;
  private static trackTimer: ReturnType<typeof setTimeout> | null = null;
  private static rejoinTimer: ReturnType<typeof setTimeout> | null = null;
  private static rejoinAttempts = 0;

  static init(user: UserInit): void {
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
      this.updatePresence(presenceData);
      return;
    }

    this.trackedData = presenceData;
    this.activeUserId = user.userId;
    this.openChannel();
    this.attachWindowListeners();
  }

  /** (Re)creates the channel; each join starts with a fresh server-side track budget. */
  private static openChannel(): void {
    this.clearRejoinTimer();
    this.clearTrackTimer();
    if (this.channel) {
      const old = this.channel;
      this.channel = null;
      old.untrack().catch(() => {});
      removeRealtimeChannel(old);
    }
    cleanupExistingChannel('dashboard:presence');
    this.joined = false;
    this.budget.reset();
    this.lastSentKey = null;

    const userId = this.activeUserId;
    if (!userId) return;
    const chan = supabase.channel('dashboard:presence', {
      config: { presence: { key: userId } },
    });

    chan
      .on('presence', { event: 'sync' }, () => {
        if (this.channel !== chan) return;
        this.syncFromChannel(chan);
      })
      .subscribe((status) => {
        // A replaced channel's late CLOSED callback must not touch the live one.
        if (this.channel !== chan) return;
        if (status === 'SUBSCRIBED') {
          // A (re)join starts with no presence of ours on the server and a fresh budget.
          this.joined = true;
          this.rejoinAttempts = 0;
          this.budget.reset();
          this.lastSentKey = null;
          this.flushTrack();
          return;
        }
        this.joined = false;
        this.clearTrackTimer();
        // Our view of who is online is now unknown. Show everyone offline rather than
        // freezing the last list; the server re-sends full state on SUBSCRIBED.
        this.setOnlineUsers(new Map());
        // CHANNEL_ERROR / TIMED_OUT are retried by supabase-js itself. A server-side
        // close (presence rate limit, kicked) is not, so build a fresh channel.
        if (status === 'CLOSED') this.scheduleRejoin();
      });

    this.channel = chan;
  }

  private static scheduleRejoin(delayMs?: number): void {
    if (this.rejoinTimer || !this.activeUserId) return;
    const delay = delayMs ?? REJOIN_DELAYS_MS[Math.min(this.rejoinAttempts, REJOIN_DELAYS_MS.length - 1)];
    this.rejoinAttempts++;
    this.rejoinTimer = setTimeout(() => {
      this.rejoinTimer = null;
      if (this.activeUserId) this.openChannel();
    }, delay);
  }

  private static clearRejoinTimer(): void {
    if (this.rejoinTimer) clearTimeout(this.rejoinTimer);
    this.rejoinTimer = null;
  }

  private static clearTrackTimer(): void {
    if (this.trackTimer) clearTimeout(this.trackTimer);
    this.trackTimer = null;
  }

  private static scheduleTrack(delayMs: number): void {
    if (this.trackTimer) return;
    this.trackTimer = setTimeout(() => {
      this.trackTimer = null;
      this.flushTrack();
    }, delayMs);
  }

  /** Sends the latest payload if it changed and the budget allows; otherwise defers it. */
  private static flushTrack(): void {
    const chan = this.channel;
    const data = this.trackedData;
    if (!chan || !data || !this.joined) return;
    const key = payloadKey(data);
    if (key === this.lastSentKey) return;

    const wait = this.budget.waitMs();
    if (wait > 0) {
      this.scheduleTrack(wait);
      return;
    }
    this.budget.record();
    this.lastSentKey = key;
    chan.track(data).catch(() => {});
  }

  /** Dev-only: what this tab believes about presence (run `__teemPresence()` in the console). */
  static debugSnapshot() {
    return {
      buildMarker: 'presence-v4',
      activeUserId: this.activeUserId,
      channelState: this.channel?.state ?? null,
      socketConnected: supabase.realtime.isConnected(),
      listenerCount: this.listeners.size,
      tracksInWindow: this.budget.used(),
      onlineUsers: Array.from(this.onlineUsers.values()).map((u) => ({ userId: u.userId, name: u.displayName, status: u.status })),
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
    // A channel the server closed never comes back by itself; rebuild it now.
    if (chan.state === 'closed') {
      DashboardPresenceService.clearRejoinTimer();
      DashboardPresenceService.scheduleRejoin(0);
    }
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
    if (this.lastSentKey !== null && payloadKey(this.trackedData) === this.lastSentKey) return;
    // Debounced: session refreshes and quick status clicks must not spend the
    // server's small per-channel presence budget (see TRACK_BUDGET).
    this.scheduleTrack(TRACK_DEBOUNCE_MS);
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
    this.clearRejoinTimer();
    this.clearTrackTimer();
    const chan = this.channel;
    this.channel = null;
    if (chan) {
      // Untrack before leaving so the server drops our presence immediately.
      chan.untrack().catch(() => {});
      removeRealtimeChannel(chan);
    }
    this.activeUserId = null;
    this.trackedData = null;
    this.joined = false;
    this.budget.reset();
    this.lastSentKey = null;
    this.rejoinAttempts = 0;
    this.onlineUsers = new Map();
    this.listeners.clear();
  }
}
