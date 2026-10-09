import 'dart:math' as math;
import 'package:flame/collisions.dart';
import 'package:flame/components.dart';
import 'package:flutter/material.dart';
import '../../../../core/constants/app_colors.dart';
import '../../../../core/models/avatar_model.dart';
import 'obstacle_wall.dart';
import 'furniture_item.dart';

enum FacingDirection { down, up, left, right }

/// True 2000s GBA-style overworld character sprite (Pokémon FireRed / Emerald style).
///
/// Renders on a strict 16×22 pixel grid scaled 2x (32×44 screen pixels).
/// All rendering uses flat-colored rectangles on a strict pixel grid —
/// zero arcs, zero paths, zero gradients, zero anti-aliasing.
/// Features 4-direction 4-frame walk animations, full hair style support,
/// and full accessory support (including the iconic Trainer Cap, Backpack, etc.).
class PlayerAvatar extends PositionComponent with CollisionCallbacks {
  final String displayName;
  final String status;
  final AvatarConfig config;

  final double moveSpeed = 180.0;
  bool isSwimming = false;
  double get effectiveSpeed => isSwimming ? 100.0 : moveSpeed;
  Vector2 velocity = Vector2.zero();

  FacingDirection facing = FacingDirection.down;
  double _animationTime = 0.0;
  bool isMoving = false;
  String? speechBubble;
  DateTime? speechExpiresAt;

  void showSpeechBubble(String text) {
    speechBubble = text;
    speechExpiresAt = DateTime.now().add(const Duration(seconds: 4));
  }

  PlayerAvatar({
    required Vector2 position,
    required this.displayName,
    required this.status,
    required this.config,
  }) : super(
          position: position,
          size: Vector2(36, 48),
          anchor: Anchor.center,
          priority: 10,
        ) {
    add(RectangleHitbox(
      position: Vector2(5, 34),
      size: Vector2(26, 12),
      isSolid: true,
    ));
  }

  void updateMovementInput(Vector2 direction) {
    if (direction.length > 0.05) {
      velocity = direction.normalized() * effectiveSpeed;
      isMoving = true;
      if (direction.y.abs() > direction.x.abs()) {
        facing = direction.y > 0 ? FacingDirection.down : FacingDirection.up;
      } else {
        facing = direction.x > 0 ? FacingDirection.right : FacingDirection.left;
      }
    } else {
      velocity = Vector2.zero();
      isMoving = false;
    }
  }

  @override
  void update(double dt) {
    super.update(dt);
    if (isMoving) {
      velocity = velocity.normalized() * effectiveSpeed;
      _animationTime += dt * (isSwimming ? 4.5 : 6.5);
      position += velocity * dt;
    } else {
      _animationTime += dt * (isSwimming ? 2.0 : 0.0);
    }

    if (speechBubble != null &&
        speechExpiresAt != null &&
        DateTime.now().isAfter(speechExpiresAt!)) {
      speechBubble = null;
      speechExpiresAt = null;
    }
  }

  @override
  void onCollision(Set<Vector2> intersectionPoints, PositionComponent other) {
    super.onCollision(intersectionPoints, other);
    if (other is ObstacleWall || other is FurnitureComponent) {
      final footBox = Rect.fromLTWH(
        position.x - size.x / 2 + 5,
        position.y - size.y / 2 + 34,
        26, 12,
      );
      final obstacleBox = Rect.fromLTWH(
        other.position.x, other.position.y,
        other.size.x, other.size.y,
      );
      final overlap = footBox.intersect(obstacleBox);
      if (!overlap.isEmpty) {
        if (overlap.width < overlap.height) {
          if (footBox.center.dx < obstacleBox.center.dx) {
            position.x -= overlap.width;
          } else {
            position.x += overlap.width;
          }
        } else {
          if (footBox.center.dy < obstacleBox.center.dy) {
            position.y -= overlap.height;
          } else {
            position.y += overlap.height;
          }
        }
      }
    }
  }

