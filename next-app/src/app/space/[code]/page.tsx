'use client';

export const dynamic = 'force-dynamic';

import React, { useEffect, useState, useRef, useCallback, use, useMemo } from 'react';
import styles from './world.module.css';
import { useSessionStore } from '@/stores/session';
import { SpaceService } from '@/lib/services/spaces';
import { SpaceModel, defaultHQ } from '@/lib/models/space';
import { getMapConfig, getZonesForMap, ZoneDefinition, MAP_REGISTRY } from '@/game/map/mapRegistry';
import { WorldSyncService } from '@/lib/services/worldSync';
import { LiveKitService, VideoFeedModel, attachTrackToElement } from '@/lib/services/livekit';
import { ChatService } from '@/lib/services/chat';
import { PlaylistService } from '@/lib/services/playlist';
import { TtsService } from '@/lib/services/tts';
import { ChatMessageModel, CompanionModel } from '@/lib/models/chat';
import { removeRealtimeChannel } from '@/lib/supabase';
import { GameCanvas } from '@/game/GameCanvas';
import { FurnitureType } from '@/game/entities/furniture';
import { NeoButton } from '@/components/neo/NeoButton';
import { NeoCard } from '@/components/neo/NeoCard';
import { NeoBadge } from '@/components/neo/NeoBadge';
import { NeoModal } from '@/components/neo/NeoModal';
import { NeoInput } from '@/components/neo/NeoInput';
import { PixelAvatar } from '@/components/neo/PixelAvatar';
import { Gender, defaultMaleAvatarConfig, defaultFemaleAvatarConfig } from '@/lib/models/avatar';
import { CallOverlayContainer } from '@/components/call/CallOverlayContainer';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  MicIcon,
  MicOffIcon,
  VideoIcon,
  VideoOffIcon,
  ScreenShareIcon,
  ChatBubbleIcon,
  HammerIcon,
  MusicIcon,
  RocketIcon,
  BotIcon,
} from '@/components/icons/DockIcons';

export const WORLD_ZONES = MAP_REGISTRY.village.zones;

