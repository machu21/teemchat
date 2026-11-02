import { PlaylistTrack, defaultPlaylistPresets } from '../models/chat';
import { supabase } from '../supabase';
import { UserSession } from '../models/user';

// ============================================================
// CLIENT-SIDE AUDIO BLOB CACHE (INDEXEDDB)
// Ensures user-uploaded MP3 files persist across page refreshes
// and reconnections even when cloud storage is offline.
// ============================================================
const DB_NAME = 'teem_space_music_db';
const STORE_NAME = 'audio_blobs';
const DB_VERSION = 1;

const UUID_REGEX = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

function getTrackMetaKey(title: string, artist: string): string {
  return `meta:${(title || '').trim().toLowerCase()}::${(artist || '').trim().toLowerCase()}`;
}

function openAudioDB(): Promise<IDBDatabase | null> {
  if (typeof window === 'undefined' || !window.indexedDB) return Promise.resolve(null);
  return new Promise((resolve) => {
    try {
      const req = window.indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME);
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

async function saveTrackAudioBlob(trackId: string, blob: Blob): Promise<void> {
  try {
    const db = await openAudioDB();
    if (!db) return;
    return new Promise((resolve) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      tx.objectStore(STORE_NAME).put(blob, trackId);
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    });
  } catch {}
}

async function getTrackAudioBlob(trackId: string): Promise<Blob | null> {
  try {
    const db = await openAudioDB();
    if (!db) return null;
    return new Promise((resolve) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const req = tx.objectStore(STORE_NAME).get(trackId);
      req.onsuccess = () => resolve(req.result instanceof Blob ? req.result : null);
      req.onerror = () => resolve(null);
    });
  } catch {
    return null;
  }
}

async function deleteTrackAudioBlob(trackId: string): Promise<void> {
  try {
    const db = await openAudioDB();
    if (!db) return;
    return new Promise((resolve) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      tx.objectStore(STORE_NAME).delete(trackId);
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    });
  } catch {}
}

function getLocalCustomTracks(spaceId: string): PlaylistTrack[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(`teem_custom_tracks_${spaceId}`);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveLocalCustomTracks(spaceId: string, tracks: PlaylistTrack[]): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(`teem_custom_tracks_${spaceId}`, JSON.stringify(tracks));
  } catch {}
}

export class PlaylistService {
  private static audio: HTMLAudioElement | null = null;
  private static memoryBlobs = new Map<string, Blob>();
  private static liveObjectUrls = new Set<string>();
  static currentTrack: PlaylistTrack | null = null;
  static isPlaying: boolean = false;
  static volume: number = 0.7;
  static isMuted: boolean = false;
  static previousVolume: number = 0.7;
  static isLooping: boolean = true;
  static currentTime: number = 0;
  static duration: number = 0;
  static playlist: PlaylistTrack[] = [];

  static onStateChanged?: () => void;
  static onTimeUpdate?: (currentTime: number, duration: number) => void;

  private static createLiveObjectUrl(blob: Blob): string {
    if (typeof URL === 'undefined' || typeof URL.createObjectURL !== 'function') {
      return 'mock-audio-url';
    }
    const url = URL.createObjectURL(blob);
    this.liveObjectUrls.add(url);
    return url;
  }

  private static async resolveTrackBlob(
    track: PlaylistTrack,
    fallbackIds: string[] = []
  ): Promise<Blob | null> {
    const metaKey = getTrackMetaKey(track.title, track.artist);
    const candidateKeys = [track.id, metaKey, ...fallbackIds];

    for (const key of candidateKeys) {
      if (!key) continue;
      const mem = this.memoryBlobs.get(key);
      if (mem) return mem;
    }

    for (const key of candidateKeys) {
      if (!key) continue;
      const idbBlob = await getTrackAudioBlob(key);
      if (idbBlob) {
        this.memoryBlobs.set(track.id, idbBlob);
        this.memoryBlobs.set(metaKey, idbBlob);
        return idbBlob;
      }
    }

    return null;
  }

