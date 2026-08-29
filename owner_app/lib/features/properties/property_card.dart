import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../../core/models/owner_models.dart';
import '../../core/theme/app_colors.dart';
import '../../core/theme/app_spacing.dart';
import '../../core/theme/app_typography.dart';
import '../../core/widgets/cards.dart';
import '../../core/widgets/primitives.dart';
import '../../core/widgets/status_badge.dart';

/// One hotel in a list — shared by the dashboard and the Hotels screen so both
/// read the same and neither drifts.
class PropertyCard extends StatelessWidget {
  const PropertyCard({super.key, required this.property});

  final Property property;

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    final p = property;
    final place = [p.city, p.state].where((s) => s.isNotEmpty).join(', ');
    return SoftCard(
      onTap: () => context.push('/properties/${p.id}', extra: p),
      child: Row(
        children: [
          Container(
            width: 48,
            height: 48,
            decoration: BoxDecoration(color: c.accent, borderRadius: R.rMd),
            alignment: Alignment.center,
            child: Icon(
              Icons.location_city_rounded,
              color: c.accentForeground,
              size: 22,
            ),
          ),
          const SizedBox(width: Sp.md),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    Expanded(
                      child: Text(
                        p.name,
                        overflow: TextOverflow.ellipsis,
                        style: AppTypography.body(
                          size: 14.5,
                          weight: FontWeight.w700,
                          color: c.foreground,
                        ),
                      ),
                    ),
                    const SizedBox(width: Sp.sm),
                    StatusBadge(
                      tone: propertyStatusTone(p.status),
                      label: p.status.isEmpty ? 'DRAFT' : p.status,
                      dense: true,
                    ),
                  ],
                ),
                const SizedBox(height: 2),
                Text(
                  '${place.isEmpty ? '—' : place} · ${p.roomCount} '
                  '${p.roomCount == 1 ? 'room' : 'rooms'}',
                  overflow: TextOverflow.ellipsis,
                  style: AppTypography.body(
                    size: 12.5,
                    color: c.mutedForeground,
                  ),
                ),
                const SizedBox(height: Sp.sm),
                _CompletenessBar(pct: p.completeness),
              ],
            ),
          ),
          const SizedBox(width: Sp.sm),
          Icon(Icons.chevron_right, size: 18, color: c.mutedForeground),
        ],
      ),
    );
  }
}

/// ACTIVE hotels are live; anything else is still being set up.
StatusTone propertyStatusTone(String status) =>
    status.toUpperCase() == 'ACTIVE' ? StatusTone.healthy : StatusTone.neutral;

class _CompletenessBar extends StatelessWidget {
  const _CompletenessBar({required this.pct});
  final int pct;

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    final done = pct >= 100;
    final tone = done ? c.healthy : c.warning;
    return Row(
      children: [
        Expanded(
          child: MeterBar(value: pct / 100, tone: tone, height: 6),
        ),
        const SizedBox(width: Sp.sm),
        Text(
          done ? 'Ready' : '$pct% ready',
          style: AppTypography.numeric(
            size: 11.5,
            weight: FontWeight.w700,
            color: tone,
          ),
        ),
      ],
    );
  }
}
