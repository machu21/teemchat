import { AvatarConfig } from './avatar';
import { VideoTrack } from 'livekit-client';

export type CallType = 'dm' | 'group';

export type CallStatus = 'idle' | 'calling' | 'connected' | 'ended';

export interface CallSessionModel {
  roomId: string;
  type: CallType;
  conversationId: string;
  title: string;
  icon?: string;
  startedBy: string;
  startedByName: string;
  startedAt: string;
  isVideoCall: boolean;
}

export interface CallParticipantModel {
  id: string;
  name: string;
  avatarConfig?: AvatarConfig;
  isLocal: boolean;
  isMuted: boolean;
  isCameraOn: boolean;
  isScreenSharing: boolean;
  isSpeaking: boolean;
  videoTrack?: VideoTrack | MediaStreamTrack | null;
  screenTrack?: VideoTrack | MediaStreamTrack | null;
}

export interface IncomingCallModel {
  roomId: string;
  type: CallType;
  conversationId: string;
  callerId: string;
  callerName: string;
  callerAvatar?: AvatarConfig;
  title: string;
  isVideo: boolean;
  timestamp: number;
}
