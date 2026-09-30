import 'package:flutter/foundation.dart';
import '../../features/auth/auth_service.dart';
import '../models/playlist_model.dart';
import 'audio/audio_player_adapter.dart';
import 'audio/file_picker_adapter.dart';

class PlaylistService {
  static final AudioPlayerAdapter _player = AudioPlayerAdapter();
  static final FilePickerAdapter _picker = FilePickerAdapter();

  static final ValueNotifier<List<PlaylistTrack>> playlist = ValueNotifier<List<PlaylistTrack>>([]);
  static final ValueNotifier<PlaylistTrack?> currentTrack = ValueNotifier<PlaylistTrack?>(null);
  static final ValueNotifier<bool> isPlaying = ValueNotifier<bool>(false);
  static final ValueNotifier<double> volume = ValueNotifier<double>(0.7);
  static final ValueNotifier<bool> isLooping = ValueNotifier<bool>(true);

  static String? _activeSpaceId;
  static String? get activeSpaceId => _activeSpaceId;
  static bool _initialized = false;

  static void init() {
    if (_initialized) return;
    _initialized = true;

    _player.setVolume(volume.value);
    _player.onEnded(() {
      nextTrack();
    });

    volume.addListener(() {
      _player.setVolume(volume.value);
    });
  }

  /// Loads playlist for a given virtual space
  static Future<void> loadPlaylist(String spaceId) async {
    init();
    _activeSpaceId = spaceId;

    final client = AuthService.client;
    List<PlaylistTrack> tracks = [];

    if (client != null) {
      try {
        final res = await client
            .from('space_playlists')
            .select()
            .eq('space_id', spaceId)
            .order('created_at', ascending: true);

        final data = res as List<dynamic>;
        if (data.isNotEmpty) {
          tracks = data.map((json) => PlaylistTrack.fromJson(json as Map<String, dynamic>)).toList();
        }
      } catch (e) {
        debugPrint('[PlaylistService] Error loading space_playlists: $e');
      }
    }

    // Include default sound tripping presets so ambient music is always available
    final presets = PlaylistTrack.defaultPresets(spaceId);
    final combined = [...presets, ...tracks];
    playlist.value = combined;

    if (currentTrack.value == null && combined.isNotEmpty) {
      currentTrack.value = combined.first;
    }
  }

  /// Starts or resumes playback of a track
  static void playTrack(PlaylistTrack track) {
    init();
    currentTrack.value = track;
    _player.play(track.audioUrl);
    isPlaying.value = true;
  }

  /// Toggle play / pause
  static void togglePlayPause() {
    init();
    if (isPlaying.value) {
      _player.pause();
      isPlaying.value = false;
    } else {
      if (currentTrack.value != null) {
        if (_player.isPlaying) {
          _player.resume();
        } else {
          _player.play(currentTrack.value!.audioUrl);
        }
        isPlaying.value = true;
      } else if (playlist.value.isNotEmpty) {
        playTrack(playlist.value.first);
      }
    }
  }

  /// Skip to next track
  static void nextTrack() {
    final list = playlist.value;
    if (list.isEmpty) return;

    final currentIndex = list.indexWhere((t) => t.id == currentTrack.value?.id);
    if (currentIndex == -1 || currentIndex + 1 >= list.length) {
      if (isLooping.value) {
        playTrack(list.first);
      } else {
        stop();
      }
    } else {
      playTrack(list[currentIndex + 1]);
    }
  }

  /// Previous track
  static void previousTrack() {
    final list = playlist.value;
    if (list.isEmpty) return;

    final currentIndex = list.indexWhere((t) => t.id == currentTrack.value?.id);
    if (currentIndex <= 0) {
      playTrack(list.last);
    } else {
      playTrack(list[currentIndex - 1]);
    }
  }

  /// Stop playback
  static void stop() {
    _player.stop();
    isPlaying.value = false;
  }

  /// Upload an MP3 track to the space playlist
  static Future<PlaylistTrack?> uploadMp3Track(String spaceId) async {
    init();
    try {
      final picked = await _picker.pickAudioFile();
      if (picked == null) return null;

      final trackId = 'track-${DateTime.now().millisecondsSinceEpoch}';
      final cleanTitle = picked.name
          .replaceAll(RegExp(r'\.(mp3|wav|ogg|m4a)$', caseSensitive: false), '')
          .replaceAll('_', ' ')
          .trim();

      final newTrack = PlaylistTrack(
        id: trackId,
        spaceId: spaceId,
        title: cleanTitle.isNotEmpty ? cleanTitle : 'Uploaded Track',
        artist: AuthService.currentSession?.displayName ?? 'Account Creator',
        audioUrl: picked.url,
        durationSeconds: 180,
        createdBy: AuthService.currentSession?.id,
        createdAt: DateTime.now(),
      );

      // Save to Supabase if authenticated
      final client = AuthService.client;
      if (client != null && AuthService.currentSession?.isGuest != true) {
        try {
          await client.from('space_playlists').insert({
            'space_id': spaceId,
            'title': newTrack.title,
            'artist': newTrack.artist,
            'audio_url': newTrack.audioUrl,
            'duration_seconds': newTrack.durationSeconds,
            'created_by': newTrack.createdBy,
          });
        } catch (e) {
          debugPrint('[PlaylistService] Could not persist track to Supabase: $e');
        }
      }

      // Add to reactive playlist
      playlist.value = [...playlist.value, newTrack];
      playTrack(newTrack);

      return newTrack;
    } catch (e) {
      debugPrint('[PlaylistService] Error uploading MP3: $e');
      return null;
    }
  }

  /// Delete a track from the playlist
  static Future<void> deleteTrack(PlaylistTrack track) async {
    playlist.value = playlist.value.where((t) => t.id != track.id).toList();

    if (currentTrack.value?.id == track.id) {
      if (playlist.value.isNotEmpty) {
        playTrack(playlist.value.first);
      } else {
        stop();
        currentTrack.value = null;
      }
    }

    final client = AuthService.client;
    if (client != null && !track.isDefaultPreset) {
      try {
        await client.from('space_playlists').delete().eq('id', track.id);
      } catch (e) {
        debugPrint('[PlaylistService] Error deleting track from Supabase: $e');
      }
    }
  }
}
