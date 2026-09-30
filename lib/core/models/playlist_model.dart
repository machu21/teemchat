class PlaylistTrack {
  final String id;
  final String spaceId;
  final String title;
  final String artist;
  final String audioUrl;
  final int durationSeconds;
  final String? createdBy;
  final DateTime? createdAt;
  final bool isDefaultPreset;

  const PlaylistTrack({
    required this.id,
    required this.spaceId,
    required this.title,
    this.artist = 'TeemChat Audio',
    required this.audioUrl,
    this.durationSeconds = 180,
    this.createdBy,
    this.createdAt,
    this.isDefaultPreset = false,
  });

  factory PlaylistTrack.fromJson(Map<String, dynamic> json) {
    return PlaylistTrack(
      id: json['id'] as String? ?? '',
      spaceId: json['space_id'] as String? ?? '',
      title: json['title'] as String? ?? 'Untitled Track',
      artist: json['artist'] as String? ?? 'Sound Tripping',
      audioUrl: json['audio_url'] as String? ?? '',
      durationSeconds: (json['duration_seconds'] as num?)?.toInt() ?? 0,
      createdBy: json['created_by'] as String?,
      createdAt: json['created_at'] != null ? DateTime.tryParse(json['created_at'] as String) : null,
      isDefaultPreset: json['is_default'] as bool? ?? false,
    );
  }

  Map<String, dynamic> toJson() {
    return {
      'id': id,
      'space_id': spaceId,
      'title': title,
      'artist': artist,
      'audio_url': audioUrl,
      'duration_seconds': durationSeconds,
      'created_by': createdBy,
    };
  }

  /// Preset default tracks so sound tripping works out of the box on any map!
  static List<PlaylistTrack> defaultPresets(String spaceId) {
    return [
      PlaylistTrack(
        id: 'preset-lofi-1',
        spaceId: spaceId,
        title: 'Campfire Pixel Glow',
        artist: 'Lofi Chills',
        audioUrl: 'https://cdn.pixabay.com/download/audio/2022/05/27/audio_1808fbf07a.mp3?filename=lofi-study-112191.mp3',
        durationSeconds: 145,
        isDefaultPreset: true,
      ),
      PlaylistTrack(
        id: 'preset-lofi-2',
        spaceId: spaceId,
        title: 'Verdant Village Breeze',
        artist: 'Pixel Wave',
        audioUrl: 'https://cdn.pixabay.com/download/audio/2022/01/18/audio_d0a13f69d2.mp3?filename=chill-abstract-intention-12099.mp3',
        durationSeconds: 120,
        isDefaultPreset: true,
      ),
      PlaylistTrack(
        id: 'preset-lofi-3',
        spaceId: spaceId,
        title: 'Midnight Soundtripping',
        artist: 'Synth Café',
        audioUrl: 'https://cdn.pixabay.com/download/audio/2022/03/15/audio_c8c8a73467.mp3?filename=ambient-piano-amp-strings-10711.mp3',
        durationSeconds: 165,
        isDefaultPreset: true,
      ),
    ];
  }
}