  // ── Pixel helpers ──────────────────────────────────────────────
  static Color _darken(Color c, double f) {
    final hsl = HSLColor.fromColor(c);
    return hsl.withLightness((hsl.lightness - f).clamp(0.0, 1.0)).toColor();
  }

  static Color _lighten(Color c, double f) {
    final hsl = HSLColor.fromColor(c);
    return hsl.withLightness((hsl.lightness + f).clamp(0.0, 1.0)).toColor();
  }

  static final Paint _spritePaint = Paint()
    ..isAntiAlias = false
    ..filterQuality = FilterQuality.none;

  @override
  void onMount() {
    super.onMount();
    debugPrint(">>> [PlayerAvatar] onMount() called! position=$position, size=$size, displayName=$displayName");
  }

  static int _avatarRenderCount = 0;

  @override
  void render(Canvas canvas) {
    super.render(canvas);
    _avatarRenderCount++;
    if (_avatarRenderCount <= 5 || _avatarRenderCount % 180 == 0) {
      debugPrint(">>> [PlayerAvatar] render() frame #$_avatarRenderCount | position=$position | facing=$facing | isMoving=$isMoving");
    }

    // Walk frame: 0 = stand, 1 = step-left, 2 = stand, 3 = step-right
    final int frame = isMoving ? (((_animationTime).floor()) % 4) : 0;

    // Scale: each sprite "pixel" = 2×2 screen pixels
    const double px = 2.0;
    const double ox = 2.0;
    const double oy = 2.0;

    void p(int x, int y, Color c) {
      _spritePaint.color = c;
      canvas.drawRect(
        Rect.fromLTWH(ox + x * px, oy + y * px, px + 0.35, px + 0.35),
        _spritePaint,
      );
    }

    void span(int y, int x1, int x2, Color c) {
      for (int x = x1; x <= x2; x++) {
        p(x, y, c);
      }
    }

    // ── Derived colours ──────────────────────────────────────────
    final skin = config.skinColor;
    final skinDk = _darken(skin, 0.16);

    final hair = config.hairColor;
    final hairDk = _darken(hair, 0.30);
    final hairLt = _lighten(hair, 0.25);

    final shirt = config.shirtColor;
    final shirtDk = _darken(shirt, 0.22);
    final shirtLt = _lighten(shirt, 0.20);

    const outline = Color(0xFF181824);
    const eyeW = Color(0xFFFFFFFF);
    const eyeP = Color(0xFF101828);
    const eyeIris = Color(0xFF6B4226);
    const pants = Color(0xFF1E2840);
    const pantsDk = Color(0xFF0F1524);
    const shoe = Color(0xFF06B6D4); // Bright GBA running shoe
    const shoeDk = Color(0xFF0891B2);
    const white = Color(0xFFFFFFFF);

    // ── Drop Shadow or Swimming Ripple ───────────────────────────
    if (isSwimming) {
      final ripplePulse = math.sin(_animationTime * 2.8) * 2.5;
      final ripplePaint = Paint()
        ..color = const Color(0xAA38BDF8)
        ..style = PaintingStyle.stroke
        ..strokeWidth = 2.0;
      canvas.drawOval(
        Rect.fromCenter(
          center: const Offset(ox + 16, oy + 32),
          width: 34 + ripplePulse,
          height: 16 + ripplePulse * 0.4,
        ),
        ripplePaint,
      );

      final foamPaint = Paint()
        ..color = Colors.white.withOpacity(0.75)
        ..style = PaintingStyle.stroke
        ..strokeWidth = 1.5;
      canvas.drawOval(
        Rect.fromCenter(
          center: const Offset(ox + 16, oy + 32),
          width: 22 + ripplePulse * 0.5,
          height: 9 + ripplePulse * 0.25,
        ),
        foamPaint,
      );
    } else {
      _spritePaint.color = const Color(0x40000000);
      canvas.drawRect(const Rect.fromLTWH(ox + 4.0, oy + 42.0, 24.0, 3.5), _spritePaint);
    }

    // ── Render Direction ─────────────────────────────────────────
    switch (facing) {
      case FacingDirection.down:
        _drawDown(p, span, frame, skin, skinDk, hair, hairDk, hairLt, shirt, shirtDk, shirtLt, outline, eyeW, eyeP, eyeIris, pants, pantsDk, shoe, shoeDk, white);
        break;
      case FacingDirection.up:
        _drawUp(p, span, frame, skin, skinDk, hair, hairDk, hairLt, shirt, shirtDk, shirtLt, outline, pants, pantsDk, shoe, shoeDk, white);
        break;
      case FacingDirection.left:
        _drawSide(p, span, frame, false, skin, skinDk, hair, hairDk, hairLt, shirt, shirtDk, shirtLt, outline, eyeW, eyeP, pants, pantsDk, shoe, shoeDk, white);
        break;
      case FacingDirection.right:
        _drawSide(p, span, frame, true, skin, skinDk, hair, hairDk, hairLt, shirt, shirtDk, shirtLt, outline, eyeW, eyeP, pants, pantsDk, shoe, shoeDk, white);
        break;
    }

    // ── Nameplate ────────────────────────────────────────────────
    _renderNameplate(canvas);

    // ── Speech Bubble ─────────────────────────────────────────────
    if (speechBubble != null && speechBubble!.isNotEmpty) {
      _renderSpeechBubble(canvas, speechBubble!);
    }
  }

