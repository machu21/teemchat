import 'package:flame/collisions.dart';
import 'package:flame/components.dart';
import 'package:flame/events.dart';
import 'package:flutter/material.dart';
import '../../../../core/constants/app_colors.dart';

enum FurnitureType {
  pineTree,
  berryBush,
  flowerPatch,
  tallGrass,
  campfire,
  tent,
  logBench,
  woodenSign,
  boulder,
  stoneWell,
  streetLantern,
  woodenFence;

  static FurnitureType fromString(String val) {
    for (final t in FurnitureType.values) {
      if (t.name == val) return t;
    }
    return FurnitureType.campfire;
  }
}

/// Authentic GBA 16-bit / 32-bit pixel-art world prop.
/// All graphics are drawn strictly on a pixel grid using colored rects
/// with dark outlines, true GBA palette steps, and zero vector circles or smooth curves.
class FurnitureComponent extends PositionComponent
    with CollisionCallbacks, TapCallbacks {
  final FurnitureType type;
  final bool isUserPlaced;
  final VoidCallback? onDelete;
  String? dbId;
  bool isHighlighted = false;

  FurnitureComponent({
    required this.type,
    required Vector2 position,
    this.isUserPlaced = false,
    this.onDelete,
    this.dbId,
  }) : super(
          position: position,
          size: _getSizeForType(type),
        ) {
    final hit = _getHitboxForType(type, size);
    if (hit.size.x > 0 && hit.size.y > 0) {
      add(RectangleHitbox(
        position: hit.position,
        size: hit.size,
        isSolid: true,
      ));
    }
  }

  static Vector2 _getSizeForType(FurnitureType t) {
    switch (t) {
      case FurnitureType.pineTree:
        return Vector2(60, 72);
      case FurnitureType.berryBush:
        return Vector2(40, 36);
      case FurnitureType.flowerPatch:
        return Vector2(40, 28);
      case FurnitureType.tallGrass:
        return Vector2(44, 36);
      case FurnitureType.campfire:
        return Vector2(44, 40);
      case FurnitureType.tent:
        return Vector2(64, 52);
      case FurnitureType.logBench:
        return Vector2(48, 28);
      case FurnitureType.woodenSign:
        return Vector2(32, 36);
      case FurnitureType.boulder:
        return Vector2(44, 36);
      case FurnitureType.stoneWell:
        return Vector2(48, 54);
      case FurnitureType.streetLantern:
        return Vector2(24, 48);
      case FurnitureType.woodenFence:
        return Vector2(48, 24);
    }
  }

  static ({Vector2 position, Vector2 size}) _getHitboxForType(
      FurnitureType t, Vector2 s) {
    switch (t) {
      case FurnitureType.flowerPatch:
      case FurnitureType.tallGrass:
        // Walkable foliage (classic Pokémon grass feel)
        return (position: Vector2.zero(), size: Vector2.zero());
      case FurnitureType.pineTree:
        // Trunk-level collision so players can walk behind canopy
        return (position: Vector2(20, 50), size: Vector2(20, 18));
      case FurnitureType.berryBush:
        return (position: Vector2(4, 16), size: Vector2(32, 16));
      case FurnitureType.campfire:
        return (position: Vector2(8, 16), size: Vector2(28, 20));
      case FurnitureType.tent:
        return (position: Vector2(6, 22), size: Vector2(52, 26));
      case FurnitureType.logBench:
        return (position: Vector2(4, 10), size: Vector2(40, 16));
      case FurnitureType.woodenSign:
        return (position: Vector2(10, 20), size: Vector2(12, 14));
      case FurnitureType.boulder:
        return (position: Vector2(6, 10), size: Vector2(32, 22));
      case FurnitureType.stoneWell:
        return (position: Vector2(6, 22), size: Vector2(36, 26));
      case FurnitureType.streetLantern:
        return (position: Vector2(8, 30), size: Vector2(8, 14));
      case FurnitureType.woodenFence:
        return (position: Vector2(2, 6), size: Vector2(44, 16));
    }
  }

  @override
  void onTapDown(TapDownEvent event) {
    if (isUserPlaced && isHighlighted) {
      onDelete?.call();
    }
  }

  static final Paint _paint = Paint()
    ..isAntiAlias = false
    ..filterQuality = FilterQuality.none;

  static void _px(Canvas c, double x, double y, double w, double h, Color col) {
    _paint.color = col;
    c.drawRect(Rect.fromLTWH(x, y, w, h), _paint);
  }

  static void _p(Canvas c, int x, int y, Color col, {double s = 2.0}) {
    _px(c, x * s, y * s, s, s, col);
  }

  static void _span(Canvas c, int y, int x1, int x2, Color col, {double s = 2.0}) {
    _px(c, x1 * s, y * s, (x2 - x1 + 1) * s, s, col);
  }

  @override
  void render(Canvas canvas) {
    super.render(canvas);

    // Pixel drop shadow under solid props
    if (type != FurnitureType.flowerPatch && type != FurnitureType.tallGrass) {
      _px(canvas, 6, size.y - 6, size.x - 12, 6, const Color(0x38000000));
      _px(canvas, 10, size.y - 8, size.x - 20, 2, const Color(0x24000000));
    }

    switch (type) {
      case FurnitureType.pineTree:
        _renderPineTree(canvas);
        break;
      case FurnitureType.berryBush:
        _renderBerryBush(canvas);
        break;
      case FurnitureType.flowerPatch:
        _renderFlowerPatch(canvas);
        break;
      case FurnitureType.tallGrass:
        _renderTallGrass(canvas);
        break;
      case FurnitureType.campfire:
        _renderCampfire(canvas);
        break;
      case FurnitureType.tent:
        _renderTent(canvas);
        break;
      case FurnitureType.logBench:
        _renderLogBench(canvas);
        break;
      case FurnitureType.woodenSign:
        _renderWoodenSign(canvas);
        break;
      case FurnitureType.boulder:
        _renderBoulder(canvas);
        break;
      case FurnitureType.stoneWell:
        _renderStoneWell(canvas);
        break;
      case FurnitureType.streetLantern:
        _renderStreetLantern(canvas);
        break;
      case FurnitureType.woodenFence:
        _renderWoodenFence(canvas);
        break;
    }

    // Build mode highlight ring & delete button
    if (isHighlighted) {
      final ringPaint = Paint()
        ..color = isUserPlaced ? Colors.redAccent : AppColors.primary
        ..style = PaintingStyle.stroke
        ..strokeWidth = 2.0;
      canvas.drawRect(
        Rect.fromLTWH(-2, -2, size.x + 4, size.y + 4),
        ringPaint,
      );

      if (isUserPlaced) {
        final delPaint = Paint()..color = Colors.redAccent;
        canvas.drawCircle(Offset(size.x, 0), 8, delPaint);
        final xPaint = Paint()
          ..color = Colors.white
          ..strokeWidth = 2;
        canvas.drawLine(Offset(size.x - 3, -3), Offset(size.x + 3, 3), xPaint);
        canvas.drawLine(Offset(size.x + 3, -3), Offset(size.x - 3, 3), xPaint);
      }
    }
  }

  // ================================================================
  //  1. GBA POKÉMON PINE TREE (30x36 pixel grid scaled 2x = 60x72)
  // ================================================================
  void _renderPineTree(Canvas canvas) {
    const double s = 2.0;
    const out = Color(0xFF1A4018);
    const darkG = Color(0xFF3A7830);
    const midG = Color(0xFF52A842);
    const lightG = Color(0xFF80D858);
    const crownG = Color(0xFFA8F078);
    const trunk = Color(0xFF8B5E2C);
    const trunkDk = Color(0xFF5C3A18);
    const trunkLt = Color(0xFFB07840);

    // Trunk (bottom rows 25..35)
    for (int y = 25; y <= 34; y++) {
      _span(canvas, y, 11, 18, trunk, s: s);
      _span(canvas, y, 11, 12, trunkLt, s: s);
      _span(canvas, y, 17, 18, trunkDk, s: s);
      _p(canvas, 10, y, out, s: s);
      _p(canvas, 19, y, out, s: s);
    }
    // Root base
    _span(canvas, 34, 9, 20, trunkDk, s: s);
    _span(canvas, 35, 8, 21, out, s: s);

    // Layer 1: Top Canopy (rows 2..12)
    _span(canvas, 2, 13, 16, out, s: s);
    _span(canvas, 3, 11, 18, out, s: s);
    _span(canvas, 3, 12, 17, crownG, s: s);
    for (int y = 4; y <= 7; y++) {
      _span(canvas, y, 14 - y, 15 + y, midG, s: s);
      _p(canvas, 13 - y, y, out, s: s);
      _p(canvas, 16 + y, y, out, s: s);
      _span(canvas, y, 14 - y + 1, 14, crownG, s: s);
    }
    for (int y = 8; y <= 11; y++) {
      _span(canvas, y, 6, 23, midG, s: s);
      _span(canvas, y, 7, 13, lightG, s: s);
      _span(canvas, y, 19, 22, darkG, s: s);
      _p(canvas, 5, y, out, s: s);
      _p(canvas, 24, y, out, s: s);
    }
    _span(canvas, 12, 6, 23, darkG, s: s);
    _span(canvas, 13, 7, 22, out, s: s);

    // Layer 2: Mid Canopy (rows 11..20)
    for (int y = 12; y <= 18; y++) {
      int left = 16 - y;
      if (left < 3) left = 3;
      int right = 13 + y;
      if (right > 26) right = 26;
      _span(canvas, y, left, right, midG, s: s);
      _span(canvas, y, left + 1, left + 6, lightG, s: s);
      _span(canvas, y, right - 5, right - 1, darkG, s: s);
      _p(canvas, left - 1, y, out, s: s);
      _p(canvas, right + 1, y, out, s: s);
    }
    _span(canvas, 19, 4, 25, darkG, s: s);
    _span(canvas, 20, 5, 24, out, s: s);

    // Layer 3: Lower Canopy (rows 18..27)
    for (int y = 19; y <= 25; y++) {
      int left = 20 - y;
      if (left < 1) left = 1;
      int right = 9 + y;
      if (right > 28) right = 28;
      _span(canvas, y, left, right, midG, s: s);
      _span(canvas, y, left + 1, left + 7, lightG, s: s);
      _span(canvas, y, right - 6, right - 1, darkG, s: s);
      _p(canvas, left - 1, y, out, s: s);
      _p(canvas, right + 1, y, out, s: s);
    }
    _span(canvas, 26, 2, 27, darkG, s: s);
    _span(canvas, 27, 3, 26, out, s: s);
  }

  // ================================================================
  //  2. BERRY BUSH (20x18 pixel grid scaled 2x = 40x36)
  // ================================================================
  void _renderBerryBush(Canvas canvas) {
    const double s = 2.0;
    const out = Color(0xFF1A4818);
    const darkG = Color(0xFF389028);
    const midG = Color(0xFF50B838);
    const lightG = Color(0xFF88E058);
    const berryR = Color(0xFFEF4444);
    const berryB = Color(0xFF60A5FA);
    const glint = Color(0xFFFFFFFF);

    // Outline dome
    _span(canvas, 2, 6, 13, out, s: s);
    _span(canvas, 3, 4, 15, out, s: s);

    // Bush Body
    for (int y = 4; y <= 15; y++) {
      int x1 = (y < 7) ? 3 : (y < 13 ? 1 : 2);
      int x2 = (y < 7) ? 16 : (y < 13 ? 18 : 17);
      _span(canvas, y, x1, x2, midG, s: s);
      _p(canvas, x1 - 1, y, out, s: s);
      _p(canvas, x2 + 1, y, out, s: s);

      // Sunlit highlights (top-left)
      if (y <= 8) {
        _span(canvas, y, x1 + 1, x1 + 6, lightG, s: s);
      }
      // Shadows (bottom-right)
      if (y >= 10) {
        _span(canvas, y, x2 - 5, x2 - 1, darkG, s: s);
      }
    }
    _span(canvas, 16, 2, 17, darkG, s: s);
    _span(canvas, 17, 3, 16, out, s: s);

    // Berries with highlights
    void drawBerry(int bx, int by, Color col) {
      _p(canvas, bx, by, col, s: s);
      _p(canvas, bx + 1, by, col, s: s);
      _p(canvas, bx, by + 1, col, s: s);
      _p(canvas, bx + 1, by + 1, col, s: s);
      _p(canvas, bx, by, glint, s: s); // shine glint
    }

    drawBerry(4, 7, berryR);
    drawBerry(12, 6, berryB);
    drawBerry(8, 10, berryR);
    drawBerry(14, 11, berryR);
    drawBerry(5, 12, berryB);
  }

  // ================================================================
  //  3. FLOWER PATCH (20x14 pixel grid scaled 2x = 40x28)
  // ================================================================
  void _renderFlowerPatch(Canvas canvas) {
    const double s = 2.0;
    const leafDk = Color(0xFF3A8028);
    const leafLt = Color(0xFF70C848);

    // Foliage bed
    _span(canvas, 7, 3, 16, leafDk, s: s);
    _span(canvas, 8, 2, 17, leafLt, s: s);
    _span(canvas, 9, 1, 18, leafDk, s: s);
    _span(canvas, 10, 2, 17, leafLt, s: s);
    _span(canvas, 11, 4, 15, leafDk, s: s);

    // 4-petal flower helper
    void flower(int fx, int fy, Color petal, Color center) {
      _p(canvas, fx + 1, fy, petal, s: s);
      _p(canvas, fx, fy + 1, petal, s: s);
      _p(canvas, fx + 2, fy + 1, petal, s: s);
      _p(canvas, fx + 1, fy + 2, petal, s: s);
      _p(canvas, fx + 1, fy + 1, center, s: s);
      _p(canvas, fx + 1, fy + 3, const Color(0xFF206010), s: s); // stem
    }

    flower(3, 4, const Color(0xFFF43F5E), const Color(0xFFFEF08A)); // Red poppy
    flower(8, 2, const Color(0xFFFACC15), const Color(0xFF78350F)); // Sunflower
    flower(14, 4, const Color(0xFF38BDF8), const Color(0xFFFFFFFF)); // Bluebell
    flower(6, 7, const Color(0xFFFFFFFF), const Color(0xFFFACC15)); // Daisy
    flower(12, 7, const Color(0xFFA855F7), const Color(0xFFFEF08A)); // Violet
  }

  // ================================================================
  //  4. TALL GRASS (22x18 pixel grid scaled 2x = 44x36)
  // ================================================================
  void _renderTallGrass(Canvas canvas) {
    const double s = 2.0;
    const out = Color(0xFF2A5820);
    const darkG = Color(0xFF3E8828);
    const midG = Color(0xFF60B838);
    const lightG = Color(0xFF98E860);

    // Authentic Pokémon GBA tufts
    void tuft(int x, int y) {
      // Blade 1
      _p(canvas, x + 1, y, lightG, s: s);
      _p(canvas, x + 1, y + 1, midG, s: s);
      _p(canvas, x + 1, y + 2, darkG, s: s);
      // Blade 2 (tall center)
      _p(canvas, x + 3, y - 2, lightG, s: s);
      _p(canvas, x + 3, y - 1, lightG, s: s);
      _p(canvas, x + 3, y, midG, s: s);
      _p(canvas, x + 3, y + 1, midG, s: s);
      _p(canvas, x + 3, y + 2, darkG, s: s);
      // Blade 3
      _p(canvas, x + 5, y - 1, lightG, s: s);
      _p(canvas, x + 5, y, midG, s: s);
      _p(canvas, x + 5, y + 1, darkG, s: s);
      _p(canvas, x + 5, y + 2, darkG, s: s);
      // Base
      _span(canvas, y + 3, x, x + 6, darkG, s: s);
      _span(canvas, y + 4, x + 1, x + 5, out, s: s);
    }

    tuft(2, 6);
    tuft(12, 4);
    tuft(5, 11);
    tuft(14, 10);
  }

  // ================================================================
  //  5. CAMPFIRE (22x20 pixel grid scaled 2x = 44x40)
  // ================================================================
  void _renderCampfire(Canvas canvas) {
    const double s = 2.0;
    const rock = Color(0xFF889098);
    const rockDk = Color(0xFF586068);
    const rockLt = Color(0xFFB8C0C8);
    const log = Color(0xFF784018);
    const logDk = Color(0xFF482008);
    const fireR = Color(0xFFE82810);
    const fireO = Color(0xFFF87810);
    const fireY = Color(0xFFFFD830);
    const fireW = Color(0xFFFFF8D0);

    // Stone ring (bottom rows 12..17)
    void stone(int sx, int sy, int sw) {
      _span(canvas, sy, sx, sx + sw - 1, rockLt, s: s);
      _span(canvas, sy + 1, sx, sx + sw - 1, rock, s: s);
      _span(canvas, sy + 2, sx, sx + sw - 1, rockDk, s: s);
    }

    stone(2, 13, 4);
    stone(7, 15, 7);
    stone(15, 13, 4);
    stone(4, 11, 4);
    stone(13, 11, 4);

    // Charcoal & ash center
    _span(canvas, 13, 6, 14, const Color(0xFF282018), s: s);
    _span(canvas, 14, 6, 14, const Color(0xFF181008), s: s);

    // Crossed logs
    _span(canvas, 12, 5, 15, logDk, s: s);
    _span(canvas, 13, 7, 13, log, s: s);

    // Layered pixel flame (rows 2..12)
    // Red outer flame
    _span(canvas, 3, 10, 11, fireR, s: s);
    _span(canvas, 4, 9, 12, fireR, s: s);
    _span(canvas, 5, 8, 13, fireR, s: s);
    _span(canvas, 6, 7, 14, fireR, s: s);
    _span(canvas, 7, 6, 14, fireR, s: s);
    _span(canvas, 8, 6, 14, fireR, s: s);
    _span(canvas, 9, 7, 13, fireR, s: s);

    // Orange inner flame
    _span(canvas, 5, 10, 11, fireO, s: s);
    _span(canvas, 6, 9, 12, fireO, s: s);
    _span(canvas, 7, 8, 13, fireO, s: s);
    _span(canvas, 8, 8, 12, fireO, s: s);
    _span(canvas, 9, 8, 12, fireO, s: s);
    _span(canvas, 10, 9, 11, fireO, s: s);

    // Yellow / White core
    _span(canvas, 7, 10, 11, fireY, s: s);
    _span(canvas, 8, 9, 11, fireY, s: s);
    _p(canvas, 10, 8, fireW, s: s);
    _p(canvas, 10, 9, fireW, s: s);
  }

  // ================================================================
  //  6. CAMP TENT (32x26 pixel grid scaled 2x = 64x52)
  // ================================================================
  void _renderTent(Canvas canvas) {
    const double s = 2.0;
    const out = Color(0xFF182830);
    const cloth = Color(0xFF3888A8);
    const clothLt = Color(0xFF58B0D0);
    const clothDk = Color(0xFF205870);
    const peg = Color(0xFF704018);

    // Tent Ridge (row 3)
    _span(canvas, 3, 14, 17, out, s: s);

    // Triangular A-frame body
    for (int y = 4; y <= 21; y++) {
      int w = (y - 3) * 2;
      int x1 = 15 - (w ~/ 2);
      int x2 = 15 + (w ~/ 2);
      if (x1 < 3) x1 = 3;
      if (x2 > 28) x2 = 28;

      _span(canvas, y, x1, x2, cloth, s: s);
      _span(canvas, y, x1, x1 + 3, clothLt, s: s); // sunlit left panel
      _span(canvas, y, x2 - 3, x2, clothDk, s: s); // shaded right panel

      _p(canvas, x1 - 1, y, out, s: s);
      _p(canvas, x2 + 1, y, out, s: s);
    }

    // Doorway opening (dark void inside)
    for (int y = 14; y <= 21; y++) {
      int dw = (y - 13);
      _span(canvas, y, 15 - dw, 15 + dw, const Color(0xFF101820), s: s);
    }

    // Ground pegs & guy lines
    _p(canvas, 1, 22, peg, s: s);
    _p(canvas, 29, 22, peg, s: s);
    _span(canvas, 22, 3, 27, out, s: s);
  }

  // ================================================================
  //  7. LOG BENCH (24x14 pixel grid scaled 2x = 48x28)
  // ================================================================
  void _renderLogBench(Canvas canvas) {
    const double s = 2.0;
    const out = Color(0xFF301808);
    const wood = Color(0xFF885020);
    const woodLt = Color(0xFFB07838);
    const woodDk = Color(0xFF583010);
    const rings = Color(0xFFD8A868);

    // Legs
    for (int y = 7; y <= 12; y++) {
      _span(canvas, y, 3, 5, woodDk, s: s);
      _span(canvas, y, 18, 20, woodDk, s: s);
      _p(canvas, 2, y, out, s: s);
      _p(canvas, 6, y, out, s: s);
      _p(canvas, 17, y, out, s: s);
      _p(canvas, 21, y, out, s: s);
    }

    // Main Log (rows 3..8)
    _span(canvas, 2, 2, 21, out, s: s);
    _span(canvas, 3, 2, 21, woodLt, s: s);
    _span(canvas, 4, 1, 22, wood, s: s);
    _span(canvas, 5, 1, 22, wood, s: s);
    _span(canvas, 6, 1, 22, woodDk, s: s);
    _span(canvas, 7, 2, 21, woodDk, s: s);
    _span(canvas, 8, 2, 21, out, s: s);

    // End tree rings (cut timber detail)
    _p(canvas, 1, 4, rings, s: s);
    _p(canvas, 1, 5, rings, s: s);
    _p(canvas, 22, 4, rings, s: s);
    _p(canvas, 22, 5, rings, s: s);
  }

  // ================================================================
  //  8. WOODEN SIGN (16x18 pixel grid scaled 2x = 32x36)
  // ================================================================
  void _renderWoodenSign(Canvas canvas) {
    const double s = 2.0;
    const out = Color(0xFF382010);
    const board = Color(0xFF986030);
    const boardLt = Color(0xFFC08848);
    const boardDk = Color(0xFF683818);
    const textCol = Color(0xFF402410);

    // Post (rows 9..17)
    for (int y = 9; y <= 16; y++) {
      _span(canvas, y, 7, 8, boardDk, s: s);
      _p(canvas, 6, y, out, s: s);
      _p(canvas, 9, y, out, s: s);
    }
    _span(canvas, 17, 6, 9, out, s: s);

    // Signboard (rows 2..9)
    _span(canvas, 1, 2, 13, out, s: s);
    _span(canvas, 2, 2, 13, boardLt, s: s);
    for (int y = 3; y <= 7; y++) {
      _span(canvas, y, 2, 13, board, s: s);
      _p(canvas, 1, y, out, s: s);
      _p(canvas, 14, y, out, s: s);
    }
    _span(canvas, 8, 2, 13, boardDk, s: s);
    _span(canvas, 9, 2, 13, out, s: s);

    // Pixel scribble text
    _span(canvas, 4, 4, 11, textCol, s: s);
    _span(canvas, 6, 5, 10, textCol, s: s);
  }

  // ================================================================
  //  9. BOULDER (22x18 pixel grid scaled 2x = 44x36)
  // ================================================================
  void _renderBoulder(Canvas canvas) {
    const double s = 2.0;
    const out = Color(0xFF282830);
    const rock = Color(0xFF687078);
    const rockLt = Color(0xFF98A0A8);
    const rockHi = Color(0xFFC8D0D8);
    const rockDk = Color(0xFF404850);

    _span(canvas, 2, 7, 14, out, s: s);
    _span(canvas, 3, 5, 16, rockHi, s: s);
    _span(canvas, 4, 3, 17, rockLt, s: s);

    for (int y = 5; y <= 13; y++) {
      int x1 = (y < 7) ? 2 : 1;
      int x2 = (y < 7) ? 18 : 20;
      _span(canvas, y, x1, x2, rock, s: s);
      _p(canvas, x1 - 1, y, out, s: s);
      _p(canvas, x2 + 1, y, out, s: s);

      // Light on top-left facets
      if (y <= 8) _span(canvas, y, x1 + 1, x1 + 5, rockLt, s: s);
      // Dark on bottom-right
      if (y >= 9) _span(canvas, y, x2 - 5, x2 - 1, rockDk, s: s);
    }

    _span(canvas, 14, 2, 19, rockDk, s: s);
    _span(canvas, 15, 3, 18, out, s: s);

    // Crack detail
    _p(canvas, 8, 7, out, s: s);
    _p(canvas, 9, 8, out, s: s);
    _p(canvas, 8, 9, out, s: s);
  }

  // ================================================================
  //  10. STONE WELL (24x27 pixel grid scaled 2x = 48x54)
  // ================================================================
  void _renderStoneWell(Canvas canvas) {
    const double s = 2.0;
    const out = Color(0xFF202028);
    const roof = Color(0xFFA03020);
    const roofDk = Color(0xFF681810);
    const roofLt = Color(0xFFD04838);
    const beam = Color(0xFF704020);
    const stone = Color(0xFF788088);
    const stoneLt = Color(0xFFA0A8B0);
    const stoneDk = Color(0xFF485058);

    // Pitched Roof (rows 1..7)
    _span(canvas, 1, 10, 13, out, s: s);
    for (int y = 2; y <= 6; y++) {
      int w = (y - 1) * 3;
      int x1 = 11 - (w ~/ 2);
      int x2 = 12 + (w ~/ 2);
      _span(canvas, y, x1, x2, roof, s: s);
      _span(canvas, y, x1, x1 + 2, roofLt, s: s);
      _span(canvas, y, x2 - 2, x2, roofDk, s: s);
      _p(canvas, x1 - 1, y, out, s: s);
      _p(canvas, x2 + 1, y, out, s: s);
    }
    _span(canvas, 7, 2, 21, out, s: s);

    // Support beams (rows 8..15)
    for (int y = 8; y <= 15; y++) {
      _span(canvas, y, 4, 5, beam, s: s);
      _span(canvas, y, 18, 19, beam, s: s);
      _p(canvas, 3, y, out, s: s);
      _p(canvas, 6, y, out, s: s);
      _p(canvas, 17, y, out, s: s);
      _p(canvas, 20, y, out, s: s);
    }

    // Well stone base (rows 16..24)
    for (int y = 16; y <= 23; y++) {
      _span(canvas, y, 3, 20, stone, s: s);
      _span(canvas, y, 4, 8, stoneLt, s: s);
      _span(canvas, y, 15, 19, stoneDk, s: s);
      _p(canvas, 2, y, out, s: s);
      _p(canvas, 21, y, out, s: s);
      // Mortar lines
      if (y % 2 == 0) _span(canvas, y, 3, 20, out, s: s);
    }
    _span(canvas, 24, 3, 20, out, s: s);

    // Water opening / rope
    _span(canvas, 16, 8, 15, const Color(0xFF183858), s: s);
    _p(canvas, 11, 12, const Color(0xFFC0A060), s: s); // rope
    _p(canvas, 11, 13, const Color(0xFFC0A060), s: s);
  }

  // ================================================================
  //  11. STREET LANTERN (12x24 pixel grid scaled 2x = 24x48)
  // ================================================================
  void _renderStreetLantern(Canvas canvas) {
    const double s = 2.0;
    const iron = Color(0xFF282830);
    const ironLt = Color(0xFF485060);
    const glass = Color(0xFFFDE047);
    const glow = Color(0xFFFEF9C3);

    // Cap (rows 2..4)
    _span(canvas, 2, 4, 7, iron, s: s);
    _span(canvas, 3, 3, 8, iron, s: s);
    _span(canvas, 4, 2, 9, iron, s: s);

    // Glass lantern housing (rows 5..9)
    for (int y = 5; y <= 9; y++) {
      _span(canvas, y, 3, 8, glass, s: s);
      _p(canvas, 2, y, iron, s: s);
      _p(canvas, 9, y, iron, s: s);
      _p(canvas, 5, y, glow, s: s);
      _p(canvas, 6, y, glow, s: s);
    }
    _span(canvas, 10, 2, 9, iron, s: s);

    // Post (rows 11..21)
    for (int y = 11; y <= 21; y++) {
      _span(canvas, y, 5, 6, iron, s: s);
      _p(canvas, 5, y, ironLt, s: s);
    }

    // Base (rows 22..23)
    _span(canvas, 22, 4, 7, iron, s: s);
    _span(canvas, 23, 3, 8, iron, s: s);
  }

  // ================================================================
  //  12. WOODEN FENCE (24x12 pixel grid scaled 2x = 48x24)
  // ================================================================
  void _renderWoodenFence(Canvas canvas) {
    const double s = 2.0;
    const out = Color(0xFF382010);
    const wood = Color(0xFF885020);
    const woodLt = Color(0xFFB07838);
    const woodDk = Color(0xFF583010);

    // Horizontal rails (rows 3..4 and 7..8)
    _span(canvas, 3, 1, 22, woodLt, s: s);
    _span(canvas, 4, 1, 22, woodDk, s: s);
    _span(canvas, 7, 1, 22, woodLt, s: s);
    _span(canvas, 8, 1, 22, woodDk, s: s);

    // Vertical pickets/posts (posts at x=2, x=10, x=18)
    void post(int px) {
      _p(canvas, px + 1, 0, out, s: s);
      _span(canvas, 1, px, px + 2, woodLt, s: s);
      for (int y = 2; y <= 10; y++) {
        _span(canvas, y, px, px + 2, wood, s: s);
        _p(canvas, px, y, woodLt, s: s);
        _p(canvas, px + 2, y, woodDk, s: s);
        _p(canvas, px - 1, y, out, s: s);
        _p(canvas, px + 3, y, out, s: s);
      }
      _span(canvas, 11, px, px + 2, out, s: s);
    }

    post(2);
    post(10);
    post(18);
  }
}
