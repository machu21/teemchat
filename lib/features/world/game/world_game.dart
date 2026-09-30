// ignore_for_file: deprecated_member_use
import 'package:flame/events.dart';
import 'package:flame/game.dart';
import 'package:flutter/services.dart';
import 'package:flutter/widgets.dart';
import '../../../core/models/avatar_model.dart';
import '../../../core/models/companion_model.dart';
import '../../../core/models/space_model.dart';
import '../../../core/services/livekit_service.dart';
import '../../../core/services/space_service.dart';
import '../../../core/services/world_sync_service.dart';
import 'components/companion_avatar.dart';
import 'components/furniture_item.dart';
import 'components/player_avatar.dart';
import 'components/remote_player_avatar.dart';
import 'components/tile_map.dart';

class WorldGame extends FlameGame
    with HasKeyboardHandlerComponents, HasCollisionDetection {
  final String displayName;
  final String status;
  final AvatarConfig avatarConfig;
  final SpaceModel space;
  final WorldSyncService? syncService;
  final LiveKitService? liveKitService;
  final ValueChanged<String>? onZoneChanged;

  late final PlayerAvatar player;
  late final WorldMapComponent map;

  CompanionAvatar? companionAvatar;
  CompanionModel? _pendingCompanion;
  VoidCallback? _onCompanionTap;

  final Set<LogicalKeyboardKey> _pressedKeys = {};
  Vector2 _joystickDirection = Vector2.zero();
  String _currentZone = "Verdant Village";

  // Build Mode properties
  bool isBuildMode = false;
  FurnitureType? selectedBuildType;
  final List<FurnitureComponent> userPlacedItems = [];
  final Map<String, RemotePlayerAvatar> remoteAvatars = {};

  void setCompanion(CompanionModel? companion, {VoidCallback? onTap}) {
    _onCompanionTap = onTap;
    if (companion == null || !companion.isActive) {
      if (companionAvatar != null) {
        remove(companionAvatar!);
        companionAvatar = null;
      }
      _pendingCompanion = null;
      return;
    }

    _pendingCompanion = companion;
    if (!isLoaded) return;

    if (companionAvatar != null) {
      companionAvatar!.updateCompanionData(companion);
    } else {
      companionAvatar = CompanionAvatar(
        player: player,
        companion: companion,
        onTap: _onCompanionTap,
      );
      add(companionAvatar!);
    }
  }

  void clearPressedKeys() {
    _pressedKeys.clear();
    _joystickDirection = Vector2.zero();
    if (isLoaded) {
      player.updateMovementInput(Vector2.zero());
    }
  }

  WorldGame({
    required this.displayName,
    required this.status,
    required this.avatarConfig,
    SpaceModel? space,
    this.syncService,
    this.liveKitService,
    this.onZoneChanged,
  }) : space = space ?? SpaceModel.defaultHQ();

  void toggleBuildMode(bool enabled) {
    isBuildMode = enabled;
    for (final item in userPlacedItems) {
      item.isHighlighted = enabled;
    }
  }

  void setSelectedFurniture(FurnitureType? type) {
    selectedBuildType = type;
  }

  @override
  Color backgroundColor() => const Color(0xFF6CB840);

  void clearUserFurniture() {
    for (final item in List<FurnitureComponent>.from(userPlacedItems)) {
      remove(item);
    }
    userPlacedItems.clear();
    if (space.canCustomizeMap && space.id.isNotEmpty) {
      SpaceService.clearWorldObjects(space.id);
    }
  }

  Future<void> _loadCloudObjects() async {
    if (!space.canCustomizeMap || space.id.isEmpty) return;
    try {
      final cloudObjects = await SpaceService.fetchWorldObjects(space.id);
      for (final obj in cloudObjects) {
        final type = FurnitureType.fromString(obj.objectType);
        late final FurnitureComponent comp;
        comp = FurnitureComponent(
          type: type,
          position: Vector2(obj.x, obj.y),
          isUserPlaced: true,
          dbId: obj.id,
          onDelete: () {
            if (comp.dbId != null) {
              SpaceService.deleteWorldObject(comp.dbId!);
            }
            remove(comp);
            userPlacedItems.remove(comp);
          },
        );
        userPlacedItems.add(comp);
        await add(comp);
      }
    } catch (e) {
      debugPrint("Error loading cloud objects in world game: $e");
    }
  }

  /// Called from Flutter GestureDetector (world_screen.dart) when user taps
  /// in Build Mode. [screenX] and [screenY] are logical pixels relative to
  /// the top-left of the GameWidget.
  void placeFurnitureAtScreen(double screenX, double screenY, Size widgetSize) {
    if (!isBuildMode || selectedBuildType == null) return;

    final worldX = camera.position.x + screenX / camera.zoom;
    final worldY = camera.position.y + screenY / camera.zoom;

    // Snap to 20-pixel grid and clamp within map bounds
    final snappedX = ((worldX ~/ 20) * 20.0).clamp(
      WorldMapComponent.wallThick + 10,
      WorldMapComponent.mapWidth - WorldMapComponent.wallThick - 90,
    );
    final snappedY = ((worldY ~/ 20) * 20.0).clamp(
      WorldMapComponent.wallThick + 10,
      WorldMapComponent.mapHeight - WorldMapComponent.wallThick - 60,
    );

    late final FurnitureComponent newItem;
    newItem = FurnitureComponent(
      type: selectedBuildType!,
      position: Vector2(snappedX, snappedY),
      isUserPlaced: true,
      onDelete: () {
        if (newItem.dbId != null) {
          SpaceService.deleteWorldObject(newItem.dbId!);
        }
        remove(newItem);
        userPlacedItems.remove(newItem);
      },
    );
    newItem.isHighlighted = true;
    userPlacedItems.add(newItem);
    add(newItem);

    // If space allows cloud map persistence, save immediately
    if (space.canCustomizeMap && space.id.isNotEmpty) {
      SpaceService.saveWorldObject(
        WorldObjectModel(
          id: '',
          spaceId: space.id,
          objectType: selectedBuildType!.name,
          x: snappedX,
          y: snappedY,
        ),
      ).then((saved) {
        if (saved != null) {
          newItem.dbId = saved.id;
        }
      });
    }
  }

  int frameCount = 0;
  int updateCount = 0;

  @override
  void onMount() {
    super.onMount();
    debugPrint(">>> [WorldGame] onMount() called! hasLayout = $hasLayout");
  }

  @override
  void onGameResize(Vector2 size) {
    super.onGameResize(size);
    debugPrint(">>> [WorldGame] onGameResize() size = $size");
  }

  @override
  Future<void> onLoad() async {
    await super.onLoad();
    debugPrint(">>> [WorldGame] onLoad() started...");

    try {
      debugPrint(">>> [WorldGame] Loading WorldMapComponent (size: ${WorldMapComponent.mapWidth}x${WorldMapComponent.mapHeight})...");
      map = WorldMapComponent();
      await add(map);
      debugPrint(">>> [WorldGame] WorldMapComponent added & loaded.");

      debugPrint(">>> [WorldGame] Spawning PlayerAvatar at (300, 260)...");
      player = PlayerAvatar(
        position: Vector2(300, 260),
        displayName: displayName,
        status: status,
        config: avatarConfig,
      );
      await add(player);
      debugPrint(">>> [WorldGame] PlayerAvatar added & loaded.");

      camera.worldBounds = const Rect.fromLTWH(
        0,
        0,
        WorldMapComponent.mapWidth,
        WorldMapComponent.mapHeight,
      );
      camera.followComponent(player);
      camera.zoom = 1.25;
      debugPrint(">>> [WorldGame] Camera attached. Position=${camera.position}, Zoom=${camera.zoom}");

      // Connect to real-time sync service listener
      syncService?.remotePlayers.addListener(_onRemotePlayersChanged);

      // Load any persisted world items if on paid tier (non-blocking)
      if (space.canCustomizeMap && space.id.isNotEmpty) {
        _loadCloudObjects().catchError((e) {
          debugPrint("Could not fetch cloud objects: $e");
        });
      }

      // Attach pending AI companion if configured
      if (_pendingCompanion != null) {
        setCompanion(_pendingCompanion, onTap: _onCompanionTap);
      }

      debugPrint(">>> [WorldGame] onLoad completed successfully! isLoaded=$isLoaded");
    } catch (e, st) {
      debugPrint(">>> [WorldGame] FATAL onLoad error: $e\n$st");
      rethrow;
    }
  }

  @override
  void render(Canvas canvas) {
    frameCount++;
    if (frameCount <= 5 || frameCount % 180 == 0) {
      final cSize = hasLayout ? canvasSize : Vector2.zero();
      debugPrint(">>> [WorldGame] render() frame #$frameCount | canvasSize: $cSize | camera.pos: ${camera.position} | player: ${player.position}");
    }
    super.render(canvas);
  }

  void _onRemotePlayersChanged() {
    if (syncService == null) return;
    final players = syncService!.remotePlayers.value;

    // Add or update remote player components
    for (final entry in players.entries) {
      final userId = entry.key;
      final state = entry.value;

      if (!remoteAvatars.containsKey(userId)) {
        final avatar = RemotePlayerAvatar(
          userId: userId,
          displayName: state.displayName,
          config: state.avatarConfig,
          position: Vector2(state.x, state.y),
        );
        remoteAvatars[userId] = avatar;
        add(avatar);
      } else {
        final avatar = remoteAvatars[userId]!;
        avatar.updateState(
          newX: state.x,
          newY: state.y,
          direction: state.direction,
          moving: state.isMoving,
          speech: state.speechBubble,
          expiresAt: state.speechExpiresAt,
        );
      }
    }

    // Remove disconnected
    remoteAvatars.removeWhere((userId, avatar) {
      if (!players.containsKey(userId)) {
        remove(avatar);
        return true;
      }
      return false;
    });
  }

  @override
  void onRemove() {
    syncService?.remotePlayers.removeListener(_onRemotePlayersChanged);
    super.onRemove();
  }

  @override
  void update(double dt) {
    super.update(dt);
    updateCount++;
    if (updateCount <= 5 || updateCount % 180 == 0) {
      debugPrint(">>> [WorldGame] update() tick #$updateCount | dt: ${dt.toStringAsFixed(3)} | player: ${player.position}");
    }

    // Update swimming status based on world tile under player feet
    final inWater = WorldMapComponent.isPositionInWater(player.position);
    if (player.isSwimming != inWater) {
      player.isSwimming = inWater;
    }

    // Broadcast local player movement to other players in the space
    try {
      syncService?.broadcastMovement(
        x: player.position.x,
        y: player.position.y,
        direction: player.facing.name,
        isMoving: player.isMoving,
      );
    } catch (e) {
      debugPrint(">>> [WorldGame] broadcastMovement error: $e");
    }

    // Calculate proximity audio distances to all remote players for LiveKit spatial audio
    try {
      if (liveKitService != null && remoteAvatars.isNotEmpty) {
        final Map<String, double> distances = {};
        for (final entry in remoteAvatars.entries) {
          distances[entry.key] = player.position.distanceTo(entry.value.position);
        }
        liveKitService!.updateProximityAudio(distances);
      }
    } catch (e) {
      debugPrint(">>> [WorldGame] updateProximityAudio error: $e");
    }

    // Track active zone and notify HUD
    final zone = WorldMapComponent.getZoneName(player.position);
    if (zone != _currentZone) {
      _currentZone = zone;
      onZoneChanged?.call(_currentZone);
    }
  }

  void setJoystickDirection(Vector2 direction) {
    _joystickDirection = direction;
    _updateCombinedInput();
  }

  @override
  KeyEventResult onKeyEvent(
      RawKeyEvent event, Set<LogicalKeyboardKey> keysPressed) {
    super.onKeyEvent(event, keysPressed);
    _pressedKeys.clear();
    _pressedKeys.addAll(keysPressed);
    _updateCombinedInput();
    return KeyEventResult.handled;
  }

  void _updateCombinedInput() {
    final keyboardVector = Vector2.zero();

    if (_pressedKeys.contains(LogicalKeyboardKey.keyW) ||
        _pressedKeys.contains(LogicalKeyboardKey.arrowUp)) {
      keyboardVector.y -= 1;
    }
    if (_pressedKeys.contains(LogicalKeyboardKey.keyS) ||
        _pressedKeys.contains(LogicalKeyboardKey.arrowDown)) {
      keyboardVector.y += 1;
    }
    if (_pressedKeys.contains(LogicalKeyboardKey.keyA) ||
        _pressedKeys.contains(LogicalKeyboardKey.arrowLeft)) {
      keyboardVector.x -= 1;
    }
    if (_pressedKeys.contains(LogicalKeyboardKey.keyD) ||
        _pressedKeys.contains(LogicalKeyboardKey.arrowRight)) {
      keyboardVector.x += 1;
    }

    if (_joystickDirection.length > 0.05) {
      player.updateMovementInput(_joystickDirection);
    } else {
      player.updateMovementInput(keyboardVector);
    }
  }
}
