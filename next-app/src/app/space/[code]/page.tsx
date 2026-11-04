'use client';

export const dynamic = 'force-dynamic';

import React, { useEffect, useState, useRef, useCallback, use, useMemo } from 'react';
import styles from './world.module.css';
import { useSessionStore } from '@/stores/session';
import { useSocialStore } from '@/stores/social';
import { SpaceService } from '@/lib/services/spaces';
import { SpaceModel, defaultHQ } from '@/lib/models/space';
import { InviteLinkService } from '@/lib/services/invite';
import { getMapConfig, getZonesForMap, ZoneDefinition, MAP_REGISTRY } from '@/game/map/mapRegistry';
import { WorldSyncService } from '@/lib/services/worldSync';
import { LiveKitService, VideoFeedModel, attachTrackToElement } from '@/lib/services/livekit';
import { ChatService } from '@/lib/services/chat';
import { PlaylistService } from '@/lib/services/playlist';
import { ChatMessageModel } from '@/lib/models/chat';
import { removeRealtimeChannel } from '@/lib/supabase';
import { GameCanvas } from '@/game/GameCanvas';
import { FurnitureType } from '@/game/entities/furniture';
import { NeoButton } from '@/components/neo/NeoButton';
import { NeoCard } from '@/components/neo/NeoCard';
import { NeoBadge } from '@/components/neo/NeoBadge';
import { NeoModal } from '@/components/neo/NeoModal';
import { NeoInput } from '@/components/neo/NeoInput';
import { PixelAvatar } from '@/components/neo/PixelAvatar';
import { MapSelector } from '@/components/neo/MapSelector';
import { Gender, defaultMaleAvatarConfig, defaultFemaleAvatarConfig, AvatarConfig } from '@/lib/models/avatar';
import { getOrFetchGuestIdentity, GuestIdentity } from '@/lib/security/guestIdentity';
import { FriendService } from '@/lib/services/friends';
import { CallOverlayContainer } from '@/components/call/CallOverlayContainer';
import { playMuteSound, playUnmuteSound, playScreenShareSound, playChatNotificationSound } from '@/lib/utils/callSounds';
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
import { ScreenHelpBar } from '@/components/companion/ScreenHelpBar';
import { useSpaceCompanion } from '@/lib/hooks/useSpaceCompanion';

export const WORLD_ZONES = MAP_REGISTRY.village.zones;

// 'pingPongTable' -> 'Ping Pong Table'
const formatFurnitureLabel = (type: string) =>
  type.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/^./, (c) => c.toUpperCase());

