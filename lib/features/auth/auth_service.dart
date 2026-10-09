import 'package:flutter/material.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import '../../core/models/avatar_model.dart';
import '../../core/services/space_service.dart';
import '../../core/utils/guest_lifecycle/guest_lifecycle.dart';

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

  String get userId => id;

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
  static bool _isCurrentSessionGuest = false;
  static SupabaseClient? get client => isInitialized ? Supabase.instance.client : null;

  static final ValueNotifier<UserSession?> sessionNotifier = ValueNotifier<UserSession?>(null);
  static UserSession? get currentSession => sessionNotifier.value;
  static bool get isPaid => currentSession != null && currentSession!.isPaid;

  static void initSessionListener() {
    if (!isInitialized || client == null) return;

    registerGuestBrowserExitListener(() {
      if (sessionNotifier.value?.isGuest == true) {
        cleanupGuestSessionSync();
      }
    });

    client!.auth.onAuthStateChange.listen((data) async {
      final session = data.session;
      if (session != null) {
        final meta = session.user.userMetadata ?? {};
        final appMeta = session.user.appMetadata;
        final isGuest = appMeta['is_guest'] == true ||
            meta['is_guest'] == true ||
            (session.user.email?.endsWith('@guest.teemchat.local') ?? false);

        if (isGuest && !_isCurrentSessionGuest) {
          // Stale guest session restored from persistent storage on fresh browser open.
          // Discard and delete it as requested so guest sessions are strictly ephemeral per browser exit.
          try {
            await client!.rpc('delete_guest_account');
          } catch (_) {}
          try {
            await client!.auth.signOut();
          } catch (_) {}
          sessionNotifier.value = null;
          return;
        }

        final profile = await getProfile(session.user.id);
        final displayName = profile?['display_name'] ?? meta['display_name'] ?? session.user.email?.split('@').first ?? (isGuest ? 'Guest' : 'Explorer');
        final username = profile?['username'] ?? meta['username'] ?? 'user_${session.user.id.substring(0, 5)}';
        final status = profile?['status'] ?? 'available';
        final avatarConfig = profile?['avatar_config'] != null
            ? AvatarConfig.fromJson(profile!['avatar_config'])
            : const AvatarConfig();

        final isPaid = profile?['is_paid'] as bool? ?? (!isGuest);
        final tier = profile?['tier'] as String? ?? (isPaid ? 'paid' : 'free');
        final hasAi = profile?['has_ai_companion'] as bool? ?? isPaid;

        sessionNotifier.value = UserSession(
          id: session.user.id,
          displayName: displayName,
          username: username,
          email: session.user.email ?? '',
          status: status,
          avatarConfig: avatarConfig,
          isGuest: isGuest,
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
    debugPrint('>>> [AuthService] Guest sign-in requested: displayName=${name ?? "auto"}');

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
    final avatar = AvatarConfig(shirtColor: color);

    _isCurrentSessionGuest = true;

    if (isInitialized && client != null) {
      try {
        final guestPw = 'Guest_${DateTime.now().millisecondsSinceEpoch}_$randomId!';
        final res = await client!.rpc('provision_guest_account', params: {
          'p_display_name': guestName,
          'p_password': guestPw,
          'p_avatar_config': avatar.toJson(),
        });

        if (res != null && res is Map) {
          final email = res['email'] as String;
          final authRes = await client!.auth.signInWithPassword(email: email, password: guestPw);
          if (authRes.user != null) {
            sessionNotifier.value = UserSession(
              id: authRes.user!.id,
              displayName: guestName,
              username: res['username'] as String? ?? 'guest_$randomId',
              email: email,
              status: 'available',
              avatarConfig: avatar,
              isGuest: true,
              tier: 'free',
              isPaid: false,
              hasAiCompanion: false,
            );
            debugPrint('>>> [AuthService] Guest user created & provisioned via Supabase: id=${authRes.user!.id}, displayName=$guestName, username=${res['username'] as String? ?? 'guest_$randomId'}, email=$email, isGuest=true');
            return;
          }
        }
      } catch (e) {
        debugPrint('>>> [AuthService] Provision guest session error: $e. Falling back to local guest.');
      }
    }

    sessionNotifier.value = UserSession(
      id: 'guest_${DateTime.now().millisecondsSinceEpoch}_$randomId',
      displayName: guestName,
      username: 'guest_$randomId',
      email: 'guest_$randomId@virtualworld.local',
      status: 'available',
      avatarConfig: avatar,
      isGuest: true,
      tier: 'free',
      isPaid: false,
      hasAiCompanion: false,
    );
    debugPrint('>>> [AuthService] Guest user created locally: id=${sessionNotifier.value!.id}, displayName=$guestName, username=guest_$randomId, email=guest_$randomId@virtualworld.local, isGuest=true');
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

    // Decouple any previous guest or stale session cleanly
    if (client!.auth.currentSession != null) {
      try {
        await client!.auth.signOut();
      } catch (_) {}
    }
    _isCurrentSessionGuest = false;
    SpaceService.clearGuestMaps();

    final res = await client!.auth.signUp(
      email: email,
      password: password,
      data: {
        'username': username,
        'display_name': displayName,
      },
    );

    if (res.user != null) {
      // If email confirmation is required and no session was issued yet, try logging in
      // or instruct the user accordingly.
      if (res.session == null) {
        try {
          final loginRes = await client!.auth.signInWithPassword(
            email: email,
            password: password,
          );
          if (loginRes.session == null) {
            throw Exception("Account created! Please check your email to confirm your account before logging in.");
          }
        } catch (e) {
          if (e.toString().contains("Email not confirmed")) {
            throw Exception("Account created! Please verify your email before logging in.");
          }
          rethrow;
        }
      }

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
        // Table may not exist yet or trigger might have already inserted it
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

    // Decouple any previous guest session cleanly before authenticating
    if (client!.auth.currentSession != null) {
      try {
        await client!.auth.signOut();
      } catch (_) {}
    }
    _isCurrentSessionGuest = false;
    SpaceService.clearGuestMaps();

    final res = await client!.auth.signInWithPassword(
      email: email,
      password: password,
    );

    if (res.user != null) {
      _isCurrentSessionGuest = false;
      var profile = await getProfile(res.user!.id);
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

      // If profile record was missing in database, self-heal and insert it
      if (profile == null) {
        try {
          await client!.from('profiles').upsert({
            'id': res.user!.id,
            'username': username,
            'display_name': displayName,
            'status': status,
            'tier': tier,
            'is_paid': isPaid,
            'has_ai_companion': hasAi,
            'avatar_config': avatarConfig.toJson(),
          });
        } catch (_) {}
      }

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

    if (sessionNotifier.value?.isGuest == true && isInitialized && client != null) {
      try {
        await client!.rpc('delete_guest_account');
      } catch (_) {}
    }

    _isCurrentSessionGuest = false;

    if (isInitialized && client != null) {
      try {
        await client!.auth.signOut();
      } catch (_) {}
    }
    sessionNotifier.value = null;
  }

  /// Emergency cleanup executed when browser window unloads / closes
  static void cleanupGuestSessionSync() {
    if (client == null) return;
    try {
      client!.rpc('delete_guest_account');
      client!.auth.signOut();
    } catch (_) {}
    _isCurrentSessionGuest = false;
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
