import 'package:flutter/material.dart';
import '../models/avatar_model.dart';

/// Renders an authentic 16-bit / GBA RPG pixel-art character avatar.
/// Compatible with all AvatarConfig properties (skinColor, shirtColor, hairColor,
/// hairStyle, and accessory) with zero Pokemon IP dependencies.
class PixelAvatarWidget extends StatelessWidget {
  final AvatarConfig config;
  final double size;
  final bool showBorder;
  final bool showGlow;
  final bool isCircle;

  const PixelAvatarWidget({
    super.key,
    required this.config,
    this.size = 72,
    this.showBorder = true,
    this.showGlow = true,
    this.isCircle = true,
  });

  @override
  Widget build(BuildContext context) {
    final borderColor = config.shirtColor;
    final inner = CustomPaint(
      size: Size(size, size),
      painter: PixelAvatarBustPainter(config: config),
    );

    return Container(
      width: size,
      height: size,
      decoration: BoxDecoration(
        shape: isCircle ? BoxShape.circle : BoxShape.rectangle,
        borderRadius: isCircle ? null : BorderRadius.circular(size * 0.2),
        gradient: RadialGradient(
          center: const Alignment(0, -0.2),
          radius: 0.85,
          colors: [
            config.shirtColor.withOpacity(0.25),
            const Color(0xFF1E293B),
            const Color(0xFF0F172A),
          ],
          stops: const [0.0, 0.65, 1.0],
        ),
        border: showBorder
            ? Border.all(color: borderColor.withOpacity(0.85), width: size > 80 ? 3 : 2)
            : null,
        boxShadow: showGlow
            ? [
                BoxShadow(
                  color: borderColor.withOpacity(0.35),
                  blurRadius: size * 0.22,
                  spreadRadius: 1,
                  offset: const Offset(0, 2),
                ),
              ]
            : null,
      ),
      child: ClipRRect(
        borderRadius: BorderRadius.circular(isCircle ? size : size * 0.2),
        child: Center(
          child: inner,
        ),
      ),
    );
  }
}

/// CustomPainter that renders a 24x24 pixel grid GBA / 16-bit RPG character portrait.
class PixelAvatarBustPainter extends CustomPainter {
  final AvatarConfig config;

  PixelAvatarBustPainter({required this.config});

  // Color shading helpers
  static Color _darken(Color c, double factor) {
    final hsl = HSLColor.fromColor(c);
    return hsl.withLightness((hsl.lightness - factor).clamp(0.0, 1.0)).toColor();
  }

  static Color _lighten(Color c, double factor) {
    final hsl = HSLColor.fromColor(c);
    return hsl.withLightness((hsl.lightness + factor).clamp(0.0, 1.0)).toColor();
  }

