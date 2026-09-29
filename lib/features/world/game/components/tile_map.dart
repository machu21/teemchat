import 'package:flame/components.dart';
import 'package:flutter/material.dart';

import 'furniture_item.dart';
import 'obstacle_wall.dart';

// ============================================================
// BRIGHT & VIBRANT PIXEL-ART WORLD MAP — Stardew Valley / Animal Crossing warmth
//
// KEY PERFORMANCE FIX: The entire static map is rendered ONCE into
// a cached ui.Image on load. Each frame just blits that single image.
// Only dynamic elements (player, NPCs) redraw per frame.
//
// Internal render resolution = mapWidth/2 x mapHeight/2 (840 x 540)
// canvas.scale(2, 2) makes every pixel a visible 2×2 block on 1680x1080 world.
// NO anti-aliasing, NO gradients, NO curves. Strict pixel rects only.
// ============================================================
class WorldMapComponent extends PositionComponent {
  static const double mapWidth  = 1680;
  static const double mapHeight = 1080;
  static const double wallThick = 32.0;

  static const double G = 16.0;

  static const int T = 8;
  static const int iw = 840;
  static const int ih = 540;

  WorldMapComponent()
      : super(
          position: Vector2.zero(),
          size: Vector2(mapWidth, mapHeight),
          priority: -100,
        );

  static final Paint _paint = Paint()
    ..isAntiAlias = false
    ..filterQuality = FilterQuality.none;

  static void _r(Canvas c, int x, int y, int w, int h, Color col) {
    _paint.color = col;
    c.drawRect(Rect.fromLTWH(x.toDouble(), y.toDouble(), w.toDouble(), h.toDouble()), _paint);
  }

  @override
  Future<void> onLoad() async {
    await super.onLoad();
    _addBoundaryWalls();
    _addBuildingHitboxes();
    _addWaterBarriers();
    _addWorldProps();
  }

  void _addBoundaryWalls() {
    add(ObstacleWall(position: Vector2(0, 0), size: Vector2(mapWidth, wallThick), isVisible: false));
    add(ObstacleWall(position: Vector2(0, mapHeight - wallThick), size: Vector2(mapWidth, wallThick), isVisible: false));
    add(ObstacleWall(position: Vector2(0, 0), size: Vector2(wallThick, mapHeight), isVisible: false));
    add(ObstacleWall(position: Vector2(mapWidth - wallThick, 0), size: Vector2(wallThick, mapHeight), isVisible: false));
  }

  void _addBuildingHitboxes() {
    add(ObstacleWall(position: Vector2(G*5, G*5), size: Vector2(G*12, G*8), isVisible: false));
    add(ObstacleWall(position: Vector2(G*19, G*4), size: Vector2(G*15, G*9), isVisible: false));
  }

  void _addWaterBarriers() {
    add(ObstacleWall(position: Vector2(G*85, G*2), size: Vector2(G*2, mapHeight), isVisible: false));
    add(ObstacleWall(position: Vector2(G*46, G*26), size: Vector2(G*4, mapHeight - G*26), isVisible: false));
  }

