import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/theme/app_colors.dart';
import '../../../core/theme/app_spacing.dart';
import '../../../core/theme/app_typography.dart';
import '../../../core/utils/formatting.dart';
import '../../../core/widgets/primitives.dart';
import '../../../core/widgets/states.dart';
import '../../../core/widgets/status_badge.dart';
import '../application/inventory_controllers.dart';

/// The stock movement ledger — every in, out, adjust and wastage, newest first.
class StockMovementsScreen extends ConsumerWidget {
  const StockMovementsScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final movements = ref.watch(movementsProvider(null));
    return PageBody(
      onRefresh: () async => ref.invalidate(movementsProvider(null)),
      children: [
        const PageHeader(title: 'Stock movements', subtitle: 'The store ledger.'),
        gapSection,
        movements.when(
          loading: () => const ListSkeleton(rows: 6),
          error: (e, _) => ErrorState(error: e, onRetry: () => ref.invalidate(movementsProvider(null))),
          data: (list) => list.isEmpty
              ? const EmptyState(
                  title: 'No movements yet',
                  hint: 'Stock in/out will show up here as it happens.',
                  icon: Icons.swap_vert,
                )
              : Column(
                  children: [
                    for (final m in list)
                      Padding(
                        padding: const EdgeInsets.only(bottom: Sp.sm),
                        child: SoftCard(
                          padding: const EdgeInsets.all(12),
                          child: Row(
                            children: [
                              Expanded(
                                child: Column(
                                  crossAxisAlignment: CrossAxisAlignment.start,
                                  children: [
                                    StatusBadge(tone: m.type.tone, label: m.type.label, dense: true),
                                    const SizedBox(height: 4),
                                    Text(
                                      [m.reason, Fmt.ago(m.createdAt)]
                                          .where((s) => s != null && s != Fmt.dash)
                                          .join(' · '),
                                      style: AppTypography.body(
                                        size: 12,
                                        color: context.colors.mutedForeground,
                                      ),
                                    ),
                                  ],
                                ),
                              ),
                              Column(
                                crossAxisAlignment: CrossAxisAlignment.end,
                                children: [
                                  Text(
                                    '${m.qtyDelta >= 0 ? '+' : ''}${m.qtyDelta}',
                                    style: AppTypography.numeric(
                                      size: 14,
                                      weight: FontWeight.w700,
                                      color: m.qtyDelta >= 0
                                          ? context.colors.healthy
                                          : context.colors.critical,
                                    ),
                                  ),
                                  Text(
                                    'bal ${m.balanceAfter}',
                                    style: AppTypography.body(
                                      size: 11.5,
                                      color: context.colors.mutedForeground,
                                    ),
                                  ),
                                ],
                              ),
                            ],
                          ),
                        ),
                      ),
                  ],
                ),
        ),
      ],
    );
  }
}