  @override
  void paint(Canvas canvas, Size size) {
    const int gridW = 24;
    const int gridH = 24;
    final double pixelW = size.width / gridW;
    final double pixelH = size.height / gridH;

    final Paint paint = Paint()..style = PaintingStyle.fill;

    void px(int x, int y, Color color) {
      if (x < 0 || x >= gridW || y < 0 || y >= gridH) return;
      paint.color = color;
      // 0.35px expansion prevents subpixel rendering seam lines on high-DPI displays
      canvas.drawRect(
        Rect.fromLTWH(x * pixelW, y * pixelH, pixelW + 0.35, pixelH + 0.35),
        paint,
      );
    }

    void pxSpan(int y, int xStart, int xEnd, Color color) {
      for (int x = xStart; x <= xEnd; x++) {
        px(x, y, color);
      }
    }

    // Color derivation
    final skinBase = config.skinColor;
    final skinShadow = _darken(skinBase, 0.16);
    final skinHighlight = _lighten(skinBase, 0.12);
    final blush = const Color(0xFFF43F5E).withOpacity(0.40);

    final hairBase = config.hairColor;
    final hairShadow = _darken(hairBase, 0.22);
    final hairHighlight = _lighten(hairBase, 0.28);
    final hairOutline = _darken(hairBase, 0.45);

    final shirtBase = config.shirtColor;
    final shirtShadow = _darken(shirtBase, 0.22);
    final shirtHighlight = _lighten(shirtBase, 0.20);
    const shirtInner = Color(0xFFF8FAFC); // Clean off-white undershirt

    const darkOutline = Color(0xFF1E2235);
    const eyeWhite = Colors.white;
    const eyePupil = Color(0xFF0F172A);

    // ==========================================
    // 1. CLOTHING & TORSO (Y: 15..23)
    // ==========================================
    // Neck base
    pxSpan(14, 10, 13, skinShadow);
    pxSpan(15, 10, 13, skinShadow);

    // Shoulders & Shirt base
    for (int y = 16; y <= 23; y++) {
      int xStart = (18 - (y - 16) * 3).clamp(3, 10);
      int xEnd = (5 + (y - 16) * 3).clamp(13, 20);

      // Shirt body fill
      pxSpan(y, xStart, xEnd, shirtBase);

      // Side shadows & creases
      px(xStart, y, shirtShadow);
      px(xStart + 1, y, shirtShadow);
      px(xEnd - 1, y, shirtShadow);
      px(xEnd, y, shirtShadow);

      // Dark silhouette outline
      px(xStart - 1, y, darkOutline);
      px(xEnd + 1, y, darkOutline);
    }

    // Shoulder highlight lines
    pxSpan(16, 7, 9, shirtHighlight);
    pxSpan(16, 14, 16, shirtHighlight);

    // Inner V-neck shirt / collar
    px(11, 15, shirtInner);
    px(12, 15, shirtInner);
    px(11, 16, shirtInner);
    px(12, 16, shirtInner);
    px(11, 17, shirtInner);
    px(12, 17, shirtInner);
    px(10, 15, darkOutline);
    px(13, 15, darkOutline);
    px(10, 16, darkOutline);
    px(13, 16, darkOutline);

    // Jacket central zipper/seam
    for (int y = 18; y <= 23; y++) {
      px(11, y, shirtShadow);
      px(12, y, shirtHighlight);
    }

    // ==========================================
    // 2. HEAD & JAW (Y: 6..14)
    // ==========================================
    // Jaw outline
    px(7, 12, darkOutline);
    px(16, 12, darkOutline);
    px(8, 13, darkOutline);
    px(15, 13, darkOutline);
    pxSpan(14, 9, 14, darkOutline);

    // Face skin base
    pxSpan(6, 8, 15, skinBase);
    pxSpan(7, 7, 16, skinBase);
    pxSpan(8, 6, 17, skinBase);
    pxSpan(9, 6, 17, skinBase);
    pxSpan(10, 6, 17, skinBase);
    pxSpan(11, 7, 16, skinBase);
    pxSpan(12, 8, 15, skinBase);
    pxSpan(13, 9, 14, skinBase);

    // Jaw / Chin shadow
    pxSpan(13, 10, 13, skinShadow);

    // Ears
    px(5, 8, darkOutline);
    px(5, 9, skinBase);
    px(5, 10, darkOutline);
    px(18, 8, darkOutline);
    px(18, 9, skinBase);
    px(18, 10, darkOutline);

    // ==========================================
    // 3. EYES, EYEBROWS, BLUSH & MOUTH
    // ==========================================
    // Eyebrows
    pxSpan(7, 8, 10, hairShadow);
    pxSpan(7, 13, 15, hairShadow);

    // Eyelash upper outline
    pxSpan(8, 8, 10, darkOutline);
    pxSpan(8, 13, 15, darkOutline);

    // Left Eye
    px(8, 9, eyeWhite);
    px(9, 9, eyePupil);
    px(10, 9, eyeWhite);
    px(8, 10, eyeWhite);
    px(9, 10, eyePupil);
    px(10, 10, eyeWhite);
    // Left eye sparkle catchlight
    px(9, 9, eyeWhite);

    // Right Eye
    px(13, 9, eyeWhite);
    px(14, 9, eyePupil);
    px(15, 9, eyeWhite);
    px(13, 10, eyeWhite);
    px(14, 10, eyePupil);
    px(15, 10, eyeWhite);
    // Right eye sparkle catchlight
    px(14, 9, eyeWhite);

    // Rosy Cheeks / Blush
    px(6, 11, blush);
    px(7, 11, blush);
    px(16, 11, blush);
    px(17, 11, blush);

    // Nose
    px(11, 11, skinHighlight);
    px(12, 11, skinShadow);

    // Sweet Smile
    px(11, 12, darkOutline);
    px(12, 12, darkOutline);
    px(10, 12, skinShadow);
    px(13, 12, skinShadow);

    // ==========================================
    // 4. HAIRSTYLES
    // ==========================================
    switch (config.hairStyle) {
      case 'buzz':
        _paintBuzzHair(px, pxSpan, hairBase, hairShadow, hairHighlight, hairOutline);
        break;
      case 'long':
        _paintLongHair(px, pxSpan, hairBase, hairShadow, hairHighlight, hairOutline, darkOutline);
        break;
      case 'spiky':
        _paintSpikyHair(px, pxSpan, hairBase, hairShadow, hairHighlight, hairOutline, darkOutline);
        break;
      case 'short':
      default:
        _paintShortHair(px, pxSpan, hairBase, hairShadow, hairHighlight, hairOutline, darkOutline);
        break;
    }

    // ==========================================
    // 5. ACCESSORIES
    // ==========================================
    switch (config.accessory) {
      case 'glasses':
        _paintGlasses(px, pxSpan);
        break;
      case 'headband':
        _paintHeadband(px, pxSpan);
        break;
      case 'headphones':
        _paintHeadphones(px, pxSpan);
        break;
      case 'cap':
        _paintCap(px, pxSpan, shirtBase, shirtShadow, shirtHighlight);
        break;
      case 'none':
      default:
        break;
    }
  }

