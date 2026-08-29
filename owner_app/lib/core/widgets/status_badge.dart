import 'package:flutter/material.dart';

import '../theme/app_colors.dart';
import '../theme/app_spacing.dart';
import '../theme/app_typography.dart';

/// The operational + semantic tones from HF's status palette.
///
/// Every tone carries an icon as well as a colour: status is never conveyed by
/// colour alone, so the badge stays readable for colour-blind users and in
/// monochrome print.
enum StatusTone {
  available,
  occupied,
  dirty,
  cleaning,
  inspected,
  maintenance,
  outOfOrder,
  healthy,
  warning,
  critical,
  neutral,
  info,
}

extension StatusToneX on StatusTone {
  Color color(AppColors c) => switch (this) {
    StatusTone.available => c.stAvailable,
    StatusTone.occupied => c.stOccupied,
    StatusTone.dirty => c.stDirty,
    StatusTone.cleaning => c.stCleaning,
    StatusTone.inspected => c.stInspected,
    StatusTone.maintenance => c.stMaintenance,
    StatusTone.outOfOrder => c.stOoo,
    StatusTone.healthy => c.healthy,
    StatusTone.warning => c.warning,
    StatusTone.critical => c.critical,
    StatusTone.neutral => c.mutedForeground,
    StatusTone.info => c.stOccupied,
  };

  IconData get icon => switch (this) {
    StatusTone.available => Icons.meeting_room_outlined,
    StatusTone.occupied => Icons.person_outline,
    StatusTone.dirty => Icons.wash_outlined,
    StatusTone.cleaning => Icons.auto_awesome_outlined,
    StatusTone.inspected => Icons.verified_outlined,
    StatusTone.maintenance => Icons.build_outlined,
    StatusTone.outOfOrder => Icons.do_not_disturb_on_outlined,
    StatusTone.healthy => Icons.check_circle_outline,
    StatusTone.warning => Icons.error_outline,
    StatusTone.critical => Icons.warning_amber_outlined,
    StatusTone.neutral => Icons.remove_circle_outline,
    StatusTone.info => Icons.info_outline,
  };
}

/// HF's `<StatusBadge>`: a 12%-tinted pill with a 35% border, a dot/icon and a
/// label.
class StatusBadge extends StatelessWidget {
  const StatusBadge({
    super.key,
    required this.tone,
    required this.label,
    this.icon,
    this.dense = false,
  });

  final StatusTone tone;
  final String label;

  /// Overrides the tone's default glyph when a more specific one reads better.
  final IconData? icon;
  final bool dense;

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    final tint = tone.color(c);
    return Container(
      padding: EdgeInsets.symmetric(
        horizontal: dense ? 6 : 8,
        vertical: dense ? 2 : 3,
      ),
      decoration: BoxDecoration(
        color: tint.withValues(alpha: 0.12),
        borderRadius: R.rSm,
        border: Border.all(color: tint.withValues(alpha: 0.35)),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(icon ?? tone.icon, size: dense ? 11 : 13, color: tint),
          const SizedBox(width: 5),
          Flexible(
            child: Text(
              label,
              overflow: TextOverflow.ellipsis,
              style: AppTypography.body(
                size: dense ? 11 : 12,
                weight: FontWeight.w600,
                color: tint,
              ),
            ),
          ),
        ],
      ),
    );
  }
}

/// HF's `<StatusDot>` — used where a full badge would be too heavy, always
/// paired with adjacent text.
class StatusDot extends StatelessWidget {
  const StatusDot({super.key, required this.tone, this.size = 8});

  final StatusTone tone;
  final double size;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: size,
      height: size,
      decoration: BoxDecoration(
        color: tone.color(context.colors),
        shape: BoxShape.circle,
      ),
    );
  }
}
