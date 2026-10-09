import 'dart:async';
import 'package:flutter/foundation.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import '../models/avatar_model.dart';
import '../../features/auth/auth_service.dart';
import 'chat_service.dart';

class RemotePlayerState {
  final String userId;
  String displayName;
  AvatarConfig avatarConfig;
  double x;
  double y;
  String direction;
  bool isMoving;
  String? speechBubble;
  DateTime? speechExpiresAt;
  DateTime lastSeen;

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
    DateTime? lastSeen,
  }) : lastSeen = lastSeen ?? DateTime.now();

  bool get hasActiveSpeech =>
      speechBubble != null &&
      speechExpiresAt != null &&
      DateTime.now().isBefore(speechExpiresAt!);
}

class WorldSyncService {
  RealtimeChannel? _channel;
  bool _isSubscribed = false;
  final String spaceId;
  final String currentUserId;
  final String displayName;
  final AvatarConfig avatarConfig;
  late final String clientInstanceId;

  bool get isSubscribed => _isSubscribed;

  final ValueNotifier<Map<String, RemotePlayerState>> remotePlayers =
      ValueNotifier<Map<String, RemotePlayerState>>({});

  DateTime _lastBroadcastTime = DateTime.now();
  DateTime _lastPresenceTrackTime = DateTime.now();
  double _lastKnownX = 420.0;
  double _lastKnownY = 300.0;
  Timer? _reconnectTimer;
  int _reconnectAttempts = 0;
  bool _isDisposed = false;

  void Function(ChatMessageModel message)? onChatMessage;

  static int _instanceCounter = 0;

  WorldSyncService({
    required this.spaceId,
    required this.currentUserId,
    required this.displayName,
    required this.avatarConfig,
    String? clientInstanceId,
  }) : clientInstanceId = clientInstanceId ??
            '${currentUserId}_${DateTime.now().microsecondsSinceEpoch}_${++_instanceCounter}';

  static Map<String, dynamic>? _toMap(dynamic val) {
    if (val == null) return null;
    if (val is Map<String, dynamic>) {
      return Map<String, dynamic>.from(val);
    }
    if (val is Map) {
      final result = <String, dynamic>{};
      for (final entry in val.entries) {
        final key = entry.key?.toString();
        if (key != null) {
          result[key] = entry.value;
        }
      }
      return result;
    }
    return null;
  }

  static AvatarConfig _toAvatarConfig(dynamic rawConfig) {
    final map = _toMap(rawConfig);
    if (map == null || map.isEmpty) return const AvatarConfig();
    try {
      return AvatarConfig.fromJson(map);
    } catch (e) {
      debugPrint(">>> [WorldSyncService] Error parsing AvatarConfig: $e");
      return const AvatarConfig();
    }
  }

