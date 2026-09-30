import 'dart:convert';
import 'package:flutter/foundation.dart';
import 'package:http/http.dart' as http;
import '../constants/gemini_config.dart';
import '../models/companion_model.dart';

/// GeminiService — LLM integration for AI Companion.
///
/// RAG Pipeline:
///   1. User sends message
///   2. [generateEmbedding] converts message/fact to a 768-dim vector
///   3. Supabase pgvector retrieves semantically relevant memories
///   4. [generateCompanionResponse] injects only relevant memories into the prompt
///   5. Gemini generates a response
///   6. [extractLearnedFacts] parses new facts from the conversation
///   7. New facts are embedded + stored back in Supabase (closing the loop)
class GeminiService {
  static const String _baseUrl =
      'https://generativelanguage.googleapis.com/v1beta/models';

  // Chat model: gemini-3.8-flash with generous thinking + output tokens
  static String get _chatModel => GeminiConfig.model;

  // 768-dim embedding model, optimised for semantic similarity
  static const String _embeddingModel = 'text-embedding-004';

  // ──────────────────────────────────────────────
  // EMBEDDING (RAG Steps 1 & 7)
  // ──────────────────────────────────────────────

  /// Generates a 768-dimensional embedding vector for [text] using
  /// Gemini `text-embedding-004`. Returns `null` on failure.
  static Future<List<double>?> generateEmbedding(String text) async {
    if (!GeminiConfig.isConfigured) return null;
    try {
      final endpoint = Uri.parse(
        '$_baseUrl/$_embeddingModel:embedContent?key=${GeminiConfig.apiKey}',
      );

      final body = jsonEncode({
        'model': 'models/$_embeddingModel',
        'content': {
          'parts': [
            {'text': text},
          ],
        },
        'taskType': 'SEMANTIC_SIMILARITY',
      });

      final response = await http.post(
        endpoint,
        headers: {'Content-Type': 'application/json'},
        body: body,
      );

      if (response.statusCode == 200) {
        final data = jsonDecode(response.body) as Map<String, dynamic>;
        final values = data['embedding']?['values'] as List<dynamic>?;
        if (values != null) {
          return values.map((v) => (v as num).toDouble()).toList();
        }
      } else {
        debugPrint(
          'Gemini embedding error [${response.statusCode}]: ${response.body}',
        );
      }
    } catch (e) {
      debugPrint('Error generating embedding: $e');
    }
    return null;
  }

  /// Automatically classifies the appropriate detail level and token budget
  /// based on the complexity, intent, and length of [userMessage].
  static DetailLevel autoDetectDetailLevel(String userMessage) {
    final text = userMessage.trim();
    final lower = text.toLowerCase();
    final words = text.split(RegExp(r'\s+')).where((w) => w.isNotEmpty).toList();
    final wordCount = words.length;

    // 1. Brief acknowledgements, greetings, and stop signals -> Concise
    final isStopSignal = lower == 'stop' ||
        lower == 'bye' ||
        lower == 'goodbye' ||
        lower == 'cya' ||
        lower == 'gtg' ||
        lower.contains('stop the conversation') ||
        lower.contains('not for now') ||
        lower.contains('pause the chat') ||
        lower.startsWith('bye') ||
        lower.startsWith('goodbye');

    final isBriefAck = RegExp(
      r'^(sure|ok|okay|yes|yeah|yep|cool|nice|k|got it|sounds good|alright|fine|thx|thanks|ty|hello|hi|hey|sup)\b',
      caseSensitive: false,
    ).hasMatch(text) && wordCount <= 3;

    if (isStopSignal || isBriefAck || wordCount <= 2) {
      return DetailLevel.concise;
    }

    // 2. High-complexity keywords: code, math, technical analysis, step-by-step -> Detailed
    final hasCodeKeywords = RegExp(
      r'\b(code|function|program|script|algorithm|debug|python|dart|javascript|typescript|flutter|sql|html|css|c\+\+|java|rust|regex|class|api|component|build|implement|refactor)\b',
      caseSensitive: false,
    ).hasMatch(lower);

    final hasMathKeywords = RegExp(
      r'\b(formula|equation|math|solve|derive|derivative|integral|matrix|vector|theorem|proof|calculate|geometry|algebra|calculus)\b',
      caseSensitive: false,
    ).hasMatch(lower);

    final hasExplanationKeywords = RegExp(
      r'\b(explain in detail|step by step|how does .* work|why does|guide me|teach me|breakdown|deep dive|difference between|pros and cons|comprehensive|walk me through)\b',
      caseSensitive: false,
    ).hasMatch(lower);

    if (hasCodeKeywords || hasMathKeywords || hasExplanationKeywords || wordCount >= 20) {
      return DetailLevel.detailed;
    }

    // 3. Default to natural, balanced conversation
    return DetailLevel.balanced;
  }

