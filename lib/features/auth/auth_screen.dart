import 'dart:async';
import 'dart:math' as math;
import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';
import '../../core/constants/app_colors.dart';
import '../../core/widgets/neo_components.dart';
import '../../main.dart';
import 'auth_service.dart';

class TypewriterAnimatedText extends StatefulWidget {
  final List<String> phrases;
  final TextStyle textStyle;
  final TextStyle cursorStyle;
  final Duration typingSpeed;
  final Duration pauseDuration;
  final Duration deleteSpeed;

  const TypewriterAnimatedText({
    super.key,
    required this.phrases,
    required this.textStyle,
    required this.cursorStyle,
    this.typingSpeed = const Duration(milliseconds: 85),
    this.pauseDuration = const Duration(milliseconds: 2000),
    this.deleteSpeed = const Duration(milliseconds: 40),
  });

  @override
  State<TypewriterAnimatedText> createState() => _TypewriterAnimatedTextState();
}

class _TypewriterAnimatedTextState extends State<TypewriterAnimatedText> {
  int _phraseIndex = 0;
  int _charIndex = 0;
  bool _isDeleting = false;
  bool _showCursor = true;
  Timer? _typeTimer;
  Timer? _cursorTimer;

  @override
  void initState() {
    super.initState();
    _cursorTimer = Timer.periodic(const Duration(milliseconds: 500), (_) {
      if (mounted) {
        setState(() => _showCursor = !_showCursor);
      }
    });
    _tick();
  }

  void _tick() {
    if (!mounted) return;
    final currentPhrase = widget.phrases[_phraseIndex];
    if (!_isDeleting) {
      if (_charIndex < currentPhrase.length) {
        _charIndex++;
        setState(() {});
        _typeTimer = Timer(widget.typingSpeed, _tick);
      } else {
        _typeTimer = Timer(widget.pauseDuration, () {
          if (!mounted) return;
          _isDeleting = true;
          _tick();
        });
      }
    } else {
      if (_charIndex > 0) {
        _charIndex--;
        setState(() {});
        _typeTimer = Timer(widget.deleteSpeed, _tick);
      } else {
        _isDeleting = false;
        _phraseIndex = (_phraseIndex + 1) % widget.phrases.length;
        _typeTimer = Timer(const Duration(milliseconds: 300), _tick);
      }
    }
  }

  @override
  void dispose() {
    _typeTimer?.cancel();
    _cursorTimer?.cancel();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final currentPhrase = widget.phrases[_phraseIndex];
    final displayedText = currentPhrase.substring(0, _charIndex);

    return RichText(
      textAlign: TextAlign.center,
      text: TextSpan(
        children: [
          TextSpan(text: displayedText, style: widget.textStyle),
          TextSpan(
            text: _showCursor ? '|' : ' ',
            style: widget.cursorStyle,
          ),
        ],
      ),
    );
  }
}

class AuthScreen extends StatefulWidget {
  const AuthScreen({super.key});

  @override
  State<AuthScreen> createState() => _AuthScreenState();
}

class _AuthScreenState extends State<AuthScreen> {
  // ── Space Customizer State ─────────────────────────────────────
  final TextEditingController _spaceNameController =
      TextEditingController(text: 'The Crew HQ');
  String _selectedCategory = 'Gaming';
  int _selectedColorIndex = 0;
  bool _showSimulatedChat = false;

  final List<String> _categories = const ['Gaming', 'Work', 'School', 'Friends', 'Other'];

  final List<({String name, Color base, Color stripe})> _colorPalettes = const [
    (
      name: 'Lime',
      base: Color(0xFFE2F952),
      stripe: Color(0xFFCDE630),
    ),
    (
      name: 'Coral',
      base: Color(0xFFE76F51),
      stripe: Color(0xFFC75D42),
    ),
    (
      name: 'Teal',
      base: Color(0xFF2A9D8F),
      stripe: Color(0xFF218075),
    ),
    (
      name: 'TeemPurple',
      base: Color(0xFF7C3AED),
      stripe: Color(0xFF6228C4),
    ),
    (
      name: 'Amber',
      base: Color(0xFFF59E0B),
      stripe: Color(0xFFD97706),
    ),
    (
      name: 'Emerald',
      base: Color(0xFF10B981),
      stripe: Color(0xFF059669),
    ),
  ];

  // ── Account Auth Dialog State ─────────────────────────────────
  final _emailController = TextEditingController();
  final _passwordController = TextEditingController();
  final _usernameController = TextEditingController();
  final _nameController = TextEditingController();
  bool _isSignUpModal = false;
  bool _isLoading = false;
  String? _errorMessage;

  // ── Navigation & Section Scroll Keys ───────────────────────────
  final ScrollController _scrollController = ScrollController();
  final GlobalKey _tryItKey = GlobalKey();
  final GlobalKey _howItWorksKey = GlobalKey();
  final GlobalKey _featuresKey = GlobalKey();
  final GlobalKey _pricingKey = GlobalKey();
  bool _isPricingAnnual = true;

  void _scrollToSection(GlobalKey key) {
    final ctx = key.currentContext;
    if (ctx != null) {
      Scrollable.ensureVisible(
        ctx,
        duration: const Duration(milliseconds: 650),
        curve: Curves.easeInOutCubic,
      );
    }
  }

  @override
  void initState() {
    super.initState();
    _spaceNameController.addListener(() {
      setState(() {});
    });
  }

  @override
  void dispose() {
    _scrollController.dispose();
    _spaceNameController.dispose();
    _emailController.dispose();
    _passwordController.dispose();
    _usernameController.dispose();
    _nameController.dispose();
    super.dispose();
  }

  String _getInitials(String text) {
    final trimmed = text.trim();
    if (trimmed.isEmpty) return 'TC';
    final parts = trimmed.split(RegExp(r'\s+'));
    if (parts.length >= 2) {
      final first = parts[0].isNotEmpty ? parts[0][0] : '';
      final second = parts[1].isNotEmpty ? parts[1][0] : '';
      return (first + second).toUpperCase();
    }
    return trimmed.substring(0, math.min(2, trimmed.length)).toUpperCase();
  }

  void _handleOpenSpace() {
    setState(() {
      _showSimulatedChat = true;
    });
  }

  void _handleEnterGuest() {
    AuthService.signInGuest();
  }

  Future<void> _handleAccountSubmit() async {
    final email = _emailController.text.trim();
    final password = _passwordController.text.trim();

    if (email.isEmpty || password.isEmpty) {
      setState(() => _errorMessage = "Please enter both email and password.");
      return;
    }

    setState(() {
      _isLoading = true;
      _errorMessage = null;
    });

    try {
      if (_isSignUpModal) {
        final username = _usernameController.text.trim();
        final name = _nameController.text.trim();
        if (username.isEmpty || name.isEmpty) {
          throw Exception("Please provide both a Display Name and Username.");
        }
        await AuthService.signUp(
          email: email,
          password: password,
          username: username,
          displayName: name,
        );
      } else {
        await AuthService.signIn(
          email: email,
          password: password,
        );
      }
      if (mounted) Navigator.of(context, rootNavigator: true).pop();
    } catch (e) {
      setState(() => _errorMessage = e.toString().replaceAll('Exception: ', ''));
    } finally {
      if (mounted) setState(() => _isLoading = false);
    }
  }

  void _showAuthModal({bool isSignUp = false}) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    setState(() {
      _isSignUpModal = isSignUp;
      _errorMessage = null;
    });

