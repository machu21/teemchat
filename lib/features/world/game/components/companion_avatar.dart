import 'dart:math' as math;
import 'package:flame/components.dart';
import 'package:flutter/material.dart';
import '../../../../core/constants/app_colors.dart';
import '../../../../core/models/companion_model.dart';
import 'player_avatar.dart';

class CompanionAvatar extends PositionComponent {
  final PlayerAvatar player;
  CompanionModel companion;
  final VoidCallback? onTap;

  double _hoverTime = 0.0;
  String? speechBubble;
  DateTime? speechExpiresAt;

  CompanionAvatar({
    required this.player,
    required this.companion,
    this.onTap,
  }) : super(
          position: player.position + Vector2(36, -20),
          size: Vector2(28, 28),
          anchor: Anchor.center,
          priority: 50,
        );

  void updateCompanionData(CompanionModel updated) {
    companion = updated;
  }

  void showSpeech(String text) {
    speechBubble = text;
    speechExpiresAt = DateTime.now().add(const Duration(seconds: 5));
  }

  void showSpeechBubble(String text) => showSpeech(text);

  @override
  void update(double dt) {
    super.update(dt);
    _hoverTime += dt * 3.5;

    // Follow target: lag behind the player smoothly
    final Vector2 followOffset;
    switch (player.facing) {
      case FacingDirection.down:
        followOffset = Vector2(32, -32);
        break;
      case FacingDirection.up:
        followOffset = Vector2(-32, 32);
        break;
      case FacingDirection.left:
        followOffset = Vector2(36, 10);
        break;
      case FacingDirection.right:
        followOffset = Vector2(-36, 10);
        break;
    }

    final targetPos = player.position + followOffset;
    // Smooth lerp follow
    final distance = position.distanceTo(targetPos);
    if (distance > 4.0) {
      final step = math.min(1.0, dt * (player.isMoving ? 4.5 : 2.5));
      position.lerp(targetPos, step);
    }

    // Auto-expire speech bubble
    if (speechBubble != null &&
        speechExpiresAt != null &&
        DateTime.now().isAfter(speechExpiresAt!)) {
      speechBubble = null;
      speechExpiresAt = null;
    }
  }

  @override
  void render(Canvas canvas) {
    super.render(canvas);

    final hoverOffset = math.sin(_hoverTime) * 3.0;

    canvas.save();
    canvas.translate(0, hoverOffset);

    // ── Drop Shadow on Ground ────────────────────────────────────
    final shadowScale = 1.0 - (hoverOffset / 12.0).clamp(-0.3, 0.3);
    final shadowPaint = Paint()..color = const Color(0x35000000);
    canvas.drawOval(
      Rect.fromCenter(
        center: Offset(14, 28 - hoverOffset),
        width: 18 * shadowScale,
        height: 6 * shadowScale,
      ),
      shadowPaint,
    );

    // ── Render Persona Sprite ───────────────────────────────────
    _renderCompanionSprite(canvas);

    canvas.restore();

    // ── Nameplate & AI Badge ─────────────────────────────────────
    _renderNameplate(canvas);

    // ── Speech Bubble ───────────────────────────────────────────
    if (speechBubble != null && speechBubble!.isNotEmpty) {
      _renderSpeechBubble(canvas, speechBubble!);
    }
  }

  void _renderCompanionSprite(Canvas canvas) {
    const double px = 2.0;
    final paint = Paint()
      ..isAntiAlias = false
      ..filterQuality = FilterQuality.none;

    void p(int x, int y, Color c) {
      paint.color = c;
      canvas.drawRect(Rect.fromLTWH(x * px, y * px, px + 0.3, px + 0.3), paint);
    }

    void span(int y, int x1, int x2, Color c) {
      for (int x = x1; x <= x2; x++) {
        p(x, y, c);
      }
    }

    // Depending on companionType:
    switch (companion.companionType) {
      case 'cyber_cat':
        _drawCat(p, span);
        break;
      case 'retro_dog':
        _drawDog(p, span);
        break;
      case 'mystic_wisp':
        _drawWisp(p, span);
        break;
      case 'robot':
      default:
        _drawRobot(p, span);
        break;
    }
  }

