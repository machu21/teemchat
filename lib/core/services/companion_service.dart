import 'dart:async';
import 'package:flutter/foundation.dart';
import '../../features/auth/auth_service.dart';
import '../models/companion_model.dart';
import 'gemini_service.dart';
import 'tts/tts_service.dart';

/// CompanionService — Manages the full AI Companion lifecycle.
///
/// RAG Memory Architecture:
///   • companion_memories table in Supabase stores key-value facts
///     alongside their 768-dim vector embeddings (Gemini text-embedding-004).
///   • On each message, the user's query is embedded and matched against
///     stored memory vectors via pgvector cosine similarity (match_companion_memories RPC).
///   • Only the top semantically relevant memories are injected into the prompt.
///   • After response generation, newly extracted facts are embedded and
///     written back to Supabase — closing the RAG loop.
///   • Guests and free-tier users do NOT have an AI companion.
class CompanionService {
  static final ValueNotifier<CompanionModel?> currentCompanion =
      ValueNotifier<CompanionModel?>(null);
  static final ValueNotifier<List<CompanionMemoryModel>> memories =
      ValueNotifier<List<CompanionMemoryModel>>([]);
  static final ValueNotifier<List<CompanionMessageModel>> messages =
      ValueNotifier<List<CompanionMessageModel>>([]);
  static final ValueNotifier<bool> isThinking = ValueNotifier<bool>(false);

  // ──────────────────────────────────────────────
  // DAILY QUOTA LIMITS (50 messages / day)
  // ──────────────────────────────────────────────
  static const int defaultDailyLimit = 50;

  /// Remaining messages for current UTC day
  static final ValueNotifier<int> remainingDailyMessages =
      ValueNotifier<int>(defaultDailyLimit);

  /// Maximum daily messages allowed
  static final ValueNotifier<int> maxDailyMessages =
      ValueNotifier<int>(defaultDailyLimit);

  /// When the daily quota resets (midnight UTC)
  static final ValueNotifier<DateTime?> quotaResetsAt =
      ValueNotifier<DateTime?>(null);

  /// Refreshes the daily usage status from Supabase RPC
  static Future<void> refreshUsageStatus() async {
    final client = AuthService.client;
    final isGuest = AuthService.currentSession?.isGuest == true;
    if (client == null || isGuest) return;

    try {
      final res = await client.rpc(
        'get_ai_usage_status',
        params: {'p_daily_limit': defaultDailyLimit},
      );

      if (res != null && res is Map<String, dynamic>) {
        final remaining = res['remaining'] as int? ?? defaultDailyLimit;
        final limit = res['daily_limit'] as int? ?? defaultDailyLimit;
        final resetsAtStr = res['resets_at'] as String?;

        remainingDailyMessages.value = remaining;
        maxDailyMessages.value = limit;
        if (resetsAtStr != null) {
          quotaResetsAt.value = DateTime.tryParse(resetsAtStr)?.toLocal();
        }
      }
    } catch (e) {
      debugPrint('Error refreshing AI usage status: $e');
    }
  }

  // ──────────────────────────────────────────────
  // COMPANION INITIALIZATION
  // ──────────────────────────────────────────────

