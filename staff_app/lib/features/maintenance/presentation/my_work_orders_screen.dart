import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/routing/routes.dart';
import '../../../core/theme/app_spacing.dart';
import '../../../core/widgets/primitives.dart';
import '../../../core/widgets/states.dart';
import '../application/work_orders_controllers.dart';
import 'work_order_widgets.dart';

/// The technician's home feed: the jobs assigned to them, still open.
class MyWorkOrdersScreen extends ConsumerWidget {
  const MyWorkOrdersScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final orders = ref.watch(myWorkOrdersProvider);

    return PageBody(
      onRefresh: () => ref.read(myWorkOrdersProvider.notifier).refresh(),
      children: [
        const SectionHeader(title: 'My work', icon: Icons.handyman_outlined),
        orders.when(
          loading: () => const ListSkeleton(rows: 3, height: 120),
          error: (e, _) => ErrorState(
            error: e,
            onRetry: () => ref.read(myWorkOrdersProvider.notifier).refresh(),
          ),
          data: (items) => items.isEmpty
              ? const EmptyState(
                  title: 'No jobs assigned',
                  hint: 'Accept an open work order and it appears here.',
                  icon: Icons.check_circle_outline,
                )
              : Column(
                  children: [
                    for (final wo in items)
                      Padding(
                        padding: const EdgeInsets.only(bottom: Sp.md),
                        child: WorkOrderCard(
                          order: wo,
                          onTap: () => context.go(Routes.workOrder(wo.id)),
                        ),
                      ),
                  ],
                ),
        ),
      ],
    );
  }
}
