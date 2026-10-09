import 'package:flutter/material.dart';
import '../../../core/constants/app_colors.dart';
import '../../../core/services/subscription_service.dart';
import '../../../core/widgets/neo_components.dart';
import '../../auth/auth_service.dart';

class UpgradeModal extends StatefulWidget {
  const UpgradeModal({super.key});

  static Future<void> show(BuildContext context) {
    return showDialog(
      context: context,
      barrierDismissible: true,
      barrierColor: Colors.black.withOpacity(0.7),
      builder: (_) => const UpgradeModal(),
    );
  }

  @override
  State<UpgradeModal> createState() => _UpgradeModalState();
}

class _UpgradeModalState extends State<UpgradeModal> {
  bool _isLoading = false;
  String? _errorMessage;

  Future<void> _handleCheckout() async {
    final session = AuthService.currentSession;
    if (session == null || session.isGuest) {
      setState(() {
        _errorMessage = 'Please create an account or sign in before subscribing.';
      });
      return;
    }

    setState(() {
      _isLoading = true;
      _errorMessage = null;
    });

    final success = await SubscriptionService.startCheckout();

    if (mounted) {
      setState(() {
        _isLoading = false;
        if (!success) {
          _errorMessage =
              'Could not open Stripe Checkout. Please make sure the Stripe Edge Function is deployed with your Stripe Secret Key.';
        }
      });
    }
  }