  private static init() {
    if (!this.audio && typeof window !== 'undefined' && typeof Audio !== 'undefined') {
      try {
        this.audio = new Audio();
        this.audio.volume = this.isMuted ? 0 : this.volume;
        this.audio.onended = () => this.nextTrack();
        this.audio.ontimeupdate = () => {
          if (this.audio) {
            this.currentTime = this.audio.currentTime || 0;
            this.duration = this.audio.duration || this.currentTrack?.durationSeconds || 0;
            if (this.onTimeUpdate) {
              this.onTimeUpdate(this.currentTime, this.duration);
            }
          }
        };
        this.audio.onloadedmetadata = () => {
          if (this.audio) {
            this.duration = this.audio.duration || this.currentTrack?.durationSeconds || 0;
            this.notify();
          }
        };
      } catch {
        this.audio = null;
      }
    }
  }

  static async loadPlaylist(spaceId: string): Promise<void> {
    this.init();
    let cloudTracks: PlaylistTrack[] = [];

    // 1. Fetch cloud-persisted tracks from Supabase with timeout guard
    if (UUID_REGEX.test(spaceId)) {
      try {
        const response = await Promise.race([
          supabase
            .from('space_playlists')
            .select('*')
            .eq('space_id', spaceId)
            .order('created_at', { ascending: true }),
          new Promise<{ data: null }>((resolve) => setTimeout(() => resolve({ data: null }), 1200)),
        ]);

        const data = response?.data as Array<Record<string, unknown>> | null;
        if (data && data.length > 0) {
          cloudTracks = data.map((d) => ({
            id: String(d.id),
            spaceId: String(d.space_id),
            title: String(d.title),
            artist: String(d.artist || 'Space Artist'),
            audioUrl: String(d.audio_url),
            durationSeconds: Number(d.duration_seconds) || 180,
            createdBy: String(d.created_by || ''),
            createdAt: String(d.created_at || ''),
            isDefaultPreset: false,
          }));
        }
      } catch {}
    }

    // 2. Fetch local custom tracks and index them by metaKey so mismatched IDs can be healed
    const localTracks = getLocalCustomTracks(spaceId);
    const localIdsByMeta = new Map<string, string[]>();

    for (const track of localTracks) {
      const metaKey = getTrackMetaKey(track.title, track.artist);
      const list = localIdsByMeta.get(metaKey) || [];
      list.push(track.id);
      localIdsByMeta.set(metaKey, list);

      if (track.audioUrl.startsWith('blob:') && !this.liveObjectUrls.has(track.audioUrl)) {
        const blob = await this.resolveTrackBlob(track);
        if (blob) {
          track.audioUrl = this.createLiveObjectUrl(blob);
        }
      }
    }

    // 3. Restore IndexedDB audio blobs for cloudTracks that have local blob URLs or cached blobs
    for (const cTrack of cloudTracks) {
      const metaKey = getTrackMetaKey(cTrack.title, cTrack.artist);
      const fallbackLocalIds = localIdsByMeta.get(metaKey) || [];
      const blob = await this.resolveTrackBlob(cTrack, fallbackLocalIds);

      if (blob) {
        await saveTrackAudioBlob(cTrack.id, blob);
        await saveTrackAudioBlob(metaKey, blob);
        if (cTrack.audioUrl.startsWith('blob:') && !this.liveObjectUrls.has(cTrack.audioUrl)) {
          cTrack.audioUrl = this.createLiveObjectUrl(blob);
        }
      }
    }

    // 4. Merge: Default Presets + Cloud Tracks + Local Custom Tracks
    // Deduplicate by BOTH track.id AND normalized (title, artist) metaKey
    const presets = defaultPlaylistPresets(spaceId);
    const trackMap = new Map<string, PlaylistTrack>();
    const customMetaToId = new Map<string, string>();

    for (const p of presets) {
      trackMap.set(p.id, p);
    }

    const addOrMergeCustomTrack = (track: PlaylistTrack) => {
      const metaKey = getTrackMetaKey(track.title, track.artist);
      const existingIdForMeta = customMetaToId.get(metaKey);

      if (trackMap.has(track.id)) {
        const existing = trackMap.get(track.id)!;
        if (
          existing.audioUrl.startsWith('blob:') &&
          !this.liveObjectUrls.has(existing.audioUrl) &&
          this.liveObjectUrls.has(track.audioUrl)
        ) {
          existing.audioUrl = track.audioUrl;
        }
        return;
      }

      if (existingIdForMeta && trackMap.has(existingIdForMeta)) {
        const existing = trackMap.get(existingIdForMeta)!;
        if (
          existing.audioUrl.startsWith('blob:') &&
          !this.liveObjectUrls.has(existing.audioUrl) &&
          (this.liveObjectUrls.has(track.audioUrl) || !track.audioUrl.startsWith('blob:'))
        ) {
          existing.audioUrl = track.audioUrl;
        }
        return;
      }

      trackMap.set(track.id, track);
      customMetaToId.set(metaKey, track.id);
    };

    for (const c of cloudTracks) {
      addOrMergeCustomTrack(c);
    }
    for (const l of localTracks) {
      addOrMergeCustomTrack(l);
    }

    // Also keep any in-memory uploaded tracks for this space that finished during load
    for (const existingMem of this.playlist) {
      if (!existingMem.isDefaultPreset && existingMem.spaceId === spaceId) {
        addOrMergeCustomTrack(existingMem);
      }
    }

    this.playlist = Array.from(trackMap.values());

    // Sync healed/deduplicated custom tracks back to localStorage so duplicates stay gone
    const dedupedCustomTracks = this.playlist.filter((t) => !t.isDefaultPreset);
    if (dedupedCustomTracks.length > 0 || localTracks.length > 0) {
      saveLocalCustomTracks(spaceId, dedupedCustomTracks);
    }

    if (this.currentTrack) {
      const curMeta = getTrackMetaKey(this.currentTrack.title, this.currentTrack.artist);
      const matched =
        this.playlist.find((t) => t.id === this.currentTrack?.id) ||
        this.playlist.find((t) => !t.isDefaultPreset && getTrackMetaKey(t.title, t.artist) === curMeta);
      if (matched) {
        this.currentTrack = matched;
        this.duration = matched.durationSeconds;
      } else if (this.playlist.length > 0 && !this.isPlaying) {
        this.currentTrack = this.playlist[0];
        this.duration = this.currentTrack.durationSeconds;
      }
    } else if (this.playlist.length > 0) {
      this.currentTrack = this.playlist[0];
      this.duration = this.currentTrack.durationSeconds;
    }

    this.notify();
  }