  /// Load or initialize companion for current user.
  /// Returns `null` if the user is a guest or lacks the AI companion tier.
  static Future<CompanionModel?> loadOrCreateCompanion({
    required String userId,
    required String displayName,
  }) async {
    final client = AuthService.client;
    final isGuest = AuthService.currentSession?.isGuest == true;
    final hasAi = AuthService.currentSession?.hasAiCompanion ?? false;

    // Guests do NOT get an AI companion
    if (client == null || isGuest || !hasAi) {
      currentCompanion.value = null;
      memories.value = [];
      messages.value = [];
      return null;
    }

    try {
      final existing = await client
          .from('ai_companions')
          .select()
          .eq('user_id', userId)
          .maybeSingle();

      if (existing != null) {
        final comp = CompanionModel.fromJson(existing);
        currentCompanion.value = comp;
        await _loadRecentMemories(comp.id, userId);
        await _loadMessages(comp.id, userId);
        await refreshUsageStatus();
        return comp;
      } else {
        // Create new companion row WITHOUT specifying 'id' so Postgres generates a real UUID
        final inserted = await client
            .from('ai_companions')
            .insert({
              'user_id': userId,
              'name': 'Pixel Companion',
              'persona':
                  'A friendly, insightful AI companion who travels the virtual world with you and learns your style.',
              'companion_type': 'robot',
              'avatar_style': 'bot_blue',
              'learned_context': {},
              'is_active': true,
            })
            .select()
            .single();

        final comp = CompanionModel.fromJson(inserted);
        currentCompanion.value = comp;
        await refreshUsageStatus();
        return comp;
      }
    } catch (e) {
      debugPrint('CompanionService loadOrCreate error: $e');
      return null;
    }
  }

  // ──────────────────────────────────────────────
  // MEMORY LOADING (fallback / initial load)
  // ──────────────────────────────────────────────

  /// Loads the most important recent memories for the companion.
  static Future<void> _loadRecentMemories(
    String companionId,
    String userId,
  ) async {
    final client = AuthService.client;
    if (client == null || !CompanionModel.isValidUuid(companionId)) return;
    try {
      final res = await client
          .from('companion_memories')
          .select(
            'id, memory_key, memory_value, category, importance_score, created_at',
          )
          .eq('companion_id', companionId)
          .order('importance_score', ascending: false)
          .order('created_at', ascending: false)
          .limit(20);

      final list = (res as List<dynamic>)
          .map(
            (item) =>
                CompanionMemoryModel.fromJson(item as Map<String, dynamic>),
          )
          .toList();
      memories.value = list;
    } catch (e) {
      debugPrint('Error loading companion memories: $e');
    }
  }

  // ──────────────────────────────────────────────
  // RAG RETRIEVAL (pgvector similarity search)
  // ──────────────────────────────────────────────

  /// Performs semantic similarity search against companion_memories.
  /// Embeds the [queryText] and calls the Supabase `match_companion_memories` RPC.
  /// Falls back to recent memories if embedding fails or no vectors stored yet.
  static Future<List<CompanionMemoryModel>> _retrieveRelevantMemories(
    String companionId,
    String queryText,
  ) async {
    final client = AuthService.client;
    if (client == null || !CompanionModel.isValidUuid(companionId)) {
      return memories.value.take(8).toList();
    }

    // Step 1: Generate embedding for the query
    final embedding = await GeminiService.generateEmbedding(queryText);

    // Step 2: Vector similarity search via Supabase RPC
    if (embedding != null) {
      try {
        final results = await client.rpc('match_companion_memories', params: {
          'p_companion_id': companionId,
          'p_query_embedding': embedding,
          'p_match_count': 6,
          'p_min_similarity': 0.55,
        });

        final list = (results as List<dynamic>)
            .map(
              (item) =>
                  CompanionMemoryModel.fromJson(item as Map<String, dynamic>),
            )
            .toList();

        if (list.isNotEmpty) {
          debugPrint(
            'RAG: Retrieved ${list.length} semantically relevant memories for query.',
          );
          return list;
        }
      } catch (e) {
        debugPrint('RAG similarity search error: $e');
      }
    }

    // Step 3: Cold-start fallback — return most important recent memories
    return memories.value.take(8).toList();
  }

  // ──────────────────────────────────────────────
  // MESSAGE LOADING
  // ──────────────────────────────────────────────