  Future<void> connect({
    required double initialX,
    required double initialY,
  }) async {
    _isDisposed = false;
    _lastKnownX = initialX;
    _lastKnownY = initialY;
    final client = AuthService.client;
    if (client == null) return;

    try {
      _channel = client.channel(
        'space:$spaceId:world',
        opts: RealtimeChannelConfig(
          key: clientInstanceId,
          ack: false,
        ),
      );

      // 1. Listen for in-memory broadcast movement packets
      _channel!.on(
        RealtimeListenTypes.broadcast,
        ChannelFilter(event: 'movement'),
        (payload, [ref]) {
          try {
            final raw = _toMap(payload) ?? {};
            final inner = _toMap(raw['payload']);
            final data = (inner != null && inner.isNotEmpty) ? inner : raw;

            final senderClientId = (data['client_id'] as String?) ??
                (raw['client_id'] as String?);
            final senderUserId = (data['user_id'] as String?) ??
                (raw['user_id'] as String?);

            // Ignore our own packets from this exact tab/session
            if (senderClientId == clientInstanceId) return;
            if (senderClientId == null && senderUserId == currentUserId) return;

            final effectiveId = senderClientId ?? senderUserId;
            if (effectiveId == null || effectiveId.isEmpty) return;

            final x = (data['x'] as num?)?.toDouble() ??
                (raw['x'] as num?)?.toDouble() ?? 420.0;
            final y = (data['y'] as num?)?.toDouble() ??
                (raw['y'] as num?)?.toDouble() ?? 300.0;
            final direction = (data['direction'] as String?) ??
                (raw['direction'] as String?) ?? 'down';
            final isMoving = (data['is_moving'] as bool?) ??
                (raw['is_moving'] as bool?) ?? false;
            final name = (data['display_name'] as String?) ??
                (raw['display_name'] as String?) ?? 'Explorer';
            final avatarConfig = _toAvatarConfig(
                data['avatar_config'] ?? raw['avatar_config']);

            final map = Map<String, RemotePlayerState>.from(remotePlayers.value);
            if (map.containsKey(effectiveId)) {
              final player = map[effectiveId]!;
              player.x = x;
              player.y = y;
              player.direction = direction;
              player.isMoving = isMoving;
              player.displayName = name;
              player.avatarConfig = avatarConfig;
              player.lastSeen = DateTime.now();
            } else {
              debugPrint(">>> [WorldSyncService] Discovered remote player via movement: $effectiveId ($name) at ($x, $y)");
              map[effectiveId] = RemotePlayerState(
                userId: effectiveId,
                displayName: name,
                avatarConfig: avatarConfig,
                x: x,
                y: y,
                direction: direction,
                isMoving: isMoving,
                lastSeen: DateTime.now(),
              );
            }
            remotePlayers.value = map;
          } catch (e, st) {
            debugPrint(">>> [WorldSyncService] Error handling movement broadcast: $e\n$st");
          }
        },
      );

      // 2. Listen for floating speech bubble broadcasts
      _channel!.on(
        RealtimeListenTypes.broadcast,
        ChannelFilter(event: 'speech'),
        (payload, [ref]) {
          try {
            final raw = _toMap(payload) ?? {};
            final inner = _toMap(raw['payload']);
            final data = (inner != null && inner.isNotEmpty) ? inner : raw;

            final senderClientId = (data['client_id'] as String?) ??
                (raw['client_id'] as String?);
            final senderUserId = (data['user_id'] as String?) ??
                (raw['user_id'] as String?);

            if (senderClientId == clientInstanceId) return;
            if (senderClientId == null && senderUserId == currentUserId) return;

            final effectiveId = senderClientId ?? senderUserId;
            final text = (data['text'] as String?) ?? (raw['text'] as String?);
            if (effectiveId == null || text == null || text.isEmpty) return;

            final map = Map<String, RemotePlayerState>.from(remotePlayers.value);
            if (map.containsKey(effectiveId)) {
              final player = map[effectiveId]!;
              player.speechBubble = text;
              player.speechExpiresAt = DateTime.now().add(const Duration(seconds: 5));
              remotePlayers.value = map;
            }
          } catch (e) {
            debugPrint(">>> [WorldSyncService] Error handling speech broadcast: $e");
          }
        },
      );

      // 3. Listen for in-room broadcast chat messages (instant delivery across all players)
      _channel!.on(
        RealtimeListenTypes.broadcast,
        ChannelFilter(event: 'chat'),
        (payload, [ref]) {
          try {
            final raw = _toMap(payload) ?? {};
            final inner = _toMap(raw['payload']);
            final data = (inner != null && inner.isNotEmpty) ? inner : raw;

            final senderId = (data['sender_id'] as String?) ??
                (raw['sender_id'] as String?);
            final content = (data['content'] as String?) ??
                (raw['content'] as String?);
            if (senderId == null || content == null || content.isEmpty) return;

            final message = ChatMessageModel(
              id: (data['id'] as String?) ??
                  (raw['id'] as String?) ??
                  'msg-${DateTime.now().millisecondsSinceEpoch}',
              roomId: (data['room_id'] as String?) ??
                  (raw['room_id'] as String?) ?? '',
              spaceId: (data['space_id'] as String?) ??
                  (raw['space_id'] as String?) ?? spaceId,
              senderId: senderId,
              senderName: (data['sender_name'] as String?) ??
                  (raw['sender_name'] as String?) ?? 'Explorer',
              content: content,
              createdAt: (data['created_at'] != null)
                  ? DateTime.tryParse(data['created_at'].toString()) ?? DateTime.now()
                  : DateTime.now(),
              isDirectMessage: (data['is_direct'] as bool?) ?? false,
            );

            if (onChatMessage != null) {
              onChatMessage!(message);
            }
          } catch (e) {
            debugPrint(">>> [WorldSyncService] Error handling chat broadcast: $e");
          }
        },
      );

      // 4. Presence sync for join / leave / sync
      _channel!.on(
        RealtimeListenTypes.presence,
        ChannelFilter(event: 'sync'),
        (payload, [ref]) => _handlePresenceUpdate(),
      );
      _channel!.on(
        RealtimeListenTypes.presence,
        ChannelFilter(event: 'join'),
        (payload, [ref]) => _handlePresenceUpdate(),
      );
      _channel!.on(
        RealtimeListenTypes.presence,
        ChannelFilter(event: 'leave'),
        (payload, [ref]) => _handlePresenceUpdate(),
      );

      _channel!.subscribe((status, [error]) async {
        debugPrint(">>> [WorldSyncService] Realtime channel status: $status, error: $error");
        final statusStr = status.toString().toUpperCase();
        if (statusStr.contains('SUBSCRIBED')) {
          _isSubscribed = true;
          _reconnectTimer?.cancel();
          _reconnectTimer = null;
          _reconnectAttempts = 0;
          try {
            // Track our own presence with clientInstanceId and current coordinates
            await _channel!.track({
              'user_id': currentUserId,
              'client_id': clientInstanceId,
              'display_name': displayName,
              'avatar_config': avatarConfig.toJson(),
              'x': _lastKnownX,
              'y': _lastKnownY,
            });
            debugPrint(">>> [WorldSyncService] Presence tracked for $currentUserId / $clientInstanceId ($displayName)");
            _handlePresenceUpdate();

            // Broadcast initial coordinates immediately so all existing peers receive exact spawn position
            broadcastMovement(
              x: _lastKnownX,
              y: _lastKnownY,
              direction: 'down',
              isMoving: false,
              force: true,
            );
          } catch (e) {
            debugPrint("Error tracking presence: $e");
          }
        } else if (statusStr.contains('CLOSED') || statusStr.contains('CHANNEL_ERROR')) {
          _isSubscribed = false;
          _scheduleReconnect();
        }
      });
    } catch (e) {
      debugPrint("Error connecting to WorldSyncService: $e");
      _scheduleReconnect();
    }
  }