export default function WorldPage({ params }: { params: Promise<{ code: string }> }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialTargetZone = searchParams?.get('zone') || null;
  const urlTheme = searchParams?.get('theme') || undefined;
  const urlName = searchParams?.get('name') || undefined;
  // Dev-only override: ?mode=zombie forces survival mode on any space for testing.
  const devZombieOverride =
    process.env.NODE_ENV !== 'production' && searchParams?.get('mode') === 'zombie';
  const resolvedParams = use(params);
  const spaceCode = resolvedParams.code;

  const { session, initSession } = useSessionStore();

  const [space, setSpace] = useState<SpaceModel | null>(null);
  // Zombie Survival spaces always run zombie mode on the zombie_city map.
  const isSurvivalSpace = space?.mode === 'zombie';
  const zombieMode = isSurvivalSpace || devZombieOverride;
  const [syncService, setSyncService] = useState<WorldSyncService | null>(null);

  const livekitRef = useRef<LiveKitService | null>(null);
  const getLiveKit = useCallback(() => {
    if (!livekitRef.current) {
      livekitRef.current = new LiveKitService();
    }
    return livekitRef.current;
  }, []);

  const [currentZone, setCurrentZone] = useState('Verdant Village');

  // Media toggles
  const [isMicOn, setIsMicOn] = useState(false);
  const [isCamOn, setIsCamOn] = useState(false);
  const [isScreenShareOn, setIsScreenShareOn] = useState(false);
  const [videoFeeds, setVideoFeeds] = useState<VideoFeedModel[]>([]);
  const [mediaStatusToast, setMediaStatusToast] = useState<{ icon: string; message: string; color: string } | null>(null);
  const toastTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showMediaStatus = useCallback((icon: string, message: string, color: string) => {
    if (toastTimeoutRef.current) {
      clearTimeout(toastTimeoutRef.current);
    }
    setMediaStatusToast({ icon, message, color });
    toastTimeoutRef.current = setTimeout(() => {
      setMediaStatusToast(null);
    }, 2800);
  }, []);

  // Roblox-style Chat state
  const [chatOpen, setChatOpen] = useState(false);
  const [activeChannel, setActiveChannel] = useState<'room' | 'companion'>('room');
  const [roomMessages, setRoomMessages] = useState<ChatMessageModel[]>([]);
  const [chatInput, setChatInput] = useState('');
  const chatScrollRef = useRef<HTMLDivElement | null>(null);


  // Unread Room Chat Notification & Banner state
  const [unreadChatCount, setUnreadChatCount] = useState(0);
  const [chatBanner, setChatBanner] = useState<{ senderName: string; content: string } | null>(null);
  const chatBannerTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const seenMessageIdsRef = useRef<Set<string>>(new Set());
  const isViewingRoomChatRef = useRef(false);

  const clearRoomChatNotifications = useCallback(() => {
    setUnreadChatCount(0);
    setChatBanner(null);
    if (chatBannerTimerRef.current) {
      clearTimeout(chatBannerTimerRef.current);
      chatBannerTimerRef.current = null;
    }
  }, []);

  useEffect(() => {
    isViewingRoomChatRef.current = chatOpen && activeChannel === 'room';
  }, [chatOpen, activeChannel]);

  // Modals & Panels
  const [inviteModalOpen, setInviteModalOpen] = useState(false);
  const [playlistModalOpen, setPlaylistModalOpen] = useState(false);
  const [buildModeOpen, setBuildModeOpen] = useState(false);
  const [selectedFurniture, setSelectedFurniture] = useState<FurnitureType | null>(null);

  // Sound Tripping & MP3 Upload State
  const [playlistState, setPlaylistState] = useState({
    currentTrack: PlaylistService.currentTrack,
    isPlaying: PlaylistService.isPlaying,
    volume: PlaylistService.volume,
    isMuted: PlaylistService.isMuted,
    isLooping: PlaylistService.isLooping,
    currentTime: PlaylistService.currentTime,
    duration: PlaylistService.duration,
    playlist: PlaylistService.playlist,
  });

  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploadTitle, setUploadTitle] = useState('');
  const [uploadArtist, setUploadArtist] = useState('');
  const [isUploadingTrack, setIsUploadingTrack] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    const updateState = () => {
      setPlaylistState({
        currentTrack: PlaylistService.currentTrack,
        isPlaying: PlaylistService.isPlaying,
        volume: PlaylistService.volume,
        isMuted: PlaylistService.isMuted,
        isLooping: PlaylistService.isLooping,
        currentTime: PlaylistService.currentTime,
        duration: PlaylistService.duration,
        playlist: [...PlaylistService.playlist],
      });
    };

    PlaylistService.onStateChanged = updateState;
    PlaylistService.onTimeUpdate = (curr, dur) => {
      setPlaylistState((prev) => ({
        ...prev,
        currentTime: curr,
        duration: dur,
      }));
    };

    updateState();

    return () => {
      PlaylistService.onStateChanged = undefined;
      PlaylistService.onTimeUpdate = undefined;
    };
  }, []);

  const isMapOwner = useMemo(() => {
    if (!space) return false;
    if (!session) return false;
    if (space.ownerId && space.ownerId === session.id) return true;
    if (space.isTemporary && (space.ownerId === session.id || space.ownerId === 'guest')) return true;
    if (!space.ownerId || space.id === defaultHQ().id) return true;
    return false;
  }, [space, session]);

  const handleUploadTrack = async () => {
    if (!uploadFile || !space) return;
    setIsUploadingTrack(true);
    setUploadError(null);
    try {
      const uploaded = await PlaylistService.uploadTrack(
        uploadFile,
        space.id,
        session,
        uploadTitle,
        uploadArtist
      );
      showMediaStatus('🎵', `Uploaded & Playing: "${uploaded.title}"!`, '#10B981');
      setUploadFile(null);
      setUploadTitle('');
      setUploadArtist('');
      if (fileInputRef.current) fileInputRef.current.value = '';
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to upload MP3 file.';
      setUploadError(msg);
      showMediaStatus('⚠️', msg, '#EF4444');
    } finally {
      setIsUploadingTrack(false);
    }
  };

  const formatAudioTime = (seconds: number) => {
    if (isNaN(seconds) || seconds < 0) return '00:00';
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  // World Map Fast Travel / Teleport Modal State
  const [mapTeleportModalOpen, setMapTeleportModalOpen] = useState(false);
  const [mapThemeModalOpen, setMapThemeModalOpen] = useState(false);
  const [targetTeleport, setTargetTeleport] = useState<{
    x: number;
    y: number;
    name?: string;
    seq: number;
  } | null>(null);

  const mapConfig = useMemo(() => getMapConfig(space?.mapTheme), [space?.mapTheme]);
  const activeZones = useMemo(() => getZonesForMap(space?.mapTheme), [space?.mapTheme]);

  const handleSelectMapTheme = useCallback(async (newThemeId: string) => {
    if (!space || space.mode === 'zombie') return;
    try {
      const cfg = MAP_REGISTRY[newThemeId as keyof typeof MAP_REGISTRY] || MAP_REGISTRY.village;
      await SpaceService.updateSpace(space.id, { mapTheme: newThemeId });
      syncService?.broadcastMapTheme(newThemeId);
      setSpace((prev) => (prev ? { ...prev, mapTheme: newThemeId } : null));
      setMapThemeModalOpen(false);
      showMediaStatus('🗺️', `Realm theme changed to ${cfg.name}!`, '#10B981');
    } catch (e) {
      console.warn('Failed to switch map theme:', e);
      showMediaStatus('⚠️', 'Failed to change map theme', '#EF4444');
    }
  }, [space, syncService, showMediaStatus]);

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
  const [guestIdentity, setGuestIdentity] = useState<GuestIdentity | null>(null);
  const [guestGender, setGuestGender] = useState<Gender>('male');
  const [isJoiningGuest, setIsJoiningGuest] = useState(false);

  // Selected Remote Player for Profile & Add Friend
  const [selectedPlayer, setSelectedPlayer] = useState<{
    userId: string;
    displayName: string;
    avatarConfig: AvatarConfig;
  } | null>(null);
  const [friendReqSending, setFriendReqSending] = useState(false);
  const [friendReqSent, setFriendReqSent] = useState(false);
  const [friendReqStatus, setFriendReqStatus] = useState<string | null>(null);
  const socialFriends = useSocialStore((s) => s.friends);
  const isSelectedPlayerFriend = Boolean(
    selectedPlayer && socialFriends.some((f) => f.userId === selectedPlayer.userId)
  );

  // Living AI companion. Guests (guest_* accounts) don't get one; the API enforces this too.
  const companionEnabled = Boolean(session) && !session?.isGuest;
  const {
    companion,
    messages: companionMessages,
    isThinking: isAiThinking,
    sendMessage: sendCompanionMessage,
    screenHelp,
    canvasProps: companionCanvasProps,
    tourEvent: companionTourEvent,
    setTyping: setCompanionTyping,
    onTap: companionOnTap,
    handleProximity: companionHandleProximity,
  } = useSpaceCompanion({
    enabled: companionEnabled,
    userId: session?.id,
    userName: session?.displayName,
    syncService,
    zones: activeZones,
    currentZone,
    mapName: mapConfig.name,
    mode: zombieMode ? 'zombie' : 'social',
    activity: zombieMode
      ? 'zombie_mode'
      : isMicOn
        ? 'in_voice'
        : playlistState.isPlaying
          ? 'listening_music'
          : 'exploring',
    openMap: () => setMapTeleportModalOpen(true),
    openChat: () => {
      setActiveChannel('companion');
      setChatOpen(true);
    },
  });
  const {
    supported: screenHelpSupported,
    active: screenHelpActive,
    starting: screenHelpStarting,
    start: startScreenHelp,
    stop: stopScreenHelp,
  } = screenHelp;

  // Closing the chat panel hides the live indicator, so stop sharing with it
  useEffect(() => {
    if (!chatOpen) stopScreenHelp();
  }, [chatOpen, stopScreenHelp]);

  // Companion tour progress + quiet while the owner is typing to it
  useEffect(() => {
    if (chatOpen) companionTourEvent('chat_opened');
  }, [chatOpen, companionTourEvent]);
  useEffect(() => {
    if (mapTeleportModalOpen) companionTourEvent('map_opened');
  }, [mapTeleportModalOpen, companionTourEvent]);
  useEffect(() => {
    if (playlistModalOpen) companionTourEvent('music_opened');
  }, [playlistModalOpen, companionTourEvent]);
  useEffect(() => {
    if (selectedPlayer) companionTourEvent('player_tapped');
  }, [selectedPlayer, companionTourEvent]);
  useEffect(() => {
    setCompanionTyping(chatOpen && activeChannel === 'companion');
  }, [chatOpen, activeChannel, setCompanionTyping]);
  const [incomingInGameReq, setIncomingInGameReq] = useState<{
    requestId: string;
    senderId: string;
    senderName: string;
    senderAvatar: AvatarConfig;
  } | null>(null);

  // 1. Initial Space & Session resolution
  useEffect(() => {
    initSession().then(() => {
      const current = useSessionStore.getState().session;
      if (!current) {
        getOrFetchGuestIdentity().then((id) => {
          setGuestIdentity(id);
          setGuestName(id.displayName);
          setGuestModalOpen(true);
        }).catch(() => {
          setGuestModalOpen(true);
        });
      }
    }).catch((err) => {
      console.warn('Error during initSession:', err);
      getOrFetchGuestIdentity().then((id) => {
        setGuestIdentity(id);
        setGuestName(id.displayName);
        setGuestModalOpen(true);
      }).catch(() => {
        setGuestModalOpen(true);
      });
    });

    SpaceService.getSpaceByCodeOrSlug(spaceCode, { theme: urlTheme, name: urlName })
      .then((s) => {
        const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
        if (s) {
          if (s.id && !UUID_REGEX.test(s.id)) {
            s.id = `room-${(s.slug || spaceCode).trim().toLowerCase().replace(/[^a-z0-9_-]/g, '')}`;
          }
          setSpace(s);
        } else {
          const raw = spaceCode.trim();
          const cleaned = raw.toLowerCase();
          if (cleaned === 'main-hq' || cleaned === 'b6941fa2-8305-4e00-833c-ca3cd5f08c9b') {
            setSpace(defaultHQ());
          } else {
            const matchedTheme = urlTheme && urlTheme in MAP_REGISTRY
              ? urlTheme
              : ((Object.keys(MAP_REGISTRY) as (keyof typeof MAP_REGISTRY)[]).find((t) =>
                  cleaned.includes(t)
                ) || 'village');
            const cfg = MAP_REGISTRY[matchedTheme as keyof typeof MAP_REGISTRY] || MAP_REGISTRY.village;
            setSpace({
              id: `room-${cleaned.replace(/[^a-z0-9_-]/g, '')}`,
              name: urlName || `${cfg.name} (${raw})`,
              slug: raw,
              description: `Shared Hangout in ${cfg.name}`,
              category: cfg.category,
              visibility: 'public',
              tier: 'free',
              mapTheme: matchedTheme,
              mode: 'social',
              joinCode: raw,
              ownerId: null,
              maxCapacity: 50,
              memberCount: 1,
              paletteIndex: 0,
              isActive: true,
              isTemporary: false,
              createdAt: null,
            });
          }
        }
      })
      .catch((err) => {
        console.warn('Failed to load space, falling back to default HQ:', err);
        setSpace(defaultHQ());
      });
  }, [spaceCode, initSession, urlName, urlTheme]);

  // Invited users of a private space become members (chat, rooms and world objects
  // are member-only there). The RPC is a no-op for codes that aren't invites.
  const sessionUserId = session?.id;
  const spaceVisibility = space?.visibility;
  const spaceOwnerId = space?.ownerId;
  useEffect(() => {
    if (!sessionUserId || spaceVisibility !== 'private' || spaceOwnerId === sessionUserId) return;
    SpaceService.joinSpaceViaInvite(spaceCode);
  }, [sessionUserId, spaceVisibility, spaceOwnerId, spaceCode]);

  // If the session ends while inside (e.g. signed out in another tab), leave the space
  // instead of stalling on the loading screen with a disconnected avatar.
  const hadSessionRef = useRef(false);
  useEffect(() => {
    if (session) {
      hadSessionRef.current = true;
    } else if (hadSessionRef.current) {
      hadSessionRef.current = false;
      router.push('/');
    }
  }, [session, router]);

  const handleJoinAsGuest = async () => {
    setIsJoiningGuest(true);
    try {
      const chosenName = guestName.trim() || guestIdentity?.displayName || 'Explorer';
      await useSessionStore.getState().signInGuest(chosenName, guestGender, guestIdentity?.username);
      setGuestModalOpen(false);
    } catch (err) {
      console.warn('Guest join error:', err);
    } finally {
      setIsJoiningGuest(false);
    }
  };

  // The character setup modal is required to enter; dismissing it leaves the space
  const handleDismissGuestModal = useCallback(() => {
    router.push('/');
  }, [router]);

  const copyToClipboard = useCallback(async (text: string, successMessage: string) => {
    try {
      await navigator.clipboard.writeText(text);
      showMediaStatus('📋', successMessage, '#3B82F6');
    } catch {
      showMediaStatus('⚠️', 'Could not access clipboard. Select the link and copy it manually.', '#EF4444');
    }
  }, [showMediaStatus]);

  const handleToggleMic = async () => {
    const wasOn = isMicOn;
    const nowOn = await getLiveKit().toggleMicrophone();
    if (nowOn === wasOn) {
      showMediaStatus('⚠️', 'Microphone unavailable. Check browser permissions.', '#EF4444');
    } else if (nowOn) {
      playUnmuteSound();
      showMediaStatus('🎙️', 'Microphone is ON (Broadcasting)', '#22C55E');
    } else {
      playMuteSound();
      showMediaStatus('🔇', 'Microphone Muted', '#EF4444');
    }
  };

  const handleToggleCam = async () => {
    const wasOn = isCamOn;
    const nowOn = await getLiveKit().toggleCamera();
    if (nowOn === wasOn) {
      showMediaStatus('⚠️', 'Camera unavailable. Check browser permissions.', '#EF4444');
    } else if (nowOn) {
      playScreenShareSound();
      showMediaStatus('📷', 'Camera is ON (Preview in PiP)', '#38BDF8');
    } else {
      playMuteSound();
      showMediaStatus('🚫', 'Camera Turned Off', '#94A3B8');
    }
  };

  const handleToggleScreenShare = async () => {
    const wasOn = isScreenShareOn;
    const nowOn = await getLiveKit().toggleScreenShare();
    if (nowOn === wasOn) {
      // Cancelling the browser's share picker lands here too, so keep the message soft
      if (!wasOn) showMediaStatus('📺', 'Screen share was not started', '#94A3B8');
    } else if (nowOn) {
      playScreenShareSound();
      showMediaStatus('📺', 'Screen Share Active', '#F59E0B');
    } else {
      playMuteSound();
      showMediaStatus('🛑', 'Screen Share Stopped', '#94A3B8');
    }
  };

  // 2. Initialize WorldSync & LiveKit when session and space are loaded
  useEffect(() => {
    if (!session || !space) return;

    const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    const syncRoomId = (space.id && UUID_REGEX.test(space.id))
      ? space.id
      : `room-${(space.slug || spaceCode).trim().toLowerCase().replace(/[^a-z0-9_-]/g, '')}`;

    const sync = new WorldSyncService({
      spaceId: syncRoomId,
      currentUserId: session.id,
      displayName: session.displayName,
      avatarConfig: session.avatarConfig,
    });

    const handleIncomingRoomMessage = (msg: ChatMessageModel) => {
      const isAlreadySeen = seenMessageIdsRef.current.has(msg.id);
      seenMessageIdsRef.current.add(msg.id);

      setRoomMessages((prev) => (prev.some((m) => m.id === msg.id) ? prev : [...prev, msg]));

      if (
        !isAlreadySeen &&
        msg.senderId !== session.id &&
        !isViewingRoomChatRef.current
      ) {
        setUnreadChatCount((c) => c + 1);
        setChatBanner({
          senderName: msg.senderName || 'Explorer',
          content: msg.content,
        });
        playChatNotificationSound();

        if (chatBannerTimerRef.current) {
          clearTimeout(chatBannerTimerRef.current);
        }
        chatBannerTimerRef.current = setTimeout(() => {
          setChatBanner(null);
        }, 4500);
      }
    };

    sync.onChatMessage = (msg) => {
      handleIncomingRoomMessage(msg);
    };

    // Broadcast payloads are client-supplied and can name any sender. For account-backed users,
    // only act on what the database confirms; purely local guests have no DB rows to check.
    const isAccountUser = UUID_REGEX.test(session.id);

    sync.onFriendRequestReceived = (req) => {
      const show = (verified: typeof req) => {
        showMediaStatus('🤝', `${verified.senderName} sent you a friend request!`, '#3B82F6');
        setIncomingInGameReq(verified);
      };
      if (!isAccountUser) {
        show(req);
        return;
      }
      FriendService.verifyIncomingRequest(req.senderId, session.id)
        .then((dbReq) => {
          if (!dbReq) return;
          // Use the DB id so accepting goes through accept_friend_request.
          show({ ...req, requestId: dbReq.id, senderName: dbReq.senderName, senderAvatar: dbReq.senderAvatar });
        })
        .catch(() => {});
    };

    sync.onFriendResponseReceived = (res) => {
      if (res.action !== 'accept') return;
      const show = () => {
        showMediaStatus('🎉', `${res.receiverName} accepted your friend request!`, '#22C55E');
        setFriendReqSent(true);
        setFriendReqStatus(`✓ You and ${res.receiverName} are now friends!`);
        useSocialStore.getState().refreshFriends(session.id).catch(() => {});
      };
      if (!isAccountUser) {
        // Local-only guests have no friendships table; keep the friend on this device
        FriendService.saveTemporaryFriend({
          id: `temp_friend_${res.receiverId}_${Date.now()}`,
          userId: res.receiverId,
          username: res.receiverId,
          displayName: res.receiverName,
          status: 'available',
          avatarConfig: res.receiverAvatar,
          isOnline: true,
          isTemporary: true,
        });
        show();
        return;
      }
      FriendService.isRequestAccepted(session.id, res.receiverId)
        .then((accepted) => {
          if (accepted) show();
        })
        .catch(() => {});
    };

    const applyMapTheme = (newTheme: string) => {
      if (newTheme && newTheme in MAP_REGISTRY) {
        setSpace((prev) => {
          if (!prev || prev.mapTheme === newTheme) return prev;
          const cfg = MAP_REGISTRY[newTheme as keyof typeof MAP_REGISTRY];
          showMediaStatus('🗺️', `Realm transformed to ${cfg.name}!`, '#3B82F6');
          return {
            ...prev,
            mapTheme: newTheme,
          };
        });
      }
    };

    sync.onMapThemeChanged = (newTheme) => {
      // Survival spaces are locked to the zombie city map.
      if (space.mode === 'zombie') return;
      // Persisted spaces: the owner saves the theme before broadcasting, and RLS blocks anyone
      // else from saving it, so apply the stored value rather than the claimed one.
      if (!UUID_REGEX.test(space.id)) {
        applyMapTheme(newTheme);
        return;
      }
      SpaceService.fetchMapTheme(space.id)
        .then((stored) => {
          if (stored) applyMapTheme(stored);
        })
        .catch(() => {});
    };

    sync.connect();
    queueMicrotask(() => {
      setSyncService(sync);
    });

    const livekit = getLiveKit();

    // Initial LiveKit room connection
    livekit.joinSpaceRoom(syncRoomId, session.displayName).catch((err) => {
      console.warn('LiveKit room connection notice:', err);
    });

    livekit.onStateChanged = () => {
      setIsMicOn(livekit.isMicEnabled);
      setIsCamOn(livekit.isCameraEnabled);
      setIsScreenShareOn(livekit.isScreenShareEnabled);

      const allFeeds: VideoFeedModel[] = [];

      // If local camera is active and track is available, add local preview feed
      if (livekit.isCameraEnabled && livekit.localVideoTrack) {
        allFeeds.push({
          track: livekit.localVideoTrack,
          participantName: `${session.displayName} (You)`,
          participantId: `local-cam-${session.id}`,
          isScreenShare: false,
          isLocal: true,
        });
      }

      // If local screen share is active, add local screen share feed
      if (livekit.isScreenShareEnabled && livekit.localScreenShareTrack) {
        allFeeds.push({
          track: livekit.localScreenShareTrack,
          participantName: `${session.displayName}'s Screen (You)`,
          participantId: `local-screen-${session.id}`,
          isScreenShare: true,
          isLocal: true,
        });
      }

      // Add remote feeds
      allFeeds.push(...livekit.remoteVideoFeeds);
      setVideoFeeds(allFeeds);
    };

    // Load initial 30s room chat (scoped to this space)
    ChatService.fetchMessages('general', space.id)
      .then((msgs) => {
        msgs.forEach((m) => seenMessageIdsRef.current.add(m.id));
        setRoomMessages(msgs);
      })
      .catch((err) => {
        console.warn('Chat messages fetch notice:', err);
      });

    const roomSub = ChatService.listenToRoomMessages(
      'general',
      space.id,
      (msg) => handleIncomingRoomMessage(msg),
      (delId) => setRoomMessages((prev) => prev.filter((m) => m.id !== delId))
    );

    return () => {
      sync.disconnect();
      livekit.leaveSpaceRoom().catch(() => {});
      if (roomSub) {
        removeRealtimeChannel(roomSub);
      }
    };
  }, [session, space, spaceCode, getLiveKit, showMediaStatus]);

  // Playlist lifecycle is keyed on ids, not the session/space objects: auth token refreshes
  // and map-theme changes replace those objects, and resetting then would cut the music.
  const sessionId = session?.id;
  const playlistSpaceId = space?.id;
  useEffect(() => {
    if (!sessionId || !playlistSpaceId) return;
    PlaylistService.loadPlaylist(playlistSpaceId).catch((err) => {
      console.warn('Playlist load notice:', err);
    });
    return () => {
      PlaylistService.reset();
    };
  }, [sessionId, playlistSpaceId]);

  // Load the friends list so the player card can show "✓ Friends"
  useEffect(() => {
    if (!sessionId) return;
    useSocialStore.getState().refreshFriends(sessionId).catch(() => {});
  }, [sessionId]);

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

  // Cleanup media status toast & chat banner timers on unmount
  useEffect(() => {
    return () => {
      if (toastTimeoutRef.current) {
        clearTimeout(toastTimeoutRef.current);
      }
      if (chatBannerTimerRef.current) {
        clearTimeout(chatBannerTimerRef.current);
      }
    };
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
        seenMessageIdsRef.current.add(msg.id);
        setRoomMessages((prev) => (prev.some((m) => m.id === msg.id) ? prev : [...prev, msg]));
        syncService?.broadcastChatMessage(msg);
        syncService?.broadcastSpeech(text);
      } else {
        // Give the user their text back instead of silently dropping it
        setChatInput(text);
        showMediaStatus('⚠️', 'Message not sent. Please try again.', '#EF4444');
      }
    } else {
      // AI Companion Chat Pipeline
      await sendCompanionMessage(text);
    }
  };

  const handleProximityChanged = useCallback((distances: Map<string, number>) => {
    getLiveKit().updateProximityAudio(distances);
    companionHandleProximity(distances);
  }, [getLiveKit, companionHandleProximity]);

  const handleCompanionTap = companionOnTap;

  if (!session || !space || !syncService) {
    return (
      <div className={styles.loadingScreen}>
        <div>Entering Virtual Realm...</div>
        {guestModalOpen && (
          <NeoModal
            isOpen={guestModalOpen}
            onClose={handleDismissGuestModal}
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
          companion={companionEnabled ? companion : null}
          buildMode={buildModeOpen}
          selectedFurniture={selectedFurniture}
          targetTeleport={targetTeleport}
          initialTargetZone={initialTargetZone}
          isMicOn={isMicOn}
          isCamOn={isCamOn}
          onCompanionTap={companionEnabled ? handleCompanionTap : undefined}
          onRemotePlayerTap={(player) => {
            setSelectedPlayer(player);
            setFriendReqSent(false);
            setFriendReqStatus(null);
          }}
          onProximityChanged={handleProximityChanged}
          onZoneChanged={setCurrentZone}
          {...(companionEnabled ? companionCanvasProps : {})}
          zombieMode={zombieMode}
        />
      </div>

      {/* Media Status Pill / Toast */}
      {mediaStatusToast && (
        <div className={styles.mediaStatusPill} role="status">
          <span style={{ fontSize: '1.05rem' }}>{mediaStatusToast.icon}</span>
          <span style={{ color: mediaStatusToast.color }}>{mediaStatusToast.message}</span>
        </div>
      )}

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
          {isMapOwner && !isSurvivalSpace && (
            <NeoButton
              size="sm"
              variant="secondary"
              onClick={() => setMapThemeModalOpen(true)}
              title="Change realm map theme (Map Owner)"
            >
              🗺️ <span className={styles.hudBtnLabel}>Map Theme</span>
            </NeoButton>
          )}
          <NeoButton
            size="sm"
            variant="primary"
            className={styles.hudTeleportBtn}
            onClick={() => setMapTeleportModalOpen(true)}
            title="Fast travel / teleport across the map"
          >
            🚀 <span className={styles.hudBtnLabel}>Teleport</span>
          </NeoButton>
          <NeoButton size="sm" variant="secondary" onClick={() => setInviteModalOpen(true)}>
            🎟️ <span className={styles.hudBtnLabel}>Invite Friends</span>
          </NeoButton>
        </div>
      </header>

      {/* Video PiP Overlay */}
      {videoFeeds.length > 0 && (
        <div className={styles.pipGrid}>
          {videoFeeds.map((feed) => (
            <div
              key={feed.participantId}
              className={`${styles.pipCard} ${feed.isLocal ? styles.pipLocalCard : ''}`}
            >
              <video
                ref={(el) => {
                  attachTrackToElement(feed.track, el);
                }}
                autoPlay
                playsInline
                muted={feed.isLocal}
                className={`${styles.pipVideo} ${feed.isLocal && !feed.isScreenShare ? styles.pipVideoMirrored : ''}`}
              />
              <span className={styles.pipLabel}>
                {feed.isLocal && <span className={styles.pipLiveDot} />}
                {feed.participantName} {feed.isScreenShare ? '📺' : ''}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Bottom Dock */}
      <footer className={styles.bottomDock}>
        <button
          className={`${styles.dockBtn} ${isMicOn ? styles.dockBtnActiveMic : ''}`}
          onClick={handleToggleMic}
          aria-pressed={isMicOn}
          title={isMicOn ? 'Microphone: ON (Broadcasting) - Click to Mute' : 'Microphone: OFF (Muted) - Click to Unmute'}
          aria-label={isMicOn ? 'Microphone: ON (Broadcasting) - Click to Mute' : 'Microphone: OFF (Muted) - Click to Unmute'}
        >
          {isMicOn ? <MicIcon size={20} /> : <MicOffIcon size={20} />}
          {isMicOn && <span className={`${styles.dockIndicatorDot} ${styles.dockDotGreen}`} />}
        </button>

        <button
          className={`${styles.dockBtn} ${isCamOn ? styles.dockBtnActiveCam : ''}`}
          onClick={handleToggleCam}
          aria-pressed={isCamOn}
          title={isCamOn ? 'Camera: ON (Broadcasting) - Click to Turn Off' : 'Camera: OFF - Click to Turn On'}
          aria-label={isCamOn ? 'Camera: ON (Broadcasting) - Click to Turn Off' : 'Camera: OFF - Click to Turn On'}
        >
          {isCamOn ? <VideoIcon size={20} /> : <VideoOffIcon size={20} />}
          {isCamOn && <span className={`${styles.dockIndicatorDot} ${styles.dockDotBlue}`} />}
        </button>

        <button
          className={`${styles.dockBtn} ${isScreenShareOn ? styles.dockBtnActive : ''}`}
          onClick={handleToggleScreenShare}
          aria-pressed={isScreenShareOn}
          title={isScreenShareOn ? 'Stop Screen Share' : 'Screen Share'}
          aria-label={isScreenShareOn ? 'Stop Screen Share' : 'Screen Share'}
        >
          <ScreenShareIcon size={20} />
        </button>

        <div className={styles.dockDivider} />

        <div className={styles.chatDockSection}>
          {chatBanner && !chatOpen && (
            <button
              type="button"
              className={styles.chatNotifyBanner}
              onClick={() => {
                setActiveChannel('room');
                setChatOpen(true);
                clearRoomChatNotifications();
              }}
              aria-label={`New chat from ${chatBanner.senderName}: ${chatBanner.content}`}
            >
              <span className={styles.chatNotifyPulseDot} />
              <span className={styles.chatNotifySender}>{chatBanner.senderName}:</span>
              <span className={styles.chatNotifyPreview}>{chatBanner.content}</span>
            </button>
          )}
          <button
            className={`${styles.dockBtn} ${chatOpen ? styles.dockBtnActive : ''} ${
              unreadChatCount > 0 && !chatOpen ? styles.dockBtnAlertChat : ''
            }`}
            onClick={() => {
              if (!chatOpen) {
                setActiveChannel('room');
                clearRoomChatNotifications();
              }
              setChatOpen(!chatOpen);
            }}
            title={unreadChatCount > 0 ? `Toggle Chat (${unreadChatCount} new)` : 'Toggle Chat'}
            aria-label={unreadChatCount > 0 ? `Toggle Chat (${unreadChatCount} new)` : 'Toggle Chat'}
          >
            <ChatBubbleIcon size={20} />
            {unreadChatCount > 0 && (
              <span className={styles.dockUnreadBadge}>
                {unreadChatCount > 9 ? '9+' : unreadChatCount}
              </span>
            )}
          </button>
        </div>

        <button
          className={`${styles.dockBtn} ${buildModeOpen ? styles.dockBtnActive : ''}`}
          onClick={() => setBuildModeOpen(!buildModeOpen)}
          title="Build Mode"
          aria-label="Build Mode"
        >
          <HammerIcon size={20} />
        </button>

        <button
          className={`${styles.dockBtn} ${playlistState.isPlaying ? styles.dockBtnActive : ''}`}
          onClick={() => setPlaylistModalOpen(true)}
          title={
            playlistState.currentTrack
              ? `Music: ${playlistState.currentTrack.title} (${
                  playlistState.isPlaying ? 'Playing' : 'Paused'
                })`
              : 'Sound Tripping'
          }
          aria-label="Sound Tripping"
        >
          <MusicIcon size={20} />
          {playlistState.isPlaying && (
            <span className={`${styles.dockIndicatorDot} ${styles.dockDotPurple}`} />
          )}
        </button>

        <button
          className={`${styles.dockBtn} ${mapTeleportModalOpen ? styles.dockBtnActive : ''}`}
          onClick={() => setMapTeleportModalOpen(!mapTeleportModalOpen)}
          title="Teleport Across Map"
          aria-label="Teleport Across Map"
        >
          <RocketIcon size={20} />
        </button>

        {companionEnabled && (
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
        )}
      </footer>

      {/* Roblox-Style Chat Box Overlay */}
      {chatOpen && (
        <div className={styles.chatBox}>
          <NeoCard className={styles.chatCard}>
            <div className={styles.chatHeader}>
              <div className={styles.channelTabs}>
                <button
                  className={`${styles.tabBtn} ${activeChannel === 'room' ? styles.tabBtnActive : ''}`}
                  onClick={() => {
                    setActiveChannel('room');
                    clearRoomChatNotifications();
                  }}
                >
                  Room
                  {unreadChatCount > 0 && activeChannel !== 'room' && (
                    <span className={styles.tabUnreadDot}>{unreadChatCount > 9 ? '9+' : unreadChatCount}</span>
                  )}
                </button>
                {companionEnabled && (
                  <button
                    className={`${styles.tabBtn} ${activeChannel === 'companion' ? styles.tabBtnActive : ''}`}
                    onClick={() => setActiveChannel('companion')}
                  >
                    AI Companion
                  </button>
                )}
              </div>
              <button
                type="button"
                className={styles.closeChatBtn}
                onClick={() => setChatOpen(false)}
                aria-label="Close chat"
              >
                ✕
              </button>
            </div>

            {companionEnabled && screenHelpSupported && (screenHelpActive || activeChannel === 'companion') && (
              <ScreenHelpBar
                active={screenHelpActive}
                starting={screenHelpStarting}
                onStart={startScreenHelp}
                onStop={stopScreenHelp}
              />
            )}

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
                <div className={styles.emptyNotice}>
                  Say hello to {companion?.name || 'your companion'}! Ask it anything, or say &quot;give me a tour&quot;.
                </div>
              ) : (
                companionMessages.map((m, idx) => (
                  <div
                    key={idx}
                    className={`${styles.companionBubble} ${
                      m.role === 'user' ? styles.bubbleUser : styles.bubbleAi
                    }`}
                  >
                    <strong>{m.role === 'user' ? 'You' : companion?.name || 'Companion'}:</strong> {m.content}
                    {m.chips?.map((chip) => (
                      <span key={chip} className={styles.companionChip}>
                        {chip}
                      </span>
                    ))}
                    {m.screenshot && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={m.screenshot} alt="Screenshot sent to companion" className={styles.screenshotThumb} />
                    )}
                  </div>
                ))
              )}
              {isAiThinking && <div className={styles.thinking}>Companion is thinking... ⚡</div>}
            </div>

            <form onSubmit={handleSendMessage} className={styles.chatInputRow}>
              <input
                className={styles.chatInput}
                aria-label={activeChannel === 'room' ? 'Room chat message' : 'Message to companion'}
                placeholder={activeChannel === 'room' ? 'Chat with the room...' : 'Ask companion...'}
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
              />
              <button type="submit" className={styles.sendBtn} disabled={!chatInput.trim() || (activeChannel === 'companion' && isAiThinking)}>
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
            <div className={styles.paletteTitle}>
              {selectedFurniture
                ? `Placing ${formatFurnitureLabel(selectedFurniture)}: click the map`
                : 'Pick Furniture (Click Map to Place)'}
            </div>
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
                  onClick={() => setSelectedFurniture(selectedFurniture === f ? null : f)}
                  aria-pressed={selectedFurniture === f}
                >
                  {formatFurnitureLabel(f)}
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
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
            <NeoBadge color="#3B82F6">Map: {mapConfig.name}</NeoBadge>
            {space?.isTemporary && <NeoBadge color="#F59E0B">Temporary Space</NeoBadge>}
          </div>
          <NeoInput
            readOnly
            value={InviteLinkService.generateInviteUrl(space?.slug || spaceCode, {
              theme: space?.mapTheme,
              name: space?.name,
            })}
          />
          <NeoButton
            variant="primary"
            onClick={() => {
              const url = InviteLinkService.generateInviteUrl(space?.slug || spaceCode, {
                theme: space?.mapTheme,
                name: space?.name,
              });
              copyToClipboard(url, 'Copied invite link to clipboard!');
            }}
          >
            📋 Copy Invite Link
          </NeoButton>
        </div>
      </NeoModal>

      {/* Sound Tripping (Playlist & MP3 Studio) Modal */}
      <NeoModal
        isOpen={playlistModalOpen}
        onClose={() => setPlaylistModalOpen(false)}
        title="🎵 Space Soundtrack & Music Studio"
      >
        <div className={styles.playlistModalWrapper}>
          {/* 1. Hero Deck: Now Playing */}
          <div className={styles.nowPlayingCard}>
            <div className={styles.nowPlayingTop}>
              <div
                className={`${styles.vinylDisc} ${
                  playlistState.isPlaying ? styles.vinylDiscSpinning : ''
                }`}
              >
                🎵
              </div>
              <div className={styles.nowPlayingInfo}>
                <div className={styles.nowPlayingBadgeRow}>
                  <NeoBadge color={playlistState.isPlaying ? '#10B981' : '#64748B'}>
                    {playlistState.isPlaying ? '▶ NOW PLAYING' : '⏸ PAUSED'}
                  </NeoBadge>
                  {playlistState.currentTrack?.isDefaultPreset ? (
                    <NeoBadge color="#3B82F6">PRESET</NeoBadge>
                  ) : (
                    <NeoBadge color="#8B5CF6">CUSTOM UPLOAD</NeoBadge>
                  )}
                </div>
                <div className={styles.nowPlayingTitle}>
                  {playlistState.currentTrack?.title || 'No Track Selected'}
                </div>
                <div className={styles.nowPlayingArtist}>
                  {playlistState.currentTrack?.artist || 'Select a track below'}
                </div>
              </div>

              {/* Animated Equalizer Wave */}
              <div className={styles.equalizerWave}>
                <div
                  className={`${styles.eqBar} ${
                    playlistState.isPlaying ? styles.eqBarPlaying : ''
                  }`}
                />
                <div
                  className={`${styles.eqBar} ${
                    playlistState.isPlaying ? styles.eqBarPlaying : ''
                  }`}
                />
                <div
                  className={`${styles.eqBar} ${
                    playlistState.isPlaying ? styles.eqBarPlaying : ''
                  }`}
                />
                <div
                  className={`${styles.eqBar} ${
                    playlistState.isPlaying ? styles.eqBarPlaying : ''
                  }`}
                />
                <div
                  className={`${styles.eqBar} ${
                    playlistState.isPlaying ? styles.eqBarPlaying : ''
                  }`}
                />
              </div>
            </div>

            {/* Progress Scrubber */}
            <div className={styles.progressContainer}>
              <input
                type="range"
                className={styles.progressSlider}
                min={0}
                max={playlistState.duration || 100}
                value={playlistState.currentTime || 0}
                disabled={!isMapOwner}
                onChange={(e) => isMapOwner && PlaylistService.seek(Number(e.target.value))}
                aria-label="Track progress"
              />
              <div className={styles.timeRow}>
                <span>{formatAudioTime(playlistState.currentTime)}</span>
                <span>{formatAudioTime(playlistState.duration)}</span>
              </div>
            </div>

            {/* Main Playback Controls */}
            <div className={styles.controlsRow}>
              <button
                className={styles.secondaryControlBtn}
                disabled={!isMapOwner}
                onClick={() => isMapOwner && PlaylistService.previousTrack()}
                title="Previous Track"
                aria-label="Previous Track"
              >
                ⏮️
              </button>
              <NeoButton
                variant="primary"
                className={styles.playBtnLarge}
                disabled={!isMapOwner}
                title={isMapOwner ? undefined : 'Only the map owner can control music'}
                onClick={() => isMapOwner && PlaylistService.togglePlayPause()}
              >
                {playlistState.isPlaying ? '⏸️ Pause' : '▶️ Play'}
              </NeoButton>
              <button
                className={styles.secondaryControlBtn}
                disabled={!isMapOwner}
                onClick={() => isMapOwner && PlaylistService.nextTrack()}
                title="Next Track"
                aria-label="Next Track"
              >
                ⏭️
              </button>
              <button
                className={`${styles.secondaryControlBtn} ${
                  playlistState.isLooping ? styles.secondaryControlActive : ''
                }`}
                disabled={!isMapOwner}
                onClick={() => isMapOwner && PlaylistService.toggleLoop()}
                title={playlistState.isLooping ? 'Loop: ON' : 'Loop: OFF'}
                aria-label="Toggle Loop"
              >
                🔁
              </button>
            </div>

            {/* Volume Bar */}
            <div className={styles.volumeRow}>
              <button
                className={styles.secondaryControlBtn}
                style={{ width: '28px', height: '28px', fontSize: '0.8rem' }}
                onClick={() => PlaylistService.toggleMute()}
                title={playlistState.isMuted ? 'Unmute' : 'Mute'}
                aria-label="Toggle Mute"
              >
                {playlistState.isMuted || playlistState.volume === 0 ? '🔇' : '🔊'}
              </button>
              <input
                type="range"
                className={styles.volumeSlider}
                min={0}
                max={1}
                step={0.01}
                value={playlistState.isMuted ? 0 : playlistState.volume}
                onChange={(e) => PlaylistService.setVolume(Number(e.target.value))}
                aria-label="Volume slider"
              />
              <span>{Math.round((playlistState.isMuted ? 0 : playlistState.volume) * 100)}%</span>
            </div>
          </div>

          {/* 2. Map Owner MP3 Upload Studio */}
          {isMapOwner ? (
            <div className={styles.uploadStudioCard}>
              <div className={styles.uploadHeaderRow}>
                <span className={styles.uploadTitle}>
                  👑 Map Owner Studio: Upload MP3 Soundtrack
                </span>
                <NeoBadge color="#F59E0B">MP3 AUDIO ONLY</NeoBadge>
              </div>

              {/* Drag & Drop File Area */}
              <div
                className={`${styles.dropZone} ${uploadFile ? styles.dropZoneActive : ''}`}
                onClick={() => fileInputRef.current?.click()}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault();
                  if (e.dataTransfer.files && e.dataTransfer.files[0]) {
                    const f = e.dataTransfer.files[0];
                    if (f.name.toLowerCase().endsWith('.mp3') || f.type.includes('audio')) {
                      setUploadFile(f);
                      setUploadTitle(f.name.replace(/\.(mp3|mpeg)$/i, '').replace(/[_-]/g, ' '));
                      setUploadError(null);
                    } else {
                      setUploadError('Please select a valid MP3 file (.mp3).');
                    }
                  }
                }}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".mp3,audio/mpeg"
                  style={{ display: 'none' }}
                  onChange={(e) => {
                    if (e.target.files && e.target.files[0]) {
                      const f = e.target.files[0];
                      setUploadFile(f);
                      setUploadTitle(f.name.replace(/\.(mp3|mpeg)$/i, '').replace(/[_-]/g, ' '));
                      setUploadError(null);
                    }
                  }}
                />
                <span className={styles.dropZoneIcon}>{uploadFile ? '🎵' : '📁'}</span>
                <span className={styles.dropZoneText}>
                  {uploadFile ? uploadFile.name : 'Click or drop an MP3 audio file here'}
                </span>
                <span className={styles.dropZoneSubtext}>
                  {uploadFile
                    ? `${(uploadFile.size / (1024 * 1024)).toFixed(2)} MB • Ready to upload`
                    : 'Supported: MP3 audio up to 25MB • Saves to your realm'}
                </span>
              </div>

              {uploadFile && (
                <div className={styles.uploadInputsGrid}>
                  <input
                    className={styles.uploadInput}
                    aria-label="Track title"
                    placeholder="Track Title (e.g. Village Tavern Theme)"
                    value={uploadTitle}
                    onChange={(e) => setUploadTitle(e.target.value)}
                  />
                  <input
                    className={styles.uploadInput}
                    aria-label="Artist or composer"
                    placeholder="Artist / Composer"
                    value={uploadArtist}
                    onChange={(e) => setUploadArtist(e.target.value)}
                  />
                </div>
              )}

              {uploadError && <div className={styles.uploadErrorMsg}>{uploadError}</div>}

              {uploadFile && (
                <div className={styles.uploadActionRow}>
                  <NeoButton
                    variant="secondary"
                    size="sm"
                    onClick={() => {
                      setUploadFile(null);
                      setUploadTitle('');
                      setUploadArtist('');
                      setUploadError(null);
                      if (fileInputRef.current) fileInputRef.current.value = '';
                    }}
                  >
                    Cancel
                  </NeoButton>
                  <NeoButton
                    variant="primary"
                    size="sm"
                    disabled={isUploadingTrack}
                    onClick={handleUploadTrack}
                  >
                    {isUploadingTrack ? '⏳ Uploading...' : '🚀 Save & Play Track'}
                  </NeoButton>
                </div>
              )}
            </div>
          ) : (
            <div className={styles.visitorNoticeCard}>
              <span>🎧</span>
              <span>
                Realm Soundtrack is curated by the Map Owner. Sit back and enjoy the ambient tunes!
              </span>
            </div>
          )}

          {/* 3. Space Tracklist */}
          <div className={styles.trackSection}>
            <div className={styles.trackSectionHeader}>
              <span>Tracks ({playlistState.playlist.length})</span>
              <span style={{ fontSize: '0.78rem', color: '#64748B' }}>
                Click any track to listen
              </span>
            </div>

            <div className={styles.trackList}>
              {playlistState.playlist.map((track) => {
                const isActive = playlistState.currentTrack?.id === track.id;
                return (
                  <div
                    key={track.id}
                    className={`${styles.trackItem} ${isActive ? styles.trackItemActive : ''}`}
                    onClick={() => isMapOwner && PlaylistService.playTrack(track)}
                    onKeyDown={(e) => {
                      if (isMapOwner && (e.key === 'Enter' || e.key === ' ')) {
                        e.preventDefault();
                        PlaylistService.playTrack(track);
                      }
                    }}
                    role="button"
                    tabIndex={isMapOwner ? 0 : -1}
                    aria-disabled={!isMapOwner}
                    aria-current={isActive ? 'true' : undefined}
                    style={isMapOwner ? undefined : { cursor: 'not-allowed' }}
                  >
                    <div className={styles.trackItemLeft}>
                      <span className={styles.trackIcon}>
                        {isActive && playlistState.isPlaying ? '🔊' : '▶️'}
                      </span>
                      <div className={styles.trackMeta}>
                        <div className={styles.trackTitleText}>
                          {track.title}
                          {track.isDefaultPreset ? (
                            <span
                              style={{
                                marginLeft: '6px',
                                fontSize: '0.7rem',
                                color: '#059669',
                                fontWeight: 900,
                              }}
                            >
                              [PRESET]
                            </span>
                          ) : (
                            <span
                              style={{
                                marginLeft: '6px',
                                fontSize: '0.7rem',
                                color: '#7C3AED',
                                fontWeight: 900,
                              }}
                            >
                              [CUSTOM]
                            </span>
                          )}
                        </div>
                        <div className={styles.trackArtistText}>{track.artist}</div>
                      </div>
                    </div>

                    <div className={styles.trackItemRight}>
                      <span className={styles.trackDuration}>
                        {formatAudioTime(track.durationSeconds)}
                      </span>
                      {isMapOwner && !track.isDefaultPreset && (
                        <button
                          className={styles.trackDeleteBtn}
                          title="Delete Custom Track"
                          aria-label="Delete Custom Track"
                          onClick={async (e) => {
                            e.stopPropagation();
                            if (confirm(`Remove "${track.title}" from space soundtrack?`)) {
                              try {
                                await PlaylistService.deleteTrack(track.id, space?.id || '', session);
                                showMediaStatus('🗑️', `Deleted "${track.title}"`, '#EF4444');
                              } catch {
                                showMediaStatus('⚠️', `Could not delete "${track.title}"`, '#EF4444');
                              }
                            }
                          }}
                        >
                          ✕
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </NeoModal>

      {/* Guest Character Setup Modal on Direct Link */}
      <NeoModal
        isOpen={guestModalOpen}
        onClose={handleDismissGuestModal}
        title="Join Space: Choose Your Character"
      >
        <div className={styles.characterSetupContent}>
          <div className={styles.avatarStage}>
            <PixelAvatar
              config={guestGender === 'female' ? defaultFemaleAvatarConfig : defaultMaleAvatarConfig}
              size={72}
            />
            <div style={{ marginTop: '8px', fontWeight: 900 }}>{guestName.trim() || guestIdentity?.displayName || 'Explorer'}</div>
            {guestIdentity?.username && (
              <div style={{ fontSize: '0.8rem', fontWeight: 800, color: '#7C3AED', background: 'rgba(124, 58, 237, 0.1)', padding: '2px 8px', borderRadius: '9999px', display: 'inline-block', marginTop: '4px' }}>
                @{guestIdentity.username}
              </div>
            )}
          </div>

          <NeoInput
            label="Your Name"
            value={guestName}
            onChange={(e) => setGuestName(e.target.value)}
            placeholder={guestIdentity?.displayName || "Explorer"}
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

      {/* Map Owner Live Theme Switcher Modal */}
      <NeoModal
        isOpen={mapThemeModalOpen && !isSurvivalSpace}
        onClose={() => setMapThemeModalOpen(false)}
        title="👑 Map Owner Studio: Select Realm Theme"
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem', padding: '4px 0' }}>
          <p style={{ margin: 0, fontSize: '0.9rem', color: '#64748B', fontWeight: 600, lineHeight: 1.5 }}>
            Transform the virtual realm layout live for everyone in this space. All players will seamlessly sync to the selected theme in real-time.
          </p>
          <MapSelector
            selectedTheme={space?.mapTheme || 'village'}
            onSelectTheme={(themeId) => handleSelectMapTheme(themeId)}
          />
        </div>
      </NeoModal>

      {/* Player Profile & Add Friend Modal */}
      <NeoModal
        isOpen={Boolean(selectedPlayer)}
        onClose={() => {
          setSelectedPlayer(null);
          setFriendReqSent(false);
          setFriendReqStatus(null);
        }}
        title="Player Profile"
      >
        {selectedPlayer && (
          <div className={styles.characterSetupContent}>
            <div className={styles.avatarStage}>
              <PixelAvatar config={selectedPlayer.avatarConfig} size={72} />
              <div style={{ marginTop: '8px', fontWeight: 900, fontSize: '1.2rem' }}>
                {selectedPlayer.displayName}
              </div>
              <NeoBadge color="#22C55E">Online in this Space</NeoBadge>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginTop: '16px' }}>
              <NeoButton
                variant="primary"
                size="lg"
                disabled={friendReqSending || friendReqSent || isSelectedPlayerFriend}
                onClick={async () => {
                  if (!session) return;
                  setFriendReqSending(true);
                  const res = await FriendService.sendFriendRequest(
                    session.id,
                    selectedPlayer.userId,
                    { displayName: session.displayName, avatarConfig: session.avatarConfig },
                    { displayName: selectedPlayer.displayName, avatarConfig: selectedPlayer.avatarConfig }
                  );
                  setFriendReqSending(false);
                  if (res.success) {
                    syncService?.broadcastFriendRequest(selectedPlayer.userId);
                    setFriendReqSent(true);
                    setFriendReqStatus(res.message || 'Friend request sent! 🎉');
                    showMediaStatus('🤝', res.message || 'Friend request sent! 🎉', '#22C55E');
                  } else {
                    setFriendReqStatus(res.message || 'Could not send friend request.');
                    showMediaStatus('⚠️', res.message || 'Could not send friend request.', '#EF4444');
                  }
                }}
              >
                {isSelectedPlayerFriend
                  ? '✓ Friends'
                  : friendReqSent
                    ? '✓ Request Sent'
                    : friendReqSending
                      ? 'Sending Request...'
                      : '🤝 Add Friend'}
              </NeoButton>

              {friendReqStatus && (
                <div style={{ textAlign: 'center', fontSize: '0.9rem', fontWeight: 700, color: friendReqSent ? '#16A34A' : '#DC2626' }}>
                  {friendReqStatus}
                </div>
              )}
            </div>
          </div>
        )}
      </NeoModal>

      {/* In-Game Incoming Friend Request Modal */}
      <NeoModal
        isOpen={Boolean(incomingInGameReq)}
        onClose={() => setIncomingInGameReq(null)}
        title="Friend Request Received"
      >
        {incomingInGameReq && (
          <div className={styles.characterSetupContent}>
            <div className={styles.avatarStage}>
              <PixelAvatar config={incomingInGameReq.senderAvatar} size={72} />
              <div style={{ marginTop: '8px', fontWeight: 900, fontSize: '1.2rem' }}>
                {incomingInGameReq.senderName}
              </div>
              <NeoBadge color="#3B82F6">Wants to be friends</NeoBadge>
            </div>
            <div style={{ display: 'flex', gap: '10px', marginTop: '16px' }}>
              <NeoButton
                variant="primary"
                size="md"
                onClick={async () => {
                  if (!session) return;
                  const accepted = await FriendService.respondToRequest(
                    incomingInGameReq.requestId,
                    'accept',
                    {
                      userId: session.id,
                      displayName: session.displayName,
                      avatarConfig: session.avatarConfig,
                    },
                    {
                      senderId: incomingInGameReq.senderId,
                      senderName: incomingInGameReq.senderName,
                      senderAvatar: incomingInGameReq.senderAvatar,
                    }
                  );
                  if (!accepted) {
                    showMediaStatus('⚠️', 'Could not accept the request. Try again.', '#EF4444');
                    return;
                  }
                  useSocialStore.getState().refreshFriends(session.id).catch(() => {});
                  if (syncService) {
                    syncService.broadcastFriendResponse(
                      incomingInGameReq.requestId,
                      incomingInGameReq.senderId,
                      'accept'
                    );
                  }
                  showMediaStatus('🤝', `Now friends with ${incomingInGameReq.senderName}!`, '#22C55E');
                  setIncomingInGameReq(null);
                }}
              >
                ✓ Accept
              </NeoButton>
              <NeoButton
                variant="secondary"
                size="md"
                onClick={async () => {
                  try {
                    await FriendService.respondToRequest(incomingInGameReq.requestId, 'decline');
                  } catch {
                    // Declining is best-effort; the request simply stays pending
                  }
                  setIncomingInGameReq(null);
                }}
              >
                ✕ Decline
              </NeoButton>
            </div>
          </div>
        )}
      </NeoModal>

      {/* Group & DM Call Overlay Container (Stage, Floating Dock, Incoming Ring) */}
      <CallOverlayContainer />
    </div>
  );
}
