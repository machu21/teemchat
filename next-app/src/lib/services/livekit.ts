import {
  Room,
  RoomEvent,
  VideoTrack,
  Track,
  Participant,
  RemoteAudioTrack,
  LocalVideoTrack,
  LocalTrackPublication,
} from 'livekit-client';
import * as log from 'loglevel';
import { supabase } from '../supabase';

// Demote benign WebRTC data channel teardown notices to warnings so Next.js DevTools
// doesn't trigger false-positive unhandled crash overlays on room leaves or remounts.
if (typeof window !== 'undefined') {
  try {
    const livekitLoggers = [
      'livekit',
      'livekit-room',
      'livekit-engine',
      'livekit-signal',
      'livekit-pc-manager',
      'livekit-pc-transport',
    ];

    for (const name of livekitLoggers) {
      const logger = log.getLogger(name);
      const originalFactory = logger.methodFactory;
      logger.methodFactory = (methodName, level, loggerName) => {
        const rawMethod = originalFactory(methodName, level, loggerName);
        if (methodName === 'error') {
          return (msg: unknown, ...args: unknown[]) => {
            const msgStr = typeof msg === 'string' ? msg : '';
            if (
              msgStr.includes('publisher data channel') &&
              msgStr.includes('closed unexpectedly')
            ) {
              console.warn(`[LiveKit teardown notice] ${msgStr}`, ...args);
              return;
            }
            rawMethod(msg, ...args);
          };
        }
        return rawMethod;
      };
      logger.setLevel(logger.getLevel());
    }
  } catch {
    // Graceful fallback if loglevel is restricted in environment
  }
}

export interface VideoFeedModel {
  track: VideoTrack | MediaStreamTrack;
  participantName: string;
  participantId: string;
  isScreenShare: boolean;
  isLocal?: boolean;
}

export class LiveKitService {
  private room: Room | null = null;
  private connectionEpoch: number = 0;
  isConnected: boolean = false;
  isMicEnabled: boolean = false;
  isCameraEnabled: boolean = false;
  isScreenShareEnabled: boolean = false;

  activeSpeakerIds: Set<string> = new Set();
  remoteVideoFeeds: VideoFeedModel[] = [];

  // Local tracks
  localVideoTrack: VideoTrack | MediaStreamTrack | null = null;
  localScreenShareTrack: VideoTrack | MediaStreamTrack | null = null;

  // Local fallback media streams (when LiveKit cloud server is unconfigured)
  private fallbackMediaStream: MediaStream | null = null;
  private fallbackScreenStream: MediaStream | null = null;
  private isFallbackMode: boolean = false;

  onStateChanged?: () => void;

