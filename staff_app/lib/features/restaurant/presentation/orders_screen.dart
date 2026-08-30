import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/routing/routes.dart';
import '../../../core/theme/app_spacing.dart';
import '../../../core/widgets/cards.dart';
import '../../../core/widgets/primitives.dart';
import '../../../core/widgets/states.dart';
import '../../../core/widgets/status_badge.dart';
import '../application/restaurant_controllers.dart';
import '../data/restaurant_models.dart';

/// Every order in the outlet — a manager's flat list across all tables, with a
/// status filter. Rows open the running order/bill detail.
class RestaurantOrdersScreen extends ConsumerWidget {
  const RestaurantOrdersScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final filter = ref.watch(ordersFilterProvider);
    final async = ref.watch(ordersProvider);

    return PageBody(
      onRefresh: () async => ref.invalidate(ordersProvider),
      children: [
        const PageHeader(
          eyebrow: 'Restaurant',
          title: 'Orders',
          subtitle: 'Every order in the outlet, across all tables.',
        ),
        gapSection,
        Wrap(
          spacing: Sp.sm,
          children: [
            ChoiceChip(
              label: const Text('All'),
              selected: filter.status == null,
              onSelected: (_) => ref.read(ordersFilterProvider.notifier).state =
                  filter.copyWith(clearStatus: true),
            ),
            for (final s in OrderStatus.values)
              ChoiceChip(
                label: Text(s.label),
                selected: filter.status == s,
                onSelected: (_) => ref.read(ordersFilterProvider.notifier).state =
                    filter.copyWith(status: s),
              ),
          ],
        ),
        gapSection,
        async.when(
          loading: () => const ListSkeleton(rows: 4, height: 64),
          error: (e, _) => ErrorState(error: e, onRetry: () => ref.invalidate(ordersProvider)),
          data: (orders) => orders.isEmpty
              ? const EmptyState(
                  title: 'No orders',
                  hint: 'Orders opened at the tables appear here.',
                  icon: Icons.receipt_long_outlined,
                )
              : Panel(
                  title: 'Orders',
                  description: '${orders.length} shown',
                  padBody: false,
                  child: Column(
                    children: [
                      for (var i = 0; i < orders.length; i++) ...[
                        if (i > 0) const RowDivider(),
                        DataRow2(
                          leading: const Icon(Icons.receipt_outlined, size: 18),
                          title: orders[i].orderNumber,
                          subtitle: [
                            if (orders[i].tableName != null) orders[i].tableName!,
                            '${orders[i].guestCount} guests',
                          ].join(' · '),
                          badge: StatusBadge(
                            tone: orders[i].status.tone,
                            label: orders[i].status.label,
                            dense: true,
                          ),
                          trailing: Text(formatPaise(orders[i].totalPaise)),
                          onTap: () => context.go(Routes.restaurantOrder(orders[i].id)),
                        ),
                      ],
                    ],
                  ),
                ),
        ),
      ],
    );
  }
}