  void _addWorldProps() {
    add(FurnitureComponent(type: FurnitureType.stoneWell,     position: Vector2(G*18, G*14)));
    add(FurnitureComponent(type: FurnitureType.woodenSign,    position: Vector2(G*14, G*14)));
    add(FurnitureComponent(type: FurnitureType.streetLantern, position: Vector2(G*5, G*14)));
    add(FurnitureComponent(type: FurnitureType.streetLantern, position: Vector2(G*34, G*14)));
    add(FurnitureComponent(type: FurnitureType.streetLantern, position: Vector2(G*18, G*27)));
    add(FurnitureComponent(type: FurnitureType.woodenFence,   position: Vector2(G*5, G*22)));
    add(FurnitureComponent(type: FurnitureType.woodenFence,   position: Vector2(G*8, G*22)));
    add(FurnitureComponent(type: FurnitureType.flowerPatch,   position: Vector2(G*5, G*24)));
    add(FurnitureComponent(type: FurnitureType.flowerPatch,   position: Vector2(G*8, G*24)));
    add(FurnitureComponent(type: FurnitureType.flowerPatch,   position: Vector2(G*18, G*12)));
    add(FurnitureComponent(type: FurnitureType.logBench,      position: Vector2(G*23, G*24)));
    add(FurnitureComponent(type: FurnitureType.berryBush,     position: Vector2(G*32, G*21)));
    add(FurnitureComponent(type: FurnitureType.berryBush,     position: Vector2(G*32, G*25)));
    add(FurnitureComponent(type: FurnitureType.pineTree,      position: Vector2(G*36, G*8)));

    // Whispering Woods foliage
    for (final v in [
      Vector2(G*43,G*6),Vector2(G*46,G*6),Vector2(G*49,G*6),
      Vector2(G*43,G*9),Vector2(G*46,G*9),Vector2(G*49,G*9),
      Vector2(G*62,G*10),Vector2(G*65,G*10),Vector2(G*68,G*10),
      Vector2(G*62,G*13),Vector2(G*65,G*13),Vector2(G*68,G*13),
    ]) { add(FurnitureComponent(type: FurnitureType.tallGrass, position: v)); }

    for (final v in [
      Vector2(G*39,G*3),Vector2(G*53,G*3),Vector2(G*58,G*3),Vector2(G*72,G*4),Vector2(G*76,G*8),
      Vector2(G*39,G*18),Vector2(G*48,G*20),Vector2(G*59,G*19),Vector2(G*70,G*18),Vector2(G*74,G*23),
    ]) { add(FurnitureComponent(type: FurnitureType.pineTree, position: v)); }

    add(FurnitureComponent(type: FurnitureType.berryBush,  position: Vector2(G*54, G*10)));
    add(FurnitureComponent(type: FurnitureType.flowerPatch,position: Vector2(G*42, G*14)));
    add(FurnitureComponent(type: FurnitureType.woodenSign, position: Vector2(G*43, G*19)));

    // Adventure Camp props
    add(FurnitureComponent(type: FurnitureType.campfire,   position: Vector2(G*58, G*35)));
    add(FurnitureComponent(type: FurnitureType.tent,       position: Vector2(G*52, G*33)));
    add(FurnitureComponent(type: FurnitureType.tent,       position: Vector2(G*64, G*33)));
    add(FurnitureComponent(type: FurnitureType.logBench,   position: Vector2(G*57, G*39)));
    add(FurnitureComponent(type: FurnitureType.streetLantern, position: Vector2(G*51, G*37)));
    add(FurnitureComponent(type: FurnitureType.streetLantern, position: Vector2(G*67, G*37)));
    add(FurnitureComponent(type: FurnitureType.woodenSign, position: Vector2(G*62, G*39)));

    // Craggy Ridge props
    add(FurnitureComponent(type: FurnitureType.boulder,    position: Vector2(G*5,  G*38)));
    add(FurnitureComponent(type: FurnitureType.boulder,    position: Vector2(G*13, G*40)));
    add(FurnitureComponent(type: FurnitureType.boulder,    position: Vector2(G*30, G*38)));
    add(FurnitureComponent(type: FurnitureType.boulder,    position: Vector2(G*8,  G*52)));
    add(FurnitureComponent(type: FurnitureType.pineTree,   position: Vector2(G*4,  G*43)));
    add(FurnitureComponent(type: FurnitureType.pineTree,   position: Vector2(G*31, G*49)));
    add(FurnitureComponent(type: FurnitureType.woodenSign, position: Vector2(G*22, G*38)));

    // Crystal Bay props
    add(FurnitureComponent(type: FurnitureType.boulder,    position: Vector2(G*83, G*11)));
    add(FurnitureComponent(type: FurnitureType.boulder,    position: Vector2(G*83, G*45)));
    add(FurnitureComponent(type: FurnitureType.woodenSign, position: Vector2(G*80, G*27)));
    add(FurnitureComponent(type: FurnitureType.streetLantern, position: Vector2(G*80, G*30)));
    add(FurnitureComponent(type: FurnitureType.logBench,   position: Vector2(G*80, G*23)));
  }

  // ----------------------------------------------------------------
  // RENDER: Direct 60fps native GPU speed — ultra-lightweight draw calls
  // ----------------------------------------------------------------
  @override
  void render(Canvas canvas) {
    try {
      canvas.save();
      canvas.scale(2.0, 2.0);
      _drawGrass(canvas);
      _drawForestZone(canvas);
      _drawWater(canvas);
      _drawRiver(canvas);
      _drawBridge(canvas);
      _drawPaths(canvas);
      _drawPlaza(canvas);
      _drawCottage(canvas);
      _drawTownHall(canvas);
      _drawCliffs(canvas);
      _drawLabels(canvas);
      canvas.restore();
    } catch (e, st) {
      debugPrint("WorldMapComponent render error: $e\n$st");
    }
  }

  // ── 1. GRASS TILES ── Bright sunlit meadow ────────────────────
  void _drawGrass(Canvas canvas) {
    // Solid vibrant meadow base in 1 draw call
    _r(canvas, 0, 0, iw, ih, const Color(0xFF6CB840));

    // Warm sunlit checkerboard fields (40x40 grid, ~140 rects total)
    const int fieldSize = 40;
    for (int ty = 0; ty < ih; ty += fieldSize) {
      for (int tx = 0; tx < iw; tx += fieldSize) {
        if (((tx ~/ fieldSize) + (ty ~/ fieldSize)) % 2 == 0) {
          final int w = (tx + fieldSize <= iw) ? fieldSize : (iw - tx);
          final int h = (ty + fieldSize <= ih) ? fieldSize : (ih - ty);
          _r(canvas, tx, ty, w, h, const Color(0xFF7EC850));
        }
      }
    }

    // Decorative details — grass blades, white daisies, yellow blossoms
    for (int ty = 20; ty < ih; ty += 56) {
      for (int tx = 20; tx < iw; tx += 56) {
        final int h = ((tx * 13 + ty * 7) ~/ 16) % 5;
        if (h == 0) {
          _r(canvas, tx + 2, ty + 2, 2, 4, const Color(0xFF9EE870));
          _r(canvas, tx + 6, ty + 1, 2, 5, const Color(0xFF9EE870));
        } else if (h == 1) {
          // White daisy
          _r(canvas, tx + 4, ty + 4, 3, 3, const Color(0xFFFFFFFF));
          _r(canvas, tx + 5, ty + 5, 1, 1, const Color(0xFFFDE047));
        } else if (h == 2) {
          // Yellow blossom
          _r(canvas, tx + 3, ty + 5, 3, 3, const Color(0xFFFDE047));
        } else if (h == 3) {
          // Light green accent blade
          _r(canvas, tx + 1, ty + 3, 2, 3, const Color(0xFFB4F080));
        }
      }
    }
  }