    showDialog(
      context: context,
      barrierDismissible: true,
      builder: (ctx) {
        return StatefulBuilder(
          builder: (dialogContext, setDialogState) {
            return Dialog(
              backgroundColor: Colors.transparent,
              elevation: 0,
              insetPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 24),
              child: ConstrainedBox(
                constraints: const BoxConstraints(maxWidth: 440),
                child: NeoCard(
                  backgroundColor: isDark ? AppColors.darkCard : AppColors.creamCard,
                  borderColor: isDark ? Colors.white : AppColors.inkBlack,
                  padding: const EdgeInsets.all(28),
                  borderRadius: 24,
                  borderWidth: 2.5,
                  shadowOffset: const Offset(5, 5),
                  child: Column(
                    mainAxisSize: MainAxisSize.min,
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: [
                      // Header with TeemChat logo & Close
                      Row(
                        mainAxisAlignment: MainAxisAlignment.spaceBetween,
                        children: [
                          Row(
                            children: [
                              Container(
                                width: 40,
                                height: 40,
                                decoration: BoxDecoration(
                                  shape: BoxShape.circle,
                                  color: isDark ? AppColors.darkBg : const Color(0xFFF6F4EE),
                                  border: Border.all(color: isDark ? Colors.white : AppColors.inkBlack, width: 2),
                                  boxShadow: [
                                    BoxShadow(
                                      color: isDark ? Colors.white : AppColors.inkBlack,
                                      offset: const Offset(1.5, 2),
                                      blurRadius: 0,
                                    ),
                                  ],
                                ),
                                child: ClipOval(
                                  child: Transform.scale(
                                    scale: 1.65,
                                    child: Image.asset(
                                      isDark ? 'assets/images/teamchat_logo_dark.jpg' : 'assets/images/teamchat_logo.jpg',
                                      fit: BoxFit.cover,
                                      alignment: Alignment.center,
                                    ),
                                  ),
                                ),
                              ),
                              const SizedBox(width: 10),
                              RichText(
                                text: TextSpan(
                                  style: GoogleFonts.plusJakartaSans(
                                    fontSize: 22,
                                    fontWeight: FontWeight.w900,
                                    color: isDark ? Colors.white : AppColors.inkBlack,
                                    letterSpacing: -0.5,
                                  ),
                                  children: [
                                    const TextSpan(text: 'teemchat'),
                                    TextSpan(
                                      text: '.',
                                      style: TextStyle(color: isDark ? AppColors.darkHeroMagenta : AppColors.amberButton),
                                    ),
                                  ],
                                ),
                              ),
                            ],
                          ),
                          IconButton(
                            icon: Icon(Icons.close, color: isDark ? Colors.white : AppColors.inkBlack),
                            onPressed: () => Navigator.pop(ctx),
                          ),
                        ],
                      ),
                      const SizedBox(height: 16),

                      // Segmented switcher
                      Container(
                        padding: const EdgeInsets.all(4),
                        decoration: BoxDecoration(
                          color: isDark ? AppColors.darkBg : const Color(0xFFF3F1EC),
                          borderRadius: BorderRadius.circular(999),
                          border: Border.all(color: isDark ? Colors.white : AppColors.inkBlack, width: 2),
                        ),
                        child: Row(
                          children: [
                            Expanded(
                              child: GestureDetector(
                                onTap: () => setDialogState(() {
                                  _isSignUpModal = false;
                                  _errorMessage = null;
                                }),
                                child: Container(
                                  padding: const EdgeInsets.symmetric(vertical: 8),
                                  decoration: BoxDecoration(
                                    color: !_isSignUpModal
                                        ? (isDark ? AppColors.neonLime : AppColors.inkBlack)
                                        : Colors.transparent,
                                    borderRadius: BorderRadius.circular(999),
                                  ),
                                  child: Text(
                                    "Sign In",
                                    textAlign: TextAlign.center,
                                    style: TextStyle(
                                      color: !_isSignUpModal
                                          ? (isDark ? AppColors.inkBlack : Colors.white)
                                          : (isDark ? Colors.white : AppColors.inkBlack),
                                      fontWeight: FontWeight.w800,
                                      fontSize: 13,
                                    ),
                                  ),
                                ),
                              ),
                            ),
                            Expanded(
                              child: GestureDetector(
                                onTap: () => setDialogState(() {
                                  _isSignUpModal = true;
                                  _errorMessage = null;
                                }),
                                child: Container(
                                  padding: const EdgeInsets.symmetric(vertical: 8),
                                  decoration: BoxDecoration(
                                    color: _isSignUpModal
                                        ? (isDark ? AppColors.neonLime : AppColors.inkBlack)
                                        : Colors.transparent,
                                    borderRadius: BorderRadius.circular(999),
                                  ),
                                  child: Text(
                                    "Create Account",
                                    textAlign: TextAlign.center,
                                    style: TextStyle(
                                      color: _isSignUpModal
                                          ? (isDark ? AppColors.inkBlack : Colors.white)
                                          : (isDark ? Colors.white : AppColors.inkBlack),
                                      fontWeight: FontWeight.w800,
                                      fontSize: 13,
                                    ),
                                  ),
                                ),
                              ),
                            ),
                          ],
                        ),
                      ),
                      const SizedBox(height: 18),

                      // Error message if any
                      if (_errorMessage != null) ...[
                        Container(
                          padding: const EdgeInsets.all(10),
                          decoration: BoxDecoration(
                            color: const Color(0xFFFEE2E2),
                            borderRadius: BorderRadius.circular(10),
                            border: Border.all(color: const Color(0xFFEF4444), width: 1.5),
                          ),
                          child: Row(
                            children: [
                              const Icon(Icons.error_outline, color: Color(0xFFDC2626), size: 18),
                              const SizedBox(width: 8),
                              Expanded(
                                child: Text(
                                  _errorMessage!,
                                  style: const TextStyle(color: Color(0xFFDC2626), fontSize: 12),
                                ),
                              ),
                            ],
                          ),
                        ),
                        const SizedBox(height: 14),
                      ],

                      // Form Fields
                      if (_isSignUpModal) ...[
                        _buildModalInput(
                          controller: _nameController,
                          label: "DISPLAY NAME",
                          hint: "Alex Rivera",
                          isDark: isDark,
                        ),
                        const SizedBox(height: 12),
                        _buildModalInput(
                          controller: _usernameController,
                          label: "USERNAME",
                          hint: "alex_rivera",
                          isDark: isDark,
                        ),
                        const SizedBox(height: 12),
                      ],
                      _buildModalInput(
                        controller: _emailController,
                        label: "EMAIL ADDRESS",
                        hint: "you@example.com",
                        keyboardType: TextInputType.emailAddress,
                        isDark: isDark,
                      ),
                      const SizedBox(height: 12),
                      _buildModalInput(
                        controller: _passwordController,
                        label: "PASSWORD",
                        hint: "••••••••",
                        obscureText: true,
                        isDark: isDark,
                      ),
                      const SizedBox(height: 20),

                      // Submit button
                      NeoButton(
                        onPressed: _isLoading ? null : () async {
                          await _handleAccountSubmit();
                          setDialogState(() {});
                        },
                        isFullWidth: true,
                        backgroundColor: isDark
                            ? AppColors.neonLime
                            : (_isSignUpModal ? AppColors.teemPurple : AppColors.amberButton),
                        textColor: isDark
                            ? AppColors.inkBlack
                            : (_isSignUpModal ? Colors.white : AppColors.inkBlack),
                        child: _isLoading
                            ? const SizedBox(
                                height: 20,
                                width: 20,
                                child: CircularProgressIndicator(strokeWidth: 2, color: Colors.black),
                              )
                            : Text(
                                _isSignUpModal ? "Create Persona & Enter" : "Sign In & Enter",
                                style: const TextStyle(
                                  fontWeight: FontWeight.w800,
                                  fontSize: 15,
                                  color: Colors.black,
                                ),
                              ),
                      ),
                      const SizedBox(height: 12),

                      // Quick guest switch
                      Center(
                        child: TextButton(
                          onPressed: () {
                            Navigator.pop(ctx);
                            _handleEnterGuest();
                          },
                          child: Text(
                            "Skip for now & enter as Guest →",
                            style: TextStyle(
                              color: isDark ? AppColors.darkInkMuted : AppColors.inkMuted,
                              fontWeight: FontWeight.w700,
                              fontSize: 12.5,
                            ),
                          ),
                        ),
                      ),
                    ],
                  ),
                ),
              ),
            );
          },
        );
      },
    );
  }

  Widget _buildModalInput({
    required TextEditingController controller,
    required String label,
    required String hint,
    bool obscureText = false,
    TextInputType keyboardType = TextInputType.text,
    bool isDark = false,
  }) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          label,
          style: TextStyle(
            fontSize: 10.5,
            fontWeight: FontWeight.w800,
            letterSpacing: 0.8,
            color: isDark ? AppColors.darkInkMuted : AppColors.inkMuted,
          ),
        ),
        const SizedBox(height: 5),
        TextField(
          controller: controller,
          obscureText: obscureText,
          keyboardType: keyboardType,
          style: TextStyle(
            fontSize: 14,
            fontWeight: FontWeight.w600,
            color: isDark ? Colors.white : AppColors.inkBlack,
          ),
          decoration: InputDecoration(
            hintText: hint,
            hintStyle: TextStyle(
              color: isDark ? Colors.white38 : const Color(0xFFA1A1AA),
              fontSize: 13,
            ),
            filled: true,
            fillColor: isDark ? AppColors.darkBg : Colors.white,
            contentPadding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
            border: OutlineInputBorder(
              borderRadius: BorderRadius.circular(12),
              borderSide: BorderSide(color: isDark ? Colors.white : AppColors.inkBlack, width: 2),
            ),
            enabledBorder: OutlineInputBorder(
              borderRadius: BorderRadius.circular(12),
              borderSide: BorderSide(color: isDark ? Colors.white : AppColors.inkBlack, width: 2),
            ),
            focusedBorder: OutlineInputBorder(
              borderRadius: BorderRadius.circular(12),
              borderSide: BorderSide(
                color: isDark ? AppColors.neonLime : AppColors.teemPurple,
                width: 2.2,
              ),
            ),
          ),
        ),
      ],
    );
  }


  Widget _buildPricingTierCard({
    required String title,
    required String badge,
    required Color badgeColor,
    required String price,
    required String period,
    required String description,
    required List<String> features,
    required String ctaText,
    required Color ctaColor,
    required Color ctaTextColor,
    required bool isDark,
    required bool isPopular,
    required VoidCallback onCta,
  }) {
    return Container(
      padding: const EdgeInsets.all(18),
      decoration: BoxDecoration(
        color: isPopular
            ? (isDark ? const Color(0xFF28183C) : const Color(0xFFFFFBEB))
            : (isDark ? AppColors.darkBg : Colors.white),
        borderRadius: BorderRadius.circular(18),
        border: Border.all(
          color: isPopular
              ? (isDark ? AppColors.neonLime : AppColors.amberButton)
              : (isDark ? Colors.white38 : AppColors.inkBlack),
          width: isPopular ? 2.5 : 1.8,
        ),
        boxShadow: [
          BoxShadow(
            color: isPopular
                ? (isDark ? AppColors.neonLime.withOpacity(0.5) : AppColors.inkBlack)
                : (isDark ? Colors.white12 : AppColors.inkBlack.withOpacity(0.8)),
            offset: isPopular ? const Offset(3.5, 4.5) : const Offset(2.5, 3),
            blurRadius: 0,
          ),
        ],
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          // Badge
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                decoration: BoxDecoration(
                  color: badgeColor,
                  borderRadius: BorderRadius.circular(999),
                  border: Border.all(color: AppColors.inkBlack, width: 1.2),
                ),
                child: Text(
                  badge,
                  style: GoogleFonts.plusJakartaSans(
                    fontSize: 9.5,
                    fontWeight: FontWeight.w900,
                    color: AppColors.inkBlack,
                    letterSpacing: 0.4,
                  ),
                ),
              ),
              if (isPopular)
                Icon(
                  Icons.star,
                  size: 18,
                  color: isDark ? AppColors.neonLime : AppColors.amberButton,
                ),
            ],
          ),
          const SizedBox(height: 10),

          // Title
          Text(
            title,
            style: GoogleFonts.plusJakartaSans(
              fontSize: 18,
              fontWeight: FontWeight.w900,
              color: isDark ? Colors.white : AppColors.inkBlack,
            ),
          ),
          const SizedBox(height: 4),

          // Description
          Text(
            description,
            style: GoogleFonts.plusJakartaSans(
              fontSize: 11.5,
              fontWeight: FontWeight.w500,
              color: isDark ? AppColors.darkInkMuted : const Color(0xFF6B7280),
              height: 1.3,
            ),
          ),
          const SizedBox(height: 12),

          // Price display
          Row(
            crossAxisAlignment: CrossAxisAlignment.end,
            children: [
              Text(
                price,
                style: GoogleFonts.plusJakartaSans(
                  fontSize: 28,
                  fontWeight: FontWeight.w900,
                  color: isDark ? Colors.white : AppColors.inkBlack,
                  letterSpacing: -0.8,
                ),
              ),
              const SizedBox(width: 4),
              Flexible(
                child: Padding(
                  padding: const EdgeInsets.only(bottom: 3),
                  child: Text(
                    period,
                    style: GoogleFonts.plusJakartaSans(
                      fontSize: 11.5,
                      fontWeight: FontWeight.w600,
                      color: isDark ? AppColors.darkInkMuted : const Color(0xFF6B7280),
                    ),
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                  ),
                ),
              ),
            ],
          ),
          const SizedBox(height: 14),

          // Divider
          Container(
            height: 1.5,
            color: isDark ? Colors.white12 : const Color(0xFFE5E7EB),
          ),
          const SizedBox(height: 12),

          // Features List
          ...features.map(
            (feat) => Padding(
              padding: const EdgeInsets.only(bottom: 7),
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Container(
                    margin: const EdgeInsets.only(top: 2, right: 8),
                    padding: const EdgeInsets.all(1.5),
                    decoration: BoxDecoration(
                      shape: BoxShape.circle,
                      color: isDark ? AppColors.neonLime : const Color(0xFF10B981),
                    ),
                    child: const Icon(
                      Icons.check,
                      size: 11,
                      color: AppColors.inkBlack,
                    ),
                  ),
                  Expanded(
                    child: Text(
                      feat,
                      style: GoogleFonts.plusJakartaSans(
                        fontSize: 11.5,
                        fontWeight: FontWeight.w600,
                        color: isDark ? Colors.white70 : const Color(0xFF374151),
                        height: 1.35,
                      ),
                    ),
                  ),
                ],
              ),
            ),
          ),
          const SizedBox(height: 20),
          const SizedBox(height: 12),

          // CTA Button
          NeoButton(
            text: ctaText,
            backgroundColor: ctaColor,
            textColor: ctaTextColor,
            borderColor: isDark ? Colors.white : AppColors.inkBlack,
            fontSize: 13,
            fontWeight: FontWeight.w900,
            padding: const EdgeInsets.symmetric(vertical: 11),
            borderRadius: 999,
            shadowOffset: const Offset(2, 2.5),
            isFullWidth: true,
            onPressed: onCta,
          ),
        ],
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final screenWidth = MediaQuery.of(context).size.width;
    final isDesktop = screenWidth >= 980;
    final selectedPalette = _colorPalettes[_selectedColorIndex];
    final initials = _getInitials(_spaceNameController.text);

    return Scaffold(
      backgroundColor: isDark ? AppColors.darkBg : AppColors.creamBg,
      body: SafeArea(
        child: Column(
          children: [
            // ── TOP NAVIGATION BAR ───────────────────────────────────
            _buildNavbar(screenWidth, isDark),

            // ── MAIN HERO BODY (Full Scrollable Landing Page) ────────
            Expanded(
              child: SingleChildScrollView(
                controller: _scrollController,
                padding: EdgeInsets.symmetric(
                  horizontal: isDesktop ? 32.0 : 16.0,
                  vertical: isDesktop ? 36.0 : 20.0,
                ),
                child: Center(
                  child: ConstrainedBox(
                    constraints: const BoxConstraints(maxWidth: 880),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.center,
                      children: [
                        // Section 1: Hero Header & Interactive Stage
                        KeyedSubtree(
                          key: _tryItKey,
                          child: Column(
                            children: [
                              _buildCenteredHeroHeader(isDark: isDark),
                              const SizedBox(height: 36),
                              ConstrainedBox(
                                constraints: const BoxConstraints(maxWidth: 720),
                                child: _buildInteractiveCard(selectedPalette, initials, isDark: isDark),
                              ),
                            ],
                          ),
                        ),
                        const SizedBox(height: 72),

                        // Section 2: How It Works ("From zero to hangout in a minute.")
                        KeyedSubtree(
                          key: _howItWorksKey,
                          child: _buildHowItWorksSection(isDark),
                        ),
                        const SizedBox(height: 72),

                        // Section 3: Features ("Everything your crew needs.")
                        KeyedSubtree(
                          key: _featuresKey,
                          child: _buildFeaturesSection(isDark),
                        ),
                        const SizedBox(height: 72),

                        // Section 4: Plans & Pricing ("Simple, transparent pricing.")
                        KeyedSubtree(
                          key: _pricingKey,
                          child: _buildPricingSection(isDark),
                        ),
                        const SizedBox(height: 72),

                        // Section 5: Ready to hang out? CTA Card
                        _buildReadyToHangOutCtaCard(isDark),
                        const SizedBox(height: 64),

                        // Section 6: Full Footer
                        _buildFooter(isDark),
                        const SizedBox(height: 24),
                      ],
                    ),
                  ),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }

  // ── Navigation Bar Component ─────────────────────────────────────
  Widget _buildNavbar(double screenWidth, bool isDark) {
    final showLinks = screenWidth >= 880;

    return Container(
      padding: EdgeInsets.symmetric(
        horizontal: screenWidth >= 980 ? 28 : 16,
        vertical: 12,
      ),
      decoration: BoxDecoration(
        color: isDark ? AppColors.darkBg : AppColors.creamBg,
        border: Border(
          bottom: BorderSide(
            color: isDark ? const Color(0xFF2E1B4E) : const Color(0xFFE8E5DD),
            width: 1.5,
          ),
        ),
      ),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          // Logo Section (Mascot Badge + Wordmark)
          GestureDetector(
            onTap: () {},
            child: Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                Container(
                  width: 40,
                  height: 40,
                  decoration: BoxDecoration(
                    shape: BoxShape.circle,
                    color: isDark ? AppColors.darkCard : const Color(0xFFF6F4EE),
                    border: Border.all(color: isDark ? Colors.white : AppColors.inkBlack, width: 2.0),
                    boxShadow: [
                      BoxShadow(
                        color: isDark ? Colors.white : AppColors.inkBlack,
                        offset: const Offset(1.5, 2),
                        blurRadius: 0,
                      ),
                    ],
                  ),
                  child: ClipOval(
                    child: Transform.scale(
                      scale: 1.65,
                      child: Image.asset(
                        isDark ? 'assets/images/teamchat_logo_dark.jpg' : 'assets/images/teamchat_logo.jpg',
                        fit: BoxFit.cover,
                        alignment: Alignment.center,
                      ),
                    ),
                  ),
                ),
                const SizedBox(width: 10),
                RichText(
                  text: TextSpan(
                    style: GoogleFonts.plusJakartaSans(
                      fontSize: 22,
                      fontWeight: FontWeight.w900,
                      color: isDark ? Colors.white : AppColors.inkBlack,
                      letterSpacing: -0.6,
                    ),
                    children: [
                      const TextSpan(text: 'teemchat'),
                      TextSpan(
                        text: '.',
                        style: TextStyle(
                          fontSize: 26,
                          fontWeight: FontWeight.w900,
                          color: isDark ? AppColors.darkHeroMagenta : AppColors.amberButton,
                        ),
                      ),
                    ],
                  ),
                ),
              ],
            ),
          ),

          // Center Navigation Links
          if (showLinks)
            Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                _buildNavLink("Try it", isBold: true, isDark: isDark, onTap: () => _scrollToSection(_tryItKey)),
                _buildNavLink("How it works", isDark: isDark, onTap: () => _scrollToSection(_howItWorksKey)),
                _buildNavLink("Features", isDark: isDark, onTap: () => _scrollToSection(_featuresKey)),
                _buildNavLink("Pricing", isDark: isDark, onTap: () => _scrollToSection(_pricingKey)),
              ],
            ),

          // Right Action Buttons
          Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              // Dark Mode / Theme Toggle Button
              MouseRegion(
                cursor: SystemMouseCursors.click,
                child: GestureDetector(
                  onTap: () {
                    VirtualWorldApp.isDarkModeNotifier.value = !isDark;
                  },
                  child: Container(
                    width: 40,
                    height: 40,
                    decoration: BoxDecoration(
                      color: isDark ? AppColors.darkBg : Colors.white,
                      shape: BoxShape.circle,
                      border: Border.all(color: isDark ? Colors.white : AppColors.inkBlack, width: 2),
                      boxShadow: [
                        BoxShadow(
                          color: isDark ? Colors.white : AppColors.inkBlack,
                          offset: const Offset(1.5, 2),
                          blurRadius: 0,
                        ),
                      ],
                    ),
                    child: Icon(
                      isDark ? Icons.wb_sunny_outlined : Icons.nightlight_round,
                      size: 19,
                      color: isDark ? Colors.white : AppColors.inkBlack,
                    ),
                  ),
                ),
              ),
              const SizedBox(width: 10),

              // Log in Pill Button
              NeoButton(
                text: "Log in",
                backgroundColor: isDark ? AppColors.darkPillBg : Colors.white,
                textColor: isDark ? Colors.white : AppColors.inkBlack,
                borderColor: isDark ? Colors.white : AppColors.inkBlack,
                padding: const EdgeInsets.symmetric(horizontal: 18, vertical: 9),
                fontSize: 13.5,
                borderRadius: 999,
                shadowOffset: const Offset(2, 2.5),
                onPressed: () => _showAuthModal(isSignUp: false),
              ),
              const SizedBox(width: 8),

              // Get started Pill Button
              NeoButton(
                text: "Get started",
                backgroundColor: isDark ? AppColors.neonLime : AppColors.amberButton,
                textColor: AppColors.inkBlack,
                borderColor: AppColors.inkBlack,
                padding: const EdgeInsets.symmetric(horizontal: 18, vertical: 9),
                fontSize: 13.5,
                borderRadius: 999,
                shadowOffset: const Offset(2, 2.5),
                onPressed: () => _showAuthModal(isSignUp: true),
              ),
            ],
          ),
        ],
      ),
    );
  }

  Widget _buildNavLink(
    String title, {
    bool isBold = false,
    bool isDark = false,
    required VoidCallback onTap,
  }) {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 14),
      child: MouseRegion(
        cursor: SystemMouseCursors.click,
        child: GestureDetector(
          onTap: onTap,
          child: Text(
            title,
            style: GoogleFonts.plusJakartaSans(
              fontSize: 13.5,
              fontWeight: isBold ? FontWeight.w800 : FontWeight.w600,
              color: isDark
                  ? (isBold ? Colors.white : const Color(0xFFD1D5DB))
                  : AppColors.inkBlack,
              letterSpacing: -0.2,
            ),
          ),
        ),
      ),
    );
  }

  // ── Centered Hero Header Section ─────────────────────────────────
  Widget _buildCenteredHeroHeader({required bool isDark}) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.center,
      children: [
        // Grand Mascot Hero Emblem with Twinkling Sparkles
        Padding(
          padding: const EdgeInsets.only(bottom: 22),
          child: MascotSparkleBadge(size: 88, isDark: isDark),
        ),

        // Brand Pill
        Container(
          padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 6),
          decoration: BoxDecoration(
            color: isDark ? AppColors.darkCard : Colors.white,
            borderRadius: BorderRadius.circular(999),
            border: Border.all(color: isDark ? Colors.white : AppColors.inkBlack, width: 1.8),
            boxShadow: [
              BoxShadow(
                color: isDark ? Colors.white : AppColors.inkBlack,
                offset: const Offset(1.5, 2),
                blurRadius: 0,
              ),
            ],
          ),
          child: Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              Container(
                width: 8,
                height: 8,
                decoration: BoxDecoration(
                  shape: BoxShape.circle,
                  color: isDark ? AppColors.neonLime : const Color(0xFF10B981),
                ),
              ),
              const SizedBox(width: 8),
              Text(
                "2D RETRO VIRTUAL WORLD • LIVE PROXIMITY VOICE • ZERO SIGNUP",
                style: GoogleFonts.plusJakartaSans(
                  fontSize: 11,
                  fontWeight: FontWeight.w800,
                  letterSpacing: 0.5,
                  color: isDark ? Colors.white : AppColors.inkBlack,
                ),
              ),
            ],
          ),
        ),
        const SizedBox(height: 20),

        // Chunky Centered Headline with Typed Animation
        LayoutBuilder(
          builder: (context, constraints) {
            final isSmall = constraints.maxWidth < 600;
            return Column(
              crossAxisAlignment: CrossAxisAlignment.center,
              children: [
                Text(
                  "Hang out together in",
                  textAlign: TextAlign.center,
                  style: GoogleFonts.plusJakartaSans(
                    fontSize: isSmall ? 36 : 50,
                    fontWeight: FontWeight.w900,
                    color: isDark ? Colors.white : AppColors.inkBlack,
                    height: 1.08,
                    letterSpacing: -1.6,
                  ),
                ),
                const SizedBox(height: 2),
                TypewriterAnimatedText(
                  phrases: const [
                    "cozy 2D spaces.",
                    "campfire circles.",
                    "pixel retreat cabins.",
                    "virtual world avenues.",
                  ],
                  textStyle: GoogleFonts.plusJakartaSans(
                    fontSize: isSmall ? 36 : 50,
                    fontWeight: FontWeight.w900,
                    color: isDark ? AppColors.darkHeroMagenta : AppColors.coralAccent,
                    height: 1.08,
                    letterSpacing: -1.6,
                  ),
                  cursorStyle: GoogleFonts.plusJakartaSans(
                    fontSize: isSmall ? 36 : 50,
                    fontWeight: FontWeight.w300,
                    color: isDark ? AppColors.neonLime : AppColors.amberButton,
                  ),
                ),
              ],
            );
          },
        ),
        const SizedBox(height: 16),

        // Subtext Paragraph
        ConstrainedBox(
          constraints: const BoxConstraints(maxWidth: 580),
          child: Text(
            "Pixel avatars, spatial proximity audio, and live chat for your crew, gaming guild, or class. One cozy place to connect with zero friction.",
            textAlign: TextAlign.center,
            style: GoogleFonts.plusJakartaSans(
              fontSize: 16.5,
              fontWeight: FontWeight.w500,
              color: isDark ? AppColors.darkInkMuted : const Color(0xFF4B5563),
              height: 1.5,
            ),
          ),
        ),
        const SizedBox(height: 26),

        // CTA Buttons Row
        Wrap(
          spacing: 12,
          runSpacing: 12,
          alignment: WrapAlignment.center,
          children: [
            NeoButton(
              text: "Start a Space Free",
              backgroundColor: isDark ? AppColors.neonLime : AppColors.amberButton,
              textColor: AppColors.inkBlack,
              borderColor: AppColors.inkBlack,
              padding: const EdgeInsets.symmetric(horizontal: 26, vertical: 14),
              fontSize: 15,
              fontWeight: FontWeight.w900,
              borderRadius: 999,
              shadowOffset: const Offset(3, 3.5),
              onPressed: () => _handleOpenSpace(),
            ),
            NeoButton(
              text: "Enter as Guest",
              backgroundColor: isDark ? AppColors.darkPillBg : Colors.white,
              textColor: isDark ? Colors.white : AppColors.inkBlack,
              borderColor: isDark ? Colors.white : AppColors.inkBlack,
              padding: const EdgeInsets.symmetric(horizontal: 22, vertical: 14),
              fontSize: 15,
              fontWeight: FontWeight.w800,
              borderRadius: 999,
              shadowOffset: const Offset(3, 3.5),
              onPressed: _handleEnterGuest,
            ),
            NeoButton(
              text: "💎 Pricing",
              backgroundColor: isDark ? AppColors.darkCard : const Color(0xFFEFF6FF),
              textColor: isDark ? Colors.white : AppColors.teemPurpleDark,
              borderColor: isDark ? Colors.white : AppColors.inkBlack,
              padding: const EdgeInsets.symmetric(horizontal: 18, vertical: 14),
              fontSize: 14,
              fontWeight: FontWeight.w800,
              borderRadius: 999,
              shadowOffset: const Offset(2.5, 3),
              onPressed: () => _scrollToSection(_pricingKey),
            ),
          ],
        ),
      ],
    );
  }

  // ── 1. HOW IT WORKS SECTION (From zero to hangout in a minute) ───
  Widget _buildHowItWorksSection(bool isDark) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.center,
      children: [
        // Kicker
        Container(
          padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
          decoration: BoxDecoration(
            color: isDark ? AppColors.darkCard : AppColors.amberSoft,
            borderRadius: BorderRadius.circular(999),
            border: Border.all(color: isDark ? AppColors.neonLime : AppColors.inkBlack, width: 1.5),
          ),
          child: Text(
            "THREE STEPS",
            style: GoogleFonts.plusJakartaSans(
              fontSize: 10.5,
              fontWeight: FontWeight.w900,
              letterSpacing: 1.0,
              color: isDark ? AppColors.neonLime : AppColors.inkBlack,
            ),
          ),
        ),
        const SizedBox(height: 10),
        Text(
          "From zero to hangout in a minute.",
          textAlign: TextAlign.center,
          style: GoogleFonts.plusJakartaSans(
            fontSize: 32,
            fontWeight: FontWeight.w900,
            color: isDark ? Colors.white : AppColors.inkBlack,
            letterSpacing: -0.8,
          ),
        ),
        const SizedBox(height: 28),
        LayoutBuilder(
          builder: (context, constraints) {
            final isWide = constraints.maxWidth >= 720;
            final steps = [
              (
                num: "1",
                numColor: isDark ? AppColors.neonLime : AppColors.amberButton,
                title: "Make your space",
                desc: "Name it, pick an avatar look, and create cozy rooms for chat, huts for voice.",
              ),
              (
                num: "2",
                numColor: isDark ? AppColors.darkHeroMagenta : AppColors.coralAccent,
                title: "Send the invite link",
                desc: "Share a link or code. Friends join in a tap, zero setup on their side.",
              ),
              (
                num: "3",
                numColor: const Color(0xFF38BDF8),
                title: "Hang out",
                desc: "Walk up to friends to talk via spatial audio, type in chat, or gather by the campfire.",
              ),
            ];

            final cards = steps.map((s) {
              return NeoCard(
                backgroundColor: isDark ? AppColors.darkCard : Colors.white,
                borderColor: isDark ? Colors.white : AppColors.inkBlack,
                borderWidth: 2.2,
                borderRadius: 20,
                padding: const EdgeInsets.all(20),
                shadowOffset: const Offset(3.5, 4),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Container(
                      width: 38,
                      height: 38,
                      decoration: BoxDecoration(
                        color: s.numColor,
                        shape: BoxShape.circle,
                        border: Border.all(color: AppColors.inkBlack, width: 2),
                      ),
                      child: Center(
                        child: Text(
                          s.num,
                          style: GoogleFonts.plusJakartaSans(
                            fontSize: 18,
                            fontWeight: FontWeight.w900,
                            color: AppColors.inkBlack,
                          ),
                        ),
                      ),
                    ),
                    const SizedBox(height: 18),
                    Text(
                      s.title,
                      style: GoogleFonts.plusJakartaSans(
                        fontSize: 17,
                        fontWeight: FontWeight.w900,
                        color: isDark ? Colors.white : AppColors.inkBlack,
                        letterSpacing: -0.3,
                      ),
                    ),
                    const SizedBox(height: 8),
                    Text(
                      s.desc,
                      style: GoogleFonts.plusJakartaSans(
                        fontSize: 13,
                        fontWeight: FontWeight.w500,
                        color: isDark ? AppColors.darkInkMuted : const Color(0xFF4B5563),
                        height: 1.4,
                      ),
                    ),
                  ],
                ),
              );
            }).toList();

            if (isWide) {
              return IntrinsicHeight(
                child: Row(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    Expanded(child: cards[0]),
                    const SizedBox(width: 16),
                    Expanded(child: cards[1]),
                    const SizedBox(width: 16),
                    Expanded(child: cards[2]),
                  ],
                ),
              );
            } else {
              return Column(
                children: [
                  cards[0],
                  const SizedBox(height: 14),
                  cards[1],
                  const SizedBox(height: 14),
                  cards[2],
                ],
              );
            }
          },
        ),
      ],
    );
  }

  // ── 2. FEATURES SECTION (Everything your crew needs) ─────────────
  Widget _buildFeaturesSection(bool isDark) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.center,
      children: [
        // Kicker
        Container(
          padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
          decoration: BoxDecoration(
            color: isDark ? AppColors.darkCard : AppColors.teemPurpleSoft,
            borderRadius: BorderRadius.circular(999),
            border: Border.all(color: isDark ? AppColors.darkHeroMagenta : AppColors.teemPurple, width: 1.5),
          ),
          child: Text(
            "BUILT FOR CONNECTION",
            style: GoogleFonts.plusJakartaSans(
              fontSize: 10.5,
              fontWeight: FontWeight.w900,
              letterSpacing: 1.0,
              color: isDark ? AppColors.darkHeroMagenta : AppColors.teemPurple,
            ),
          ),
        ),
        const SizedBox(height: 10),
        Text(
          "Everything your crew needs.",
          textAlign: TextAlign.center,
          style: GoogleFonts.plusJakartaSans(
            fontSize: 32,
            fontWeight: FontWeight.w900,
            color: isDark ? Colors.white : AppColors.inkBlack,
            letterSpacing: -0.8,
          ),
        ),
        const SizedBox(height: 28),
        LayoutBuilder(
          builder: (context, constraints) {
            final isWide = constraints.maxWidth >= 740;
            final features = [
              (
                icon: Icons.near_me_outlined,
                title: "Rooms that keep up",
                desc: "Text rooms with pictures, edits, mentions and unread badges.",
              ),
              (
                icon: Icons.volume_up_outlined,
                title: "Voice huts",
                desc: "Hop in, talk, and keep typing in any room at the same time.",
              ),
              (
                icon: Icons.group_outlined,
                title: "Buddy chat",
                desc: "Add friends and chat from a small window you can move anywhere.",
              ),
              (
                icon: Icons.tune_rounded,
                title: "Yours to run",
                desc: "Invite links, admins and co-admins, and moderation built in.",
              ),
            ];

            final cards = features.map((f) {
              return NeoCard(
                backgroundColor: isDark ? AppColors.darkCard : Colors.white,
                borderColor: isDark ? Colors.white : AppColors.inkBlack,
                borderWidth: 2.2,
                borderRadius: 20,
                padding: const EdgeInsets.all(20),
                shadowOffset: const Offset(3.5, 4),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Container(
                      width: 44,
                      height: 44,
                      decoration: BoxDecoration(
                        color: isDark ? AppColors.darkBg : const Color(0xFFF3F4F6),
                        shape: BoxShape.circle,
                        border: Border.all(color: isDark ? Colors.white : AppColors.inkBlack, width: 2),
                      ),
                      child: Icon(f.icon, size: 22, color: isDark ? Colors.white : AppColors.inkBlack),
                    ),
                    const SizedBox(height: 18),
                    Text(
                      f.title,
                      style: GoogleFonts.plusJakartaSans(
                        fontSize: 16.5,
                        fontWeight: FontWeight.w900,
                        color: isDark ? Colors.white : AppColors.inkBlack,
                        letterSpacing: -0.3,
                      ),
                    ),
                    const SizedBox(height: 8),
                    Text(
                      f.desc,
                      style: GoogleFonts.plusJakartaSans(
                        fontSize: 12.5,
                        fontWeight: FontWeight.w500,
                        color: isDark ? AppColors.darkInkMuted : const Color(0xFF4B5563),
                        height: 1.4,
                      ),
                    ),
                  ],
                ),
              );
            }).toList();

            if (isWide) {
              return IntrinsicHeight(
                child: Row(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    Expanded(child: cards[0]),
                    const SizedBox(width: 14),
                    Expanded(child: cards[1]),
                    const SizedBox(width: 14),
                    Expanded(child: cards[2]),
                    const SizedBox(width: 14),
                    Expanded(child: cards[3]),
                  ],
                ),
              );
            } else {
              return GridView.count(
                shrinkWrap: true,
                physics: const NeverScrollableScrollPhysics(),
                crossAxisCount: constraints.maxWidth >= 480 ? 2 : 1,
                crossAxisSpacing: 14,
                mainAxisSpacing: 14,
                childAspectRatio: constraints.maxWidth >= 480 ? 1.15 : 1.8,
                children: cards,
              );
            }
          },
        ),
      ],
    );
  }

  // ── 3. PLANS & PRICING SECTION (Simple, transparent pricing) ──────
  Widget _buildPricingSection(bool isDark) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.center,
      children: [
        // Kicker
        Container(
          padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
          decoration: BoxDecoration(
            color: isDark ? AppColors.darkCard : const Color(0xFFEFF6FF),
            borderRadius: BorderRadius.circular(999),
            border: Border.all(color: isDark ? const Color(0xFF38BDF8) : AppColors.inkBlack, width: 1.5),
          ),
          child: Text(
            "PLANS & PRICING",
            style: GoogleFonts.plusJakartaSans(
              fontSize: 10.5,
              fontWeight: FontWeight.w900,
              letterSpacing: 1.0,
              color: isDark ? const Color(0xFF38BDF8) : AppColors.inkBlack,
            ),
          ),
        ),
        const SizedBox(height: 10),
        Text(
          "Simple, transparent pricing.",
          textAlign: TextAlign.center,
          style: GoogleFonts.plusJakartaSans(
            fontSize: 32,
            fontWeight: FontWeight.w900,
            color: isDark ? Colors.white : AppColors.inkBlack,
            letterSpacing: -0.8,
          ),
        ),
        const SizedBox(height: 6),
        Text(
          "Start free forever with your crew. Upgrade when you need bigger rooms and custom builds.",
          textAlign: TextAlign.center,
          style: GoogleFonts.plusJakartaSans(
            fontSize: 14,
            fontWeight: FontWeight.w500,
            color: isDark ? AppColors.darkInkMuted : const Color(0xFF4B5563),
          ),
        ),
        const SizedBox(height: 22),

        // Billing Toggle Pill
        Center(
          child: Container(
            padding: const EdgeInsets.all(4),
            decoration: BoxDecoration(
              color: isDark ? AppColors.darkCard : const Color(0xFFF3F4F6),
              borderRadius: BorderRadius.circular(999),
              border: Border.all(
                color: isDark ? Colors.white24 : AppColors.inkBlack,
                width: 1.8,
              ),
            ),
            child: Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                InkWell(
                  borderRadius: BorderRadius.circular(999),
                  onTap: () => setState(() => _isPricingAnnual = false),
                  child: Container(
                    padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 7),
                    decoration: BoxDecoration(
                      color: !_isPricingAnnual
                          ? (isDark ? AppColors.neonLime : AppColors.inkBlack)
                          : Colors.transparent,
                      borderRadius: BorderRadius.circular(999),
                    ),
                    child: Text(
                      "Monthly",
                      style: GoogleFonts.plusJakartaSans(
                        fontSize: 12.5,
                        fontWeight: FontWeight.w800,
                        color: !_isPricingAnnual
                            ? (isDark ? AppColors.inkBlack : Colors.white)
                            : (isDark ? Colors.white70 : AppColors.inkBlack),
                      ),
                    ),
                  ),
                ),
                InkWell(
                  borderRadius: BorderRadius.circular(999),
                  onTap: () => setState(() => _isPricingAnnual = true),
                  child: Container(
                    padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 7),
                    decoration: BoxDecoration(
                      color: _isPricingAnnual
                          ? (isDark ? AppColors.neonLime : AppColors.inkBlack)
                          : Colors.transparent,
                      borderRadius: BorderRadius.circular(999),
                    ),
                    child: Row(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        Text(
                          "Yearly",
                          style: GoogleFonts.plusJakartaSans(
                            fontSize: 12.5,
                            fontWeight: FontWeight.w800,
                            color: _isPricingAnnual
                                ? (isDark ? AppColors.inkBlack : Colors.white)
                                : (isDark ? Colors.white70 : AppColors.inkBlack),
                          ),
                        ),
                        const SizedBox(width: 6),
                        Container(
                          padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                          decoration: BoxDecoration(
                            color: _isPricingAnnual
                                ? (isDark ? AppColors.inkBlack : AppColors.amberButton)
                                : (isDark ? AppColors.darkHeroMagenta : const Color(0xFF10B981)),
                            borderRadius: BorderRadius.circular(999),
                          ),
                          child: Text(
                            "SAVE 25%",
                            style: GoogleFonts.plusJakartaSans(
                              fontSize: 9.5,
                              fontWeight: FontWeight.w900,
                              color: _isPricingAnnual
                                  ? (isDark ? AppColors.neonLime : AppColors.inkBlack)
                                  : Colors.white,
                            ),
                          ),
                        ),
                      ],
                    ),
                  ),
                ),
              ],
            ),
          ),
        ),
        const SizedBox(height: 26),

        // Plans Layout
        LayoutBuilder(
          builder: (context, constraints) {
            final isWide = constraints.maxWidth >= 760;
            final cards = [
              _buildPricingTierCard(
                title: "Starter",
                badge: "FREE FOREVER",
                badgeColor: const Color(0xFF10B981),
                price: "\$0",
                period: "/ month",
                description: "Best for hangouts, study rooms & gaming squads.",
                features: const [
                  "Up to 15 concurrent avatars",
                  "Unlimited public & private spaces",
                  "2D Town Square & Campfire maps",
                  "Proximity spatial voice audio",
                  "Retro 8-bit avatars & styles",
                  "Instant 1-click guest invite links",
                ],
                ctaText: "Start Free Space",
                ctaColor: isDark ? AppColors.darkCardInner : Colors.white,
                ctaTextColor: isDark ? Colors.white : AppColors.inkBlack,
                isDark: isDark,
                isPopular: false,
                onCta: () => _handleOpenSpace(),
              ),
              _buildPricingTierCard(
                title: "Pro Builder",
                badge: "MOST POPULAR",
                badgeColor: isDark ? AppColors.neonLime : AppColors.amberButton,
                price: _isPricingAnnual ? "\$9" : "\$12",
                period: "/ space / mo",
                description: "For active communities, creators & remote teams.",
                features: const [
                  "Up to 75 concurrent avatars",
                  "Everything in Starter",
                  "Custom map designer & room builder",
                  "Interactive whiteboards & screen share",
                  "Custom domain link (teemchat.app/crew)",
                  "Password protection & room locks",
                  "High-bitrate low-latency audio",
                ],
                ctaText: "Choose Pro Plan",
                ctaColor: isDark ? AppColors.neonLime : AppColors.amberButton,
                ctaTextColor: AppColors.inkBlack,
                isDark: isDark,
                isPopular: true,
                onCta: () => _showAuthModal(isSignUp: true),
              ),
              _buildPricingTierCard(
                title: "Studio",
                badge: "ORGANIZATION",
                badgeColor: const Color(0xFF38BDF8),
                price: _isPricingAnnual ? "\$29" : "\$39",
                period: "/ space / mo",
                description: "For companies, events & large all-hands spaces.",
                features: const [
                  "Unlimited concurrent avatars",
                  "Everything in Pro",
                  "Custom branded avatars & assets",
                  "SAML SSO & Google Workspace login",
                  "Space analytics & admin moderation",
                  "99.9% uptime SLA & priority support",
                ],
                ctaText: "Upgrade to Studio",
                ctaColor: isDark ? AppColors.darkHeroMagenta : const Color(0xFF38BDF8),
                ctaTextColor: isDark ? Colors.white : AppColors.inkBlack,
                isDark: isDark,
                isPopular: false,
                onCta: () => _showAuthModal(isSignUp: true),
              ),
            ];

            if (isWide) {
              return IntrinsicHeight(
                child: Row(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    Expanded(child: cards[0]),
                    const SizedBox(width: 14),
                    Expanded(child: cards[1]),
                    const SizedBox(width: 14),
                    Expanded(child: cards[2]),
                  ],
                ),
              );
            } else {
              return Column(
                children: [
                  cards[0],
                  const SizedBox(height: 14),
                  cards[1],
                  const SizedBox(height: 14),
                  cards[2],
                ],
              );
            }
          },
        ),
        const SizedBox(height: 18),

        // Guarantee Note
        Container(
          padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
          decoration: BoxDecoration(
            color: isDark ? AppColors.darkCard : const Color(0xFFF3F4F6),
            borderRadius: BorderRadius.circular(12),
            border: Border.all(
              color: isDark ? Colors.white12 : const Color(0xFFE5E7EB),
            ),
          ),
          child: Row(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              Icon(
                Icons.verified_user_outlined,
                size: 16,
                color: isDark ? AppColors.neonLime : const Color(0xFF10B981),
              ),
              const SizedBox(width: 8),
              Flexible(
                child: Text(
                  "14-day money-back guarantee • Cancel or switch plans anytime • Zero lock-in",
                  textAlign: TextAlign.center,
                  style: GoogleFonts.plusJakartaSans(
                    fontSize: 11.5,
                    fontWeight: FontWeight.w600,
                    color: isDark ? AppColors.darkInkMuted : const Color(0xFF6B7280),
                  ),
                ),
              ),
            ],
          ),
        ),
      ],
    );
  }

  // ── 4. READY TO HANG OUT CTA CARD (Matching reference design) ────
  Widget _buildReadyToHangOutCtaCard(bool isDark) {
    return ConstrainedBox(
      constraints: const BoxConstraints(maxWidth: 720),
      child: NeoCard(
        backgroundColor: isDark ? AppColors.darkCard : Colors.white,
        borderColor: isDark ? Colors.white : AppColors.inkBlack,
        borderWidth: 2.5,
        borderRadius: 24,
        padding: const EdgeInsets.symmetric(horizontal: 32, vertical: 40),
        shadowOffset: const Offset(5, 6),
        child: Column(
          children: [
            // Mascot Emblem with Twinkling Stars
            MascotSparkleBadge(size: 78, isDark: isDark),
            const SizedBox(height: 18),
            Text(
              "Ready to hang out?",
              textAlign: TextAlign.center,
              style: GoogleFonts.plusJakartaSans(
                fontSize: 34,
                fontWeight: FontWeight.w900,
                color: isDark ? Colors.white : AppColors.inkBlack,
                letterSpacing: -0.8,
              ),
            ),
            const SizedBox(height: 8),
            ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 460),
              child: Text(
                "Make an account, start a space, and send the invite link to your crew.",
                textAlign: TextAlign.center,
                style: GoogleFonts.plusJakartaSans(
                  fontSize: 14,
                  fontWeight: FontWeight.w500,
                  color: isDark ? AppColors.darkInkMuted : const Color(0xFF4B5563),
                  height: 1.4,
                ),
              ),
            ),
            const SizedBox(height: 24),
            Wrap(
              spacing: 12,
              runSpacing: 10,
              alignment: WrapAlignment.center,
              children: [
                NeoButton(
                  text: "Create your space",
                  backgroundColor: isDark ? AppColors.neonLime : AppColors.amberButton,
                  textColor: AppColors.inkBlack,
                  borderColor: AppColors.inkBlack,
                  padding: const EdgeInsets.symmetric(horizontal: 26, vertical: 13),
                  fontSize: 14.5,
                  fontWeight: FontWeight.w900,
                  borderRadius: 999,
                  shadowOffset: const Offset(2.5, 3),
                  onPressed: () => _handleOpenSpace(),
                ),
                NeoButton(
                  text: "Log in",
                  backgroundColor: isDark ? AppColors.darkPillBg : Colors.white,
                  textColor: isDark ? Colors.white : AppColors.inkBlack,
                  borderColor: isDark ? Colors.white : AppColors.inkBlack,
                  padding: const EdgeInsets.symmetric(horizontal: 22, vertical: 13),
                  fontSize: 14.5,
                  fontWeight: FontWeight.w800,
                  borderRadius: 999,
                  shadowOffset: const Offset(2.5, 3),
                  onPressed: () => _showAuthModal(isSignUp: false),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }

  // ── 5. FULL FOOTER (Matching reference design) ───────────────────
  Widget _buildFooter(bool isDark) {
    return Column(
      children: [
        Container(
          height: 1.5,
          color: isDark ? const Color(0xFF2E1B4E) : const Color(0xFFE5E7EB),
        ),
        const SizedBox(height: 36),
        LayoutBuilder(
          builder: (context, constraints) {
            final isWide = constraints.maxWidth >= 640;
            return Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                // Brand Column
                Expanded(
                  flex: isWide ? 4 : 5,
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Row(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          Container(
                            width: 38,
                            height: 38,
                            decoration: BoxDecoration(
                              shape: BoxShape.circle,
                              color: isDark ? AppColors.darkCard : const Color(0xFFF6F4EE),
                              border: Border.all(color: isDark ? Colors.white : AppColors.inkBlack, width: 2),
                            ),
                            child: ClipOval(
                              child: Transform.scale(
                                scale: 1.6,
                                child: Image.asset(
                                  isDark ? 'assets/images/teamchat_logo_dark.jpg' : 'assets/images/teamchat_logo.jpg',
                                  fit: BoxFit.cover,
                                ),
                              ),
                            ),
                          ),
                          const SizedBox(width: 8),
                          RichText(
                            text: TextSpan(
                              style: GoogleFonts.plusJakartaSans(
                                fontSize: 22,
                                fontWeight: FontWeight.w900,
                                color: isDark ? Colors.white : AppColors.inkBlack,
                                letterSpacing: -0.6,
                              ),
                              children: [
                                const TextSpan(text: 'teemchat'),
                                TextSpan(
                                  text: '.',
                                  style: TextStyle(
                                    color: isDark ? AppColors.darkHeroMagenta : AppColors.amberButton,
                                  ),
                                ),
                              ],
                            ),
                          ),
                        ],
                      ),
                      const SizedBox(height: 10),
                      Text(
                        "Group chat, voice huts and buddy chat for your crew, team or class.",
                        style: GoogleFonts.plusJakartaSans(
                          fontSize: 12.5,
                          fontWeight: FontWeight.w500,
                          color: isDark ? AppColors.darkInkMuted : const Color(0xFF6B7280),
                          height: 1.4,
                        ),
                      ),
                    ],
                  ),
                ),
                const SizedBox(width: 24),

                // EXPLORE Column
                Expanded(
                  flex: 3,
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        "EXPLORE",
                        style: GoogleFonts.plusJakartaSans(
                          fontSize: 11,
                          fontWeight: FontWeight.w900,
                          letterSpacing: 1.0,
                          color: isDark ? AppColors.darkInkMuted : const Color(0xFF6B7280),
                        ),
                      ),
                      const SizedBox(height: 12),
                      _buildFooterLink("Try it", onTap: () => _scrollToSection(_tryItKey), isDark: isDark),
                      const SizedBox(height: 8),
                      _buildFooterLink("How it works", onTap: () => _scrollToSection(_howItWorksKey), isDark: isDark),
                      const SizedBox(height: 8),
                      _buildFooterLink("Features", onTap: () => _scrollToSection(_featuresKey), isDark: isDark),
                      const SizedBox(height: 8),
                      _buildFooterLink("Pricing", onTap: () => _scrollToSection(_pricingKey), isDark: isDark),
                    ],
                  ),
                ),

                // ACCOUNT Column
                Expanded(
                  flex: 3,
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        "ACCOUNT",
                        style: GoogleFonts.plusJakartaSans(
                          fontSize: 11,
                          fontWeight: FontWeight.w900,
                          letterSpacing: 1.0,
                          color: isDark ? AppColors.darkInkMuted : const Color(0xFF6B7280),
                        ),
                      ),
                      const SizedBox(height: 12),
                      _buildFooterLink("Log in", onTap: () => _showAuthModal(isSignUp: false), isDark: isDark),
                      const SizedBox(height: 8),
                      _buildFooterLink("Sign up", onTap: () => _showAuthModal(isSignUp: true), isDark: isDark),
                      const SizedBox(height: 8),
                      _buildFooterLink("Terms", onTap: () {}, isDark: isDark),
                      const SizedBox(height: 8),
                      _buildFooterLink("Privacy", onTap: () {}, isDark: isDark),
                    ],
                  ),
                ),
              ],
            );
          },
        ),
        const SizedBox(height: 36),
        Container(
          height: 1,
          color: isDark ? Colors.white12 : const Color(0xFFE5E7EB),
        ),
        const SizedBox(height: 18),
        Row(
          mainAxisAlignment: MainAxisAlignment.spaceBetween,
          children: [
            Text(
              "© 2026 teemchat",
              style: GoogleFonts.plusJakartaSans(
                fontSize: 12,
                fontWeight: FontWeight.w600,
                color: isDark ? AppColors.darkInkMuted : const Color(0xFF9CA3AF),
              ),
            ),
            Text(
              "Built for cozy hangouts",
              style: GoogleFonts.plusJakartaSans(
                fontSize: 12,
                fontWeight: FontWeight.w600,
                color: isDark ? AppColors.darkInkMuted : const Color(0xFF9CA3AF),
              ),
            ),
          ],
        ),
      ],
    );
  }

  Widget _buildFooterLink(String label, {required VoidCallback onTap, required bool isDark}) {
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(4),
      child: Text(
        label,
        style: GoogleFonts.plusJakartaSans(
          fontSize: 13,
          fontWeight: FontWeight.w700,
          color: isDark ? Colors.white70 : AppColors.inkBlack,
        ),
      ),
    );
  }

  // ── Maximized Interactive Card Component ──────────────────────────
  Widget _buildInteractiveCard(
    ({String name, Color base, Color stripe}) selectedPalette,
    String initials, {
    required bool isDark,
  }) {
    return NeoCard(
      backgroundColor: isDark ? AppColors.darkCard : AppColors.creamCard,
      borderColor: isDark ? Colors.white : AppColors.inkBlack,
      borderWidth: 2.5,
      padding: const EdgeInsets.all(26),
      borderRadius: 28,
      shadowOffset: const Offset(6, 6),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          // Header Row: Mode Switcher Chips + Mascot Sparkle Badge
          Row(
            crossAxisAlignment: CrossAxisAlignment.center,
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              // Switcher Chips
              Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  _buildModeChip(
                    label: "✨ Start a Space",
                    isSelected: !_showSimulatedChat,
                    isDark: isDark,
                    onTap: () => setState(() => _showSimulatedChat = false),
                  ),
                  const SizedBox(width: 8),
                  _buildModeChip(
                    label: "💬 Chat Preview",
                    isSelected: _showSimulatedChat,
                    isDark: isDark,
                    onTap: () => setState(() => _showSimulatedChat = true),
                  ),
                ],
              ),
              MascotSparkleBadge(size: 78, isDark: isDark),
            ],
          ),
          const SizedBox(height: 20),

          // Body: Either Simulated Chat OR Space Creation Form
          if (_showSimulatedChat)
            _buildSimulatedChatView(selectedPalette, initials, isDark)
          else
            _buildCreationFormView(selectedPalette, initials, isDark),
        ],
      ),
    );
  }

  Widget _buildModeChip({
    required String label,
    required bool isSelected,
    required bool isDark,
    required VoidCallback onTap,
  }) {
    return InkWell(
      borderRadius: BorderRadius.circular(999),
      onTap: onTap,
      child: AnimatedContainer(
        duration: const Duration(milliseconds: 180),
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
        decoration: BoxDecoration(
          color: isSelected
              ? (isDark ? AppColors.neonLime : AppColors.inkBlack)
              : (isDark ? AppColors.darkCardInner : Colors.white),
          borderRadius: BorderRadius.circular(999),
          border: Border.all(
            color: isSelected
                ? (isDark ? AppColors.neonLime : AppColors.inkBlack)
                : (isDark ? Colors.white30 : AppColors.inkBlack),
            width: 1.8,
          ),
          boxShadow: isSelected
              ? [
                  BoxShadow(
                    color: isDark ? AppColors.neonLime.withOpacity(0.3) : AppColors.inkBlack,
                    offset: const Offset(1.5, 2),
                    blurRadius: 0,
                  ),
                ]
              : null,
        ),
        child: Text(
          label,
          style: GoogleFonts.plusJakartaSans(
            fontSize: 12.5,
            fontWeight: FontWeight.w800,
            color: isSelected
                ? (isDark ? AppColors.inkBlack : Colors.white)
                : (isDark ? Colors.white70 : AppColors.inkBlack),
          ),
        ),
      ),
    );
  }

  // ── Simulated Chat View ("That's the idea.") ───────────────────────
  Widget _buildSimulatedChatView(
    ({String name, Color base, Color stripe}) selectedPalette,
    String initials,
    bool isDark,
  ) {
    final spaceName = _spaceNameController.text.trim().isNotEmpty
        ? _spaceNameController.text.trim()
        : 'The Crew HQ';

    return Container(
      decoration: BoxDecoration(
        color: isDark ? AppColors.darkBg : Colors.white,
        borderRadius: BorderRadius.circular(22),
        border: Border.all(
          color: isDark ? Colors.white : AppColors.inkBlack,
          width: 2.2,
        ),
        boxShadow: [
          BoxShadow(
            color: isDark ? Colors.white : AppColors.inkBlack,
            offset: const Offset(3.5, 4),
            blurRadius: 0,
          ),
        ],
      ),
      clipBehavior: Clip.antiAlias,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          // Top Diagonal Striped Banner
          SizedBox(
            height: 74,
            child: Stack(
              clipBehavior: Clip.none,
              children: [
                Positioned.fill(
                  child: CustomPaint(
                    painter: DiagonalStripesPainter(
                      baseColor: isDark ? AppColors.neonLime : selectedPalette.base,
                      stripeColor: isDark ? AppColors.neonLimeStripe : selectedPalette.stripe,
                      stripeWidth: 8,
                      spacing: 16,
                    ),
                  ),
                ),
                // Overlapping Avatar Circle with Space Initials
                Positioned(
                  bottom: -20,
                  left: 16,
                  child: Container(
                    width: 44,
                    height: 44,
                    decoration: BoxDecoration(
                      color: Colors.white,
                      shape: BoxShape.circle,
                      border: Border.all(color: AppColors.inkBlack, width: 2.2),
                      boxShadow: const [
                        BoxShadow(
                          color: AppColors.inkBlack,
                          offset: Offset(1.5, 2),
                          blurRadius: 0,
                        ),
                      ],
                    ),
                    child: Center(
                      child: Text(
                        initials,
                        style: GoogleFonts.plusJakartaSans(
                          fontSize: 15,
                          fontWeight: FontWeight.w900,
                          color: AppColors.inkBlack,
                        ),
                      ),
                    ),
                  ),
                ),
              ],
            ),
          ),

          // Chat Messages & Channel Area
          Padding(
            padding: const EdgeInsets.only(left: 16, right: 16, top: 28, bottom: 16),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                // Channel label: # general
                Row(
                  children: [
                    Icon(
                      Icons.chat_bubble_outline,
                      size: 14,
                      color: isDark ? Colors.white70 : AppColors.inkMuted,
                    ),
                    const SizedBox(width: 6),
                    Text(
                      "general",
                      style: GoogleFonts.plusJakartaSans(
                        fontSize: 13,
                        fontWeight: FontWeight.w800,
                        color: isDark ? Colors.white : AppColors.inkBlack,
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 14),

                // 1. Mascot Message
                Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Container(
                      width: 32,
                      height: 32,
                      decoration: BoxDecoration(
                        shape: BoxShape.circle,
                        color: isDark ? AppColors.darkCard : const Color(0xFFF6F4EE),
                        border: Border.all(color: isDark ? Colors.white : AppColors.inkBlack, width: 1.5),
                      ),
                      child: ClipOval(
                        child: Transform.scale(
                          scale: 1.65,
                          child: Image.asset(
                            isDark ? 'assets/images/teamchat_logo_dark.jpg' : 'assets/images/teamchat_logo.jpg',
                            fit: BoxFit.cover,
                          ),
                        ),
                      ),
                    ),
                    const SizedBox(width: 10),
                    Expanded(
                      child: Container(
                        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
                        decoration: BoxDecoration(
                          color: isDark ? AppColors.darkCard : const Color(0xFFF3F4F6),
                          borderRadius: BorderRadius.circular(16),
                          border: Border.all(
                            color: isDark ? Colors.white : AppColors.inkBlack,
                            width: 1.5,
                          ),
                        ),
                        child: Text(
                          "Hello there! I'm TeemChat Cat. Say hi to everyone in $spaceName.",
                          style: GoogleFonts.plusJakartaSans(
                            fontSize: 12.5,
                            fontWeight: FontWeight.w600,
                            color: isDark ? Colors.white : AppColors.inkBlack,
                            height: 1.35,
                          ),
                        ),
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 12),

                // 2. User Message (Right aligned, Neon Lime pill)
                Align(
                  alignment: Alignment.centerRight,
                  child: Container(
                    padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
                    decoration: BoxDecoration(
                      color: isDark ? AppColors.neonLime : AppColors.amberButton,
                      borderRadius: BorderRadius.circular(14),
                      border: Border.all(color: AppColors.inkBlack, width: 1.8),
                      boxShadow: const [
                        BoxShadow(
                          color: AppColors.inkBlack,
                          offset: Offset(1.5, 2),
                          blurRadius: 0,
                        ),
                      ],
                    ),
                    child: Text(
                      "Hey TeemChat Cat! Love this cozy world 🔥",
                      style: GoogleFonts.plusJakartaSans(
                        fontSize: 12.5,
                        fontWeight: FontWeight.w800,
                        color: AppColors.inkBlack,
                      ),
                    ),
                  ),
                ),
                const SizedBox(height: 12),

                // 3. Mascot Reply
                Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Container(
                      width: 32,
                      height: 32,
                      decoration: BoxDecoration(
                        shape: BoxShape.circle,
                        color: isDark ? AppColors.darkCard : const Color(0xFFF6F4EE),
                        border: Border.all(color: isDark ? Colors.white : AppColors.inkBlack, width: 1.5),
                      ),
                      child: ClipOval(
                        child: Transform.scale(
                          scale: 1.65,
                          child: Image.asset(
                            isDark ? 'assets/images/teamchat_logo_dark.jpg' : 'assets/images/teamchat_logo.jpg',
                            fit: BoxFit.cover,
                          ),
                        ),
                      ),
                    ),
                    const SizedBox(width: 10),
                    Expanded(
                      child: Container(
                        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
                        decoration: BoxDecoration(
                          color: isDark ? AppColors.darkCard : const Color(0xFFF3F4F6),
                          borderRadius: BorderRadius.circular(16),
                          border: Border.all(
                            color: isDark ? Colors.white : AppColors.inkBlack,
                            width: 1.5,
                          ),
                        ),
                        child: Text(
                          "Nice one! Everyone in $spaceName can join proximity voice in 1 click.",
                          style: GoogleFonts.plusJakartaSans(
                            fontSize: 12.5,
                            fontWeight: FontWeight.w600,
                            color: isDark ? Colors.white : AppColors.inkBlack,
                            height: 1.35,
                          ),
                        ),
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 20),

                // 4. Confirmation Box with Actions
                Container(
                  padding: const EdgeInsets.all(16),
                  decoration: BoxDecoration(
                    color: isDark ? AppColors.darkCard : const Color(0xFFF9FAFB),
                    borderRadius: BorderRadius.circular(18),
                    border: Border.all(
                      color: isDark ? Colors.white : AppColors.inkBlack,
                      width: 1.6,
                    ),
                  ),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: [
                      RichText(
                        text: TextSpan(
                          style: GoogleFonts.plusJakartaSans(
                            fontSize: 13,
                            color: isDark ? Colors.white : AppColors.inkBlack,
                            height: 1.4,
                          ),
                          children: [
                            TextSpan(
                              text: "$spaceName ",
                              style: const TextStyle(fontWeight: FontWeight.w900),
                            ),
                            const TextSpan(
                              text:
                                  "is ready. In the real world you also get proximity voice huts, invite links, and custom retro avatars.",
                            ),
                          ],
                        ),
                      ),
                      const SizedBox(height: 14),
                      Row(
                        children: [
                          Expanded(
                            child: NeoButton(
                              text: "Create your account",
                              backgroundColor: isDark ? AppColors.neonLime : AppColors.amberButton,
                              textColor: AppColors.inkBlack,
                              borderColor: AppColors.inkBlack,
                              fontSize: 12.5,
                              padding: const EdgeInsets.symmetric(vertical: 10, horizontal: 8),
                              borderRadius: 999,
                              shadowOffset: const Offset(2, 2.5),
                              onPressed: () => _showAuthModal(isSignUp: true),
                            ),
                          ),
                          const SizedBox(width: 8),
                          NeoButton(
                            text: "Start over",
                            backgroundColor: isDark ? AppColors.darkBg : Colors.white,
                            textColor: isDark ? Colors.white : AppColors.inkBlack,
                            borderColor: isDark ? Colors.white : AppColors.inkBlack,
                            fontSize: 12.5,
                            padding: const EdgeInsets.symmetric(vertical: 10, horizontal: 16),
                            borderRadius: 999,
                            shadowOffset: const Offset(2, 2.5),
                            onPressed: () => setState(() => _showSimulatedChat = false),
                          ),
                        ],
                      ),
                    ],
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  // ── Space Creation Form View ──────────────────────────────────────
  Widget _buildCreationFormView(
    ({String name, Color base, Color stripe}) selectedPalette,
    String initials,
    bool isDark,
  ) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        // 1. NAME IT Input
        Text(
          "NAME IT",
          style: GoogleFonts.plusJakartaSans(
            fontSize: 11,
            fontWeight: FontWeight.w800,
            letterSpacing: 0.8,
            color: isDark ? AppColors.darkInkMuted : const Color(0xFF52525B),
          ),
        ),
        const SizedBox(height: 6),
        TextField(
          controller: _spaceNameController,
          style: GoogleFonts.plusJakartaSans(
            fontSize: 14.5,
            fontWeight: FontWeight.w700,
            color: isDark ? Colors.white : AppColors.inkBlack,
          ),
          decoration: InputDecoration(
            hintText: "The Crew HQ",
            hintStyle: TextStyle(
              color: isDark ? Colors.white38 : const Color(0xFFA1A1AA),
              fontSize: 14,
            ),
            filled: true,
            fillColor: isDark ? AppColors.darkBg : Colors.white,
            contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
            border: OutlineInputBorder(
              borderRadius: BorderRadius.circular(12),
              borderSide: BorderSide(color: isDark ? Colors.white : AppColors.inkBlack, width: 2),
            ),
            enabledBorder: OutlineInputBorder(
              borderRadius: BorderRadius.circular(12),
              borderSide: BorderSide(color: isDark ? Colors.white : AppColors.inkBlack, width: 2),
            ),
            focusedBorder: OutlineInputBorder(
              borderRadius: BorderRadius.circular(12),
              borderSide: BorderSide(
                color: isDark ? AppColors.neonLime : AppColors.teemPurple,
                width: 2.2,
              ),
            ),
          ),
        ),
        const SizedBox(height: 18),

        // 2. WHAT'S IT FOR? Categories
        Text(
          "WHAT'S IT FOR?",
          style: GoogleFonts.plusJakartaSans(
            fontSize: 11,
            fontWeight: FontWeight.w800,
            letterSpacing: 0.8,
            color: isDark ? AppColors.darkInkMuted : const Color(0xFF52525B),
          ),
        ),
        const SizedBox(height: 8),
        SingleChildScrollView(
          scrollDirection: Axis.horizontal,
          child: Row(
            children: _categories.map((category) {
              final isSelected = _selectedCategory == category;
              return Padding(
                padding: const EdgeInsets.only(right: 8),
                child: InkWell(
                  borderRadius: BorderRadius.circular(999),
                  onTap: () => setState(() => _selectedCategory = category),
                  child: Container(
                    padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
                    decoration: BoxDecoration(
                      color: isSelected
                          ? (isDark ? AppColors.neonLime : AppColors.inkBlack)
                          : (isDark ? AppColors.darkBg : Colors.white),
                      borderRadius: BorderRadius.circular(999),
                      border: Border.all(
                        color: isSelected
                            ? (isDark ? AppColors.neonLime : AppColors.inkBlack)
                            : (isDark ? Colors.white : AppColors.inkBlack),
                        width: 2,
                      ),
                    ),
                    child: Text(
                      category,
                      style: GoogleFonts.plusJakartaSans(
                        fontSize: 12.5,
                        fontWeight: FontWeight.w700,
                        color: isSelected
                            ? (isDark ? AppColors.inkBlack : Colors.white)
                            : (isDark ? Colors.white : AppColors.inkBlack),
                      ),
                    ),
                  ),
                ),
              );
            }).toList(),
          ),
        ),
        const SizedBox(height: 18),

        // 3. PICK A COLOUR Swatches
        Text(
          "PICK A COLOUR",
          style: GoogleFonts.plusJakartaSans(
            fontSize: 11,
            fontWeight: FontWeight.w800,
            letterSpacing: 0.8,
            color: isDark ? AppColors.darkInkMuted : const Color(0xFF52525B),
          ),
        ),
        const SizedBox(height: 8),
        Row(
          children: List.generate(_colorPalettes.length, (index) {
            final item = _colorPalettes[index];
            final isSelected = _selectedColorIndex == index;
            return Padding(
              padding: const EdgeInsets.only(right: 10),
              child: InkWell(
                borderRadius: BorderRadius.circular(999),
                onTap: () => setState(() => _selectedColorIndex = index),
                child: Container(
                  width: 36,
                  height: 36,
                  decoration: BoxDecoration(
                    color: item.base,
                    shape: BoxShape.circle,
                    border: Border.all(
                      color: isDark ? Colors.white : AppColors.inkBlack,
                      width: isSelected ? 3.0 : 2.0,
                    ),
                    boxShadow: isSelected
                        ? [
                            BoxShadow(
                              color: isDark ? Colors.white : AppColors.inkBlack,
                              offset: const Offset(1.5, 2),
                              blurRadius: 0,
                            ),
                          ]
                        : null,
                  ),
                  child: isSelected
                      ? const Center(
                          child: Icon(Icons.check, size: 18, color: Colors.white),
                        )
                      : null,
                ),
              ),
            );
          }),
        ),
        const SizedBox(height: 22),

        // 4. BIG CTA: "Open my space"
        NeoButton(
          text: "Open my space",
          backgroundColor: isDark ? AppColors.neonLime : AppColors.amberButton,
          textColor: AppColors.inkBlack,
          fontSize: 16,
          fontWeight: FontWeight.w900,
          borderRadius: 999,
          borderWidth: 2.4,
          borderColor: AppColors.inkBlack,
          padding: const EdgeInsets.symmetric(vertical: 14),
          shadowOffset: const Offset(3, 3.5),
          isFullWidth: true,
          onPressed: _handleOpenSpace,
        ),
        const SizedBox(height: 24),

        // 5. LIVE PREVIEW CARD (Interactive preview)
        InkWell(
          borderRadius: BorderRadius.circular(18),
          onTap: _handleOpenSpace,
          child: Center(
            child: ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 300),
              child: Container(
                decoration: BoxDecoration(
                  color: isDark ? AppColors.darkBg : Colors.white,
                  borderRadius: BorderRadius.circular(18),
                  border: Border.all(
                    color: isDark ? Colors.white : AppColors.inkBlack,
                    width: 2.2,
                  ),
                  boxShadow: [
                    BoxShadow(
                      color: isDark ? Colors.white : AppColors.inkBlack,
                      offset: const Offset(3.5, 4),
                      blurRadius: 0,
                    ),
                  ],
                ),
                clipBehavior: Clip.antiAlias,
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    // Top Diagonal Striped Banner with Category Badge & Avatar
                    SizedBox(
                      height: 82,
                      child: Stack(
                        clipBehavior: Clip.none,
                        children: [
                          Positioned.fill(
                            child: CustomPaint(
                              painter: DiagonalStripesPainter(
                                baseColor: isDark ? AppColors.neonLime : selectedPalette.base,
                                stripeColor: isDark ? AppColors.neonLimeStripe : selectedPalette.stripe,
                                stripeWidth: 8,
                                spacing: 18,
                              ),
                            ),
                          ),
                          // Category Tag Pill in Top-Left
                          Positioned(
                            top: 8,
                            left: 10,
                            child: Container(
                              padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 3),
                              decoration: BoxDecoration(
                                color: isDark ? AppColors.darkCard : Colors.white,
                                borderRadius: BorderRadius.circular(999),
                                border: Border.all(
                                  color: isDark ? Colors.white : AppColors.inkBlack,
                                  width: 1.8,
                                ),
                              ),
                              child: Text(
                                _selectedCategory,
                                style: GoogleFonts.plusJakartaSans(
                                  fontSize: 10.5,
                                  fontWeight: FontWeight.w800,
                                  color: isDark ? Colors.white : AppColors.inkBlack,
                                ),
                              ),
                            ),
                          ),
                          // Avatar Circle Badge Overlapping Bottom
                          Positioned(
                            bottom: -22,
                            left: 16,
                            child: Container(
                              width: 44,
                              height: 44,
                              decoration: BoxDecoration(
                                color: Colors.white,
                                shape: BoxShape.circle,
                                border: Border.all(color: AppColors.inkBlack, width: 2.2),
                                boxShadow: const [
                                  BoxShadow(
                                    color: AppColors.inkBlack,
                                    offset: Offset(1.5, 2),
                                    blurRadius: 0,
                                  ),
                                ],
                              ),
                              child: Center(
                                child: Text(
                                  initials,
                                  style: GoogleFonts.plusJakartaSans(
                                    fontSize: 15,
                                    fontWeight: FontWeight.w900,
                                    color: AppColors.inkBlack,
                                  ),
                                ),
                              ),
                            ),
                          ),
                        ],
                      ),
                    ),

                    // Card Bottom Body
                    Padding(
                      padding: const EdgeInsets.only(left: 16, right: 16, top: 28, bottom: 16),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          // Space Title
                          Text(
                            _spaceNameController.text.trim().isNotEmpty
                                ? _spaceNameController.text.trim()
                                : "The Crew HQ",
                            style: GoogleFonts.plusJakartaSans(
                              fontSize: 17,
                              fontWeight: FontWeight.w900,
                              color: isDark ? Colors.white : AppColors.inkBlack,
                              letterSpacing: -0.3,
                            ),
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                          ),
                          const SizedBox(height: 2),
                          Text(
                            "1 member • Tap to test chat",
                            style: GoogleFonts.plusJakartaSans(
                              fontSize: 12,
                              fontWeight: FontWeight.w500,
                              color: isDark ? AppColors.darkInkMuted : const Color(0xFF71717A),
                            ),
                          ),
                          const SizedBox(height: 12),

                          // Voice Status Pill
                          Container(
                            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
                            decoration: BoxDecoration(
                              color: isDark ? AppColors.darkCardInner : const Color(0xFFEFECE6),
                              borderRadius: BorderRadius.circular(10),
                              border: Border.all(
                                color: isDark ? Colors.white24 : const Color(0xFFD4D4D8),
                                width: 1.2,
                              ),
                            ),
                            child: Row(
                              mainAxisSize: MainAxisSize.min,
                              children: [
                                Text(
                                  "No one in voice",
                                  style: GoogleFonts.plusJakartaSans(
                                    fontSize: 11.5,
                                    fontWeight: FontWeight.w600,
                                    color: isDark ? AppColors.darkInkMuted : const Color(0xFF71717A),
                                  ),
                                ),
                              ],
                            ),
                          ),
                        ],
                      ),
                    ),
                  ],
                ),
              ),
            ),
          ),
        ),
      ],
    );
  }
}