  // ──────────────────────────────────────────────
  // COMPANION RESPONSE (RAG Step 4)
  // ──────────────────────────────────────────────

  /// Generates a companion chat response. [ragMemories] are pre-filtered by
  /// pgvector similarity search — only the most semantically relevant facts
  /// are injected, keeping the prompt clean and focused.
  static Future<String> generateCompanionResponse({
    required CompanionModel companion,
    required String userName,
    required String currentZone,
    required List<CompanionMessageModel> recentHistory,
    required String userMessage,
    DetailLevel? detailLevel,
    // RAG-retrieved memories (semantically filtered by Supabase pgvector)
    List<CompanionMemoryModel>? ragMemories,
    // Kept for backward-compat; prefer ragMemories going forward
    List<CompanionMemoryModel>? memories,
  }) async {
    if (!GeminiConfig.isConfigured) {
      return "Hello $userName! I'm your AI companion in $currentZone. (Add your Gemini API key to activate my full intelligence!)";
    }

    try {
      final endpoint = Uri.parse(
        '$_baseUrl/$_chatModel:generateContent?key=${GeminiConfig.apiKey}',
      );

      // Prefer RAG-retrieved memories over the raw full list
      final effectiveMemories = (ragMemories?.isNotEmpty ?? false)
          ? ragMemories!
          : (memories ?? []);

      final memoryBullets = <String>[];
      for (final m in effectiveMemories) {
        memoryBullets.add('- ${m.key}: ${m.value}');
      }
      // Always merge core learned context (high-importance persistent facts)
      if (companion.learnedContext.isNotEmpty) {
        companion.learnedContext.forEach((k, v) {
          if (!memoryBullets.any((b) => b.contains(k))) {
            memoryBullets.add('- $k: $v');
          }
        });
      }

      final memorySection = memoryBullets.isNotEmpty
          ? '\nRELEVANT THINGS YOU KNOW ABOUT $userName (retrieved from memory):\n${memoryBullets.join('\n')}'
          : '\nWHAT YOU KNOW ABOUT $userName:\n- This is a new relationship. Be eager to learn the user\'s habits, passions, goals, and preferred vibe!';

      // Dynamic Token & Detail Budgeting
      final lower = userMessage.trim().toLowerCase();
      final isStopSignal = lower == 'stop' ||
          lower == 'bye' ||
          lower == 'goodbye' ||
          lower == 'cya' ||
          lower == 'gtg' ||
          lower.contains('stop the conversation') ||
          lower.contains('not for now') ||
          lower.contains('pause the chat') ||
          lower.startsWith('bye') ||
          lower.startsWith('goodbye');

      final isBriefAck = RegExp(
            r'^(sure|ok|okay|yes|yeah|yep|cool|nice|k|got it|sounds good|alright|fine|thx|thanks|ty)\b',
            caseSensitive: false,
          ).hasMatch(userMessage.trim()) &&
          userMessage.trim().split(RegExp(r'\s+')).length <= 3;

      final effectiveLevel = detailLevel ?? autoDetectDetailLevel(userMessage);
      final String detailConstraint;
      final int targetMaxTokens;

      if (isStopSignal) {
        detailConstraint =
            "USER SIGNALS PAUSE/STOP: Respond with ONE short, warm, graceful farewell (e.g. 'Understood, I\\'ll be right here whenever you need me!'). Do NOT ask questions, lecture, or continue.";
        targetMaxTokens = 450;
      } else if (isBriefAck) {
        detailConstraint =
            "USER GAVE BRIEF ACKNOWLEDGEMENT: Respond with ONE short, warm, pleasant sentence (e.g. 'Sounds awesome! Ready whenever you are.'). Do NOT dump a wall of text or explain concepts unless asked.";
        targetMaxTokens = 450;
      } else {
        switch (effectiveLevel) {
          case DetailLevel.concise:
            detailConstraint =
                "AUTOMATIC DETAIL CONSTRAINT: CONCISE MODE. The user sent a brief inquiry or greeting. Deliver a short, direct, punchy reply in 1 to 2 sentences maximum. Do not ramble, do not write paragraphs, and do not add unnecessary questions.";
            targetMaxTokens = 512;
            break;
          case DetailLevel.detailed:
            detailConstraint =
                "AUTOMATIC DETAIL CONSTRAINT: IN-DEPTH MODE. The user requested code, mathematical analysis, technical breakdown, or a deep explanation. Provide a thorough, well-structured explanation with clear step-by-step guidance, code blocks, or formulas where appropriate.";
            targetMaxTokens = 2048;
            break;
          case DetailLevel.balanced:
          default:
            detailConstraint =
                "AUTOMATIC DETAIL CONSTRAINT: BALANCED MODE. Respond proportionately to the user's message in 2 to 3 natural sentences. If the user sent a brief remark, be brief; only provide detailed explanations if they asked a substantive question.";
            targetMaxTokens = 1024;
            break;
        }
      }

      final systemInstructionText = """
You are '${companion.name}', a loyal, highly intelligent personal AI companion inside 'TeemChat', a vibrant 2D retro virtual world.
Your persona: ${companion.persona}
Companion form: ${companion.companionType} (${companion.avatarStyle})
Owner: $userName
Current location in virtual world: $currentZone
$memorySection

CRITICAL INSTRUCTIONS:
1. Speak in your chosen persona faithfully. Be warm, attentive, witty, and loyal to $userName.
2. PROACTIVELY GET TO KNOW YOUR OWNER: Be naturally curious! When appropriate, ask engaging questions about $userName's hobbies, daily life, creative passions, work/studies, gaming style, or what they hope to build or discover in TeemChat.
3. PROPORTIONALITY & DETAIL RULE:
   $detailConstraint
4. FORMATTING RULES FOR CODE AND MATH:
   - When writing programming code, ALWAYS enclose code in markdown triple backtick fences with the language identifier (e.g. ```python\ncode\n``` or ```dart\ncode\n```).
   - When referencing inline code, variables, or functions, enclose them in single backticks like `board = [" "] * 9`.
   - When writing mathematical formulas or equations, format display equations in `\$\$ equation \$\$` or use standard clean symbols like `3 × 3`, `x² + y² = r²`.
5. Reference the world context naturally (zones: Verdant Village, Whispering Woods, Adventure Camp, Craggy Ridge, Crystal Bay, River Crossing).
6. If the user shares preferences, hobbies, or instructions on how they want you to act, enthusiastically adopt and acknowledge them immediately.
7. Seamlessly weave in what you remember from past conversations to make $userName feel truly known and valued.
""";

      // Multi-turn history (last 8 messages)
      final contents = <Map<String, dynamic>>[];
      final historyToInclude = recentHistory.length > 8
          ? recentHistory.sublist(recentHistory.length - 8)
          : recentHistory;

      for (final msg in historyToInclude) {
        contents.add({
          'role': msg.role == 'assistant' ? 'model' : 'user',
          'parts': [
            {'text': msg.content},
          ],
        });
      }

      contents.add({
        'role': 'user',
        'parts': [
          {'text': userMessage},
        ],
      });

      final body = jsonEncode({
        'system_instruction': {
          'parts': [
            {'text': systemInstructionText},
          ],
        },
        'contents': contents,
        'generationConfig': {
          'temperature': 0.85,
          'maxOutputTokens': targetMaxTokens,
          'topP': 0.95,
        },
      });

      final response = await http.post(
        endpoint,
        headers: {'Content-Type': 'application/json'},
        body: body,
      );

      if (response.statusCode == 200) {
        final data = jsonDecode(response.body) as Map<String, dynamic>;
        final candidates = data['candidates'] as List<dynamic>?;
        if (candidates != null && candidates.isNotEmpty) {
          final first = candidates.first as Map<String, dynamic>;
          final content = first['content'] as Map<String, dynamic>?;
          final parts = content?['parts'] as List<dynamic>?;
          if (parts != null && parts.isNotEmpty) {
            // Find the visible text part (ignoring thinking/thought tokens)
            for (final part in parts) {
              if (part is Map<String, dynamic> && part.containsKey('text')) {
                final text = part['text'] as String?;
                if (text != null && text.trim().isNotEmpty) {
                  return text.trim();
                }
              }
            }
          }
        }
      } else {
        debugPrint(
          'Gemini API error [${response.statusCode}]: ${response.body}',
        );
        if (response.statusCode == 429) {
          return "Phew, I'm thinking super fast right now! Give me a few seconds and ask me again! ⚡";
        }
      }
    } catch (e) {
      debugPrint('Error calling Gemini API: $e');
    }

    return "I'm right beside you, $userName! Ready to explore $currentZone together!";
  }