  // ── 2. FOREST ZONE ── Rich emerald canopy with dappled sunlight ─
  void _drawForestZone(Canvas canvas) {
    const int fx = T * 38;
    const int fw = T * 40;
    const int fh = T * 26;

    // Solid rich forest base in 1 draw call
    _r(canvas, fx, 0, fw, fh, const Color(0xFF3E7E36));

    // Dappled emerald canopy patches
    const int canopySize = 40;
    for (int ty = 0; ty < fh; ty += canopySize) {
      for (int tx = fx; tx < fx + fw; tx += canopySize) {
        if (((tx ~/ canopySize) + (ty ~/ canopySize)) % 2 == 0) {
          final int w = (tx + canopySize <= fx + fw) ? canopySize : (fx + fw - tx);
          final int h = (ty + canopySize <= fh) ? canopySize : (fh - ty);
          _r(canvas, tx, ty, w, h, const Color(0xFF4A9040));
        }
      }
    }

    // Perimeter dense forest border — nicely spaced trees
    for (int tx = 0; tx < iw; tx += T * 6) {
      _pixelTree(canvas, tx, 0);
    }
    for (int ty = T * 6; ty < ih - T * 6; ty += T * 6) {
      _pixelTree(canvas, 0, ty);
    }
    for (int tx = 0; tx < iw; tx += T * 6) {
      _pixelTree(canvas, tx, ih - T * 4);
    }
    for (int tx = fx + T * 3; tx < fx + fw - T * 3; tx += T * 8) {
      for (int ty = T * 3; ty < fh - T * 3; ty += T * 8) {
        _pixelTree(canvas, tx, ty);
      }
    }
  }

  void _pixelTree(Canvas canvas, int tx, int ty) {
    // Lush multi-shade canopy — dark outline, vibrant greens
    _r(canvas, tx,     ty + 2, T * 3,     T * 2 + 2, const Color(0xFF1E5018));
    _r(canvas, tx + 2, ty,     T * 3 - 4, T * 4,     const Color(0xFF1E5018));
    _r(canvas, tx + 1, ty + 2, T * 3 - 2, T * 2,     const Color(0xFF3A8030));
    _r(canvas, tx + 3, ty + 1, T * 3 - 6, T * 3 + 2, const Color(0xFF3A8030));
    _r(canvas, tx + 2, ty + 3, T * 3 - 4, T * 2,     const Color(0xFF52A842));
    _r(canvas, tx + 4, ty + 1, T * 3 - 8, T * 3,     const Color(0xFF52A842));
    // Crown highlight
    _r(canvas, tx + 4, ty + 1, 4,         3,         const Color(0xFF78D058));
    _r(canvas, tx + 2, ty + 3, 3,         2,         const Color(0xFF78D058));
    // Trunk
    _r(canvas, tx + T,     ty + T * 3, 4, T, const Color(0xFF8B5E2C));
    _r(canvas, tx + T + 4, ty + T * 3, 4, T, const Color(0xFF5C3A18));
  }

  // ── 3. WATER / OCEAN ── Sparkling tropical crystal bay ────────
  void _drawWater(Canvas canvas) {
    const int beachX = 640;
    const int waveX  = 696;

    // Sandy beach — warm golden sand base
    _r(canvas, beachX, 0, waveX - beachX, ih, const Color(0xFFEACC88));
    _r(canvas, beachX + 14, 0, 20, ih, const Color(0xFFF5DDA0));

    // Shell / pebble details
    for (int ty = 16; ty < ih; ty += 48) {
      _r(canvas, beachX + 6, ty, 3, 2, const Color(0xFFD4A860));
      _r(canvas, beachX + 26, ty + 24, 3, 2, const Color(0xFFFFE8C0));
    }

    // Beach-to-water transition line
    _r(canvas, waveX - 4, 0, 4, ih, const Color(0xFFD4B878));

    // Crystal ocean water — bright tropical gradient bands
    const List<Color> oc = [
      Color(0xFF5CE0F8), Color(0xFF40C0F0), Color(0xFF28A0E0), Color(0xFF1880C8),
    ];
    const int bandW = (iw - waveX) ~/ 4;
    for (int i = 0; i < 4; i++) {
      _r(canvas, waveX + i * bandW, 0, bandW, ih, oc[i]);
    }

    // Sparkling wave foam
    for (int ty = 0; ty < ih; ty += T * 6) {
      final int stagger = (ty ~/ (T * 6)) % 2 == 0 ? 8 : 0;
      for (int tx = waveX + stagger; tx < iw - 4; tx += T * 6) {
        _r(canvas, tx,     ty,     16, 2, const Color(0xFFB0E8FF));
        _r(canvas, tx + 2, ty + 1, 10, 1, const Color(0xFFF0FCFF));
      }
    }
    // Shoreline cresting foam
    for (int ty = 0; ty < ih; ty += T * 2) {
      final bool odd = (ty ~/ (T * 2)) % 2 == 0;
      _r(canvas, waveX, ty + (odd ? 0 : 4), 3, 6, const Color(0xFFF0FCFF));
    }

    // Wooden Pier / Jetty — warm timber
    const int px2 = 648; const int py2 = 232;
    const int pw2 = 144; const int ph2 = 32;
    for (int tx = px2; tx < px2 + pw2; tx += 7) {
      _r(canvas, tx, py2, 6, ph2, const Color(0xFFB87838));
      _r(canvas, tx, py2, 6, 2,   const Color(0xFFD8A058));
    }
    _r(canvas, px2, py2,           pw2, 3, const Color(0xFF784020));
    _r(canvas, px2, py2 + ph2 - 3, pw2, 3, const Color(0xFF784020));
    for (int tx = px2; tx <= px2 + pw2; tx += 32) {
      _r(canvas, tx - 1, py2 + ph2, 4, 14, const Color(0xFF5C2E10));
    }
  }