  static Future<void> _loadMessages(
    String companionId,
    String userId,
  ) async {
    final client = AuthService.client;
    if (client == null || !CompanionModel.isValidUuid(companionId)) return;
    try {
      final res = await client
          .from('companion_messages')
          .select()
          .eq('companion_id', companionId)
          .order('created_at', ascending: true)
          .limit(40);

      final list = (res as List<dynamic>)
          .map(
            (item) =>
                CompanionMessageModel.fromJson(item as Map<String, dynamic>),
          )
          .toList();
      messages.value = list;
    } catch (e) {
      debugPrint('Error loading companion messages: $e');
    }
  }

  // ──────────────────────────────────────────────
  // SEND MESSAGE (Full RAG Pipeline)
  // ──────────────────────────────────────────────

  /// Sends a message from the user to the companion and gets a RAG-augmented
  /// Gemini response.
  static Future<String> sendMessage({
    required String userText,
    required String currentZone,
    required String userName,
    DetailLevel? detailLevel,
  }) async {
    final companion = currentCompanion.value;
    if (companion == null) return "I'm still waking up! Give me a second...";

    final userMsg = CompanionMessageModel(
      id: 'local-${DateTime.now().millisecondsSinceEpoch}',
      companionId: companion.id,
      userId: companion.userId,
      role: 'user',
      content: userText,
      createdAt: DateTime.now(),
    );

    messages.value = [...messages.value, userMsg];
    isThinking.value = true;

    try {
      // Quota Enforcement: Check and increment usage atomically on Supabase
      final client = AuthService.client;
      final isGuest = AuthService.currentSession?.isGuest == true;

      if (client != null && !isGuest) {
        try {
          final usageRes = await client.rpc(
            'check_and_increment_ai_usage',
            params: {'p_daily_limit': defaultDailyLimit},
          );

          if (usageRes != null && usageRes is Map<String, dynamic>) {
            final allowed = usageRes['allowed'] as bool? ?? true;
            final remaining = usageRes['remaining'] as int? ?? 0;
            final limit = usageRes['daily_limit'] as int? ?? defaultDailyLimit;
            final resetsAtStr = usageRes['resets_at'] as String?;

            remainingDailyMessages.value = remaining;
            maxDailyMessages.value = limit;
            if (resetsAtStr != null) {
              quotaResetsAt.value = DateTime.tryParse(resetsAtStr)?.toLocal();
            }

            if (!allowed) {
              isThinking.value = false;
              final exhaustedText =
                  "⚡ I've reached my daily energy limit ($limit/$limit messages). Energy recharges at midnight UTC! Let's chat again tomorrow.";

              final assistantMsg = CompanionMessageModel(
                id: 'reply-limit-${DateTime.now().millisecondsSinceEpoch}',
                companionId: companion.id,
                userId: companion.userId,
                role: 'assistant',
                content: exhaustedText,
                createdAt: DateTime.now(),
              );

              messages.value = [...messages.value, assistantMsg];
              _persistMessages([userMsg, assistantMsg]);
              return exhaustedText;
            }
          }
        } catch (rpcErr) {
          debugPrint('AI quota check RPC warning: $rpcErr');
        }
      }

      // RAG Step 2: Retrieve semantically relevant memories
      final ragMemories = await _retrieveRelevantMemories(
        companion.id,
        userText,
      );

      // RAG Step 3+4: Generate response with relevant context injected
      final responseText = await GeminiService.generateCompanionResponse(
        companion: companion,
        userName: userName,
        currentZone: currentZone,
        recentHistory: messages.value,
        userMessage: userText,
        detailLevel: detailLevel,
        ragMemories: ragMemories,
      );

      final assistantMsg = CompanionMessageModel(
        id: 'reply-${DateTime.now().millisecondsSinceEpoch}',
        companionId: companion.id,
        userId: companion.userId,
        role: 'assistant',
        content: responseText,
        createdAt: DateTime.now(),
      );

      messages.value = [...messages.value, assistantMsg];
      isThinking.value = false;

      // Read aloud if auto-speak is enabled
      if (TtsService.autoSpeak.value) {
        TtsService.speak(responseText);
      }

      // RAG Step 5: Persist messages to Supabase
      _persistMessages([userMsg, assistantMsg]);

      // RAG Steps 6+7: Extract facts → embed → store vectors (fully async)
      _learnAndEmbedFromConversation(
        userName: userName,
        userText: userText,
        companionResponse: responseText,
      );

      return responseText;
    } catch (e) {
      isThinking.value = false;
      debugPrint('CompanionService sendMessage error: $e');
      return "I'm with you, $userName! Ready whenever you are!";
    }
  }