  void _scheduleReconnect() {
    if (_isDisposed) return;
    _reconnectTimer?.cancel();
    final delaySeconds = (_reconnectAttempts < 5) ? (1 << _reconnectAttempts) : 10;
    _reconnectAttempts++;
    debugPrint(">>> [WorldSyncService] Scheduling reconnect in ${delaySeconds}s (attempt $_reconnectAttempts)");
    _reconnectTimer = Timer(Duration(seconds: delaySeconds), () {
      if (_isDisposed || _isSubscribed) return;
      debugPrint(">>> [WorldSyncService] Reconnecting now to space $spaceId...");
      connect(initialX: _lastKnownX, initialY: _lastKnownY);
    });
  }

  void _handlePresenceUpdate() {
    if (_channel == null) return;
    try {
      final presenceState = _channel!.presenceState();
      debugPrint(">>> [WorldSyncService] _handlePresenceUpdate raw presence keys count: ${presenceState.length}");
      final map = Map<String, RemotePlayerState>.from(remotePlayers.value);

      final activeIds = <String>{};
      for (final entry in presenceState.entries) {
        final presences = entry.value;
        for (final p in (presences as Iterable)) {
          dynamic rawPayload;
          try {
            rawPayload = (p is Presence) ? p.payload : (p as dynamic).payload;
          } catch (_) {
            rawPayload = p;
          }
          final payloadData = _toMap(rawPayload);

          final candidateClientId = payloadData?['client_id'] as String?;
          final candidateUserId = payloadData?['user_id'] as String?;
          final entryKey = entry.key;

          // Skip our own tab's presence
          if (candidateClientId == clientInstanceId) continue;
          if (entryKey == clientInstanceId) continue;
          if (candidateClientId == null && candidateUserId == currentUserId && entryKey == currentUserId) continue;

          final effectiveId = candidateClientId ??
              (candidateUserId != null && candidateUserId != currentUserId ? candidateUserId : null) ??
              (entryKey.isNotEmpty && entryKey != clientInstanceId && entryKey != currentUserId ? entryKey : null);

          if (effectiveId != null && effectiveId.isNotEmpty) {
            activeIds.add(effectiveId);
            final name = (payloadData?['display_name'] as String?) ?? 'Explorer';
            final x = (payloadData?['x'] as num?)?.toDouble() ?? 420.0;
            final y = (payloadData?['y'] as num?)?.toDouble() ?? 300.0;
            final cfg = _toAvatarConfig(payloadData?['avatar_config']);

            if (!map.containsKey(effectiveId)) {
              debugPrint(">>> [WorldSyncService] Spawning new remote player from presence: $effectiveId ($name) at ($x, $y)");
              map[effectiveId] = RemotePlayerState(
                userId: effectiveId,
                displayName: name,
                avatarConfig: cfg,
                x: x,
                y: y,
                lastSeen: DateTime.now(),
              );
            } else {
              final existing = map[effectiveId]!;
              existing.displayName = name;
              existing.avatarConfig = cfg;
              if (x != 0 && y != 0 && !existing.isMoving) {
                existing.x = x;
                existing.y = y;
              }
              existing.lastSeen = DateTime.now();
            }
          }
        }
      }

      final now = DateTime.now();
      // Remove players only if absent from presence AND inactive in movement broadcasts for > 15 seconds
      map.removeWhere((id, player) {
        final inPresence = activeIds.contains(id);
        final recentBroadcast = now.difference(player.lastSeen).inSeconds < 15;
        final shouldRemove = !inPresence && !recentBroadcast;
        if (shouldRemove) {
          debugPrint(">>> [WorldSyncService] Evicting remote player: $id (${player.displayName})");
        }
        return shouldRemove;
      });

      remotePlayers.value = map;
      debugPrint(">>> [WorldSyncService] Presence synced. Online remote players count: ${map.length}");
    } catch (e, st) {
      debugPrint(">>> [WorldSyncService] Error in _handlePresenceUpdate: $e\n$st");
    }
  }