  // ── 4. RIVER ── Clear sparkling blue stream ────────────────────
  void _drawRiver(Canvas canvas) {
    const int rLi = T * 46;
    const int rYi = T * 26;
    const int rWi = T * 4;

    // River banks — warm dirt border
    _r(canvas, rLi - 2, rYi, rWi + 4, ih - rYi, const Color(0xFFA87848));

    // Main river water — bright crystal blue
    _r(canvas, rLi,     rYi, rWi,     ih - rYi, const Color(0xFF48B8E8));
    // Deeper center channel
    _r(canvas, rLi + rWi ~/ 3, rYi, rWi ~/ 3, ih - rYi, const Color(0xFF3098D0));

    // Sparkling ripple highlights
    for (int ty = rYi + T; ty < ih; ty += T * 3) {
      _r(canvas, rLi + 2,         ty,     6, 1, const Color(0xFFA0E0FF));
      _r(canvas, rLi + rWi - 8,   ty + T, 6, 1, const Color(0xFFA0E0FF));
    }
    // Edge foam
    for (int ty = rYi; ty < ih; ty += T) {
      final bool odd = (ty ~/ T) % 2 == 0;
      _r(canvas, rLi,           ty + (odd ? 0 : 3), 2, 3, const Color(0xFFF0FCFF));
      _r(canvas, rLi + rWi - 2, ty + (odd ? 3 : 0), 2, 3, const Color(0xFFF0FCFF));
    }

    // Lily pads with flowers
    void lily(int lx, int ly) {
      _r(canvas, lx,     ly,     T, T, const Color(0xFF40A838));
      _r(canvas, lx + 2, ly + 2, 4, 4, const Color(0xFF2E8428));
      _r(canvas, lx + 3, ly + 1, 2, 2, const Color(0xFFF06088)); // Pink lily flower
    }
    lily(rLi + 4,  T * 29);
    lily(rLi + 10, T * 35);
    lily(rLi + 2,  T * 50);
  }

  // ── 5. BRIDGE ── Warm timber crossing ──────────────────────────
  void _drawBridge(Canvas canvas) {
    const int bx = T * 45; const int by = T * 42;
    const int bw = T * 6;  const int bh = T * 4;
    // Soft shadow under bridge
    _r(canvas, bx + 2, by + bh, bw, 6, const Color(0x30000000));
    // Planks
    for (int tx = bx; tx < bx + bw; tx += 7) {
      _r(canvas, tx,     by, 5, bh, const Color(0xFFC08038));
      _r(canvas, tx + 1, by, 3, 2,  const Color(0xFFE0A858));
    }
    // Guard rails
    _r(canvas, bx - 2, by,          bw + 4, 4, const Color(0xFF8B5020));
    _r(canvas, bx - 2, by + bh - 4, bw + 4, 4, const Color(0xFF8B5020));
    // Support pillars
    for (int tx = bx; tx <= bx + bw; tx += bw ~/ 2) {
      _r(canvas, tx - 1, by - 4, 4, bh + 8, const Color(0xFF6B3818));
    }
  }

  // ── 6. DIRT PATHS ── Golden warm footpaths ─────────────────────
  void _drawPaths(Canvas canvas) {
    void path(int x, int y, int w, int h) {
      // Warm golden dirt
      _r(canvas, x, y, w, h, const Color(0xFFE8C88C));
      // Highlight edges
      _r(canvas, x, y, w, 2, const Color(0xFFF4DCA0));
      _r(canvas, x, y, 2, h, const Color(0xFFF4DCA0));
      // Shadow edges
      _r(canvas, x + w - 2, y, 2, h, const Color(0xFFC4A060));
      _r(canvas, x, y + h - 2, w, 2, const Color(0xFFC4A060));
      // Cart tracks / foot ruts
      if (w > h) {
        _r(canvas, x + 4, y + h ~/ 3,     w - 8, 1, const Color(0xFFD0A868));
        _r(canvas, x + 4, y + 2 * h ~/ 3, w - 8, 1, const Color(0xFFD0A868));
      } else {
        _r(canvas, x + w ~/ 3,     y + 4, 1, h - 8, const Color(0xFFD0A868));
        _r(canvas, x + 2 * w ~/ 3, y + 4, 1, h - 8, const Color(0xFFD0A868));
      }
    }
    path(T * 34, T * 16, T * 11, T * 3);
    path(T * 45, T * 16, T * 31, T * 3);
    path(T * 75, T * 16, T * 3,  T * 14);
    path(T * 75, T * 29, T * 6,  T * 3);
    path(T * 54, T * 19, T * 3,  T * 13);
    path(T * 39, T * 42, T * 6,  T * 4);
    path(T * 51, T * 42, T * 8,  T * 4);
    path(T * 17, T * 27, T * 2,  T * 7);
    path(T * 21, T * 40, T * 2,  T * 8);
  }