  // ================================================================
  //  DOWN-FACING SPRITE (Front View, matching reference image)
  // ================================================================
  void _drawDown(
    Function(int, int, Color) p,
    Function(int, int, int, Color) span,
    int frame,
    Color skin, Color skinDk,
    Color hair, Color hairDk, Color hairLt,
    Color shirt, Color shirtDk, Color shirtLt,
    Color outline, Color eyeW, Color eyeP, Color eyeIris,
    Color pants, Color pantsDk, Color shoe, Color shoeDk, Color white,
  ) {
    final hasCap = config.accessory == 'cap';
    final capColor = shirt;
    final capLight = shirtLt;

    // ── HEAD / HAIR / CAP ─────────────────────────────────────────
    if (hasCap) {
      // Classic Pokémon Trainer Red Cap
      span(0, 4, 11, outline);
      span(1, 3, 12, capLight);
      p(2, 1, outline); p(13, 1, outline);
      span(2, 3, 12, capColor);
      p(2, 2, outline); p(13, 2, outline);
      span(3, 3, 12, capColor);
      p(2, 3, outline); p(13, 3, outline);
      // Cap emblem / semi-circle
      span(1, 6, 9, white);
      span(2, 5, 10, white);
      span(2, 7, 8, capColor);
      // White visor rim
      span(4, 3, 12, white);
      p(2, 4, outline); p(13, 4, outline);

      // Side hair tufts sticking out
      p(1, 4, outline); p(1, 5, outline); p(1, 6, outline);
      p(14, 4, outline); p(14, 5, outline); p(14, 6, outline);
      p(2, 5, hair); p(2, 6, hairDk);
      p(13, 5, hair); p(13, 6, hairDk);
    } else {
      // Hairstyle variations
      if (config.hairStyle == 'buzz') {
        span(1, 4, 11, outline);
        span(2, 3, 12, hair);
        p(2, 2, outline); p(13, 2, outline);
        span(3, 3, 12, hairDk);
        p(2, 3, outline); p(13, 3, outline);
      } else if (config.hairStyle == 'spiky') {
        // Anime Spikes
        p(4, 0, outline); p(7, 0, outline); p(11, 0, outline);
        p(4, 1, hairLt); p(7, 1, hairLt); p(11, 1, hairLt);
        span(1, 3, 12, hair);
        p(2, 1, outline); p(13, 1, outline);
        span(2, 2, 13, hair);
        p(1, 2, outline); p(14, 2, outline);
        span(3, 2, 13, hair);
        p(1, 3, outline); p(14, 3, outline);
        // Spiky bangs
        p(5, 4, hair); p(8, 4, hair); p(10, 4, hair);
      } else if (config.hairStyle == 'long') {
        // Long hair
        span(0, 4, 11, outline);
        span(1, 3, 12, hairLt);
        span(2, 2, 13, hair);
        span(3, 2, 13, hair);
        // Hair falls down past ears
        for (int y = 4; y <= 9; y++) {
          p(2, y, hair); p(3, y, hairDk);
          p(12, y, hairDk); p(13, y, hair);
          p(1, y, outline); p(14, y, outline);
        }
      } else {
        // Short hair (default)
        span(0, 4, 11, outline);
        span(1, 3, 12, hairLt);
        p(2, 1, outline); p(13, 1, outline);
        span(2, 3, 12, hair);
        p(2, 2, outline); p(13, 2, outline);
        span(3, 3, 12, hair);
        // Bangs fringe
        span(4, 3, 5, hair); span(4, 10, 12, hair);
        p(2, 3, outline); p(13, 3, outline);
      }
    }

    // ── FACE ──────────────────────────────────────────────────────
    span(5, 3, 12, skin);
    p(2, 5, outline); p(13, 5, outline);
    span(6, 3, 12, skin);
    p(2, 6, outline); p(13, 6, outline);
    span(7, 4, 11, skin);
    p(3, 7, outline); p(12, 7, outline);
    span(8, 5, 10, skinDk);
    p(4, 8, outline); p(11, 8, outline);

    // Eyes (2x2 pixel eyes with iris and pupil, matching reference)
    p(5, 6, outline); p(6, 6, eyeIris);
    p(9, 6, eyeIris); p(10, 6, outline);
    p(5, 7, outline); p(6, 7, eyeP);
    p(9, 7, eyeP); p(10, 7, outline);

    // Mouth
    p(7, 7, outline); p(8, 7, outline);

    // Blush
    p(3, 7, const Color(0x60F43F5E));
    p(12, 7, const Color(0x60F43F5E));

    // ── SHIRT / JACKET & INNER VEST ──────────────────────────────
    span(9, 4, 11, shirt);
    p(3, 9, outline); p(12, 9, outline);
    // Inner white undershirt / collar
    p(7, 9, white); p(8, 9, white);

    span(10, 3, 12, shirt);
    p(2, 10, outline); p(13, 10, outline);
    span(10, 6, 9, white);

    span(11, 3, 12, shirt);
    p(2, 11, outline); p(13, 11, outline);
    p(6, 11, shirtDk); p(9, 11, shirtDk);

    span(12, 4, 11, shirtDk);
    p(3, 12, outline); p(12, 12, outline);

    // Arms & Hands (walk swing)
    final armY = (frame == 1) ? 9 : (frame == 3) ? 11 : 10;
    span(armY, 1, 2, skin);
    p(1, armY - 1, outline); p(0, armY, outline); p(1, armY + 1, outline);
    span(20 - armY, 13, 14, skin);
    p(14, 20 - armY - 1, outline); p(15, 20 - armY, outline); p(14, 20 - armY + 1, outline);

    // ── BELT & PANTS ─────────────────────────────────────────────
    span(13, 4, 11, outline); // Belt line
    span(14, 4, 11, pants);
    span(15, 4, 11, pants);
    p(7, 14, pantsDk); p(8, 14, pantsDk);
    p(7, 15, pantsDk); p(8, 15, pantsDk);
    p(3, 14, outline); p(12, 14, outline);
    p(3, 15, outline); p(12, 15, outline);

    // ── LEGS & SNEAKERS (Walk Cycle or Swimming) ─────────────────
    if (isSwimming) {
      const waterTop = Color(0xFF67E8F9);
      const waterMid = Color(0xFF0284C7);
      final splash = (frame % 2 == 0) ? 0 : 1;
      span(15, 2, 13, waterTop);
      span(16, 1, 14, waterMid);
      p(1 - splash, 15, white);
      p(14 + splash, 15, white);
      p(3, 16, white);
      p(12, 16, white);
    } else {
      if (frame == 0 || frame == 2) {
        // Standing
        span(16, 4, 6, pants); span(16, 9, 11, pants);
        span(17, 4, 6, shoe);  span(17, 9, 11, shoe);
        span(18, 4, 6, shoeDk); span(18, 9, 11, shoeDk);
        span(19, 3, 6, outline); span(19, 9, 12, outline);
      } else if (frame == 1) {
        // Left leg forward / step
        span(16, 3, 5, pants); span(16, 9, 11, pants);
        span(17, 3, 5, shoe);  span(17, 10, 12, shoe);
        span(18, 3, 5, shoeDk); span(18, 10, 12, shoeDk);
        span(19, 2, 5, outline); span(19, 10, 13, outline);
      } else {
        // Right leg forward / step
        span(16, 4, 6, pants); span(16, 10, 12, pants);
        span(17, 3, 5, shoe);  span(17, 10, 12, shoe);
        span(18, 3, 5, shoeDk); span(18, 10, 12, shoeDk);
        span(19, 2, 5, outline); span(19, 10, 13, outline);
      }
    }

    // ── ACCESSORIES (Front) ──────────────────────────────────────
    _drawFrontAccessory(p, span, outline, white);
  }

