import 'dart:math' as math;
import 'package:flutter/material.dart';
import '../constants/app_colors.dart';

/// Tactile Neo-Brutalist Pill / Rounded Button with hard offset shadow and click physics
class NeoButton extends StatefulWidget {
  final Widget? child;
  final String? text;
  final VoidCallback? onPressed;
  final Color backgroundColor;
  final Color textColor;
  final Color borderColor;
  final double borderWidth;
  final double borderRadius;
  final Offset shadowOffset;
  final EdgeInsetsGeometry padding;
  final double? height;
  final double? width;
  final bool isFullWidth;
  final IconData? icon;
  final double fontSize;
  final FontWeight fontWeight;
  final bool isLoading;
  final String? loadingText;
  final Color? loadingColor;

  const NeoButton({
    super.key,
    this.child,
    this.text,
    this.onPressed,
    this.backgroundColor = AppColors.amberButton,
    this.textColor = AppColors.inkBlack,
    this.borderColor = AppColors.inkBlack,
    this.borderWidth = 2.2,
    this.borderRadius = 999.0, // Default pill shape
    this.shadowOffset = const Offset(2.5, 3.0),
    this.padding = const EdgeInsets.symmetric(horizontal: 22, vertical: 12),
    this.height,
    this.width,
    this.isFullWidth = false,
    this.icon,
    this.fontSize = 14.5,
    this.fontWeight = FontWeight.w800,
    this.isLoading = false,
    this.loadingText,
    this.loadingColor,
  });

  @override
  State<NeoButton> createState() => _NeoButtonState();
}

class _NeoButtonState extends State<NeoButton> {
  bool _isPressed = false;
  bool _isHovered = false;

  @override
  Widget build(BuildContext context) {
    final bool isInteractive = !widget.isLoading && widget.onPressed != null;

    final effectiveShadow = _isPressed
        ? const Offset(0.5, 1.0)
        : (_isHovered
            ? Offset(widget.shadowOffset.dx + 0.8, widget.shadowOffset.dy + 0.8)
            : widget.shadowOffset);

    final transformOffset = _isPressed ? const Offset(1.5, 1.8) : Offset.zero;
    final effectiveLoadingColor = widget.loadingColor ?? widget.textColor;
    final double spinnerSize = math.min(18.0, widget.fontSize + 2.0);

    Widget content;
    if (widget.isLoading) {
      final spinner = SizedBox(
        width: spinnerSize,
        height: spinnerSize,
        child: CircularProgressIndicator(
          strokeWidth: 2.2,
          valueColor: AlwaysStoppedAnimation<Color>(effectiveLoadingColor),
        ),
      );

      final label = widget.loadingText ?? widget.text;

      if (label != null && label.isNotEmpty) {
        content = Row(
          mainAxisSize: widget.isFullWidth ? MainAxisSize.max : MainAxisSize.min,
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            spinner,
            const SizedBox(width: 8),
            Flexible(
              child: Text(
                label,
                overflow: TextOverflow.ellipsis,
                maxLines: 1,
                style: TextStyle(
                  color: widget.textColor,
                  fontWeight: widget.fontWeight,
                  fontSize: widget.fontSize,
                  letterSpacing: -0.2,
                ),
              ),
            ),
          ],
        );
      } else {
        content = Center(child: spinner);
      }
    } else {
      content = widget.child ??
          Row(
            mainAxisSize: widget.isFullWidth ? MainAxisSize.max : MainAxisSize.min,
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              if (widget.icon != null) ...[
                Icon(widget.icon, size: 18, color: widget.textColor),
                const SizedBox(width: 8),
              ],
              Flexible(
                child: Text(
                  widget.text ?? '',
                  overflow: TextOverflow.ellipsis,
                  maxLines: 1,
                  style: TextStyle(
                    color: widget.textColor,
                    fontWeight: widget.fontWeight,
                    fontSize: widget.fontSize,
                    letterSpacing: -0.2,
                  ),
                ),
              ),
            ],
          );
    }

    return MouseRegion(
      cursor: widget.isLoading
          ? SystemMouseCursors.wait
          : (isInteractive ? SystemMouseCursors.click : SystemMouseCursors.basic),
      onEnter: (_) {
        if (isInteractive) setState(() => _isHovered = true);
      },
      onExit: (_) {
        if (isInteractive) setState(() => _isHovered = false);
      },
      child: GestureDetector(
        onTapDown: (_) {
          if (isInteractive) setState(() => _isPressed = true);
        },
        onTapUp: (_) {
          if (isInteractive) setState(() => _isPressed = false);
        },
        onTapCancel: () {
          if (isInteractive) setState(() => _isPressed = false);
        },
        onTap: isInteractive ? widget.onPressed : null,
        child: AnimatedContainer(
          duration: const Duration(milliseconds: 70),
          transform: Matrix4.translationValues(transformOffset.dx, transformOffset.dy, 0),
          width: widget.isFullWidth ? double.infinity : widget.width,
          height: widget.height,
          padding: widget.padding,
          decoration: BoxDecoration(
            color: widget.backgroundColor,
            borderRadius: BorderRadius.circular(widget.borderRadius),
            border: Border.all(
              color: widget.borderColor,
              width: widget.borderWidth,
            ),
            boxShadow: [
              BoxShadow(
                color: widget.borderColor,
                offset: effectiveShadow,
                blurRadius: 0,
                spreadRadius: 0,
              ),
            ],
          ),
          child: content,
        ),
      ),
    );
  }
}

