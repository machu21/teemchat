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
import { supabase } from '../supabase';

export interface VideoFeedModel {
  track: VideoTrack | MediaStreamTrack;
  participantName: string;
  participantId: string;
  isScreenShare: boolean;
  isLocal?: boolean;
}

export class LiveKitService {
  private room: Room | null = null;
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
    try {
      await this.leaveRoom();

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

          if (res.ok) {
            const { token } = await res.json();
            if (token) {
              this.room = new Room({
                adaptiveStream: true,
                dynacast: true,
              });

              this.setupListeners();
              await this.room.connect(livekitUrl, token);
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
      console.error('Error connecting to room:', e);
      this.isConnected = false;
      this.notify();
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
          } catch (_) {}
        }
      }
    }
  }

  async leaveRoom(): Promise<void> {
    if (this.room) {
      try {
        await this.room.disconnect();
      } catch (_) {}
      this.room = null;
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
      } catch (_) {}
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

