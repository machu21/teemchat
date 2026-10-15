import { create } from 'zustand';
import {
  CallSessionModel,
  CallParticipantModel,
  IncomingCallModel,
  CallStatus,
  CallType,
} from '../lib/models/call';
import { AvatarConfig } from '../lib/models/avatar';
import { globalCallLiveKit, VideoFeedModel } from '../lib/services/livekit';
import { CallService, CallSignalingEvent } from '../lib/services/callService';
import {
  playJoinCallSound,
  playLeaveCallSound,
  playMuteSound,
  playUnmuteSound,
  playScreenShareSound,
  startCallRing,
  stopCallRing,
} from '../lib/utils/callSounds';

interface CallState {
  currentCall: CallSessionModel | null;
  status: CallStatus;
  incomingCall: IncomingCallModel | null;
  isStageMaximized: boolean;
  isMinimized: boolean;
  isChatDrawerOpenInStage: boolean;
  participants: CallParticipantModel[];
  isMicMuted: boolean;
  isCameraActive: boolean;
  isScreenSharing: boolean;
  remoteFeeds: VideoFeedModel[];
  activeSpeakerIds: Set<string>;
  callDurationSeconds: number;

  // Actions
  startCall: (params: {
    type: CallType;
    conversationId: string;
    title: string;
    icon?: string;
    isVideo?: boolean;
    user: { id: string; name: string; avatarConfig?: AvatarConfig };
  }) => Promise<boolean>;

  joinCall: (params: {
    roomId: string;
    type: CallType;
    conversationId: string;
    title: string;
    icon?: string;
    isVideo?: boolean;
    user: { id: string; name: string; avatarConfig?: AvatarConfig };
  }) => Promise<boolean>;

  leaveCall: () => Promise<void>;

  toggleMic: () => Promise<void>;
  toggleCamera: () => Promise<void>;
  toggleScreenShare: () => Promise<void>;

  setStageMaximized: (max: boolean) => void;
  setMinimized: (min: boolean) => void;
  toggleChatDrawerInStage: () => void;

  acceptIncomingCall: (withVideo?: boolean, currentUser?: { id: string; name: string; avatarConfig?: AvatarConfig }) => Promise<void>;
  declineIncomingCall: () => void;

  initSignaling: (userId: string) => void;
  cleanupSignaling: () => void;
}

let signalingUnsub: (() => void) | null = null;
let durationTimer: ReturnType<typeof setInterval> | null = null;

