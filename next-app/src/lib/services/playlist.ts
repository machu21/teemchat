import { PlaylistTrack, defaultPlaylistPresets } from '../models/chat';
import { supabase } from '../supabase';
import { UserSession } from '../models/user';

export class PlaylistService {
  private static audio: HTMLAudioElement | null = null;
  static currentTrack: PlaylistTrack | null = null;
  static isPlaying: boolean = false;
  static volume: number = 0.7;
  static isLooping: boolean = true;
  static playlist: PlaylistTrack[] = [];

  static onStateChanged?: () => void;

  private static init() {
    if (!this.audio && typeof window !== 'undefined') {
      this.audio = new Audio();
      this.audio.volume = this.volume;
      this.audio.onended = () => this.nextTrack();
    }
  }

  static async loadPlaylist(spaceId: string): Promise<void> {
    this.init();
    let cloudTracks: PlaylistTrack[] = [];

    try {
      const { data } = await supabase
        .from('space_playlists')
        .select('*')
        .eq('space_id', spaceId)
        .order('created_at', { ascending: true });

      if (data && data.length > 0) {
        cloudTracks = data.map((d) => ({
          id: d.id,
          spaceId: d.space_id,
          title: d.title,
          artist: d.artist,
          audioUrl: d.audio_url,
          durationSeconds: d.duration_seconds || 180,
          createdBy: d.created_by,
          createdAt: d.created_at,
          isDefaultPreset: false,
        }));
      }
    } catch (_) {}

    const presets = defaultPlaylistPresets(spaceId);
    this.playlist = [...presets, ...cloudTracks];

    if (!this.currentTrack && this.playlist.length > 0) {
      this.currentTrack = this.playlist[0];
    }
    this.notify();
  }

  static playTrack(track: PlaylistTrack): void {
    this.init();
    if (!this.audio) return;
    this.currentTrack = track;
    this.audio.src = track.audioUrl;
    this.audio.play().catch((e) => console.warn('Audio play error:', e));
    this.isPlaying = true;
    this.notify();
  }

  static togglePlayPause(): void {
    this.init();
    if (!this.audio) return;

    if (this.isPlaying) {
      this.audio.pause();
      this.isPlaying = false;
    } else {
      if (this.currentTrack) {
        this.audio.play().catch((e) => console.warn('Audio resume error:', e));
        this.isPlaying = true;
      } else if (this.playlist.length > 0) {
        this.playTrack(this.playlist[0]);
      }
    }
    this.notify();
  }

  static nextTrack(): void {
    if (this.playlist.length === 0) return;
    const curIdx = this.playlist.findIndex((t) => t.id === this.currentTrack?.id);

    if (curIdx === -1 || curIdx + 1 >= this.playlist.length) {
      if (this.isLooping) {
        this.playTrack(this.playlist[0]);
      } else {
        this.stop();
      }
    } else {
      this.playTrack(this.playlist[curIdx + 1]);
    }
  }

  static previousTrack(): void {
    if (this.playlist.length === 0) return;
    const curIdx = this.playlist.findIndex((t) => t.id === this.currentTrack?.id);

    if (curIdx <= 0) {
      this.playTrack(this.playlist[this.playlist.length - 1]);
    } else {
      this.playTrack(this.playlist[curIdx - 1]);
    }
  }

  static stop(): void {
    if (this.audio) {
      this.audio.pause();
      this.audio.currentTime = 0;
    }
    this.isPlaying = false;
    this.notify();
  }

  static setVolume(val: number): void {
    this.volume = Math.max(0, Math.min(1, val));
    if (this.audio) {
      this.audio.volume = this.volume;
    }
    this.notify();
  }

  static async uploadTrack(
    file: File,
    spaceId: string,
    session: UserSession | null
  ): Promise<PlaylistTrack | null> {
    const objectUrl = URL.createObjectURL(file);
    const cleanTitle = file.name.replace(/\.(mp3|wav|ogg|m4a)$/i, '').replace(/_/g, ' ');

    const newTrack: PlaylistTrack = {
      id: `track-${Date.now()}`,
      spaceId,
      title: cleanTitle || 'Uploaded Track',
      artist: session?.displayName || 'Creator',
      audioUrl: objectUrl,
      durationSeconds: 180,
      createdBy: session?.id,
      createdAt: new Date().toISOString(),
      isDefaultPreset: false,
    };

    if (session && !session.isGuest) {
      try {
        await supabase.from('space_playlists').insert({
          space_id: spaceId,
          title: newTrack.title,
          artist: newTrack.artist,
          audio_url: newTrack.audioUrl,
          duration_seconds: newTrack.durationSeconds,
          created_by: newTrack.createdBy,
        });
      } catch (e) {
        console.warn('Failed to persist track to Supabase:', e);
      }
    }

    this.playlist.push(newTrack);
    this.playTrack(newTrack);
    return newTrack;
  }

  private static notify() {
    if (this.onStateChanged) this.onStateChanged();
  }
}
