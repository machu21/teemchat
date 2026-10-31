import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createGuestSession, UserSession } from '../src/lib/models/user';
import { defaultMaleAvatarConfig } from '../src/lib/models/avatar';

vi.mock('../src/lib/supabase', () => {
  const channelHandlers = new Map<string, (payload: unknown) => void>();
  return {
    supabase: {
      from: () => ({
        select: () => ({
          eq: () => ({
            order: () => Promise.resolve({ data: [], error: null }),
          }),
        }),
        insert: () => ({
          select: () => ({
            single: () => Promise.resolve({ data: { id: 'track-uuid-cloud-99' }, error: null }),
          }),
          then: (resolve: (val: { error: null }) => void) => Promise.resolve({ error: null }).then(resolve),
        }),
        update: () => ({
          eq: () => Promise.resolve({ error: null }),
        }),
        delete: () => ({
          eq: () => Promise.resolve({ error: null }),
        }),
      }),
      storage: {
        from: () => ({
          upload: () => Promise.resolve({ data: { path: 'test.mp3' }, error: null }),
          getPublicUrl: () => ({ data: { publicUrl: 'https://storage.test/test.mp3' } }),
        }),
      },
      channel: (name: string) => {
        return {
          name,
          on: vi.fn((_type: string, filter: { event: string }, handler: (payload: unknown) => void) => {
            channelHandlers.set(filter.event, handler);
            return this;
          }),
          subscribe: vi.fn((callback?: (status: string) => void) => {
            if (callback) callback('SUBSCRIBED');
            return this;
          }),
          track: vi.fn().mockResolvedValue('ok'),
          send: vi.fn((msg: { type: string; event: string; payload: unknown }) => {
            const h = channelHandlers.get(msg.event);
            if (h) h(msg);
            return Promise.resolve();
          }),
          presenceState: vi.fn().mockReturnValue({}),
        };
      },
    },
    removeRealtimeChannel: vi.fn(),
    cleanupExistingChannel: vi.fn(),
  };
});

import { PlaylistService } from '../src/lib/services/playlist';
import { SpaceService } from '../src/lib/services/spaces';
import { WorldSyncService } from '../src/lib/services/worldSync';
import { renderVillageMap } from '../src/game/map/maps/villageMap';
import { renderSchoolMap } from '../src/game/map/maps/schoolMap';
import { renderArcadeMap } from '../src/game/map/maps/arcadeMap';
import { renderCafeMap } from '../src/game/map/maps/cafeMap';
import { renderNightclubMap } from '../src/game/map/maps/nightclubMap';
import { renderOfficeMap } from '../src/game/map/maps/officeMap';
import { defaultHQ } from '../src/lib/models/space';