export const useCallStore = create<CallState>((set, get) => ({
  currentCall: null,
  status: 'idle',
  incomingCall: null,
  isStageMaximized: false,
  isMinimized: false,
  isChatDrawerOpenInStage: false,
  participants: [],
  isMicMuted: false,
  isCameraActive: false,
  isScreenSharing: false,
  remoteFeeds: [],
  activeSpeakerIds: new Set(),
  callDurationSeconds: 0,

  initSignaling: (userId: string) => {
    CallService.init(userId);

    if (signalingUnsub) {
      signalingUnsub();
      signalingUnsub = null;
    }

    signalingUnsub = CallService.subscribe((event: CallSignalingEvent) => {
      const state = get();

      // Incoming call ring
      if (event.type === 'ring') {
        if (event.senderId !== userId && state.status === 'idle') {
          set({
            incomingCall: {
              roomId: event.roomId,
              type: event.callType,
              conversationId: event.conversationId,
              callerId: event.senderId,
              callerName: event.senderName,
              callerAvatar: event.senderAvatar,
              title: event.title,
              isVideo: event.isVideo,
              timestamp: event.timestamp,
            },
          });
          startCallRing();
        }
      }

      // Someone declined the call
      if (event.type === 'declined') {
        if (state.currentCall && state.currentCall.roomId === event.roomId) {
          if (state.participants.length <= 1) {
            // No other participants, return to idle
            get().leaveCall();
          }
        }
      }

      // Remote participant joined
      if (event.type === 'joined' || event.type === 'answered') {
        if (state.currentCall && state.currentCall.roomId === event.roomId && event.senderId !== userId) {
          const exists = state.participants.some((p) => p.id === event.senderId);
          if (!exists) {
            const newParticipant: CallParticipantModel = {
              id: event.senderId,
              name: event.senderName,
              avatarConfig: event.senderAvatar,
              isLocal: false,
              isMuted: false,
              isCameraOn: event.isVideo,
              isScreenSharing: false,
              isSpeaking: false,
            };
            set({ participants: [...state.participants, newParticipant] });
          }
        }
      }

      // Remote participant left
      if (event.type === 'left') {
        if (state.currentCall && state.currentCall.roomId === event.roomId) {
          set({
            participants: state.participants.filter((p) => p.id !== event.senderId),
          });
        }
      }

      // Participant state sync (mute/cam/screen)
      if (event.type === 'state_sync') {
        if (state.currentCall && state.currentCall.roomId === event.roomId && event.senderId !== userId) {
          set({
            participants: state.participants.map((p) => {
              if (p.id === event.senderId && event.participantState) {
                return { ...p, ...event.participantState };
              }
              return p;
            }),
          });
        }
      }
    });

    // Wire up LiveKit state changes
    globalCallLiveKit.onStateChanged = () => {
      const isMicOn = globalCallLiveKit.isMicEnabled;
      const isCamOn = globalCallLiveKit.isCameraEnabled;
      const isScreenOn = globalCallLiveKit.isScreenShareEnabled;
      const feeds = globalCallLiveKit.remoteVideoFeeds;
      const speakers = globalCallLiveKit.activeSpeakerIds;

      set((s) => ({
        isMicMuted: !isMicOn,
        isCameraActive: isCamOn,
        isScreenSharing: isScreenOn,
        remoteFeeds: [...feeds],
        activeSpeakerIds: new Set(speakers),
        participants: s.participants.map((p) => {
          if (p.isLocal) {
            return {
              ...p,
              isMuted: !isMicOn,
              isCameraOn: isCamOn,
              isScreenSharing: isScreenOn,
              isSpeaking: speakers.has(p.id),
              videoTrack: globalCallLiveKit.localVideoTrack,
              screenTrack: globalCallLiveKit.localScreenShareTrack,
            };
          }
          // For remote participants, map their video feeds
          const remoteFeed = feeds.find((f) => f.participantId === p.id && !f.isScreenShare);
          const screenFeed = feeds.find((f) => f.participantId === p.id && f.isScreenShare);
          return {
            ...p,
            isSpeaking: speakers.has(p.id),
            videoTrack: remoteFeed?.track || p.videoTrack,
            screenTrack: screenFeed?.track || p.screenTrack,
            isCameraOn: Boolean(remoteFeed) || p.isCameraOn,
            isScreenSharing: Boolean(screenFeed) || p.isScreenSharing,
          };
        }),
      }));
    };
  },

  cleanupSignaling: () => {
    if (signalingUnsub) {
      signalingUnsub();
      signalingUnsub = null;
    }
    stopCallRing();
    CallService.cleanup();
  },

  startCall: async (params) => {
    const { type, conversationId, title, icon, isVideo = false, user } = params;

    // Build deterministic room ID
    const roomId = `call-${type}-${conversationId}`;

    const session: CallSessionModel = {
      roomId,
      type,
      conversationId,
      title,
      icon,
      startedBy: user.id,
      startedByName: user.name,
      startedAt: new Date().toISOString(),
      isVideoCall: isVideo,
    };

    set({
      currentCall: session,
      status: 'calling',
      callDurationSeconds: 0,
      isStageMaximized: false,
      isMinimized: false,
      participants: [
        {
          id: user.id,
          name: `${user.name} (You)`,
          avatarConfig: user.avatarConfig,
          isLocal: true,
          isMuted: false,
          isCameraOn: isVideo,
          isScreenSharing: false,
          isSpeaking: false,
        },
      ],
    });

    // Start timer
    if (durationTimer) clearInterval(durationTimer);
    durationTimer = setInterval(() => {
      set((s) => ({ callDurationSeconds: s.callDurationSeconds + 1 }));
    }, 1000);

    // Join LiveKit Room
    await globalCallLiveKit.joinCallRoom(roomId, user.name, {
      isVideo,
      enableMic: true,
    });

    playJoinCallSound();

    // Broadcast ring to participants
    await CallService.broadcastEvent({
      type: 'ring',
      roomId,
      callType: type,
      conversationId,
      senderId: user.id,
      senderName: user.name,
      senderAvatar: user.avatarConfig,
      title,
      isVideo,
    });

    set({ status: 'connected' });
    return true;
  },

  joinCall: async (params) => {
    const { roomId, type, conversationId, title, icon, isVideo = false, user } = params;

    const session: CallSessionModel = {
      roomId,
      type,
      conversationId,
      title,
      icon,
      startedBy: user.id,
      startedByName: user.name,
      startedAt: new Date().toISOString(),
      isVideoCall: isVideo,
    };

    set({
      currentCall: session,
      status: 'connected',
      callDurationSeconds: 0,
      isStageMaximized: false,
      isMinimized: false,
      participants: [
        {
          id: user.id,
          name: `${user.name} (You)`,
          avatarConfig: user.avatarConfig,
          isLocal: true,
          isMuted: false,
          isCameraOn: isVideo,
          isScreenSharing: false,
          isSpeaking: false,
        },
      ],
    });

    if (durationTimer) clearInterval(durationTimer);
    durationTimer = setInterval(() => {
      set((s) => ({ callDurationSeconds: s.callDurationSeconds + 1 }));
    }, 1000);

    await globalCallLiveKit.joinCallRoom(roomId, user.name, {
      isVideo,
      enableMic: true,
    });

    playJoinCallSound();

    await CallService.broadcastEvent({
      type: 'joined',
      roomId,
      callType: type,
      conversationId,
      senderId: user.id,
      senderName: user.name,
      senderAvatar: user.avatarConfig,
      title,
      isVideo,
    });

    return true;
  },

  leaveCall: async () => {
    const { currentCall, participants } = get();

    if (durationTimer) {
      clearInterval(durationTimer);
      durationTimer = null;
    }

    playLeaveCallSound();

    if (currentCall) {
      const local = participants.find((p) => p.isLocal);
      await CallService.broadcastEvent({
        type: 'left',
        roomId: currentCall.roomId,
        callType: currentCall.type,
        conversationId: currentCall.conversationId,
        senderId: local?.id || 'unknown',
        senderName: local?.name || 'Explorer',
        title: currentCall.title,
        isVideo: false,
      });
    }

    await globalCallLiveKit.leaveCallRoom();

    set({
      currentCall: null,
      status: 'idle',
      participants: [],
      remoteFeeds: [],
      isMicMuted: false,
      isCameraActive: false,
      isScreenSharing: false,
      isStageMaximized: false,
      isMinimized: false,
      callDurationSeconds: 0,
    });
  },

  toggleMic: async () => {
    const isMutedNow = get().isMicMuted;
    if (isMutedNow) {
      playUnmuteSound();
    } else {
      playMuteSound();
    }

    await globalCallLiveKit.toggleMicrophone();
    const nextMuted = !globalCallLiveKit.isMicEnabled;

    set((s) => ({
      isMicMuted: nextMuted,
      participants: s.participants.map((p) =>
        p.isLocal ? { ...p, isMuted: nextMuted } : p
      ),
    }));

    const { currentCall, participants } = get();
    const local = participants.find((p) => p.isLocal);

    if (currentCall && local) {
      CallService.broadcastEvent({
        type: 'state_sync',
        roomId: currentCall.roomId,
        callType: currentCall.type,
        conversationId: currentCall.conversationId,
        senderId: local.id,
        senderName: local.name,
        title: currentCall.title,
        isVideo: get().isCameraActive,
        participantState: { isMuted: nextMuted },
      });
    }
  },

  toggleCamera: async () => {
    await globalCallLiveKit.toggleCamera();
    const nextCam = globalCallLiveKit.isCameraEnabled;

    set((s) => ({
      isCameraActive: nextCam,
      participants: s.participants.map((p) =>
        p.isLocal
          ? {
              ...p,
              isCameraOn: nextCam,
              videoTrack: globalCallLiveKit.localVideoTrack,
            }
          : p
      ),
    }));

    const { currentCall, participants } = get();
    const local = participants.find((p) => p.isLocal);

    if (currentCall && local) {
      CallService.broadcastEvent({
        type: 'state_sync',
        roomId: currentCall.roomId,
        callType: currentCall.type,
        conversationId: currentCall.conversationId,
        senderId: local.id,
        senderName: local.name,
        title: currentCall.title,
        isVideo: nextCam,
        participantState: { isCameraOn: nextCam },
      });
    }
  },

  toggleScreenShare: async () => {
    const currentlySharing = get().isScreenSharing;
    if (!currentlySharing) {
      playScreenShareSound();
    }

    await globalCallLiveKit.toggleScreenShare();
    const nextScreen = globalCallLiveKit.isScreenShareEnabled;

    set((s) => ({
      isScreenSharing: nextScreen,
      participants: s.participants.map((p) =>
        p.isLocal
          ? {
              ...p,
              isScreenSharing: nextScreen,
              screenTrack: globalCallLiveKit.localScreenShareTrack,
            }
          : p
      ),
    }));

    const { currentCall, participants } = get();
    const local = participants.find((p) => p.isLocal);

    if (currentCall && local) {
      CallService.broadcastEvent({
        type: 'state_sync',
        roomId: currentCall.roomId,
        callType: currentCall.type,
        conversationId: currentCall.conversationId,
        senderId: local.id,
        senderName: local.name,
        title: currentCall.title,
        isVideo: get().isCameraActive,
        participantState: { isScreenSharing: nextScreen },
      });
    }
  },

  setStageMaximized: (max: boolean) => {
    set({ isStageMaximized: max, isMinimized: false });
  },

  setMinimized: (min: boolean) => {
    set({ isMinimized: min, isStageMaximized: false });
  },

  toggleChatDrawerInStage: () => {
    set((s) => ({ isChatDrawerOpenInStage: !s.isChatDrawerOpenInStage }));
  },

  acceptIncomingCall: async (withVideo = false, currentUser) => {
    const { incomingCall } = get();
    stopCallRing();

    if (!incomingCall || !currentUser) {
      set({ incomingCall: null });
      return;
    }

    const { roomId, type, conversationId, title } = incomingCall;
    set({ incomingCall: null });

    await get().joinCall({
      roomId,
      type,
      conversationId,
      title,
      isVideo: withVideo || incomingCall.isVideo,
      user: currentUser,
    });
  },

  declineIncomingCall: () => {
    const { incomingCall } = get();
    stopCallRing();

    if (incomingCall) {
      CallService.broadcastEvent({
        type: 'declined',
        roomId: incomingCall.roomId,
        callType: incomingCall.type,
        conversationId: incomingCall.conversationId,
        senderId: 'declined-user',
        senderName: 'User',
        title: incomingCall.title,
        isVideo: false,
      });
    }

    set({ incomingCall: null });
  },
}));