  static playTrack(track: PlaylistTrack): void {
    this.init();
    this.currentTrack = track;
    this.currentTime = 0;
    this.duration = track.durationSeconds;
    this.isPlaying = true;

    if (this.audio) {
      try {
        this.audio.pause();
      } catch {}

      const startAudioPlayback = (urlToPlay: string, allowBlobRetry: boolean) => {
        if (!this.audio || this.currentTrack?.id !== track.id) return;

        const isSameSrc = this.audio.src === urlToPlay && !this.audio.error;
        if (!isSameSrc) {
          this.audio.src = urlToPlay;
          if (typeof this.audio.load === 'function') {
            try {
              this.audio.load();
            } catch {}
          }
        }

        try {
          this.audio.currentTime = 0;
        } catch {}

        const playPromise = this.audio.play();
        if (playPromise && typeof playPromise.catch === 'function') {
          playPromise.catch(async (e) => {
            if (allowBlobRetry && !track.isDefaultPreset) {
              const blob = await this.resolveTrackBlob(track);
              if (blob && this.currentTrack?.id === track.id) {
                const freshUrl = this.createLiveObjectUrl(blob);
                track.audioUrl = freshUrl;
                startAudioPlayback(freshUrl, false);
                return;
              }
            }
            console.warn('Audio play error:', e);
          });
        }
      };

      // If custom track has a stale blob URL from a previous page load, restore from memory/IndexedDB first
      if (
        !track.isDefaultPreset &&
        track.audioUrl.startsWith('blob:') &&
        !this.liveObjectUrls.has(track.audioUrl)
      ) {
        const metaKey = getTrackMetaKey(track.title, track.artist);
        const memBlob = this.memoryBlobs.get(track.id) || this.memoryBlobs.get(metaKey);
        if (memBlob) {
          track.audioUrl = this.createLiveObjectUrl(memBlob);
          startAudioPlayback(track.audioUrl, false);
        } else {
          this.resolveTrackBlob(track).then((blob) => {
            if (blob && this.currentTrack?.id === track.id) {
              track.audioUrl = this.createLiveObjectUrl(blob);
              startAudioPlayback(track.audioUrl, false);
              this.notify();
            } else {
              startAudioPlayback(track.audioUrl, false);
            }
          });
        }
      } else {
        startAudioPlayback(track.audioUrl, true);
      }
    }
    this.notify();
  }

