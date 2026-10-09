import 'dart:ui' as ui;
import 'package:flame/components.dart';
import 'package:flutter/material.dart';
import '../../../../core/constants/app_colors.dart';
import '../../../../core/models/avatar_model.dart';
import 'player_avatar.dart';

class RemotePlayerAvatar extends PositionComponent {
  final String userId;
  String displayName;
  AvatarConfig config;
  Vector2 targetPosition;
  FacingDirection facing = FacingDirection.down;
  bool isMoving = false;
  double _animationTime = 0.0;
  String? speechBubble;
  DateTime? speechExpiresAt;

  static final Paint _spritePaint = Paint()
    ..isAntiAlias = false
    ..filterQuality = FilterQuality.none;

  RemotePlayerAvatar({
    required this.userId,
    required this.displayName,
    required this.config,
    required Vector2 position,
  })  : targetPosition = position.clone(),
        super(
          position: position,
          size: Vector2(36, 48),
          anchor: Anchor.center,
          priority: 15,
        );

  @override
  void onMount() {
    super.onMount();
    debugPrint(">>> [RemotePlayerAvatar] onMount() called! userId=$userId, displayName=$displayName, pos=$position, priority=$priority");
  }

  void updateState({
    required double newX,
    required double newY,
    required String direction,
    required bool moving,
    String? speech,
    DateTime? expiresAt,
  }) {
    targetPosition.setValues(newX, newY);
    // Large distance jump (teleport/initial load) snaps immediately
    if ((targetPosition - position).length > 250) {
      position.setFrom(targetPosition);
    }
    isMoving = moving;
    switch (direction) {
      case 'up':
        facing = FacingDirection.up;
        break;
      case 'down':
        facing = FacingDirection.down;
        break;
      case 'left':
        facing = FacingDirection.left;
        break;
      case 'right':
        facing = FacingDirection.right;
        break;
    }
    if (speech != null && speech.isNotEmpty) {
      speechBubble = speech;
      speechExpiresAt = expiresAt ?? DateTime.now().add(const Duration(seconds: 4));
    }
  }

  @override
  void update(double dt) {
    super.update(dt);

    // Smoothly interpolate towards target position
    final diff = targetPosition - position;
    if (diff.length > 1.5) {
      position += diff * (dt * 12.0).clamp(0.0, 1.0);
    } else {
      position.setFrom(targetPosition);
    }

    final animMoving = isMoving || diff.length > 2.0;
    if (animMoving) {
      _animationTime += dt * 6.5;
    } else {
      _animationTime = 0.0;
    }

    // Clean up expired speech bubbles
    if (speechBubble != null &&
        speechExpiresAt != null &&
        DateTime.now().isAfter(speechExpiresAt!)) {
      speechBubble = null;
      speechExpiresAt = null;
    }
  }

  int _renderCount = 0;

  @override
  void render(Canvas canvas) {
    super.render(canvas);
    _renderCount++;
    if (_renderCount <= 5 || _renderCount % 180 == 0) {
      debugPrint(">>> [RemotePlayerAvatar] render() frame #$_renderCount | userId=$userId | pos=$position | target=$targetPosition");
    }

    final int frame = isMoving ? (((_animationTime).floor()) % 4) : 0;
    const double px = 2.0;
    const double ox = 2.0;
    const double oy = 2.0;

    // Ground shadow
    _spritePaint.color = const Color(0x40000000);
    canvas.drawRect(const Rect.fromLTWH(ox + 4.0, oy + 42.0, 24.0, 3.5), _spritePaint);

    void p(int x, int y, Color c) {
      _spritePaint.color = c;
      canvas.drawRect(
        Rect.fromLTWH(ox + x * px, oy + y * px, px + 0.35, px + 0.35),
        _spritePaint,
      );
    }

    void span(int y, int x1, int x2, Color c) {
      _spritePaint.color = c;
      canvas.drawRect(
        Rect.fromLTWH(ox + x1 * px, oy + y * px, (x2 - x1 + 1) * px, px + 0.35),
        _spritePaint,
      );
    }

    final skin = config.skinColor;
    const skinShade = Color(0xFFC68642);
    final shirt = config.shirtColor;
    const shirtDark = Color(0xFF1E293B);
    final hair = config.hairColor;
    const pants = Color(0xFF1E293B);
    const shoes = Color(0xFF0F172A);

    // Render body, head, hair, and shirt (facing-aware)
    if (facing == FacingDirection.down) {
      // Head
      span(1, 4, 11, hair);
      span(2, 3, 12, hair);
      span(3, 3, 12, hair);
      span(4, 3, 4, hair); span(4, 5, 10, skin); span(4, 11, 12, hair);
      span(5, 3, 3, hair); span(5, 4, 11, skin); span(5, 12, 12, hair);
      // Eyes
      p(5, 5, const Color(0xFF0F172A)); p(5, 10, const Color(0xFF0F172A));
      span(6, 4, 11, skin);
      p(7, 7, skinShade); p(7, 8, skinShade);

      // Torso / Shirt
      span(8, 4, 11, shirt);
      span(9, 3, 12, shirt);
      span(10, 3, 12, shirt);
      span(11, 4, 11, shirtDark);

      // Legs / Shoes
      if (frame == 1) {
        span(12, 4, 7, pants); span(13, 4, 7, shoes);
        span(12, 9, 11, pants); span(14, 9, 11, shoes);
      } else if (frame == 3) {
        span(12, 4, 6, pants); span(14, 4, 6, shoes);
        span(12, 8, 11, pants); span(13, 8, 11, shoes);
      } else {
        span(12, 4, 6, pants); span(12, 9, 11, pants);
        span(13, 4, 6, shoes); span(13, 9, 11, shoes);
      }
    } else {
      // Simplified back/side profile
      span(1, 4, 11, hair);
      span(2, 3, 12, hair);
      span(3, 3, 12, hair);
      span(4, 3, 12, hair);
      span(5, 4, 11, hair);
      span(8, 4, 11, shirt);
      span(9, 3, 12, shirt);
      span(10, 3, 12, shirt);
      span(12, 4, 11, pants);
      span(13, 4, 11, shoes);
    }

    _renderNameplate(canvas);

    // Floating pixel speech bubble
    if (speechBubble != null) {
      _renderSpeechBubble(canvas, speechBubble!);
    }
  }

  void _renderNameplate(Canvas canvas) {
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
      textDirection: ui.TextDirection.ltr,
      maxLines: 1,
    )..layout();

    final pillWidth = textPainter.width + 24;
    const pillHeight = 18.0;
    final pillLeft = 18.0 - (pillWidth / 2);
    const pillTop = -22.0;

    final pillRect = RRect.fromRectAndRadius(
      Rect.fromLTWH(pillLeft, pillTop, pillWidth, pillHeight),
      const Radius.circular(9),
    );
    canvas.drawRRect(pillRect, Paint()..color = const Color(0xFF0F172A).withOpacity(0.85));
    canvas.drawRRect(
      pillRect,
      Paint()
        ..color = const Color(0xFF38BDF8).withOpacity(0.5)
        ..style = PaintingStyle.stroke
        ..strokeWidth = 1.0,
    );

    // Remote user cyan indicator dot
    canvas.drawCircle(
      Offset(pillLeft + 8, pillTop + pillHeight / 2),
      3.0,
      Paint()..color = const Color(0xFF38BDF8),
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
      textDirection: ui.TextDirection.ltr,
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

    // Bubble pointer triangle down
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
