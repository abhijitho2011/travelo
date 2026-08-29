import 'package:flutter/material.dart';

import '../theme/app_colors.dart';
import '../theme/app_spacing.dart';
import '../theme/app_typography.dart';
import 'status_badge.dart';

/// A generic two-line list row inside a [Panel] whose body is unpadded.
/// The building block behind the invoice list, the device list and every other
/// divided list in the app.
class DataRow2 extends StatelessWidget {
  const DataRow2({
    super.key,
    required this.title,
    this.subtitle,
    this.leading,
    this.trailing,
    this.badge,
    this.onTap,
    this.titleIcon,
  });

  final String title;
  final String? subtitle;
  final Widget? leading;
  final Widget? trailing;
  final Widget? badge;
  final VoidCallback? onTap;
  final IconData? titleIcon;

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    return InkWell(
      onTap: onTap,
      child: Padding(
        padding: Sp.row,
        child: Row(
          children: [
            if (leading != null) ...[leading!, const SizedBox(width: Sp.md)],
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                mainAxisSize: MainAxisSize.min,
                children: [
                  Row(
                    children: [
                      if (titleIcon != null) ...[
                        Icon(titleIcon, size: 13, color: c.warning),
                        const SizedBox(width: 5),
                      ],
                      Flexible(
                        child: Text(
                          title,
                          overflow: TextOverflow.ellipsis,
                          style: AppTypography.body(
                            size: 13.5,
                            weight: FontWeight.w600,
                            color: c.foreground,
                          ),
                        ),
                      ),
                    ],
                  ),
                  if (subtitle != null)
                    Text(
                      subtitle!,
                      overflow: TextOverflow.ellipsis,
                      style: AppTypography.body(
                        size: 12,
                        color: c.mutedForeground,
                      ),
                    ),
                ],
              ),
            ),
            if (badge != null) ...[const SizedBox(width: Sp.sm), badge!],
            if (trailing != null) ...[const SizedBox(width: Sp.sm), trailing!],
          ],
        ),
      ),
    );
  }
}

/// The tone of a page-level notice. Deliberately the same four the owner app
/// already spoke in, mapped onto the shared status palette.
enum NoticeTone { info, success, warning, danger }

extension NoticeToneX on NoticeTone {
  StatusTone get status => switch (this) {
    NoticeTone.info => StatusTone.info,
    NoticeTone.success => StatusTone.healthy,
    NoticeTone.warning => StatusTone.warning,
    NoticeTone.danger => StatusTone.critical,
  };
}

/// A page-level notice: 10%-tinted panel, 30% border, tone-coloured glyph.
///
/// Same construction as the status badge — a tint of one palette colour rather
/// than a hard-coded pastel — so it stays legible in both themes.
class NoticeBanner extends StatelessWidget {
  const NoticeBanner({
    super.key,
    required this.text,
    this.tone = NoticeTone.info,
    this.icon,
    this.action,
  });

  final String text;
  final NoticeTone tone;
  final IconData? icon;
  final Widget? action;

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    final t = tone.status.color(c);
    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: t.withValues(alpha: 0.1),
        borderRadius: R.rMd,
        border: Border.all(color: t.withValues(alpha: 0.3)),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.center,
        children: [
          Icon(icon ?? tone.status.icon, color: t, size: 18),
          const SizedBox(width: Sp.md),
          Expanded(
            child: Text(
              text,
              // Body copy stays on the foreground colour: a whole paragraph in
              // the tone colour is loud in light mode and muddy in dark.
              style: AppTypography.body(size: 13, color: c.foreground),
            ),
          ),
          if (action != null) ...[const SizedBox(width: Sp.sm), action!],
        ],
      ),
    );
  }
}

/// A small icon + label pill — the read-only fact chips on a room-type card and
/// the amenity chips on a hotel.
class MetaPill extends StatelessWidget {
  const MetaPill({
    super.key,
    required this.icon,
    required this.label,
    this.tone,
  });

  final IconData icon;
  final String label;

  /// Draws the pill in a tone instead of the neutral muted treatment.
  final Color? tone;

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    final t = tone;
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
      decoration: BoxDecoration(
        color: t == null ? c.muted : t.withValues(alpha: 0.12),
        borderRadius: R.rSm,
        border: Border.all(
          color: t == null ? c.border : t.withValues(alpha: 0.3),
        ),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(icon, size: 15, color: t ?? c.mutedForeground),
          const SizedBox(width: 6),
          Text(
            label,
            style: AppTypography.body(
              size: 12.5,
              weight: FontWeight.w600,
              color: t ?? c.mutedForeground,
            ),
          ),
        ],
      ),
    );
  }
}

/// A circular monogram — the owner, and every manager in a list.
class Monogram extends StatelessWidget {
  const Monogram({super.key, required this.initials, this.radius = 22});

  final String initials;
  final double radius;

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    return CircleAvatar(
      radius: radius,
      backgroundColor: c.primary,
      child: Text(
        initials,
        style: AppTypography.body(
          size: radius * 0.62,
          weight: FontWeight.w700,
          color: c.primaryForeground,
        ),
      ),
    );
  }
}

/// A labelled value line inside a card — "Billing cycle · Annual".
class FactRow extends StatelessWidget {
  const FactRow({
    super.key,
    required this.label,
    required this.value,
    this.valueColor,
  });

  final String label;
  final String value;
  final Color? valueColor;

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    return Row(
      children: [
        Text(
          label,
          style: AppTypography.body(size: 13, color: c.mutedForeground),
        ),
        const Spacer(),
        Flexible(
          child: Text(
            value,
            textAlign: TextAlign.right,
            style: AppTypography.numeric(
              size: 13,
              weight: FontWeight.w600,
              color: valueColor ?? c.foreground,
            ),
          ),
        ),
      ],
    );
  }
}

/// A labelled progress bar — hotel allowance, and a property's setup progress.
class MeterBar extends StatelessWidget {
  const MeterBar({
    super.key,
    required this.value,
    required this.tone,
    this.height = 8,
  });

  /// 0..1. Values outside the range are clamped rather than throwing.
  final double value;
  final Color tone;
  final double height;

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    return ClipRRect(
      borderRadius: BorderRadius.circular(R.sm),
      child: LinearProgressIndicator(
        value: value.clamp(0, 1),
        minHeight: height,
        backgroundColor: c.muted,
        color: tone,
      ),
    );
  }
}