  // ──────────────────────────────────────────────
  // FACT EXTRACTION (RAG Step 6)
  // ──────────────────────────────────────────────

  /// Extracts newly learned facts or persona adjustments from a conversation.
  /// Returns a map of {key: value} pairs to embed and store in Supabase.
  static Future<Map<String, String>> extractLearnedFacts({
    required String userName,
    required String userMessage,
    required String companionResponse,
  }) async {
    if (!GeminiConfig.isConfigured) return {};

    try {
      final endpoint = Uri.parse(
        '$_baseUrl/$_chatModel:generateContent?key=${GeminiConfig.apiKey}',
      );

      final prompt = """
Analyze this brief chat between user '$userName' and their AI companion:
User: "$userMessage"
Companion: "$companionResponse"

Did the user state or imply any personal fact, preference, interest, job, style, or specific instruction on how they want the AI to act?
If YES, respond ONLY with a JSON object containing key-value pairs (max 3 items), e.g.:
{"favorite_activity": "building spaces", "vibe": "cyberpunk navigator", "works_as": "game developer"}
If NO new personal facts or preferences were revealed, respond with:
{}
Do not include markdown fences or any other text. Keys should be snake_case descriptors.
""";

      final body = jsonEncode({
        'contents': [
          {
            'role': 'user',
            'parts': [
              {'text': prompt},
            ],
          },
        ],
        'generationConfig': {
          'temperature': 0.1,
          'maxOutputTokens': 1024,
        },
      });

      final res = await http.post(
        endpoint,
        headers: {'Content-Type': 'application/json'},
        body: body,
      );

      if (res.statusCode == 200) {
        final data = jsonDecode(res.body) as Map<String, dynamic>;
        final candidates = data['candidates'] as List<dynamic>?;
        if (candidates != null && candidates.isNotEmpty) {
          final content = candidates.first['content'] as Map<String, dynamic>?;
          final parts = content?['parts'] as List<dynamic>?;
          if (parts != null && parts.isNotEmpty) {
            String rawText = '';
            for (final part in parts) {
              if (part is Map<String, dynamic> && part.containsKey('text')) {
                rawText = part['text'] as String? ?? '';
              }
            }

            final clean = rawText
                .replaceAll('```json', '')
                .replaceAll('```', '')
                .trim();
            if (clean.isNotEmpty && clean != '{}') {
              final start = clean.indexOf('{');
              final end = clean.lastIndexOf('}');
              if (start != -1 && end != -1 && end > start) {
                final jsonStr = clean.substring(start, end + 1);
                final decoded = jsonDecode(jsonStr);
                if (decoded is Map) {
                  return decoded.map((k, v) => MapEntry(k.toString(), v.toString()));
                }
              }
            }
          }
        }
      }
    } catch (e) {
      debugPrint('Error extracting learned facts: $e');
    }

    return {};
  }
}
