import 'dart:async';
import 'package:flutter/foundation.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import '../models/avatar_model.dart';
import '../../features/auth/auth_service.dart';

class RemotePlayerState {
  final String userId;
  final String displayName;
  final AvatarConfig avatarConfig;
  double x;
  double y;
  String direction;
  bool isMoving;
  String? speechBubble;
  DateTime? speechExpiresAt;

  RemotePlayerState({
    required this.userId,
    required this.displayName,
    required this.avatarConfig,
    required this.x,
    required this.y,
    this.direction = 'down',
    this.isMoving = false,
    this.speechBubble,
    this.speechExpiresAt,
  });

  bool get hasActiveSpeech =>
      speechBubble != null &&
      speechExpiresAt != null &&
      DateTime.now().isBefore(speechExpiresAt!);
}

class WorldSyncService {
  RealtimeChannel? _channel;
  final String spaceId;
  final String currentUserId;
  final String displayName;
  final AvatarConfig avatarConfig;

  final ValueNotifier<Map<String, RemotePlayerState>> remotePlayers =
      ValueNotifier<Map<String, RemotePlayerState>>({});

  DateTime _lastBroadcastTime = DateTime.now();

  WorldSyncService({
    required this.spaceId,
    required this.currentUserId,
    required this.displayName,
    required this.avatarConfig,
  });

  Future<void> connect({
    required double initialX,
    required double initialY,
  }) async {
    final client = AuthService.client;
    if (client == null) return;

    try {
      _channel = client.channel(
        'space:$spaceId:world',
        opts: const RealtimeChannelConfig(ack: false),
      );

      // 1. Listen for in-memory broadcast movement packets
      _channel!.on(
        RealtimeListenTypes.broadcast,
        ChannelFilter(event: 'movement'),
        (payload, [ref]) {
          final data = payload as Map<String, dynamic>;
          final senderId = data['user_id'] as String?;
          if (senderId == null || senderId == currentUserId) return;

          final x = (data['x'] as num?)?.toDouble() ?? 0.0;
          final y = (data['y'] as num?)?.toDouble() ?? 0.0;
          final direction = data['direction'] as String? ?? 'down';
          final isMoving = data['is_moving'] as bool? ?? false;
          final name = data['display_name'] as String? ?? 'Explorer';
          final avatarJson = data['avatar_config'] as Map<String, dynamic>?;

          final map = Map<String, RemotePlayerState>.from(remotePlayers.value);
          if (map.containsKey(senderId)) {
            final player = map[senderId]!;
            player.x = x;
            player.y = y;
            player.direction = direction;
            player.isMoving = isMoving;
          } else {
            map[senderId] = RemotePlayerState(
              userId: senderId,
              displayName: name,
              avatarConfig: avatarJson != null
                  ? AvatarConfig.fromJson(avatarJson)
                  : const AvatarConfig(),
              x: x,
              y: y,
              direction: direction,
              isMoving: isMoving,
            );
          }
          remotePlayers.value = map;
        },
      );

      // 2. Listen for floating speech bubble broadcasts
      _channel!.on(
        RealtimeListenTypes.broadcast,
        ChannelFilter(event: 'speech'),
        (payload, [ref]) {
          final data = payload as Map<String, dynamic>;
          final senderId = data['user_id'] as String?;
          final text = data['text'] as String?;
          if (senderId == null || text == null || text.isEmpty) return;

          final map = Map<String, RemotePlayerState>.from(remotePlayers.value);
          if (map.containsKey(senderId)) {
            final player = map[senderId]!;
            player.speechBubble = text;
            player.speechExpiresAt = DateTime.now().add(const Duration(seconds: 5));
            remotePlayers.value = map;
          }
        },
      );

      // 3. Presence sync for join / leave
      _channel!.on(
        RealtimeListenTypes.presence,
        ChannelFilter(event: 'sync'),
        (payload, [ref]) {
          final presenceState = _channel!.presenceState();
          final map = Map<String, RemotePlayerState>.from(remotePlayers.value);

          final activeIds = <String>{};
          for (final entry in presenceState.entries) {
            for (final p in entry.value) {
              final payloadData = (p as dynamic).payload as Map<String, dynamic>?;
              if (payloadData != null) {
                final id = payloadData['user_id'] as String?;
                if (id != null && id != currentUserId) {
                  activeIds.add(id);
                  if (!map.containsKey(id)) {
                    final name = payloadData['display_name'] as String? ?? 'Explorer';
                    final x = (payloadData['x'] as num?)?.toDouble() ?? 300.0;
                    final y = (payloadData['y'] as num?)?.toDouble() ?? 260.0;
                    final avatarJson = payloadData['avatar_config'] as Map<String, dynamic>?;
                    map[id] = RemotePlayerState(
                      userId: id,
                      displayName: name,
                      avatarConfig: avatarJson != null
                          ? AvatarConfig.fromJson(avatarJson)
                          : const AvatarConfig(),
                      x: x,
                      y: y,
                    );
                  }
                }
              }
            }
          }

          // Remove players who disconnected
          map.removeWhere((id, _) => !activeIds.contains(id));
          remotePlayers.value = map;
        },
      );

      _channel!.subscribe();

      // Track our own presence
      await _channel!.track({
        'user_id': currentUserId,
        'display_name': displayName,
        'avatar_config': avatarConfig.toJson(),
        'x': initialX,
        'y': initialY,
      });
    } catch (e) {
      debugPrint("Error connecting to WorldSyncService: $e");
    }
  }

  void broadcastMovement({
    required double x,
    required double y,
    required String direction,
    required bool isMoving,
    bool force = false,
  }) {
    if (_channel == null) return;

    final now = DateTime.now();
    // Throttle to 50ms (~20 FPS) unless forced (e.g. stop walking or changed direction)
    if (!force && now.difference(_lastBroadcastTime).inMilliseconds < 50) {
      return;
    }
    _lastBroadcastTime = now;

    try {
      _channel!.send(
        type: RealtimeListenTypes.broadcast,
        event: 'movement',
        payload: {
          'user_id': currentUserId,
          'display_name': displayName,
          'avatar_config': avatarConfig.toJson(),
          'x': x,
          'y': y,
          'direction': direction,
          'is_moving': isMoving,
        },
      );
    } catch (e) {
      debugPrint("Error broadcasting movement: $e");
    }
  }

  void broadcastSpeech(String text) {
    if (_channel == null || text.trim().isEmpty) return;

    try {
      _channel!.send(
        type: RealtimeListenTypes.broadcast,
        event: 'speech',
        payload: {
          'user_id': currentUserId,
          'text': text.trim(),
        },
      );
    } catch (e) {
      debugPrint("Error broadcasting speech: $e");
    }
  }

  Future<void> disconnect() async {
    try {
      await _channel?.untrack();
      await _channel?.unsubscribe();
    } catch (e) {
      debugPrint("Error disconnecting WorldSyncService: $e");
    } finally {
      _channel = null;
      remotePlayers.value = {};
    }
  }
}
