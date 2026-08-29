import 'package:flutter/material.dart';

import '../api/api_exception.dart';
import '../theme/app_colors.dart';
import '../theme/app_spacing.dart';
import '../theme/app_typography.dart';
import 'primitives.dart';

/// HF `<EmptyState>` — a framed panel with a title and an optional hint.
class EmptyState extends StatelessWidget {
  const EmptyState({
    super.key,
    required this.title,
    this.hint,
    this.icon,
    this.action,
  });

  final String title;
  final String? hint;
  final IconData? icon;
  final Widget? action;

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.symmetric(horizontal: Sp.xxl, vertical: 32),
      decoration: BoxDecoration(
        borderRadius: R.rMd,
        border: Border.all(color: c.border),
        color: c.card.withValues(alpha: 0.4),
      ),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(
            icon ?? Icons.inbox_outlined,
            size: 26,
            color: c.mutedForeground,
          ),
          const SizedBox(height: Sp.md),
          Text(
            title,
            textAlign: TextAlign.center,
            style: AppTypography.body(
              size: 14,
              weight: FontWeight.w600,
              color: c.foreground,
            ),
          ),
          if (hint != null) ...[
            const SizedBox(height: 4),
            Text(
              hint!,
              textAlign: TextAlign.center,
              style: AppTypography.body(size: 12.5, color: c.mutedForeground),
            ),
          ],
          if (action != null) ...[const SizedBox(height: Sp.lg), action!],
        ],
      ),
    );
  }
}

/// Failure state. "We are offline" and "your session cannot see this" deserve
/// different words from a generic failure, so the [error] — when it is an
/// [ApiException] — picks the icon and the headline.
///
/// [message] overrides the body with the screen's own sentence ("Could not load
/// your portfolio."), which is usually more useful than the server's wording.
class ErrorState extends StatelessWidget {
  const ErrorState({super.key, this.error, this.message, this.onRetry});

  final Object? error;

  /// Screen-specific copy, shown instead of the derived body.
  final String? message;
  final VoidCallback? onRetry;

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    final api = error is ApiException ? error as ApiException : null;

    final (IconData icon, String title, String body) = switch (api) {
      final e? when e.isNetwork => (
        Icons.wifi_off_outlined,
        'No connection',
        "We couldn't reach Tavelo. Check your connection and try again.",
      ),
      final e? when e.status == 404 || e.code.endsWith('NOT_FOUND') => (
        Icons.cloud_off_outlined,
        'Not available',
        e.message,
      ),
      final e? when e.code == 'FORBIDDEN' || e.status == 403 => (
        Icons.lock_outline,
        'Not permitted',
        "This account doesn't have access to that.",
      ),
      final e? => (Icons.error_outline, 'Something went wrong', e.message),
      _ => (
        Icons.error_outline,
        'Something went wrong',
        'Please try again in a moment.',
      ),
    };

    return Container(
      width: double.infinity,
      padding: const EdgeInsets.symmetric(horizontal: Sp.xxl, vertical: 32),
      decoration: BoxDecoration(
        borderRadius: R.rMd,
        border: Border.all(color: c.border),
        color: c.card,
      ),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(icon, size: 28, color: c.mutedForeground),
          const SizedBox(height: Sp.md),
          Text(
            title,
            textAlign: TextAlign.center,
            style: AppTypography.body(
              size: 14.5,
              weight: FontWeight.w700,
              color: c.foreground,
            ),
          ),
          const SizedBox(height: 4),
          Text(
            message ?? body,
            textAlign: TextAlign.center,
            style: AppTypography.body(size: 12.5, color: c.mutedForeground),
          ),
          if (onRetry != null) ...[
            const SizedBox(height: Sp.lg),
            OutlinedButton.icon(
              onPressed: onRetry,
              icon: const Icon(Icons.refresh, size: 16),
              label: const Text('Try again'),
            ),
          ],
        ],
      ),
    );
  }
}

/// A shimmering placeholder block. Composed into skeleton screens so a slow
/// network shows layout rather than a spinner on an empty page.
class Shimmer extends StatefulWidget {
  const Shimmer({
    super.key,
    this.width = double.infinity,
    this.height = 14,
    this.radius = R.sm,
  });

  final double width;
  final double height;
  final double radius;

  @override
  State<Shimmer> createState() => _ShimmerState();
}

class _ShimmerState extends State<Shimmer> with SingleTickerProviderStateMixin {
  late final AnimationController _c = AnimationController(
    vsync: this,
    duration: const Duration(milliseconds: 1300),
  )..repeat();

  @override
  void dispose() {
    _c.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    return AnimatedBuilder(
      animation: _c,
      builder: (context, _) {
        final t = _c.value;
        return Container(
          width: widget.width,
          height: widget.height,
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(widget.radius),
            gradient: LinearGradient(
              begin: Alignment(-1 - 2 * (1 - t), 0),
              end: Alignment(1 - 2 * (1 - t), 0),
              colors: [c.muted, c.border.withValues(alpha: 0.65), c.muted],
            ),
          ),
        );
      },
    );
  }
}

/// Skeleton for a list of cards — the default loading state across the app.
class ListSkeleton extends StatelessWidget {
  const ListSkeleton({super.key, this.rows = 4, this.height = 78});

  final int rows;
  final double height;

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    return Column(
      children: [
        for (var i = 0; i < rows; i++)
          Container(
            margin: const EdgeInsets.only(bottom: Sp.md),
            padding: Sp.card,
            height: height,
            decoration: BoxDecoration(
              color: c.card,
              borderRadius: R.rLg,
              border: Border.all(color: c.border),
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: const [
                Shimmer(width: 140, height: 13),
                SizedBox(height: 10),
                Shimmer(width: 220, height: 11),
                SizedBox(height: 8),
                Shimmer(width: 90, height: 11),
              ],
            ),
          ),
      ],
    );
  }
}

/// Skeleton for the KPI grid.
class KpiSkeleton extends StatelessWidget {
  const KpiSkeleton({super.key, this.count = 4});

  final int count;

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    return GridView.count(
      crossAxisCount: 2,
      crossAxisSpacing: Sp.md,
      mainAxisSpacing: Sp.md,
      shrinkWrap: true,
      physics: const NeverScrollableScrollPhysics(),
      childAspectRatio: KpiGrid.tileAspectRatio,
      children: [
        for (var i = 0; i < count; i++)
          Container(
            padding: const EdgeInsets.all(14),
            decoration: BoxDecoration(
              color: c.card,
              borderRadius: R.rLg,
              border: Border.all(color: c.border),
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              mainAxisAlignment: MainAxisAlignment.center,
              children: const [
                Shimmer(width: 64, height: 10),
                SizedBox(height: 12),
                Shimmer(width: 84, height: 20),
              ],
            ),
          ),
      ],
    );
  }
}

/// A hairline progress bar for a section that is refreshing inside an already
/// drawn page — the sections that used to render a bare `LinearProgressIndicator`.
class InlineLoader extends StatelessWidget {
  const InlineLoader({super.key});

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    return ClipRRect(
      borderRadius: BorderRadius.circular(R.sm),
      child: LinearProgressIndicator(
        minHeight: 3,
        backgroundColor: c.muted,
        color: c.primary,
      ),
    );
  }
}