  Future<void> _handlePortal() async {
    setState(() {
      _isLoading = true;
      _errorMessage = null;
    });

    final success = await SubscriptionService.openCustomerPortal();

    if (mounted) {
      setState(() {
        _isLoading = false;
        if (!success) {
          _errorMessage = 'Could not open Stripe Customer Portal.';
        }
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    return ValueListenableBuilder<UserSubscriptionModel>(
      valueListenable: SubscriptionService.subscription,
      builder: (context, sub, _) {
        final isSubscribed = sub.isActive && sub.hasAiUnlimited;

        return Dialog(
          backgroundColor: Colors.transparent,
          elevation: 0,
          insetPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 24),
          child: Container(
            constraints: const BoxConstraints(maxWidth: 480),
            decoration: BoxDecoration(
              color: const Color(0xFF1E293B),
              borderRadius: BorderRadius.circular(20),
              border: Border.all(color: Colors.white, width: 2.5),
              boxShadow: const [
                BoxShadow(
                  color: Colors.black87,
                  offset: Offset(4, 5),
                  blurRadius: 0,
                ),
              ],
            ),
            child: SingleChildScrollView(
              padding: const EdgeInsets.all(24),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  // Header
                  Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      Container(
                        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                        decoration: BoxDecoration(
                          color: AppColors.accent,
                          borderRadius: BorderRadius.circular(8),
                          border: Border.all(color: Colors.black, width: 1.5),
                        ),
                        child: const Row(
                          children: [
                            Text('⚡ ', style: TextStyle(fontSize: 12)),
                            Text(
                              'AI COMPANION ADD-ON',
                              style: TextStyle(
                                color: Colors.black,
                                fontWeight: FontWeight.w900,
                                fontSize: 11,
                                letterSpacing: 0.5,
                              ),
                            ),
                          ],
                        ),
                      ),
                      IconButton(
                        onPressed: () => Navigator.of(context).pop(),
                        icon: const Icon(Icons.close, color: Colors.white70),
                        splashRadius: 20,
                      ),
                    ],
                  ),
                  const SizedBox(height: 14),

                  // Title
                  Text(
                    isSubscribed
                        ? 'Unlimited AI Active'
                        : 'Level Up Your Companion',
                    style: const TextStyle(
                      color: Colors.white,
                      fontSize: 22,
                      fontWeight: FontWeight.w900,
                      letterSpacing: -0.5,
                    ),
                  ),
                  const SizedBox(height: 6),
                  Text(
                    isSubscribed
                        ? 'You have unlimited access to your AI companion. Auto-deducts monthly via Stripe.'
                        : 'Never run out of energy. Chat without limits and unlock persistent memory across all rooms.',
                    style: TextStyle(
                      color: Colors.grey[300],
                      fontSize: 13,
                      height: 1.4,
                    ),
                  ),
                  const SizedBox(height: 18),

                  // Pricing Banner
                  Container(
                    padding: const EdgeInsets.all(16),
                    decoration: BoxDecoration(
                      color: const Color(0xFF0F172A),
                      borderRadius: BorderRadius.circular(14),
                      border: Border.all(color: Colors.white24, width: 1.5),
                    ),
                    child: Row(
                      mainAxisAlignment: MainAxisAlignment.spaceBetween,
                      children: [
                        Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            const Text(
                              'UNLIMITED CHAT PLAN',
                              style: TextStyle(
                                color: Color(0xFF6EE7B7),
                                fontSize: 11,
                                fontWeight: FontWeight.w800,
                                letterSpacing: 0.5,
                              ),
                            ),
                            const SizedBox(height: 4),
                            RichText(
                              text: const TextSpan(
                                children: [
                                  TextSpan(
                                    text: '\$15',
                                    style: TextStyle(
                                      color: Colors.white,
                                      fontSize: 28,
                                      fontWeight: FontWeight.w900,
                                    ),
                                  ),
                                  TextSpan(
                                    text: ' / month',
                                    style: TextStyle(
                                      color: Colors.white70,
                                      fontSize: 13,
                                      fontWeight: FontWeight.w600,
                                    ),
                                  ),
                                ],
                              ),
                            ),
                          ],
                        ),
                        Container(
                          padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
                          decoration: BoxDecoration(
                            color: const Color(0xFF10B981).withOpacity(0.2),
                            borderRadius: BorderRadius.circular(20),
                            border: Border.all(color: const Color(0xFF10B981), width: 1.2),
                          ),
                          child: Text(
                            isSubscribed ? 'CURRENT PLAN' : 'AUTO-DEBIT',
                            style: const TextStyle(
                              color: Color(0xFF6EE7B7),
                              fontSize: 10,
                              fontWeight: FontWeight.w900,
                            ),
                          ),
                        ),
                      ],
                    ),
                  ),
                  const SizedBox(height: 16),

                  // Feature Checklist
                  _buildFeatureRow('♾️', 'Unlimited daily companion messages', 'No 50 messages/day quota limit'),
                  _buildFeatureRow('🧠', 'Persistent cross-room memory', 'Remembers your habits and style anywhere'),
                  _buildFeatureRow('⚡', 'High-speed priority response', 'Fastest responses powered by Gemini Flash'),
                  _buildFeatureRow('🔒', 'Secure recurring auto-debit', 'Powered by Stripe, cancel anytime in 1 click'),

                  if (_errorMessage != null) ...[
                    const SizedBox(height: 14),
                    Container(
                      padding: const EdgeInsets.all(10),
                      decoration: BoxDecoration(
                        color: Colors.redAccent.withOpacity(0.15),
                        borderRadius: BorderRadius.circular(8),
                        border: Border.all(color: Colors.redAccent, width: 1.2),
                      ),
                      child: Text(
                        _errorMessage!,
                        style: const TextStyle(color: Colors.redAccent, fontSize: 12),
                      ),
                    ),
                  ],

                  const SizedBox(height: 20),

                  // CTA Button
                  if (isSubscribed) ...[
                    NeoButton(
                      text: 'Manage Subscription (Stripe)',
                      icon: Icons.credit_card,
                      backgroundColor: Colors.white,
                      textColor: Colors.black,
                      isLoading: _isLoading,
                      onPressed: _handlePortal,
                    ),
                  ] else ...[
                    NeoButton(
                      text: 'Subscribe for \$15 / month',
                      icon: Icons.bolt,
                      backgroundColor: AppColors.neonLime,
                      textColor: Colors.black,
                      isLoading: _isLoading,
                      onPressed: _handleCheckout,
                    ),
                  ],

                  const SizedBox(height: 10),
                  Text(
                    'Renews automatically each month. You can manage or cancel your subscription at any time.',
                    textAlign: TextAlign.center,
                    style: TextStyle(
                      color: Colors.grey[400],
                      fontSize: 10.5,
                    ),
                  ),
                ],
              ),
            ),
          ),
        );
      },
    );
  }

  Widget _buildFeatureRow(String icon, String title, String subtitle) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 6),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(icon, style: const TextStyle(fontSize: 16)),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  title,
                  style: const TextStyle(
                    color: Colors.white,
                    fontWeight: FontWeight.w700,
                    fontSize: 13,
                  ),
                ),
                Text(
                  subtitle,
                  style: TextStyle(
                    color: Colors.grey[400],
                    fontSize: 11,
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}
