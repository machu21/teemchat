import 'dart:async';
import 'package:flutter/foundation.dart';
import 'package:livekit_client/livekit_client.dart';
import '../constants/livekit_config.dart';

class VideoFeedModel {
  final VideoTrack track;
  final String participantName;
  final String participantId;
  final bool isScreenShare;

  const VideoFeedModel({
    required this.track,
    required this.participantName,
    required this.participantId,
    required this.isScreenShare,
  });
}

class LiveKitService {
  Room? _room;
  EventsListener<RoomEvent>? _listener;

  final ValueNotifier<bool> isConnected = ValueNotifier<bool>(false);
  final ValueNotifier<bool> isMicEnabled = ValueNotifier<bool>(false);
  final ValueNotifier<bool> isCameraEnabled = ValueNotifier<bool>(false);
  final ValueNotifier<bool> isScreenShareEnabled = ValueNotifier<bool>(false);
  final ValueNotifier<Set<String>> activeSpeakerIds = ValueNotifier<Set<String>>({});
  final ValueNotifier<List<VideoTrack>> remoteVideoTracks = ValueNotifier<List<VideoTrack>>([]);
  final ValueNotifier<List<VideoFeedModel>> remoteVideoFeeds = ValueNotifier<List<VideoFeedModel>>([]);

  Room? get room => _room;

  Future<bool> joinSpaceRoom({
    required String spaceId,
    required String userId,
    required String displayName,
  }) async {
    if (!LiveKitConfig.isConfigured) {
      debugPrint("LiveKit is not configured with valid credentials.");
      return false;
    }

    try {
      await leaveSpaceRoom();

      final token = LiveKitConfig.generateAccessToken(
        roomName: "space-$spaceId",
        participantIdentity: userId,
        participantName: displayName,
      );

      _room = Room();
      _listener = _room!.createListener();

      _setupListeners();

      await _room!.connect(
        LiveKitConfig.liveKitUrl,
        token,
        roomOptions: const RoomOptions(
          adaptiveStream: true,
          dynacast: true,
          defaultAudioPublishOptions: AudioPublishOptions(
            dtx: true,
          ),
          defaultVideoPublishOptions: VideoPublishOptions(
            simulcast: true,
          ),
        ),
      );

      isConnected.value = true;
      return true;
    } catch (e) {
      debugPrint("Error connecting to LiveKit room: $e");
      isConnected.value = false;
      return false;
    }
  }

  void _setupListeners() {
    if (_listener == null) return;

    _listener!
      ..on<RoomDisconnectedEvent>((_) {
        isConnected.value = false;
        isMicEnabled.value = false;
        isCameraEnabled.value = false;
        isScreenShareEnabled.value = false;
        activeSpeakerIds.value = {};
        remoteVideoTracks.value = [];
        remoteVideoFeeds.value = [];
      })
      ..on<ActiveSpeakersChangedEvent>((event) {
        final ids = event.speakers.map((s) => s.identity).toSet();
        activeSpeakerIds.value = ids;
      })
      ..on<TrackSubscribedEvent>((event) {
        _updateRemoteTracks();
      })
      ..on<TrackUnsubscribedEvent>((event) {
        _updateRemoteTracks();
      })
      ..on<ParticipantDisconnectedEvent>((_) {
        _updateRemoteTracks();
      });
  }

  void _updateRemoteTracks() {
    if (_room == null) return;
    final List<VideoTrack> tracks = [];
    final List<VideoFeedModel> feeds = [];

    for (final participant in _room!.remoteParticipants.values) {
      for (final pub in participant.videoTrackPublications) {
        if (pub.track != null && !pub.muted) {
          tracks.add(pub.track!);
          feeds.add(
            VideoFeedModel(
              track: pub.track!,
              participantName: participant.name.isNotEmpty
                  ? participant.name
                  : (participant.identity.isNotEmpty ? participant.identity : 'Participant'),
              participantId: participant.identity,
              isScreenShare: pub.source == TrackSource.screenShareVideo,
            ),
          );
        }
      }
    }
    remoteVideoTracks.value = tracks;
    remoteVideoFeeds.value = feeds;
  }

  Future<void> toggleMicrophone() async {
    final local = _room?.localParticipant;
    if (local == null) return;

    try {
      final newState = !isMicEnabled.value;
      await local.setMicrophoneEnabled(newState);
      isMicEnabled.value = newState;
    } catch (e) {
      debugPrint("Error toggling microphone: $e");
    }
  }

  Future<void> toggleCamera() async {
    final local = _room?.localParticipant;
    if (local == null) return;

    try {
      final newState = !isCameraEnabled.value;
      await local.setCameraEnabled(newState);
      isCameraEnabled.value = newState;
    } catch (e) {
      debugPrint("Error toggling camera: $e");
    }
  }

  Future<void> toggleScreenShare() async {
    final local = _room?.localParticipant;
    if (local == null) return;

    try {
      final newState = !isScreenShareEnabled.value;
      await local.setScreenShareEnabled(newState);
      isScreenShareEnabled.value = newState;
    } catch (e) {
      debugPrint("Error toggling screen share: $e");
    }
  }

  /// Sets audio volume on remote participant's track for proximity spatial audio.
  /// Distance attenuation formula:
  /// - distance < 80px: 1.0 (100% volume)
  /// - distance between 80px and 260px: smooth linear fade down to 0.0
  /// - distance > 260px: 0.0 (muted)
  void updateProximityAudio(Map<String, double> userDistances) {
    if (_room == null) return;

    for (final entry in userDistances.entries) {
      final userId = entry.key;
      final distance = entry.value;

      final participant = _room!.remoteParticipants.values.firstWhere(
        (p) => p.identity == userId,
        orElse: () => _room!.remoteParticipants.values.first,
      );

      if (participant.identity == userId) {
        double volume = 0.0;
        if (distance <= 80.0) {
          volume = 1.0;
        } else if (distance < 260.0) {
          volume = 1.0 - ((distance - 80.0) / 180.0);
        } else {
          volume = 0.0;
        }

        for (final pub in participant.audioTrackPublications) {
          if (pub.track != null) {
            // LiveKit RemoteAudioTrack volume control (0.0 to 1.0)
            try {
              (pub.track as dynamic).setVolume(volume);
            } catch (_) {}
          }
        }
      }
    }
  }

  Future<void> leaveSpaceRoom() async {
    try {
      await _listener?.dispose();
      await _room?.disconnect();
      await _room?.dispose();
    } catch (e) {
      debugPrint("Error leaving LiveKit room: $e");
    } finally {
      _listener = null;
      _room = null;
      isConnected.value = false;
      isMicEnabled.value = false;
      isCameraEnabled.value = false;
      isScreenShareEnabled.value = false;
      activeSpeakerIds.value = {};
      remoteVideoTracks.value = [];
      remoteVideoFeeds.value = [];
    }
  }
}