  // ── 7. COBBLESTONE PLAZA ── Warm grey stone market square ──────
  void _drawPlaza(Canvas canvas) {
    const int px = T * 6; const int py = T * 11;
    const int pw = T * 29; const int ph = T * 16;

    // Warm stone base
    _r(canvas, px, py, pw, ph, const Color(0xFFD8D4C8));

    // Brick pattern
    const int bh = T;
    const int bw = T * 2;
    for (int ty = py; ty < py + ph; ty += bh) {
      final int row = (ty - py) ~/ bh;
      final int offset = (row % 2) * bw ~/ 2;
      // Mortar line
      _r(canvas, px, ty, pw, 1, const Color(0xFFA09888));
      for (int tx = px + offset; tx < px + pw; tx += bw) {
        _r(canvas, tx, ty, 1, bh, const Color(0xFFA09888));
        // Brick highlight
        _r(canvas, tx + 1, ty + 1, bw - 3, 1,      const Color(0xFFEAE6DA));
        _r(canvas, tx + 1, ty + 2, 1,      bh - 3, const Color(0xFFEAE6DA));
        // Occasional darker brick variation
        if ((row + (tx ~/ bw)) % 3 == 0) {
          _r(canvas, tx + 2, ty + 2, bw - 5, bh - 4, const Color(0xFFC8C0B4));
        }
      }
    }
    // Border trim — warm stone brown
    _r(canvas, px,          py,          pw, 2, const Color(0xFF887860));
    _r(canvas, px,          py + ph - 2, pw, 2, const Color(0xFF887860));
    _r(canvas, px,          py,          2, ph, const Color(0xFF887860));
    _r(canvas, px + pw - 2, py,          2, ph, const Color(0xFF887860));

    // Central plaza medallion (decorative mosaic circle)
    const int cx = px + pw ~/ 2;
    const int cy = py + ph ~/ 2;
    _r(canvas, cx - 12, cy - 12, 24, 24, const Color(0xFF887860));
    _r(canvas, cx - 10, cy - 10, 20, 20, const Color(0xFFB88838));
    _r(canvas, cx - 8,  cy - 8,  16, 16, const Color(0xFFDCAA50));
    _r(canvas, cx - 4,  cy - 4,  8,  8,  const Color(0xFFF5C868));
    _r(canvas, cx - 1,  cy - 1,  2,  2,  const Color(0xFF6B3818));
  }

