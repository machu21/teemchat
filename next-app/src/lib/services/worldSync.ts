import { RealtimeChannel } from '@supabase/supabase-js';
import { supabase } from '../supabase';
import { AvatarConfig, defaultAvatarConfig, normalizeAvatarConfig } from '../models/avatar';
import { ChatMessageModel } from '../models/chat';

export interface RemotePlayerState {
  userId: string;
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

  private lastBroadcastTime: number = 0;
  private lastPresenceTrackTime: number = 0;
  private lastKnownX: number = 420;
  private lastKnownY: number = 300;

  readonly clientInstanceId: string;
  readonly spaceId: string;
  readonly currentUserId: string;
  readonly displayName: string;
  readonly avatarConfig: AvatarConfig;

  onRemotePlayersChanged?: (players: Map<string, RemotePlayerState>) => void;
  onChatMessage?: (message: ChatMessageModel) => void;

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
      this.channel = supabase.channel(`space:${this.spaceId}:world`, {
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

          if (senderClientId === this.clientInstanceId) return;
          if (!senderClientId && senderUserId === this.currentUserId) return;

          const effectiveId = senderClientId || senderUserId;
          if (!effectiveId) return;

          const x = Number(data.x ?? raw.x ?? 420);
          const y = Number(data.y ?? raw.y ?? 300);
          const direction = (data.direction as 'up' | 'down' | 'left' | 'right') || 'down';
          const isMoving = Boolean(data.is_moving ?? raw.is_moving ?? false);
          const name = String(data.display_name || raw.display_name || 'Explorer');
          const cfg = normalizeAvatarConfig(data.avatar_config || raw.avatar_config);

          const existing = this.remotePlayers.get(effectiveId);
          if (existing) {
            existing.x = x;
            existing.y = y;
            existing.direction = direction;
            existing.isMoving = isMoving;
            existing.displayName = name;
            existing.avatarConfig = cfg;
            existing.lastSeen = Date.now();
          } else {
            this.remotePlayers.set(effectiveId, {
              userId: effectiveId,
              displayName: name,
              avatarConfig: cfg,
              x,
              y,
              direction,
              isMoving,
              lastSeen: Date.now(),
            });
          }

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

          if (senderClientId === this.clientInstanceId) return;
          if (!senderClientId && senderUserId === this.currentUserId) return;

          const effectiveId = senderClientId || senderUserId;
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

      // 4. Presence Sync / Join / Leave
      this.channel.on('presence', { event: 'sync' }, () => this.handlePresenceUpdate());
      this.channel.on('presence', { event: 'join' }, () => this.handlePresenceUpdate());
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

          if (clientId === this.clientInstanceId) continue;
          if (!clientId && userId === this.currentUserId) continue;

          const effectiveId = clientId || (userId && userId !== this.currentUserId ? userId : null) || key;
          if (!effectiveId || effectiveId === this.clientInstanceId || effectiveId === this.currentUserId) continue;

          activeIds.add(effectiveId);
          const name = (p.display_name as string) || 'Explorer';
          const x = Number(p.x ?? 420);
          const y = Number(p.y ?? 300);
          const cfg = normalizeAvatarConfig(p.avatar_config);

          const existing = this.remotePlayers.get(effectiveId);
          if (!existing) {
            this.remotePlayers.set(effectiveId, {
              userId: effectiveId,
              displayName: name,
              avatarConfig: cfg,
              x,
              y,
              direction: 'down',
              isMoving: false,
              lastSeen: Date.now(),
            });
          } else {
            existing.displayName = name;
            existing.avatarConfig = cfg;
            if (!existing.isMoving) {
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

    if (!isMoving && !force) return;

    const now = Date.now();
    // 100ms rate limit for movement broadcasts
    if (!force && now - this.lastBroadcastTime < 100) return;
    this.lastBroadcastTime = now;

    // Slow presence re-track (every 20s)
    if (!isMoving && now - this.lastPresenceTrackTime >= 20000) {
      this.lastPresenceTrackTime = now;
      this.channel.track({
        user_id: this.currentUserId,
        client_id: this.clientInstanceId,
        display_name: this.displayName,
        avatar_config: this.avatarConfig,
        x,
        y,
      }).then();
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
    this.isSubscribed = false;

    if (this.channel) {
      try {
        await this.channel.untrack();
        await this.channel.unsubscribe();
        supabase.removeChannel(this.channel);
      } catch (_) {}
      this.channel = null;
    }
    this.remotePlayers.clear();
    this.notifyPlayersChanged();
  }
}