describe('Sound Tripping & MP3 Upload Studio', () => {
  beforeEach(() => {
    PlaylistService.stop();
    PlaylistService.playlist = [];
    PlaylistService.currentTrack = null;
    PlaylistService.volume = 0.7;
    PlaylistService.isMuted = false;
    PlaylistService.isLooping = true;
  });

  it('loads playlist presets for a space', async () => {
    await PlaylistService.loadPlaylist('test-space-123');
    expect(PlaylistService.playlist.length).toBeGreaterThanOrEqual(2);
    expect(PlaylistService.currentTrack).not.toBeNull();
    expect(PlaylistService.currentTrack?.title).toBe('Pixel Lofi Village Chill');
  });

  it('rejects non-MP3 files during upload', async () => {
    const invalidFile = new File(['dummy content'], 'photo.png', { type: 'image/png' });
    const session = createGuestSession('Realm Creator');

    await expect(
      PlaylistService.uploadTrack(invalidFile, 'test-space-123', session)
    ).rejects.toThrow('Please upload a valid MP3 audio file (.mp3).');
  });

  it('rejects oversized audio files greater than 25MB', async () => {
    const largeFile = new File(['a'], 'giant.mp3', { type: 'audio/mpeg' });
    Object.defineProperty(largeFile, 'size', { value: 26 * 1024 * 1024 });

    await expect(
      PlaylistService.uploadTrack(largeFile, 'test-space-123', null)
    ).rejects.toThrow('MP3 file is too large. Maximum file size is 25MB.');
  });

  it('successfully uploads valid MP3 track with custom title and artist', async () => {
    globalThis.URL.createObjectURL = vi.fn().mockReturnValue('blob:http://localhost/mock-audio');

    const validMp3 = new File(['mock audio data'], 'tavern_adventure.mp3', { type: 'audio/mpeg' });
    const session = createGuestSession('Arch Mage');

    const track = await PlaylistService.uploadTrack(
      validMp3,
      'space-custom-1',
      session,
      'Verdant Tavern Melody',
      'The Bards'
    );

    expect(track).toBeDefined();
    expect(track.title).toBe('Verdant Tavern Melody');
    expect(track.artist).toBe('The Bards');
    expect(track.isDefaultPreset).toBe(false);
    expect(PlaylistService.playlist).toContainEqual(track);
    expect(PlaylistService.currentTrack?.id).toBe(track.id);
  });

  it('persists uploaded track to Supabase when spaceId is a UUID and user is authenticated', async () => {
    globalThis.URL.createObjectURL = vi.fn().mockReturnValue('blob:http://localhost/mock-audio-uuid');

    const validMp3 = new File(['mock audio data'], 'space_beat.mp3', { type: 'audio/mpeg' });
    const authSession: UserSession = {
      ...createGuestSession('Creator Pro'),
      id: 'd3b07384-d113-4632-a279-05a8dfd6cf44',
      isGuest: false,
    };

    const uuidSpaceId = 'a1b2c3d4-e5f6-4a1b-8c2d-3e4f5a6b7c8d';
    const track = await PlaylistService.uploadTrack(
      validMp3,
      uuidSpaceId,
      authSession,
      'Cloud Castle Beats',
      'Cyber Bard'
    );

    expect(track).toBeDefined();
    expect(track.id).toBe('track-uuid-cloud-99');
  });

  it('supports volume adjustment, mute toggling, and loop toggling', () => {
    PlaylistService.setVolume(0.85);
    expect(PlaylistService.volume).toBe(0.85);
    expect(PlaylistService.isMuted).toBe(false);

    PlaylistService.toggleMute();
    expect(PlaylistService.isMuted).toBe(true);

    PlaylistService.toggleMute();
    expect(PlaylistService.isMuted).toBe(false);
    expect(PlaylistService.volume).toBe(0.85);

    expect(PlaylistService.isLooping).toBe(true);
    PlaylistService.toggleLoop();
    expect(PlaylistService.isLooping).toBe(false);
  });

  it('supports playback navigation (next, previous, stop)', async () => {
    await PlaylistService.loadPlaylist('test-nav-space');
    const firstTrack = PlaylistService.playlist[0];
    const secondTrack = PlaylistService.playlist[1];

    PlaylistService.playTrack(firstTrack);
    expect(PlaylistService.currentTrack?.id).toBe(firstTrack.id);

    PlaylistService.nextTrack();
    expect(PlaylistService.currentTrack?.id).toBe(secondTrack.id);

    PlaylistService.previousTrack();
    expect(PlaylistService.currentTrack?.id).toBe(firstTrack.id);

    PlaylistService.stop();
    expect(PlaylistService.isPlaying).toBe(false);
  });

  it('deletes custom track, updates playlist and revokes object URL', async () => {
    const revokeObjectURLSpy = vi.fn();
    globalThis.URL.createObjectURL = vi.fn().mockReturnValue('blob:http://localhost/mock-track-blob');
    globalThis.URL.revokeObjectURL = revokeObjectURLSpy;

    const mp3 = new File(['test'], 'custom_beat.mp3', { type: 'audio/mpeg' });

    const track = await PlaylistService.uploadTrack(mp3, 'del-space', null, 'Delete Me');
    expect(PlaylistService.playlist.some((t) => t.id === track.id)).toBe(true);

    await PlaylistService.deleteTrack(track.id, 'del-space', null);
    expect(PlaylistService.playlist.some((t) => t.id === track.id)).toBe(false);
    expect(revokeObjectURLSpy).toHaveBeenCalledWith('blob:http://localhost/mock-track-blob');
  });

  it('does not duplicate custom tracks on upload, re-upload, or playlist reload and replays cleanly', async () => {
    let blobCounter = 0;
    globalThis.URL.createObjectURL = vi.fn(() => `blob:http://localhost/live-audio-${++blobCounter}`);

    const authSession: UserSession = {
      ...createGuestSession('popoy123'),
      id: 'd3b07384-d113-4632-a279-05a8dfd6cf44',
      displayName: 'popoy123',
      isGuest: false,
    };
    const uuidSpaceId = 'b6941fa2-8305-4e00-833c-ca3cd5f08c9b';

    await PlaylistService.loadPlaylist(uuidSpaceId);
    const mp3File = new File(['littleroot audio bytes'], 'Littleroot_town.mp3', {
      type: 'audio/mpeg',
    });

    // First upload
    const firstUpload = await PlaylistService.uploadTrack(
      mp3File,
      uuidSpaceId,
      authSession,
      'Littleroot town',
      'popoy123'
    );

    const matchingAfterFirst = PlaylistService.playlist.filter(
      (t) => t.title === 'Littleroot town'
    );
    expect(matchingAfterFirst.length).toBe(1);

    // Reload playlist (simulating space reload / effect re-run)
    await PlaylistService.loadPlaylist(uuidSpaceId);
    const matchingAfterReload = PlaylistService.playlist.filter(
      (t) => t.title === 'Littleroot town'
    );
    expect(matchingAfterReload.length).toBe(1);

    // Second upload of the same song
    await PlaylistService.uploadTrack(
      mp3File,
      uuidSpaceId,
      authSession,
      'Littleroot town',
      'popoy123'
    );
    const matchingAfterSecondUpload = PlaylistService.playlist.filter(
      (t) => t.title === 'Littleroot town'
    );
    expect(matchingAfterSecondUpload.length).toBe(1);

    // Play the track a second time and verify playback state
    PlaylistService.stop();
    expect(PlaylistService.isPlaying).toBe(false);

    PlaylistService.playTrack(firstUpload);
    expect(PlaylistService.isPlaying).toBe(true);
    expect(PlaylistService.currentTrack?.title).toBe('Littleroot town');
    expect(PlaylistService.currentTime).toBe(0);
  });
});

