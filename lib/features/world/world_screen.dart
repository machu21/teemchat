import 'package:flame/components.dart' as flame_comp;
import 'package:flame/game.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:livekit_client/livekit_client.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import '../../core/constants/app_colors.dart';
import '../../core/models/avatar_model.dart';
import '../../core/models/space_model.dart';
import '../../core/services/chat_service.dart';
import '../../core/services/livekit_service.dart';
import '../../core/services/world_sync_service.dart';
import '../auth/auth_service.dart';
import 'game/components/furniture_item.dart';
import 'game/world_game.dart';

final List<({FurnitureType type, String label, String icon, String subtitle})> _furnitureCatalog = [
  (type: FurnitureType.pineTree, label: "Pine Tree", icon: "🌲", subtitle: "Forest Tree"),
  (type: FurnitureType.berryBush, label: "Berry Bush", icon: "🫐", subtitle: "Wild Berries"),
  (type: FurnitureType.flowerPatch, label: "Flowers", icon: "🌸", subtitle: "Wild Blossom"),
  (type: FurnitureType.tallGrass, label: "Tall Grass", icon: "🌾", subtitle: "Encounter Grass"),
  (type: FurnitureType.campfire, label: "Campfire", icon: "🔥", subtitle: "Warm Embers"),
  (type: FurnitureType.tent, label: "Camp Tent", icon: "⛺", subtitle: "Explorer Shelter"),
  (type: FurnitureType.logBench, label: "Log Bench", icon: "🪵", subtitle: "Carved Timber"),
  (type: FurnitureType.woodenSign, label: "Trail Sign", icon: "🪧", subtitle: "Route Marker"),
  (type: FurnitureType.boulder, label: "Boulder", icon: "🪨", subtitle: "Mountain Rock"),
  (type: FurnitureType.stoneWell, label: "Stone Well", icon: "⛲", subtitle: "Town Fountain"),
  (type: FurnitureType.streetLantern, label: "Lantern", icon: "🏮", subtitle: "Trail Light"),
  (type: FurnitureType.woodenFence, label: "Fence", icon: "🚪", subtitle: "Paddock Post"),
];

class WorldScreen extends StatefulWidget {
  final String displayName;
  final String status;
  final AvatarConfig avatarConfig;
  final SpaceModel? space;

  const WorldScreen({
    super.key,
    required this.displayName,
    required this.status,
    required this.avatarConfig,
    this.space,
  });

  @override
  State<WorldScreen> createState() => _WorldScreenState();
}

class _WorldScreenState extends State<WorldScreen> {
  late final WorldGame _game;
  String _activeZone = "Verdant Village";

  bool _showOnScreenJoystick = false;

  // Build Mode state
  bool _isBuildMode = false;
  FurnitureType _selectedFurniture = FurnitureType.pineTree;

  // Realtime World Sync & LiveKit Proximity Audio/Video
  late final WorldSyncService _worldSyncService;
  late final LiveKitService _liveKitService;

  // Discord Chat & Speech State
  bool _isChatOpen = false;
  bool _isPipExpanded = false;
  String _activeChannel = 'general';
  final List<ChatMessageModel> _messages = [];
  final TextEditingController _chatController = TextEditingController();
  final TextEditingController _speechController = TextEditingController();
  final ScrollController _chatScrollController = ScrollController();
  RealtimeChannel? _chatSubscription;

  void _toggleBuildMode() {
    setState(() {
      _isBuildMode = !_isBuildMode;
      _game.toggleBuildMode(_isBuildMode);
      _game.setSelectedFurniture(_isBuildMode ? _selectedFurniture : null);
    });
  }

  void _selectFurniture(FurnitureType type) {
    setState(() {
      _selectedFurniture = type;
      _game.setSelectedFurniture(type);
    });
  }

  @override
  void initState() {
    super.initState();
    final isMobile = defaultTargetPlatform == TargetPlatform.android ||
        defaultTargetPlatform == TargetPlatform.iOS;
    _showOnScreenJoystick = isMobile;

    final session = AuthService.currentSession;
    final currentUserId = session?.id ?? 'user-${DateTime.now().millisecondsSinceEpoch}';
    final spaceId = widget.space?.id ?? 'b6941fa2-8305-4e00-833c-ca3cd5f08c9b';

    _worldSyncService = WorldSyncService(
      spaceId: spaceId,
      currentUserId: currentUserId,
      displayName: widget.displayName,
      avatarConfig: widget.avatarConfig,
    );
    _worldSyncService.connect(initialX: 300, initialY: 260);

    _liveKitService = LiveKitService();
    _liveKitService.joinSpaceRoom(
      spaceId: spaceId,
      userId: currentUserId,
      displayName: widget.displayName,
    );

    _game = WorldGame(
      displayName: widget.displayName,
      status: widget.status,
      avatarConfig: widget.avatarConfig,
      space: widget.space,
      syncService: _worldSyncService,
      liveKitService: _liveKitService,
      onZoneChanged: (zone) {
        if (mounted) setState(() => _activeZone = zone);
      },
    );

    _initChat();
  }

  Future<void> _initChat() async {
    final spaceId = widget.space?.id ?? 'b6941fa2-8305-4e00-833c-ca3cd5f08c9b';
    final roomId = "$spaceId-$_activeChannel";
    final msgs = await ChatService.fetchMessages(roomId);
    if (mounted) {
      setState(() {
        _messages.clear();
        _messages.addAll(msgs);
      });
      _scrollToBottom();
    }

    _chatSubscription = ChatService.listenToRoomMessages(
      roomId: roomId,
      onMessage: (message) {
        if (mounted) {
          setState(() {
            _messages.add(message);
          });
          _scrollToBottom();
        }
      },
    );
  }

  void _switchChannel(String channelId) {
    if (_activeChannel == channelId) return;
    _chatSubscription?.unsubscribe();
    setState(() {
      _activeChannel = channelId;
      _messages.clear();
    });
    _initChat();
  }

