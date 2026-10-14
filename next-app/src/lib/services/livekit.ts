import {
  Room,
  RoomEvent,
  VideoTrack,
  Track,
  Participant,
  RemoteTrackPublication,
  RemoteParticipant,
  RemoteAudioTrack,
} from 'livekit-client';
import { supabase } from '../supabase';

export interface VideoFeedModel {
  track: VideoTrack;
  participantName: string;
  participantId: string;
  isScreenShare: boolean;
}

export class LiveKitService {
  private room: Room | null = null;
  isConnected: boolean = false;
  isMicEnabled: boolean = false;
  isCameraEnabled: boolean = false;
  isScreenShareEnabled: boolean = false;

  activeSpeakerIds: Set<string> = new Set();
  remoteVideoFeeds: VideoFeedModel[] = [];

  onStateChanged?: () => void;

  async joinSpaceRoom(spaceId: string, displayName: string): Promise<boolean> {
    try {
      await this.leaveSpaceRoom();

      const { data: { session } } = await supabase.auth.getSession();
      const authToken = session?.access_token;

      if (!authToken) {
        console.warn('Cannot join LiveKit room without active session token');
        return false;
      }

      // Fetch JWT securely from Next.js server route
      const res = await fetch('/api/livekit/token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${authToken}`,
        },
        body: JSON.stringify({ spaceId, displayName }),
      });

      if (!res.ok) {
        console.warn('Failed to get LiveKit token from server route:', await res.text());
        return false;
      }

      const { token } = await res.json();
      const livekitUrl = process.env.NEXT_PUBLIC_LIVEKIT_URL || '';

      if (!livekitUrl) {
        console.warn('Missing NEXT_PUBLIC_LIVEKIT_URL');
        return false;
      }

      this.room = new Room({
        adaptiveStream: true,
        dynacast: true,
      });

      this.setupListeners();

      await this.room.connect(livekitUrl, token);
      this.isConnected = true;
      this.notify();
      return true;
    } catch (e) {
      console.error('Error connecting to LiveKit room:', e);
      this.isConnected = false;
      this.notify();
      return false;
    }
  }

  private setupListeners() {
    if (!this.room) return;

    this.room
      .on(RoomEvent.Disconnected, () => {
        this.isConnected = false;
        this.isMicEnabled = false;
        this.isCameraEnabled = false;
        this.isScreenShareEnabled = false;
        this.activeSpeakerIds.clear();
        this.remoteVideoFeeds = [];
        this.notify();
      })
      .on(RoomEvent.ActiveSpeakersChanged, (speakers: Participant[]) => {
        this.activeSpeakerIds = new Set(speakers.map((s) => s.identity));
        this.notify();
      })
      .on(RoomEvent.TrackSubscribed, () => this.updateRemoteTracks())
      .on(RoomEvent.TrackUnsubscribed, () => this.updateRemoteTracks())
      .on(RoomEvent.ParticipantDisconnected, () => this.updateRemoteTracks());
  }

  private updateRemoteTracks() {
    if (!this.room) return;
    const feeds: VideoFeedModel[] = [];

    for (const participant of this.room.remoteParticipants.values()) {
      for (const pub of participant.videoTrackPublications.values()) {
        if (pub.track && !pub.isMuted) {
          feeds.push({
            track: pub.track as VideoTrack,
            participantName: participant.name || participant.identity || 'Participant',
            participantId: participant.identity,
            isScreenShare: pub.source === Track.Source.ScreenShare,
          });
        }
      }
    }

    this.remoteVideoFeeds = feeds;
    this.notify();
  }

  async toggleMicrophone(): Promise<void> {
    if (!this.room?.localParticipant) return;
    try {
      const next = !this.isMicEnabled;
      await this.room.localParticipant.setMicrophoneEnabled(next);
      this.isMicEnabled = next;
      this.notify();
    } catch (e) {
      console.error('Error toggling microphone:', e);
    }
  }

  async toggleCamera(): Promise<void> {
    if (!this.room?.localParticipant) return;
    try {
      const next = !this.isCameraEnabled;
      await this.room.localParticipant.setCameraEnabled(next);
      this.isCameraEnabled = next;
      this.notify();
    } catch (e) {
      console.error('Error toggling camera:', e);
    }
  }

  async toggleScreenShare(): Promise<void> {
    if (!this.room?.localParticipant) return;
    try {
      const next = !this.isScreenShareEnabled;
      await this.room.localParticipant.setScreenShareEnabled(next);
      this.isScreenShareEnabled = next;
      this.notify();
    } catch (e) {
      console.error('Error toggling screen share:', e);
    }
  }

  /**
   * Spatial Audio Proximity attenuation:
   * - distance <= 80px: 1.0 (100% volume)
   * - distance between 80px and 260px: smooth linear fade down to 0.0
   * - distance > 260px: 0.0 (muted)
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

  async leaveSpaceRoom(): Promise<void> {
    if (this.room) {
      try {
        await this.room.disconnect();
      } catch (_) {}
      this.room = null;
    }
    this.isConnected = false;
    this.isMicEnabled = false;
    this.isCameraEnabled = false;
    this.isScreenShareEnabled = false;
    this.activeSpeakerIds.clear();
    this.remoteVideoFeeds = [];
    this.notify();
  }

  private notify() {
    if (this.onStateChanged) this.onStateChanged();
  }
}