  // --- HAIRSTYLE IMPLEMENTATIONS ---

  void _paintShortHair(
    Function(int, int, Color) px,
    Function(int, int, int, Color) pxSpan,
    Color base,
    Color shadow,
    Color highlight,
    Color outline,
    Color darkOutline,
  ) {
    // Hair Crown Outline
    pxSpan(2, 9, 14, darkOutline);
    pxSpan(3, 7, 16, darkOutline);

    // Crown Body
    pxSpan(3, 8, 15, base);
    pxSpan(4, 6, 17, base);
    pxSpan(5, 5, 18, base);

    // Crown Shine Streak (16-bit GBA style sheen)
    pxSpan(3, 10, 13, highlight);
    pxSpan(4, 9, 14, highlight);

    // Shadow on crown sides
    px(6, 4, shadow);
    px(17, 4, shadow);
    px(5, 5, shadow);
    px(18, 5, shadow);

    // Bangs & Fringe framing the face
    // Left fringe strand
    px(6, 6, base);
    px(6, 7, base);
    px(6, 8, shadow);
    px(7, 6, base);
    px(7, 7, highlight);
    px(7, 8, shadow);

    // Center parting
    px(10, 6, shadow);
    px(11, 5, base);
    px(11, 6, highlight);
    px(12, 5, base);
    px(12, 6, shadow);

    // Right fringe strand
    px(16, 6, base);
    px(16, 7, highlight);
    px(16, 8, shadow);
    px(17, 6, base);
    px(17, 7, base);
    px(17, 8, shadow);

    // Sideburns
    px(5, 6, darkOutline);
    px(5, 7, shadow);
    px(18, 6, darkOutline);
    px(18, 7, shadow);
  }

  void _paintLongHair(
    Function(int, int, Color) px,
    Function(int, int, int, Color) pxSpan,
    Color base,
    Color shadow,
    Color highlight,
    Color outline,
    Color darkOutline,
  ) {
    // Crown & Bangs
    _paintShortHair(px, pxSpan, base, shadow, highlight, outline, darkOutline);

    // Long cascading side tresses (drapes down to shoulders Y: 9..20)
    for (int y = 9; y <= 20; y++) {
      // Left Lock
      px(4, y, darkOutline);
      px(5, y, y % 3 == 0 ? highlight : base);
      px(6, y, shadow);

      // Right Lock
      px(17, y, shadow);
      px(18, y, y % 3 == 0 ? highlight : base);
      px(19, y, darkOutline);
    }

    // Curled tip ends at Y: 21
    px(5, 21, darkOutline);
    px(6, 21, shadow);
    px(17, 21, shadow);
    px(18, 21, darkOutline);
  }

  void _paintBuzzHair(
    Function(int, int, Color) px,
    Function(int, int, int, Color) pxSpan,
    Color base,
    Color shadow,
    Color highlight,
    Color outline,
  ) {
    // Close-cut textured crown
    pxSpan(3, 9, 14, outline);
    pxSpan(4, 7, 16, base);
    pxSpan(5, 6, 17, base);

    // Subtle texture highlights
    px(10, 4, highlight);
    px(12, 4, highlight);
    px(13, 4, highlight);

    // Sharp clean hairline
    pxSpan(6, 7, 16, outline);

    // Faded tapered sides
    px(6, 6, shadow);
    px(6, 7, shadow);
    px(17, 6, shadow);
    px(17, 7, shadow);
  }

