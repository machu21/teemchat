import 'dart:async';
import 'package:flutter/foundation.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import '../../features/auth/auth_service.dart';

class ChatMessageModel {
  final String id;
  final String roomId;
  final String spaceId;
  final String senderId;
  final String senderName;
  final String content;
  final DateTime createdAt;
  final bool isDirectMessage;

  const ChatMessageModel({
    required this.id,
    required this.roomId,
    required this.spaceId,
    required this.senderId,
    required this.senderName,
    required this.content,
    required this.createdAt,
    this.isDirectMessage = false,
  });

  factory ChatMessageModel.fromJson(Map<String, dynamic> json, {String fallbackName = 'Explorer'}) {
    final profile = json['profiles'] as Map<String, dynamic>?;
    final name = (profile?['display_name'] as String?) ??
        (json['sender_name'] as String?) ??
        fallbackName;

    return ChatMessageModel(
      id: json['id'] as String? ?? '',
      roomId: json['room_id'] as String? ?? '',
      spaceId: json['space_id'] as String? ?? '',
      senderId: json['sender_id'] as String? ?? '',
      senderName: name,
      content: json['content'] as String? ?? '',
      createdAt: json['created_at'] != null
          ? DateTime.tryParse(json['created_at'] as String) ?? DateTime.now()
          : DateTime.now(),
      isDirectMessage: json['conversation_id'] != null,
    );
  }

  factory ChatMessageModel.fromMap(Map<String, dynamic> map, {String fallbackName = 'Explorer'}) {
    return ChatMessageModel.fromJson(map, fallbackName: fallbackName);
  }

  Map<String, dynamic> toMap() {
    return {
      'id': id,
      'room_id': roomId,
      'space_id': spaceId,
      'sender_id': senderId,
      'sender_name': senderName,
      'content': content,
      'created_at': createdAt.toIso8601String(),
      'is_direct': isDirectMessage,
    };
  }
}

class ChatService {
  static Future<List<ChatMessageModel>> fetchMessages(String roomId) async {
    final client = AuthService.client;
    if (client == null) return _mockMessages;

    try {
      final response = await client
          .from('messages')
          .select('*, profiles:sender_id(display_name)')
          .eq('room_id', roomId)
          .order('created_at', ascending: true)
          .limit(50);

      final List<dynamic> data = response as List<dynamic>;
      return data
          .map((item) => ChatMessageModel.fromJson(item as Map<String, dynamic>))
          .toList();
    } catch (e) {
      debugPrint("Error fetching room messages: $e");
      return _mockMessages;
    }
  }

  static final Map<String, String> _profileNameCache = {};
  static final RegExp _uuidRegex = RegExp(
    r'^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$',
  );

  static Future<ChatMessageModel?> sendMessage({
    required String roomId,
    required String spaceId,
    required String content,
  }) async {
    final client = AuthService.client;
    final session = AuthService.currentSession;
    if (content.trim().isEmpty) return null;

    final fallbackMsg = ChatMessageModel(
      id: 'local-${DateTime.now().millisecondsSinceEpoch}',
      roomId: roomId,
      spaceId: spaceId,
      senderId: session?.id ?? 'guest-local',
      senderName: session?.displayName ?? 'You',
      content: content.trim(),
      createdAt: DateTime.now(),
    );

    final isValidUuid = _uuidRegex.hasMatch(spaceId);

    if (client == null || session == null || session.isGuest || !isValidUuid) {
      return fallbackMsg;
    }

    try {
      final res = await client.from('messages').insert({
        'room_id': roomId,
        'space_id': spaceId,
        'sender_id': session.id,
        'content': content.trim(),
      }).select('*, profiles:sender_id(display_name)').single();

      return ChatMessageModel.fromJson(res, fallbackName: session.displayName);
    } catch (e) {
      debugPrint("Error sending message to Supabase: $e");
      return fallbackMsg;
    }
  }

  static RealtimeChannel? listenToRoomMessages({
    required String roomId,
    required void Function(ChatMessageModel message) onMessage,
  }) {
    final client = AuthService.client;
    if (client == null) return null;

    try {
      final channel = client
          .channel('public:messages:$roomId')
          .on(
            RealtimeListenTypes.postgresChanges,
            ChannelFilter(
              event: 'INSERT',
              schema: 'public',
              table: 'messages',
              filter: 'room_id=eq.$roomId',
            ),
            (payload, [ref]) async {
              final newRecord = payload['new'] as Map<String, dynamic>?;
              if (newRecord != null) {
                final senderId = newRecord['sender_id'] as String?;
                String senderName = 'Explorer';

                if (senderId != null) {
                  if (_profileNameCache.containsKey(senderId)) {
                    senderName = _profileNameCache[senderId]!;
                  } else {
                    try {
                      final profile = await client
                          .from('profiles')
                          .select('display_name')
                          .eq('id', senderId)
                          .maybeSingle();
                      if (profile != null && profile['display_name'] != null) {
                        senderName = profile['display_name'] as String;
                        _profileNameCache[senderId] = senderName;
                      }
                    } catch (_) {}
                  }
                }

                final message = ChatMessageModel.fromJson(
                  newRecord,
                  fallbackName: senderName,
                );
                onMessage(message);
              }
            },
          );
      channel.subscribe();
      return channel;
    } catch (e) {
      debugPrint("Error subscribing to room messages: $e");
      return null;
    }
  }

  static Future<void> unsubscribeRoomMessages(RealtimeChannel? channel) async {
    if (channel == null) return;
    try {
      await channel.unsubscribe();
      final client = AuthService.client;
      if (client != null) {
        client.removeChannel(channel);
      }
    } catch (e) {
      debugPrint(">>> [ChatService] Error cleaning up channel: $e");
    }
  }

  static final List<ChatMessageModel> _mockMessages = [
    ChatMessageModel(
      id: 'mock-1',
      roomId: 'general',
      spaceId: 'default-hq',
      senderId: 'sys-1',
      senderName: 'TeemBot',
      content: 'Welcome to the Main Headquarters! Use WASD to explore and walk close to friends to talk.',
      createdAt: DateTime.now().subtract(const Duration(minutes: 5)),
    ),
  ];
}
