'use client';

export const dynamic = 'force-dynamic';

import React, { useEffect, useState, useRef, use } from 'react';
import styles from './world.module.css';
import { useSessionStore } from '@/stores/session';
import { SpaceService } from '@/lib/services/spaces';
import { SpaceModel, defaultHQ } from '@/lib/models/space';
import { WorldSyncService } from '@/lib/services/worldSync';
import { LiveKitService, VideoFeedModel } from '@/lib/services/livekit';
import { ChatService } from '@/lib/services/chat';
import { PlaylistService } from '@/lib/services/playlist';
import { TtsService } from '@/lib/services/tts';
import { ChatMessageModel, CompanionModel } from '@/lib/models/chat';
import { GameCanvas } from '@/game/GameCanvas';
import { FurnitureType } from '@/game/entities/furniture';
import { NeoButton } from '@/components/neo/NeoButton';
import { NeoCard } from '@/components/neo/NeoCard';
import { NeoBadge } from '@/components/neo/NeoBadge';
import { NeoModal } from '@/components/neo/NeoModal';
import { NeoInput } from '@/components/neo/NeoInput';
import { getCurrentZone } from '@/game/map/zones';
import { useRouter } from 'next/navigation';

export default function WorldPage({ params }: { params: Promise<{ code: string }> }) {
  const router = useRouter();
  const resolvedParams = use(params);
  const spaceCode = resolvedParams.code;

  const { session, initSession } = useSessionStore();

  const [space, setSpace] = useState<SpaceModel | null>(null);
  const [syncService, setSyncService] = useState<WorldSyncService | null>(null);
  const [livekit] = useState(() => new LiveKitService());

  const [companion, setCompanion] = useState<CompanionModel | null>(null);
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
  const [companionModalOpen, setCompanionModalOpen] = useState(false);
  const [playlistModalOpen, setPlaylistModalOpen] = useState(false);
  const [buildModeOpen, setBuildModeOpen] = useState(false);
  const [selectedFurniture, setSelectedFurniture] = useState<FurnitureType | null>(null);

  // 1. Initial Space & Session resolution
  useEffect(() => {
    initSession().then(() => {
      const current = useSessionStore.getState().session;
      if (!current) {
        useSessionStore.getState().signInGuest();
      }
    }).catch((err) => {
      console.warn('Error during initSession:', err);
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
    setSyncService(sync);

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
      roomSub?.unsubscribe();
    };
  }, [session, space, livekit]);

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

  const handleProximityChanged = (distances: Map<string, number>) => {
    livekit.updateProximityAudio(distances);
  };

  if (!session || !space || !syncService) {
    return <div className={styles.loadingScreen}>Entering Virtual Realm...</div>;
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
          onCompanionTap={() => setCompanionModalOpen(true)}
          onProximityChanged={handleProximityChanged}
        />
      </div>

      {/* Top HUD */}
      <header className={styles.topHud}>
        <div className={styles.hudLeft}>
          <NeoButton size="sm" variant="secondary" onClick={() => router.push('/dashboard')}>
            ← Leave
          </NeoButton>
          <div className={styles.spaceTitleBadge}>
            <span className={styles.spaceIcon}>🏡</span>
            <span className={styles.spaceName}>{space.name}</span>
          </div>
          <NeoBadge color="#10B981">{currentZone}</NeoBadge>
        </div>

        <div className={styles.hudRight}>
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
                  if (el) feed.track.attach(el);
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
          onClick={() => livekit.toggleMicrophone()}
          title="Toggle Mic"
        >
          {isMicOn ? '🎙️' : '🔇'}
        </button>

        <button
          className={`${styles.dockBtn} ${isCamOn ? styles.dockBtnActive : ''}`}
          onClick={() => livekit.toggleCamera()}
          title="Toggle Camera"
        >
          {isCamOn ? '📹' : '📷'}
        </button>

        <button
          className={`${styles.dockBtn} ${isScreenShareOn ? styles.dockBtnActive : ''}`}
          onClick={() => livekit.toggleScreenShare()}
          title="Screen Share"
        >
          📺
        </button>

        <div className={styles.dockDivider} />

        <button
          className={`${styles.dockBtn} ${chatOpen ? styles.dockBtnActive : ''}`}
          onClick={() => setChatOpen(!chatOpen)}
          title="Toggle Chat"
        >
          💬
        </button>

        <button
          className={`${styles.dockBtn} ${buildModeOpen ? styles.dockBtnActive : ''}`}
          onClick={() => setBuildModeOpen(!buildModeOpen)}
          title="Build Mode"
        >
          🔨
        </button>

        <button
          className={styles.dockBtn}
          onClick={() => setPlaylistModalOpen(true)}
          title="Sound Tripping"
        >
          🎵
        </button>

        <button
          className={styles.dockBtn}
          onClick={() => setCompanionModalOpen(true)}
          title="AI Companion"
        >
          🤖
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
              {(['campfire', 'tent', 'logBench', 'pineTree', 'boulder', 'stoneWell'] as FurnitureType[]).map(
                (f) => (
                  <button
                    key={f}
                    className={`${styles.furnBtn} ${selectedFurniture === f ? styles.furnBtnActive : ''}`}
                    onClick={() => setSelectedFurniture(f)}
                  >
                    {f}
                  </button>
                )
              )}
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
    </div>
  );
}