  void _paintSpikyHair(
    Function(int, int, Color) px,
    Function(int, int, int, Color) pxSpan,
    Color base,
    Color shadow,
    Color highlight,
    Color outline,
    Color darkOutline,
  ) {
    // Upward Anime / RPG Hero Spikes
    // Center Spike
    px(11, 0, darkOutline);
    px(12, 0, darkOutline);
    px(11, 1, highlight);
    px(12, 1, base);
    pxSpan(2, 10, 13, base);

    // Left Spike
    px(8, 1, darkOutline);
    px(9, 1, darkOutline);
    px(8, 2, highlight);
    px(9, 2, base);
    px(7, 3, highlight);
    px(8, 3, base);

    // Right Spike
    px(14, 1, darkOutline);
    px(15, 1, darkOutline);
    px(14, 2, base);
    px(15, 2, highlight);
    px(15, 3, base);
    px(16, 3, highlight);

    // Side Spikes
    px(4, 4, darkOutline);
    px(5, 4, highlight);
    px(4, 5, darkOutline);
    px(5, 5, base);

    px(19, 4, darkOutline);
    px(18, 4, highlight);
    px(19, 5, darkOutline);
    px(18, 5, base);

    // Main Crown Body
    pxSpan(3, 9, 14, base);
    pxSpan(4, 6, 17, base);
    pxSpan(5, 6, 17, base);

    // Bangs
    px(7, 6, highlight);
    px(7, 7, shadow);
    px(10, 6, highlight);
    px(10, 7, shadow);
    px(13, 6, base);
    px(14, 6, highlight);
    px(14, 7, shadow);
    px(16, 6, highlight);
    px(16, 7, shadow);
  }

  // --- ACCESSORY IMPLEMENTATIONS ---

  void _paintGlasses(Function(int, int, Color) px, Function(int, int, int, Color) pxSpan) {
    const frameColor = Color(0xFF0F172A); // Sleek charcoal frame
    const glintColor = Color(0xAAFFFFFF);

    // Left Lens Frame
    pxSpan(8, 7, 11, frameColor);
    pxSpan(11, 7, 11, frameColor);
    px(7, 9, frameColor);
    px(7, 10, frameColor);
    px(11, 9, frameColor);
    px(11, 10, frameColor);
    // Glint
    px(8, 9, glintColor);

    // Nose Bridge
    px(12, 9, frameColor);

    // Right Lens Frame
    pxSpan(8, 12, 16, frameColor);
    pxSpan(11, 12, 16, frameColor);
    px(12, 9, frameColor);
    px(12, 10, frameColor);
    px(16, 9, frameColor);
    px(16, 10, frameColor);
    // Glint
    px(13, 9, glintColor);
  }

  void _paintHeadband(Function(int, int, Color) px, Function(int, int, int, Color) pxSpan) {
    const bandColor = Color(0xFFDC2626); // Crimson adventurer headband
    const bandShadow = Color(0xFF991B1B);
    const metalPlate = Color(0xFFE2E8F0); // Silver metal emblem
    const metalDark = Color(0xFF64748B);

    // Headband across forehead (Y: 5..6)
    pxSpan(5, 6, 17, bandColor);
    pxSpan(6, 6, 17, bandShadow);

    // Silver metal centerpiece (clean crest, NO pokeball)
    pxSpan(5, 10, 13, metalPlate);
    pxSpan(6, 10, 13, metalDark);
    px(10, 5, const Color(0xFF334155));
    px(13, 5, const Color(0xFF334155));
  }

  void _paintHeadphones(Function(int, int, Color) px, Function(int, int, int, Color) pxSpan) {
    const cupColor = Color(0xFF0F172A);
    const cupAccent = Color(0xFF38BDF8); // Cyan gamer accent
    const bandColor = Color(0xFF334155);

    // Top Headband Arch (Y: 1..2)
    pxSpan(1, 9, 14, bandColor);
    px(8, 2, bandColor);
    px(15, 2, bandColor);

    // Left Ear Cup (X: 3..4, Y: 7..11)
    for (int y = 7; y <= 11; y++) {
      px(3, y, cupColor);
      px(4, y, cupAccent);
    }

    // Right Ear Cup (X: 19..20, Y: 7..11)
    for (int y = 7; y <= 11; y++) {
      px(19, y, cupAccent);
      px(20, y, cupColor);
    }
  }

  void _paintCap(
    Function(int, int, Color) px,
    Function(int, int, int, Color) pxSpan,
    Color base,
    Color shadow,
    Color highlight,
  ) {
    const darkOutline = Color(0xFF1E2235);

    // Cap Dome
    pxSpan(2, 9, 14, darkOutline);
    pxSpan(3, 8, 15, highlight);
    pxSpan(4, 7, 16, base);
    pxSpan(5, 6, 17, base);

    // Flat Cap Visor (clean modern skater style, NO pokeball)
    pxSpan(6, 5, 18, darkOutline);
    pxSpan(7, 5, 18, shadow);
  }

  @override
  bool shouldRepaint(covariant PixelAvatarBustPainter oldDelegate) {
    return oldDelegate.config != config;
  }
}
