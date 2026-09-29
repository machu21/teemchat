import 'package:flutter_test/flutter_test.dart';
import 'package:virtual_world/core/constants/livekit_config.dart';
import 'package:virtual_world/core/models/avatar_model.dart';
import 'package:virtual_world/core/services/chat_service.dart';
import 'package:virtual_world/core/services/world_sync_service.dart';

void main() {
  group('LiveKitConfig JWT Token Generation Tests', () {
    test('Token is generated with valid JWT three-part format', () {
      final token = LiveKitConfig.generateAccessToken(
        roomName: 'space-test-room',
        participantIdentity: 'user-123',
        participantName: 'PixelHero',
      );

      expect(token, isNotEmpty);
      final parts = token.split('.');
      expect(parts.length, 3, reason: 'JWT should have header.payload.signature');
    });

    test('isConfigured is true when URL and keys are populated', () {
      expect(LiveKitConfig.isConfigured, isTrue);
    });
  });

  group('ChatMessageModel Tests', () {
    test('ChatMessageModel parses JSON accurately with fallback', () {
      final json = {
        'id': 'msg-999',
        'room_id': 'space-hq-general',
        'space_id': 'space-hq',
        'sender_id': 'user-456',
        'content': 'Hello from the overworld!',
        'created_at': '2026-09-28T20:00:00.000Z',
        'profiles': {'display_name': 'ExplorerPro'},
      };

      final message = ChatMessageModel.fromJson(json);

      expect(message.id, 'msg-999');
      expect(message.roomId, 'space-hq-general');
      expect(message.spaceId, 'space-hq');
      expect(message.senderId, 'user-456');
      expect(message.senderName, 'ExplorerPro');
      expect(message.content, 'Hello from the overworld!');
      expect(message.isDirectMessage, isFalse);
    });

    test('ChatMessageModel identifies direct messages with conversation_id', () {
      final json = {
        'id': 'dm-1',
        'room_id': 'dm-room',
        'space_id': 'space-hq',
        'sender_id': 'user-1',
        'content': 'Secret whisper',
        'conversation_id': 'conv-123',
      };

      final message = ChatMessageModel.fromJson(json);
      expect(message.isDirectMessage, isTrue);
    });
  });

  group('RemotePlayerState Tests', () {
    test('Speech bubble expiration works accurately', () {
      final player = RemotePlayerState(
        userId: 'user-789',
        displayName: 'RetroGamer',
        avatarConfig: const AvatarConfig(),
        x: 100.0,
        y: 200.0,
        speechBubble: 'Let us meet at the campfire! 🔥',
        speechExpiresAt: DateTime.now().add(const Duration(seconds: 10)),
      );

      expect(player.hasActiveSpeech, isTrue);

      player.speechExpiresAt = DateTime.now().subtract(const Duration(seconds: 1));
      expect(player.hasActiveSpeech, isFalse);
    });
  });
}