  // ================================================================
  //  UP-FACING SPRITE (Back View, matching reference image)
  // ================================================================
  void _drawUp(
    Function(int, int, Color) p,
    Function(int, int, int, Color) span,
    int frame,
    Color skin, Color skinDk,
    Color hair, Color hairDk, Color hairLt,
    Color shirt, Color shirtDk, Color shirtLt,
    Color outline,
    Color pants, Color pantsDk, Color shoe, Color shoeDk, Color white,
  ) {
    final hasCap = config.accessory == 'cap';
    final capColor = shirt;
    final capDark = shirtDk;
    final capLight = shirtLt;

    // ── HEAD / HAIR / CAP ─────────────────────────────────────────
    if (hasCap) {
      // Cap dome from rear
      span(0, 4, 11, outline);
      span(1, 3, 12, capLight);
      span(2, 3, 12, capColor);
      span(3, 3, 12, capColor);
      span(4, 3, 12, capDark);
      p(2, 1, outline); p(13, 1, outline);
      p(2, 2, outline); p(13, 2, outline);
      p(2, 3, outline); p(13, 3, outline);
      p(2, 4, outline); p(13, 4, outline);

      // Dark hair block under cap
      span(5, 2, 13, hair);
      span(6, 2, 13, hairDk);
      span(7, 3, 12, hairDk);
      p(1, 5, outline); p(14, 5, outline);
      p(1, 6, outline); p(14, 6, outline);
    } else {
      // Full back hair
      span(0, 4, 11, outline);
      span(1, 3, 12, hairLt);
      span(2, 2, 13, hair);
      span(3, 2, 13, hair);
      span(4, 2, 13, hair);
      span(5, 2, 13, hair);
      span(6, 3, 12, hairDk);
      span(7, 4, 11, hairDk);
      p(1, 2, outline); p(14, 2, outline);
      p(1, 3, outline); p(14, 3, outline);
      p(1, 4, outline); p(14, 4, outline);
    }

    // ── BACKPACK & SHIRT ─────────────────────────────────────────
    // Backpack (Cyan/Blue adventure pack from reference)
    const bpColor = Color(0xFF0284C7);
    const bpLight = Color(0xFF38BDF8);
    const bpDark = Color(0xFF0369A1);

    span(8, 4, 11, shirt);
    span(9, 3, 12, bpColor);
    span(9, 5, 10, bpLight);
    span(10, 3, 12, bpColor);
    span(11, 4, 11, bpDark);
    p(2, 9, outline); p(13, 9, outline);
    p(2, 10, outline); p(13, 10, outline);
    p(3, 11, outline); p(12, 11, outline);

    // Arms
    final armY = (frame == 1) ? 9 : (frame == 3) ? 11 : 10;
    span(armY, 1, 2, skin);
    span(20 - armY, 13, 14, skin);

    // ── PANTS & LEGS ─────────────────────────────────────────────
    span(12, 4, 11, outline);
    span(13, 4, 11, pants);
    span(14, 4, 11, pants);
    span(15, 4, 11, pants);
    p(7, 13, pantsDk); p(8, 13, pantsDk);
    p(7, 14, pantsDk); p(8, 14, pantsDk);

    // Legs (or Swimming)
    if (isSwimming) {
      const waterTop = Color(0xFF67E8F9);
      const waterMid = Color(0xFF0284C7);
      final splash = (frame % 2 == 0) ? 0 : 1;
      span(15, 2, 13, waterTop);
      span(16, 1, 14, waterMid);
      p(1 - splash, 15, white);
      p(14 + splash, 15, white);
      p(4, 16, white);
      p(11, 16, white);
    } else {
      if (frame == 0 || frame == 2) {
        span(16, 4, 6, pants); span(16, 9, 11, pants);
        span(17, 4, 6, shoe);  span(17, 9, 11, shoe);
        span(18, 4, 6, shoeDk); span(18, 9, 11, shoeDk);
        span(19, 3, 6, outline); span(19, 9, 12, outline);
      } else if (frame == 1) {
        span(16, 3, 5, pants); span(16, 9, 11, pants);
        span(17, 3, 5, shoe);  span(17, 10, 12, shoe);
        span(18, 3, 5, shoeDk); span(18, 10, 12, shoeDk);
        span(19, 2, 5, outline); span(19, 10, 13, outline);
      } else {
        span(16, 4, 6, pants); span(16, 10, 12, pants);
        span(17, 3, 5, shoe);  span(17, 10, 12, shoe);
        span(18, 3, 5, shoeDk); span(18, 10, 12, shoeDk);
        span(19, 2, 5, outline); span(19, 10, 13, outline);
      }
    }
  }

