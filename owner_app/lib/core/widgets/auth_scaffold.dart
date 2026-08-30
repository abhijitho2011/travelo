import 'package:flutter/material.dart';

import '../config/app_config.dart';
import '../theme/app_colors.dart';
import '../theme/app_spacing.dart';
import '../theme/app_typography.dart';
import 'tavelo_logo.dart';

/// Shared frame for every unauthenticated screen: the Tavelo mark, a centred
/// card no wider than a comfortable reading column, and the support footer.
class AuthScaffold extends StatelessWidget {
  const AuthScaffold({
    super.key,
    required this.children,
    this.showBrand = true,
    this.footer,
  });

  final List<Widget> children;
  final bool showBrand;
  final Widget? footer;

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    return Scaffold(
      backgroundColor: c.background,
      body: SafeArea(
        child: Center(
          child: SingleChildScrollView(
            padding: const EdgeInsets.symmetric(
              horizontal: Sp.xxl,
              vertical: 32,
            ),
            child: ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 420),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  if (showBrand) ...[
                    const BrandMark(),
                    const SizedBox(height: 32),
                  ],
                  ...children,
                  if (footer != null) ...[
                    const SizedBox(height: 32),
                    DefaultTextStyle(
                      style: AppTypography.body(
                        size: 12,
                        color: c.mutedForeground,
                      ),
                      textAlign: TextAlign.center,
                      child: footer!,
                    ),
                  ],
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}

/// The owner portal's wordmark: the Tavelo mark, the product name and the
/// owner-facing tagline.
class BrandMark extends StatelessWidget {
  const BrandMark({super.key, this.compact = false});

  final bool compact;

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    return Row(
      mainAxisAlignment: MainAxisAlignment.center,
      children: [
        TaveloMark(size: compact ? 30 : 38),
        const SizedBox(width: Sp.md),
        // Flexible so a long tagline — or a large system text scale — narrows
        // the wordmark instead of running off the edge of a small phone.
        Flexible(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            mainAxisSize: MainAxisSize.min,
            children: [
              Text(
                AppConfig.appName,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: AppTypography.display(
                  size: compact ? 17 : 21,
                  color: c.foreground,
                ),
              ),
              Text(
                AppConfig.tagline.toUpperCase(),
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: AppTypography.labelXs(c.mutedForeground),
              ),
            ],
          ),
        ),
      ],
    );
  }
}

/// Inline error strip shown under a form field.
class InlineError extends StatelessWidget {
  const InlineError({super.key, required this.message, this.icon});

  final String message;
  final IconData? icon;

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: Sp.md, vertical: 10),
      decoration: BoxDecoration(
        color: c.destructive.withValues(alpha: 0.1),
        borderRadius: R.rMd,
        border: Border.all(color: c.destructive.withValues(alpha: 0.3)),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(icon ?? Icons.error_outline, size: 16, color: c.destructive),
          const SizedBox(width: Sp.sm),
          Expanded(
            child: Text(
              message,
              style: AppTypography.body(size: 12.5, color: c.destructive),
            ),
          ),
        ],
      ),
    );
  }
}

/// The spinner a filled button shows while its action is in flight.
class ButtonSpinner extends StatelessWidget {
  const ButtonSpinner({super.key, this.onPrimary = true});

  /// False when the button's ground is the page rather than the primary fill.
  final bool onPrimary;

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    return SizedBox(
      width: 18,
      height: 18,
      child: CircularProgressIndicator(
        strokeWidth: 2,
        valueColor: AlwaysStoppedAnimation(
          onPrimary ? c.primaryForeground : c.primary,
        ),
      ),
    );
  }
}

/// A small four-colour mark, so the Google button reads as Google without
/// shipping a network-loaded asset (the portal must work under a strict CSP).
class GoogleGlyph extends StatelessWidget {
  const GoogleGlyph({super.key});

  @override
  Widget build(BuildContext context) => const SizedBox(
    width: 18,
    height: 18,
    child: CustomPaint(painter: _GooglePainter()),
  );
}

class _GooglePainter extends CustomPainter {
  const _GooglePainter();

  static const _blue = Color(0xFF4285F4);
  static const _red = Color(0xFFEA4335);
  static const _yellow = Color(0xFFFBBC05);
  static const _green = Color(0xFF34A853);

  @override
  void paint(Canvas canvas, Size size) {
    final rect = Offset.zero & size;
    final stroke = size.width * 0.24;
    final inner = rect.deflate(stroke / 2);
    final paint = Paint()
      ..style = PaintingStyle.stroke
      ..strokeWidth = stroke
      ..strokeCap = StrokeCap.butt;

    void arc(double startDeg, double sweepDeg, Color color) {
      paint.color = color;
      canvas.drawArc(
        inner,
        startDeg * 3.1415926535 / 180,
        sweepDeg * 3.1415926535 / 180,
        false,
        paint,
      );
    }

    arc(-25, -70, _red);
    arc(-95, -85, _yellow);
    arc(180, -85, _green);
    arc(-25, 70, _blue);

    // The signature horizontal bar.
    canvas.drawRect(
      Rect.fromLTWH(
        size.width * 0.5,
        size.height * 0.42,
        size.width * 0.5,
        stroke * 0.85,
      ),
      Paint()..color = _blue,
    );
  }

  @override
  bool shouldRepaint(covariant CustomPainter oldDelegate) => false;
}
