import 'package:flutter/material.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import '../../core/models/avatar_model.dart';
import '../../core/services/space_service.dart';

class UserSession {
  final String id;
  final String displayName;
  final String username;
  final String email;
  final String status;
  final AvatarConfig avatarConfig;
  final bool isGuest;
  final String tier; // 'free' or 'paid'
  final bool isPaid;
  final bool hasAiCompanion;

  UserSession({
    required this.id,
    required this.displayName,
    required this.username,
    required this.email,
    this.status = 'available',
    this.avatarConfig = const AvatarConfig(),
    this.isGuest = false,
    this.tier = 'paid',
    this.isPaid = true,
    this.hasAiCompanion = true,
  });

  UserSession copyWith({
    String? displayName,
    String? username,
    String? status,
    AvatarConfig? avatarConfig,
    String? tier,
    bool? isPaid,
    bool? hasAiCompanion,
  }) {
    return UserSession(
      id: id,
      displayName: displayName ?? this.displayName,
      username: username ?? this.username,
      email: email,
      status: status ?? this.status,
      avatarConfig: avatarConfig ?? this.avatarConfig,
      isGuest: isGuest,
      tier: tier ?? this.tier,
      isPaid: isPaid ?? this.isPaid,
      hasAiCompanion: hasAiCompanion ?? this.hasAiCompanion,
    );
  }
}

class AuthService {
  static bool isInitialized = false;
  static SupabaseClient? get client => isInitialized ? Supabase.instance.client : null;

  static final ValueNotifier<UserSession?> sessionNotifier = ValueNotifier<UserSession?>(null);
  static UserSession? get currentSession => sessionNotifier.value;
  static bool get isPaid => currentSession != null && currentSession!.isPaid;

  static void initSessionListener() {
    if (!isInitialized || client == null) return;

    client!.auth.onAuthStateChange.listen((data) async {
      final session = data.session;
      if (session != null) {
        final profile = await getProfile(session.user.id);
        final meta = session.user.userMetadata ?? {};
        final displayName = profile?['display_name'] ?? meta['display_name'] ?? session.user.email?.split('@').first ?? 'Explorer';
        final username = profile?['username'] ?? meta['username'] ?? 'user_${session.user.id.substring(0, 5)}';
        final status = profile?['status'] ?? 'available';
        final avatarConfig = profile?['avatar_config'] != null
            ? AvatarConfig.fromJson(profile!['avatar_config'])
            : const AvatarConfig();

        final isPaid = profile?['is_paid'] as bool? ?? true;
        final tier = profile?['tier'] as String? ?? (isPaid ? 'paid' : 'free');
        final hasAi = profile?['has_ai_companion'] as bool? ?? isPaid;

        sessionNotifier.value = UserSession(
          id: session.user.id,
          displayName: displayName,
          username: username,
          email: session.user.email ?? '',
          status: status,
          avatarConfig: avatarConfig,
          isGuest: false,
          tier: tier,
          isPaid: isPaid,
          hasAiCompanion: hasAi,
        );
      } else if (sessionNotifier.value != null && !sessionNotifier.value!.isGuest) {
        sessionNotifier.value = null;
      }
    });
  }

  static Future<void> signInGuest([String? name]) async {
    // If a user was previously signed in with Supabase auth, sign out cleanly to decouple guest session
    if (client != null && client!.auth.currentSession != null) {
      try {
        await client!.auth.signOut();
      } catch (_) {}
    }

    // Always clear out any stale guest temporary maps on fresh guest sign-in
    SpaceService.clearGuestMaps();

    final randomId = (DateTime.now().millisecondsSinceEpoch % 9000) + 1000;
    final guestName = (name != null && name.trim().isNotEmpty && name != 'The Crew HQ')
        ? name.trim()
        : 'Guest #$randomId';

    const guestColors = [
      Color(0xFFEF4444),
      Color(0xFFF59E0B),
      Color(0xFF10B981),
      Color(0xFF06B6D4),
      Color(0xFF8B5CF6),
      Color(0xFFEC4899),
      Color(0xFF3B82F6),
    ];
    final color = guestColors[randomId % guestColors.length];

    sessionNotifier.value = UserSession(
      id: 'guest_${DateTime.now().millisecondsSinceEpoch}_$randomId',
      displayName: guestName,
      username: 'guest_$randomId',
      email: 'guest_$randomId@virtualworld.local',
      status: 'available',
      avatarConfig: AvatarConfig(shirtColor: color),
      isGuest: true,
      tier: 'free',
      isPaid: false,
      hasAiCompanion: false,
    );
  }