  // ================================================================
  //  SIDE-FACING SPRITE (Profile View, matching reference image)
  // ================================================================
  void _drawSide(
    Function(int, int, Color) p,
    Function(int, int, int, Color) span,
    int frame,
    bool isRight,
    Color skin, Color skinDk,
    Color hair, Color hairDk, Color hairLt,
    Color shirt, Color shirtDk, Color shirtLt,
    Color outline, Color eyeW, Color eyeP,
    Color pants, Color pantsDk, Color shoe, Color shoeDk, Color white,
  ) {
    final hasCap = config.accessory == 'cap';
    final capColor = shirt;
    final capLight = shirtLt;

    // Helper: flip X coordinate if facing left
    int fx(int x) => isRight ? x : (15 - x);

    void sp(int x, int y, Color c) => p(fx(x), y, c);
    void sspan(int y, int x1, int x2, Color c) {
      if (isRight) {
        span(y, x1, x2, c);
      } else {
        span(y, 15 - x2, 15 - x1, c);
      }
    }

    // ── CAP & HEAD ───────────────────────────────────────────────
    if (hasCap) {
      sspan(0, 3, 9, outline);
      sspan(1, 2, 11, capLight);
      sspan(2, 2, 11, capColor);
      sspan(3, 2, 11, capColor);
      // Visor sticking forward on right side
      sspan(4, 8, 13, white);
      sp(14, 4, outline);
      sspan(4, 2, 7, hair);

      // Back hair tuft
      sp(1, 4, outline); sp(1, 5, outline);
      sp(2, 5, hair); sp(2, 6, hairDk);
    } else {
      sspan(0, 3, 9, outline);
      sspan(1, 2, 11, hairLt);
      sspan(2, 2, 11, hair);
      sspan(3, 2, 11, hair);
      sspan(4, 2, 7, hair);
    }

    // Face profile
    sspan(5, 5, 11, skin);
    sspan(6, 6, 12, skin);
    sspan(7, 6, 11, skin);
    sspan(8, 7, 10, skinDk);
    sp(13, 6, outline); // Nose tip
    sp(12, 7, outline); // Jaw

    // Eye looking forward
    sp(10, 6, eyeP);
    sp(11, 6, eyeW);

    // ── TORSO & BACKPACK ─────────────────────────────────────────
    const bpColor = Color(0xFF0284C7);
    const bpDark = Color(0xFF0369A1);

    // Backpack at rear
    sspan(9, 2, 4, bpColor);
    sspan(10, 2, 4, bpColor);
    sspan(11, 3, 4, bpDark);
    sp(1, 9, outline); sp(1, 10, outline);

    // Shirt & Vest
    sspan(9, 5, 11, shirt);
    sspan(10, 5, 11, shirt);
    sspan(11, 5, 10, shirtDk);
    sp(12, 10, outline);

    // Arm (swinging in walk cycle)
    final armShift = (frame == 1) ? 2 : (frame == 3) ? -2 : 0;
    sspan(10, 6 + armShift, 8 + armShift, skin);
    sspan(11, 6 + armShift, 8 + armShift, skin);

    // ── PANTS & LEGS ─────────────────────────────────────────────
    sspan(12, 4, 10, outline);
    sspan(13, 4, 10, pants);
    sspan(14, 4, 10, pants);
    sspan(15, 4, 9, pants);

    // Step cycle in side profile (or Swimming)
    if (isSwimming) {
      const waterTop = Color(0xFF67E8F9);
      const waterMid = Color(0xFF0284C7);
      final splash = (frame % 2 == 0) ? 0 : 1;
      sspan(15, 2, 12, waterTop);
      sspan(16, 1, 13, waterMid);
      sp(1 - splash, 15, white);
      sp(13 + splash, 15, white);
      sp(5, 16, white);
      sp(9, 16, white);
    } else {
      if (frame == 0 || frame == 2) {
        sspan(16, 5, 8, pants);
        sspan(17, 5, 8, shoe);
        sspan(18, 5, 9, shoeDk);
        sspan(19, 4, 9, outline);
      } else if (frame == 1) {
        // Forward stride
        sspan(16, 7, 10, pants);
        sspan(17, 8, 11, shoe);
        sspan(18, 8, 12, shoeDk);
        sspan(19, 7, 12, outline);
      } else {
        // Back stride
        sspan(16, 3, 6, pants);
        sspan(17, 2, 6, shoe);
        sspan(18, 2, 6, shoeDk);
        sspan(19, 1, 6, outline);
      }
    }
  }

