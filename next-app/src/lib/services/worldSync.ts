import { RealtimeChannel } from '@supabase/supabase-js';
import { supabase, removeRealtimeChannel, cleanupExistingChannel } from '../supabase';
import { AvatarConfig, normalizeAvatarConfig } from '../models/avatar';
import { ChatMessageModel } from '../models/chat';

export interface RemotePlayerState {
  userId: string;
  clientId?: string;
  displayName: string;
  avatarConfig: AvatarConfig;
  x: number;
  y: number;
  direction: 'up' | 'down' | 'left' | 'right';
  isMoving: boolean;
  speechBubble?: string;
  speechExpiresAt?: number;
  lastSeen: number;
}

export class WorldSyncService {
  private channel: RealtimeChannel | null = null;
  private isSubscribed: boolean = false;
  private isDisposed: boolean = false;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private reconnectAttempts: number = 0;
  private presenceTrackTimer: NodeJS.Timeout | null = null;
  /** Remote ids whose position came from a live broadcast (more fresh than presence). */
  private broadcastPositioned: Set<string> = new Set();

  private lastBroadcastTime: number = 0;
  private lastPresenceTrackTime: number = 0;
  private lastKnownX: number = 420;
  private lastKnownY: number = 300;
  private lastBroadcastX: number = 420;
  private lastBroadcastY: number = 300;
  private lastBroadcastDir: 'up' | 'down' | 'left' | 'right' = 'down';
  private lastBroadcastMoving: boolean = false;

  readonly clientInstanceId: string;
  readonly spaceId: string;
  readonly currentUserId: string;
  readonly displayName: string;
  readonly avatarConfig: AvatarConfig;

  onRemotePlayersChanged?: (players: Map<string, RemotePlayerState>) => void;
  onChatMessage?: (message: ChatMessageModel) => void;
  onFriendRequestReceived?: (request: {
    requestId: string;
    senderId: string;
    senderName: string;
    senderAvatar: AvatarConfig;
  }) => void;
  onFriendResponseReceived?: (response: {
    requestId: string;
    senderId: string;
    receiverId: string;
    receiverName: string;
    receiverAvatar: AvatarConfig;
    action: 'accept' | 'decline';
  }) => void;
  onMapThemeChanged?: (theme: string) => void;

  private remotePlayers: Map<string, RemotePlayerState> = new Map();

  constructor(params: {
    spaceId: string;
    currentUserId: string;
    displayName: string;
    avatarConfig: AvatarConfig;
    clientInstanceId?: string;
  }) {
    this.spaceId = params.spaceId;
    this.currentUserId = params.currentUserId;
    this.displayName = params.displayName;
    this.avatarConfig = params.avatarConfig;
    this.clientInstanceId =
      params.clientInstanceId ||
      `${params.currentUserId}_${Date.now()}_${Math.floor(Math.random() * 10000)}`;
  }

