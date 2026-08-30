import 'package:flutter/material.dart';

import '../../../core/theme/app_colors.dart';
import '../../../core/theme/app_spacing.dart';
import '../../../core/theme/app_typography.dart';

/// A veg / non-veg dot — the square-in-a-square Indian menus use. Green for veg,
/// red for non-veg, never colour alone: the shape and the tooltip both say it.
class VegBadge extends StatelessWidget {
  const VegBadge({super.key, required this.veg, this.size = 14});

  final bool veg;
  final double size;

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    final colour = veg ? c.healthy : c.critical;
    return Tooltip(
      message: veg ? 'Vegetarian' : 'Non-vegetarian',
      child: Container(
        width: size,
        height: size,
        decoration: BoxDecoration(
          border: Border.all(color: colour, width: 1.5),
          borderRadius: BorderRadius.circular(3),
        ),
        child: Center(
          child: Container(
            width: size * 0.45,
            height: size * 0.45,
            decoration: BoxDecoration(color: colour, shape: BoxShape.circle),
          ),
        ),
      ),
    );
  }
}

/// The inline error shown under a form or a sheet action when a write is
/// refused — mirrors the rooms feature's FormErrorNote so the whole app reads
/// the same way.
class RestaurantErrorNote extends StatelessWidget {
  const RestaurantErrorNote({super.key, required this.message});

  final String message;

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    return Container(
      padding: const EdgeInsets.all(Sp.md),
      decoration: BoxDecoration(
        color: c.destructive.withValues(alpha: 0.08),
        borderRadius: R.rMd,
        border: Border.all(color: c.destructive.withValues(alpha: 0.35)),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(Icons.error_outline, size: 16, color: c.destructive),
          const SizedBox(width: 8),
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

/// A key/value money row, used in bill breakdowns. [strong] renders the grand
/// total heavier.
class MoneyRow extends StatelessWidget {
  const MoneyRow({
    super.key,
    required this.label,
    required this.value,
    this.strong = false,
  });

  final String label;
  final String value;
  final bool strong;

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 3),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          Text(
            label,
            style: AppTypography.body(
              size: strong ? 14 : 12.5,
              weight: strong ? FontWeight.w700 : FontWeight.w400,
              color: strong ? c.foreground : c.mutedForeground,
            ),
          ),
          Text(
            value,
            style: strong
                ? AppTypography.kpi(size: 18, color: c.foreground)
                : AppTypography.numeric(
                    size: 13,
                    weight: FontWeight.w600,
                    color: c.foreground,
                  ),
          ),
        ],
      ),
    );
  }
}