  void _scrollToBottom() {
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (_chatScrollController.hasClients) {
        _chatScrollController.animateTo(
          _chatScrollController.position.maxScrollExtent,
          duration: const Duration(milliseconds: 200),
          curve: Curves.easeOut,
        );
      }
    });
  }

  Future<void> _sendChatMessage() async {
    final text = _chatController.text.trim();
    if (text.isEmpty) return;
    _chatController.clear();

    _worldSyncService.broadcastSpeech(text);
    _game.player.showSpeechBubble(text);

    final spaceId = widget.space?.id ?? 'b6941fa2-8305-4e00-833c-ca3cd5f08c9b';
    final roomId = "$spaceId-$_activeChannel";
    final sent = await ChatService.sendMessage(
      roomId: roomId,
      spaceId: spaceId,
      content: text,
    );
    if (sent != null && mounted) {
      setState(() {
        if (!_messages.any((m) => m.id == sent.id)) {
          _messages.add(sent);
        }
      });
      _scrollToBottom();
    }
  }

  void _sendInWorldSpeech() {
    final text = _speechController.text.trim();
    if (text.isEmpty) return;
    _speechController.clear();

    _worldSyncService.broadcastSpeech(text);
    _game.player.showSpeechBubble(text);
  }

  @override
  void dispose() {
    _chatSubscription?.unsubscribe();
    _chatController.dispose();
    _speechController.dispose();
    _chatScrollController.dispose();
    _worldSyncService.disconnect();
    _liveKitService.leaveSpaceRoom();
    super.dispose();
  }



  Color _getZoneColor(String zone) {
    switch (zone) {
      case 'Verdant Village':
        return const Color(0xFF22C55E);
      case 'Whispering Woods':
        return const Color(0xFF15803D);
      case 'Adventure Camp':
        return const Color(0xFFF59E0B);
      case 'Craggy Ridge':
        return const Color(0xFFB45309);
      case 'Crystal Bay':
        return const Color(0xFF0284C7);
      case 'River Crossing':
        return const Color(0xFF0D9488);
      default:
        return AppColors.primary;
    }
  }

  IconData _getZoneIcon(String zone) {
    switch (zone) {
      case 'Verdant Village':
        return Icons.cottage;
      case 'Whispering Woods':
        return Icons.park;
      case 'Adventure Camp':
        return Icons.cabin;
      case 'Craggy Ridge':
        return Icons.landscape;
      case 'Crystal Bay':
        return Icons.water;
      case 'River Crossing':
        return Icons.waves;
      default:
        return Icons.explore;
    }
  }

  @override
  Widget build(BuildContext context) {
    final zoneColor = _getZoneColor(_activeZone);

    return Scaffold(
      backgroundColor: AppColors.background,
      body: Stack(
        children: [
          // 1. Flame Game Engine Canvas (with Build Mode tap detector)
          Positioned.fill(
            child: Builder(
              builder: (context) {
                return GestureDetector(
                  // Only block default gestures when in Build Mode so that
                  // normal movement / keyboard / joystick are unaffected.
                  behavior: _isBuildMode
                      ? HitTestBehavior.opaque
                      : HitTestBehavior.translucent,
                  onTapUp: _isBuildMode
                      ? (details) {
                          final box =
                              context.findRenderObject() as RenderBox?;
                          final size = box?.size ?? MediaQuery.of(context).size;
                          _game.placeFurnitureAtScreen(
                            details.localPosition.dx,
                            details.localPosition.dy,
                            size,
                          );
                        }
                      : null,
                  child: GameWidget(
                    game: _game,
                    loadingBuilder: (context) {
                      debugPrint(">>> [WorldScreen] GameWidget waiting on game.isLoaded (loadingBuilder showing)...");
                      return Center(
                        child: Container(
                          padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 16),
                          decoration: BoxDecoration(
                            color: AppColors.surface.withOpacity(0.92),
                            borderRadius: BorderRadius.circular(16),
                            border: Border.all(color: AppColors.primary, width: 1.5),
                          ),
                          child: const Row(
                            mainAxisSize: MainAxisSize.min,
                            children: [
                              SizedBox(
                                width: 20,
                                height: 20,
                                child: CircularProgressIndicator(
                                  strokeWidth: 2.5,
                                  color: AppColors.primary,
                                ),
                              ),
                              SizedBox(width: 14),
                              Text(
                                "Loading Overworld...",
                                style: TextStyle(
                                  color: Colors.white,
                                  fontWeight: FontWeight.w700,
                                  fontSize: 13,
                                ),
                              ),
                            ],
                          ),
                        ),
                      );
                    },
                    errorBuilder: (context, error) {
                      debugPrint(">>> [WorldScreen] GameWidget FATAL ERROR: $error");
                      return Center(
                        child: Container(
                          padding: const EdgeInsets.all(24),
                          margin: const EdgeInsets.all(24),
                          decoration: BoxDecoration(
                            color: AppColors.surface,
                            borderRadius: BorderRadius.circular(16),
                            border: Border.all(color: Colors.redAccent, width: 2),
                          ),
                          child: Column(
                            mainAxisSize: MainAxisSize.min,
                            children: [
                              const Icon(Icons.error_outline, color: Colors.redAccent, size: 40),
                              const SizedBox(height: 12),
                              const Text(
                                "World Engine Error",
                                style: TextStyle(
                                  color: Colors.white,
                                  fontWeight: FontWeight.bold,
                                  fontSize: 16,
                                ),
                              ),
                              const SizedBox(height: 8),
                              Text(
                                "$error",
                                style: const TextStyle(color: Colors.white70, fontSize: 12),
                                textAlign: TextAlign.center,
                              ),
                            ],
                          ),
                        ),
                      );
                    },
                  ),
                );
              },
            ),
          ),

          // 2. Top HUD Bar (Fully Responsive)
          Positioned(
            top: MediaQuery.of(context).padding.top + 12,
            left: 16,
            right: 16,
            child: LayoutBuilder(
              builder: (context, constraints) {
                final isWide = constraints.maxWidth >= 1100;
                final isMedium = constraints.maxWidth >= 850;
                final isCompact = constraints.maxWidth < 650;

                return Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    // Left Side: World & Zone Pill + LiveKit Audio Pill + Explorers Count
                    Row(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        // World & Zone Pill
                        Container(
                          padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
                          decoration: BoxDecoration(
                            color: AppColors.surface.withOpacity(0.9),
                            borderRadius: BorderRadius.circular(20),
                            border: Border.all(color: AppColors.surfaceLight),
                            boxShadow: [
                              BoxShadow(
                                color: Colors.black.withOpacity(0.3),
                                blurRadius: 10,
                              ),
                            ],
                          ),
                          child: Row(
                            mainAxisSize: MainAxisSize.min,
                            children: [
                              Icon(_getZoneIcon(_activeZone), color: zoneColor, size: 18),
                              const SizedBox(width: 8),
                              Text(
                                _activeZone.toUpperCase(),
                                style: TextStyle(
                                  color: zoneColor,
                                  fontWeight: FontWeight.w800,
                                  fontSize: 12,
                                  letterSpacing: 0.8,
                                ),
                              ),
                              if (isMedium) ...[
                                const SizedBox(width: 8),
                                Container(width: 4, height: 4, decoration: const BoxDecoration(color: Colors.white38, shape: BoxShape.circle)),
                                const SizedBox(width: 8),
                                Text(
                                  widget.space?.name ?? "Emerald Isle Overworld",
                                  style: const TextStyle(color: Colors.white70, fontSize: 12),
                                ),
                              ],
                            ],
                          ),
                        ),
                        const SizedBox(width: 8),

                        // LiveKit Spatial Audio Status
                        ValueListenableBuilder<bool>(
                          valueListenable: _liveKitService.isConnected,
                          builder: (context, connected, _) {
                            return Container(
                              padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
                              decoration: BoxDecoration(
                                color: connected
                                    ? const Color(0xFF22C55E).withOpacity(0.18)
                                    : AppColors.surface.withOpacity(0.9),
                                borderRadius: BorderRadius.circular(20),
                                border: Border.all(
                                  color: connected ? const Color(0xFF22C55E) : AppColors.surfaceLight,
                                  width: 1,
                                ),
                              ),
                              child: Row(
                                mainAxisSize: MainAxisSize.min,
                                children: [
                                  Container(
                                    width: 8,
                                    height: 8,
                                    decoration: BoxDecoration(
                                      shape: BoxShape.circle,
                                      color: connected ? const Color(0xFF22C55E) : Colors.amber,
                                    ),
                                  ),
                                  if (!isCompact) ...[
                                    const SizedBox(width: 6),
                                    Text(
                                      connected ? "SPATIAL AUDIO" : "AUDIO CONNECTING",
                                      style: TextStyle(
                                        color: connected ? const Color(0xFF22C55E) : Colors.amber,
                                        fontSize: 11,
                                        fontWeight: FontWeight.w800,
                                        letterSpacing: 0.5,
                                      ),
                                    ),
                                  ],
                                ],
                              ),
                            );
                          },
                        ),
                        const SizedBox(width: 8),

                        // Online Explorers Count
                        ValueListenableBuilder<Map<String, RemotePlayerState>>(
                          valueListenable: _worldSyncService.remotePlayers,
                          builder: (context, players, _) {
                            final count = players.length + 1;
                            return Container(
                              padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
                              decoration: BoxDecoration(
                                color: AppColors.surface.withOpacity(0.9),
                                borderRadius: BorderRadius.circular(20),
                                border: Border.all(color: AppColors.surfaceLight),
                              ),
                              child: Row(
                                mainAxisSize: MainAxisSize.min,
                                children: [
                                  const Icon(Icons.group, color: Color(0xFF38BDF8), size: 15),
                                  const SizedBox(width: 5),
                                  Text(
                                    isCompact ? "$count" : "$count EXPLORERS",
                                    style: const TextStyle(
                                      color: Color(0xFF38BDF8),
                                      fontSize: 11,
                                      fontWeight: FontWeight.w800,
                                    ),
                                  ),
                                ],
                              ),
                            );
                          },
                        ),
                      ],
                    ),

                    // Right Actions
                    Row(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        // Desktop Controls Hint
                        if (isWide && (kIsWeb || (!kIsWeb && defaultTargetPlatform != TargetPlatform.android && defaultTargetPlatform != TargetPlatform.iOS)))
                          Container(
                            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
                            margin: const EdgeInsets.only(right: 8),
                            decoration: BoxDecoration(
                              color: AppColors.surface.withOpacity(0.9),
                              borderRadius: BorderRadius.circular(20),
                              border: Border.all(color: AppColors.surfaceLight),
                            ),
                            child: const Row(
                              children: [
                                Icon(Icons.keyboard, color: Colors.white70, size: 16),
                                SizedBox(width: 6),
                                Text("WASD / Arrows to Explore", style: TextStyle(color: Colors.white70, fontSize: 12)),
                              ],
                            ),
                          ),

                        // Build Mode Toggle
                        FilledButton.icon(
                          style: FilledButton.styleFrom(
                            backgroundColor: _isBuildMode
                                ? AppColors.accent
                                : AppColors.surface.withOpacity(0.9),
                            foregroundColor:
                                _isBuildMode ? Colors.black : Colors.white,
                            padding: const EdgeInsets.symmetric(
                                horizontal: 12, vertical: 8),
                            shape: RoundedRectangleBorder(
                              borderRadius: BorderRadius.circular(20),
                              side: BorderSide(
                                color: _isBuildMode
                                    ? AppColors.accent
                                    : AppColors.surfaceLight,
                              ),
                            ),
                          ),
                          onPressed: _toggleBuildMode,
                          icon: Icon(
                              _isBuildMode ? Icons.check : Icons.palette_outlined,
                              size: 16),
                          label: Text(
                            _isBuildMode ? "Done" : (isCompact ? "Decorate" : "🏕️ Decorate World"),
                            style: const TextStyle(
                                fontSize: 12, fontWeight: FontWeight.bold),
                          ),
                        ),
                        const SizedBox(width: 8),

                        // Discord Chat Toggle Button
                        IconButton(
                          tooltip: _isChatOpen ? "Close Chat" : "Open Discord Chat",
                          style: IconButton.styleFrom(
                            backgroundColor: _isChatOpen
                                ? AppColors.primary
                                : AppColors.surface.withOpacity(0.9),
                          ),
                          icon: Icon(
                            Icons.forum_outlined,
                            color: _isChatOpen ? AppColors.inkBlack : Colors.white,
                            size: 20,
                          ),
                          onPressed: () {
                            setState(() => _isChatOpen = !_isChatOpen);
                            if (_isChatOpen) _scrollToBottom();
                          },
                        ),
                        const SizedBox(width: 8),

                        // Touch Joystick Toggle (for testing touch on desktop/web)
                        IconButton(
                          tooltip: _showOnScreenJoystick ? "Hide Virtual Joystick" : "Show Virtual Joystick",
                          style: IconButton.styleFrom(
                            backgroundColor: _showOnScreenJoystick ? AppColors.primary.withOpacity(0.3) : AppColors.surface.withOpacity(0.9),
                          ),
                          icon: Icon(
                            Icons.sports_esports,
                            color: _showOnScreenJoystick ? AppColors.primary : Colors.white70,
                            size: 20,
                          ),
                          onPressed: () => setState(() => _showOnScreenJoystick = !_showOnScreenJoystick),
                        ),
                        const SizedBox(width: 8),

                        // Exit World Button
                        IconButton(
                          tooltip: "Leave World",
                          style: IconButton.styleFrom(
                            backgroundColor: AppColors.surface.withOpacity(0.9),
                          ),
                          icon: const Icon(Icons.close, color: Colors.white),
                          onPressed: () => Navigator.of(context).pop(),
                        ),
                      ],
                    ),
                  ],
                );
              },
            ),
          ),

          // 3. Virtual Touch Joystick (Mobile & Test Toggle)
          if (!_isBuildMode && _showOnScreenJoystick)
            Positioned(
              bottom: 36,
              left: 36,
              child: _VirtualJoystick(
                onDirectionChanged: _game.setJoystickDirection,
              ),
            ),

          // 4. Room Decorator / Build Mode Floating Toolbar
          if (_isBuildMode)
            Positioned(
              bottom: 20,
              left: 20,
              right: 20,
              child: Container(
                padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
                decoration: BoxDecoration(
                  color: AppColors.surface.withOpacity(0.95),
                  borderRadius: BorderRadius.circular(20),
                  border: Border.all(color: AppColors.primary.withOpacity(0.5), width: 1.5),
                  boxShadow: [
                    BoxShadow(
                      color: Colors.black.withOpacity(0.5),
                      blurRadius: 16,
                      offset: const Offset(0, 4),
                    ),
                  ],
                ),
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      mainAxisAlignment: MainAxisAlignment.spaceBetween,
                      children: [
                        Row(
                          children: [
                            Container(
                              padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                              decoration: BoxDecoration(
                                color: AppColors.primary.withOpacity(0.2),
                                borderRadius: BorderRadius.circular(8),
                              ),
                              child: const Text(
                                "🛠️ BUILD MODE",
                                style: TextStyle(
                                  color: AppColors.primary,
                                  fontSize: 11,
                                  fontWeight: FontWeight.w800,
                                  letterSpacing: 1.0,
                                ),
                              ),
                            ),
                            const SizedBox(width: 10),
                            Text(
                              (widget.space?.canCustomizeMap ?? false)
                                  ? "☁️ Cloud Sync Active • Custom objects persist permanently"
                                  : "Free Preview • Upgrade to Pro to save objects in cloud",
                              style: TextStyle(
                                color: (widget.space?.canCustomizeMap ?? false)
                                    ? const Color(0xFF38BDF8)
                                    : Colors.white70,
                                fontSize: 12,
                                fontWeight: (widget.space?.canCustomizeMap ?? false)
                                    ? FontWeight.w700
                                    : FontWeight.normal,
                              ),
                            ),
                          ],
                        ),
                        Row(
                          children: [
                            TextButton.icon(
                              onPressed: () {
                                _game.clearUserFurniture();
                                ScaffoldMessenger.of(context).showSnackBar(
                                  const SnackBar(
                                    content: Text("Cleared all custom placed furniture"),
                                    duration: Duration(seconds: 1),
                                  ),
                                );
                              },
                              icon: const Icon(Icons.delete_sweep, size: 16, color: Colors.redAccent),
                              label: const Text("Clear Placed", style: TextStyle(color: Colors.redAccent, fontSize: 12)),
                            ),
                            const SizedBox(width: 8),
                            FilledButton.icon(
                              style: FilledButton.styleFrom(
                                backgroundColor: AppColors.accent,
                                foregroundColor: Colors.black,
                                padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
                                shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                              ),
                              onPressed: _toggleBuildMode,
                              icon: const Icon(Icons.check, size: 16),
                              label: const Text("Done", style: TextStyle(fontWeight: FontWeight.bold, fontSize: 12)),
                            ),
                          ],
                        ),
                      ],
                    ),
                    const SizedBox(height: 10),
                    SizedBox(
                      height: 64,
                      child: ListView.separated(
                        scrollDirection: Axis.horizontal,
                        itemCount: _furnitureCatalog.length,
                        separatorBuilder: (_, __) => const SizedBox(width: 8),
                        itemBuilder: (context, index) {
                          final item = _furnitureCatalog[index];
                          final isSelected = _selectedFurniture == item.type;
                          return InkWell(
                            onTap: () => _selectFurniture(item.type),
                            borderRadius: BorderRadius.circular(12),
                            child: AnimatedContainer(
                              duration: const Duration(milliseconds: 150),
                              padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
                              decoration: BoxDecoration(
                                color: isSelected
                                    ? AppColors.primary.withOpacity(0.25)
                                    : AppColors.surfaceLight.withOpacity(0.6),
                                borderRadius: BorderRadius.circular(12),
                                border: Border.all(
                                  color: isSelected ? AppColors.primary : Colors.white12,
                                  width: isSelected ? 2.0 : 1.0,
                                ),
                              ),
                              child: Row(
                                children: [
                                  Text(item.icon, style: const TextStyle(fontSize: 22)),
                                  const SizedBox(width: 8),
                                  Column(
                                    crossAxisAlignment: CrossAxisAlignment.start,
                                    mainAxisAlignment: MainAxisAlignment.center,
                                    children: [
                                      Text(
                                        item.label,
                                        style: TextStyle(
                                          color: isSelected ? Colors.white : Colors.white70,
                                          fontWeight: isSelected ? FontWeight.bold : FontWeight.w500,
                                          fontSize: 13,
                                        ),
                                      ),
                                      Text(
                                        item.subtitle,
                                        style: TextStyle(
                                          color: isSelected ? AppColors.primary : Colors.white38,
                                          fontSize: 10,
                                        ),
                                      ),
                                    ],
                                  ),
                                ],
                              ),
                            ),
                          );
                        },
                      ),
                    ),
                  ],
                ),
              ),
            ),
          // 5. Video Call / Screen Share PiP Overlay
          _buildVideoPipOverlay(),

          // 6. Floating Bottom Media & In-World Speech Dock
          if (!_isBuildMode)
            _buildBottomDock(context),

          // 7. Slide-Out Discord-Style Chat Drawer
          _buildDiscordChatDrawer(context),
        ],
      ),
    );
  }

  Widget _buildVideoPipOverlay() {
    return ValueListenableBuilder<List<VideoFeedModel>>(
      valueListenable: _liveKitService.remoteVideoFeeds,
      builder: (context, feeds, _) {
        if (feeds.isEmpty) return const SizedBox.shrink();

        final width = _isPipExpanded ? 420.0 : 250.0;
        final height = _isPipExpanded ? 236.0 : 140.0;

        return Positioned(
          top: MediaQuery.of(context).padding.top + 70,
          right: _isChatOpen ? 400 : 20,
          child: AnimatedContainer(
            duration: const Duration(milliseconds: 200),
            width: width,
            decoration: BoxDecoration(
              color: AppColors.surface,
              borderRadius: BorderRadius.circular(16),
              border: Border.all(color: AppColors.inkBlack, width: 2.5),
              boxShadow: const [
                BoxShadow(
                  color: AppColors.inkBlack,
                  offset: Offset(4, 4),
                  blurRadius: 0,
                ),
              ],
            ),
            clipBehavior: Clip.antiAlias,
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
                  color: AppColors.surfaceLight,
                  child: Row(
                    children: [
                      Icon(
                        feeds.first.isScreenShare ? Icons.screen_share : Icons.videocam,
                        size: 15,
                        color: feeds.first.isScreenShare ? const Color(0xFF38BDF8) : const Color(0xFF22C55E),
                      ),
                      const SizedBox(width: 6),
                      Expanded(
                        child: Text(
                          feeds.first.isScreenShare
                              ? "${feeds.first.participantName}'s Screen"
                              : feeds.first.participantName,
                          style: const TextStyle(
                            color: Colors.white,
                            fontSize: 11.5,
                            fontWeight: FontWeight.bold,
                          ),
                          overflow: TextOverflow.ellipsis,
                        ),
                      ),
                      if (feeds.first.isScreenShare)
                        Container(
                          padding: const EdgeInsets.symmetric(horizontal: 5, vertical: 2),
                          margin: const EdgeInsets.only(right: 6),
                          decoration: BoxDecoration(
                            color: const Color(0xFFEF4444),
                            borderRadius: BorderRadius.circular(4),
                          ),
                          child: const Text(
                            "LIVE",
                            style: TextStyle(
                              color: Colors.white,
                              fontSize: 8.5,
                              fontWeight: FontWeight.w900,
                            ),
                          ),
                        ),
                      InkWell(
                        onTap: () => setState(() => _isPipExpanded = !_isPipExpanded),
                        child: Icon(
                          _isPipExpanded ? Icons.fullscreen_exit : Icons.fullscreen,
                          color: Colors.white70,
                          size: 18,
                        ),
                      ),
                    ],
                  ),
                ),
                SizedBox(
                  width: width,
                  height: height,
                  child: VideoTrackRenderer(
                    feeds.first.track,
                  ),
                ),
              ],
            ),
          ),
        );
      },
    );
  }

  Widget _buildBottomDock(BuildContext context) {
    return Positioned(
      bottom: 24,
      left: 20,
      right: 20,
      child: Center(
        child: ConstrainedBox(
          constraints: const BoxConstraints(maxWidth: 720),
          child: Container(
            padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
            decoration: BoxDecoration(
              color: AppColors.surface.withOpacity(0.96),
              borderRadius: BorderRadius.circular(24),
              border: Border.all(color: AppColors.inkBlack, width: 2.5),
              boxShadow: const [
                BoxShadow(
                  color: AppColors.inkBlack,
                  offset: Offset(4, 4),
                  blurRadius: 0,
                ),
              ],
            ),
            child: Row(
              children: [
                // Mic Button
                ValueListenableBuilder<bool>(
                  valueListenable: _liveKitService.isMicEnabled,
                  builder: (context, micOn, _) {
                    return _DockIconButton(
                      tooltip: micOn ? "Mute Mic (Speaking Proximity)" : "Unmute Mic",
                      icon: micOn ? Icons.mic : Icons.mic_off,
                      isActive: micOn,
                      activeColor: const Color(0xFF22C55E),
                      inactiveColor: const Color(0xFFEF4444),
                      onPressed: () => _liveKitService.toggleMicrophone(),
                    );
                  },
                ),
                const SizedBox(width: 8),

                // Camera Button
                ValueListenableBuilder<bool>(
                  valueListenable: _liveKitService.isCameraEnabled,
                  builder: (context, camOn, _) {
                    return _DockIconButton(
                      tooltip: camOn ? "Turn Camera Off" : "Turn Camera On",
                      icon: camOn ? Icons.videocam : Icons.videocam_off,
                      isActive: camOn,
                      activeColor: const Color(0xFF38BDF8),
                      inactiveColor: Colors.white54,
                      onPressed: () => _liveKitService.toggleCamera(),
                    );
                  },
                ),
                const SizedBox(width: 8),

                // Screen Share Button
                ValueListenableBuilder<bool>(
                  valueListenable: _liveKitService.isScreenShareEnabled,
                  builder: (context, shareOn, _) {
                    return _DockIconButton(
                      tooltip: shareOn ? "Stop Sharing Screen" : "Share Screen",
                      icon: shareOn ? Icons.stop_screen_share : Icons.screen_share,
                      isActive: shareOn,
                      activeColor: const Color(0xFFF59E0B),
                      inactiveColor: Colors.white54,
                      onPressed: () => _liveKitService.toggleScreenShare(),
                    );
                  },
                ),

                const SizedBox(width: 12),
                Container(width: 1.5, height: 28, color: Colors.white24),
                const SizedBox(width: 12),

                // In-World Quick Speech Bar
                Expanded(
                  child: Container(
                    height: 40,
                    padding: const EdgeInsets.symmetric(horizontal: 12),
                    decoration: BoxDecoration(
                      color: AppColors.surfaceLight,
                      borderRadius: BorderRadius.circular(20),
                      border: Border.all(color: Colors.white12),
                    ),
                    child: Row(
                      children: [
                        const Text("💬", style: TextStyle(fontSize: 14)),
                        const SizedBox(width: 8),
                        Expanded(
                          child: TextField(
                            controller: _speechController,
                            onSubmitted: (_) => _sendInWorldSpeech(),
                            style: const TextStyle(color: Colors.white, fontSize: 13),
                            decoration: const InputDecoration(
                              hintText: "Say something in-world... (Enter)",
                              hintStyle: TextStyle(color: Colors.white38, fontSize: 12),
                              border: InputBorder.none,
                              isDense: true,
                              contentPadding: EdgeInsets.zero,
                            ),
                          ),
                        ),
                        IconButton(
                          icon: const Icon(Icons.arrow_upward, size: 16, color: AppColors.primary),
                          onPressed: _sendInWorldSpeech,
                          padding: EdgeInsets.zero,
                          constraints: const BoxConstraints(),
                          tooltip: "Speak in World",
                        ),
                      ],
                    ),
                  ),
                ),

                const SizedBox(width: 12),
                Container(width: 1.5, height: 28, color: Colors.white24),
                const SizedBox(width: 12),

                // Discord Chat Drawer Toggle
                _DockIconButton(
                  tooltip: _isChatOpen ? "Close Discord Chat" : "Open Discord Chat",
                  icon: Icons.forum_outlined,
                  isActive: _isChatOpen,
                  activeColor: AppColors.accent,
                  inactiveColor: Colors.white70,
                  onPressed: () {
                    setState(() => _isChatOpen = !_isChatOpen);
                    if (_isChatOpen) _scrollToBottom();
                  },
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }

  Widget _buildDiscordChatDrawer(BuildContext context) {
    final width = MediaQuery.of(context).size.width;
    final drawerWidth = width < 500 ? width * 0.92 : 380.0;

    return AnimatedPositioned(
      duration: const Duration(milliseconds: 250),
      curve: Curves.easeOutCubic,
      top: 0,
      bottom: 0,
      right: _isChatOpen ? 0 : -drawerWidth - 40,
      width: drawerWidth,
      child: Container(
        decoration: BoxDecoration(
          color: AppColors.surface,
          border: const Border(
            left: BorderSide(color: AppColors.inkBlack, width: 3),
          ),
          boxShadow: [
            BoxShadow(
              color: Colors.black.withOpacity(0.5),
              blurRadius: 24,
              offset: const Offset(-4, 0),
            ),
          ],
        ),
        child: SafeArea(
          child: Column(
            children: [
              // Header
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
                decoration: const BoxDecoration(
                  color: AppColors.surfaceLight,
                  border: Border(
                    bottom: BorderSide(color: AppColors.inkBlack, width: 2),
                  ),
                ),
                child: Row(
                  children: [
                    Container(
                      padding: const EdgeInsets.all(6),
                      decoration: BoxDecoration(
                        color: AppColors.primary.withOpacity(0.2),
                        borderRadius: BorderRadius.circular(8),
                      ),
                      child: const Text("💬", style: TextStyle(fontSize: 16)),
                    ),
                    const SizedBox(width: 10),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Row(
                            children: [
                              Text(
                                "# $_activeChannel",
                                style: const TextStyle(
                                  color: Colors.white,
                                  fontWeight: FontWeight.w800,
                                  fontSize: 15,
                                ),
                              ),
                              const SizedBox(width: 8),
                              Container(
                                padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                                decoration: BoxDecoration(
                                  color: const Color(0xFF22C55E).withOpacity(0.2),
                                  borderRadius: BorderRadius.circular(4),
                                ),
                                child: const Text(
                                  "REALTIME",
                                  style: TextStyle(
                                    color: Color(0xFF22C55E),
                                    fontSize: 9,
                                    fontWeight: FontWeight.w800,
                                  ),
                                ),
                              ),
                            ],
                          ),
                          Text(
                            widget.space?.name ?? "Emerald Isle Space",
                            style: const TextStyle(
                              color: Colors.white38,
                              fontSize: 11,
                            ),
                          ),
                        ],
                      ),
                    ),
                    IconButton(
                      icon: const Icon(Icons.close, color: Colors.white70),
                      onPressed: () => setState(() => _isChatOpen = false),
                    ),
                  ],
                ),
              ),

              // Channel Switcher Tabs
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
                color: AppColors.surface,
                child: Row(
                  children: [
                    _buildChannelTab("general", "General"),
                    const SizedBox(width: 6),
                    _buildChannelTab("campfire", "🔥 Campfire"),
                    const SizedBox(width: 6),
                    _buildChannelTab("lounge", "Lounge"),
                  ],
                ),
              ),
              const Divider(color: Colors.white12, height: 1),

              // Online Presence Explorer Mini-Bar
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
                color: AppColors.surfaceLight.withOpacity(0.4),
                child: ValueListenableBuilder<Map<String, RemotePlayerState>>(
                  valueListenable: _worldSyncService.remotePlayers,
                  builder: (context, players, _) {
                    return Row(
                      children: [
                        const Text(
                          "ONLINE:",
                          style: TextStyle(
                            color: Colors.white38,
                            fontSize: 10,
                            fontWeight: FontWeight.w800,
                            letterSpacing: 0.5,
                          ),
                        ),
                        const SizedBox(width: 8),
                        Expanded(
                          child: SingleChildScrollView(
                            scrollDirection: Axis.horizontal,
                            child: Row(
                              children: [
                                _buildExplorerBadge(widget.displayName, isSelf: true),
                                ...players.values.map(
                                  (p) => _buildExplorerBadge(p.displayName, isSelf: false),
                                ),
                              ],
                            ),
                          ),
                        ),
                      ],
                    );
                  },
                ),
              ),
              const Divider(color: Colors.white12, height: 1),

              // Message List
              Expanded(
                child: _messages.isEmpty
                    ? Center(
                        child: Column(
                          mainAxisAlignment: MainAxisAlignment.center,
                          children: [
                            const Text("🏕️", style: TextStyle(fontSize: 32)),
                            const SizedBox(height: 8),
                            Text(
                              "Welcome to #$_activeChannel!",
                              style: const TextStyle(
                                color: Colors.white,
                                fontWeight: FontWeight.bold,
                                fontSize: 14,
                              ),
                            ),
                            const SizedBox(height: 4),
                            const Text(
                              "Send a message or speak in the 2D world.",
                              style: TextStyle(color: Colors.white38, fontSize: 12),
                            ),
                          ],
                        ),
                      )
                    : ListView.builder(
                        controller: _chatScrollController,
                        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
                        itemCount: _messages.length,
                        itemBuilder: (context, index) {
                          final msg = _messages[index];
                          final isSelf = msg.senderName == widget.displayName ||
                              msg.senderId == AuthService.currentSession?.id;
                          return _buildChatMessageItem(msg, isSelf);
                        },
                      ),
              ),

              // Chat Input Bar
              Container(
                padding: const EdgeInsets.all(12),
                decoration: const BoxDecoration(
                  color: AppColors.surfaceLight,
                  border: Border(
                    top: BorderSide(color: AppColors.inkBlack, width: 2),
                  ),
                ),
                child: Row(
                  children: [
                    Expanded(
                      child: Container(
                        padding: const EdgeInsets.symmetric(horizontal: 14),
                        decoration: BoxDecoration(
                          color: AppColors.surface,
                          borderRadius: BorderRadius.circular(16),
                          border: Border.all(color: Colors.white12),
                        ),
                        child: TextField(
                          controller: _chatController,
                          onSubmitted: (_) => _sendChatMessage(),
                          style: const TextStyle(color: Colors.white, fontSize: 13),
                          decoration: InputDecoration(
                            hintText: "Message #$_activeChannel...",
                            hintStyle: const TextStyle(color: Colors.white38, fontSize: 12.5),
                            border: InputBorder.none,
                          ),
                        ),
                      ),
                    ),
                    const SizedBox(width: 8),
                    Container(
                      decoration: BoxDecoration(
                        color: AppColors.primary,
                        borderRadius: BorderRadius.circular(14),
                        border: Border.all(color: AppColors.inkBlack, width: 2),
                        boxShadow: const [
                          BoxShadow(
                            color: AppColors.inkBlack,
                            offset: Offset(2, 2),
                            blurRadius: 0,
                          ),
                        ],
                      ),
                      child: IconButton(
                        icon: const Icon(Icons.send, color: AppColors.inkBlack, size: 18),
                        onPressed: _sendChatMessage,
                        tooltip: "Send Message",
                      ),
                    ),
                  ],
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildChannelTab(String channelId, String label) {
    final isSelected = _activeChannel == channelId;
    return InkWell(
      onTap: () => _switchChannel(channelId),
      borderRadius: BorderRadius.circular(10),
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
        decoration: BoxDecoration(
          color: isSelected ? AppColors.primary.withOpacity(0.2) : Colors.transparent,
          borderRadius: BorderRadius.circular(10),
          border: Border.all(
            color: isSelected ? AppColors.primary : Colors.white12,
            width: 1,
          ),
        ),
        child: Text(
          label,
          style: TextStyle(
            color: isSelected ? AppColors.primary : Colors.white60,
            fontSize: 12,
            fontWeight: isSelected ? FontWeight.bold : FontWeight.w500,
          ),
        ),
      ),
    );
  }

  Widget _buildExplorerBadge(String name, {required bool isSelf}) {
    return Container(
      margin: const EdgeInsets.only(right: 6),
      padding: const EdgeInsets.symmetric(horizontal: 7, vertical: 3),
      decoration: BoxDecoration(
        color: isSelf ? AppColors.primary.withOpacity(0.15) : AppColors.surface,
        borderRadius: BorderRadius.circular(8),
        border: Border.all(
          color: isSelf ? AppColors.primary : Colors.white12,
        ),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Container(
            width: 6,
            height: 6,
            decoration: BoxDecoration(
              shape: BoxShape.circle,
              color: isSelf ? AppColors.primary : const Color(0xFF38BDF8),
            ),
          ),
          const SizedBox(width: 5),
          Text(
            isSelf ? "$name (You)" : name,
            style: TextStyle(
              color: isSelf ? AppColors.primary : Colors.white70,
              fontSize: 11,
              fontWeight: FontWeight.w600,
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildChatMessageItem(ChatMessageModel msg, bool isSelf) {
    final timeStr = "${msg.createdAt.hour.toString().padLeft(2, '0')}:${msg.createdAt.minute.toString().padLeft(2, '0')}";

    return Padding(
      padding: const EdgeInsets.only(bottom: 12),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Container(
            width: 32,
            height: 32,
            decoration: BoxDecoration(
              color: isSelf ? AppColors.primary : const Color(0xFF38BDF8),
              borderRadius: BorderRadius.circular(10),
              border: Border.all(color: AppColors.inkBlack, width: 1.5),
            ),
            child: Center(
              child: Text(
                msg.senderName.isNotEmpty ? msg.senderName[0].toUpperCase() : '?',
                style: const TextStyle(
                  color: AppColors.inkBlack,
                  fontWeight: FontWeight.w900,
                  fontSize: 14,
                ),
              ),
            ),
          ),
          const SizedBox(width: 10),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    Text(
                      msg.senderName,
                      style: TextStyle(
                        color: isSelf ? AppColors.primary : const Color(0xFF38BDF8),
                        fontWeight: FontWeight.w800,
                        fontSize: 12.5,
                      ),
                    ),
                    const SizedBox(width: 8),
                    Text(
                      timeStr,
                      style: const TextStyle(color: Colors.white30, fontSize: 10),
                    ),
                  ],
                ),
                const SizedBox(height: 3),
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
                  decoration: BoxDecoration(
                    color: AppColors.surfaceLight,
                    borderRadius: BorderRadius.circular(12),
                    border: Border.all(color: Colors.white10),
                  ),
                  child: Text(
                    msg.content,
                    style: const TextStyle(
                      color: Colors.white,
                      fontSize: 13,
                      height: 1.3,
                    ),
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

class _DockIconButton extends StatelessWidget {
  final String tooltip;
  final IconData icon;
  final bool isActive;
  final Color activeColor;
  final Color inactiveColor;
  final VoidCallback onPressed;

  const _DockIconButton({
    required this.tooltip,
    required this.icon,
    required this.isActive,
    required this.activeColor,
    required this.inactiveColor,
    required this.onPressed,
  });

  @override
  Widget build(BuildContext context) {
    return Tooltip(
      message: tooltip,
      child: InkWell(
        onTap: onPressed,
        borderRadius: BorderRadius.circular(14),
        child: AnimatedContainer(
          duration: const Duration(milliseconds: 150),
          width: 44,
          height: 44,
          decoration: BoxDecoration(
            color: isActive ? activeColor.withOpacity(0.2) : AppColors.surfaceLight,
            borderRadius: BorderRadius.circular(14),
            border: Border.all(
              color: isActive ? activeColor : Colors.white24,
              width: 1.5,
            ),
          ),
          child: Icon(
            icon,
            size: 20,
            color: isActive ? activeColor : inactiveColor,
          ),
        ),
      ),
    );
  }
}

class _VirtualJoystick extends StatefulWidget {
  final ValueChanged<flame_comp.Vector2> onDirectionChanged;
  const _VirtualJoystick({required this.onDirectionChanged});

  @override
  State<_VirtualJoystick> createState() => _VirtualJoystickState();
}

class _VirtualJoystickState extends State<_VirtualJoystick> {
  Offset _offset = Offset.zero;
  bool _isDragging = false;

  void _onPanUpdate(DragUpdateDetails details) {
    final rawOffset = _offset + details.delta;
    const maxRadius = 45.0;
    final distance = rawOffset.distance;

    final clampedOffset = distance > maxRadius
        ? Offset(rawOffset.dx / distance * maxRadius, rawOffset.dy / distance * maxRadius)
        : rawOffset;

    setState(() {
      _offset = clampedOffset;
      _isDragging = true;
    });

    widget.onDirectionChanged(
      flame_comp.Vector2(clampedOffset.dx / maxRadius, clampedOffset.dy / maxRadius),
    );
  }

  void _onPanEnd(DragEndDetails details) {
    setState(() {
      _offset = Offset.zero;
      _isDragging = false;
    });
    widget.onDirectionChanged(flame_comp.Vector2.zero());
  }

  @override
  Widget build(BuildContext context) {
    return Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        GestureDetector(
          onPanUpdate: _onPanUpdate,
          onPanEnd: _onPanEnd,
          child: Container(
            width: 120,
            height: 120,
            decoration: BoxDecoration(
              shape: BoxShape.circle,
              color: Colors.black.withOpacity(0.4),
              border: Border.all(color: Colors.white.withOpacity(0.2), width: 2),
              boxShadow: [
                BoxShadow(
                  color: Colors.black.withOpacity(0.3),
                  blurRadius: 12,
                ),
              ],
            ),
            child: Center(
              child: Transform.translate(
                offset: _offset,
                child: Container(
                  width: 50,
                  height: 50,
                  decoration: BoxDecoration(
                    shape: BoxShape.circle,
                    color: _isDragging ? AppColors.primary : Colors.white.withOpacity(0.7),
                    boxShadow: [
                      BoxShadow(
                        color: AppColors.primary.withOpacity(0.5),
                        blurRadius: 10,
                      ),
                    ],
                  ),
                  child: const Center(
                    child: Icon(Icons.navigation, size: 22, color: Colors.black87),
                  ),
                ),
              ),
            ),
          ),
        ),
        const SizedBox(height: 6),
        Text(
          "JOYSTICK",
          style: TextStyle(
            color: Colors.white.withOpacity(0.4),
            fontSize: 10,
            fontWeight: FontWeight.bold,
            letterSpacing: 1.5,
          ),
        ),
      ],
    );
  }
}