  static togglePlayPause(): void {
    this.init();
    if (this.isPlaying) {
      if (this.audio) {
        this.audio.pause();
      }
      this.isPlaying = false;
      this.notify();
    } else {
      if (this.currentTrack) {
        // If audio hasn't loaded currentTrack yet or ended or errored, start via playTrack
        if (
          !this.audio ||
          !this.audio.src ||
          this.audio.error ||
          (this.currentTrack.audioUrl.startsWith('blob:') &&
            !this.liveObjectUrls.has(this.currentTrack.audioUrl))
        ) {
          this.playTrack(this.currentTrack);
          return;
        }
        if (this.audio.ended || (this.duration > 0 && this.currentTime >= this.duration)) {
          try {
            this.audio.currentTime = 0;
          } catch {}
        }
        const trackRef = this.currentTrack;
        const playPromise = this.audio.play();
        if (playPromise && typeof playPromise.catch === 'function') {
          playPromise.catch(() => {
            this.playTrack(trackRef);
          });
        }
        this.isPlaying = true;
        this.notify();
      } else if (this.playlist.length > 0) {
        this.playTrack(this.playlist[0]);
      }
    }
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
    this.currentTime = 0;
    this.isPlaying = false;
    this.notify();
  }

  // Fully tears down playback when leaving a space so music never leaks across pages.
  // Volume / mute are user preferences and are intentionally kept.
  static reset(): void {
    if (this.audio) {
      this.audio.pause();
      this.audio.removeAttribute('src');
      if (typeof this.audio.load === 'function') {
        try {
          this.audio.load();
        } catch {
          // Ignore environments without a media pipeline (e.g. jsdom)
        }
      }
    }
    this.currentTrack = null;
    this.isPlaying = false;
    this.currentTime = 0;
    this.duration = 0;
    this.playlist = [];
    this.notify();
  }

  static seek(seconds: number): void {
    const target = Math.max(0, Math.min(this.duration || 1000, seconds));
    if (this.audio && !isNaN(seconds)) {
      this.audio.currentTime = target;
    }
    this.currentTime = target;
    this.notify();
  }

  static setVolume(val: number): void {
    this.volume = Math.max(0, Math.min(1, val));
    if (this.volume > 0) {
      this.isMuted = false;
    }
    if (this.audio) {
      this.audio.volume = this.volume;
    }
    this.notify();
  }

  static toggleMute(): void {
    if (this.isMuted) {
      this.isMuted = false;
      this.setVolume(this.previousVolume || 0.7);
    } else {
      this.previousVolume = this.volume;
      this.isMuted = true;
      if (this.audio) {
        this.audio.volume = 0;
      }
      this.notify();
    }
  }