  // ================================================================
  //  8. COZY CABIN COTTAGE (Building 1)
  //  Warm terracotta roof, cozy timber walls, glowing windows
  // ================================================================
  void _drawCottage(Canvas canvas) {
    const int bx = T * 5;  // 40
    const int by = T * 3;  // 24
    const int bw = 96;     // Width
    const int rh = 38;     // Roof height
    const int wh = 36;     // Wall height

    const out = Color(0xFF2E1A0C);
    const roofBase = Color(0xFFC87040);
    const roofLt = Color(0xFFE08850);
    const roofHi = Color(0xFFF0A868);
    const roofDk = Color(0xFFA05828);
    const ridgeLt = Color(0xFFD88848);
    const ridgeMid = Color(0xFFB86828);
    const ridgeDk = Color(0xFF804018);
    const wallBase = Color(0xFF8B5E34);
    const wallLt = Color(0xFFA87848);
    const wallDk = Color(0xFF6B4020);
    const cornerPost = Color(0xFF5C3218);

    // Stone Chimney
    _r(canvas, bx + 10, by - 6, 10, 16, const Color(0xFF687080));
    _r(canvas, bx + 9,  by - 7, 12, 3,  const Color(0xFF889098));
    _r(canvas, bx + 11, by - 5, 4,  10, const Color(0xFF98A0A8));
    // Warm smoke puff
    _r(canvas, bx + 12, by - 12, 5, 4, const Color(0x80E8ECF0));
    _r(canvas, bx + 14, by - 16, 4, 3, const Color(0x50E8ECF0));

    // Ground shadow
    _r(canvas, bx - 2, by + rh + wh - 4, bw + 4, 8, const Color(0x30000000));

    // ── ROOF: Warm Terracotta A-Frame ────────────────────────────
    const int cx = bx + bw ~/ 2;
    for (int i = 0; i < rh; i++) {
      final double progress = i / rh;
      final int halfW = (10 + progress * (bw / 2 - 6)).toInt();
      final int y = by + i;
      final int left = cx - halfW;
      final int right = cx + halfW;
      final int lineW = right - left + 1;

      _r(canvas, left, y, lineW, 1, roofBase);

      if (i % 6 < 2) {
        _r(canvas, left + 2, y, lineW - 4, 1, roofHi);
      } else if (i % 6 >= 4) {
        _r(canvas, left + 2, y, lineW - 4, 1, roofDk);
      } else {
        _r(canvas, left + 2, y, lineW - 4, 1, roofLt);
      }

      for (int sx = left + 12; sx < right - 8; sx += 14) {
        if ((i ~/ 6) % 2 == 0) {
          _r(canvas, sx, y, 1, 1, roofDk);
        } else {
          _r(canvas, sx + 7, y, 1, 1, roofDk);
        }
      }

      _r(canvas, left,      y, 2, 1, out);
      _r(canvas, right - 1, y, 2, 1, out);
    }

    // Center Ridge Beam
    const int rcx = bx + bw ~/ 2;
    for (int y = by; y < by + rh; y++) {
      _r(canvas, rcx - 5, y, 10, 1, ridgeMid);
      _r(canvas, rcx - 4, y, 3,  1, ridgeLt);
      _r(canvas, rcx + 2, y, 3,  1, ridgeDk);
      _r(canvas, rcx - 6, y, 1,  1, out);
      _r(canvas, rcx + 5, y, 1,  1, out);
    }
    // Peak cap
    _r(canvas, rcx - 6, by - 2, 12, 2, out);
    _r(canvas, rcx - 4, by - 1, 8,  2, ridgeLt);

    // Eave shadow
    _r(canvas, bx - 4, by + rh - 3, bw + 8, 3, const Color(0xFF3C1808));
    _r(canvas, bx - 6, by + rh - 1, bw + 12, 2, out);

    // ── WALLS: Warm Timber Planks ────────────────────────────────
    const int wy = by + rh + 1;
    _r(canvas, bx, wy, bw, wh, wallBase);

    for (int y = wy; y < wy + wh; y += 7) {
      _r(canvas, bx, y,     bw, 1, wallLt);
      _r(canvas, bx, y + 1, bw, 5, wallBase);
      _r(canvas, bx, y + 6, bw, 1, wallDk);
    }

    _r(canvas, bx + 42, wy + 2,  1, 12, wallDk);
    _r(canvas, bx + 22, wy + 14, 1, 12, wallDk);
    _r(canvas, bx + 52, wy + 14, 1, 12, wallDk);

    for (int y = wy; y < wy + wh; y++) {
      _r(canvas, bx,          y, 6, 1, cornerPost);
      _r(canvas, bx + 1,      y, 2, 1, wallLt);
      _r(canvas, bx + bw - 6, y, 6, 1, cornerPost);
      _r(canvas, bx + bw - 5, y, 2, 1, wallLt);
    }
    _r(canvas, bx,          wy, 1, wh, out);
    _r(canvas, bx + bw - 1, wy, 1, wh, out);

    // Foundation
    _r(canvas, bx, wy + wh - 4, bw, 4, const Color(0xFF483018));
    _r(canvas, bx, wy + wh - 1, bw, 2, out);

    // ── WINDOW (Left side) — warm golden glow ────────────────────
    const int wx = bx + 16;
    const int windowY = wy + 7;
    const int ww = 22;
    const int windowH = 18;

    _r(canvas, wx - 1, windowY - 1, ww + 2, windowH + 2, out);
    _r(canvas, wx,     windowY,     ww,     windowH,     const Color(0xFFB87838));
    _r(canvas, wx + 1, windowY + 1, ww - 2, 2,           const Color(0xFFD8A060));
    // Warm golden glass interior — cozy interior glow
    _r(canvas, wx + 3, windowY + 3, ww - 6, windowH - 6, const Color(0xFFFDE68A));
    _r(canvas, wx + 4, windowY + 4, 4,      4,           const Color(0xFFFFF3C0));
    _r(canvas, wx + 4, windowY + 5, 2,      2,           const Color(0xFFFFFFFF));
    // Mullion cross
    _r(canvas, wx + ww ~/ 2 - 1, windowY + 3, 2, windowH - 6, const Color(0xFF8B5020));
    _r(canvas, wx + 3, windowY + windowH ~/ 2 - 1, ww - 6, 2, const Color(0xFF8B5020));

    // ── DOOR (Right side) ────────────────────────────────────────
    const int dx = bx + 56;
    const int dy = wy + 6;
    const int dw = 24;
    const int dh = wh - 6;

    _r(canvas, dx - 1, dy - 1, dw + 2, dh + 1, out);
    _r(canvas, dx,     dy,     dw,     dh,     const Color(0xFFB87838));
    _r(canvas, dx + 1, dy + 1, dw - 2, 2,      const Color(0xFFD8A060));
    _r(canvas, dx + 1, dy + 1, 2,      dh,     const Color(0xFFD8A060));

    // Dark interior
    _r(canvas, dx + 3, dy + 3, dw - 6, dh - 3, const Color(0xFF2E1A10));
    // Stone threshold
    _r(canvas, dx - 2, dy + dh - 1, dw + 4, 3, const Color(0xFF889098));
    _r(canvas, dx - 2, dy + dh - 1, dw + 4, 1, const Color(0xFFA8B0B8));
  }

