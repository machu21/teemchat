import 'package:flame/components.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:virtual_world/core/models/companion_model.dart';
import 'package:virtual_world/core/services/companion_service.dart';
import 'package:virtual_world/core/services/gemini_service.dart';
import 'package:virtual_world/core/services/tts/tts_service.dart';
import 'package:virtual_world/features/companion/companion_modal.dart';
import 'package:virtual_world/features/companion/widgets/formatted_chat_bubble.dart';
import 'package:virtual_world/features/world/game/components/tile_map.dart';
import 'package:virtual_world/features/auth/auth_service.dart';

void main() {
  group('AI Companion Models Tests', () {
    test('CompanionModel serializes and deserializes accurately', () {
      final companion = CompanionModel(
        id: 'a1b2c3d4-e5f6-7a8b-9c0d-1e2f3a4b5c6d',
        userId: 'user-456',
        name: 'Sparky',
        persona: 'Curious retro explorer companion',
        companionType: 'robot',
        avatarStyle: 'bot_blue',
        learnedContext: {'favorite_color': 'cyan', 'likes_campfire': true},
        isActive: true,
        createdAt: DateTime.parse('2026-09-30T12:00:00Z'),
        updatedAt: DateTime.parse('2026-09-30T12:00:00Z'),
      );

      final json = companion.toJson();
      expect(json['id'], 'a1b2c3d4-e5f6-7a8b-9c0d-1e2f3a4b5c6d');
      expect(json['companion_type'], 'robot');
      expect(json['learned_context']['favorite_color'], 'cyan');

      final fromJson = CompanionModel.fromJson(json);
      expect(fromJson.name, 'Sparky');
      expect(fromJson.companionType, 'robot');
      expect(fromJson.learnedContext['likes_campfire'], true);

      // UUID validation test
      expect(CompanionModel.isValidUuid('a1b2c3d4-e5f6-7a8b-9c0d-1e2f3a4b5c6d'), true);
      expect(CompanionModel.isValidUuid('comp-user-123'), false);
      expect(CompanionModel.isValidUuid(''), false);
      expect(CompanionModel.isValidUuid(null), false);
    });

    test('CompanionMessageModel tests isAi helper and JSON parsing', () {
      final userMsg = CompanionMessageModel(
        id: 'm-1',
        companionId: 'comp-123',
        userId: 'user-456',
        role: 'user',
        content: 'I love relaxing near Crystal Bay!',
        createdAt: DateTime.now(),
      );
      expect(userMsg.isAi, false);

      final aiMsg = CompanionMessageModel(
        id: 'm-2',
        companionId: 'comp-123',
        userId: 'user-456',
        role: 'assistant',
        content: 'Crystal Bay is gorgeous! Fancy going for a swim?',
        createdAt: DateTime.now(),
      );
      expect(aiMsg.isAi, true);

      final parsed = CompanionMessageModel.fromJson({
        'id': 'm-3',
        'companion_id': 'comp-123',
        'user_id': 'user-456',
        'role': 'assistant',
        'content': 'Ready when you are!',
        'created_at': '2026-09-30T12:00:00Z',
      });
      expect(parsed.isAi, true);
      expect(parsed.content, 'Ready when you are!');
    });

    test('CompanionMemoryModel parses learned context accurately', () {
      final memory = CompanionMemoryModel.fromJson({
        'id': 'mem-1',
        'companion_id': 'comp-123',
        'user_id': 'user-456',
        'memory_key': 'favorite_activity',
        'memory_value': 'swimming in Crystal Bay',
        'category': 'hobbies',
        'created_at': '2026-09-30T12:00:00Z',
      });
      expect(memory.key, 'favorite_activity');
      expect(memory.value, 'swimming in Crystal Bay');
      expect(memory.category, 'hobbies');
    });
  });

  group('River Bridge & Swimming Zone Tests', () {
    test('isPositionInWater returns true for river water and false on the bridge', () {
      // Land position in Verdant Village
      final landPos = Vector2(300, 260);
      expect(WorldMapComponent.isPositionInWater(landPos), false);

      // River water coordinate (Grid column 46, row 18 -> X=736, Y=288)
      final riverWaterPos = Vector2(736, 450);
      expect(WorldMapComponent.isPositionInWater(riverWaterPos), true);

      // River Bridge coordinate (Bridge spans X=704..768, Y=672..736)
      final onBridgePos = Vector2(736, 704);
      expect(WorldMapComponent.isPositionInWater(onBridgePos), false);

      // Crystal Bay ocean water coordinate (X >= 1392)
      final oceanWaterPos = Vector2(1450, 600);
      expect(WorldMapComponent.isPositionInWater(oceanWaterPos), true);
    });
  });

  group('UserSession Paid vs Free Tier Tests', () {
    test('Guest session is Free tier with no account and no AI companion', () {
      final guest = UserSession(
        id: 'guest-1',
        displayName: 'Guest 123',
        username: 'guest_123',
        email: '',
        isGuest: true,
        tier: 'free',
        isPaid: false,
        hasAiCompanion: false,
      );
      expect(guest.isGuest, true);
      expect(guest.tier, 'free');
      expect(guest.isPaid, false);
      expect(guest.hasAiCompanion, false);
    });

    test('Registered user session is Paid tier with account and AI companion enabled', () {
      final member = UserSession(
        id: 'user-1',
        displayName: 'Pro Gamer',
        username: 'pro_gamer',
        email: 'pro@teemchat.app',
        isGuest: false,
        tier: 'paid',
        isPaid: true,
        hasAiCompanion: true,
      );
      expect(member.isGuest, false);
      expect(member.tier, 'paid');
      expect(member.isPaid, true);
      expect(member.hasAiCompanion, true);
    });
  });

  group('DetailLevel & Dynamic Token Budget Tests', () {
    test('DetailLevel correctly parses from learnedContext or defaults to balanced', () {
      final compDefault = CompanionModel(
        id: 'a1b2c3d4-e5f6-7a8b-9c0d-1e2f3a4b5c6d',
        userId: 'u1',
        name: 'Bot',
        persona: 'Friendly bot',
        createdAt: DateTime.now(),
        updatedAt: DateTime.now(),
      );
      expect(compDefault.detailLevel, DetailLevel.balanced);

      final compConcise = compDefault.copyWith(
        learnedContext: {'detail_level': 'concise'},
      );
      expect(compConcise.detailLevel, DetailLevel.concise);

      final compDetailed = compDefault.copyWith(
        learnedContext: {'detail_level': 'detailed'},
      );
      expect(compDetailed.detailLevel, DetailLevel.detailed);
    });
  });

  group('TTS Text Sanitization & Audio Tests', () {
    test('cleanTextForSpeech strips code fences, math blocks, and markdown symbols', () {
      const input = """
Hello there **traveler**!
Here is the code you asked for:
```python
def check_win(board):
    return True
```
Also look at this formula:
\$\$ x = \\frac{-b \\pm \\sqrt{d}}{2a} \$\$
Use `print(x)` to see the result.
- Be happy!
""";

      final cleaned = TtsService.cleanTextForSpeech(input);

      // Verify code block was converted to conversational note
      expect(cleaned.contains('def check_win'), false);
      expect(cleaned.contains('Code snippet provided in the chat.'), true);

      // Verify math block was converted to conversational note
      expect(cleaned.contains(r'\frac'), false);
      expect(cleaned.contains('Mathematical formula shown in the chat.'), true);

      // Verify backticks were stripped
      expect(cleaned.contains('`'), false);
      expect(cleaned.contains('print(x)'), true);

      // Verify markdown formatting asterisks were stripped
      expect(cleaned.contains('**'), false);
      expect(cleaned.contains('traveler'), true);
    });

    test('TtsService state toggles correctly and stops', () {
      expect(TtsService.isSpeaking.value, false);
      TtsService.speak('Test speech message');
      expect(TtsService.isSpeaking.value, true);
      expect(TtsService.currentSpeakingText.value, 'Test speech message');

      TtsService.stop();
      expect(TtsService.isSpeaking.value, false);
      expect(TtsService.currentSpeakingText.value, null);
    });
  });

  group('Companion UI & Widget Layout Tests', () {
    testWidgets('FormattedChatBubble renders text, code block, and math formula without overflow', (tester) async {
      final msgWithCodeAndMath = CompanionMessageModel(
        id: 'msg-test',
        companionId: 'comp-1',
        userId: 'u-1',
        role: 'assistant',
        content: """
Here is how to calculate quadratic roots in Python:
```python
def solve(a, b, c):
    d = b**2 - 4*a*c
    return (-b + d**0.5) / (2*a)
```
The formula is:
\$\$ x = \\frac{-b \\pm \\sqrt{b^2 - 4ac}}{2a} \$\$
Also note that `solve(1, -3, 2)` gives the roots!
- First root
- Second root
""",
        createdAt: DateTime.now(),
      );

      await tester.pumpWidget(
        MaterialApp(
          home: Scaffold(
            body: SingleChildScrollView(
              child: FormattedChatBubble(
                message: msgWithCodeAndMath,
                isUser: false,
              ),
            ),
          ),
        ),
      );
      await tester.pumpAndSettle();

      expect(find.text('PYTHON'), findsOneWidget);
      expect(find.text('FORMULA'), findsOneWidget);
      expect(find.text('Speak'), findsOneWidget);
    });

    testWidgets('CompanionModal renders cleanly and tabs can be navigated', (tester) async {
      await tester.pumpWidget(
        MaterialApp(
          home: Scaffold(
            body: CompanionModal(
              userName: 'Tester',
              currentZone: 'Town Square',
              onDismiss: () {},
            ),
          ),
        ),
      );
      await tester.pumpAndSettle();

      expect(find.text('Pixel Companion'), findsWidgets);
      expect(find.text('Chat'), findsOneWidget);
      expect(find.text('Learned Memory'), findsOneWidget);
      expect(find.text('Persona & Style'), findsOneWidget);

      // Verify Auto-Adaptive AI badge is present in Chat view
      expect(find.text('Auto-Adaptive AI'), findsOneWidget);
      expect(find.text('• Auto Depth & Tokens'), findsOneWidget);

      // Tap on Persona & Style tab
      await tester.tap(find.text('Persona & Style'));
      await tester.pumpAndSettle();

      expect(find.text('COMPANION FORM'), findsOneWidget);
      expect(find.text('VOICE & SPEECH (TTS)'), findsOneWidget);
      // Ensure manual token budget / detail setting is NOT present (automatic per user request)
      expect(find.text('RESPONSE DETAIL & TOKEN BUDGET'), findsNothing);

      // Tap on Learned Memory tab
      await tester.tap(find.text('Learned Memory'));
      await tester.pumpAndSettle();

      expect(find.text('LEARNED USER PROFILE'), findsOneWidget);
    });

    test('GeminiService autoDetectDetailLevel correctly identifies query complexity', () {
      // Concise queries: greetings, short acknowledgements, <= 2 words
      expect(GeminiService.autoDetectDetailLevel('Hello'), DetailLevel.concise);
      expect(GeminiService.autoDetectDetailLevel('ok thanks'), DetailLevel.concise);
      expect(GeminiService.autoDetectDetailLevel('yes please'), DetailLevel.concise);

      // Detailed / In-depth queries: code keywords, math keywords, complex questions
      expect(
        GeminiService.autoDetectDetailLevel('Write a dart function to calculate fibonacci numbers'),
        DetailLevel.detailed,
      );
      expect(
        GeminiService.autoDetectDetailLevel('Explain step by step how the quadratic formula roots work'),
        DetailLevel.detailed,
      );
      expect(
        GeminiService.autoDetectDetailLevel(
          'Can you tell me all about the history of retro gaming architectures and why 16-bit sound chips sound so distinctive?',
        ),
        DetailLevel.detailed,
      );

      // Balanced queries: standard conversational inquiries
      expect(
        GeminiService.autoDetectDetailLevel('What are your favorite spots to visit in Verdant Village?'),
        DetailLevel.balanced,
      );
    });

    test('CompanionService daily quota notifiers initialize and track limits correctly', () {
      expect(CompanionService.defaultDailyLimit, 50);
      expect(CompanionService.maxDailyMessages.value, 50);

      // Verify reactive updates
      CompanionService.remainingDailyMessages.value = 42;
      expect(CompanionService.remainingDailyMessages.value, 42);

      // Reset for cleanliness
      CompanionService.remainingDailyMessages.value = 50;
    });
  });
}


