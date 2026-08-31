import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/permissions/permission_keys.dart';
import '../../../core/providers.dart';
import '../../../core/routing/routes.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/theme/app_spacing.dart';
import '../../../core/theme/app_typography.dart';
import '../../../core/widgets/primitives.dart';
import '../../../core/widgets/states.dart';
import '../../../core/widgets/status_badge.dart';
import '../application/restaurant_controllers.dart';
import '../data/restaurant_models.dart';
import 'settle_sheet.dart';

/// The cashier's till: today's numbers, then the orders waiting to be closed.
/// Billed orders carry a Settle button; open orders are shown so the cashier
/// can see what is still being run.
class PosScreen extends ConsumerWidget {
  const PosScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final summary = ref.watch(summaryProvider);
    final orders = ref.watch(ordersProvider);
    final session = ref.watch(sessionProvider);

    return PageBody(
      onRefresh: () async {
        ref.invalidate(summaryProvider);
        ref.invalidate(ordersProvider);
      },
      children: [
        PageHeader(
          eyebrow: [
            'Restaurant',
            session?.hotel?.name,
          ].where((s) => s != null && s.isNotEmpty).join(' · '),
          title: 'Point of sale',
          subtitle: 'Close bills and keep the floor turning.',
        ),
        gapSection,

        summary.when(
          loading: () => const KpiSkeleton(count: 3),
          error: (_, _) => const SizedBox.shrink(),
          data: (s) => s == null
              ? const SizedBox.shrink()
              : KpiGrid(
                  children: [
                    KpiCard(label: "Today's revenue", value: s.revenueLabel),
                    KpiCard(label: 'Bills settled', value: '${s.paidOrders}'),
                    KpiCard(
                      label: 'Open orders',
                      value: '${s.openOrders}',
                      tone: s.openOrders > 0 ? context.colors.warning : null,
                    ),
                  ],
                ),
        ),
        gapSection,

        SectionHeader(title: 'Orders to close'),
        orders.when(
          loading: () => const ListSkeleton(rows: 3, height: 88),
          error: (e, _) => ErrorState(
            error: e,
            onRetry: () => ref.invalidate(ordersProvider),
          ),
          data: (list) {
            final live =
                list.where((o) => o.status.isOpen || o.status.isBilled).toList()
                  ..sort((a, b) {
                    // Billed (ready to settle) first, then open.
                    if (a.status == b.status) return 0;
                    return a.status.isBilled ? -1 : 1;
                  });
            if (live.isEmpty) {
              return const EmptyState(
                title: 'Nothing to settle',
                hint: 'Bills a waiter runs show up here, ready to close.',
                icon: Icons.point_of_sale_outlined,
              );
            }
            return Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                for (final o in live)
                  Padding(
                    padding: const EdgeInsets.only(bottom: Sp.sm),
                    child: _OrderRow(order: o),
                  ),
              ],
            );
          },
        ),
      ],
    );
  }
}

class _OrderRow extends ConsumerWidget {
  const _OrderRow({required this.order});

  final RestaurantOrder order;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final c = context.colors;
    final canSettle =
        order.status.isBilled && ref.watch(canProvider(P.billSettle));
    final amount = order.status.isBilled
        ? order.totalLabel
        : order.runningSubtotalLabel;

    return SoftCard(
      onTap: ref.watch(canProvider(P.orderRead))
          ? () => context.go(Routes.restaurantOrder(order.id))
          : null,
      child: Row(
        children: [
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    Text(
                      order.where,
                      style: AppTypography.body(
                        size: 14,
                        weight: FontWeight.w700,
                        color: c.foreground,
                      ),
                    ),
                    const SizedBox(width: Sp.sm),
                    StatusBadge(
                      tone: order.status.tone,
                      label: order.status.label,
                      dense: true,
                    ),
                  ],
                ),
                const SizedBox(height: 2),
                Text(
                  '${order.orderNumber} · ${order.activeItemCount} items · $amount',
                  style: AppTypography.body(size: 12, color: c.mutedForeground),
                ),
              ],
            ),
          ),
          if (canSettle)
            FilledButton(
              onPressed: () => SettleSheet.show(context, order),
              child: const Text('Settle'),
            ),
        ],
      ),
    );
  }
}
