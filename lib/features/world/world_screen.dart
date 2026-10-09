// ignore_for_file: deprecated_member_use
import 'dart:async';
import 'dart:math' as math;
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
import '../../core/services/invite_link_service.dart';
import '../../core/services/livekit_service.dart';
import '../../core/services/world_sync_service.dart';
import '../auth/auth_service.dart';
import '../../core/services/space_service.dart';
import 'game/components/furniture_item.dart';
import 'game/world_game.dart';
import '../../core/models/companion_model.dart';
import '../../core/services/companion_service.dart';
import '../companion/companion_modal.dart';
import 'package:flutter/services.dart';
import '../../core/models/playlist_model.dart';
import '../../core/services/playlist_service.dart';

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
  static final ValueNotifier<List<String>> debugLogStream = ValueNotifier<List<String>>([]);

  void _logDebug(String msg) {
    debugPrint(msg);
    final formatted = "[${DateTime.now().toIso8601String().substring(11, 19)}] $msg";
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!mounted) return;
      final current = debugLogStream.value;
      if (current.length >= 8) {
        debugLogStream.value = [...current.sublist(1), formatted];
      } else {
        debugLogStream.value = [...current, formatted];
      }
    });
  }

  late final WorldGame _game;
  String _activeZone = "Verdant Village";

  bool _showOnScreenJoystick = false;

  // Build Mode state
  bool _isBuildMode = false;
  FurnitureType _selectedFurniture = FurnitureType.pineTree;

  // Realtime World Sync & LiveKit Proximity Audio/Video
  late final WorldSyncService _worldSyncService;
  late final LiveKitService _liveKitService;
  final FocusNode _gameFocusNode = FocusNode();

  // Roblox-Style Chat & Speech State
  bool _isChatOpen = false;
  bool _isPipExpanded = false;
  String _activeChannel = 'general';
  final List<ChatMessageModel> _messages = [];
  final Map<String, List<ChatMessageModel>> _roomMessagesCache = {};
  final TextEditingController _chatController = TextEditingController();
  final TextEditingController _speechController = TextEditingController();
  final ScrollController _chatScrollController = ScrollController();
  final ScrollController _companionChatScrollController = ScrollController();
  final FocusNode _chatFocusNode = FocusNode();
  RealtimeChannel? _chatSubscription;
  Timer? _chatPruneTimer;

  void _startChatPruneTimer() {
    _chatPruneTimer?.cancel();
    _chatPruneTimer = Timer.periodic(const Duration(seconds: 1), (_) {
      if (!mounted) return;
      final now = DateTime.now();
      final beforeCount = _messages.length;
      _messages.removeWhere((m) => now.difference(m.createdAt).inSeconds >= 30);
      for (final entry in _roomMessagesCache.entries) {
        entry.value.removeWhere((m) => now.difference(m.createdAt).inSeconds >= 30);
      }
      if (_messages.length != beforeCount) {
        setState(() {});
      }
    });
  }

  void _openCompanionModal() {
    final isGuest = AuthService.currentSession?.isGuest == true;
    final hasAi = AuthService.currentSession?.hasAiCompanion ?? false;
    if (isGuest || !hasAi) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text("AI Companion is a Member feature! Create an account to unlock your personal AI companion."),
          backgroundColor: Color(0xFF7C3AED),
          duration: Duration(seconds: 3),
        ),
      );
      return;
    }

    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (context) => CompanionModal(
        userName: widget.displayName,
        currentZone: _activeZone,
        onDismiss: () {
          _gameFocusNode.requestFocus();
          _game.clearPressedKeys();
        },
      ),
    ).then((_) {
      _gameFocusNode.requestFocus();
      _game.clearPressedKeys();
    });
  }

  void _onCompanionChanged() {
    final comp = CompanionService.currentCompanion.value;
    final isGuest = AuthService.currentSession?.isGuest == true;
    final hasAi = AuthService.currentSession?.hasAiCompanion ?? false;
    if (!isGuest && hasAi && comp != null) {
      _game.setCompanion(comp, onTap: _openCompanionModal);
    } else {
      _game.setCompanion(null);
    }
    if (mounted) setState(() {});
  }

  Future<void> _initCompanion(String userId, String displayName) async {
    final isGuest = AuthService.currentSession?.isGuest == true;
    final hasAi = AuthService.currentSession?.hasAiCompanion ?? false;
    if (isGuest || !hasAi) {
      _game.setCompanion(null);
      CompanionService.currentCompanion.value = null;
      return;
    }

    try {
      final companion = await CompanionService.loadOrCreateCompanion(
        userId: userId,
        displayName: displayName,
      );
      if (mounted) {
        if (companion != null) {
          _game.setCompanion(companion, onTap: _openCompanionModal);
        } else {
          _game.setCompanion(null);
        }
      }
    } catch (e) {
      _logDebug(">>> [WorldScreen] Companion init error: $e");
    }
  }

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
    _logDebug(">>> [WorldScreen] initState() called");

    final isMobile = defaultTargetPlatform == TargetPlatform.android ||
        defaultTargetPlatform == TargetPlatform.iOS;
    _showOnScreenJoystick = isMobile;

    final session = AuthService.currentSession;
    final currentUserId = session?.id ?? 'user-${DateTime.now().millisecondsSinceEpoch}';
    final spaceId = widget.space?.id ?? 'b6941fa2-8305-4e00-833c-ca3cd5f08c9b';

    // Compute unique jittered spawn position in Verdant Village plaza
    final jitterX = ((currentUserId.hashCode.abs() % 7) - 3) * 16.0;
    final jitterY = (((currentUserId.hashCode.abs() ~/ 7) % 5) - 2) * 12.0;
    final spawnPos = Vector2(420.0 + jitterX, 300.0 + jitterY);

    _worldSyncService = WorldSyncService(
      spaceId: spaceId,
      currentUserId: currentUserId,
      displayName: widget.displayName,
      avatarConfig: widget.avatarConfig,
    );
    _worldSyncService.onChatMessage = _handleIncomingChatMessage;

    _liveKitService = LiveKitService();

    // Initialize Flame WorldGame immediately so it is guaranteed to be ready
    _game = WorldGame(
      displayName: widget.displayName,
      status: widget.status,
      avatarConfig: widget.avatarConfig,
      initialPosition: spawnPos,
      space: widget.space,
      syncService: _worldSyncService,
      liveKitService: _liveKitService,
      onZoneChanged: (zone) {
        if (mounted) {
          WidgetsBinding.instance.addPostFrameCallback((_) {
            if (mounted) setState(() => _activeZone = zone);
          });
          final comp = CompanionService.currentCompanion.value;
          if (comp != null) {
            final greetings = {
              'Verdant Village': "Welcome back to Verdant Village!",
              'Whispering Woods': "The trees are whispering... stay alert!",
              'Adventure Camp': "Ah, the campfire smells great here.",
              'Craggy Ridge': "Watch your step on these rocky ridges!",
              'Crystal Bay': "The ocean looks so clear today! Fancy a swim?",
              'River Crossing': "The river water is refreshing, or cross the bridge smoothly!",
            };
            final greeting = greetings[zone];
            if (greeting != null) {
              _game.companionAvatar?.showSpeechBubble(greeting);
            }
          }
        }
      },
    );
    _logDebug(">>> [WorldScreen] WorldGame initialized successfully!");

    _game.loaded.then((_) {
      if (mounted) {
        setState(() {});
        _logDebug(">>> [WorldScreen] WorldGame loaded successfully! isLoaded=${_game.isLoaded}");
      }
    });

    // Listen to AI Companion changes (e.g. style/persona update in modal)
    CompanionService.currentCompanion.addListener(_onCompanionChanged);
    CompanionService.messages.addListener(_onCompanionMessagesChanged);

    // Initialize AI Companion
    _initCompanion(currentUserId, widget.displayName);

    // Initialize Sound Tripping Jukebox for this space
    PlaylistService.loadPlaylist(spaceId);

    // Start 30-second chat prune timer
    _startChatPruneTimer();

    // Asynchronously connect external network services with error guards
    _connectServices(spaceId, currentUserId);
  }

  Future<void> _connectServices(String spaceId, String currentUserId) async {
    try {
      _logDebug(">>> [WorldScreen] Connecting WorldSyncService...");
      await _worldSyncService.connect(
        initialX: _game.initialPosition.x,
        initialY: _game.initialPosition.y,
      );
      _logDebug(">>> [WorldScreen] WorldSyncService connected.");
    } catch (e) {
      _logDebug(">>> [WorldScreen] WorldSyncService connect error: $e");
    }

    try {
      _logDebug(">>> [WorldScreen] Joining LiveKit space room...");
      await _liveKitService.joinSpaceRoom(
        spaceId: spaceId,
        userId: currentUserId,
        displayName: widget.displayName,
      );
      _logDebug(">>> [WorldScreen] LiveKit room joined.");
    } catch (e) {
      _logDebug(">>> [WorldScreen] LiveKit error: $e");
    }

    try {
      _logDebug(">>> [WorldScreen] Initializing Chat...");
      await _initChat();
      _logDebug(">>> [WorldScreen] Chat initialized.");
    } catch (e) {
      _logDebug(">>> [WorldScreen] Chat init error: $e");
    }
  }

  void _handleIncomingChatMessage(ChatMessageModel message) {
    if (!mounted) return;
    final spaceId = widget.space?.id ?? 'b6941fa2-8305-4e00-833c-ca3cd5f08c9b';
    final currentRoomId = "$spaceId-$_activeChannel";

    final targetRoom = message.roomId;
    _roomMessagesCache.putIfAbsent(targetRoom, () => []);
    final roomList = _roomMessagesCache[targetRoom]!;

    final isIncomingLocal =
        message.id.startsWith('msg-') || message.id.startsWith('local-');

    // Check for exact ID match
    final exactIdx = roomList.indexWhere((m) => m.id == message.id);
    if (exactIdx >= 0) return;

    // Check for matching placeholder or duplicate within 10 seconds
    final matchIdx = roomList.indexWhere((m) =>
        m.senderId == message.senderId &&
        m.content == message.content &&
        m.createdAt.difference(message.createdAt).abs().inSeconds < 10);

    if (matchIdx >= 0) {
      if (!isIncomingLocal) {
        // Confirmed DB message replaces provisional broadcast
        roomList[matchIdx] = message;
      } else {
        // Already have a matching message, ignore duplicate broadcast
        return;
      }
    } else {
      roomList.add(message);
    }

    if (message.roomId == currentRoomId) {
      setState(() {
        final currentExactIdx = _messages.indexWhere((m) => m.id == message.id);
        if (currentExactIdx >= 0) return;

        final currentMatchIdx = _messages.indexWhere((m) =>
            m.senderId == message.senderId &&
            m.content == message.content &&
            m.createdAt.difference(message.createdAt).abs().inSeconds < 10);

        if (currentMatchIdx >= 0) {
          if (!isIncomingLocal) {
            _messages[currentMatchIdx] = message;
          }
        } else {
          _messages.add(message);
        }
      });
      _scrollToBottom();
    }
  }

  Future<void> _initChat() async {
    final spaceId = widget.space?.id ?? 'b6941fa2-8305-4e00-833c-ca3cd5f08c9b';
    final roomId = "$spaceId-$_activeChannel";

    if (_chatSubscription != null) {
      ChatService.unsubscribeRoomMessages(_chatSubscription);
      _chatSubscription = null;
    }

    if (_roomMessagesCache.containsKey(roomId) && _roomMessagesCache[roomId]!.isNotEmpty) {
      if (mounted) {
        setState(() {
          _messages.clear();
          _messages.addAll(_roomMessagesCache[roomId]!);
        });
        _scrollToBottom();
      }
    } else {
      final msgs = await ChatService.fetchMessages(roomId);
      if (mounted) {
        _roomMessagesCache[roomId] = List.from(msgs);
        setState(() {
          _messages.clear();
          _messages.addAll(msgs);
        });
        _scrollToBottom();
      }
    }

    _chatSubscription = ChatService.listenToRoomMessages(
      roomId: roomId,
      onMessage: (message) {
        _handleIncomingChatMessage(message);
      },
      onMessageDeleted: (deletedId) {
        if (!mounted) return;
        setState(() {
          _messages.removeWhere((m) => m.id == deletedId);
          for (final entry in _roomMessagesCache.entries) {
            entry.value.removeWhere((m) => m.id == deletedId);
          }
        });
      },
    );
  }

  void _switchChannel(String channelId) {
    if (channelId == 'companion' &&
        (AuthService.currentSession?.isGuest == true ||
            AuthService.currentSession?.hasAiCompanion == false)) {
      return;
    }
    if (_activeChannel == channelId) return;

    if (_chatSubscription != null) {
      ChatService.unsubscribeRoomMessages(_chatSubscription);
      _chatSubscription = null;
    }

    final spaceId = widget.space?.id ?? 'b6941fa2-8305-4e00-833c-ca3cd5f08c9b';
    final newRoomId = "$spaceId-$channelId";

    setState(() {
      _activeChannel = channelId;
      _messages.clear();
      if (_roomMessagesCache.containsKey(newRoomId)) {
        _messages.addAll(_roomMessagesCache[newRoomId]!);
      }
    });

    if (channelId != 'companion') {
      _initChat();
    } else {
      _scrollToBottomCompanion(animate: false);
    }
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

  void _onCompanionMessagesChanged() {
    if (_isChatOpen && _activeChannel == 'companion') {
      _scrollToBottomCompanion(animate: true);
    }
  }

  void _scrollToBottomCompanion({bool animate = true}) {
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (_companionChatScrollController.hasClients) {
        final target = _companionChatScrollController.position.maxScrollExtent;
        if (animate) {
          _companionChatScrollController.animateTo(
            target,
            duration: const Duration(milliseconds: 200),
            curve: Curves.easeOut,
          );
        } else {
          _companionChatScrollController.jumpTo(target);
        }
      }
    });
  }

  Future<void> _sendChatMessage() async {
    final text = _chatController.text.trim();
    if (text.isEmpty) return;
    _chatController.clear();

    if (_activeChannel == 'companion') {
      if (AuthService.currentSession?.isGuest == true ||
          AuthService.currentSession?.hasAiCompanion == false) {
        return;
      }
      final comp = CompanionService.currentCompanion.value;
      if (comp != null) {
        _scrollToBottomCompanion(animate: true);
        final reply = await CompanionService.sendMessage(
          userText: text,
          currentZone: _activeZone,
          userName: widget.displayName,
        );
        if (mounted) {
          _game.companionAvatar?.showSpeechBubble(reply);
          _scrollToBottomCompanion(animate: true);
        }
      }
      return;
    }

    _worldSyncService.broadcastSpeech(text);
    _game.player.showSpeechBubble(text);

    final spaceId = widget.space?.id ?? 'b6941fa2-8305-4e00-833c-ca3cd5f08c9b';
    final roomId = "$spaceId-$_activeChannel";
    final session = AuthService.currentSession;
    final currentUserId = session?.userId ?? session?.id ?? 'user-${DateTime.now().millisecondsSinceEpoch}';

    final localMsg = ChatMessageModel(
      id: 'msg-${DateTime.now().millisecondsSinceEpoch}-${math.Random().nextInt(9999)}',
      roomId: roomId,
      spaceId: spaceId,
      senderId: currentUserId,
      senderName: widget.displayName,
      content: text,
      createdAt: DateTime.now(),
    );

    // 1. Broadcast to all users in the space via realtime WebSocket channel
    _worldSyncService.broadcastChatMessage(localMsg);

    // 2. Add to local room cache & messages
    _roomMessagesCache.putIfAbsent(roomId, () => []);
    _roomMessagesCache[roomId]!.add(localMsg);
    if (mounted) {
      setState(() {
        if (!_messages.any((m) => m.id == localMsg.id)) {
          _messages.add(localMsg);
        }
      });
      _scrollToBottom();
      _chatFocusNode.requestFocus();
    }

    // 3. Persist to Supabase if session exists (including provisioned guests)
    if (session != null) {
      ChatService.sendMessage(
        roomId: roomId,
        spaceId: spaceId,
        content: text,
      ).ignore();
    }
  }

  void _sendInWorldSpeech() {
    final text = _speechController.text.trim();
    if (text.isEmpty) return;
    _speechController.clear();

    // Automatically release text field focus and restore WASD keyboard movement!
    FocusScope.of(context).unfocus();
    _gameFocusNode.requestFocus();
    _game.clearPressedKeys();

    _worldSyncService.broadcastSpeech(text);
    _game.player.showSpeechBubble(text);
  }

  @override
  void dispose() {
    _chatPruneTimer?.cancel();
    _chatPruneTimer = null;
    CompanionService.currentCompanion.removeListener(_onCompanionChanged);
    CompanionService.messages.removeListener(_onCompanionMessagesChanged);
    _gameFocusNode.dispose();
    _chatFocusNode.dispose();
    if (_chatSubscription != null) {
      ChatService.unsubscribeRoomMessages(_chatSubscription);
      _chatSubscription = null;
    }
    _chatController.dispose();
    _speechController.dispose();
    _chatScrollController.dispose();
    _companionChatScrollController.dispose();
    _worldSyncService.disconnect();
    _liveKitService.leaveSpaceRoom();
    _game.disposeGame();
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

  bool _isLeavingWorld = false;

  Future<bool> _confirmLeaveGuestWorld() async {
    if (_isLeavingWorld) return true;
    if (widget.space?.isTemporary == true && AuthService.currentSession?.isGuest == true) {
      final shouldQuit = await showDialog<bool>(
        context: context,
        builder: (ctx) => AlertDialog(
          backgroundColor: AppColors.darkCard,
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(20),
            side: const BorderSide(color: Color(0xFFEF4444), width: 2),
          ),
          title: const Row(
            children: [
              Icon(Icons.warning_amber_rounded, color: Color(0xFFEF4444), size: 24),
              SizedBox(width: 8),
              Text("Quit Temporary Map?", style: TextStyle(color: Colors.white, fontWeight: FontWeight.bold, fontSize: 18)),
            ],
          ),
          content: const Text(
            "Since you are in Guest Mode, your temporary map will be deleted upon quitting. Upgrade to a paid account to save permanent worlds.",
            style: TextStyle(color: Colors.white70, fontSize: 13, height: 1.4),
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.pop(ctx, false),
              child: const Text("Stay", style: TextStyle(color: Colors.white60)),
            ),
            ElevatedButton(
              style: ElevatedButton.styleFrom(backgroundColor: const Color(0xFFEF4444)),
              onPressed: () => Navigator.pop(ctx, true),
              child: const Text("Quit & Delete Map", style: TextStyle(color: Colors.white, fontWeight: FontWeight.bold)),
            ),
          ],
        ),
      );

      if (shouldQuit == true) {
        _isLeavingWorld = true;
        SpaceService.clearGuestMaps();
        return true;
      }
      return false;
    }
    _isLeavingWorld = true;
    return true;
  }

  Future<void> _handleLeaveWorld() async {
    final allowLeave = await _confirmLeaveGuestWorld();
    if (allowLeave && mounted) {
      Navigator.of(context).pop();
    }
  }

  @override
  Widget build(BuildContext context) {
    _logDebug(">>> [WorldScreen] build() executed | activeZone=$_activeZone | game.isLoaded=${_game.isLoaded}");
    final zoneColor = _getZoneColor(_activeZone);

    return WillPopScope(
      onWillPop: _confirmLeaveGuestWorld,
      child: Scaffold(
        backgroundColor: AppColors.background,
      body: Stack(
        fit: StackFit.expand,
        children: [
          // 1. Flame Game Engine Canvas (with Build Mode tap detector & Focus Restorer)
          Positioned.fill(
            child: Builder(
              builder: (context) {
                return GestureDetector(
                  // Focus restoration on tap so keyboard controls immediately resume
                  behavior: HitTestBehavior.translucent,
                  onTapDown: (_) {
                    FocusScope.of(context).unfocus();
                    _gameFocusNode.requestFocus();
                    _game.clearPressedKeys();
                  },
                  onTapUp: (details) {
                    FocusScope.of(context).unfocus();
                    _gameFocusNode.requestFocus();
                    _game.clearPressedKeys();
                    if (_isBuildMode) {
                      final box =
                          context.findRenderObject() as RenderBox?;
                      final size = box?.size ?? MediaQuery.of(context).size;
                      _game.placeFurnitureAtScreen(
                        details.localPosition.dx,
                        details.localPosition.dy,
                        size,
                      );
                    }
                  },
                  child: GameWidget(
                    game: _game,
                    focusNode: _gameFocusNode,
                    autofocus: true,
                    loadingBuilder: (context) {
                      _logDebug(">>> [WorldScreen] GameWidget loadingBuilder active... game.isLoaded=${_game.isLoaded}");
                      return Center(
                        child: Container(
                          padding: const EdgeInsets.symmetric(horizontal: 28, vertical: 20),
                          constraints: const BoxConstraints(maxWidth: 440),
                          decoration: BoxDecoration(
                            color: AppColors.surface.withOpacity(0.96),
                            borderRadius: BorderRadius.circular(20),
                            border: Border.all(color: AppColors.primary, width: 2),
                            boxShadow: const [
                              BoxShadow(color: Colors.black54, blurRadius: 20, offset: Offset(0, 8)),
                            ],
                          ),
                          child: Column(
                            mainAxisSize: MainAxisSize.min,
                            children: [
                              const SizedBox(
                                width: 36,
                                height: 36,
                                child: CircularProgressIndicator(
                                  strokeWidth: 3.0,
                                  color: AppColors.primary,
                                ),
                              ),
                              const SizedBox(height: 16),
                              const Text(
                                "Loading Overworld Game Engine...",
                                style: TextStyle(
                                  color: Colors.white,
                                  fontWeight: FontWeight.w800,
                                  fontSize: 15,
                                ),
                              ),
                              const SizedBox(height: 8),
                              Text(
                                "Waiting for Flame onLoad()... game.isLoaded = ${_game.isLoaded}",
                                style: const TextStyle(color: Colors.white70, fontSize: 11.5),
                                textAlign: TextAlign.center,
                              ),
                            ],
                          ),
                        ),
                      );
                    },
                    errorBuilder: (context, error) {
                      _logDebug(">>> [WorldScreen] GameWidget FATAL ERROR: $error");
                      return Center(
                        child: Container(
                          padding: const EdgeInsets.all(24),
                          margin: const EdgeInsets.all(24),
                          constraints: const BoxConstraints(maxWidth: 500),
                          decoration: BoxDecoration(
                            color: const Color(0xFF1E1010),
                            borderRadius: BorderRadius.circular(16),
                            border: Border.all(color: Colors.redAccent, width: 2),
                            boxShadow: const [
                              BoxShadow(color: Colors.black54, blurRadius: 16),
                            ],
                          ),
                          child: Column(
                            mainAxisSize: MainAxisSize.min,
                            children: [
                              const Icon(Icons.error_outline, color: Colors.redAccent, size: 44),
                              const SizedBox(height: 12),
                              const Text(
                                "World Engine Error",
                                style: TextStyle(
                                  color: Colors.white,
                                  fontWeight: FontWeight.bold,
                                  fontSize: 17,
                                ),
                              ),
                              const SizedBox(height: 10),
                              Text(
                                "$error",
                                style: const TextStyle(color: Colors.white70, fontSize: 12, fontFamily: 'monospace'),
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
                    Flexible(
                      child: SingleChildScrollView(
                        scrollDirection: Axis.horizontal,
                        child: Row(
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
                              if (widget.space?.isTemporary == true) ...[
                                const SizedBox(width: 8),
                                Container(
                                  padding: const EdgeInsets.symmetric(horizontal: 7, vertical: 3),
                                  decoration: BoxDecoration(
                                    color: const Color(0xFFEF4444).withOpacity(0.2),
                                    borderRadius: BorderRadius.circular(6),
                                    border: Border.all(color: const Color(0xFFEF4444), width: 1.2),
                                  ),
                                  child: const Row(
                                    mainAxisSize: MainAxisSize.min,
                                    children: [
                                      Icon(Icons.timer_outlined, size: 11, color: Color(0xFFEF4444)),
                                      SizedBox(width: 4),
                                      Text(
                                        "TEMPORARY MAP (GUEST)",
                                        style: TextStyle(
                                          color: Color(0xFFEF4444),
                                          fontSize: 9.5,
                                          fontWeight: FontWeight.w900,
                                          letterSpacing: 0.5,
                                        ),
                                      ),
                                    ],
                                  ),
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
                  ),
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

                        // AI Companion Persona Button (Members only)
                        if (AuthService.currentSession?.isGuest != true &&
                            (AuthService.currentSession?.hasAiCompanion ?? true)) ...[
                          ValueListenableBuilder<CompanionModel?>(
                            valueListenable: CompanionService.currentCompanion,
                            builder: (context, companion, _) {
                              return FilledButton.icon(
                                style: FilledButton.styleFrom(
                                  backgroundColor: const Color(0xFF7C3AED).withOpacity(0.9),
                                  foregroundColor: Colors.white,
                                  padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
                                  shape: RoundedRectangleBorder(
                                    borderRadius: BorderRadius.circular(20),
                                    side: const BorderSide(color: AppColors.inkBlack, width: 1.5),
                                  ),
                                ),
                                onPressed: _openCompanionModal,
                                icon: const Text("🤖", style: TextStyle(fontSize: 14)),
                                label: Text(
                                  isCompact ? "AI" : (companion?.name ?? "Companion"),
                                  style: const TextStyle(fontSize: 12, fontWeight: FontWeight.bold),
                                ),
                              );
                            },
                          ),
                          const SizedBox(width: 8),
                        ],

                        // Sound Tripping Jukebox Button
                        ValueListenableBuilder<bool>(
                          valueListenable: PlaylistService.isPlaying,
                          builder: (context, playing, _) {
                            return IconButton(
                              tooltip: "Sound Tripping (Jukebox)",
                              style: IconButton.styleFrom(
                                backgroundColor: playing
                                    ? const Color(0xFFF59E0B)
                                    : AppColors.surface.withOpacity(0.9),
                              ),
                              icon: Icon(
                                Icons.music_note,
                                color: playing ? AppColors.inkBlack : Colors.white,
                                size: 20,
                              ),
                              onPressed: _showSoundTrippingModal,
                            );
                          },
                        ),
                        const SizedBox(width: 8),

                        // Invite Friends & Room Code Button
                        IconButton(
                          tooltip: "Invite Friends & Share Link",
                          style: IconButton.styleFrom(
                            backgroundColor: AppColors.surface.withOpacity(0.9),
                          ),
                          icon: const Icon(
                            Icons.share_outlined,
                            color: Colors.white,
                            size: 20,
                          ),
                          onPressed: _showInviteModal,
                        ),
                        const SizedBox(width: 8),

                        // Roblox Chat Toggle Button
                        IconButton(
                          tooltip: _isChatOpen ? "Close Chat" : "Open Chat",
                          style: IconButton.styleFrom(
                            backgroundColor: _isChatOpen
                                ? AppColors.primary
                                : AppColors.surface.withOpacity(0.9),
                          ),
                          icon: Icon(
                            Icons.chat_bubble_outline,
                            color: _isChatOpen ? AppColors.inkBlack : Colors.white,
                            size: 20,
                          ),
                          onPressed: () {
                            setState(() => _isChatOpen = !_isChatOpen);
                            if (_isChatOpen) {
                              _scrollToBottom();
                              _chatFocusNode.requestFocus();
                            } else {
                              _gameFocusNode.requestFocus();
                              _game.clearPressedKeys();
                            }
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
                          onPressed: _handleLeaveWorld,
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

          // 7. Roblox-Style Floating In-Game Messaging Overlay (Top-Left, Non-intrusive)
          _buildRobloxStyleChat(context),
        ],
      ),
    ),
  );
  }

  void _showInviteModal() {
    final space = widget.space;
    final spaceName = space?.name ?? "Verdant Village HQ";
    final spaceId = space?.id ?? "b6941fa2-8305-4e00-833c-ca3cd5f08c9b";
    final spaceCode = space?.joinCode ?? space?.slug ?? spaceId;
    final inviteUrl = InviteLinkService.generateInviteUrl(spaceCode);

    showDialog(
      context: context,
      builder: (context) {
        return Dialog(
          backgroundColor: Colors.transparent,
          child: Container(
            width: 440,
            padding: const EdgeInsets.all(24),
            decoration: BoxDecoration(
              color: const Color(0xFF0F172A),
              borderRadius: BorderRadius.circular(24),
              border: Border.all(color: AppColors.primary, width: 2.2),
              boxShadow: const [
                BoxShadow(color: Colors.black87, blurRadius: 20, offset: Offset(4, 5)),
              ],
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
                          child: const Icon(Icons.share, color: AppColors.primary, size: 22),
                        ),
                        const SizedBox(width: 12),
                        Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            const Text(
                              "Invite Friends",
                              style: TextStyle(
                                color: Colors.white,
                                fontSize: 18,
                                fontWeight: FontWeight.w900,
                              ),
                            ),
                            Text(
                              spaceName,
                              style: const TextStyle(
                                color: Color(0xFF94A3B8),
                                fontSize: 12,
                                fontWeight: FontWeight.w600,
                              ),
                            ),
                          ],
                        ),
                      ],
                    ),
                    IconButton(
                      icon: const Icon(Icons.close, color: Colors.white70),
                      onPressed: () => Navigator.pop(context),
                    ),
                  ],
                ),
                const SizedBox(height: 20),
                const Text(
                  "SHAREABLE INVITE LINK",
                  style: TextStyle(
                    color: Color(0xFF64748B),
                    fontSize: 11,
                    fontWeight: FontWeight.w800,
                    letterSpacing: 0.8,
                  ),
                ),
                const SizedBox(height: 6),
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
                  decoration: BoxDecoration(
                    color: const Color(0xFF1E293B),
                    borderRadius: BorderRadius.circular(12),
                    border: Border.all(color: Colors.white12, width: 1.5),
                  ),
                  child: Row(
                    children: [
                      Expanded(
                        child: Text(
                          inviteUrl,
                          style: const TextStyle(
                            color: Color(0xFF38BDF8),
                            fontSize: 12.5,
                            fontWeight: FontWeight.w700,
                            overflow: TextOverflow.ellipsis,
                          ),
                        ),
                      ),
                      const SizedBox(width: 8),
                      ElevatedButton.icon(
                        style: ElevatedButton.styleFrom(
                          backgroundColor: AppColors.primary,
                          foregroundColor: AppColors.inkBlack,
                          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
                          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
                        ),
                        onPressed: () {
                          Clipboard.setData(ClipboardData(text: inviteUrl));
                          ScaffoldMessenger.of(context).showSnackBar(
                            const SnackBar(
                              content: Text("🔗 Invite link copied to clipboard!"),
                              backgroundColor: Color(0xFF10B981),
                              duration: Duration(seconds: 2),
                            ),
                          );
                        },
                        icon: const Icon(Icons.copy, size: 14),
                        label: const Text("Copy Link", style: TextStyle(fontSize: 11, fontWeight: FontWeight.bold)),
                      ),
                    ],
                  ),
                ),
                const SizedBox(height: 16),
                const Text(
                  "SPACE ROOM CODE",
                  style: TextStyle(
                    color: Color(0xFF64748B),
                    fontSize: 11,
                    fontWeight: FontWeight.w800,
                    letterSpacing: 0.8,
                  ),
                ),
                const SizedBox(height: 6),
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
                  decoration: BoxDecoration(
                    color: const Color(0xFF1E293B),
                    borderRadius: BorderRadius.circular(12),
                    border: Border.all(color: Colors.white12, width: 1.5),
                  ),
                  child: Row(
                    children: [
                      Expanded(
                        child: Text(
                          spaceCode,
                          style: const TextStyle(
                            color: Color(0xFFFDE047),
                            fontSize: 14,
                            fontWeight: FontWeight.w900,
                            letterSpacing: 1.0,
                            fontFamily: 'monospace',
                          ),
                        ),
                      ),
                      ElevatedButton.icon(
                        style: ElevatedButton.styleFrom(
                          backgroundColor: const Color(0xFF334155),
                          foregroundColor: Colors.white,
                          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
                          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
                        ),
                        onPressed: () {
                          Clipboard.setData(ClipboardData(text: spaceCode));
                          ScaffoldMessenger.of(context).showSnackBar(
                            const SnackBar(
                              content: Text("📋 Room code copied!"),
                              backgroundColor: Color(0xFF6366F1),
                              duration: Duration(seconds: 2),
                            ),
                          );
                        },
                        icon: const Icon(Icons.content_copy, size: 14),
                        label: const Text("Copy Code", style: TextStyle(fontSize: 11, fontWeight: FontWeight.bold)),
                      ),
                    ],
                  ),
                ),
                const SizedBox(height: 16),
                Text(
                  "Friends can join via the link or enter the code from the Dashboard.",
                  style: TextStyle(color: Colors.white.withOpacity(0.6), fontSize: 11.5),
                  textAlign: TextAlign.center,
                ),
              ],
            ),
          ),
        );
      },
    );
  }

  void _showSoundTrippingModal() {
    final space = widget.space;
    final spaceId = space?.id ?? 'b6941fa2-8305-4e00-833c-ca3cd5f08c9b';
    final isGuest = AuthService.currentSession?.isGuest == true;
    final isCreator = !isGuest && (space?.ownerId == null || space?.ownerId == AuthService.currentSession?.id || AuthService.currentSession != null);

    bool isUploading = false;

    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (context) {
        return StatefulBuilder(
          builder: (context, setModalState) {

            return Container(
              height: MediaQuery.of(context).size.height * 0.75,
              decoration: const BoxDecoration(
                color: Color(0xFF0F172A),
                borderRadius: BorderRadius.vertical(top: Radius.circular(28)),
                border: Border(
                  top: BorderSide(color: Color(0xFFF59E0B), width: 3),
                  left: BorderSide(color: Color(0xFFF59E0B), width: 2),
                  right: BorderSide(color: Color(0xFFF59E0B), width: 2),
                ),
                boxShadow: [
                  BoxShadow(color: Colors.black87, blurRadius: 25, offset: Offset(0, -6)),
                ],
              ),
              child: Column(
                children: [
                  // Drag Handle & Header
                  Container(
                    margin: const EdgeInsets.only(top: 10, bottom: 6),
                    width: 44,
                    height: 5,
                    decoration: BoxDecoration(
                      color: Colors.white24,
                      borderRadius: BorderRadius.circular(10),
                    ),
                  ),
                  Padding(
                    padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 8),
                    child: Row(
                      mainAxisAlignment: MainAxisAlignment.spaceBetween,
                      children: [
                        Row(
                          children: [
                            Container(
                              padding: const EdgeInsets.all(8),
                              decoration: BoxDecoration(
                                color: const Color(0xFFF59E0B).withOpacity(0.2),
                                borderRadius: BorderRadius.circular(12),
                                border: Border.all(color: const Color(0xFFF59E0B), width: 1.5),
                              ),
                              child: const Text("📻", style: TextStyle(fontSize: 20)),
                            ),
                            const SizedBox(width: 12),
                            Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                const Text(
                                  "SOUND TRIPPING JUKEBOX",
                                  style: TextStyle(
                                    color: Color(0xFFF59E0B),
                                    fontSize: 15,
                                    fontWeight: FontWeight.w900,
                                    letterSpacing: 0.8,
                                  ),
                                ),
                                Text(
                                  space?.name ?? "Space Audio",
                                  style: const TextStyle(
                                    color: Colors.white70,
                                    fontSize: 12,
                                    fontWeight: FontWeight.w600,
                                  ),
                                ),
                              ],
                            ),
                          ],
                        ),
                        IconButton(
                          icon: const Icon(Icons.close, color: Colors.white),
                          onPressed: () => Navigator.pop(context),
                        ),
                      ],
                    ),
                  ),
                  const Divider(color: Colors.white12, height: 1),

                  // Player Card (Current Track, Visualizer, Controls, Volume)
                  Padding(
                    padding: const EdgeInsets.all(16),
                    child: Container(
                      padding: const EdgeInsets.all(16),
                      decoration: BoxDecoration(
                        color: const Color(0xFF1E293B),
                        borderRadius: BorderRadius.circular(20),
                        border: Border.all(color: const Color(0xFFF59E0B).withOpacity(0.5), width: 1.8),
                      ),
                      child: Column(
                        children: [
                          ValueListenableBuilder<PlaylistTrack?>(
                            valueListenable: PlaylistService.currentTrack,
                            builder: (context, track, _) {
                              return ValueListenableBuilder<bool>(
                                valueListenable: PlaylistService.isPlaying,
                                builder: (context, playing, _) {
                                  return Row(
                                    children: [
                                      Container(
                                        width: 48,
                                        height: 48,
                                        decoration: BoxDecoration(
                                          color: playing ? const Color(0xFFF59E0B) : const Color(0xFF334155),
                                          borderRadius: BorderRadius.circular(12),
                                          border: Border.all(color: Colors.white24, width: 1.5),
                                        ),
                                        child: Center(
                                          child: Text(
                                            playing ? "🎶" : "⏸️",
                                            style: const TextStyle(fontSize: 22),
                                          ),
                                        ),
                                      ),
                                      const SizedBox(width: 14),
                                      Expanded(
                                        child: Column(
                                          crossAxisAlignment: CrossAxisAlignment.start,
                                          children: [
                                            Text(
                                              track?.title ?? "No track selected",
                                              style: const TextStyle(
                                                color: Colors.white,
                                                fontSize: 15,
                                                fontWeight: FontWeight.w900,
                                              ),
                                              maxLines: 1,
                                              overflow: TextOverflow.ellipsis,
                                            ),
                                            const SizedBox(height: 2),
                                            Text(
                                              track?.artist ?? "Sound Tripping Ambient Beats",
                                              style: const TextStyle(
                                                color: Color(0xFF94A3B8),
                                                fontSize: 12,
                                                fontWeight: FontWeight.w600,
                                              ),
                                              maxLines: 1,
                                              overflow: TextOverflow.ellipsis,
                                            ),
                                          ],
                                        ),
                                      ),
                                    ],
                                  );
                                },
                              );
                            },
                          ),
                          const SizedBox(height: 14),

                          // Controls: Prev, Play/Pause, Next, Loop
                          ValueListenableBuilder<bool>(
                            valueListenable: PlaylistService.isPlaying,
                            builder: (context, playing, _) {
                              return Row(
                                mainAxisAlignment: MainAxisAlignment.center,
                                children: [
                                  const IconButton(
                                    icon: Icon(Icons.skip_previous, color: Colors.white, size: 28),
                                    onPressed: PlaylistService.previousTrack,
                                  ),
                                  const SizedBox(width: 8),
                                  GestureDetector(
                                    onTap: PlaylistService.togglePlayPause,
                                    child: Container(
                                      padding: const EdgeInsets.all(12),
                                      decoration: BoxDecoration(
                                        color: const Color(0xFFF59E0B),
                                        shape: BoxShape.circle,
                                        border: Border.all(color: AppColors.inkBlack, width: 2),
                                        boxShadow: const [
                                          BoxShadow(color: Colors.black45, blurRadius: 8, offset: Offset(2, 2)),
                                        ],
                                      ),
                                      child: Icon(
                                        playing ? Icons.pause : Icons.play_arrow,
                                        color: AppColors.inkBlack,
                                        size: 28,
                                      ),
                                    ),
                                  ),
                                  const SizedBox(width: 8),
                                  const IconButton(
                                    icon: Icon(Icons.skip_next, color: Colors.white, size: 28),
                                    onPressed: PlaylistService.nextTrack,
                                  ),
                                  const SizedBox(width: 14),
                                  ValueListenableBuilder<bool>(
                                    valueListenable: PlaylistService.isLooping,
                                    builder: (context, looping, _) {
                                      return IconButton(
                                        icon: Icon(
                                          looping ? Icons.repeat : Icons.repeat_one,
                                          color: looping ? const Color(0xFFF59E0B) : Colors.white38,
                                          size: 22,
                                        ),
                                        tooltip: looping ? "Loop All" : "Single Track",
                                        onPressed: () {
                                          PlaylistService.isLooping.value = !PlaylistService.isLooping.value;
                                        },
                                      );
                                    },
                                  ),
                                ],
                              );
                            },
                          ),
                          const SizedBox(height: 10),

                          // Volume Slider
                          ValueListenableBuilder<double>(
                            valueListenable: PlaylistService.volume,
                            builder: (context, vol, _) {
                              return Row(
                                children: [
                                  Icon(
                                    vol == 0 ? Icons.volume_off : (vol < 0.5 ? Icons.volume_down : Icons.volume_up),
                                    color: Colors.white70,
                                    size: 18,
                                  ),
                                  Expanded(
                                    child: SliderTheme(
                                      data: SliderTheme.of(context).copyWith(
                                        activeTrackColor: const Color(0xFFF59E0B),
                                        thumbColor: const Color(0xFFF59E0B),
                                        inactiveTrackColor: Colors.white12,
                                        trackHeight: 3,
                                        thumbShape: const RoundSliderThumbShape(enabledThumbRadius: 6),
                                      ),
                                      child: Slider(
                                        value: vol,
                                        min: 0.0,
                                        max: 1.0,
                                        onChanged: (val) => PlaylistService.volume.value = val,
                                      ),
                                    ),
                                  ),
                                  Text(
                                    "${(vol * 100).toInt()}%",
                                    style: const TextStyle(
                                      color: Colors.white70,
                                      fontSize: 11,
                                      fontFamily: 'monospace',
                                    ),
                                  ),
                                ],
                              );
                            },
                          ),
                        ],
                      ),
                    ),
                  ),

                  // Upload MP3 Button for Account Creators
                  Padding(
                    padding: const EdgeInsets.symmetric(horizontal: 16),
                    child: Row(
                      mainAxisAlignment: MainAxisAlignment.spaceBetween,
                      children: [
                        const Text(
                          "SPACE PLAYLIST TRACKS",
                          style: TextStyle(
                            color: Color(0xFF94A3B8),
                            fontSize: 11,
                            fontWeight: FontWeight.w800,
                            letterSpacing: 0.8,
                          ),
                        ),
                        if (isCreator)
                          ElevatedButton.icon(
                            style: ElevatedButton.styleFrom(
                              backgroundColor: const Color(0xFF10B981),
                              foregroundColor: AppColors.inkBlack,
                              padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
                              shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
                            ),
                            onPressed: isUploading
                                ? null
                                : () async {
                                    setModalState(() => isUploading = true);
                                    try {
                                      final newTrack = await PlaylistService.uploadMp3Track(spaceId);
                                      if (newTrack != null && mounted) {
                                        ScaffoldMessenger.of(context).showSnackBar(
                                          SnackBar(
                                            content: Text("🎵 '${newTrack.title}' added to Sound Tripping!"),
                                            backgroundColor: const Color(0xFF10B981),
                                          ),
                                        );
                                      }
                                    } finally {
                                      if (mounted) setModalState(() => isUploading = false);
                                    }
                                  },
                            icon: isUploading
                                ? const SizedBox(
                                    width: 14,
                                    height: 14,
                                    child: CircularProgressIndicator(strokeWidth: 2, color: AppColors.inkBlack),
                                  )
                                : const Icon(Icons.upload_file, size: 16),
                            label: Text(
                              isUploading ? "Uploading..." : "+ Upload MP3",
                              style: const TextStyle(fontSize: 11.5, fontWeight: FontWeight.w800),
                            ),
                          )
                        else
                          Container(
                            padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                            decoration: BoxDecoration(
                              color: Colors.white10,
                              borderRadius: BorderRadius.circular(6),
                            ),
                            child: const Text(
                              "Members can upload MP3s",
                              style: TextStyle(color: Colors.white54, fontSize: 10),
                            ),
                          ),
                      ],
                    ),
                  ),
                  const SizedBox(height: 8),

                  // Track list
                  Expanded(
                    child: ValueListenableBuilder<List<PlaylistTrack>>(
                      valueListenable: PlaylistService.playlist,
                      builder: (context, tracks, _) {
                        if (tracks.isEmpty) {
                          return const Center(
                            child: Text(
                              "No tracks in playlist yet.",
                              style: TextStyle(color: Colors.white38),
                            ),
                          );
                        }
                        return ValueListenableBuilder<PlaylistTrack?>(
                          valueListenable: PlaylistService.currentTrack,
                          builder: (context, current, _) {
                            return ListView.separated(
                              padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
                              itemCount: tracks.length,
                              separatorBuilder: (_, __) => const SizedBox(height: 8),
                              itemBuilder: (context, index) {
                                final track = tracks[index];
                                final isSel = current?.id == track.id;

                                return Container(
                                  padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
                                  decoration: BoxDecoration(
                                    color: isSel ? const Color(0xFF334155) : const Color(0xFF1E293B),
                                    borderRadius: BorderRadius.circular(12),
                                    border: Border.all(
                                      color: isSel ? const Color(0xFFF59E0B) : Colors.white12,
                                      width: isSel ? 1.8 : 1,
                                    ),
                                  ),
                                  child: Row(
                                    children: [
                                      IconButton(
                                        icon: Icon(
                                          isSel && PlaylistService.isPlaying.value
                                              ? Icons.pause_circle_filled
                                              : Icons.play_circle_fill,
                                          color: isSel ? const Color(0xFFF59E0B) : Colors.white70,
                                          size: 26,
                                        ),
                                        onPressed: () {
                                          if (isSel) {
                                            PlaylistService.togglePlayPause();
                                          } else {
                                            PlaylistService.playTrack(track);
                                          }
                                        },
                                      ),
                                      const SizedBox(width: 8),
                                      Expanded(
                                        child: Column(
                                          crossAxisAlignment: CrossAxisAlignment.start,
                                          children: [
                                            Text(
                                              track.title,
                                              style: TextStyle(
                                                color: isSel ? const Color(0xFFFDE047) : Colors.white,
                                                fontWeight: FontWeight.w800,
                                                fontSize: 13,
                                              ),
                                              maxLines: 1,
                                              overflow: TextOverflow.ellipsis,
                                            ),
                                            Text(
                                              "${track.artist} • ${track.isDefaultPreset ? 'Ambient Preset' : 'MP3 Upload'}",
                                              style: TextStyle(
                                                color: isSel ? Colors.white70 : const Color(0xFF94A3B8),
                                                fontSize: 11,
                                              ),
                                              maxLines: 1,
                                              overflow: TextOverflow.ellipsis,
                                            ),
                                          ],
                                        ),
                                      ),
                                      if (!track.isDefaultPreset && isCreator)
                                        IconButton(
                                          icon: const Icon(Icons.delete_outline, color: Color(0xFFEF4444), size: 20),
                                          tooltip: "Remove Track",
                                          onPressed: () async {
                                            await PlaylistService.deleteTrack(track);
                                            if (mounted) {
                                              ScaffoldMessenger.of(context).showSnackBar(
                                                SnackBar(
                                                  content: Text("Removed '${track.title}'"),
                                                  duration: const Duration(seconds: 2),
                                                ),
                                              );
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
                      },
                    ),
                  ),
                ],
              ),
            );
          },
        );
      },
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

                // AI Companion Persona Button (Members only)
                if (AuthService.currentSession?.isGuest != true &&
                    (AuthService.currentSession?.hasAiCompanion ?? true)) ...[
                  _DockIconButton(
                    tooltip: "AI Companion Persona",
                    icon: Icons.smart_toy_outlined,
                    isActive: false,
                    activeColor: const Color(0xFFC084FC),
                    inactiveColor: Colors.white70,
                    onPressed: _openCompanionModal,
                  ),
                  const SizedBox(width: 8),
                ],

                // Roblox Chat Toggle
                _DockIconButton(
                  tooltip: _isChatOpen ? "Close Chat" : "Open Chat",
                  icon: Icons.chat_bubble_outline,
                  isActive: _isChatOpen,
                  activeColor: AppColors.primary,
                  inactiveColor: Colors.white70,
                  onPressed: () {
                    setState(() => _isChatOpen = !_isChatOpen);
                    if (_isChatOpen) {
                      _scrollToBottom();
                      _chatFocusNode.requestFocus();
                    } else {
                      _gameFocusNode.requestFocus();
                      _game.clearPressedKeys();
                    }
                  },
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }

  Widget _buildRobloxStyleChat(BuildContext context) {
    final screenWidth = MediaQuery.of(context).size.width;
    final chatWidth = screenWidth < 420 ? screenWidth - 32 : 360.0;
    final topPadding = MediaQuery.of(context).padding.top + 58;

    if (!_isChatOpen) {
      return Positioned(
        top: topPadding,
        left: 16,
        child: Material(
          color: Colors.transparent,
          child: InkWell(
            onTap: () {
              setState(() => _isChatOpen = true);
              if (_activeChannel == 'companion') {
                _scrollToBottomCompanion(animate: false);
              } else {
                _scrollToBottom();
              }
              _chatFocusNode.requestFocus();
            },
            borderRadius: BorderRadius.circular(12),
            child: Container(
              padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 7),
              decoration: BoxDecoration(
                color: const Color(0xCC0F172A),
                borderRadius: BorderRadius.circular(12),
                border: Border.all(color: AppColors.inkBlack, width: 2),
                boxShadow: const [
                  BoxShadow(
                    color: Colors.black45,
                    offset: Offset(2, 2),
                    blurRadius: 0,
                  ),
                ],
              ),
              child: Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  const Icon(Icons.chat_bubble_outline, color: AppColors.primary, size: 16),
                  const SizedBox(width: 6),
                  const Text(
                    "Chat",
                    style: TextStyle(
                      color: Colors.white,
                      fontWeight: FontWeight.w800,
                      fontSize: 12,
                    ),
                  ),
                  const SizedBox(width: 6),
                  Container(
                    padding: const EdgeInsets.symmetric(horizontal: 5, vertical: 1),
                    decoration: BoxDecoration(
                      color: AppColors.primary,
                      borderRadius: BorderRadius.circular(6),
                    ),
                    child: Text(
                      _activeChannel == 'companion'
                          ? "${CompanionService.messages.value.length}"
                          : "${_messages.length}",
                      style: const TextStyle(
                        color: AppColors.inkBlack,
                        fontWeight: FontWeight.w900,
                        fontSize: 9.5,
                      ),
                    ),
                  ),
                ],
              ),
            ),
          ),
        ),
      );
    }

    return Positioned(
      top: topPadding,
      left: 16,
      child: Material(
        color: Colors.transparent,
        child: Container(
          width: chatWidth,
          height: 250,
          decoration: BoxDecoration(
            color: const Color(0xDC0F172A),
            borderRadius: BorderRadius.circular(14),
            border: Border.all(color: AppColors.inkBlack, width: 2),
            boxShadow: const [
              BoxShadow(
                color: Colors.black54,
                offset: Offset(3, 3),
                blurRadius: 0,
              ),
            ],
          ),
          child: Column(
            children: [
              // Header bar with channel tabs and minimize button
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
                decoration: const BoxDecoration(
                  color: Color(0xFF1E293B),
                  borderRadius: BorderRadius.only(
                    topLeft: Radius.circular(12),
                    topRight: Radius.circular(12),
                  ),
                ),
                child: Row(
                  children: [
                    _buildRobloxChannelPill("general", "All"),
                    const SizedBox(width: 4),
                    _buildRobloxChannelPill("campfire", "🔥 Camp"),
                    if (AuthService.currentSession?.isGuest != true &&
                        (AuthService.currentSession?.hasAiCompanion ?? true)) ...[
                      const SizedBox(width: 4),
                      _buildRobloxChannelPill("companion", "🤖 AI"),
                    ],
                    const Spacer(),
                    InkWell(
                      onTap: () {
                        setState(() => _isChatOpen = false);
                        _gameFocusNode.requestFocus();
                        _game.clearPressedKeys();
                      },
                      borderRadius: BorderRadius.circular(6),
                      child: Container(
                        padding: const EdgeInsets.all(3),
                        decoration: BoxDecoration(
                          color: Colors.white12,
                          borderRadius: BorderRadius.circular(6),
                        ),
                        child: const Icon(Icons.close, size: 14, color: Colors.white70),
                      ),
                    ),
                  ],
                ),
              ),
              const Divider(height: 1.5, thickness: 1.5, color: AppColors.inkBlack),

              // Message Body
              Expanded(
                child: (_activeChannel == 'companion' &&
                        AuthService.currentSession?.isGuest != true &&
                        (AuthService.currentSession?.hasAiCompanion ?? true))
                    ? _buildCompanionChatStream()
                    : _buildRoomChatStream(),
              ),

              // Input Row
              const Divider(height: 1.5, thickness: 1.5, color: AppColors.inkBlack),
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 6),
                decoration: const BoxDecoration(
                  color: Color(0xFF1E293B),
                  borderRadius: BorderRadius.only(
                    bottomLeft: Radius.circular(12),
                    bottomRight: Radius.circular(12),
                  ),
                ),
                child: Row(
                  children: [
                    Expanded(
                      child: Container(
                        height: 32,
                        padding: const EdgeInsets.symmetric(horizontal: 10),
                        decoration: BoxDecoration(
                          color: const Color(0xFF0F172A),
                          borderRadius: BorderRadius.circular(8),
                          border: Border.all(color: Colors.white12),
                        ),
                        child: TextField(
                          focusNode: _chatFocusNode,
                          controller: _chatController,
                          onSubmitted: (_) => _sendChatMessage(),
                          style: const TextStyle(color: Colors.white, fontSize: 12),
                          decoration: InputDecoration(
                            hintText: _activeChannel == 'companion'
                                ? "Ask or teach your AI companion..."
                                : "Type a message... (Enter to send)",
                            hintStyle: const TextStyle(color: Colors.white38, fontSize: 11),
                            border: InputBorder.none,
                            isDense: true,
                            contentPadding: const EdgeInsets.symmetric(vertical: 7),
                          ),
                        ),
                      ),
                    ),
                    const SizedBox(width: 6),
                    InkWell(
                      onTap: _sendChatMessage,
                      borderRadius: BorderRadius.circular(8),
                      child: Container(
                        height: 32,
                        width: 32,
                        decoration: BoxDecoration(
                          color: AppColors.primary,
                          borderRadius: BorderRadius.circular(8),
                          border: Border.all(color: AppColors.inkBlack, width: 1.5),
                        ),
                        child: const Icon(Icons.arrow_upward, size: 16, color: AppColors.inkBlack),
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

  Widget _buildRobloxChannelPill(String channelId, String label) {
    final isSelected = _activeChannel == channelId;
    return InkWell(
      onTap: () => _switchChannel(channelId),
      borderRadius: BorderRadius.circular(6),
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
        decoration: BoxDecoration(
          color: isSelected ? AppColors.primary : Colors.transparent,
          borderRadius: BorderRadius.circular(6),
          border: Border.all(
            color: isSelected ? AppColors.inkBlack : Colors.white24,
            width: 1,
          ),
        ),
        child: Text(
          label,
          style: TextStyle(
            color: isSelected ? AppColors.inkBlack : Colors.white70,
            fontSize: 10.5,
            fontWeight: FontWeight.w800,
          ),
        ),
      ),
    );
  }

  Widget _buildRoomChatStream() {
    if (_messages.isEmpty) {
      return Center(
        child: Text(
          "No messages in #$_activeChannel yet.\nSay hello!",
          textAlign: TextAlign.center,
          style: const TextStyle(color: Colors.white38, fontSize: 11),
        ),
      );
    }
    return ListView.builder(
      controller: _chatScrollController,
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
      itemCount: _messages.length,
      itemBuilder: (context, index) {
        final msg = _messages[index];
        final isSelf = msg.senderName == widget.displayName ||
            msg.senderId == AuthService.currentSession?.id;
        return Padding(
          padding: const EdgeInsets.only(bottom: 6),
          child: RichText(
            text: TextSpan(
              children: [
                TextSpan(
                  text: "${msg.senderName}: ",
                  style: TextStyle(
                    color: isSelf ? AppColors.primary : const Color(0xFF38BDF8),
                    fontWeight: FontWeight.bold,
                    fontSize: 11.5,
                  ),
                ),
                TextSpan(
                  text: msg.content,
                  style: const TextStyle(color: Colors.white, fontSize: 11.5),
                ),
              ],
            ),
          ),
        );
      },
    );
  }

  Widget _buildCompanionChatStream() {
    return ValueListenableBuilder<List<CompanionMessageModel>>(
      valueListenable: CompanionService.messages,
      builder: (context, compMsgs, _) {
        final isThinking = CompanionService.isThinking.value;
        if (compMsgs.isEmpty) {
          return const Center(
            child: Padding(
              padding: EdgeInsets.all(12),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Text("🤖", style: TextStyle(fontSize: 20)),
                  SizedBox(height: 4),
                  Text(
                    "Your AI Companion is ready!",
                    style: TextStyle(color: Colors.white, fontWeight: FontWeight.bold, fontSize: 12),
                  ),
                  SizedBox(height: 2),
                  Text(
                    "I learn your preferences and habits from scratch.",
                    textAlign: TextAlign.center,
                    style: TextStyle(color: Colors.white54, fontSize: 10.5),
                  ),
                ],
              ),
            ),
          );
        }
        return ListView.builder(
          controller: _companionChatScrollController,
          padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
          itemCount: compMsgs.length + (isThinking ? 1 : 0),
          itemBuilder: (context, index) {
            if (index == compMsgs.length && isThinking) {
              return const Padding(
                padding: EdgeInsets.symmetric(vertical: 4),
                child: Text(
                  "🤖 Companion is thinking...",
                  style: TextStyle(color: AppColors.accent, fontSize: 11, fontStyle: FontStyle.italic),
                ),
              );
            }
            final msg = compMsgs[index];
            final isAi = msg.isAi;
            return Padding(
              padding: const EdgeInsets.only(bottom: 6),
              child: RichText(
                text: TextSpan(
                  children: [
                    TextSpan(
                      text: isAi ? "🤖 ${CompanionService.currentCompanion.value?.name ?? 'Companion'}: " : "You: ",
                      style: TextStyle(
                        color: isAi ? const Color(0xFFC084FC) : AppColors.primary,
                        fontWeight: FontWeight.bold,
                        fontSize: 11.5,
                      ),
                    ),
                    TextSpan(
                      text: msg.content,
                      style: const TextStyle(color: Colors.white, fontSize: 11.5),
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

