import 'package:flutter/material.dart';

import '../../../core/config/app_config.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/theme/app_spacing.dart';
import '../../../core/theme/app_typography.dart';
import '../../../core/widgets/tavelo_logo.dart';

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

class BrandMark extends StatelessWidget {
  const BrandMark({super.key, this.compact = false});

  final bool compact;

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    return Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        TaveloLogo(height: compact ? 30 : 40),
        const SizedBox(height: Sp.sm),
        Text(
          AppConfig.tagline.toUpperCase(),
          style: AppTypography.labelXs(c.mutedForeground),
        ),
      ],
    );
  }
}

/// A single-purpose status page: icon, headline, explanation, and up to two
/// actions. Every account-status and error screen is built from this, so the
/// tone stays consistent.
class AuthStatusView extends StatelessWidget {
  const AuthStatusView({
    super.key,
    required this.icon,
    required this.tone,
    required this.title,
    required this.body,
    this.primaryLabel,
    this.onPrimary,
    this.secondaryLabel,
    this.onSecondary,
    this.detail,
  });

  final IconData icon;
  final Color tone;
  final String title;
  final String body;
  final String? detail;
  final String? primaryLabel;
  final VoidCallback? onPrimary;
  final String? secondaryLabel;
  final VoidCallback? onSecondary;

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    return Container(
      padding: const EdgeInsets.all(Sp.xxl),
      decoration: BoxDecoration(
        color: c.card,
        borderRadius: R.rLg,
        border: Border.all(color: c.border),
        boxShadow: c.elevation1,
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Container(
            width: 48,
            height: 48,
            decoration: BoxDecoration(
              color: tone.withValues(alpha: 0.12),
              borderRadius: R.rMd,
              border: Border.all(color: tone.withValues(alpha: 0.3)),
            ),
            alignment: Alignment.center,
            child: Icon(icon, size: 24, color: tone),
          ),
          const SizedBox(height: Sp.lg),
          Text(
            title,
            style: AppTypography.display(size: 20, color: c.foreground),
          ),
          const SizedBox(height: Sp.sm),
          Text(
            body,
            style: AppTypography.body(size: 14, color: c.mutedForeground),
          ),
          if (detail != null) ...[
            const SizedBox(height: Sp.md),
            Container(
              padding: const EdgeInsets.all(Sp.md),
              decoration: BoxDecoration(
                color: c.muted,
                borderRadius: R.rMd,
                border: Border.all(color: c.border),
              ),
              child: Text(
                detail!,
                style: AppTypography.body(size: 12.5, color: c.mutedForeground),
              ),
            ),
          ],
          if (primaryLabel != null) ...[
            const SizedBox(height: Sp.xl),
            FilledButton(onPressed: onPrimary, child: Text(primaryLabel!)),
          ],
          if (secondaryLabel != null) ...[
            const SizedBox(height: Sp.sm),
            TextButton(onPressed: onSecondary, child: Text(secondaryLabel!)),
          ],
        ],
      ),
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