  // ================================================================
  //  9. VILLAGE CENTER / TOWN HALL (Building 2)
  //  Bright blue ceramic roof, cream walls, flower windows
  // ================================================================
  void _drawTownHall(Canvas canvas) {
    const int bx = T * 19;
    const int by = T * 2;
    const int bw = 120;
    const int rh = 36;
    const int wh = 42;

    const out = Color(0xFF1A2038);
    const roofBlue = Color(0xFF3060D0);
    const roofLt = Color(0xFF5090F0);
    const roofHi = Color(0xFFA0C8FF);
    const roofDk = Color(0xFF203880);
    const wallPlaster = Color(0xFFFAF5E8);
    const wallLt = Color(0xFFFFFDF5);
    const timber = Color(0xFF7C4020);
    const timberLt = Color(0xFFA05830);

    // Ground shadow
    _r(canvas, bx - 2, by + rh + wh - 4, bw + 4, 8, const Color(0x30000000));

    // ── ROOF: Bright Blue Ceramic Tiles ─────────────────────────
    const int cx = bx + bw ~/ 2;
    for (int i = 0; i < rh; i++) {
      final double progress = i / rh;
      final int halfW = (16 + progress * (bw / 2 - 12)).toInt();
      final int y = by + i;
      final int left = cx - halfW;
      final int right = cx + halfW;
      final int lineW = right - left + 1;

      _r(canvas, left, y, lineW, 1, roofBlue);

      if (i % 4 < 2) {
        _r(canvas, left + 2, y, lineW - 4, 1, roofLt);
      } else {
        _r(canvas, left + 2, y, lineW - 4, 1, roofDk);
      }

      if (i < 3) {
        _r(canvas, left + 4, y, lineW - 8, 1, roofHi);
      }

      _r(canvas, left,      y, 2, 1, out);
      _r(canvas, right - 1, y, 2, 1, out);
    }

    // White ridge cap
    const int rcx = bx + bw ~/ 2;
    _r(canvas, rcx - 20, by - 2, 40, 2, out);
    _r(canvas, rcx - 18, by - 1, 36, 2, const Color(0xFFFFFFFF));
    _r(canvas, rcx - 18, by + 1, 36, 1, const Color(0xFFD8E0E8));

    // Eave shadow
    _r(canvas, bx - 4, by + rh - 3, bw + 8, 3, const Color(0xFF182040));
    _r(canvas, bx - 6, by + rh - 1, bw + 12, 2, out);

    // ── WALLS: Half-Timbered Cream & Timber ──────────────────────
    const int wy = by + rh + 1;
    _r(canvas, bx, wy, bw, wh, wallPlaster);

    // Corner timber pillars
    for (int y = wy; y < wy + wh; y++) {
      _r(canvas, bx,          y, 5, 1, timber);
      _r(canvas, bx + 1,      y, 2, 1, timberLt);
      _r(canvas, bx + bw - 5, y, 5, 1, timber);
      _r(canvas, bx + bw - 4, y, 2, 1, timberLt);
    }
    // Mid timber pillars
    for (int y = wy; y < wy + wh; y++) {
      _r(canvas, bx + 36, y, 4, 1, timber);
      _r(canvas, bx + 80, y, 4, 1, timber);
    }
    // Horizontal beams
    _r(canvas, bx, wy,          bw, 3, timber);
    _r(canvas, bx, wy + 16,     bw, 3, timber);
    _r(canvas, bx, wy + wh - 4, bw, 4, timber);
    _r(canvas, bx, wy + wh - 1, bw, 2, out);

    // Plaster highlight
    _r(canvas, bx + 8,  wy + 4, 24, 10, wallLt);
    _r(canvas, bx + 88, wy + 4, 24, 10, wallLt);

    // ── DOUBLE ENTRANCE DOORS (Center) ───────────────────────────
    const int dx = bx + bw ~/ 2 - 14;
    const int dy = wy + 12;
    const int dw = 28;
    const int dh = wh - 12;

    _r(canvas, dx - 1, dy - 1, dw + 2, dh + 1, out);
    _r(canvas, dx,     dy,     dw,     dh,     const Color(0xFF8B5020));
    _r(canvas, dx + dw ~/ 2 - 1, dy, 2, dh, const Color(0xFF5C3010));
    // Glass upper panes — bright sky blue
    _r(canvas, dx + 3,  dy + 4, 8, 10, const Color(0xFFA0D0FF));
    _r(canvas, dx + 17, dy + 4, 8, 10, const Color(0xFFA0D0FF));
    _r(canvas, dx + 4,  dy + 5, 3, 3,  const Color(0xFFFFFFFF));
    _r(canvas, dx + 18, dy + 5, 3, 3,  const Color(0xFFFFFFFF));
    // Brass handles
    _r(canvas, dx + 10, dy + 18, 2, 3, const Color(0xFFFDE047));
    _r(canvas, dx + 16, dy + 18, 2, 3, const Color(0xFFFDE047));
    // Welcome mat — amber
    _r(canvas, dx - 2, dy + dh - 1, dw + 4, 3, const Color(0xFFA06028));
    _r(canvas, dx,     dy + dh - 1, dw,     2, const Color(0xFFF59E0B));

    // Signboard above entrance
    _r(canvas, dx - 2, dy - 9, dw + 4, 8, out);
    _r(canvas, dx - 1, dy - 8, dw + 2, 6, const Color(0xFFD97706));
    _r(canvas, dx,     dy - 7, dw,     4, const Color(0xFFFDE68A));
    _r(canvas, dx + dw ~/ 2 - 2, dy - 6, 4, 2, const Color(0xFFD97706));

    // ── WINDOWS WITH FLOWER BOXES (Left & Right) ─────────────────
    void villageWindow(int wx) {
      const int wy2 = wy + 4;
      _r(canvas, wx - 1, wy2 - 1, 18, 14, out);
      // Sky blue glass
      _r(canvas, wx,     wy2,     16, 12, const Color(0xFFA0D0FF));
      _r(canvas, wx + 1, wy2 + 1, 4,  4,  const Color(0xFFFFFFFF));
      _r(canvas, wx + 7, wy2,     2,  12, timber);
      _r(canvas, wx,     wy2 + 5, 16, 2,  timber);

      // Flower planter box
      _r(canvas, wx - 2, wy2 + 12, 20, 5, out);
      _r(canvas, wx - 1, wy2 + 13, 18, 3, const Color(0xFFA05828));
      // Colorful blossoms
      _r(canvas, wx,     wy2 + 11, 2, 2, const Color(0xFFEF4444)); // red
      _r(canvas, wx + 4, wy2 + 11, 2, 2, const Color(0xFFFDE047)); // yellow
      _r(canvas, wx + 8, wy2 + 11, 2, 2, const Color(0xFF60A5FA)); // blue
      _r(canvas, wx + 12,wy2 + 11, 2, 2, const Color(0xFFF472B6)); // pink
    }

    villageWindow(bx + 11);
    villageWindow(bx + 91);
  }