  static toggleLoop(): void {
    this.isLooping = !this.isLooping;
    this.notify();
  }

  /**
   * Upload an MP3 audio file for the space.
   * Validates file format (.mp3 / audio/mpeg), enforces max file size (25MB),
   * extracts track duration, persists to IndexedDB, localStorage and Supabase.
   */
  static async uploadTrack(
    file: File,
    spaceId: string,
    session: UserSession | null,
    customTitle?: string,
    customArtist?: string
  ): Promise<PlaylistTrack> {
    // 1. Validate file format
    const isMp3 =
      file.type === 'audio/mpeg' ||
      file.type === 'audio/mp3' ||
      file.name.toLowerCase().endsWith('.mp3');

    if (!isMp3) {
      throw new Error('Please upload a valid MP3 audio file (.mp3).');
    }

    // 2. Validate file size (max 25MB)
    const maxSizeBytes = 25 * 1024 * 1024;
    if (file.size > maxSizeBytes) {
      throw new Error('MP3 file is too large. Maximum file size is 25MB.');
    }

    const objectUrl = this.createLiveObjectUrl(file);
    const cleanTitle = file.name.replace(/\.(mp3|mpeg)$/i, '').replace(/[_-]/g, ' ').trim();
    const resolvedTitle = customTitle?.trim() || cleanTitle || 'Custom Soundtrack';
    const resolvedArtist = customArtist?.trim() || session?.displayName || 'Space Creator';
    const metaKey = getTrackMetaKey(resolvedTitle, resolvedArtist);

    // 3. Extract duration via pre-loaded Audio element
    let trackDuration = 180;
    if (typeof window !== 'undefined' && typeof Audio !== 'undefined') {
      try {
        trackDuration = await new Promise<number>((resolve) => {
          const tempAudio = new Audio(objectUrl);
          const cleanupTemp = () => {
            tempAudio.onloadedmetadata = null;
            tempAudio.onerror = null;
          };
          const timer = setTimeout(() => {
            cleanupTemp();
            resolve(180);
          }, 2000);
          tempAudio.onloadedmetadata = () => {
            clearTimeout(timer);
            const dur = Math.round(tempAudio.duration) || 180;
            cleanupTemp();
            resolve(dur);
          };
          tempAudio.onerror = () => {
            clearTimeout(timer);
            cleanupTemp();
            resolve(180);
          };
        });
      } catch {
        trackDuration = 180;
      }
    }

    let trackId = `track-${Date.now()}-${Math.floor(Math.random() * 1000)}`;

    const newTrack: PlaylistTrack = {
      id: trackId,
      spaceId,
      title: resolvedTitle,
      artist: resolvedArtist,
      audioUrl: objectUrl,
      durationSeconds: trackDuration,
      createdBy: session?.id || 'guest',
      createdAt: new Date().toISOString(),
      isDefaultPreset: false,
    };

    // 4. Attempt cloud persistence FIRST if authenticated & spaceId is UUID
    // so newTrack.id is finalized BEFORE saving to IndexedDB and localStorage
    if (session && !session.isGuest && UUID_REGEX.test(spaceId)) {
      try {
        let cloudAudioUrl = objectUrl;

        // Try Supabase Storage upload
        try {
          const storagePath = `${spaceId}/${trackId}.mp3`;
          const { data: stData, error: stErr } = await supabase.storage
            .from('space-audio')
            .upload(storagePath, file, {
              contentType: 'audio/mpeg',
              upsert: true,
            });

          if (!stErr && stData) {
            const { data: pubData } = supabase.storage.from('space-audio').getPublicUrl(storagePath);
            if (pubData?.publicUrl) {
              cloudAudioUrl = pubData.publicUrl;
            }
          }
        } catch {}

        // Insert into space_playlists table
        const { data: insertedData } = await supabase
          .from('space_playlists')
          .insert({
            space_id: spaceId,
            title: newTrack.title,
            artist: newTrack.artist,
            audio_url: cloudAudioUrl,
            duration_seconds: newTrack.durationSeconds,
            created_by: session.id,
          })
          .select('id')
          .single();

        if (insertedData?.id) {
          trackId = String(insertedData.id);
          newTrack.id = trackId;
        }
      } catch (e) {
        console.warn('Notice saving track to Supabase:', e);
      }
    }

    // 5. Save blob to in-memory cache and IndexedDB under BOTH final trackId and metaKey
    this.memoryBlobs.set(newTrack.id, file);
    this.memoryBlobs.set(metaKey, file);
    await saveTrackAudioBlob(newTrack.id, file);
    await saveTrackAudioBlob(metaKey, file);

    // 6. Save metadata to localStorage (deduplicating any prior entry with same id or title+artist)
    const existing = getLocalCustomTracks(spaceId).filter(
      (t) => t.id !== newTrack.id && getTrackMetaKey(t.title, t.artist) !== metaKey
    );
    existing.push(newTrack);
    saveLocalCustomTracks(spaceId, existing);

    // 7. Deduplicate in-memory playlist and start playing immediately
    this.playlist = this.playlist.filter(
      (t) =>
        t.isDefaultPreset ||
        (t.id !== newTrack.id && getTrackMetaKey(t.title, t.artist) !== metaKey)
    );
    this.playlist.push(newTrack);
    this.playTrack(newTrack);
    return newTrack;
  }