/// Neo-Brutalist Card with solid ink border and hard offset drop shadow
class NeoCard extends StatelessWidget {
  final Widget child;
  final Color backgroundColor;
  final Color borderColor;
  final double borderWidth;
  final double borderRadius;
  final Offset shadowOffset;
  final EdgeInsetsGeometry padding;
  final double? width;
  final double? height;

  const NeoCard({
    super.key,
    required this.child,
    this.backgroundColor = AppColors.creamCard,
    this.borderColor = AppColors.inkBlack,
    this.borderWidth = 2.4,
    this.borderRadius = 24.0,
    this.shadowOffset = const Offset(5.0, 5.0),
    this.padding = const EdgeInsets.all(24.0),
    this.width,
    this.height,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      width: width,
      height: height,
      padding: padding,
      decoration: BoxDecoration(
        color: backgroundColor,
        borderRadius: BorderRadius.circular(borderRadius),
        border: Border.all(color: borderColor, width: borderWidth),
        boxShadow: [
          BoxShadow(
            color: borderColor,
            offset: shadowOffset,
            blurRadius: 0,
            spreadRadius: 0,
          ),
        ],
      ),
      child: child,
    );
  }
}

/// Neo-Brutalist Badge with subtle border and bold typography
class NeoBadge extends StatelessWidget {
  final String text;
  final Color backgroundColor;
  final Color textColor;
  final Color? borderColor;
  final double borderWidth;
  final double borderRadius;
  final EdgeInsetsGeometry padding;
  final double fontSize;
  final FontWeight fontWeight;
  final Widget? icon;

  const NeoBadge({
    super.key,
    required this.text,
    this.backgroundColor = const Color(0xFFF3F4F6),
    this.textColor = AppColors.inkBlack,
    this.borderColor,
    this.borderWidth = 1.2,
    this.borderRadius = 8.0,
    this.padding = const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
    this.fontSize = 11.0,
    this.fontWeight = FontWeight.w700,
    this.icon,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: padding,
      decoration: BoxDecoration(
        color: backgroundColor,
        borderRadius: BorderRadius.circular(borderRadius),
        border: borderColor != null
            ? Border.all(color: borderColor!, width: borderWidth)
            : null,
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          if (icon != null) ...[
            icon!,
            const SizedBox(width: 4),
          ],
          Text(
            text,
            style: TextStyle(
              fontSize: fontSize,
              fontWeight: fontWeight,
              color: textColor,
              letterSpacing: 0.2,
            ),
          ),
        ],
      ),
    );
  }
}

/// Custom painter for the diagonal striped pattern banner on room cards
class DiagonalStripesPainter extends CustomPainter {
  final Color baseColor;
  final Color stripeColor;
  final double stripeWidth;
  final double spacing;

  DiagonalStripesPainter({
    required this.baseColor,
    required this.stripeColor,
    this.stripeWidth = 10,
    this.spacing = 22,
  });

