import 'package:flutter/foundation.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import 'package:url_launcher/url_launcher.dart';
import '../../features/auth/auth_service.dart';

class UserSubscriptionModel {
  final String planId;
  final String status;
  final bool hasAiUnlimited;
  final DateTime? currentPeriodEnd;
  final bool cancelAtPeriodEnd;
  final String? stripeCustomerId;

  const UserSubscriptionModel({
    required this.planId,
    required this.status,
    required this.hasAiUnlimited,
    this.currentPeriodEnd,
    this.cancelAtPeriodEnd = false,
    this.stripeCustomerId,
  });

  factory UserSubscriptionModel.free() {
    return const UserSubscriptionModel(
      planId: 'free',
      status: 'free',
      hasAiUnlimited: false,
    );
  }

  factory UserSubscriptionModel.fromJson(Map<String, dynamic> json) {
    final status = json['status'] as String? ?? 'free';
    final hasAi = json['has_ai_unlimited'] as bool? ?? false;
    final periodEndStr = json['current_period_end'] as String?;
    final periodEnd = periodEndStr != null ? DateTime.tryParse(periodEndStr)?.toLocal() : null;

    final isActive = status == 'active' || status == 'trialing';

    return UserSubscriptionModel(
      planId: json['plan_id'] as String? ?? 'free',
      status: status,
      hasAiUnlimited: hasAi && isActive,
      currentPeriodEnd: periodEnd,
      cancelAtPeriodEnd: json['cancel_at_period_end'] as bool? ?? false,
      stripeCustomerId: json['stripe_customer_id'] as String?,
    );
  }

  bool get isActive => status == 'active' || status == 'trialing';
  bool get isFree => !isActive || !hasAiUnlimited;
}

class SubscriptionService {
  static final ValueNotifier<UserSubscriptionModel> subscription =
      ValueNotifier<UserSubscriptionModel>(UserSubscriptionModel.free());

  static RealtimeChannel? _channel;
  static bool _initialized = false;

  static bool get isUnlimited =>
      subscription.value.isActive && subscription.value.hasAiUnlimited;

  /// Initializes subscription state and starts live webhook listener
  static Future<void> initialize() async {
    if (_initialized) return;
    _initialized = true;

    AuthService.sessionNotifier.addListener(_onSessionChanged);
    await refreshSubscription();
  }

  static void _onSessionChanged() {
    refreshSubscription();
  }

  /// Refreshes current user's subscription record from Supabase
  static Future<void> refreshSubscription() async {
    final client = AuthService.client;
    final userId = AuthService.currentSession?.id;

    if (client == null || userId == null || AuthService.currentSession?.isGuest == true) {
      subscription.value = UserSubscriptionModel.free();
      return;
    }

    try {
      final res = await client
          .from('user_subscriptions')
          .select()
          .eq('user_id', userId)
          .maybeSingle();

      if (res != null) {
        subscription.value = UserSubscriptionModel.fromJson(res);
      } else {
        subscription.value = UserSubscriptionModel.free();
      }

      _setupRealtime(client, userId);
    } catch (e) {
      debugPrint('[SubscriptionService] Error fetching subscription: $e');
    }
  }

  /// Sets up realtime postgres changes listener for immediate unlock upon webhook arrival
  static void _setupRealtime(SupabaseClient client, String userId) {
    if (_channel != null) return;

    try {
      final channel = client.channel('public:user_subscriptions:$userId');
      channel
          .on(
            RealtimeListenTypes.postgresChanges,
            ChannelFilter(
              event: '*',
              schema: 'public',
              table: 'user_subscriptions',
              filter: 'user_id=eq.$userId',
            ),
            (payload, [ref]) {
              debugPrint('[SubscriptionService] Realtime subscription update: $payload');
              final newRecord = payload['new'] as Map<String, dynamic>?;
              if (newRecord != null && newRecord.isNotEmpty) {
                subscription.value = UserSubscriptionModel.fromJson(newRecord);
              }
            },
          )
          .subscribe();
      _channel = channel;
    } catch (e) {
      debugPrint('[SubscriptionService] Error establishing realtime subscription listener: $e');
    }
  }

  /// Calls Supabase Edge Function to generate Stripe Checkout URL and opens it
  static Future<bool> startCheckout({String planId = 'ai_unlimited_monthly'}) async {
    final client = AuthService.client;
    final session = AuthService.currentSession;

    if (client == null || session == null || session.isGuest) {
      debugPrint('[SubscriptionService] Checkout requires signed-in non-guest user');
      return false;
    }

    try {
      final res = await client.functions.invoke(
        'create-checkout-session',
        body: {
          'planId': planId,
        },
      );

      final data = res.data;
      if (data != null && data is Map<String, dynamic> && data['url'] != null) {
        final checkoutUrl = Uri.parse(data['url'] as String);
        return await launchUrl(checkoutUrl, mode: LaunchMode.externalApplication);
      } else {
        debugPrint('[SubscriptionService] Checkout invocation failed: ${res.data}');
        return false;
      }
    } catch (e) {
      debugPrint('[SubscriptionService] Exception invoking create-checkout-session: $e');
      return false;
    }
  }

  /// Opens Stripe Customer Portal for billing management and cancellation
  static Future<bool> openCustomerPortal() async {
    final client = AuthService.client;
    if (client == null) return false;

    try {
      final res = await client.functions.invoke('create-portal-session');
      final data = res.data;
      if (data != null && data is Map<String, dynamic> && data['url'] != null) {
        final portalUrl = Uri.parse(data['url'] as String);
        return await launchUrl(portalUrl, mode: LaunchMode.externalApplication);
      }
      return false;
    } catch (e) {
      debugPrint('[SubscriptionService] Exception opening portal: $e');
      return false;
    }
  }

  static void dispose() {
    AuthService.sessionNotifier.removeListener(_onSessionChanged);
    _channel?.unsubscribe();
    _channel = null;
    _initialized = false;
  }
}