  static Future<void> signUp({
    required String email,
    required String password,
    required String username,
    required String displayName,
  }) async {
    if (!isInitialized || client == null) {
      throw Exception("Supabase is not configured yet. You can sign in using 'Continue as Guest'.");
    }

    final res = await client!.auth.signUp(
      email: email,
      password: password,
      data: {
        'username': username,
        'display_name': displayName,
      },
    );

    if (res.user != null) {
      try {
        await client!.from('profiles').upsert({
          'id': res.user!.id,
          'username': username,
          'display_name': displayName,
          'status': 'available',
          'tier': 'paid',
          'is_paid': true,
          'has_ai_companion': true,
          'avatar_config': const AvatarConfig().toJson(),
        });
      } catch (_) {
        // Table may not exist yet if migrations haven't run
      }

      sessionNotifier.value = UserSession(
        id: res.user!.id,
        displayName: displayName,
        username: username,
        email: email,
        status: 'available',
        avatarConfig: const AvatarConfig(),
        isGuest: false,
        tier: 'paid',
        isPaid: true,
        hasAiCompanion: true,
      );
    }
  }

  static Future<void> signIn({
    required String email,
    required String password,
  }) async {
    if (!isInitialized || client == null) {
      throw Exception("Supabase is not configured yet. You can sign in using 'Continue as Guest'.");
    }

    final res = await client!.auth.signInWithPassword(
      email: email,
      password: password,
    );

    if (res.user != null) {
      final profile = await getProfile(res.user!.id);
      final meta = res.user!.userMetadata ?? {};
      final displayName = profile?['display_name'] ?? meta['display_name'] ?? email.split('@').first;
      final username = profile?['username'] ?? meta['username'] ?? email.split('@').first;
      final status = profile?['status'] ?? 'available';
      final avatarConfig = profile?['avatar_config'] != null
          ? AvatarConfig.fromJson(profile!['avatar_config'])
          : const AvatarConfig();
      final isPaid = profile?['is_paid'] as bool? ?? true;
      final tier = profile?['tier'] as String? ?? (isPaid ? 'paid' : 'free');
      final hasAi = profile?['has_ai_companion'] as bool? ?? isPaid;

      sessionNotifier.value = UserSession(
        id: res.user!.id,
        displayName: displayName,
        username: username,
        email: email,
        status: status,
        avatarConfig: avatarConfig,
        isGuest: false,
        tier: tier,
        isPaid: isPaid,
        hasAiCompanion: hasAi,
      );
    }
  }

  static Future<void> updateProfile({
    required String displayName,
    required String status,
    required AvatarConfig avatarConfig,
  }) async {
    final current = sessionNotifier.value;
    if (current == null) return;

    sessionNotifier.value = current.copyWith(
      displayName: displayName,
      status: status,
      avatarConfig: avatarConfig,
    );

    if (!current.isGuest && isInitialized && client != null) {
      try {
        await client!.from('profiles').upsert({
          'id': current.id,
          'display_name': displayName,
          'status': status,
          'avatar_config': avatarConfig.toJson(),
          'updated_at': DateTime.now().toUtc().toIso8601String(),
        });
      } catch (e) {
        debugPrint("Error syncing profile to Supabase: $e");
      }
    }
  }

  static Future<void> signOut() async {
    // Clear out any temporary maps for guest users upon quitting
    SpaceService.clearGuestMaps();

    if (isInitialized && client != null) {
      try {
        await client!.auth.signOut();
      } catch (_) {}
    }
    sessionNotifier.value = null;
  }

  /// Upgrades a free registered user to paid tier (unlocking multiple spaces and AI companion)
  static Future<void> upgradeToPaid() async {
    final current = sessionNotifier.value;
    if (current == null) return;
    sessionNotifier.value = current.copyWith(
      tier: 'paid',
      isPaid: true,
      hasAiCompanion: true,
    );
    if (!current.isGuest && isInitialized && client != null) {
      try {
        await client!.from('profiles').upsert({
          'id': current.id,
          'tier': 'paid',
          'is_paid': true,
          'has_ai_companion': true,
          'updated_at': DateTime.now().toUtc().toIso8601String(),
        });
      } catch (e) {
        debugPrint("Error upgrading profile to paid in Supabase: $e");
      }
    }
  }

  static Future<Map<String, dynamic>?> getProfile(String userId) async {
    if (!isInitialized || client == null) return null;
    try {
      final response = await client!
          .from('profiles')
          .select()
          .eq('id', userId)
          .maybeSingle();
      return response;
    } catch (_) {
      return null;
    }
  }
}