  /**
   * Delete a custom track from playlist, localStorage, IndexedDB and Supabase.
   */
  static async deleteTrack(
    trackId: string,
    spaceId: string,
    session: UserSession | null
  ): Promise<void> {
    const trackToDelete = this.playlist.find((t) => t.id === trackId);
    const metaKey = trackToDelete ? getTrackMetaKey(trackToDelete.title, trackToDelete.artist) : null;

    if (trackToDelete?.audioUrl?.startsWith('blob:') && typeof URL !== 'undefined') {
      try {
        this.liveObjectUrls.delete(trackToDelete.audioUrl);
        URL.revokeObjectURL(trackToDelete.audioUrl);
      } catch {}
    }

    this.memoryBlobs.delete(trackId);
    if (metaKey) {
      this.memoryBlobs.delete(metaKey);
    }

    // Remove from in-memory playlist (including any duplicate with the same title+artist)
    const wasPlayingDeleted =
      this.currentTrack?.id === trackId ||
      (metaKey &&
        this.currentTrack &&
        !this.currentTrack.isDefaultPreset &&
        getTrackMetaKey(this.currentTrack.title, this.currentTrack.artist) === metaKey);

    this.playlist = this.playlist.filter(
      (t) =>
        t.id !== trackId &&
        (!metaKey || t.isDefaultPreset || getTrackMetaKey(t.title, t.artist) !== metaKey)
    );

    if (wasPlayingDeleted) {
      if (this.playlist.length > 0) {
        this.playTrack(this.playlist[0]);
      } else {
        this.stop();
        this.currentTrack = null;
      }
    }

    // Remove from localStorage
    const local = getLocalCustomTracks(spaceId).filter(
      (t) => t.id !== trackId && (!metaKey || getTrackMetaKey(t.title, t.artist) !== metaKey)
    );
    saveLocalCustomTracks(spaceId, local);

    // Remove from IndexedDB
    await deleteTrackAudioBlob(trackId);
    if (metaKey) {
      await deleteTrackAudioBlob(metaKey);
    }

    // Remove from Supabase if authenticated and trackId is UUID
    if (session && !session.isGuest && UUID_REGEX.test(trackId)) {
      try {
        await supabase.from('space_playlists').delete().eq('id', trackId);
      } catch (e) {
        console.warn('Notice deleting track from Supabase:', e);
      }
    }

    this.notify();
  }

  private static notify() {
    if (this.onStateChanged) this.onStateChanged();
  }
}