  // ── 10. CLIFF LEDGES ── Warm sandstone rock ────────────────────
  void _drawCliffs(Canvas canvas) {
    _cliffLedge(canvas, T * 2, T * 34, T * 36);
    _cliffLedge(canvas, T * 2, T * 48, T * 36);

    // Mine entrance / cave
    const int cx = T * 11; const int cy = T * 35;
    _r(canvas, cx,     cy,     16, 3,  const Color(0xFF3C2810));
    _r(canvas, cx - 2, cy + 3, 4,  16, const Color(0xFF3C2810));
    _r(canvas, cx + 14,cy + 3, 4,  16, const Color(0xFF3C2810));
    _r(canvas, cx,     cy + 3, 16, 16, const Color(0xFF1C1008));
    // Arch highlight
    _r(canvas, cx - 4, cy + 2, 24, 3,  const Color(0xFF887060));
  }

  void _cliffLedge(Canvas canvas, int x, int y, int w) {
    const int h = T * 2;
    // Warm sandstone cliff layers
    _r(canvas, x, y,             w, h,     const Color(0xFFB88848));
    _r(canvas, x, y,             w, 2,     const Color(0xFFD8A860));
    _r(canvas, x, y + 2,         w, 2,     const Color(0xFFC89850));
    _r(canvas, x, y + h ~/ 2,    w, 2,     const Color(0xFFA07838));
    _r(canvas, x, y + h - 3,     w, 3,     const Color(0xFF886028));
    // Crack lines
    int ci = x + 12;
    while (ci < x + w) {
      _r(canvas, ci, y + 3, 1, h - 5, const Color(0xFF886028));
      ci += 24;
    }
  }

  // ── 11. ZONE LABELS ── Clean readable signs ────────────────────
  void _drawLabels(Canvas canvas) {
    _label(canvas, 'VERDANT VILLAGE',    T * 8,  T * 3,  const Color(0xFF2E8028));
    _label(canvas, 'WHISPERING WOODS',   T * 46, T * 3,  const Color(0xFF1E6020));
    _label(canvas, 'CRYSTAL BAY',        T * 82, T * 3,  const Color(0xFF1878B0));
    _label(canvas, 'CRAGGY RIDGE',       T * 5,  T * 32, const Color(0xFF8B5020));
    _label(canvas, 'ADVENTURE CAMP',     T * 52, T * 30, const Color(0xFFB87820));
    _label(canvas, 'RIVER CROSSING',     T * 52, T * 47, const Color(0xFF1E8868));
  }

  void _label(Canvas canvas, String text, int x, int y, Color bgColor) {
    try {
      final tp = TextPainter(
        text: TextSpan(text: text, style: const TextStyle(
          color: Color(0xFFFFFFFF),
          fontSize: 5,
          fontWeight: FontWeight.w900,
          letterSpacing: 0.5,
          height: 1.2,
        )),
        textDirection: TextDirection.ltr,
      )..layout();
      final int bw = tp.width.ceil() + 8;
      final int bh = tp.height.ceil() + 6;
      _r(canvas, x - 1, y - 1, bw + 2, bh + 2, const Color(0xFF000000));
      _r(canvas, x,     y,     bw,     bh,     bgColor);
      _r(canvas, x,     y,     bw,     1,      const Color(0x60FFFFFF));
      tp.paint(canvas, Offset((x + 4).toDouble(), (y + 3).toDouble()));
    } catch (_) {}
  }

  // ── ZONE NAME HELPER ───────────────────────────────────────────
  static String getZoneName(Vector2 pos) {
    if (pos.x >= 1280) return 'Crystal Bay';
    if (pos.y < 512) return pos.x < 608 ? 'Verdant Village' : 'Whispering Woods';
    if (pos.x < 592) return 'Craggy Ridge';
    if (pos.y < 752) return 'Adventure Camp';
    return 'River Crossing';
  }
}