  // ── ACCESSORY OVERLAYS ─────────────────────────────────────────
  void _drawFrontAccessory(
    Function(int, int, Color) p,
    Function(int, int, int, Color) span,
    Color outline,
    Color white,
  ) {
    switch (config.accessory) {
      case 'glasses':
        span(6, 4, 6, outline);
        span(6, 9, 11, outline);
        p(7, 6, outline); // bridge
        p(8, 6, outline);
        p(5, 6, const Color(0x6038BDF8)); // lens glint
        p(10, 6, const Color(0x6038BDF8));
        break;
      case 'headband':
        const band = Color(0xFFEF4444);
        const bandDk = Color(0xFFB91C1C);
        span(4, 3, 12, band);
        p(7, 4, bandDk); p(8, 4, bandDk);
        break;
      case 'headphones':
        const cup = Color(0xFF0F172A);
        const accent = Color(0xFF38BDF8);
        span(1, 4, 11, cup); // band
        p(2, 5, cup); p(2, 6, accent); p(2, 7, cup); // left ear
        p(13, 5, cup); p(13, 6, accent); p(13, 7, cup); // right ear
        break;
      default:
        break;
    }
  }

  // ── NAMEPLATE ──────────────────────────────────────────────────
  void _renderNameplate(Canvas canvas) {
    Color statusColor = AppColors.available;
    if (status == 'away') statusColor = AppColors.away;
    if (status == 'busy') statusColor = AppColors.busy;
    if (status == 'dnd') statusColor = AppColors.dnd;

    final textSpan = TextSpan(
      text: displayName,
      style: const TextStyle(
        color: Colors.white,
        fontSize: 10,
        fontWeight: FontWeight.w700,
        letterSpacing: 0.2,
      ),
    );
    final textPainter = TextPainter(
      text: textSpan,
      textDirection: TextDirection.ltr,
      maxLines: 1,
    )..layout();

    final pillWidth = textPainter.width + 24;
    const pillHeight = 18.0;
    final pillLeft = 18.0 - (pillWidth / 2);
    const pillTop = -22.0;

    final pillPaint = Paint()..color = const Color(0xFF0F172A).withOpacity(0.85);
    final pillBorder = Paint()
      ..color = Colors.white.withOpacity(0.18)
      ..style = PaintingStyle.stroke
      ..strokeWidth = 1.0;

    final pillRect = RRect.fromRectAndRadius(
      Rect.fromLTWH(pillLeft, pillTop, pillWidth, pillHeight),
      const Radius.circular(9),
    );
    canvas.drawRRect(pillRect, pillPaint);
    canvas.drawRRect(pillRect, pillBorder);

    // Status dot
    canvas.drawCircle(
      Offset(pillLeft + 8, pillTop + pillHeight / 2),
      3.0,
      Paint()..color = statusColor,
    );

    textPainter.paint(canvas, Offset(pillLeft + 16, pillTop + 2.5));
  }