  /**
   * Universal join room: works for spaces, DMs, and group squad calls
   */
  async joinRoom(
    roomName: string,
    displayName: string,
    options?: { isVideo?: boolean; enableMic?: boolean }
  ): Promise<boolean> {
    let currentEpoch = 0;
    try {
      await this.leaveRoom();
      currentEpoch = ++this.connectionEpoch;

      const { data: { session } } = await supabase.auth.getSession();
      const authToken = session?.access_token || `guest_${Date.now()}`;

      const livekitUrl = process.env.NEXT_PUBLIC_LIVEKIT_URL || '';

      // If LiveKit URL is set, attempt server JWT generation and Room connection
      if (livekitUrl) {
        try {
          const res = await fetch('/api/livekit/token', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${authToken}`,
            },
            body: JSON.stringify({ roomName, displayName }),
          });

          if (currentEpoch !== this.connectionEpoch) {
            return false;
          }

          if (res.ok) {
            const { token } = await res.json();
            if (token) {
              if (currentEpoch !== this.connectionEpoch) {
                return false;
              }

              const newRoom = new Room({
                adaptiveStream: true,
                dynacast: true,
              });

              this.room = newRoom;
              this.setupListeners();
              await newRoom.connect(livekitUrl, token);

              // If connection was invalidated during connect, teardown aborted room
              if (currentEpoch !== this.connectionEpoch) {
                try {
                  newRoom.removeAllListeners();
                  await newRoom.disconnect();
                } catch {
                  // Suppress abort errors
                }
                return false;
              }

              this.isConnected = true;
              this.isFallbackMode = false;

              // If video was requested on start (e.g. video call)
              if (options?.isVideo) {
                await this.toggleCamera();
              }
              if (options?.enableMic) {
                await this.toggleMicrophone();
              }

              this.notify();
              return true;
            }
          }
        } catch (serverErr) {
          console.warn('LiveKit server route error, falling back to local media mode:', serverErr);
        }
      }

      if (currentEpoch !== this.connectionEpoch) {
        return false;
      }

      // Fallback local WebRTC / media stream mode for dev & offline support
      this.isFallbackMode = true;
      this.isConnected = true;

      if (options?.isVideo) {
        await this.toggleCamera();
      }
      if (options?.enableMic) {
        await this.toggleMicrophone();
      }

      this.notify();
      return true;
    } catch (e) {
      if (currentEpoch === this.connectionEpoch) {
        console.error('Error connecting to room:', e);
        this.isConnected = false;
        this.notify();
      }
      return false;
    }
  }

  async joinSpaceRoom(spaceId: string, displayName: string): Promise<boolean> {
    return this.joinRoom(`space-${spaceId}`, displayName);
  }

  async joinCallRoom(
    roomName: string,
    displayName: string,
    options?: { isVideo?: boolean; enableMic?: boolean }
  ): Promise<boolean> {
    return this.joinRoom(roomName, displayName, options);
  }

  private setupListeners() {
    if (!this.room) return;

    this.room
      .on(RoomEvent.Disconnected, () => {
        this.resetState();
        this.notify();
      })
      .on(RoomEvent.ActiveSpeakersChanged, (speakers: Participant[]) => {
        this.activeSpeakerIds = new Set(speakers.map((s) => s.identity));
        this.notify();
      })
      .on(RoomEvent.TrackSubscribed, () => this.updateTracks())
      .on(RoomEvent.TrackUnsubscribed, () => this.updateTracks())
      .on(RoomEvent.LocalTrackPublished, () => this.updateTracks())
      .on(RoomEvent.LocalTrackUnpublished, () => this.updateTracks())
      .on(RoomEvent.ParticipantConnected, () => this.updateTracks())
      .on(RoomEvent.ParticipantDisconnected, () => this.updateTracks());
  }

  private updateTracks() {
    if (!this.room) return;
    const feeds: VideoFeedModel[] = [];

    // 1. Update local video & screen tracks
    const localVideoPub = this.room.localParticipant.getTrackPublication(Track.Source.Camera) as LocalTrackPublication | undefined;
    this.localVideoTrack = (localVideoPub?.track as LocalVideoTrack) || null;

    const localScreenPub = this.room.localParticipant.getTrackPublication(Track.Source.ScreenShare) as LocalTrackPublication | undefined;
    this.localScreenShareTrack = (localScreenPub?.track as LocalVideoTrack) || null;

    // 2. Remote participant feeds
    for (const participant of this.room.remoteParticipants.values()) {
      for (const pub of participant.videoTrackPublications.values()) {
        if (pub.track && !pub.isMuted) {
          feeds.push({
            track: pub.track as VideoTrack,
            participantName: participant.name || participant.identity || 'Participant',
            participantId: participant.identity,
            isScreenShare: pub.source === Track.Source.ScreenShare,
            isLocal: false,
          });
        }
      }
    }

    this.remoteVideoFeeds = feeds;
    this.notify();
  }

  async toggleMicrophone(): Promise<void> {
    const next = !this.isMicEnabled;

    if (this.room?.localParticipant) {
      try {
        await this.room.localParticipant.setMicrophoneEnabled(next);
        this.isMicEnabled = next;
        this.notify();
        return;
      } catch (e) {
        console.error('Error toggling LiveKit microphone:', e);
      }
    }

    // Fallback browser getUserMedia
    try {
      if (next) {
        if (typeof navigator !== 'undefined' && navigator.mediaDevices?.getUserMedia) {
          const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
          if (!this.fallbackMediaStream) {
            this.fallbackMediaStream = stream;
          } else {
            stream.getAudioTracks().forEach((t) => this.fallbackMediaStream?.addTrack(t));
          }
        }
      } else {
        this.fallbackMediaStream?.getAudioTracks().forEach((t) => t.stop());
      }
      this.isMicEnabled = next;
      this.notify();
    } catch (e) {
      console.warn('Microphone permission or toggle error:', e);
      this.isMicEnabled = next; // Allow simulation toggle
      this.notify();
    }
  }

  async toggleCamera(): Promise<void> {
    const next = !this.isCameraEnabled;

    if (this.room?.localParticipant) {
      try {
        await this.room.localParticipant.setCameraEnabled(next);
        this.isCameraEnabled = next;
        this.updateTracks();
        this.notify();
        return;
      } catch (e) {
        console.error('Error toggling LiveKit camera:', e);
      }
    }

    // Fallback browser getUserMedia
    try {
      if (next) {
        if (typeof navigator !== 'undefined' && navigator.mediaDevices?.getUserMedia) {
          const stream = await navigator.mediaDevices.getUserMedia({ video: true });
          const videoTrack = stream.getVideoTracks()[0];
          this.localVideoTrack = videoTrack || null;
          if (!this.fallbackMediaStream) {
            this.fallbackMediaStream = stream;
          } else if (videoTrack) {
            this.fallbackMediaStream.addTrack(videoTrack);
          }
        }
      } else {
        if (this.localVideoTrack && 'stop' in this.localVideoTrack) {
          this.localVideoTrack.stop();
        }
        this.localVideoTrack = null;
        this.fallbackMediaStream?.getVideoTracks().forEach((t) => t.stop());
      }
      this.isCameraEnabled = next;
      this.notify();
    } catch (e) {
      console.warn('Camera permission or toggle error:', e);
      this.isCameraEnabled = next; // Allow simulation toggle
      this.notify();
    }
  }

  async toggleScreenShare(): Promise<void> {
    const next = !this.isScreenShareEnabled;

    if (this.room?.localParticipant) {
      try {
        await this.room.localParticipant.setScreenShareEnabled(next);
        this.isScreenShareEnabled = next;
        this.updateTracks();
        this.notify();
        return;
      } catch (e) {
        console.error('Error toggling LiveKit screen share:', e);
      }
    }

    // Fallback browser getDisplayMedia
    try {
      if (next) {
        if (typeof navigator !== 'undefined' && navigator.mediaDevices?.getDisplayMedia) {
          const stream = await navigator.mediaDevices.getDisplayMedia({ video: true });
          const screenTrack = stream.getVideoTracks()[0];
          this.localScreenShareTrack = screenTrack || null;
          this.fallbackScreenStream = stream;

          screenTrack.onended = () => {
            this.isScreenShareEnabled = false;
            this.localScreenShareTrack = null;
            this.notify();
          };
        }
      } else {
        if (this.localScreenShareTrack && 'stop' in this.localScreenShareTrack) {
          this.localScreenShareTrack.stop();
        }
        this.localScreenShareTrack = null;
        this.fallbackScreenStream?.getVideoTracks().forEach((t) => t.stop());
        this.fallbackScreenStream = null;
      }
      this.isScreenShareEnabled = next;
      this.notify();
    } catch (e) {
      console.warn('Screen share permission or toggle error:', e);
      this.isScreenShareEnabled = false;
      this.notify();
    }
  }

  /**
   * Spatial Audio Proximity attenuation for 2D game worlds:
   */
  updateProximityAudio(userDistances: Map<string, number>): void {
    if (!this.room) return;

    for (const [userId, distance] of userDistances.entries()) {
      const participant = this.room.remoteParticipants.get(userId);
      if (!participant) continue;

      let volume = 0.0;
      if (distance <= 80) {
        volume = 1.0;
      } else if (distance < 260) {
        volume = 1.0 - (distance - 80) / 180;
      } else {
        volume = 0.0;
      }

      for (const pub of participant.audioTrackPublications.values()) {
        if (pub.track) {
          try {
            (pub.track as RemoteAudioTrack).setVolume(volume);
          } catch {
            // Ignore volume adjustment errors on transient tracks
          }
        }
      }
    }
  }

  async leaveRoom(): Promise<void> {
    this.connectionEpoch++; // Invalidate pending join connection attempts

    if (this.room) {
      const roomToDisconnect = this.room;
      this.room = null;
      try {
        roomToDisconnect.removeAllListeners();
        await roomToDisconnect.disconnect();
      } catch {
        // Suppress teardown errors on exiting room
      }
    }

    // Stop and clean up any fallback local tracks
    if (this.fallbackMediaStream) {
      this.fallbackMediaStream.getTracks().forEach((t) => t.stop());
      this.fallbackMediaStream = null;
    }
    if (this.fallbackScreenStream) {
      this.fallbackScreenStream.getTracks().forEach((t) => t.stop());
      this.fallbackScreenStream = null;
    }

    this.resetState();
    this.notify();
  }

  async leaveSpaceRoom(): Promise<void> {
    return this.leaveRoom();
  }

  async leaveCallRoom(): Promise<void> {
    return this.leaveRoom();
  }

  private resetState() {
    this.isConnected = false;
    this.isMicEnabled = false;
    this.isCameraEnabled = false;
    this.isScreenShareEnabled = false;
    this.localVideoTrack = null;
    this.localScreenShareTrack = null;
    this.activeSpeakerIds.clear();
    this.remoteVideoFeeds = [];
    this.isFallbackMode = false;
  }

  private notify() {
    if (this.onStateChanged) this.onStateChanged();
  }
}

// Global singleton instance for call sessions
export const globalCallLiveKit = new LiveKitService();

/**
 * Type-safe track attachment helper for both LiveKit VideoTrack and browser MediaStreamTrack
 */
export function attachTrackToElement(
  track: VideoTrack | MediaStreamTrack | null | undefined,
  element: HTMLVideoElement | null
): () => void {
  if (!element || !track) {
    if (element) element.srcObject = null;
    return () => {};
  }

  if ('attach' in track && typeof track.attach === 'function') {
    const videoTrack = track as VideoTrack;
    videoTrack.attach(element);
    return () => {
      try {
        videoTrack.detach(element);
      } catch {
        // Suppress detach errors
      }
    };
  }

  if ('kind' in track && track.kind === 'video') {
    const stream = new MediaStream([track as MediaStreamTrack]);
    element.srcObject = stream;
    return () => {
      element.srcObject = null;
    };
  }

  return () => {};
}