  // ── ROBOT COMPANION ───────────────────────────────────────────
  void _drawRobot(Function(int, int, Color) p, Function(int, int, int, Color) span) {
    const bodyColor = Color(0xFF38BDF8); // Cyan
    const darkBody = Color(0xFF0284C7);
    const lightBody = Color(0xFFBAE6FD);
    const metalGrey = Color(0xFF64748B);
    const outline = Color(0xFF0F172A);
    const visorGlow = Color(0xFFFDE047); // Golden yellow eyes

    // Antenna
    p(6, 0, const Color(0xFFEF4444)); // Red glowing orb
    p(7, 0, const Color(0xFFEF4444));
    p(6, 1, metalGrey);
    p(6, 2, metalGrey);

    // Head Outline & Box
    span(3, 3, 10, outline);
    span(4, 2, 11, bodyColor);
    span(5, 2, 11, lightBody);
    span(6, 2, 11, bodyColor);
    span(7, 2, 11, darkBody);
    span(8, 3, 10, outline);

    p(2, 4, outline); p(11, 4, outline);
    p(2, 7, outline); p(11, 7, outline);

    // Visor screen (dark glass)
    span(5, 4, 9, const Color(0xFF0B1120));
    span(6, 4, 9, const Color(0xFF0B1120));

    // Expressive LED eyes
    p(5, 5, visorGlow); p(8, 5, visorGlow);
    p(5, 6, visorGlow); p(8, 6, visorGlow);

    // Neck
    span(9, 5, 8, metalGrey);

    // Body
    span(10, 3, 10, bodyColor);
    span(11, 3, 10, darkBody);
    span(12, 4, 9, outline);

    // Thruster flame
    final flamePulse = (math.sin(_hoverTime * 6) > 0);
    p(6, 13, const Color(0xFFF97316));
    p(7, 13, const Color(0xFFF97316));
    if (flamePulse) {
      p(6, 14, const Color(0xFFFDE047));
      p(7, 14, const Color(0xFFFDE047));
    }
  }

  // ── CAT COMPANION ─────────────────────────────────────────────
  void _drawCat(Function(int, int, Color) p, Function(int, int, int, Color) span) {
    const fur = Color(0xFFF59E0B);
    const darkFur = Color(0xFFD97706);
    const white = Colors.white;
    const outline = Color(0xFF451A03);

    // Ears
    p(3, 1, outline); p(9, 1, outline);
    p(3, 2, const Color(0xFFF472B6)); p(9, 2, const Color(0xFFF472B6));

    // Head
    span(3, 3, 9, fur);
    span(4, 2, 10, fur);
    span(5, 2, 10, white);
    span(6, 3, 9, fur);

    // Eyes
    p(4, 4, const Color(0xFF10B981)); p(8, 4, const Color(0xFF10B981));
    p(6, 5, const Color(0xFFF472B6)); // Nose

    // Body
    span(7, 3, 9, darkFur);
    span(8, 2, 10, fur);
    span(9, 2, 10, fur);
    span(10, 3, 9, outline);

    // Tail
    p(11, 7, darkFur); p(12, 6, darkFur); p(12, 5, darkFur);
  }