describe('Production Ready Themed Map Designs', () => {
  const createMockCtx = () => {
    const fillRectMock = vi.fn();
    return {
      imageSmoothingEnabled: true,
      fillStyle: '',
      strokeStyle: '',
      lineWidth: 1,
      fillRect: fillRectMock,
      strokeRect: vi.fn(),
      save: vi.fn(),
      restore: vi.fn(),
      scale: vi.fn(),
      beginPath: vi.fn(),
      closePath: vi.fn(),
      moveTo: vi.fn(),
      lineTo: vi.fn(),
      fill: vi.fn(),
      stroke: vi.fn(),
      roundRect: vi.fn(),
      measureText: vi.fn().mockReturnValue({ width: 45 }),
      fillText: vi.fn(),
      fillRectMock,
    };
  };

  it('renders Verdant Village with Grand Cobblestone Boulevard and river crossing', () => {
    const mock = createMockCtx();
    expect(() => renderVillageMap(mock as unknown as CanvasRenderingContext2D, 840, 540)).not.toThrow();
    expect(mock.fillRectMock).toHaveBeenCalled();
  });

  it('renders School Map with polished brass & enamel academic signage', () => {
    const mock = createMockCtx();
    expect(() => renderSchoolMap(mock as unknown as CanvasRenderingContext2D, 840, 540)).not.toThrow();
    expect(mock.fillRectMock).toHaveBeenCalled();
  });

  it('renders Arcade Map with cyberpunk neon marquees', () => {
    const mock = createMockCtx();
    expect(() => renderArcadeMap(mock as unknown as CanvasRenderingContext2D, 840, 540)).not.toThrow();
    expect(mock.fillRectMock).toHaveBeenCalled();
  });

  it('renders Cafe Map with artisan walnut wood blackboard signage', () => {
    const mock = createMockCtx();
    expect(() => renderCafeMap(mock as unknown as CanvasRenderingContext2D, 840, 540)).not.toThrow();
    expect(mock.fillRectMock).toHaveBeenCalled();
  });

  it('renders Nightclub Map with neon acrylic club marquees', () => {
    const mock = createMockCtx();
    expect(() => renderNightclubMap(mock as unknown as CanvasRenderingContext2D, 840, 540)).not.toThrow();
    expect(mock.fillRectMock).toHaveBeenCalled();
  });

  it('renders Office Map with sleek corporate architectural plaques', () => {
    const mock = createMockCtx();
    expect(() => renderOfficeMap(mock as unknown as CanvasRenderingContext2D, 840, 540)).not.toThrow();
    expect(mock.fillRectMock).toHaveBeenCalled();
  });
});

describe('Space Service & Live Theme Synchronization', () => {
  it('updates space map theme via SpaceService.updateSpace', async () => {
    const hq = defaultHQ();
    const result = await SpaceService.updateSpace(hq.id, { mapTheme: 'arcade' });
    expect(result).toBe(true);
  });

  it('broadcasts map theme and triggers onMapThemeChanged in WorldSyncService', async () => {
    const sync = new WorldSyncService({
      spaceId: 'test-sync-theme-room',
      currentUserId: 'user-theme-1',
      displayName: 'Realm Builder',
      avatarConfig: defaultMaleAvatarConfig,
    });

    const themeChangedSpy = vi.fn();
    sync.onMapThemeChanged = themeChangedSpy;

    await sync.connect();
    sync.broadcastMapTheme('nightclub');

    expect(themeChangedSpy).toHaveBeenCalledWith('nightclub');
  });
});