  void broadcastMovement({
    required double x,
    required double y,
    required String direction,
    required bool isMoving,
    bool force = false,
  }) {
    _lastKnownX = x;
    _lastKnownY = y;
    if (_channel == null || !_isSubscribed) return;

    // Deadband check: if standing still and not forced (e.g. stop transition), do NOT broadcast
    if (!isMoving && !force) {
      return;
    }

    final now = DateTime.now();
    // Throttle to 100ms (max 10 packets/second to strictly comply with Supabase rate limits)
    if (!force && now.difference(_lastBroadcastTime).inMilliseconds < 100) {
      return;
    }
    _lastBroadcastTime = now;

    // Slow presence sync (every 20s) so new players joining get current stationary position
    if (!isMoving && now.difference(_lastPresenceTrackTime).inSeconds >= 20) {
      _lastPresenceTrackTime = now;
      _channel?.track({
        'user_id': currentUserId,
        'client_id': clientInstanceId,
        'display_name': displayName,
        'avatar_config': avatarConfig.toJson(),
        'x': x,
        'y': y,
      }).ignore();
    }

    try {
      _channel!.send(
        type: RealtimeListenTypes.broadcast,
        event: 'movement',
        payload: {
          'user_id': currentUserId,
          'client_id': clientInstanceId,
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
    if (_channel == null || !_isSubscribed || text.trim().isEmpty) return;

    try {
      _channel!.send(
        type: RealtimeListenTypes.broadcast,
        event: 'speech',
        payload: {
          'user_id': currentUserId,
          'client_id': clientInstanceId,
          'text': text.trim(),
        },
      );
    } catch (e) {
      debugPrint("Error broadcasting speech: $e");
    }
  }

  void broadcastChatMessage(ChatMessageModel message) {
    if (_channel == null || !_isSubscribed || message.content.trim().isEmpty) return;

    try {
      _channel!.send(
        type: RealtimeListenTypes.broadcast,
        event: 'chat',
        payload: {
          'id': message.id,
          'room_id': message.roomId,
          'space_id': message.spaceId,
          'sender_id': message.senderId,
          'sender_name': message.senderName,
          'content': message.content.trim(),
          'created_at': message.createdAt.toIso8601String(),
          'is_direct': message.isDirectMessage,
        },
      );
    } catch (e) {
      debugPrint("Error broadcasting chat message: $e");
    }
  }

  Future<void> disconnect() async {
    _isDisposed = true;
    _reconnectTimer?.cancel();
    _reconnectTimer = null;
    _isSubscribed = false;
    try {
      await _channel?.untrack();
      await _channel?.unsubscribe();
      final client = AuthService.client;
      if (client != null && _channel != null) {
        client.removeChannel(_channel!);
      }
    } catch (e) {
      debugPrint("Error disconnecting WorldSyncService: $e");
    } finally {
      _channel = null;
      remotePlayers.value = {};
    }
  }
}
