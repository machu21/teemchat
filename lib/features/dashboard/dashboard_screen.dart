import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';
import '../../core/constants/app_colors.dart';
import '../../core/models/avatar_model.dart';
import '../../core/models/space_model.dart';
import '../../core/services/space_service.dart';
import '../../core/widgets/neo_components.dart';
import '../../core/widgets/pixel_avatar_widget.dart';
import '../auth/auth_service.dart';
import '../world/world_screen.dart';

class DashboardScreen extends StatefulWidget {
  const DashboardScreen({super.key});

  @override
  State<DashboardScreen> createState() => _DashboardScreenState();
}

class _DashboardScreenState extends State<DashboardScreen> {
  List<SpaceModel> _spaces = [SpaceModel.defaultHQ()];
  bool _isLoadingSpaces = false;

  @override
  void initState() {
    super.initState();
    _loadSpaces();
  }

  Future<void> _loadSpaces() async {
    setState(() => _isLoadingSpaces = true);
    final spaces = await SpaceService.getSpaces();
    if (mounted) {
      setState(() {
        _spaces = spaces;
        _isLoadingSpaces = false;
      });
    }
  }

  void _showCreateSpaceModal() {
    final nameController = TextEditingController();
    String category = 'Gaming';
    SpaceTier selectedTier = SpaceTier.free;

    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.white,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(28)),
        side: BorderSide(color: AppColors.inkBlack, width: 2.5),
      ),
      builder: (context) {
        return StatefulBuilder(
          builder: (context, setModalState) {
            return Padding(
              padding: EdgeInsets.only(
                left: 24,
                right: 24,
                top: 24,
                bottom: MediaQuery.of(context).viewInsets.bottom + 24,
              ),
              child: SingleChildScrollView(
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    Row(
                      mainAxisAlignment: MainAxisAlignment.spaceBetween,
                      children: [
                        Text(
                          "Create Virtual Space",
                          style: GoogleFonts.plusJakartaSans(
                            fontSize: 22,
                            fontWeight: FontWeight.w900,
                            color: AppColors.inkBlack,
                            letterSpacing: -0.5,
                          ),
                        ),
                        IconButton(
                          icon: const Icon(Icons.close, color: AppColors.inkBlack),
                          onPressed: () => Navigator.pop(context),
                        ),
                      ],
                    ),
                    const SizedBox(height: 16),
                    Text(
                      "Space Name",
                      style: GoogleFonts.plusJakartaSans(
                        fontWeight: FontWeight.w800,
                        fontSize: 13,
                        color: AppColors.inkBlack,
                      ),
                    ),
                    const SizedBox(height: 6),
                    TextField(
                      controller: nameController,
                      style: GoogleFonts.plusJakartaSans(
                        fontWeight: FontWeight.w700,
                        color: AppColors.inkBlack,
                      ),
                      decoration: InputDecoration(
                        hintText: "e.g. Pixel Coffeehouse, Indie Dev Camp",
                        hintStyle: GoogleFonts.plusJakartaSans(
                          fontWeight: FontWeight.w600,
                          color: const Color(0xFFA1A1AA),
                        ),
                        filled: true,
                        fillColor: const Color(0xFFF6F4EE),
                        border: OutlineInputBorder(
                          borderRadius: BorderRadius.circular(12),
                          borderSide: const BorderSide(color: AppColors.inkBlack, width: 2),
                        ),
                        enabledBorder: OutlineInputBorder(
                          borderRadius: BorderRadius.circular(12),
                          borderSide: const BorderSide(color: AppColors.inkBlack, width: 2),
                        ),
                        focusedBorder: OutlineInputBorder(
                          borderRadius: BorderRadius.circular(12),
                          borderSide: const BorderSide(color: AppColors.teemPurple, width: 2.2),
                        ),
                      ),
                    ),
                    const SizedBox(height: 16),
                    Text(
                      "Category",
                      style: GoogleFonts.plusJakartaSans(
                        fontWeight: FontWeight.w800,
                        fontSize: 13,
                        color: AppColors.inkBlack,
                      ),
                    ),
                    const SizedBox(height: 8),
                    Wrap(
                      spacing: 8,
                      children: ['Gaming', 'Work', 'School', 'Friends'].map((cat) {
                        final isSel = category == cat;
                        return ChoiceChip(
                          label: Text(
                            cat,
                            style: GoogleFonts.plusJakartaSans(
                              fontWeight: FontWeight.w800,
                              color: isSel ? Colors.white : AppColors.inkBlack,
                              fontSize: 12,
                            ),
                          ),
                          selected: isSel,
                          selectedColor: AppColors.teemPurple,
                          backgroundColor: const Color(0xFFF6F4EE),
                          side: BorderSide(color: isSel ? AppColors.teemPurple : AppColors.inkBlack, width: 1.5),
                          onSelected: (_) => setModalState(() => category = cat),
                        );
                      }).toList(),
                    ),
                    const SizedBox(height: 16),
                    Text(
                      "Choose Plan Tier",
                      style: GoogleFonts.plusJakartaSans(
                        fontWeight: FontWeight.w800,
                        fontSize: 13,
                        color: AppColors.inkBlack,
                      ),
                    ),
                    const SizedBox(height: 8),
                    Row(
                      children: [
                        _buildTierOption(
                          tier: SpaceTier.free,
                          selected: selectedTier == SpaceTier.free,
                          label: "Starter",
                          price: "Free",
                          capacity: "15 Avatars",
                          onTap: () => setModalState(() => selectedTier = SpaceTier.free),
                        ),
                        const SizedBox(width: 8),
                        _buildTierOption(
                          tier: SpaceTier.pro,
                          selected: selectedTier == SpaceTier.pro,
                          label: "Pro Builder",
                          price: "\$9/mo",
                          capacity: "75 Avatars",
                          onTap: () => setModalState(() => selectedTier = SpaceTier.pro),
                        ),
                        const SizedBox(width: 8),
                        _buildTierOption(
                          tier: SpaceTier.studio,
                          selected: selectedTier == SpaceTier.studio,
                          label: "Studio",
                          price: "\$29/mo",
                          capacity: "250 Avatars",
                          onTap: () => setModalState(() => selectedTier = SpaceTier.studio),
                        ),
                      ],
                    ),
                    const SizedBox(height: 24),
                    NeoButton(
                      text: "Launch Space",
                      icon: Icons.rocket_launch,
                      backgroundColor: AppColors.amberButton,
                      textColor: AppColors.inkBlack,
                      fontSize: 15,
                      fontWeight: FontWeight.w900,
                      borderRadius: 14,
                      borderWidth: 2.2,
                      shadowOffset: const Offset(2.5, 3),
                      isFullWidth: true,
                      onPressed: () async {
                        final name = nameController.text.trim();
                        if (name.isEmpty) return;
                        final slug = name.toLowerCase().replaceAll(RegExp(r'[^a-z0-9]'), '-');
                        final created = await SpaceService.createSpace(
                          name: name,
                          slug: "$slug-${DateTime.now().millisecondsSinceEpoch % 1000}",
                          category: category,
                          tier: selectedTier,
                        );
                        if (created != null && mounted) {
                          Navigator.pop(context);
                          _loadSpaces();
                        }
                      },
                    ),
                  ],
                ),
              ),
            );
          },
        );
      },
    );
  }

  Widget _buildTierOption({
    required SpaceTier tier,
    required bool selected,
    required String label,
    required String price,
    required String capacity,
    required VoidCallback onTap,
  }) {
    return Expanded(
      child: GestureDetector(
        onTap: onTap,
        child: Container(
          padding: const EdgeInsets.symmetric(vertical: 12, horizontal: 8),
          decoration: BoxDecoration(
            color: selected ? tier.badgeColor.withOpacity(0.15) : const Color(0xFFF6F4EE),
            borderRadius: BorderRadius.circular(12),
            border: Border.all(
              color: selected ? tier.badgeColor : AppColors.inkBlack,
              width: selected ? 2.2 : 1.5,
            ),
          ),
          child: Column(
            children: [
              Text(
                label,
                style: GoogleFonts.plusJakartaSans(
                  fontWeight: FontWeight.w900,
                  fontSize: 12,
                  color: AppColors.inkBlack,
                ),
              ),
              const SizedBox(height: 2),
              Text(
                price,
                style: GoogleFonts.plusJakartaSans(
                  fontWeight: FontWeight.w900,
                  fontSize: 14,
                  color: selected ? AppColors.inkBlack : const Color(0xFF71717A),
                ),
              ),
              const SizedBox(height: 2),
              Text(
                capacity,
                style: GoogleFonts.plusJakartaSans(
                  fontWeight: FontWeight.w700,
                  fontSize: 10,
                  color: const Color(0xFF71717A),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  void _showUpgradeSpaceModal(SpaceModel space) {
    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.white,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(28)),
        side: BorderSide(color: AppColors.inkBlack, width: 2.5),
      ),
      builder: (context) {
        return Padding(
          padding: const EdgeInsets.all(24),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  Text(
                    "Upgrade ${space.name}",
                    style: GoogleFonts.plusJakartaSans(
                      fontSize: 22,
                      fontWeight: FontWeight.w900,
                      color: AppColors.inkBlack,
                      letterSpacing: -0.5,
                    ),
                  ),
                  IconButton(
                    icon: const Icon(Icons.close, color: AppColors.inkBlack),
                    onPressed: () => Navigator.pop(context),
                  ),
                ],
              ),
              const SizedBox(height: 12),
              Text(
                "Host pays, everyone hangs out for free! Choose a plan to unlock higher capacity and custom cloud map builder perks.",
                style: GoogleFonts.plusJakartaSans(
                  color: const Color(0xFF52525B),
                  fontSize: 13.5,
                  height: 1.4,
                ),
              ),
              const SizedBox(height: 20),
              Container(
                padding: const EdgeInsets.all(16),
                decoration: BoxDecoration(
                  color: const Color(0xFFFEF3C7),
                  borderRadius: BorderRadius.circular(16),
                  border: Border.all(color: AppColors.inkBlack, width: 2),
                ),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      mainAxisAlignment: MainAxisAlignment.spaceBetween,
                      children: [
                        Text(
                          "PRO BUILDER",
                          style: GoogleFonts.plusJakartaSans(
                            fontSize: 16,
                            fontWeight: FontWeight.w900,
                            color: AppColors.inkBlack,
                          ),
                        ),
                        Text(
                          "\$9 / month",
                          style: GoogleFonts.plusJakartaSans(
                            fontSize: 16,
                            fontWeight: FontWeight.w900,
                            color: AppColors.inkBlack,
                          ),
                        ),
                      ],
                    ),
                    const SizedBox(height: 10),
                    const Text("• Up to 75 concurrent avatars (5x Starter)"),
                    const Text("• In-Game Map Builder with persistent cloud storage"),
                    const Text("• Custom room locks, passwords & vanity slug"),
                    const Text("• High-bitrate low-latency spatial audio"),
                  ],
                ),
              ),
              const SizedBox(height: 20),
              NeoButton(
                text: "Upgrade to Pro (\$9/mo)",
                icon: Icons.star,
                backgroundColor: AppColors.amberButton,
                textColor: AppColors.inkBlack,
                fontSize: 15,
                fontWeight: FontWeight.w900,
                borderRadius: 14,
                isFullWidth: true,
                onPressed: () {
                  Navigator.pop(context);
                  ScaffoldMessenger.of(context).showSnackBar(
                    SnackBar(
                      content: Text("Subscription checkout initialized for ${space.name}!"),
                      duration: const Duration(seconds: 2),
                    ),
                  );
                },
              ),
            ],
          ),
        );
      },
    );
  }
  final List<Color> _skinPalette = const [
    Color(0xFFFCD5B5),
    Color(0xFFFFDFC4),
    Color(0xFFE0AC69),
    Color(0xFFC68642),
    Color(0xFF8D5524),
  ];

  final List<Color> _shirtPalette = const [
    Color(0xFF7C3AED), // TeemChat Purple (default)
    Color(0xFF5B21B6), // Deep Purple
    Color(0xFF3B82F6), // Indigo Blue
    Color(0xFF10B981), // Emerald
    Color(0xFFEF4444), // Coral Red
    Color(0xFFF59E0B), // Amber
    Color(0xFF06B6D4), // Cyan
    Color(0xFFEC4899), // Pink
    Color(0xFF475569), // Slate
  ];

  final List<Color> _hairPalette = const [
    Color(0xFF1F2937), // Black
    Color(0xFF37271E), // Dark Espresso
    Color(0xFF6B4226), // Chestnut
    Color(0xFFE6C280), // Blonde
    Color(0xFF9A3324), // Auburn
    Color(0xFF94A3B8), // Silver
  ];

  Color _getStatusColor(String status) {
    switch (status) {
      case 'available':
        return AppColors.available;
      case 'away':
        return AppColors.away;
      case 'busy':
        return AppColors.busy;
      case 'dnd':
        return AppColors.dnd;
      default:
        return AppColors.available;
    }
  }

  String _getStatusLabel(String status) {
    switch (status) {
      case 'available':
        return "🟢 Available";
      case 'away':
        return "🟡 Away";
      case 'busy':
        return "🔴 Busy / Focus";
      case 'dnd':
        return "🌙 Do Not Disturb";
      default:
        return "🟢 Available";
    }
  }

  void _showAvatarCustomizer(UserSession session) {
    AvatarConfig tempConfig = session.avatarConfig;

    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.white,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(28)),
        side: BorderSide(color: AppColors.inkBlack, width: 2.5),
      ),
      builder: (context) {
        return StatefulBuilder(
          builder: (context, setModalState) {
            return Padding(
              padding: EdgeInsets.only(
                left: 24,
                right: 24,
                top: 24,
                bottom: MediaQuery.of(context).viewInsets.bottom + 24,
              ),
              child: SingleChildScrollView(
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    Row(
                      mainAxisAlignment: MainAxisAlignment.spaceBetween,
                      children: [
                        Text(
                          "Customize Persona",
                          style: GoogleFonts.plusJakartaSans(
                            fontSize: 22,
                            fontWeight: FontWeight.w900,
                            color: AppColors.inkBlack,
                            letterSpacing: -0.5,
                          ),
                        ),
                        IconButton(
                          icon: const Icon(Icons.close, color: AppColors.inkBlack),
                          onPressed: () => Navigator.pop(context),
                        ),
                      ],
                    ),
                    const SizedBox(height: 16),

                    // Avatar Preview Card
                    Center(
                      child: Container(
                        padding: const EdgeInsets.all(20),
                        decoration: BoxDecoration(
                          color: AppColors.creamBg,
                          borderRadius: BorderRadius.circular(20),
                          border: Border.all(color: AppColors.inkBlack, width: 2),
                          boxShadow: const [
                            BoxShadow(
                              color: AppColors.inkBlack,
                              offset: Offset(2, 2.5),
                              blurRadius: 0,
                            ),
                          ],
                        ),
                        child: Column(
                          children: [
                            _buildAvatarPreviewWidget(tempConfig, 64),
                            const SizedBox(height: 12),
                            Text(
                              session.displayName,
                              style: GoogleFonts.plusJakartaSans(
                                fontWeight: FontWeight.w800,
                                color: AppColors.inkBlack,
                                fontSize: 16,
                              ),
                            ),
                          ],
                        ),
                      ),
                    ),
                    const SizedBox(height: 20),

                    // Skin Color Picker
                    Text(
                      "Skin Tone",
                      style: GoogleFonts.plusJakartaSans(
                        color: AppColors.inkBlack,
                        fontWeight: FontWeight.w800,
                        fontSize: 13,
                      ),
                    ),
                    const SizedBox(height: 8),
                    Wrap(
                      spacing: 10,
                      children: _skinPalette.map((color) {
                        final isSelected = tempConfig.skinColor == color;
                        return GestureDetector(
                          onTap: () => setModalState(() => tempConfig = tempConfig.copyWith(skinColor: color)),
                          child: Container(
                            width: 38,
                            height: 38,
                            decoration: BoxDecoration(
                              color: color,
                              shape: BoxShape.circle,
                              border: Border.all(
                                color: isSelected ? AppColors.inkBlack : Colors.black26,
                                width: isSelected ? 3.2 : 1.5,
                              ),
                              boxShadow: isSelected
                                  ? const [
                                      BoxShadow(
                                        color: AppColors.inkBlack,
                                        offset: Offset(1.5, 2),
                                        blurRadius: 0,
                                      ),
                                    ]
                                  : null,
                            ),
                          ),
                        );
                      }).toList(),
                    ),
                    const SizedBox(height: 16),

                    // Shirt Color Picker
                    Text(
                      "Shirt Color",
                      style: GoogleFonts.plusJakartaSans(
                        color: AppColors.inkBlack,
                        fontWeight: FontWeight.w800,
                        fontSize: 13,
                      ),
                    ),
                    const SizedBox(height: 8),
                    Wrap(
                      spacing: 10,
                      runSpacing: 10,
                      children: _shirtPalette.map((color) {
                        final isSelected = tempConfig.shirtColor == color;
                        return GestureDetector(
                          onTap: () => setModalState(() => tempConfig = tempConfig.copyWith(shirtColor: color)),
                          child: Container(
                            width: 38,
                            height: 38,
                            decoration: BoxDecoration(
                              color: color,
                              shape: BoxShape.circle,
                              border: Border.all(
                                color: isSelected ? AppColors.inkBlack : Colors.black26,
                                width: isSelected ? 3.2 : 1.5,
                              ),
                              boxShadow: isSelected
                                  ? const [
                                      BoxShadow(
                                        color: AppColors.inkBlack,
                                        offset: Offset(1.5, 2),
                                        blurRadius: 0,
                                      ),
                                    ]
                                  : null,
                            ),
                          ),
                        );
                      }).toList(),
                    ),
                    const SizedBox(height: 16),

                    // Hair Color Picker
                    Text(
                      "Hair Color",
                      style: GoogleFonts.plusJakartaSans(
                        color: AppColors.inkBlack,
                        fontWeight: FontWeight.w800,
                        fontSize: 13,
                      ),
                    ),
                    const SizedBox(height: 8),
                    Wrap(
                      spacing: 10,
                      children: _hairPalette.map((color) {
                        final isSelected = tempConfig.hairColor == color;
                        return GestureDetector(
                          onTap: () => setModalState(() => tempConfig = tempConfig.copyWith(hairColor: color)),
                          child: Container(
                            width: 38,
                            height: 38,
                            decoration: BoxDecoration(
                              color: color,
                              shape: BoxShape.circle,
                              border: Border.all(
                                color: isSelected ? AppColors.inkBlack : Colors.black26,
                                width: isSelected ? 3.2 : 1.5,
                              ),
                              boxShadow: isSelected
                                  ? const [
                                      BoxShadow(
                                        color: AppColors.inkBlack,
                                        offset: Offset(1.5, 2),
                                        blurRadius: 0,
                                      ),
                                    ]
                                  : null,
                            ),
                          ),
                        );
                      }).toList(),
                    ),
                    const SizedBox(height: 16),

                    // Hair Style Picker
                    Text(
                      "Hair Style",
                      style: GoogleFonts.plusJakartaSans(
                        color: AppColors.inkBlack,
                        fontWeight: FontWeight.w800,
                        fontSize: 13,
                      ),
                    ),
                    const SizedBox(height: 8),
                    Row(
                      children: ['short', 'long', 'buzz', 'spiky'].map((style) {
                        final isSelected = tempConfig.hairStyle == style;
                        return Expanded(
                          child: Padding(
                            padding: const EdgeInsets.symmetric(horizontal: 4),
                            child: GestureDetector(
                              onTap: () => setModalState(() => tempConfig = tempConfig.copyWith(hairStyle: style)),
                              child: Container(
                                padding: const EdgeInsets.symmetric(vertical: 10),
                                decoration: BoxDecoration(
                                  color: isSelected ? AppColors.inkBlack : Colors.white,
                                  borderRadius: BorderRadius.circular(10),
                                  border: Border.all(color: AppColors.inkBlack, width: 2),
                                ),
                                child: Text(
                                  style.toUpperCase(),
                                  textAlign: TextAlign.center,
                                  style: GoogleFonts.plusJakartaSans(
                                    color: isSelected ? Colors.white : AppColors.inkBlack,
                                    fontWeight: FontWeight.w800,
                                    fontSize: 11,
                                  ),
                                ),
                              ),
                            ),
                          ),
                        );
                      }).toList(),
                    ),
                    const SizedBox(height: 16),

                    // Accessory Picker
                    Text(
                      "Accessory",
                      style: GoogleFonts.plusJakartaSans(
                        color: AppColors.inkBlack,
                        fontWeight: FontWeight.w800,
                        fontSize: 13,
                      ),
                    ),
                    const SizedBox(height: 8),
                    Row(
                      children: [
                        (id: 'none', label: 'None', icon: '❌'),
                        (id: 'cap', label: 'Cap', icon: '🧢'),
                        (id: 'glasses', label: 'Glasses', icon: '👓'),
                        (id: 'headband', label: 'Band', icon: '🥋'),
                        (id: 'headphones', label: 'Headset', icon: '🎧'),
                      ].map((acc) {
                        final isSelected = tempConfig.accessory == acc.id;
                        return Expanded(
                          child: Padding(
                            padding: const EdgeInsets.symmetric(horizontal: 4),
                            child: GestureDetector(
                              onTap: () => setModalState(() => tempConfig = tempConfig.copyWith(accessory: acc.id)),
                              child: Container(
                                padding: const EdgeInsets.symmetric(vertical: 8),
                                decoration: BoxDecoration(
                                  color: isSelected ? AppColors.teemPurpleSoft : Colors.white,
                                  borderRadius: BorderRadius.circular(10),
                                  border: Border.all(
                                    color: isSelected ? AppColors.teemPurple : AppColors.inkBlack,
                                    width: isSelected ? 2.2 : 1.5,
                                  ),
                                ),
                                child: Column(
                                  mainAxisSize: MainAxisSize.min,
                                  children: [
                                    Text(acc.icon, style: const TextStyle(fontSize: 14)),
                                    const SizedBox(height: 2),
                                    Text(
                                      acc.label,
                                      style: GoogleFonts.plusJakartaSans(
                                        color: isSelected ? AppColors.teemPurpleDark : AppColors.inkBlack,
                                        fontWeight: FontWeight.w800,
                                        fontSize: 10,
                                      ),
                                    ),
                                  ],
                                ),
                              ),
                            ),
                          ),
                        );
                      }).toList(),
                    ),
                    const SizedBox(height: 24),

                    NeoButton(
                      text: "Save Persona",
                      backgroundColor: AppColors.amberButton,
                      textColor: AppColors.inkBlack,
                      fontSize: 15,
                      fontWeight: FontWeight.w900,
                      borderRadius: 14,
                      borderWidth: 2.2,
                      shadowOffset: const Offset(2.5, 3),
                      isFullWidth: true,
                      onPressed: () async {
                        await AuthService.updateProfile(
                          displayName: session.displayName,
                          status: session.status,
                          avatarConfig: tempConfig,
                        );
                        if (mounted) Navigator.pop(context);
                      },
                    ),
                  ],
                ),
              ),
            );
          },
        );
      },
    );
  }

  Widget _buildAvatarPreviewWidget(AvatarConfig config, double radius) {
    return PixelAvatarWidget(config: config, size: radius * 2);
  }

  @override
  Widget build(BuildContext context) {
    return ValueListenableBuilder<UserSession?>(
      valueListenable: AuthService.sessionNotifier,
      builder: (context, session, _) {
        if (session == null) {
          return const Scaffold(
            backgroundColor: AppColors.background,
            body: Center(child: CircularProgressIndicator(color: AppColors.primary)),
          );
        }

        return Scaffold(
          backgroundColor: AppColors.creamBg,
          appBar: AppBar(
            backgroundColor: AppColors.creamBg,
            elevation: 0,
            bottom: const PreferredSize(
              preferredSize: Size.fromHeight(1.5),
              child: Divider(height: 1.5, color: Color(0xFFE8E5DD)),
            ),
            title: Row(
              children: [
                Container(
                  width: 34,
                  height: 34,
                  decoration: BoxDecoration(
                    shape: BoxShape.circle,
                    color: const Color(0xFFF6F4EE),
                    border: Border.all(color: AppColors.inkBlack, width: 2),
                    boxShadow: const [
                      BoxShadow(
                        color: AppColors.inkBlack,
                        offset: Offset(1.5, 2),
                        blurRadius: 0,
                      ),
                    ],
                  ),
                  child: ClipOval(
                    child: Transform.scale(
                      scale: 1.65,
                      child: Image.asset(
                        'assets/images/teamchat_logo.jpg',
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
                      fontSize: 20,
                      fontWeight: FontWeight.w900,
                      color: AppColors.inkBlack,
                      letterSpacing: -0.5,
                    ),
                    children: const [
                      TextSpan(text: 'teemchat'),
                      TextSpan(
                        text: '.',
                        style: TextStyle(color: AppColors.coralAccent),
                      ),
                    ],
                  ),
                ),
                const SizedBox(width: 8),
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 7, vertical: 2),
                  decoration: BoxDecoration(
                    color: AppColors.teemPurpleSoft,
                    borderRadius: BorderRadius.circular(6),
                    border: Border.all(color: AppColors.teemPurpleLight.withOpacity(0.5)),
                  ),
                  child: Text(
                    "WORLD LOBBY",
                    style: GoogleFonts.plusJakartaSans(
                      fontSize: 9.5,
                      fontWeight: FontWeight.w800,
                      color: AppColors.teemPurple,
                      letterSpacing: 0.8,
                    ),
                  ),
                ),
              ],
            ),
            actions: [
              Padding(
                padding: const EdgeInsets.only(right: 16),
                child: NeoButton(
                  text: "Sign out",
                  icon: Icons.logout,
                  backgroundColor: Colors.white,
                  textColor: AppColors.inkBlack,
                  fontSize: 12.5,
                  padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 6),
                  borderRadius: 999,
                  shadowOffset: const Offset(1.5, 2),
                  onPressed: () => AuthService.signOut(),
                ),
              ),
            ],
          ),
          body: Center(
            child: SingleChildScrollView(
              padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 32),
              child: Container(
                constraints: const BoxConstraints(maxWidth: 620),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    // Persona Card
                    NeoCard(
                      padding: const EdgeInsets.all(24),
                      borderRadius: 24,
                      borderWidth: 2.4,
                      shadowOffset: const Offset(5, 5),
                      child: Column(
                        children: [
                          Row(
                            children: [
                              Container(
                                decoration: BoxDecoration(
                                  shape: BoxShape.circle,
                                  border: Border.all(color: AppColors.inkBlack, width: 2),
                                  boxShadow: const [
                                    BoxShadow(
                                      color: AppColors.inkBlack,
                                      offset: Offset(2, 2.5),
                                      blurRadius: 0,
                                    ),
                                  ],
                                ),
                                child: ClipOval(
                                  child: _buildAvatarPreviewWidget(session.avatarConfig, 36),
                                ),
                              ),
                              const SizedBox(width: 16),
                              Expanded(
                                child: Column(
                                  crossAxisAlignment: CrossAxisAlignment.start,
                                  children: [
                                    Row(
                                      children: [
                                        Text(
                                          session.displayName,
                                          style: GoogleFonts.plusJakartaSans(
                                            fontSize: 20,
                                            fontWeight: FontWeight.w900,
                                            color: AppColors.inkBlack,
                                            letterSpacing: -0.4,
                                          ),
                                        ),
                                        if (session.isGuest) ...[
                                          const SizedBox(width: 8),
                                          Container(
                                            padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                                            decoration: BoxDecoration(
                                              color: AppColors.amberSoft,
                                              borderRadius: BorderRadius.circular(999),
                                              border: Border.all(color: AppColors.inkBlack, width: 1.5),
                                            ),
                                            child: Text(
                                              "GUEST",
                                              style: GoogleFonts.plusJakartaSans(
                                                color: AppColors.inkBlack,
                                                fontSize: 10,
                                                fontWeight: FontWeight.w900,
                                              ),
                                            ),
                                          ),
                                        ],
                                      ],
                                    ),
                                    const SizedBox(height: 4),
                                    Text(
                                      "@${session.username}",
                                      style: GoogleFonts.plusJakartaSans(
                                        color: const Color(0xFF71717A),
                                        fontSize: 13,
                                        fontWeight: FontWeight.w600,
                                      ),
                                    ),
                                  ],
                                ),
                              ),
                              NeoButton(
                                text: "Customize",
                                icon: Icons.palette_outlined,
                                backgroundColor: Colors.white,
                                textColor: AppColors.inkBlack,
                                fontSize: 13,
                                padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
                                borderRadius: 12,
                                shadowOffset: const Offset(2, 2.5),
                                onPressed: () => _showAvatarCustomizer(session),
                              ),
                            ],
                          ),
                          const SizedBox(height: 18),
                          const Divider(color: Color(0xFFE8E5DD), height: 1),
                          const SizedBox(height: 14),

                          // Status Selector Row
                          Row(
                            mainAxisAlignment: MainAxisAlignment.spaceBetween,
                            children: [
                              Text(
                                "Presence Status:",
                                style: GoogleFonts.plusJakartaSans(
                                  color: AppColors.inkBlack,
                                  fontSize: 13,
                                  fontWeight: FontWeight.w700,
                                ),
                              ),
                              Container(
                                padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 2),
                                decoration: BoxDecoration(
                                  color: const Color(0xFFF6F4EE),
                                  borderRadius: BorderRadius.circular(10),
                                  border: Border.all(color: AppColors.inkBlack, width: 1.5),
                                ),
                                child: DropdownButton<String>(
                                  value: session.status,
                                  dropdownColor: Colors.white,
                                  underline: const SizedBox(),
                                  icon: const Icon(Icons.arrow_drop_down, color: AppColors.inkBlack),
                                  items: ['available', 'away', 'busy', 'dnd'].map((s) {
                                    return DropdownMenuItem(
                                      value: s,
                                      child: Row(
                                        children: [
                                          Container(
                                            width: 10,
                                            height: 10,
                                            decoration: BoxDecoration(
                                              color: _getStatusColor(s),
                                              shape: BoxShape.circle,
                                              border: Border.all(color: AppColors.inkBlack, width: 1),
                                            ),
                                          ),
                                          const SizedBox(width: 8),
                                          Text(
                                            _getStatusLabel(s),
                                            style: GoogleFonts.plusJakartaSans(
                                              color: AppColors.inkBlack,
                                              fontSize: 13,
                                              fontWeight: FontWeight.w600,
                                            ),
                                          ),
                                        ],
                                      ),
                                    );
                                  }).toList(),
                                  onChanged: (newStatus) {
                                    if (newStatus != null) {
                                      AuthService.updateProfile(
                                        displayName: session.displayName,
                                        status: newStatus,
                                        avatarConfig: session.avatarConfig,
                                      );
                                    }
                                  },
                                ),
                              ),
                            ],
                          ),
                        ],
                      ),
                    ),
                    const SizedBox(height: 24),

                    const SizedBox(height: 28),

                    // Spaces & Headquarters Section Header
                    Row(
                      mainAxisAlignment: MainAxisAlignment.spaceBetween,
                      children: [
                        Row(
                          children: [
                            const Icon(Icons.hub_outlined, color: AppColors.teemPurple, size: 22),
                            const SizedBox(width: 8),
                            Text(
                              "VIRTUAL SPACES",
                              style: GoogleFonts.plusJakartaSans(
                                color: AppColors.inkBlack,
                                fontSize: 14,
                                fontWeight: FontWeight.w900,
                                letterSpacing: 0.5,
                              ),
                            ),
                            const SizedBox(width: 8),
                            Container(
                              padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
                              decoration: BoxDecoration(
                                color: AppColors.teemPurpleSoft,
                                borderRadius: BorderRadius.circular(999),
                                border: Border.all(color: AppColors.inkBlack, width: 1.2),
                              ),
                              child: Text(
                                "${_spaces.length}",
                                style: GoogleFonts.plusJakartaSans(
                                  color: AppColors.teemPurple,
                                  fontSize: 11,
                                  fontWeight: FontWeight.w900,
                                ),
                              ),
                            ),
                          ],
                        ),
                        NeoButton(
                          text: "+ New Space",
                          icon: Icons.add,
                          backgroundColor: Colors.white,
                          textColor: AppColors.inkBlack,
                          fontSize: 12.5,
                          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
                          borderRadius: 12,
                          shadowOffset: const Offset(1.5, 2),
                          onPressed: _showCreateSpaceModal,
                        ),
                      ],
                    ),
                    const SizedBox(height: 14),

                    // Spaces Cards
                    if (_isLoadingSpaces)
                      const Center(
                        child: Padding(
                          padding: EdgeInsets.all(24),
                          child: CircularProgressIndicator(color: AppColors.primary),
                        ),
                      )
                    else
                      ..._spaces.map((space) {
                        return Padding(
                          padding: const EdgeInsets.only(bottom: 20),
                          child: NeoCard(
                            padding: const EdgeInsets.all(24),
                            borderRadius: 24,
                            borderWidth: 2.4,
                            shadowOffset: const Offset(5, 5),
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Row(
                                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                                  children: [
                                    Container(
                                      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                                      decoration: BoxDecoration(
                                        color: const Color(0xFFF6F4EE),
                                        borderRadius: BorderRadius.circular(8),
                                        border: Border.all(color: AppColors.inkBlack, width: 1.5),
                                      ),
                                      child: Text(
                                        space.category.toUpperCase(),
                                        style: GoogleFonts.plusJakartaSans(
                                          color: AppColors.inkBlack,
                                          fontSize: 10.5,
                                          fontWeight: FontWeight.w900,
                                          letterSpacing: 0.5,
                                        ),
                                      ),
                                    ),
                                    Container(
                                      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                                      decoration: BoxDecoration(
                                        color: space.tier.badgeColor.withOpacity(0.2),
                                        borderRadius: BorderRadius.circular(999),
                                        border: Border.all(color: space.tier.badgeColor, width: 1.5),
                                      ),
                                      child: Text(
                                        "${space.tier.badgeText} • ${space.maxCapacity} MAX",
                                        style: GoogleFonts.plusJakartaSans(
                                          color: space.tier.badgeColor == const Color(0xFF10B981)
                                              ? const Color(0xFF047857)
                                              : (space.tier.badgeColor == const Color(0xFFFBBF24)
                                                  ? const Color(0xFFB45309)
                                                  : const Color(0xFF0369A1)),
                                          fontSize: 10.5,
                                          fontWeight: FontWeight.w900,
                                        ),
                                      ),
                                    ),
                                  ],
                                ),
                                const SizedBox(height: 14),
                                Text(
                                  space.name,
                                  style: GoogleFonts.plusJakartaSans(
                                    color: AppColors.inkBlack,
                                    fontSize: 22,
                                    fontWeight: FontWeight.w900,
                                    letterSpacing: -0.4,
                                  ),
                                ),
                                const SizedBox(height: 6),
                                Text(
                                  space.description ?? "Virtual hangout and collaboration headquarters.",
                                  style: GoogleFonts.plusJakartaSans(
                                    color: const Color(0xFF52525B),
                                    fontSize: 13,
                                    height: 1.4,
                                  ),
                                ),
                                const SizedBox(height: 16),
                                Wrap(
                                  spacing: 8,
                                  runSpacing: 8,
                                  children: [
                                    _buildZoneTag(Icons.people, "Up to ${space.maxCapacity} Avatars", const Color(0xFFE0E7FF)),
                                    _buildZoneTag(
                                      space.canCustomizeMap ? Icons.palette : Icons.map_outlined,
                                      space.canCustomizeMap ? "Custom Map Builder (Cloud Sync)" : "Preset 2D Map",
                                      space.canCustomizeMap ? const Color(0xFFFEF3C7) : const Color(0xFFDCFCE7),
                                    ),
                                    _buildZoneTag(Icons.spatial_audio, "Spatial Audio", const Color(0xFFFCE7F3)),
                                  ],
                                ),
                                const SizedBox(height: 20),
                                Row(
                                  children: [
                                    Expanded(
                                      child: NeoButton(
                                        text: "Enter Space",
                                        icon: Icons.explore,
                                        backgroundColor: AppColors.amberButton,
                                        textColor: AppColors.inkBlack,
                                        fontSize: 15,
                                        fontWeight: FontWeight.w900,
                                        padding: const EdgeInsets.symmetric(vertical: 14),
                                        borderRadius: 14,
                                        borderWidth: 2.2,
                                        shadowOffset: const Offset(3, 3),
                                        onPressed: () {
                                          Navigator.of(context).push(
                                            MaterialPageRoute(
                                              builder: (context) => WorldScreen(
                                                displayName: session.displayName,
                                                status: session.status,
                                                avatarConfig: session.avatarConfig,
                                                space: space,
                                              ),
                                            ),
                                          );
                                        },
                                      ),
                                    ),
                                    if (space.tier == SpaceTier.free) ...[
                                      const SizedBox(width: 10),
                                      NeoButton(
                                        text: "Upgrade",
                                        icon: Icons.bolt,
                                        backgroundColor: Colors.white,
                                        textColor: AppColors.inkBlack,
                                        fontSize: 14,
                                        fontWeight: FontWeight.w800,
                                        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
                                        borderRadius: 14,
                                        borderWidth: 2.2,
                                        shadowOffset: const Offset(2.5, 2.5),
                                        onPressed: () => _showUpgradeSpaceModal(space),
                                      ),
                                    ],
                                  ],
                                ),
                              ],
                            ),
                          ),
                        );
                      }),
                  ],
                ),
              ),
            ),
          ),
        );
      },
    );
  }

  Widget _buildZoneTag(IconData icon, String label, Color bgColor) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
      decoration: BoxDecoration(
        color: bgColor,
        borderRadius: BorderRadius.circular(8),
        border: Border.all(color: AppColors.inkBlack, width: 1.5),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(icon, size: 14, color: AppColors.inkBlack),
          const SizedBox(width: 5),
          Text(
            label,
            style: GoogleFonts.plusJakartaSans(
              fontSize: 11.5,
              fontWeight: FontWeight.w700,
              color: AppColors.inkBlack,
            ),
          ),
        ],
      ),
    );
  }
}
