import 'package:flame/collisions.dart';
import 'package:flame/components.dart';
import 'package:flutter/material.dart';
import '../../../../core/constants/app_colors.dart';

enum ObstacleWallType {
  cliffLedge,
  waterBoundary,
  woodenFence,
  stoneStair,
  standard,
}

class ObstacleWall extends PositionComponent with CollisionCallbacks {
  final ObstacleWallType wallType;
  final Color color;
  final Color borderColor;
  final bool isVisible;
  final String? label;

  ObstacleWall({
    required Vector2 position,
    required Vector2 size,
    this.wallType = ObstacleWallType.standard,
    this.color = const Color(0xFF334155),
    this.borderColor = const Color(0xFF475569),
    this.isVisible = true,
    this.label,
  }) : super(
          position: position,
          size: size,
        ) {
    add(RectangleHitbox(isSolid: true));
  }

  @override
  void render(Canvas canvas) {
    super.render(canvas);
    if (!isVisible) return;

    switch (wallType) {
      case ObstacleWallType.cliffLedge:
        _renderCliffLedge(canvas);
        break;
      case ObstacleWallType.waterBoundary:
        _renderWaterBoundary(canvas);
        break;
      case ObstacleWallType.woodenFence:
        _renderWoodenFence(canvas);
        break;
      case ObstacleWallType.stoneStair:
        _renderStoneStairs(canvas);
        break;
      case ObstacleWallType.standard:
        _renderStandard(canvas);
        break;
    }
  }

  void _renderStandard(Canvas canvas) {
    final rect = Rect.fromLTWH(0, 0, size.x, size.y);
    final paint = Paint()..color = color;
    final rrect = RRect.fromRectAndRadius(rect, const Radius.circular(4));
    canvas.drawRRect(rrect, paint);

    final borderPaint = Paint()
      ..color = borderColor
      ..style = PaintingStyle.stroke
      ..strokeWidth = 2.0;
    canvas.drawRRect(rrect, borderPaint);

    if (label != null && label!.isNotEmpty && size.x > 50 && size.y > 20) {
      final textSpan = TextSpan(
        text: label,
        style: TextStyle(
          color: Colors.white.withOpacity(0.6),
          fontSize: 11,
          fontWeight: FontWeight.bold,
          letterSpacing: 1.0,
        ),
      );
      final textPainter = TextPainter(
        text: textSpan,
        textDirection: TextDirection.ltr,
      );
      textPainter.layout(maxWidth: size.x - 8);
      final offset = Offset(
        (size.x - textPainter.width) / 2,
        (size.y - textPainter.height) / 2,
      );
      textPainter.paint(canvas, offset);
    }
  }

  void _renderCliffLedge(Canvas canvas) {
    // Earthen Cliff Body (Pokémon GBA/DS mountain wall)
    final cliffBase = Paint()..color = AppColors.cliffFace;
    final cliffDark = Paint()..color = AppColors.cliffShadow;
    final cliffHigh = Paint()..color = AppColors.cliffHighlight;

    canvas.drawRect(Rect.fromLTWH(0, 0, size.x, size.y), cliffBase);

    // Vertical stratified rock lines & crags
    final cragPaint = Paint()
      ..color = cliffDark.color
      ..strokeWidth = 1.5;

    for (double x = 12; x < size.x; x += 28) {
      canvas.drawLine(Offset(x, 4), Offset(x, size.y - 2), cragPaint);
      if (x + 10 < size.x) {
        canvas.drawLine(Offset(x + 10, 8), Offset(x + 10, size.y - 6), cragPaint..color = cliffHigh.color);
      }
    }

    // Bottom shadow edge
    canvas.drawRect(Rect.fromLTWH(0, size.y - 4, size.x, 4), cliffDark);

    // Scalloped sunny grass overhang on upper ledge
    final grassLedge = Paint()..color = AppColors.grassHighlight;
    canvas.drawRect(Rect.fromLTWH(0, 0, size.x, 6), grassLedge);

    // Scalloped grass teeth hanging down
    for (double x = 4; x < size.x; x += 12) {
      final tooth = Path()
        ..moveTo(x, 6)
        ..lineTo(x + 4, 10)
        ..lineTo(x + 8, 6)
        ..close();
      canvas.drawPath(tooth, grassLedge);
    }
  }

  void _renderWaterBoundary(Canvas canvas) {
    // Water edge shore
    final waterPaint = Paint()..color = AppColors.waterAzure;
    canvas.drawRect(Rect.fromLTWH(0, 0, size.x, size.y), waterPaint);

    // Foam surf line
    final foamPaint = Paint()..color = AppColors.waterFoam;
    canvas.drawRect(Rect.fromLTWH(0, 0, size.x, 4), foamPaint);

    // Ripple accents
    final ripPaint = Paint()
      ..color = Colors.white70
      ..strokeWidth = 1.5;
    for (double y = 8; y < size.y; y += 12) {
      for (double x = (y % 24 == 8 ? 6 : 24); x < size.x - 10; x += 36) {
        canvas.drawLine(Offset(x, y), Offset(x + 16, y), ripPaint);
      }
    }
  }

  void _renderWoodenFence(Canvas canvas) {
    final rail = Paint()..color = AppColors.woodTimber;
    final post = Paint()..color = const Color(0xFF78350F);

    canvas.drawRect(Rect.fromLTWH(0, size.y * 0.3, size.x, 4), rail);
    canvas.drawRect(Rect.fromLTWH(0, size.y * 0.7, size.x, 4), rail);

    for (double x = 4; x < size.x; x += 20) {
      canvas.drawRRect(RRect.fromRectAndRadius(Rect.fromLTWH(x, 2, 6, size.y - 4), const Radius.circular(2)), post);
    }
  }

  void _renderStoneStairs(Canvas canvas) {
    // Stone stairs climbing cliff
    final stepPaint = Paint()..color = const Color(0xFF94A3B8);
    final stepDark = Paint()..color = const Color(0xFF64748B);
    final stepHigh = Paint()..color = const Color(0xFFE2E8F0);

    canvas.drawRect(Rect.fromLTWH(0, 0, size.x, size.y), stepDark);

    const stepHeight = 8.0;
    for (double y = 0; y < size.y; y += stepHeight) {
      canvas.drawRect(Rect.fromLTWH(2, y + 1, size.x - 4, stepHeight - 2), stepPaint);
      canvas.drawLine(Offset(2, y + 1), Offset(size.x - 2, y + 1), Paint()..color = stepHigh.color..strokeWidth = 1.5);
    }
  }
}