  void _renderSpeechBubble(Canvas canvas, String text) {
    final textSpan = TextSpan(
      text: text,
      style: const TextStyle(
        color: Color(0xFF0F172A),
        fontSize: 11,
        fontWeight: FontWeight.w800,
      ),
    );
    final textPainter = TextPainter(
      text: textSpan,
      textDirection: TextDirection.ltr,
      maxLines: 2,
    )..layout(maxWidth: 160);

    final bubbleWidth = textPainter.width + 16;
    final bubbleHeight = textPainter.height + 10;
    final bubbleLeft = 18.0 - (bubbleWidth / 2);
    final bubbleTop = -26.0 - bubbleHeight;

    final bubbleRect = RRect.fromRectAndRadius(
      Rect.fromLTWH(bubbleLeft, bubbleTop, bubbleWidth, bubbleHeight),
      const Radius.circular(8),
    );

    canvas.drawRRect(bubbleRect, Paint()..color = Colors.white);
    canvas.drawRRect(
      bubbleRect,
      Paint()
        ..color = AppColors.inkBlack
        ..style = PaintingStyle.stroke
        ..strokeWidth = 1.5,
    );

    // Pointer triangle pointing down
    final path = Path()
      ..moveTo(14, bubbleTop + bubbleHeight)
      ..lineTo(18, bubbleTop + bubbleHeight + 4)
      ..lineTo(22, bubbleTop + bubbleHeight)
      ..close();
    canvas.drawPath(path, Paint()..color = Colors.white);
    canvas.drawPath(
      path,
      Paint()
        ..color = AppColors.inkBlack
        ..style = PaintingStyle.stroke
        ..strokeWidth = 1.5,
    );

    textPainter.paint(canvas, Offset(bubbleLeft + 8, bubbleTop + 5));
  }
}
