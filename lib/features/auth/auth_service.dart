import 'package:flutter/material.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import '../../core/models/avatar_model.dart';

class UserSession {
  final String id;
  final String displayName;
  final String username;
  final String email;
  final String status;
  final AvatarConfig avatarConfig;
  final bool isGuest;

  UserSession({
    required this.id,
    required this.displayName,
    required this.username,
    required this.email,
    this.status = 'available',
    this.avatarConfig = const AvatarConfig(),
    this.isGuest = false,
  });

  UserSession copyWith({
    String? displayName,
    String? username,
    String? status,
    AvatarConfig? avatarConfig,
  }) {
    return UserSession(
      id: id,
      displayName: displayName ?? this.displayName,
      username: username ?? this.username,
      email: email,
      status: status ?? this.status,
      avatarConfig: avatarConfig ?? this.avatarConfig,
      isGuest: isGuest,
    );
  }
}

class AuthService {
  static bool isInitialized = false;
  static SupabaseClient? get client => isInitialized ? Supabase.instance.client : null;

  static final ValueNotifier<UserSession?> sessionNotifier = ValueNotifier<UserSession?>(null);
  static UserSession? get currentSession => sessionNotifier.value;

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

        sessionNotifier.value = UserSession(
          id: session.user.id,
          displayName: displayName,
          username: username,
          email: session.user.email ?? '',
          status: status,
          avatarConfig: avatarConfig,
          isGuest: false,
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

      sessionNotifier.value = UserSession(
        id: res.user!.id,
        displayName: displayName,
        username: username,
        email: email,
        status: status,
        avatarConfig: avatarConfig,
        isGuest: false,
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
    if (isInitialized && client != null) {
      try {
        await client!.auth.signOut();
      } catch (_) {}
    }
    sessionNotifier.value = null;
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
