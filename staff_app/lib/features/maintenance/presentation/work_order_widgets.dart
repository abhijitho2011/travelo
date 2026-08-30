import 'package:flutter/material.dart';

import '../../../core/theme/app_colors.dart';
import '../../../core/theme/app_spacing.dart';
import '../../../core/theme/app_typography.dart';
import '../../../core/widgets/primitives.dart';
import '../../../core/widgets/status_badge.dart';
import '../data/work_order_models.dart';

/// A work-order summary card, shared by the queue and the technician feed. The
/// left rule is coloured by priority so a CRITICAL job reads at a glance.
class WorkOrderCard extends StatelessWidget {
  const WorkOrderCard({super.key, required this.order, this.onTap});

  final WorkOrder order;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    return SoftCard(
      onTap: onTap,
      accent: order.priority == WoPriority.critical
          ? c.critical
          : (order.priority == WoPriority.high ? c.warning : null),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      order.title,
                      style: AppTypography.body(
                        size: 15,
                        weight: FontWeight.w700,
                        color: c.foreground,
                      ),
                    ),
                    const SizedBox(height: 2),
                    Text(
                      [
                        order.number,
                        if (order.roomNumber != null) 'Room ${order.roomNumber}',
                        if (order.takesRoomOutOfService) 'off-board',
                      ].join(' · '),
                      style: AppTypography.numeric(
                        size: 12,
                        color: c.mutedForeground,
                      ),
                    ),
                  ],
                ),
              ),
              StatusBadge(tone: order.status.tone, label: order.status.label),
            ],
          ),
          const SizedBox(height: Sp.sm),
          Row(
            children: [
              StatusBadge(
                tone: order.priority.tone,
                label: order.priority.label,
                dense: true,
              ),
              const Spacer(),
              if (order.assigneeName != null)
                Text(
                  order.assigneeName!,
                  style: AppTypography.body(size: 12, color: c.mutedForeground),
                ),
            ],
          ),
        ],
      ),
    );
  }
}