  async connect(initialX: number = 420, initialY: number = 300): Promise<void> {
    this.isDisposed = false;
    this.lastKnownX = initialX;
    this.lastKnownY = initialY;

    try {
      const topic = `space:${this.spaceId}:world`;
      if (this.channel) {
        removeRealtimeChannel(this.channel);
        this.channel = null;
      }
      cleanupExistingChannel(topic);

      this.channel = supabase.channel(topic, {
        config: {
          presence: {
            key: this.clientInstanceId,
          },
          broadcast: {
            self: false,
            ack: false,
          },
        },
      });

      // 1. Movement Broadcasts
      this.channel.on('broadcast', { event: 'movement' }, (envelope) => {
        try {
          const raw = envelope.payload || envelope;
          const data = (raw.payload && typeof raw.payload === 'object' ? raw.payload : raw) as Record<string, unknown>;

          const senderClientId = (data.client_id as string) || (raw.client_id as string);
          const senderUserId = (data.user_id as string) || (raw.user_id as string);

          const effectiveId = this.resolvePeerId(senderUserId, senderClientId);
          if (!effectiveId) return;

          const x = Number(data.x ?? raw.x ?? 420);
          const y = Number(data.y ?? raw.y ?? 300);
          const direction = (data.direction as 'up' | 'down' | 'left' | 'right') || 'down';
          const isMoving = Boolean(data.is_moving ?? raw.is_moving ?? false);
          const name = String(data.display_name || raw.display_name || 'Explorer');
          const cfg = normalizeAvatarConfig(data.avatar_config || raw.avatar_config);

          const actualUserId = senderUserId || effectiveId;
          const existing = this.remotePlayers.get(effectiveId);
          if (existing) {
            existing.userId = actualUserId;
            existing.clientId = senderClientId;
            existing.x = x;
            existing.y = y;
            existing.direction = direction;
            existing.isMoving = isMoving;
            existing.displayName = name;
            existing.avatarConfig = cfg;
            existing.lastSeen = Date.now();
          } else {
            this.remotePlayers.set(effectiveId, {
              userId: actualUserId,
              clientId: senderClientId,
              displayName: name,
              avatarConfig: cfg,
              x,
              y,
              direction,
              isMoving,
              lastSeen: Date.now(),
            });
          }

          this.broadcastPositioned.add(effectiveId);
          this.notifyPlayersChanged();
        } catch (e) {
          console.warn('[WorldSync] Movement broadcast parse error:', e);
        }
      });

      // 2. Speech Bubble Broadcasts
      this.channel.on('broadcast', { event: 'speech' }, (envelope) => {
        try {
          const raw = envelope.payload || envelope;
          const data = (raw.payload && typeof raw.payload === 'object' ? raw.payload : raw) as Record<string, unknown>;

          const senderClientId = (data.client_id as string) || (raw.client_id as string);
          const senderUserId = (data.user_id as string) || (raw.user_id as string);

          const effectiveId = this.resolvePeerId(senderUserId, senderClientId);
          const text = (data.text as string) || (raw.text as string);
          if (!effectiveId || !text) return;

          const player = this.remotePlayers.get(effectiveId);
          if (player) {
            player.speechBubble = text;
            player.speechExpiresAt = Date.now() + 5000;
            this.notifyPlayersChanged();
          }
        } catch (e) {
          console.warn('[WorldSync] Speech broadcast error:', e);
        }
      });

      // 3. In-Room Chat Broadcasts
      this.channel.on('broadcast', { event: 'chat' }, (envelope) => {
        try {
          const raw = envelope.payload || envelope;
          const data = (raw.payload && typeof raw.payload === 'object' ? raw.payload : raw) as Record<string, unknown>;

          const senderId = (data.sender_id as string) || (raw.sender_id as string);
          const content = (data.content as string) || (raw.content as string);
          if (!senderId || !content) return;

          const msg: ChatMessageModel = {
            id: (data.id as string) || (raw.id as string) || `msg-${Date.now()}`,
            roomId: (data.room_id as string) || (raw.room_id as string) || '',
            spaceId: (data.space_id as string) || (raw.space_id as string) || this.spaceId,
            senderId,
            senderName: (data.sender_name as string) || (raw.sender_name as string) || 'Explorer',
            content,
            createdAt: (data.created_at as string) || new Date().toISOString(),
            isDirectMessage: Boolean(data.is_direct),
          };

          if (this.onChatMessage) {
            this.onChatMessage(msg);
          }
        } catch (e) {
          console.warn('[WorldSync] Chat broadcast error:', e);
        }
      });

      // 4. In-Space Peer Friend Requests & Responses
      this.channel.on('broadcast', { event: 'friend_request' }, (envelope) => {
        try {
          const raw = envelope.payload || envelope;
          const data = (raw.payload && typeof raw.payload === 'object' ? raw.payload : raw) as Record<string, unknown>;
          const targetUserId = (data.target_user_id as string) || (data.receiver_id as string);

          if (targetUserId && targetUserId !== this.currentUserId) return;
          if (data.sender_id === this.currentUserId) return;

          if (this.onFriendRequestReceived) {
            this.onFriendRequestReceived({
              requestId: (data.request_id as string) || `req-${Date.now()}`,
              senderId: (data.sender_id as string) || 'explorer',
              senderName: (data.sender_name as string) || 'Explorer',
              senderAvatar: normalizeAvatarConfig(data.sender_avatar),
            });
          }
        } catch (e) {
          console.warn('[WorldSync] Friend request broadcast error:', e);
        }
      });

      this.channel.on('broadcast', { event: 'friend_response' }, (envelope) => {
        try {
          const raw = envelope.payload || envelope;
          const data = (raw.payload && typeof raw.payload === 'object' ? raw.payload : raw) as Record<string, unknown>;
          const targetUserId = data.target_user_id as string;

          if (targetUserId && targetUserId !== this.currentUserId) return;

          if (this.onFriendResponseReceived) {
            this.onFriendResponseReceived({
              requestId: data.request_id as string,
              senderId: data.sender_id as string,
              receiverId: data.receiver_id as string,
              receiverName: (data.receiver_name as string) || 'Explorer',
              receiverAvatar: normalizeAvatarConfig(data.receiver_avatar),
              action: (data.action as 'accept' | 'decline') || 'accept',
            });
          }
        } catch (e) {
          console.warn('[WorldSync] Friend response broadcast error:', e);
        }
      });

      // 5. In-Space Map Theme Changes
      this.channel.on('broadcast', { event: 'map_theme' }, (envelope) => {
        try {
          const raw = envelope.payload || envelope;
          const data = (raw.payload && typeof raw.payload === 'object' ? raw.payload : raw) as Record<string, unknown>;
          const theme = (data.theme as string) || '';
          if (theme && this.onMapThemeChanged) {
            this.onMapThemeChanged(theme);
          }
        } catch (e) {
          console.warn('[WorldSync] Map theme broadcast error:', e);
        }
      });

      // 6. Presence Sync / Join / Leave
      this.channel.on('presence', { event: 'sync' }, () => this.handlePresenceUpdate());
      this.channel.on('presence', { event: 'join' }, () => {
        this.handlePresenceUpdate();
        // Tell the newcomer where we really are right now.
        this.broadcastMovement(this.lastKnownX, this.lastKnownY, this.lastBroadcastDir, false, true);
      });
      this.channel.on('presence', { event: 'leave' }, () => this.handlePresenceUpdate());

      this.channel.subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
          this.isSubscribed = true;
          this.reconnectAttempts = 0;
          if (this.reconnectTimer) {
            clearTimeout(this.reconnectTimer);
            this.reconnectTimer = null;
          }

          try {
            await this.channel?.track({
              user_id: this.currentUserId,
              client_id: this.clientInstanceId,
              display_name: this.displayName,
              avatar_config: this.avatarConfig,
              x: this.lastKnownX,
              y: this.lastKnownY,
            });

            this.handlePresenceUpdate();

            // Force initial position broadcast
            this.broadcastMovement(this.lastKnownX, this.lastKnownY, 'down', false, true);
          } catch (e) {
            console.error('[WorldSync] Error tracking presence:', e);
          }
        } else if (status === 'CLOSED' || status === 'CHANNEL_ERROR') {
          this.isSubscribed = false;
          this.scheduleReconnect();
        }
      });
    } catch (e) {
      console.error('[WorldSync] Connection error:', e);
      this.scheduleReconnect();
    }
  }

  private scheduleReconnect() {
    if (this.isDisposed) return;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);

    const delay = this.reconnectAttempts < 5 ? (1 << this.reconnectAttempts) * 1000 : 10000;
    this.reconnectAttempts++;
    this.reconnectTimer = setTimeout(() => {
      if (this.isDisposed || this.isSubscribed) return;
      this.connect(this.lastKnownX, this.lastKnownY);
    }, delay);
  }

  /**
   * Remote players are keyed by user id so one person is one avatar, even with several
   * tabs/devices or a stale connection left over from a reconnect. The key also matches the
   * LiveKit participant identity used for proximity audio. Returns null for our own user.
   */
  private resolvePeerId(userId?: string, clientId?: string, presenceKey?: string): string | null {
    if (clientId && clientId === this.clientInstanceId) return null;
    if (userId && userId === this.currentUserId) return null;
    const id = userId || clientId || presenceKey || null;
    if (!id || id === this.currentUserId || id === this.clientInstanceId) return null;
    return id;
  }

  private handlePresenceUpdate() {
    if (!this.channel) return;
    try {
      const state = this.channel.presenceState();
      const activeIds = new Set<string>();

      for (const key of Object.keys(state)) {
        const presences = state[key] as Array<Record<string, unknown>>;
        for (const p of presences) {
          const clientId = p.client_id as string | undefined;
          const userId = p.user_id as string | undefined;

          const effectiveId = this.resolvePeerId(userId, clientId, key);
          if (!effectiveId) continue;

          activeIds.add(effectiveId);
          const name = (p.display_name as string) || 'Explorer';
          const x = Number(p.x ?? 420);
          const y = Number(p.y ?? 300);
          const presenceDir = (p.direction as 'up' | 'down' | 'left' | 'right') || 'down';
          const cfg = normalizeAvatarConfig(p.avatar_config);

          const actualUserId = userId || effectiveId;
          const existing = this.remotePlayers.get(effectiveId);
          if (!existing) {
            this.remotePlayers.set(effectiveId, {
              userId: actualUserId,
              clientId,
              displayName: name,
              avatarConfig: cfg,
              x,
              y,
              direction: presenceDir,
              isMoving: false,
              lastSeen: Date.now(),
            });
          } else {
            existing.userId = actualUserId;
            existing.clientId = clientId;
            existing.displayName = name;
            existing.avatarConfig = cfg;
            // Live broadcasts are fresher than presence; never let a stale
            // presence snapshot snap a player back to an old spot.
            if (!existing.isMoving && !this.broadcastPositioned.has(effectiveId)) {
              existing.x = x;
              existing.y = y;
            }
            existing.lastSeen = Date.now();
          }
        }
      }

      // Evict players absent from presence and silent for > 15 seconds
      const now = Date.now();
      for (const [id, player] of this.remotePlayers.entries()) {
        const inPresence = activeIds.has(id);
        const recent = now - player.lastSeen < 15000;
        if (!inPresence && !recent) {
          this.remotePlayers.delete(id);
          this.broadcastPositioned.delete(id);
        }
      }

      this.notifyPlayersChanged();
    } catch (e) {
      console.warn('[WorldSync] Error in presence update:', e);
    }
  }

  broadcastMovement(
    x: number,
    y: number,
    direction: 'up' | 'down' | 'left' | 'right',
    isMoving: boolean,
    force: boolean = false
  ): void {
    this.lastKnownX = x;
    this.lastKnownY = y;

    if (!this.channel || !this.isSubscribed) return;

    if (!isMoving && !force && !this.lastBroadcastMoving) return;

    const now = Date.now();
    // 100ms rate limit for movement broadcasts
    if (!force && now - this.lastBroadcastTime < 100) return;

    // Movement delta gating: skip if moved < 2px, same direction, and same moving status
    const deltaDist = Math.hypot(x - this.lastBroadcastX, y - this.lastBroadcastY);
    if (
      !force &&
      deltaDist < 2 &&
      direction === this.lastBroadcastDir &&
      isMoving === this.lastBroadcastMoving
    ) {
      return;
    }

    this.lastBroadcastTime = now;
    this.lastBroadcastX = x;
    this.lastBroadcastY = y;
    this.lastBroadcastDir = direction;
    this.lastBroadcastMoving = isMoving;

    // Keep presence state in sync with our resting position so late joiners
    // immediately see where we actually are (not the spawn point).
    if (!isMoving) {
      this.schedulePresenceTrack();
    }

    this.channel.send({
      type: 'broadcast',
      event: 'movement',
      payload: {
        user_id: this.currentUserId,
        client_id: this.clientInstanceId,
        display_name: this.displayName,
        avatar_config: this.avatarConfig,
        x,
        y,
        direction,
        is_moving: isMoving,
      },
    });
  }

  /** Throttled presence re-track (max 1/sec, trailing call guaranteed). */
  private schedulePresenceTrack(): void {
    if (this.presenceTrackTimer) return;
    const wait = Math.max(0, 1000 - (Date.now() - this.lastPresenceTrackTime));
    this.presenceTrackTimer = setTimeout(() => {
      this.presenceTrackTimer = null;
      if (!this.channel || !this.isSubscribed || this.isDisposed) return;
      this.lastPresenceTrackTime = Date.now();
      this.channel
        .track({
          user_id: this.currentUserId,
          client_id: this.clientInstanceId,
          display_name: this.displayName,
          avatar_config: this.avatarConfig,
          x: this.lastKnownX,
          y: this.lastKnownY,
          direction: this.lastBroadcastDir,
        })
        .catch(() => {});
    }, wait);
  }

  broadcastFriendRequest(targetUserId: string): void {
    if (!this.channel || !this.isSubscribed) return;
    this.channel.send({
      type: 'broadcast',
      event: 'friend_request',
      payload: {
        request_id: `req_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        sender_id: this.currentUserId,
        sender_name: this.displayName,
        sender_avatar: this.avatarConfig,
        target_user_id: targetUserId,
        created_at: new Date().toISOString(),
      },
    });
  }

  broadcastFriendResponse(
    requestId: string,
    targetUserId: string,
    action: 'accept' | 'decline'
  ): void {
    if (!this.channel || !this.isSubscribed) return;
    this.channel.send({
      type: 'broadcast',
      event: 'friend_response',
      payload: {
        request_id: requestId,
        sender_id: targetUserId,
        receiver_id: this.currentUserId,
        receiver_name: this.displayName,
        receiver_avatar: this.avatarConfig,
        target_user_id: targetUserId,
        action,
        created_at: new Date().toISOString(),
      },
    });
  }

  broadcastSpeech(text: string): void {
    const trimmed = text.trim();
    if (!this.channel || !this.isSubscribed || !trimmed) return;

    this.channel.send({
      type: 'broadcast',
      event: 'speech',
      payload: {
        user_id: this.currentUserId,
        client_id: this.clientInstanceId,
        text: trimmed,
      },
    });
  }

  broadcastChatMessage(msg: ChatMessageModel): void {
    if (!this.channel || !this.isSubscribed || !msg.content.trim()) return;

    this.channel.send({
      type: 'broadcast',
      event: 'chat',
      payload: {
        id: msg.id,
        room_id: msg.roomId,
        space_id: msg.spaceId,
        sender_id: msg.senderId,
        sender_name: msg.senderName,
        content: msg.content.trim(),
        created_at: msg.createdAt,
        is_direct: msg.isDirectMessage,
      },
    });
  }

  broadcastMapTheme(theme: string): void {
    if (!this.channel || !this.isSubscribed || !theme) return;
    this.channel.send({
      type: 'broadcast',
      event: 'map_theme',
      payload: {
        theme,
        user_id: this.currentUserId,
        created_at: new Date().toISOString(),
      },
    });
  }

  getRemotePlayers(): Map<string, RemotePlayerState> {
    return this.remotePlayers;
  }

  private notifyPlayersChanged() {
    if (this.onRemotePlayersChanged) {
      this.onRemotePlayersChanged(new Map(this.remotePlayers));
    }
  }

  async disconnect(): Promise<void> {
    this.isDisposed = true;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.presenceTrackTimer) {
      clearTimeout(this.presenceTrackTimer);
      this.presenceTrackTimer = null;
    }
    this.isSubscribed = false;

    if (this.channel) {
      removeRealtimeChannel(this.channel);
      this.channel = null;
    }
    this.remotePlayers.clear();
    this.broadcastPositioned.clear();
    this.notifyPlayersChanged();
  }
}