  // ──────────────────────────────────────────────
  // PERSIST MESSAGES
  // ──────────────────────────────────────────────

  static void _persistMessages(List<CompanionMessageModel> msgs) async {
    final client = AuthService.client;
    if (client == null || AuthService.currentSession?.isGuest == true) return;

    CompanionModel? comp = currentCompanion.value;
    if (comp == null) return;

    // Verify companion has a valid UUID
    if (!CompanionModel.isValidUuid(comp.id)) {
      try {
        final existing = await client
            .from('ai_companions')
            .select()
            .eq('user_id', comp.userId)
            .maybeSingle();
        if (existing != null) {
          comp = CompanionModel.fromJson(existing);
          currentCompanion.value = comp;
        }
      } catch (e) {
        debugPrint('Error verifying companion UUID: $e');
      }
    }

    final activeComp = comp;
    if (activeComp == null || !CompanionModel.isValidUuid(activeComp.id)) {
      debugPrint(
        'Cannot persist messages: companion id "${activeComp?.id}" is not a valid UUID',
      );
      return;
    }

    try {
      for (final m in msgs) {
        await client.from('companion_messages').insert({
          'companion_id': activeComp.id,
          'user_id': m.userId,
          'role': m.role,
          'content': m.content,
        });
      }
      debugPrint('Persisted ${msgs.length} messages to companion_messages.');
    } catch (e) {
      debugPrint('Error persisting companion messages: $e');
    }
  }

  // ──────────────────────────────────────────────
  // LEARN + EMBED (RAG Steps 6 & 7)
  // ──────────────────────────────────────────────

  /// Extracts new facts from the conversation, generates embeddings for each,
  /// and persists them to Supabase with their vector for future RAG retrieval.
  static void _learnAndEmbedFromConversation({
    required String userName,
    required String userText,
    required String companionResponse,
  }) async {
    CompanionModel? companion = currentCompanion.value;
    if (companion == null) return;

    try {
      // Step 6: Extract facts via Gemini
      final facts = await GeminiService.extractLearnedFacts(
        userName: userName,
        userMessage: userText,
        companionResponse: companionResponse,
      );

      if (facts.isEmpty) {
        debugPrint('No new learned facts extracted from turn.');
        return;
      }
      debugPrint('Extracted ${facts.length} new facts: $facts');

      // Update in-memory companion state
      final updatedContext = Map<String, dynamic>.from(
        companion.learnedContext,
      );
      facts.forEach((k, v) => updatedContext[k] = v);
      companion = companion.copyWith(learnedContext: updatedContext);
      currentCompanion.value = companion;

      final client = AuthService.client;
      if (client == null || AuthService.currentSession?.isGuest == true) {
        return;
      }

      // Ensure companion has a valid UUID in the database
      if (!CompanionModel.isValidUuid(companion.id)) {
        final existing = await client
            .from('ai_companions')
            .select()
            .eq('user_id', companion.userId)
            .maybeSingle();
        if (existing != null) {
          companion = CompanionModel.fromJson(
            existing,
          ).copyWith(learnedContext: updatedContext);
          currentCompanion.value = companion;
        }
      }

      final activeComp = companion;
      if (!CompanionModel.isValidUuid(activeComp.id)) {
        debugPrint('Cannot persist memories: invalid companion UUID');
        return;
      }

      // Update the companion's learned_context JSON snapshot
      await client.from('ai_companions').update({
        'learned_context': updatedContext,
        'updated_at': DateTime.now().toUtc().toIso8601String(),
      }).eq('id', activeComp.id);

      // Step 7: Embed each new fact and store with vector in companion_memories
      for (final entry in facts.entries) {
        final factText = '${entry.key}: ${entry.value} (about user $userName)';
        final embedding = await GeminiService.generateEmbedding(factText);

        await client.from('companion_memories').insert({
          'companion_id': activeComp.id,
          'user_id': activeComp.userId,
          'memory_key': entry.key,
          'memory_value': entry.value,
          'category': 'learned_fact',
          'importance_score': 0.8,
          if (embedding != null) 'embedding': '[${embedding.join(',')}]',
        });
      }
      debugPrint(
        'Successfully saved and embedded ${facts.length} facts in companion_memories!',
      );

      // Reload local memory cache
      await _loadRecentMemories(companion.id, companion.userId);
    } catch (e) {
      debugPrint('Error in learn+embed pipeline: $e');
    }
  }

