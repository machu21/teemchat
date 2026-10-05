import 'package:flutter_test/flutter_test.dart';
import 'package:virtual_world/core/constants/livekit_config.dart';
import 'package:virtual_world/core/models/avatar_model.dart';
import 'package:virtual_world/core/services/chat_service.dart';
import 'package:virtual_world/core/services/invite_link_service.dart';
import 'package:virtual_world/core/services/world_sync_service.dart';

void main() {
  group('LiveKitConfig JWT Token Generation Tests', () {
    test('Token is generated with valid JWT three-part format', () {
      final token = LiveKitConfig.generateAccessToken(
        roomName: 'space-test-room',
        participantIdentity: 'user-123',
        participantName: 'PixelHero',
        apiKey: 'test_api_key',
        apiSecret: 'test_api_secret_must_be_long_enough_for_hmac_256',
      );

      expect(token, isNotEmpty);
      final parts = token.split('.');
      expect(parts.length, 3, reason: 'JWT should have header.payload.signature');
    });

    test('isConfigured is false in test runner when keys are not injected via --dart-define', () {
      expect(LiveKitConfig.isConfigured, isFalse);
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

  group('InviteLinkService URL & Code Parsing Tests', () {
    test('extractCode parses plain invite code directly', () {
      expect(InviteLinkService.extractCode('CAMP-FIRE-99'), 'CAMP-FIRE-99');
      expect(InviteLinkService.extractCode('  verdant-hq  '), 'verdant-hq');
    });

    test('extractCode parses query parameter ?space= accurately', () {
      expect(
        InviteLinkService.extractCode('https://teemchat.vercel.app/?space=alpha-zone'),
        'alpha-zone',
      );
      expect(
        InviteLinkService.extractCode('http://localhost:5000/?space=local-village&foo=bar'),
        'local-village',
      );
    });

    test('extractCode parses flutter hash fragments /#/?space= accurately', () {
      expect(
        InviteLinkService.extractCode('https://teemchat.vercel.app/#/?space=secret-base'),
        'secret-base',
      );
      expect(
        InviteLinkService.extractCode('https://teemchat.vercel.app/#/space/forest-haven'),
        'forest-haven',
      );
    });

    test('extractCode returns null on empty or blank string', () {
      expect(InviteLinkService.extractCode(''), isNull);
      expect(InviteLinkService.extractCode('   '), isNull);
    });

    test('generateInviteUrl formats valid shareable link', () {
      final url = InviteLinkService.generateInviteUrl('verdant-hq');
      expect(url, contains('space=verdant-hq'));
    });
  });

  group('ChatMessageModel Realtime Broadcast Serialization Tests', () {
    test('toMap and fromMap serialize and deserialize cleanly for WebSocket packets', () {
      final now = DateTime.now();
      final original = ChatMessageModel(
        id: 'msg-abc-123',
        roomId: 'space-hq-general',
        spaceId: 'space-hq',
        senderId: 'user-777',
        senderName: 'PixelCoder',
        content: 'Testing WebSocket broadcast packets!',
        createdAt: now,
      );

      final map = original.toMap();
      expect(map['id'], 'msg-abc-123');
      expect(map['room_id'], 'space-hq-general');
      expect(map['space_id'], 'space-hq');
      expect(map['sender_id'], 'user-777');
      expect(map['sender_name'], 'PixelCoder');
      expect(map['content'], 'Testing WebSocket broadcast packets!');

      final restored = ChatMessageModel.fromMap(map);
      expect(restored.id, original.id);
      expect(restored.roomId, original.roomId);
      expect(restored.spaceId, original.spaceId);
      expect(restored.senderId, original.senderId);
      expect(restored.senderName, original.senderName);
      expect(restored.content, original.content);
    });
  });
}