  // ── DOG COMPANION ─────────────────────────────────────────────
  void _drawDog(Function(int, int, Color) p, Function(int, int, int, Color) span) {
    const fur = Color(0xFF8B5E3C);
    const lightFur = Color(0xFFA67C52);
    const outline = Color(0xFF2E1A0E);

    // Floppy ears
    p(2, 2, outline); p(10, 2, outline);
    p(2, 3, fur); p(10, 3, fur);
    p(2, 4, fur); p(10, 4, fur);

    // Head
    span(2, 4, 8, lightFur);
    span(3, 3, 9, lightFur);
    span(4, 3, 9, Colors.white);
    span(5, 4, 8, lightFur);

    // Eyes & Nose
    p(4, 3, outline); p(8, 3, outline);
    p(6, 4, outline); // black nose

    // Red Collar
    span(6, 4, 8, const Color(0xFFEF4444));

    // Body
    span(7, 3, 9, fur);
    span(8, 3, 9, fur);
    span(9, 3, 9, outline);

    // Wagging tail
    final tailY = (math.sin(_hoverTime * 5) > 0) ? 6 : 7;
    p(11, tailY, lightFur);
  }

  // ── WISP COMPANION ────────────────────────────────────────────
  void _drawWisp(Function(int, int, Color) p, Function(int, int, int, Color) span) {
    const core = Color(0xFFC084FC); // Purple wisp
    const bright = Color(0xFFF3E8FF);
    const glow = Color(0x66A855F7);

    span(2, 5, 8, glow);
    span(3, 4, 9, glow);
    span(4, 4, 9, core);
    span(5, 3, 10, bright);
    span(6, 4, 9, core);
    span(7, 5, 8, glow);
    span(8, 6, 7, glow);
  }

  // ── NAMEPLATE ─────────────────────────────────────────────────
  void _renderNameplate(Canvas canvas) {
    final textSpan = TextSpan(
      children: [
        TextSpan(
          text: "${companion.name} ",
          style: const TextStyle(
            color: Colors.white,
            fontSize: 9,
            fontWeight: FontWeight.w800,
          ),
        ),
        const TextSpan(
          text: "AI",
          style: TextStyle(
            color: Color(0xFF38BDF8),
            fontSize: 8,
            fontWeight: FontWeight.w900,
          ),
        ),
      ],
    );

    final tp = TextPainter(
      text: textSpan,
      textDirection: TextDirection.ltr,
    )..layout();

    final pillWidth = tp.width + 12;
    const pillHeight = 14.0;
    final pillLeft = 14.0 - (pillWidth / 2);
    const pillTop = -18.0;

    final rrect = RRect.fromRectAndRadius(
      Rect.fromLTWH(pillLeft, pillTop, pillWidth, pillHeight),
      const Radius.circular(7),
    );

    canvas.drawRRect(rrect, Paint()..color = const Color(0xDD0F172A));
    canvas.drawRRect(
      rrect,
      Paint()
        ..color = const Color(0xFF38BDF8).withOpacity(0.5)
        ..style = PaintingStyle.stroke
        ..strokeWidth = 1.0,
    );

    tp.paint(canvas, Offset(pillLeft + 6, pillTop + 1.5));
  }

  // ── SPEECH BUBBLE ─────────────────────────────────────────────
  void _renderSpeechBubble(Canvas canvas, String text) {
    final tp = TextPainter(
      text: TextSpan(
        text: text,
        style: const TextStyle(
          color: Color(0xFF0F172A),
          fontSize: 10,
          fontWeight: FontWeight.w800,
        ),
      ),
      textDirection: TextDirection.ltr,
      maxLines: 2,
    )..layout(maxWidth: 140);

    final bubbleWidth = tp.width + 14;
    final bubbleHeight = tp.height + 8;
    final bubbleLeft = 14.0 - (bubbleWidth / 2);
    final bubbleTop = -24.0 - bubbleHeight;

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

    // Pointer
    final path = Path()
      ..moveTo(10, bubbleTop + bubbleHeight)
      ..lineTo(14, bubbleTop + bubbleHeight + 4)
      ..lineTo(18, bubbleTop + bubbleHeight)
      ..close();

    canvas.drawPath(path, Paint()..color = Colors.white);
    canvas.drawPath(
      path,
      Paint()
        ..color = AppColors.inkBlack
        ..style = PaintingStyle.stroke
        ..strokeWidth = 1.5,
    );

    tp.paint(canvas, Offset(bubbleLeft + 7, bubbleTop + 4));
  }
}