  // ──────────────────────────────────────────────
  // COMPANION UPDATES (Persona, Style, Name)
  // ──────────────────────────────────────────────

  /// Update companion personality / persona / type / detail level.
  /// Reliably upserts to Supabase and updates local ValueNotifier.
  static Future<CompanionModel?> updateCompanion({
    required String name,
    required String persona,
    required String companionType,
    required String avatarStyle,
    DetailLevel? detailLevel,
  }) async {
    final current = currentCompanion.value;
    if (current == null) return null;

    final updatedContext = Map<String, dynamic>.from(current.learnedContext);
    if (detailLevel != null) {
      updatedContext['detail_level'] = detailLevel.name;
    }

    final updated = current.copyWith(
      name: name,
      persona: persona,
      companionType: companionType,
      avatarStyle: avatarStyle,
      learnedContext: updatedContext,
    );

    currentCompanion.value = updated;

    final client = AuthService.client;
    if (client != null && AuthService.currentSession?.isGuest == false) {
      try {
        final payload = <String, dynamic>{
          'user_id': current.userId,
          'name': name,
          'persona': persona,
          'companion_type': companionType,
          'avatar_style': avatarStyle,
          'learned_context': updatedContext,
          'updated_at': DateTime.now().toUtc().toIso8601String(),
        };

        if (CompanionModel.isValidUuid(current.id)) {
          payload['id'] = current.id;
        }

        final res = await client
            .from('ai_companions')
            .upsert(payload, onConflict: 'user_id')
            .select()
            .single();

        final saved = CompanionModel.fromJson(res);
        currentCompanion.value = saved;
        debugPrint(
          'Successfully updated companion in Supabase: ${saved.name} (${saved.companionType})',
        );
        return saved;
      } catch (e) {
        debugPrint('Error updating companion in Supabase: $e');
      }
    }
    return updated;
  }

  // ──────────────────────────────────────────────
  // MEMORY RESET
  // ──────────────────────────────────────────────

  /// Reset all memories (including vectors) to let the AI learn from scratch.
  static Future<void> resetLearnedKnowledge() async {
    final current = currentCompanion.value;
    if (current == null) return;

    currentCompanion.value = current.copyWith(learnedContext: {});
    memories.value = [];

    final client = AuthService.client;
    if (client != null && AuthService.currentSession?.isGuest == false) {
      try {
        if (CompanionModel.isValidUuid(current.id)) {
          await client
              .from('companion_memories')
              .delete()
              .eq('companion_id', current.id);
          await client.from('ai_companions').update({
            'learned_context': {},
            'updated_at': DateTime.now().toUtc().toIso8601String(),
          }).eq('id', current.id);
        }
      } catch (e) {
        debugPrint('Error resetting companion knowledge: $e');
      }
    }
  }
}