  @override
  void paint(Canvas canvas, Size size) {
    // Fill background
    final bgPaint = Paint()..color = baseColor;
    canvas.drawRect(Rect.fromLTWH(0, 0, size.width, size.height), bgPaint);

    // Draw 45-degree diagonal stripes
    final stripePaint = Paint()
      ..color = stripeColor
      ..strokeWidth = stripeWidth
      ..style = PaintingStyle.stroke;

    final double total = size.width + size.height * 1.5;
    for (double i = -size.height; i < total; i += spacing) {
      canvas.drawLine(
        Offset(i, 0),
        Offset(i + size.height, size.height),
        stripePaint,
      );
    }
  }

  @override
  bool shouldRepaint(covariant DiagonalStripesPainter oldDelegate) {
    return oldDelegate.baseColor != baseColor ||
        oldDelegate.stripeColor != stripeColor ||
        oldDelegate.stripeWidth != stripeWidth ||
        oldDelegate.spacing != spacing;
  }
}

/// Mascot with sparkling stars mimicking the cheerful cat with sparkles
class MascotSparkleBadge extends StatelessWidget {
  final double size;
  final String? assetPath;
  final bool isDark;

  const MascotSparkleBadge({
    super.key,
    this.size = 72,
    this.assetPath,
    this.isDark = false,
  });

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      width: size + 24,
      height: size + 24,
      child: Stack(
        clipBehavior: Clip.none,
        alignment: Alignment.center,
        children: [
          // Sparkle 1 (Top Left)
          Positioned(
            top: -2,
            left: -2,
            child: _buildSparkle(15, isDark ? AppColors.neonLime : AppColors.amberButton),
          ),
          // Sparkle 2 (Top Right)
          Positioned(
            top: -4,
            right: 0,
            child: _buildSparkle(20, isDark ? AppColors.darkHeroMagenta : const Color(0xFFFBBF24)),
          ),
          // Sparkle 3 (Bottom Right)
          Positioned(
            bottom: 0,
            right: -2,
            child: _buildSparkle(14, isDark ? AppColors.neonLime : AppColors.coralAccent),
          ),
          // Mascot Icon (Tightly zoomed so cat face & headphones fill circle)
          Container(
            width: size,
            height: size,
            decoration: BoxDecoration(
              shape: BoxShape.circle,
              color: isDark ? AppColors.darkCard : const Color(0xFFF6F4EE),
              border: Border.all(color: isDark ? Colors.white : AppColors.inkBlack, width: 2.8),
              boxShadow: [
                BoxShadow(
                  color: isDark ? Colors.white : AppColors.inkBlack,
                  offset: const Offset(3, 3.5),
                  blurRadius: 0,
                ),
              ],
            ),
            padding: const EdgeInsets.all(2),
            child: ClipOval(
              child: Transform.scale(
                scale: 1.65,
                child: Image.asset(
                  assetPath ?? (isDark ? 'assets/images/teamchat_logo_dark.jpg' : 'assets/images/teamchat_logo.jpg'),
                  fit: BoxFit.cover,
                  alignment: Alignment.center,
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildSparkle(double sparkleSize, Color color) {
    return CustomPaint(
      size: Size(sparkleSize, sparkleSize),
      painter: SparklePainter(color: color),
    );
  }
}

/// 4-point star sparkle painter
class SparklePainter extends CustomPainter {
  final Color color;

  SparklePainter({required this.color});

  @override
  void paint(Canvas canvas, Size size) {
    final paint = Paint()
      ..color = color
      ..style = PaintingStyle.fill;

    final path = Path();
    final cx = size.width / 2;
    final cy = size.height / 2;
    final rOut = size.width / 2;
    final rIn = rOut * 0.22;

    for (int i = 0; i < 4; i++) {
      final double angle = i * math.pi / 2;
      final double nextAngle = angle + math.pi / 4;

      if (i == 0) {
        path.moveTo(cx + rOut * math.cos(angle), cy + rOut * math.sin(angle));
      } else {
        path.lineTo(cx + rOut * math.cos(angle), cy + rOut * math.sin(angle));
      }
      path.lineTo(cx + rIn * math.cos(nextAngle), cy + rIn * math.sin(nextAngle));
    }
    path.close();

    canvas.drawPath(path, paint);
  }

  @override
  bool shouldRepaint(covariant SparklePainter oldDelegate) => oldDelegate.color != color;
}