export default function WorldPage({ params }: { params: Promise<{ code: string }> }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialTargetZone = searchParams?.get('zone') || null;
  const resolvedParams = use(params);
  const spaceCode = resolvedParams.code;

  const { session, initSession } = useSessionStore();

  const [space, setSpace] = useState<SpaceModel | null>(null);
  const [syncService, setSyncService] = useState<WorldSyncService | null>(null);

  const livekitRef = useRef<LiveKitService | null>(null);
  const getLiveKit = useCallback(() => {
    if (!livekitRef.current) {
      livekitRef.current = new LiveKitService();
    }
    return livekitRef.current;
  }, []);

  const [companion] = useState<CompanionModel | null>(() => ({
    id: 'companion-pixel-cat',
    userId: 'system',
    name: 'Pixel Cat',
    persona: 'Playful pixel buddy exploring the TeemChat virtual world with you.',
    companionType: 'cat',
    avatarStyle: 'orange_tabby',
    learnedContext: {},
    isActive: true,
  }));
  const [currentZone, setCurrentZone] = useState('Verdant Village');

  // Media toggles
  const [isMicOn, setIsMicOn] = useState(false);
  const [isCamOn, setIsCamOn] = useState(false);
  const [isScreenShareOn, setIsScreenShareOn] = useState(false);
  const [videoFeeds, setVideoFeeds] = useState<VideoFeedModel[]>([]);

  // Roblox-style Chat state
  const [chatOpen, setChatOpen] = useState(false);
  const [activeChannel, setActiveChannel] = useState<'room' | 'companion'>('room');
  const [roomMessages, setRoomMessages] = useState<ChatMessageModel[]>([]);
  const [companionMessages, setCompanionMessages] = useState<Array<{ role: string; content: string }>>([]);
  const [chatInput, setChatInput] = useState('');
  const [isAiThinking, setIsAiThinking] = useState(false);
  const chatScrollRef = useRef<HTMLDivElement | null>(null);

  // Modals & Panels
  const [inviteModalOpen, setInviteModalOpen] = useState(false);
  const [playlistModalOpen, setPlaylistModalOpen] = useState(false);
  const [buildModeOpen, setBuildModeOpen] = useState(false);
  const [selectedFurniture, setSelectedFurniture] = useState<FurnitureType | null>(null);

  // World Map Fast Travel / Teleport Modal State
  const [mapTeleportModalOpen, setMapTeleportModalOpen] = useState(false);
  const [targetTeleport, setTargetTeleport] = useState<{
    x: number;
    y: number;
    name?: string;
    seq: number;
  } | null>(null);

  const mapConfig = useMemo(() => getMapConfig(space?.mapTheme), [space?.mapTheme]);
  const activeZones = useMemo(() => getZonesForMap(space?.mapTheme), [space?.mapTheme]);

  const handleTeleportToZone = useCallback((zone: ZoneDefinition) => {
    setTargetTeleport((prev) => ({
      x: zone.x,
      y: zone.y,
      name: zone.name,
      seq: (prev?.seq || 0) + 1,
    }));
    setMapTeleportModalOpen(false);
  }, []);

  // Guest Character Setup Modal State
  const [guestModalOpen, setGuestModalOpen] = useState(false);
  const [guestName, setGuestName] = useState('Explorer');
  const [guestGender, setGuestGender] = useState<Gender>('male');
  const [isJoiningGuest, setIsJoiningGuest] = useState(false);

  // 1. Initial Space & Session resolution
  useEffect(() => {
    initSession().then(() => {
      const current = useSessionStore.getState().session;
      if (!current) {
        setGuestModalOpen(true);
      }
    }).catch((err) => {
      console.warn('Error during initSession:', err);
      setGuestModalOpen(true);
    });

    SpaceService.getSpaceByCodeOrSlug(spaceCode)
      .then((s) => {
        setSpace(s || defaultHQ());
      })
      .catch((err) => {
        console.warn('Failed to load space, falling back to default HQ:', err);
        setSpace(defaultHQ());
      });
  }, [spaceCode, initSession]);

  const handleJoinAsGuest = async () => {
    setIsJoiningGuest(true);
    await useSessionStore.getState().signInGuest(guestName.trim() || 'Explorer', guestGender);
    setIsJoiningGuest(false);
    setGuestModalOpen(false);
  };

  // 2. Initialize WorldSync & LiveKit when session and space are loaded
  useEffect(() => {
    if (!session || !space) return;

    const sync = new WorldSyncService({
      spaceId: space.id,
      currentUserId: session.id,
      displayName: session.displayName,
      avatarConfig: session.avatarConfig,
    });

    sync.onChatMessage = (msg) => {
      setRoomMessages((prev) => [...prev, msg]);
    };

    sync.connect();
    queueMicrotask(() => {
      setSyncService(sync);
    });

    const livekit = getLiveKit();

    // Initial LiveKit room connection
    livekit.joinSpaceRoom(space.id, session.displayName).catch((err) => {
      console.warn('LiveKit room connection notice:', err);
    });

    livekit.onStateChanged = () => {
      setIsMicOn(livekit.isMicEnabled);
      setIsCamOn(livekit.isCameraEnabled);
      setIsScreenShareOn(livekit.isScreenShareEnabled);
      setVideoFeeds([...livekit.remoteVideoFeeds]);
    };

    // Load initial 30s room chat
    ChatService.fetchMessages('general')
      .then(setRoomMessages)
      .catch((err) => {
        console.warn('Chat messages fetch notice:', err);
      });

    const roomSub = ChatService.listenToRoomMessages(
      'general',
      (msg) => setRoomMessages((prev) => [...prev, msg]),
      (delId) => setRoomMessages((prev) => prev.filter((m) => m.id !== delId))
    );

    // Initial playlist load
    PlaylistService.loadPlaylist(space.id).catch((err) => {
      console.warn('Playlist load notice:', err);
    });

    return () => {
      sync.disconnect();
      livekit.leaveSpaceRoom().catch(() => {});
      if (roomSub) {
        removeRealtimeChannel(roomSub);
      }
    };
  }, [session, space, getLiveKit]);

  // 3. 30-Second TTL chat auto-pruner
  useEffect(() => {
    const timer = setInterval(() => {
      const cutoff = Date.now() - 30 * 1000;
      setRoomMessages((prev) =>
        prev.filter((m) => new Date(m.createdAt).getTime() > cutoff)
      );
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  // Scroll to bottom on new message
  useEffect(() => {
    if (chatScrollRef.current) {
      chatScrollRef.current.scrollTop = chatScrollRef.current.scrollHeight;
    }
  }, [roomMessages, companionMessages, activeChannel]);

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!chatInput.trim() || !session || !space) return;
    const text = chatInput.trim();
    setChatInput('');

    if (activeChannel === 'room') {
      const msg = await ChatService.sendMessage({
        roomId: 'general',
        spaceId: space.id,
        content: text,
        session,
      });

      if (msg) {
        setRoomMessages((prev) => [...prev, msg]);
        syncService?.broadcastChatMessage(msg);
        syncService?.broadcastSpeech(text);
      }
    } else {
      // AI Companion Chat Pipeline
      setCompanionMessages((prev) => [...prev, { role: 'user', content: text }]);
      setIsAiThinking(true);

      try {
        const { data: { session: authSession } } = await (await import('@/lib/supabase')).supabase.auth.getSession();
        const res = await fetch('/api/companion/chat', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${authSession?.access_token || ''}`,
          },
          body: JSON.stringify({
            companion,
            userName: session.displayName,
            currentZone,
            userMessage: text,
            recentHistory: companionMessages,
          }),
        });

        const data = await res.json();
        const reply = data.response || "I'm right with you!";
        setCompanionMessages((prev) => [...prev, { role: 'assistant', content: reply }]);

        if (TtsService.autoSpeak) {
          TtsService.speak(reply);
        }
      } catch (err) {
        console.error('Error in AI companion chat:', err);
      } finally {
        setIsAiThinking(false);
      }
    }
  };

  const handleProximityChanged = useCallback((distances: Map<string, number>) => {
    getLiveKit().updateProximityAudio(distances);
  }, [getLiveKit]);

  const handleCompanionTap = useCallback(() => {
    setActiveChannel('companion');
    setChatOpen(true);
  }, []);

  if (!session || !space || !syncService) {
    return (
      <div className={styles.loadingScreen}>
        <div>Entering Virtual Realm...</div>
        {guestModalOpen && (
          <NeoModal
            isOpen={guestModalOpen}
            onClose={() => {}}
            title="Join Space: Choose Your Character"
          >
            <div className={styles.characterSetupContent}>
              <div className={styles.avatarStage}>
                <PixelAvatar
                  config={guestGender === 'female' ? defaultFemaleAvatarConfig : defaultMaleAvatarConfig}
                  size={72}
                />
                <div style={{ marginTop: '8px', fontWeight: 900 }}>{guestName.trim() || 'Explorer'}</div>
              </div>

              <NeoInput
                label="Your Name"
                value={guestName}
                onChange={(e) => setGuestName(e.target.value)}
                placeholder="Explorer"
              />

              <div>
                <label style={{ fontSize: '0.8rem', fontWeight: 800, textTransform: 'uppercase', marginBottom: '6px', display: 'block' }}>
                  Gender
                </label>
                <div className={styles.genderButtonGroup}>
                  <button
                    type="button"
                    className={`${styles.genderBtn} ${guestGender === 'male' ? styles.genderBtnMaleActive : ''}`}
                    onClick={() => setGuestGender('male')}
                  >
                    <span>👨 Male</span>
                  </button>
                  <button
                    type="button"
                    className={`${styles.genderBtn} ${guestGender === 'female' ? styles.genderBtnFemaleActive : ''}`}
                    onClick={() => setGuestGender('female')}
                  >
                    <span>👩 Female</span>
                  </button>
                </div>
              </div>

              <NeoButton
                variant="primary"
                size="lg"
                onClick={handleJoinAsGuest}
                disabled={isJoiningGuest}
              >
                {isJoiningGuest ? 'Joining Space...' : '⚡ Enter Space'}
              </NeoButton>
            </div>
          </NeoModal>
        )}
      </div>
    );
  }

  return (
    <div className={styles.worldLayout}>
      {/* Game Canvas Viewport */}
      <div className={styles.canvasWrapper}>
        <GameCanvas
          space={space}
          session={session}
          syncService={syncService}
          companion={companion}
          buildMode={buildModeOpen}
          selectedFurniture={selectedFurniture}
          targetTeleport={targetTeleport}
          initialTargetZone={initialTargetZone}
          onCompanionTap={handleCompanionTap}
          onProximityChanged={handleProximityChanged}
          onZoneChanged={setCurrentZone}
        />
      </div>

      {/* Top HUD */}
      <header className={styles.topHud}>
        <div className={styles.hudLeft}>
          <NeoButton size="sm" variant="secondary" onClick={() => router.push('/dashboard')}>
            ← Leave
          </NeoButton>
          <div className={styles.spaceTitleBadge}>
            <span className={styles.spaceIcon}>{mapConfig.icon}</span>
            <span className={styles.spaceName}>{space.name}</span>
          </div>
          <NeoBadge color={mapConfig.badgeColor}>{currentZone}</NeoBadge>
        </div>

        <div className={styles.hudRight}>
          <NeoButton
            size="sm"
            variant="primary"
            onClick={() => setMapTeleportModalOpen(true)}
            title="Fast travel / teleport across the map"
          >
            🚀 Teleport
          </NeoButton>
          <NeoButton size="sm" variant="secondary" onClick={() => setInviteModalOpen(true)}>
            🎟️ Invite Friends
          </NeoButton>
        </div>
      </header>

      {/* Video PiP Overlay */}
      {videoFeeds.length > 0 && (
        <div className={styles.pipGrid}>
          {videoFeeds.map((feed) => (
            <div key={feed.participantId} className={styles.pipCard}>
              <video
                ref={(el) => {
                  attachTrackToElement(feed.track, el);
                }}
                autoPlay
                playsInline
                className={styles.pipVideo}
              />
              <span className={styles.pipLabel}>
                {feed.participantName} {feed.isScreenShare ? '📺' : ''}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Bottom Dock */}
      <footer className={styles.bottomDock}>
        <button
          className={`${styles.dockBtn} ${isMicOn ? styles.dockBtnActive : ''}`}
          onClick={() => getLiveKit().toggleMicrophone()}
          title={isMicOn ? 'Mute Microphone' : 'Unmute Microphone'}
          aria-label={isMicOn ? 'Mute Microphone' : 'Unmute Microphone'}
        >
          {isMicOn ? <MicIcon size={20} /> : <MicOffIcon size={20} />}
        </button>

        <button
          className={`${styles.dockBtn} ${isCamOn ? styles.dockBtnActive : ''}`}
          onClick={() => getLiveKit().toggleCamera()}
          title={isCamOn ? 'Turn Off Camera' : 'Turn On Camera'}
          aria-label={isCamOn ? 'Turn Off Camera' : 'Turn On Camera'}
        >
          {isCamOn ? <VideoIcon size={20} /> : <VideoOffIcon size={20} />}
        </button>

        <button
          className={`${styles.dockBtn} ${isScreenShareOn ? styles.dockBtnActive : ''}`}
          onClick={() => getLiveKit().toggleScreenShare()}
          title={isScreenShareOn ? 'Stop Screen Share' : 'Screen Share'}
          aria-label={isScreenShareOn ? 'Stop Screen Share' : 'Screen Share'}
        >
          <ScreenShareIcon size={20} />
        </button>

        <div className={styles.dockDivider} />

        <button
          className={`${styles.dockBtn} ${chatOpen ? styles.dockBtnActive : ''}`}
          onClick={() => setChatOpen(!chatOpen)}
          title="Toggle Chat"
          aria-label="Toggle Chat"
        >
          <ChatBubbleIcon size={20} />
        </button>

        <button
          className={`${styles.dockBtn} ${buildModeOpen ? styles.dockBtnActive : ''}`}
          onClick={() => setBuildModeOpen(!buildModeOpen)}
          title="Build Mode"
          aria-label="Build Mode"
        >
          <HammerIcon size={20} />
        </button>

        <button
          className={styles.dockBtn}
          onClick={() => setPlaylistModalOpen(true)}
          title="Sound Tripping"
          aria-label="Sound Tripping"
        >
          <MusicIcon size={20} />
        </button>

        <button
          className={`${styles.dockBtn} ${mapTeleportModalOpen ? styles.dockBtnActive : ''}`}
          onClick={() => setMapTeleportModalOpen(!mapTeleportModalOpen)}
          title="Teleport Across Map"
          aria-label="Teleport Across Map"
        >
          <RocketIcon size={20} />
        </button>

        <button
          className={styles.dockBtn}
          onClick={() => {
            setActiveChannel('companion');
            setChatOpen(true);
          }}
          title="AI Companion"
          aria-label="AI Companion"
        >
          <BotIcon size={20} />
        </button>
      </footer>

      {/* Roblox-Style Chat Box Overlay */}
      {chatOpen && (
        <div className={styles.chatBox}>
          <NeoCard className={styles.chatCard}>
            <div className={styles.chatHeader}>
              <div className={styles.channelTabs}>
                <button
                  className={`${styles.tabBtn} ${activeChannel === 'room' ? styles.tabBtnActive : ''}`}
                  onClick={() => setActiveChannel('room')}
                >
                  Room
                </button>
                <button
                  className={`${styles.tabBtn} ${activeChannel === 'companion' ? styles.tabBtnActive : ''}`}
                  onClick={() => setActiveChannel('companion')}
                >
                  AI Companion
                </button>
              </div>
              <button className={styles.closeChatBtn} onClick={() => setChatOpen(false)}>
                ✕
              </button>
            </div>

            <div ref={chatScrollRef} className={styles.messageStream}>
              {activeChannel === 'room' ? (
                roomMessages.length === 0 ? (
                  <div className={styles.emptyNotice}>Messages disappear after 30 seconds. Say hi! 👋</div>
                ) : (
                  roomMessages.map((m) => (
                    <div key={m.id} className={styles.messageRow}>
                      <span className={styles.msgSender}>{m.senderName}:</span>
                      <span className={styles.msgContent}>{m.content}</span>
                    </div>
                  ))
                )
              ) : companionMessages.length === 0 ? (
                <div className={styles.emptyNotice}>Say hello to your personal companion! 🤖</div>
              ) : (
                companionMessages.map((m, idx) => (
                  <div
                    key={idx}
                    className={`${styles.companionBubble} ${
                      m.role === 'user' ? styles.bubbleUser : styles.bubbleAi
                    }`}
                  >
                    <strong>{m.role === 'user' ? 'You' : companion?.name || 'Companion'}:</strong> {m.content}
                  </div>
                ))
              )}
              {isAiThinking && <div className={styles.thinking}>Companion is thinking... ⚡</div>}
            </div>

            <form onSubmit={handleSendMessage} className={styles.chatInputRow}>
              <input
                className={styles.chatInput}
                placeholder={activeChannel === 'room' ? 'Chat with the room...' : 'Ask companion...'}
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
              />
              <button type="submit" className={styles.sendBtn}>
                Send
              </button>
            </form>
          </NeoCard>
        </div>
      )}

      {/* Build Palette Panel */}
      {buildModeOpen && (
        <div className={styles.buildPalette}>
          <NeoCard className={styles.paletteCard}>
            <div className={styles.paletteTitle}>Pick Furniture (Click Map to Place)</div>
            <div className={styles.furnitureList}>
              {(
                [
                  'pingPongTable',
                  'blueSofa',
                  'coffeeTable',
                  'armchair',
                  'pottedPlant',
                  'beanBagRed',
                  'beanBagBlue',
                  'beanBagYellow',
                  'bookshelf',
                  'vendingMachine',
                  'campfire',
                  'tent',
                  'logBench',
                  'pineTree',
                  'boulder',
                  'stoneWell',
                ] as FurnitureType[]
              ).map((f) => (
                <button
                  key={f}
                  className={`${styles.furnBtn} ${selectedFurniture === f ? styles.furnBtnActive : ''}`}
                  onClick={() => setSelectedFurniture(f)}
                >
                  {f}
                </button>
              ))}
            </div>
          </NeoCard>
        </div>
      )}

      {/* Invite Modal */}
      <NeoModal
        isOpen={inviteModalOpen}
        onClose={() => setInviteModalOpen(false)}
        title="Invite Friends to Hangout"
      >
        <div className={styles.inviteContent}>
          <p>Share this link or code with your friends so they can join right into this world:</p>
          <NeoInput
            readOnly
            value={typeof window !== 'undefined' ? `${window.location.origin}/space/${space.slug}` : space.slug}
          />
          <NeoButton
            variant="primary"
            onClick={() => {
              navigator.clipboard.writeText(`${window.location.origin}/space/${space.slug}`);
              alert('Copied invite link to clipboard!');
            }}
          >
            📋 Copy Invite Link
          </NeoButton>
        </div>
      </NeoModal>

      {/* Sound Tripping (Playlist) Modal */}
      <NeoModal
        isOpen={playlistModalOpen}
        onClose={() => setPlaylistModalOpen(false)}
        title="🎵 Sound Tripping Playlist"
      >
        <div className={styles.playlistContent}>
          <div className={styles.playlistControls}>
            <NeoButton variant="secondary" onClick={() => PlaylistService.previousTrack()}>
              ⏮️
            </NeoButton>
            <NeoButton variant="primary" onClick={() => PlaylistService.togglePlayPause()}>
              {PlaylistService.isPlaying ? '⏸️ Pause' : '▶️ Play'}
            </NeoButton>
            <NeoButton variant="secondary" onClick={() => PlaylistService.nextTrack()}>
              ⏭️
            </NeoButton>
          </div>

          <div className={styles.trackList}>
            {PlaylistService.playlist.map((track) => (
              <div
                key={track.id}
                className={`${styles.trackItem} ${
                  PlaylistService.currentTrack?.id === track.id ? styles.trackItemActive : ''
                }`}
                onClick={() => PlaylistService.playTrack(track)}
              >
                <div>
                  <strong>{track.title}</strong>
                  <div className={styles.trackArtist}>{track.artist}</div>
                </div>
                <span>▶️</span>
              </div>
            ))}
          </div>
        </div>
      </NeoModal>

      {/* Guest Character Setup Modal on Direct Link */}
      <NeoModal
        isOpen={guestModalOpen}
        onClose={() => {}}
        title="Join Space: Choose Your Character"
      >
        <div className={styles.characterSetupContent}>
          <div className={styles.avatarStage}>
            <PixelAvatar
              config={guestGender === 'female' ? defaultFemaleAvatarConfig : defaultMaleAvatarConfig}
              size={72}
            />
            <div style={{ marginTop: '8px', fontWeight: 900 }}>{guestName.trim() || 'Explorer'}</div>
          </div>

          <NeoInput
            label="Your Name"
            value={guestName}
            onChange={(e) => setGuestName(e.target.value)}
            placeholder="Explorer"
          />

          <div>
            <label style={{ fontSize: '0.8rem', fontWeight: 800, textTransform: 'uppercase', marginBottom: '6px', display: 'block' }}>
              Gender
            </label>
            <div className={styles.genderButtonGroup}>
              <button
                type="button"
                className={`${styles.genderBtn} ${guestGender === 'male' ? styles.genderBtnMaleActive : ''}`}
                onClick={() => setGuestGender('male')}
              >
                <span>👨 Male</span>
              </button>
              <button
                type="button"
                className={`${styles.genderBtn} ${guestGender === 'female' ? styles.genderBtnFemaleActive : ''}`}
                onClick={() => setGuestGender('female')}
              >
                <span>👩 Female</span>
              </button>
            </div>
          </div>

          <NeoButton
            variant="primary"
            size="lg"
            onClick={handleJoinAsGuest}
            disabled={isJoiningGuest}
          >
            {isJoiningGuest ? 'Joining Space...' : '⚡ Enter Space'}
          </NeoButton>
        </div>
      </NeoModal>

      {/* World Map Fast Travel / Teleport Modal */}
      <NeoModal
        isOpen={mapTeleportModalOpen}
        onClose={() => setMapTeleportModalOpen(false)}
        title="🚀 World Map Teleport & Fast Travel"
      >
        <div className={styles.teleportModalContent}>
          <p className={styles.teleportSubtitle}>
            Instantaneously warp to any district or landmark across the realm:
          </p>
          <div className={styles.zoneGrid}>
            {activeZones.map((zone) => {
              const isCurrent = currentZone.toLowerCase().includes(zone.name.toLowerCase());
              return (
                <div
                  key={zone.id}
                  className={`${styles.zoneCard} ${isCurrent ? styles.zoneCardCurrent : ''}`}
                >
                  <div className={styles.zoneHeader}>
                    <span className={styles.zoneName} style={{ color: zone.color }}>
                      {zone.tag}
                    </span>
                    {isCurrent && <span className={styles.currentIndicator}>Current</span>}
                  </div>
                  <p className={styles.zoneDesc}>{zone.description}</p>
                  <NeoButton
                    size="sm"
                    variant={isCurrent ? 'secondary' : 'primary'}
                    onClick={() => handleTeleportToZone(zone)}
                  >
                    {isCurrent ? '📍 Here Now' : '⚡ Teleport Here'}
                  </NeoButton>
                </div>
              );
            })}
          </div>
        </div>
      </NeoModal>

      {/* Group & DM Call Overlay Container (Stage, Floating Dock, Incoming Ring) */}
      <CallOverlayContainer />
    </div>
  );
}
