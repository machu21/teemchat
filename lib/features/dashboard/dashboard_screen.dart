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
import '../../core/services/invite_link_service.dart';
import '../../main.dart';

class DashboardScreen extends StatefulWidget {
  const DashboardScreen({super.key});

  @override
  State<DashboardScreen> createState() => _DashboardScreenState();
}

class _DashboardScreenState extends State<DashboardScreen> {
  List<SpaceModel> _spaces = [SpaceModel.defaultHQ()];
  bool _isLoadingSpaces = false;
  bool _isSigningOut = false;
  String? _enteringSpaceId;

  @override
  void initState() {
    super.initState();
    _loadSpaces();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      _checkInviteLink();
    });
  }

  void _checkInviteLink() async {
    try {
      final spaceParam = InviteLinkService.pendingInviteCode ??
          InviteLinkService.extractCodeFromUri(Uri.base);
      if (spaceParam != null && spaceParam.isNotEmpty) {
        debugPrint(">>> [DashboardScreen] Deep link invite parameter found: $spaceParam");
        final space = await SpaceService.getSpaceByCodeOrSlug(spaceParam);
        if (space != null && mounted) {
          // Join the space in database to grant member access/privileges
          await SpaceService.joinSpaceViaInvite(spaceParam);
          InviteLinkService.clearPendingInvite();
          if (!mounted) return;
          final session = AuthService.currentSession;
          Navigator.of(context).push(
            MaterialPageRoute(
              builder: (context) => WorldScreen(
                displayName: session?.displayName ?? 'Explorer',
                status: session?.status ?? 'available',
                avatarConfig: session?.avatarConfig ?? const AvatarConfig(),
                space: space,
              ),
            ),
          );
        } else if (mounted) {
          InviteLinkService.clearPendingInvite();
          ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(
              content: Text("Space not found for '$spaceParam'. Please check the room code or invite link."),
              backgroundColor: const Color(0xFFEF4444),
              duration: const Duration(seconds: 4),
            ),
          );
        }
      }
    } catch (e) {
      debugPrint(">>> [DashboardScreen] Error checking invite link: $e");
    }
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
    final session = AuthService.currentSession;
    final isGuest = session?.isGuest ?? true;
    final isPaid = session?.isPaid ?? false;

    // 1. Guest Check: Guest can only make 1 map and it's temporary
    if (isGuest && SpaceService.hasGuestTemporaryMap) {
      _showGuestLimitModal();
      return;
    }

    // 2. Free Account Check: Free accounts can only make 1 map. Only paid accounts can make multiple maps.
    if (!isGuest && !isPaid) {
      final ownedCount = _spaces.where((s) => s.ownerId != null && s.ownerId == session?.id).length;
      if (ownedCount >= 1) {
        _showUpgradeToPaidModal();
        return;
      }
    }

    final isDark = VirtualWorldApp.isDarkModeNotifier.value;
    final nameController = TextEditingController();
    String category = 'Gaming';
    String mapTheme = 'village';
    bool isCreatingSpace = false;

    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      backgroundColor: isDark ? AppColors.darkCard : Colors.white,
      shape: RoundedRectangleBorder(
        borderRadius: const BorderRadius.vertical(top: Radius.circular(28)),
        side: BorderSide(color: isDark ? Colors.white24 : AppColors.inkBlack, width: 2.5),
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
                            color: isDark ? Colors.white : AppColors.inkBlack,
                            letterSpacing: -0.5,
                          ),
                        ),
                        IconButton(
                          icon: Icon(Icons.close, color: isDark ? Colors.white : AppColors.inkBlack),
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
                        color: isDark ? Colors.white : AppColors.inkBlack,
                      ),
                    ),
                    const SizedBox(height: 6),
                    TextField(
                      controller: nameController,
                      style: GoogleFonts.plusJakartaSans(
                        fontWeight: FontWeight.w700,
                        color: isDark ? Colors.white : AppColors.inkBlack,
                      ),
                      decoration: InputDecoration(
                        hintText: "e.g. Pixel Coffeehouse, Indie Dev Camp",
                        hintStyle: GoogleFonts.plusJakartaSans(
                          fontWeight: FontWeight.w600,
                          color: isDark ? Colors.white38 : const Color(0xFFA1A1AA),
                        ),
                        filled: true,
                        fillColor: isDark ? const Color(0xFF1E293B) : const Color(0xFFF6F4EE),
                        border: OutlineInputBorder(
                          borderRadius: BorderRadius.circular(12),
                          borderSide: BorderSide(color: isDark ? Colors.white24 : AppColors.inkBlack, width: 2),
                        ),
                        enabledBorder: OutlineInputBorder(
                          borderRadius: BorderRadius.circular(12),
                          borderSide: BorderSide(color: isDark ? Colors.white24 : AppColors.inkBlack, width: 2),
                        ),
                        focusedBorder: const OutlineInputBorder(
                          borderRadius: BorderRadius.all(Radius.circular(12)),
                          borderSide: BorderSide(color: AppColors.teemPurple, width: 2.2),
                        ),
                      ),
                    ),
                    const SizedBox(height: 16),
                    Text(
                      "Category",
                      style: GoogleFonts.plusJakartaSans(
                        fontWeight: FontWeight.w800,
                        fontSize: 13,
                        color: isDark ? Colors.white : AppColors.inkBlack,
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
                              color: isSel ? Colors.white : (isDark ? Colors.white70 : AppColors.inkBlack),
                              fontSize: 12,
                            ),
                          ),
                          selected: isSel,
                          selectedColor: AppColors.teemPurple,
                          backgroundColor: isDark ? const Color(0xFF1E293B) : const Color(0xFFF6F4EE),
                          side: BorderSide(
                            color: isSel
                                ? AppColors.teemPurple
                                : (isDark ? Colors.white24 : AppColors.inkBlack),
                            width: 1.5,
                          ),
                          onSelected: (_) => setModalState(() => category = cat),
                        );
                      }).toList(),
                    ),
                    const SizedBox(height: 16),
                    Text(
                      "Map Theme & Atmosphere",
                      style: GoogleFonts.plusJakartaSans(
                        fontWeight: FontWeight.w800,
                        fontSize: 13,
                        color: isDark ? Colors.white : AppColors.inkBlack,
                      ),
                    ),
                    const SizedBox(height: 8),
                    Wrap(
                      spacing: 8,
                      runSpacing: 8,
                      children: [
                        ('village', '🌿 Verdant Village'),
                        ('beach', '🏖️ Crystal Bay Beach'),
                        ('forest', '🌲 Whispering Woods'),
                        ('lounge', '🕹️ Retro Arcade Lounge'),
                      ].map((theme) {
                        final isSel = mapTheme == theme.$1;
                        return ChoiceChip(
                          label: Text(
                            theme.$2,
                            style: GoogleFonts.plusJakartaSans(
                              fontWeight: FontWeight.w800,
                              color: isSel ? Colors.white : (isDark ? Colors.white70 : AppColors.inkBlack),
                              fontSize: 12,
                            ),
                          ),
                          selected: isSel,
                          selectedColor: const Color(0xFF10B981),
                          backgroundColor: isDark ? const Color(0xFF1E293B) : const Color(0xFFF6F4EE),
                          side: BorderSide(
                            color: isSel
                                ? const Color(0xFF10B981)
                                : (isDark ? Colors.white24 : AppColors.inkBlack),
                            width: 1.5,
                          ),
                          onSelected: (_) => setModalState(() => mapTheme = theme.$1),
                        );
                      }).toList(),
                    ),
                    const SizedBox(height: 24),
                    NeoButton(
                      text: isGuest ? "Launch Temporary Map" : "Launch Space",
                      loadingText: "Launching Space...",
                      isLoading: isCreatingSpace,
                      icon: Icons.rocket_launch,
                      backgroundColor: AppColors.amberButton,
                      textColor: AppColors.inkBlack,
                      fontSize: 15,
                      fontWeight: FontWeight.w900,
                      borderRadius: 14,
                      borderWidth: 2.2,
                      shadowOffset: const Offset(2.5, 3),
                      isFullWidth: true,
                      onPressed: isCreatingSpace
                          ? null
                          : () async {
                              final name = nameController.text.trim();
                              if (name.isEmpty) return;
                              debugPrint(">>> [DashboardScreen] Creating map '$name' (category: $category, theme: $mapTheme)...");
                              setModalState(() => isCreatingSpace = true);
                              try {
                                final slug = name.toLowerCase().replaceAll(RegExp(r'[^a-z0-9]'), '-');
                                final created = await SpaceService.createSpace(
                                  name: name,
                                  slug: "$slug-${DateTime.now().millisecondsSinceEpoch % 1000}",
                                  category: category,
                                  mapTheme: mapTheme,
                                );
                                if (created != null && mounted) {
                                  debugPrint(">>> [DashboardScreen] Map created successfully: ${created.name} (${created.id})");
                                  Navigator.pop(context);
                                  _loadSpaces();
                                }
                              } catch (e) {
                                if (mounted) {
                                  ScaffoldMessenger.of(context).showSnackBar(
                                    SnackBar(
                                      content: Text(e.toString().replaceAll("Exception: ", "")),
                                      backgroundColor: const Color(0xFFEF4444),
                                    ),
                                  );
                                }
                              } finally {
                                if (mounted) {
                                  setModalState(() => isCreatingSpace = false);
                                }
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

  void _showEditSpaceModal(SpaceModel space) {
    final isDark = VirtualWorldApp.isDarkModeNotifier.value;
    final nameController = TextEditingController(text: space.name);
    final descController = TextEditingController(text: space.description ?? '');
    String category = space.category;
    String mapTheme = space.mapTheme;
    bool isUpdating = false;

    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      backgroundColor: isDark ? AppColors.darkCard : Colors.white,
      shape: RoundedRectangleBorder(
        borderRadius: const BorderRadius.vertical(top: Radius.circular(28)),
        side: BorderSide(color: isDark ? Colors.white24 : AppColors.inkBlack, width: 2.5),
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
                          "Edit Space & Map",
                          style: GoogleFonts.plusJakartaSans(
                            fontSize: 22,
                            fontWeight: FontWeight.w900,
                            color: isDark ? Colors.white : AppColors.inkBlack,
                            letterSpacing: -0.5,
                          ),
                        ),
                        IconButton(
                          icon: Icon(Icons.close, color: isDark ? Colors.white : AppColors.inkBlack),
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
                        color: isDark ? Colors.white : AppColors.inkBlack,
                      ),
                    ),
                    const SizedBox(height: 6),
                    TextField(
                      controller: nameController,
                      style: GoogleFonts.plusJakartaSans(
                        fontWeight: FontWeight.w700,
                        color: isDark ? Colors.white : AppColors.inkBlack,
                      ),
                      decoration: InputDecoration(
                        filled: true,
                        fillColor: isDark ? const Color(0xFF1E293B) : const Color(0xFFF6F4EE),
                        border: OutlineInputBorder(
                          borderRadius: BorderRadius.circular(12),
                          borderSide: BorderSide(color: isDark ? Colors.white24 : AppColors.inkBlack, width: 2),
                        ),
                        enabledBorder: OutlineInputBorder(
                          borderRadius: BorderRadius.circular(12),
                          borderSide: BorderSide(color: isDark ? Colors.white24 : AppColors.inkBlack, width: 2),
                        ),
                      ),
                    ),
                    const SizedBox(height: 14),
                    Text(
                      "Description",
                      style: GoogleFonts.plusJakartaSans(
                        fontWeight: FontWeight.w800,
                        fontSize: 13,
                        color: isDark ? Colors.white : AppColors.inkBlack,
                      ),
                    ),
                    const SizedBox(height: 6),
                    TextField(
                      controller: descController,
                      style: GoogleFonts.plusJakartaSans(
                        fontWeight: FontWeight.w700,
                        color: isDark ? Colors.white : AppColors.inkBlack,
                      ),
                      decoration: InputDecoration(
                        hintText: "What is this space for?",
                        filled: true,
                        fillColor: isDark ? const Color(0xFF1E293B) : const Color(0xFFF6F4EE),
                        border: OutlineInputBorder(
                          borderRadius: BorderRadius.circular(12),
                          borderSide: BorderSide(color: isDark ? Colors.white24 : AppColors.inkBlack, width: 2),
                        ),
                        enabledBorder: OutlineInputBorder(
                          borderRadius: BorderRadius.circular(12),
                          borderSide: BorderSide(color: isDark ? Colors.white24 : AppColors.inkBlack, width: 2),
                        ),
                      ),
                    ),
                    const SizedBox(height: 16),
                    Text(
                      "Category",
                      style: GoogleFonts.plusJakartaSans(
                        fontWeight: FontWeight.w800,
                        fontSize: 13,
                        color: isDark ? Colors.white : AppColors.inkBlack,
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
                              color: isSel ? Colors.white : (isDark ? Colors.white70 : AppColors.inkBlack),
                              fontSize: 12,
                            ),
                          ),
                          selected: isSel,
                          selectedColor: AppColors.teemPurple,
                          backgroundColor: isDark ? const Color(0xFF1E293B) : const Color(0xFFF6F4EE),
                          side: BorderSide(
                            color: isSel ? AppColors.teemPurple : (isDark ? Colors.white24 : AppColors.inkBlack),
                            width: 1.5,
                          ),
                          onSelected: (_) => setModalState(() => category = cat),
                        );
                      }).toList(),
                    ),
                    const SizedBox(height: 16),
                    Text(
                      "Map Theme & Atmosphere",
                      style: GoogleFonts.plusJakartaSans(
                        fontWeight: FontWeight.w800,
                        fontSize: 13,
                        color: isDark ? Colors.white : AppColors.inkBlack,
                      ),
                    ),
                    const SizedBox(height: 8),
                    Wrap(
                      spacing: 8,
                      runSpacing: 8,
                      children: [
                        ('village', '🌿 Verdant Village'),
                        ('beach', '🏖️ Crystal Bay Beach'),
                        ('forest', '🌲 Whispering Woods'),
                        ('lounge', '🕹️ Retro Arcade Lounge'),
                      ].map((theme) {
                        final isSel = mapTheme == theme.$1;
                        return ChoiceChip(
                          label: Text(
                            theme.$2,
                            style: GoogleFonts.plusJakartaSans(
                              fontWeight: FontWeight.w800,
                              color: isSel ? Colors.white : (isDark ? Colors.white70 : AppColors.inkBlack),
                              fontSize: 12,
                            ),
                          ),
                          selected: isSel,
                          selectedColor: const Color(0xFF10B981),
                          backgroundColor: isDark ? const Color(0xFF1E293B) : const Color(0xFFF6F4EE),
                          side: BorderSide(
                            color: isSel ? const Color(0xFF10B981) : (isDark ? Colors.white24 : AppColors.inkBlack),
                            width: 1.5,
                          ),
                          onSelected: (_) => setModalState(() => mapTheme = theme.$1),
                        );
                      }).toList(),
                    ),
                    const SizedBox(height: 24),
                    NeoButton(
                      text: "Save Changes",
                      loadingText: "Saving...",
                      isLoading: isUpdating,
                      icon: Icons.check,
                      backgroundColor: AppColors.primary,
                      textColor: AppColors.inkBlack,
                      fontSize: 15,
                      fontWeight: FontWeight.w900,
                      borderRadius: 14,
                      borderWidth: 2.2,
                      shadowOffset: const Offset(2.5, 3),
                      isFullWidth: true,
                      onPressed: isUpdating
                          ? null
                          : () async {
                              final name = nameController.text.trim();
                              if (name.isEmpty) return;
                              setModalState(() => isUpdating = true);
                              try {
                                final updated = await SpaceService.updateSpace(
                                  id: space.id,
                                  name: name,
                                  description: descController.text.trim(),
                                  category: category,
                                  mapTheme: mapTheme,
                                );
                                if (mounted) {
                                  Navigator.pop(context);
                                  _loadSpaces();
                                  ScaffoldMessenger.of(context).showSnackBar(
                                    SnackBar(
                                      content: Text("Updated '${updated?.name ?? name}' successfully!"),
                                      backgroundColor: const Color(0xFF10B981),
                                    ),
                                  );
                                }
                              } finally {
                                if (mounted) setModalState(() => isUpdating = false);
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

  void _showDeleteSpaceDialog(SpaceModel space) {
    final isDark = VirtualWorldApp.isDarkModeNotifier.value;
    bool isDeleting = false;

    showDialog(
      context: context,
      builder: (context) {
        return StatefulBuilder(
          builder: (context, setDialogState) {
            return Dialog(
              backgroundColor: Colors.transparent,
              child: Container(
                width: 400,
                padding: const EdgeInsets.all(24),
                decoration: BoxDecoration(
                  color: isDark ? AppColors.darkCard : Colors.white,
                  borderRadius: BorderRadius.circular(24),
                  border: Border.all(color: const Color(0xFFEF4444), width: 2.5),
                  boxShadow: const [
                    BoxShadow(color: Colors.black45, blurRadius: 18, offset: Offset(4, 4)),
                  ],
                ),
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    Row(
                      children: [
                        Container(
                          padding: const EdgeInsets.all(8),
                          decoration: BoxDecoration(
                            color: const Color(0xFFEF4444).withOpacity(0.15),
                            borderRadius: BorderRadius.circular(12),
                          ),
                          child: const Icon(Icons.delete_forever, color: Color(0xFFEF4444), size: 24),
                        ),
                        const SizedBox(width: 12),
                        Expanded(
                          child: Text(
                            space.isTemporary ? "Discard Temporary Map?" : "Delete Map Space?",
                            style: GoogleFonts.plusJakartaSans(
                              fontSize: 18,
                              fontWeight: FontWeight.w900,
                              color: isDark ? Colors.white : AppColors.inkBlack,
                            ),
                          ),
                        ),
                      ],
                    ),
                    const SizedBox(height: 14),
                    Text(
                      space.isTemporary
                          ? "Are you sure you want to discard your temporary guest map \"${space.name}\"? You will then be able to create a new temporary map."
                          : "Are you sure you want to permanently delete \"${space.name}\"? All furniture items and playlists in this space will be deleted.",
                      style: GoogleFonts.plusJakartaSans(
                        fontSize: 13,
                        color: isDark ? Colors.white70 : const Color(0xFF52525B),
                        height: 1.4,
                      ),
                    ),
                    const SizedBox(height: 22),
                    Row(
                      children: [
                        Expanded(
                          child: OutlinedButton(
                            style: OutlinedButton.styleFrom(
                              foregroundColor: isDark ? Colors.white : AppColors.inkBlack,
                              side: BorderSide(color: isDark ? Colors.white24 : AppColors.inkBlack, width: 2),
                              padding: const EdgeInsets.symmetric(vertical: 12),
                              shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                            ),
                            onPressed: () => Navigator.pop(context),
                            child: const Text("Cancel", style: TextStyle(fontWeight: FontWeight.bold)),
                          ),
                        ),
                        const SizedBox(width: 12),
                        Expanded(
                          child: ElevatedButton(
                            style: ElevatedButton.styleFrom(
                              backgroundColor: const Color(0xFFEF4444),
                              foregroundColor: Colors.white,
                              padding: const EdgeInsets.symmetric(vertical: 12),
                              shape: RoundedRectangleBorder(
                                borderRadius: BorderRadius.circular(12),
                                side: const BorderSide(color: AppColors.inkBlack, width: 2),
                              ),
                            ),
                            onPressed: isDeleting
                                ? null
                                : () async {
                                    setDialogState(() => isDeleting = true);
                                    try {
                                      final ok = await SpaceService.deleteSpace(space.id);
                                      if (mounted) {
                                        Navigator.pop(context);
                                        if (ok) {
                                          _loadSpaces();
                                          ScaffoldMessenger.of(context).showSnackBar(
                                            SnackBar(
                                              content: Text("Deleted space \"${space.name}\"."),
                                              backgroundColor: const Color(0xFFEF4444),
                                            ),
                                          );
                                        } else {
                                          ScaffoldMessenger.of(context).showSnackBar(
                                            const SnackBar(
                                              content: Text("Could not delete space. Ensure you are the owner."),
                                              backgroundColor: Colors.redAccent,
                                            ),
                                          );
                                        }
                                      }
                                    } finally {
                                      if (mounted) setDialogState(() => isDeleting = false);
                                    }
                                  },
                            child: isDeleting
                                ? const SizedBox(
                                    width: 16,
                                    height: 16,
                                    child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white),
                                  )
                                : const Text("Delete", style: TextStyle(fontWeight: FontWeight.w900)),
                          ),
                        ),
                      ],
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

  void _showJoinSpaceModal() {
    final isDark = VirtualWorldApp.isDarkModeNotifier.value;
    final codeController = TextEditingController();
    bool isSearching = false;
    String? errorMessage;

    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      backgroundColor: isDark ? AppColors.darkCard : Colors.white,
      shape: RoundedRectangleBorder(
        borderRadius: const BorderRadius.vertical(top: Radius.circular(28)),
        side: BorderSide(color: isDark ? Colors.white24 : AppColors.inkBlack, width: 2.5),
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
              child: Column(
                mainAxisSize: MainAxisSize.min,
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      Row(
                        children: [
                          Container(
                            padding: const EdgeInsets.all(8),
                            decoration: BoxDecoration(
                              color: AppColors.primary.withOpacity(0.2),
                              borderRadius: BorderRadius.circular(12),
                              border: Border.all(color: AppColors.primary, width: 1.5),
                            ),
                            child: const Icon(Icons.link, color: AppColors.primary, size: 22),
                          ),
                          const SizedBox(width: 12),
                          Text(
                            "Join Virtual Space",
                            style: GoogleFonts.plusJakartaSans(
                              fontSize: 20,
                              fontWeight: FontWeight.w900,
                              color: isDark ? Colors.white : AppColors.inkBlack,
                            ),
                          ),
                        ],
                      ),
                      IconButton(
                        icon: Icon(Icons.close, color: isDark ? Colors.white : AppColors.inkBlack),
                        onPressed: () => Navigator.pop(context),
                      ),
                    ],
                  ),
                  const SizedBox(height: 14),
                  Text(
                    "Paste an invite link or enter a room code / slug to enter your friend's space.",
                    style: GoogleFonts.plusJakartaSans(
                      color: isDark ? Colors.white70 : const Color(0xFF52525B),
                      fontSize: 13,
                    ),
                  ),
                  const SizedBox(height: 16),
                  TextField(
                    controller: codeController,
                    autofocus: true,
                    style: GoogleFonts.plusJakartaSans(
                      fontWeight: FontWeight.w700,
                      color: isDark ? Colors.white : AppColors.inkBlack,
                    ),
                    decoration: InputDecoration(
                      hintText: "e.g. main-hq, space slug, or paste full invite URL",
                      hintStyle: GoogleFonts.plusJakartaSans(
                        color: isDark ? Colors.white38 : const Color(0xFFA1A1AA),
                      ),
                      filled: true,
                      fillColor: isDark ? const Color(0xFF1E293B) : const Color(0xFFF6F4EE),
                      border: OutlineInputBorder(
                        borderRadius: BorderRadius.circular(12),
                        borderSide: BorderSide(color: isDark ? Colors.white24 : AppColors.inkBlack, width: 2),
                      ),
                      enabledBorder: OutlineInputBorder(
                        borderRadius: BorderRadius.circular(12),
                        borderSide: BorderSide(color: isDark ? Colors.white24 : AppColors.inkBlack, width: 2),
                      ),
                    ),
                  ),
                  if (errorMessage != null) ...[
                    const SizedBox(height: 8),
                    Text(
                      errorMessage!,
                      style: const TextStyle(color: Color(0xFFEF4444), fontSize: 12, fontWeight: FontWeight.bold),
                    ),
                  ],
                  const SizedBox(height: 20),
                  NeoButton(
                    text: "Join Space",
                    loadingText: "Searching Space...",
                    isLoading: isSearching,
                    icon: Icons.login,
                    backgroundColor: AppColors.primary,
                    textColor: AppColors.inkBlack,
                    fontSize: 15,
                    fontWeight: FontWeight.w900,
                    borderRadius: 14,
                    borderWidth: 2.2,
                    shadowOffset: const Offset(2.5, 3),
                    isFullWidth: true,
                    onPressed: isSearching
                        ? null
                        : () async {
                            final raw = codeController.text.trim();
                            if (raw.isEmpty) return;
                            setModalState(() {
                              isSearching = true;
                              errorMessage = null;
                            });

                            // Extract space query if a URL was pasted
                            final query = InviteLinkService.extractCode(raw) ?? raw;

                            try {
                              final space = await SpaceService.getSpaceByCodeOrSlug(query);
                              if (space != null && mounted) {
                                // Join the space in database to grant member access/privileges
                                await SpaceService.joinSpaceViaInvite(query);
                                if (!mounted) return;
                                Navigator.pop(context);
                                final session = AuthService.currentSession;
                                Navigator.of(context).push(
                                  MaterialPageRoute(
                                    builder: (context) => WorldScreen(
                                      displayName: session?.displayName ?? 'Explorer',
                                      status: session?.status ?? 'available',
                                      avatarConfig: session?.avatarConfig ?? const AvatarConfig(),
                                      space: space,
                                    ),
                                  ),
                                );
                              } else if (mounted) {
                                setModalState(() {
                                  errorMessage = "Space not found for '$query'. Please check the code or link.";
                                });
                              }
                            } finally {
                              if (mounted) setModalState(() => isSearching = false);
                            }
                          },
                  ),
                ],
              ),
            );
          },
        );
      },
    );
  }

  void _showGuestLimitModal() {
    final isDark = VirtualWorldApp.isDarkModeNotifier.value;
    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      backgroundColor: isDark ? AppColors.darkCard : Colors.white,
      shape: RoundedRectangleBorder(
        borderRadius: const BorderRadius.vertical(top: Radius.circular(28)),
        side: BorderSide(color: isDark ? Colors.white24 : AppColors.inkBlack, width: 2.5),
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
                    "Guest Map Limit Reached",
                    style: GoogleFonts.plusJakartaSans(
                      fontSize: 20,
                      fontWeight: FontWeight.w900,
                      color: isDark ? Colors.white : AppColors.inkBlack,
                      letterSpacing: -0.5,
                    ),
                  ),
                  IconButton(
                    icon: Icon(Icons.close, color: isDark ? Colors.white : AppColors.inkBlack),
                    onPressed: () => Navigator.pop(context),
                  ),
                ],
              ),
              const SizedBox(height: 12),
              Container(
                padding: const EdgeInsets.all(14),
                decoration: BoxDecoration(
                  color: const Color(0xFFFEF3C7),
                  borderRadius: BorderRadius.circular(14),
                  border: Border.all(color: const Color(0xFFB45309), width: 1.5),
                ),
                child: Row(
                  children: [
                    const Icon(Icons.timer_outlined, color: Color(0xFFB45309), size: 24),
                    const SizedBox(width: 10),
                    Expanded(
                      child: Text(
                        "Guests can only make 1 temporary map at a time. Your temporary map cannot be saved and will be deleted when you quit or sign out.",
                        style: GoogleFonts.plusJakartaSans(
                          color: const Color(0xFF78350F),
                          fontSize: 13,
                          fontWeight: FontWeight.w700,
                          height: 1.4,
                        ),
                      ),
                    ),
                  ],
                ),
              ),
              const SizedBox(height: 16),
              Text(
                "You already have an active temporary map: \"${SpaceService.guestMapName ?? 'Temporary Map'}\".\n\nTo make a new map, you can delete your current temporary map, or upgrade to a Paid Account to create multiple permanent spaces that never get erased!",
                style: GoogleFonts.plusJakartaSans(
                  color: isDark ? Colors.white70 : const Color(0xFF52525B),
                  fontSize: 13.5,
                  height: 1.4,
                ),
              ),
              const SizedBox(height: 20),
              NeoButton(
                text: "Upgrade to Paid Account",
                icon: Icons.star,
                backgroundColor: AppColors.amberButton,
                textColor: AppColors.inkBlack,
                fontSize: 14,
                fontWeight: FontWeight.w900,
                borderRadius: 14,
                isFullWidth: true,
                onPressed: () async {
                  Navigator.pop(context);
                  await AuthService.upgradeToPaid();
                  if (mounted) {
                    ScaffoldMessenger.of(context).showSnackBar(
                      const SnackBar(
                        content: Text("Upgraded to Paid Account! You can now create multiple permanent spaces."),
                        backgroundColor: Color(0xFF10B981),
                      ),
                    );
                    _loadSpaces();
                  }
                },
              ),
              const SizedBox(height: 10),
              NeoButton(
                text: "Keep Current Temporary Map",
                backgroundColor: isDark ? const Color(0xFF1E293B) : Colors.white,
                textColor: isDark ? Colors.white : AppColors.inkBlack,
                borderColor: isDark ? Colors.white24 : AppColors.inkBlack,
                fontSize: 13,
                fontWeight: FontWeight.w800,
                borderRadius: 14,
                isFullWidth: true,
                onPressed: () => Navigator.pop(context),
              ),
            ],
          ),
        );
      },
    );
  }

  void _showUpgradeToPaidModal() {
    final isDark = VirtualWorldApp.isDarkModeNotifier.value;
    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      backgroundColor: isDark ? AppColors.darkCard : Colors.white,
      shape: RoundedRectangleBorder(
        borderRadius: const BorderRadius.vertical(top: Radius.circular(28)),
        side: BorderSide(color: isDark ? Colors.white24 : AppColors.inkBlack, width: 2.5),
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
                    "Paid Account Required",
                    style: GoogleFonts.plusJakartaSans(
                      fontSize: 20,
                      fontWeight: FontWeight.w900,
                      color: isDark ? Colors.white : AppColors.inkBlack,
                      letterSpacing: -0.5,
                    ),
                  ),
                  IconButton(
                    icon: Icon(Icons.close, color: isDark ? Colors.white : AppColors.inkBlack),
                    onPressed: () => Navigator.pop(context),
                  ),
                ],
              ),
              const SizedBox(height: 12),
              Text(
                "Only paid accounts can make multiple maps. Free accounts are limited to 1 permanent virtual space.",
                style: GoogleFonts.plusJakartaSans(
                  color: isDark ? Colors.white70 : const Color(0xFF52525B),
                  fontSize: 13.5,
                  height: 1.4,
                ),
              ),
              const SizedBox(height: 16),
              Container(
                padding: const EdgeInsets.all(16),
                decoration: BoxDecoration(
                  color: isDark ? const Color(0xFF1E293B) : const Color(0xFFFEF3C7),
                  borderRadius: BorderRadius.circular(16),
                  border: Border.all(color: isDark ? Colors.white24 : AppColors.inkBlack, width: 2),
                ),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      "PAID MEMBER BENEFITS",
                      style: GoogleFonts.plusJakartaSans(
                        fontSize: 14,
                        fontWeight: FontWeight.w900,
                        color: isDark ? Colors.white : AppColors.inkBlack,
                      ),
                    ),
                    const SizedBox(height: 8),
                    Text(
                      "• Create unlimited permanent spaces & custom map themes\n• Personal AI Companion with proactive memory & voice\n• Upload MP3 playlists for Sound Tripping\n• Spatial voice rooms with higher concurrent explorer limits",
                      style: GoogleFonts.plusJakartaSans(
                        color: isDark ? Colors.white70 : AppColors.inkBlack,
                        fontSize: 13,
                        height: 1.5,
                      ),
                    ),
                  ],
                ),
              ),
              const SizedBox(height: 20),
              NeoButton(
                text: "Upgrade Account (Unlimited Maps)",
                icon: Icons.star,
                backgroundColor: AppColors.amberButton,
                textColor: AppColors.inkBlack,
                fontSize: 14.5,
                fontWeight: FontWeight.w900,
                borderRadius: 14,
                isFullWidth: true,
                onPressed: () async {
                  Navigator.pop(context);
                  await AuthService.upgradeToPaid();
                  if (mounted) {
                    ScaffoldMessenger.of(context).showSnackBar(
                      const SnackBar(
                        content: Text("Account upgraded to Paid! You can now create unlimited spaces."),
                        backgroundColor: Color(0xFF10B981),
                      ),
                    );
                    _loadSpaces();
                  }
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
    final isDark = VirtualWorldApp.isDarkModeNotifier.value;
    AvatarConfig tempConfig = session.avatarConfig;
    bool isSaving = false;

    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      backgroundColor: isDark ? AppColors.darkCard : Colors.white,
      shape: RoundedRectangleBorder(
        borderRadius: const BorderRadius.vertical(top: Radius.circular(28)),
        side: BorderSide(color: isDark ? Colors.white24 : AppColors.inkBlack, width: 2.5),
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
                            color: isDark ? Colors.white : AppColors.inkBlack,
                            letterSpacing: -0.5,
                          ),
                        ),
                        IconButton(
                          icon: Icon(Icons.close, color: isDark ? Colors.white : AppColors.inkBlack),
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
                          color: isDark ? const Color(0xFF1E293B) : AppColors.creamBg,
                          borderRadius: BorderRadius.circular(20),
                          border: Border.all(color: isDark ? Colors.white24 : AppColors.inkBlack, width: 2),
                          boxShadow: [
                            BoxShadow(
                              color: isDark ? Colors.black54 : AppColors.inkBlack,
                              offset: const Offset(2, 2.5),
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
                                color: isDark ? Colors.white : AppColors.inkBlack,
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
                        color: isDark ? Colors.white : AppColors.inkBlack,
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
                                color: isSelected
                                    ? (isDark ? Colors.white : AppColors.inkBlack)
                                    : (isDark ? Colors.white30 : Colors.black26),
                                width: isSelected ? 3.2 : 1.5,
                              ),
                              boxShadow: isSelected
                                  ? [
                                      BoxShadow(
                                        color: isDark ? Colors.black54 : AppColors.inkBlack,
                                        offset: const Offset(1.5, 2),
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
                        color: isDark ? Colors.white : AppColors.inkBlack,
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
                                color: isSelected
                                    ? (isDark ? Colors.white : AppColors.inkBlack)
                                    : (isDark ? Colors.white30 : Colors.black26),
                                width: isSelected ? 3.2 : 1.5,
                              ),
                              boxShadow: isSelected
                                  ? [
                                      BoxShadow(
                                        color: isDark ? Colors.black54 : AppColors.inkBlack,
                                        offset: const Offset(1.5, 2),
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
                        color: isDark ? Colors.white : AppColors.inkBlack,
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
                                color: isSelected
                                    ? (isDark ? Colors.white : AppColors.inkBlack)
                                    : (isDark ? Colors.white30 : Colors.black26),
                                width: isSelected ? 3.2 : 1.5,
                              ),
                              boxShadow: isSelected
                                  ? [
                                      BoxShadow(
                                        color: isDark ? Colors.black54 : AppColors.inkBlack,
                                        offset: const Offset(1.5, 2),
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
                        color: isDark ? Colors.white : AppColors.inkBlack,
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
                                  color: isSelected
                                      ? (isDark ? AppColors.teemPurple : AppColors.inkBlack)
                                      : (isDark ? const Color(0xFF1E293B) : Colors.white),
                                  borderRadius: BorderRadius.circular(10),
                                  border: Border.all(
                                    color: isSelected
                                        ? (isDark ? const Color(0xFF818CF8) : AppColors.inkBlack)
                                        : (isDark ? Colors.white24 : AppColors.inkBlack),
                                    width: 2,
                                  ),
                                ),
                                child: Text(
                                  style.toUpperCase(),
                                  textAlign: TextAlign.center,
                                  style: GoogleFonts.plusJakartaSans(
                                    color: isSelected
                                        ? Colors.white
                                        : (isDark ? Colors.white70 : AppColors.inkBlack),
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
                        color: isDark ? Colors.white : AppColors.inkBlack,
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
                                  color: isSelected
                                      ? (isDark ? const Color(0xFF312E81) : AppColors.teemPurpleSoft)
                                      : (isDark ? const Color(0xFF1E293B) : Colors.white),
                                  borderRadius: BorderRadius.circular(10),
                                  border: Border.all(
                                    color: isSelected
                                        ? (isDark ? const Color(0xFF818CF8) : AppColors.teemPurple)
                                        : (isDark ? Colors.white24 : AppColors.inkBlack),
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
                                        color: isSelected
                                            ? (isDark ? const Color(0xFFA5B4FC) : AppColors.teemPurpleDark)
                                            : (isDark ? Colors.white70 : AppColors.inkBlack),
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
                      loadingText: "Saving...",
                      isLoading: isSaving,
                      backgroundColor: AppColors.amberButton,
                      textColor: AppColors.inkBlack,
                      fontSize: 15,
                      fontWeight: FontWeight.w900,
                      borderRadius: 14,
                      borderWidth: 2.2,
                      shadowOffset: const Offset(2.5, 3),
                      isFullWidth: true,
                      onPressed: isSaving
                          ? null
                          : () async {
                              setModalState(() => isSaving = true);
                              try {
                                await AuthService.updateProfile(
                                  displayName: session.displayName,
                                  status: session.status,
                                  avatarConfig: tempConfig,
                                );
                                if (mounted) Navigator.pop(context);
                              } finally {
                                if (mounted) {
                                  setModalState(() => isSaving = false);
                                }
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

  Widget _buildAvatarPreviewWidget(AvatarConfig config, double radius) {
    return PixelAvatarWidget(config: config, size: radius * 2);
  }

  @override
  Widget build(BuildContext context) {
    return ValueListenableBuilder<bool>(
      valueListenable: VirtualWorldApp.isDarkModeNotifier,
      builder: (context, isDark, _) {
        return ValueListenableBuilder<UserSession?>(
          valueListenable: AuthService.sessionNotifier,
          builder: (context, session, _) {
            if (session == null) {
              return Scaffold(
                backgroundColor: isDark ? AppColors.darkBg : AppColors.background,
                body: const Center(child: CircularProgressIndicator(color: AppColors.primary)),
              );
            }

            return Scaffold(
              backgroundColor: isDark ? AppColors.darkBg : AppColors.creamBg,
              appBar: AppBar(
                backgroundColor: isDark ? AppColors.darkBg : AppColors.creamBg,
                elevation: 0,
                bottom: PreferredSize(
                  preferredSize: const Size.fromHeight(1.5),
                  child: Divider(
                    height: 1.5,
                    color: isDark ? Colors.white12 : const Color(0xFFE8E5DD),
                  ),
                ),
                title: Row(
                  children: [
                    Container(
                      width: 34,
                      height: 34,
                      decoration: BoxDecoration(
                        shape: BoxShape.circle,
                        color: isDark ? AppColors.darkCard : const Color(0xFFF6F4EE),
                        border: Border.all(
                          color: isDark ? Colors.white24 : AppColors.inkBlack,
                          width: 2,
                        ),
                        boxShadow: [
                          BoxShadow(
                            color: isDark ? Colors.black54 : AppColors.inkBlack,
                            offset: const Offset(1.5, 2),
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
                          color: isDark ? Colors.white : AppColors.inkBlack,
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
                      padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                      decoration: BoxDecoration(
                        color: isDark ? AppColors.darkHeroMagenta.withOpacity(0.2) : AppColors.amberButton,
                        borderRadius: BorderRadius.circular(6),
                        border: Border.all(
                          color: isDark ? AppColors.darkHeroMagenta : AppColors.inkBlack,
                          width: 1.5,
                        ),
                        boxShadow: [
                          BoxShadow(
                            color: isDark ? AppColors.darkHeroMagenta : AppColors.inkBlack,
                            offset: const Offset(1.5, 1.5),
                          ),
                        ],
                      ),
                      child: Text(
                        "BETA",
                        style: GoogleFonts.plusJakartaSans(
                          fontSize: 9.5,
                          fontWeight: FontWeight.w900,
                          color: isDark ? AppColors.darkHeroMagenta : AppColors.inkBlack,
                          letterSpacing: 0.6,
                        ),
                      ),
                    ),
                    const SizedBox(width: 8),
                    Container(
                      padding: const EdgeInsets.symmetric(horizontal: 7, vertical: 2),
                      decoration: BoxDecoration(
                        color: isDark ? const Color(0xFF312E81) : AppColors.teemPurpleSoft,
                        borderRadius: BorderRadius.circular(6),
                        border: Border.all(
                          color: isDark ? const Color(0xFF6366F1) : AppColors.teemPurpleLight.withOpacity(0.5),
                        ),
                      ),
                      child: Text(
                        "WORLD LOBBY",
                        style: GoogleFonts.plusJakartaSans(
                          fontSize: 9.5,
                          fontWeight: FontWeight.w800,
                          color: isDark ? const Color(0xFFA5B4FC) : AppColors.teemPurple,
                          letterSpacing: 0.8,
                        ),
                      ),
                    ),
                  ],
                ),
                actions: [
                  // Dark Mode Theme Toggle Button
                  MouseRegion(
                    cursor: SystemMouseCursors.click,
                    child: GestureDetector(
                      onTap: () {
                        VirtualWorldApp.isDarkModeNotifier.value = !isDark;
                      },
                      child: Container(
                        width: 38,
                        height: 38,
                        decoration: BoxDecoration(
                          color: isDark ? AppColors.darkCard : Colors.white,
                          shape: BoxShape.circle,
                          border: Border.all(
                            color: isDark ? Colors.white30 : AppColors.inkBlack,
                            width: 1.8,
                          ),
                          boxShadow: [
                            BoxShadow(
                              color: isDark ? Colors.black54 : AppColors.inkBlack,
                              offset: const Offset(1.5, 2),
                              blurRadius: 0,
                            ),
                          ],
                        ),
                        child: Icon(
                          isDark ? Icons.wb_sunny_outlined : Icons.nightlight_round,
                          size: 18,
                          color: isDark ? const Color(0xFFFDE047) : AppColors.inkBlack,
                        ),
                      ),
                    ),
                  ),
                  const SizedBox(width: 10),
                  Padding(
                    padding: const EdgeInsets.only(right: 16),
                    child: NeoButton(
                      text: "Sign out",
                      loadingText: "Signing out...",
                      isLoading: _isSigningOut,
                      icon: _isSigningOut ? null : Icons.logout,
                      backgroundColor: isDark ? AppColors.darkCard : Colors.white,
                      textColor: isDark ? Colors.white : AppColors.inkBlack,
                      borderColor: isDark ? Colors.white24 : AppColors.inkBlack,
                      fontSize: 12.5,
                      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 6),
                      borderRadius: 999,
                      shadowOffset: const Offset(1.5, 2),
                      onPressed: _isSigningOut
                          ? null
                          : () async {
                              setState(() => _isSigningOut = true);
                              try {
                                await AuthService.signOut();
                              } finally {
                                if (mounted) setState(() => _isSigningOut = false);
                              }
                            },
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
                          backgroundColor: isDark ? AppColors.darkCard : Colors.white,
                          borderColor: isDark ? Colors.white24 : AppColors.inkBlack,
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
                                      border: Border.all(
                                        color: isDark ? Colors.white24 : AppColors.inkBlack,
                                        width: 2,
                                      ),
                                      boxShadow: [
                                        BoxShadow(
                                          color: isDark ? Colors.black54 : AppColors.inkBlack,
                                          offset: const Offset(2, 2.5),
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
                                                color: isDark ? Colors.white : AppColors.inkBlack,
                                                letterSpacing: -0.4,
                                              ),
                                            ),
                                            if (session.isGuest) ...[
                                              const SizedBox(width: 8),
                                              Container(
                                                padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                                                decoration: BoxDecoration(
                                                  color: isDark ? const Color(0xFF78350F) : AppColors.amberSoft,
                                                  borderRadius: BorderRadius.circular(999),
                                                  border: Border.all(
                                                    color: isDark ? const Color(0xFFFBBF24) : AppColors.inkBlack,
                                                    width: 1.5,
                                                  ),
                                                ),
                                                child: Text(
                                                  "GUEST",
                                                  style: GoogleFonts.plusJakartaSans(
                                                    color: isDark ? const Color(0xFFFDE68A) : AppColors.inkBlack,
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
                                            color: isDark ? Colors.white60 : const Color(0xFF71717A),
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
                                    backgroundColor: isDark ? const Color(0xFF1E293B) : Colors.white,
                                    textColor: isDark ? Colors.white : AppColors.inkBlack,
                                    borderColor: isDark ? Colors.white24 : AppColors.inkBlack,
                                    fontSize: 13,
                                    padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
                                    borderRadius: 12,
                                    shadowOffset: const Offset(2, 2.5),
                                    onPressed: () => _showAvatarCustomizer(session),
                                  ),
                                ],
                              ),
                              const SizedBox(height: 18),
                              Divider(
                                color: isDark ? Colors.white12 : const Color(0xFFE8E5DD),
                                height: 1,
                              ),
                              const SizedBox(height: 14),

                              // Status Selector Row
                              Row(
                                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                                children: [
                                  Text(
                                    "Presence Status:",
                                    style: GoogleFonts.plusJakartaSans(
                                      color: isDark ? Colors.white : AppColors.inkBlack,
                                      fontSize: 13,
                                      fontWeight: FontWeight.w700,
                                    ),
                                  ),
                                  Container(
                                    padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 2),
                                    decoration: BoxDecoration(
                                      color: isDark ? const Color(0xFF1E293B) : const Color(0xFFF6F4EE),
                                      borderRadius: BorderRadius.circular(10),
                                      border: Border.all(
                                        color: isDark ? Colors.white24 : AppColors.inkBlack,
                                        width: 1.5,
                                      ),
                                    ),
                                    child: DropdownButton<String>(
                                      value: session.status,
                                      dropdownColor: isDark ? const Color(0xFF1E293B) : Colors.white,
                                      underline: const SizedBox(),
                                      icon: Icon(
                                        Icons.arrow_drop_down,
                                        color: isDark ? Colors.white : AppColors.inkBlack,
                                      ),
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
                                                  border: Border.all(
                                                    color: isDark ? Colors.white30 : AppColors.inkBlack,
                                                    width: 1,
                                                  ),
                                                ),
                                              ),
                                              const SizedBox(width: 8),
                                              Text(
                                                _getStatusLabel(s),
                                                style: GoogleFonts.plusJakartaSans(
                                                  color: isDark ? Colors.white : AppColors.inkBlack,
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
                                    color: isDark ? Colors.white : AppColors.inkBlack,
                                    fontSize: 14,
                                    fontWeight: FontWeight.w900,
                                    letterSpacing: 0.5,
                                  ),
                                ),
                                const SizedBox(width: 8),
                                Container(
                                  padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
                                  decoration: BoxDecoration(
                                    color: isDark ? const Color(0xFF312E81) : AppColors.teemPurpleSoft,
                                    borderRadius: BorderRadius.circular(999),
                                    border: Border.all(
                                      color: isDark ? const Color(0xFF6366F1) : AppColors.inkBlack,
                                      width: 1.2,
                                    ),
                                  ),
                                  child: Text(
                                    "${_spaces.length}",
                                    style: GoogleFonts.plusJakartaSans(
                                      color: isDark ? const Color(0xFFA5B4FC) : AppColors.teemPurple,
                                      fontSize: 11,
                                      fontWeight: FontWeight.w900,
                                    ),
                                  ),
                                ),
                              ],
                            ),
                            Row(
                              children: [
                                NeoButton(
                                  text: "🔗 Join Space",
                                  icon: Icons.link,
                                  backgroundColor: isDark ? const Color(0xFF1E293B) : const Color(0xFFF1F5F9),
                                  textColor: isDark ? Colors.white : AppColors.inkBlack,
                                  borderColor: isDark ? Colors.white24 : AppColors.inkBlack,
                                  fontSize: 12.5,
                                  padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
                                  borderRadius: 12,
                                  shadowOffset: const Offset(1.5, 2),
                                  onPressed: _showJoinSpaceModal,
                                ),
                                const SizedBox(width: 8),
                                NeoButton(
                                  text: "+ New Space",
                                  icon: Icons.add,
                                  backgroundColor: isDark ? AppColors.darkCard : Colors.white,
                                  textColor: isDark ? Colors.white : AppColors.inkBlack,
                                  borderColor: isDark ? Colors.white24 : AppColors.inkBlack,
                                  fontSize: 12.5,
                                  padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
                                  borderRadius: 12,
                                  shadowOffset: const Offset(1.5, 2),
                                  onPressed: _showCreateSpaceModal,
                                ),
                              ],
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
                        else if (_spaces.isEmpty)
                          Padding(
                            padding: const EdgeInsets.only(bottom: 20),
                            child: NeoCard(
                              backgroundColor: isDark ? AppColors.darkCard : Colors.white,
                              borderColor: isDark ? Colors.white24 : AppColors.inkBlack,
                              padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 32),
                              borderRadius: 24,
                              borderWidth: 2.4,
                              shadowOffset: const Offset(5, 5),
                              child: Column(
                                children: [
                                  Icon(
                                    Icons.explore_outlined,
                                    size: 48,
                                    color: isDark ? Colors.white38 : Colors.black26,
                                  ),
                                  const SizedBox(height: 16),
                                  Text(
                                    "No Virtual Spaces Yet",
                                    style: GoogleFonts.plusJakartaSans(
                                      color: isDark ? Colors.white : AppColors.inkBlack,
                                      fontSize: 18,
                                      fontWeight: FontWeight.w900,
                                    ),
                                  ),
                                  const SizedBox(height: 8),
                                  Text(
                                    AuthService.currentSession?.isGuest == true
                                        ? "As a guest, you can create 1 temporary map to explore. Tap \"+ New Space\" above to get started!"
                                        : "Create your first virtual space to start exploring with friends.",
                                    textAlign: TextAlign.center,
                                    style: GoogleFonts.plusJakartaSans(
                                      color: isDark ? Colors.white60 : Colors.black54,
                                      fontSize: 13,
                                      height: 1.5,
                                    ),
                                  ),
                                  const SizedBox(height: 20),
                                  NeoButton(
                                    text: "Create Your First Space",
                                    icon: Icons.add,
                                    backgroundColor: AppColors.primary,
                                    textColor: AppColors.inkBlack,
                                    borderColor: AppColors.inkBlack,
                                    fontSize: 13,
                                    padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 10),
                                    borderRadius: 12,
                                    shadowOffset: const Offset(2, 3),
                                    onPressed: _showCreateSpaceModal,
                                  ),
                                ],
                              ),
                            ),
                          )
                        else
                          ..._spaces.map((space) {
                            return Padding(
                              padding: const EdgeInsets.only(bottom: 20),
                              child: NeoCard(
                                backgroundColor: isDark ? AppColors.darkCard : Colors.white,
                                borderColor: isDark ? Colors.white24 : AppColors.inkBlack,
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
                                        Wrap(
                                          spacing: 6,
                                          crossAxisAlignment: WrapCrossAlignment.center,
                                          children: [
                                            Container(
                                              padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                                              decoration: BoxDecoration(
                                                color: isDark ? const Color(0xFF1E293B) : const Color(0xFFF6F4EE),
                                                borderRadius: BorderRadius.circular(8),
                                                border: Border.all(
                                                  color: isDark ? Colors.white24 : AppColors.inkBlack,
                                                  width: 1.5,
                                                ),
                                              ),
                                              child: Text(
                                                space.category.toUpperCase(),
                                                style: GoogleFonts.plusJakartaSans(
                                                  color: isDark ? Colors.white : AppColors.inkBlack,
                                                  fontSize: 10.5,
                                                  fontWeight: FontWeight.w900,
                                                  letterSpacing: 0.5,
                                                ),
                                              ),
                                            ),
                                            Container(
                                              padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                                              decoration: BoxDecoration(
                                                color: const Color(0xFF10B981).withOpacity(isDark ? 0.25 : 0.15),
                                                borderRadius: BorderRadius.circular(8),
                                                border: Border.all(
                                                  color: const Color(0xFF10B981),
                                                  width: 1.5,
                                                ),
                                              ),
                                              child: Text(
                                                space.mapTheme == 'beach'
                                                    ? "🏖️ BEACH MAP"
                                                    : (space.mapTheme == 'forest'
                                                        ? "🌲 FOREST MAP"
                                                        : (space.mapTheme == 'lounge'
                                                            ? "🕹️ RETRO LOUNGE"
                                                            : "🌿 VILLAGE MAP")),
                                                style: GoogleFonts.plusJakartaSans(
                                                  color: isDark ? const Color(0xFF34D399) : const Color(0xFF047857),
                                                  fontSize: 10.5,
                                                  fontWeight: FontWeight.w900,
                                                  letterSpacing: 0.5,
                                                ),
                                              ),
                                            ),
                                          ],
                                        ),
                                        Row(
                                          children: [
                                            if (space.isTemporary) ...[
                                              Container(
                                                padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                                                decoration: BoxDecoration(
                                                  color: const Color(0xFFFEF3C7),
                                                  borderRadius: BorderRadius.circular(999),
                                                  border: Border.all(color: const Color(0xFFD97706), width: 1.5),
                                                ),
                                                child: Text(
                                                  "⏳ TEMPORARY (GUEST) • UNSAVED",
                                                  style: GoogleFonts.plusJakartaSans(
                                                    color: const Color(0xFFB45309),
                                                    fontSize: 10.5,
                                                    fontWeight: FontWeight.w900,
                                                  ),
                                                ),
                                              ),
                                            ] else ...[
                                              Container(
                                                padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                                                decoration: BoxDecoration(
                                                  color: const Color(0xFF10B981).withOpacity(isDark ? 0.25 : 0.15),
                                                  borderRadius: BorderRadius.circular(999),
                                                  border: Border.all(color: const Color(0xFF10B981), width: 1.5),
                                                ),
                                                child: Text(
                                                  "👥 ${space.maxCapacity} CAPACITY",
                                                  style: GoogleFonts.plusJakartaSans(
                                                    color: isDark ? const Color(0xFF34D399) : const Color(0xFF047857),
                                                    fontSize: 10.5,
                                                    fontWeight: FontWeight.w900,
                                                  ),
                                                ),
                                              ),
                                            ],
                                            if ((space.isTemporary && session.isGuest) ||
                                                (!session.isGuest && (space.ownerId == null || space.ownerId == session.id) && space.id != 'b6941fa2-8305-4e00-833c-ca3cd5f08c9b')) ...[
                                              const SizedBox(width: 4),
                                              IconButton(
                                                icon: Icon(Icons.edit_outlined, size: 18, color: isDark ? Colors.white70 : AppColors.inkBlack),
                                                tooltip: "Edit Space & Map",
                                                visualDensity: VisualDensity.compact,
                                                onPressed: () => _showEditSpaceModal(space),
                                              ),
                                              IconButton(
                                                icon: const Icon(Icons.delete_outline, size: 18, color: Color(0xFFEF4444)),
                                                tooltip: space.isTemporary ? "Discard Temporary Map" : "Delete Space",
                                                visualDensity: VisualDensity.compact,
                                                onPressed: () => _showDeleteSpaceDialog(space),
                                              ),
                                            ],
                                          ],
                                        ),
                                      ],
                                    ),
                                    const SizedBox(height: 14),
                                    Text(
                                      space.name,
                                      style: GoogleFonts.plusJakartaSans(
                                        color: isDark ? Colors.white : AppColors.inkBlack,
                                        fontSize: 22,
                                        fontWeight: FontWeight.w900,
                                        letterSpacing: -0.4,
                                      ),
                                    ),
                                    const SizedBox(height: 6),
                                    Text(
                                      space.description ?? "Virtual hangout and collaboration headquarters.",
                                      style: GoogleFonts.plusJakartaSans(
                                        color: isDark ? Colors.white70 : const Color(0xFF52525B),
                                        fontSize: 13,
                                        height: 1.4,
                                      ),
                                    ),
                                    if (space.isTemporary) ...[
                                      const SizedBox(height: 8),
                                      Container(
                                        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
                                        decoration: BoxDecoration(
                                          color: const Color(0xFFFFFBEB),
                                          borderRadius: BorderRadius.circular(8),
                                          border: Border.all(color: const Color(0xFFFDE68A)),
                                        ),
                                        child: Row(
                                          mainAxisSize: MainAxisSize.min,
                                          children: [
                                            const Icon(Icons.warning_amber_rounded, size: 14, color: Color(0xFFD97706)),
                                            const SizedBox(width: 6),
                                            Text(
                                              "Temporary guest map — automatically deleted once you quit.",
                                              style: GoogleFonts.plusJakartaSans(
                                                color: const Color(0xFF92400E),
                                                fontSize: 11,
                                                fontWeight: FontWeight.w700,
                                              ),
                                            ),
                                          ],
                                        ),
                                      ),
                                    ],
                                    const SizedBox(height: 16),
                                    Wrap(
                                      spacing: 8,
                                      runSpacing: 8,
                                      children: [
                                        _buildZoneTag(
                                          Icons.people,
                                          "Up to ${space.maxCapacity} Avatars",
                                          const Color(0xFFE0E7FF),
                                          isDark: isDark,
                                        ),
                                        _buildZoneTag(
                                          space.canCustomizeMap ? Icons.palette : Icons.map_outlined,
                                          space.canCustomizeMap ? "Custom Map Builder (Cloud Sync)" : "Preset 2D Map",
                                          space.canCustomizeMap ? const Color(0xFFFEF3C7) : const Color(0xFFDCFCE7),
                                          isDark: isDark,
                                        ),
                                        _buildZoneTag(
                                          Icons.spatial_audio,
                                          "Spatial Audio",
                                          const Color(0xFFFCE7F3),
                                          isDark: isDark,
                                        ),
                                      ],
                                    ),
                                    const SizedBox(height: 20),
                                    Row(
                                      children: [
                                        Expanded(
                                          child: NeoButton(
                                            text: "Enter Space",
                                            loadingText: "Entering...",
                                            isLoading: _enteringSpaceId == space.id,
                                            icon: Icons.explore,
                                            backgroundColor: AppColors.amberButton,
                                            textColor: AppColors.inkBlack,
                                            fontSize: 15,
                                            fontWeight: FontWeight.w900,
                                            padding: const EdgeInsets.symmetric(vertical: 14),
                                            borderRadius: 14,
                                            borderWidth: 2.2,
                                            shadowOffset: const Offset(3, 3),
                                            onPressed: () async {
                                              if (_enteringSpaceId != null) return;
                                              debugPrint(">>> [DashboardScreen] Enter Space clicked for space: ${space.name} (${space.id})");
                                              setState(() {
                                                _enteringSpaceId = space.id;
                                              });
                                              // Simulate a brief loading sequence
                                              await Future.delayed(const Duration(milliseconds: 600));
                                              if (!mounted) return;
                                              setState(() {
                                                _enteringSpaceId = null;
                                              });
                                              debugPrint(">>> [DashboardScreen] Pushing WorldScreen route for user: ${session.displayName}...");
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
      },
    );
  }

  Widget _buildZoneTag(IconData icon, String label, Color bgColor, {bool isDark = false}) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
      decoration: BoxDecoration(
        color: isDark ? const Color(0xFF1E293B) : bgColor,
        borderRadius: BorderRadius.circular(8),
        border: Border.all(
          color: isDark ? Colors.white24 : AppColors.inkBlack,
          width: 1.5,
        ),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(icon, size: 14, color: isDark ? AppColors.primary : AppColors.inkBlack),
          const SizedBox(width: 5),
          Text(
            label,
            style: GoogleFonts.plusJakartaSans(
              fontSize: 11.5,
              fontWeight: FontWeight.w700,
              color: isDark ? Colors.white : AppColors.inkBlack,
            ),
          ),
        ],
      ),
    );
  }
}
