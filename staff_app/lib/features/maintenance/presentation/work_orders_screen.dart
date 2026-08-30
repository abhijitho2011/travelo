import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/routing/routes.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/theme/app_spacing.dart';
import '../../../core/widgets/primitives.dart';
import '../../../core/widgets/states.dart';
import '../application/work_orders_controllers.dart';
import '../data/work_order_models.dart';
import 'work_order_widgets.dart';

/// The maintenance queue, filterable by status. Used as the technician's list
/// view and the supervisor's maintenance board.
class WorkOrdersScreen extends ConsumerStatefulWidget {
  const WorkOrdersScreen({super.key});

  @override
  ConsumerState<WorkOrdersScreen> createState() => _WorkOrdersScreenState();
}

class _WorkOrdersScreenState extends ConsumerState<WorkOrdersScreen> {
  WoStatus? _filter;

  @override
  Widget build(BuildContext context) {
    final orders = ref.watch(workOrderQueueProvider(_filter));

    return PageBody(
      onRefresh: () =>
          ref.read(workOrderQueueProvider(_filter).notifier).refresh(),
      children: [
        const SectionHeader(title: 'Work orders', icon: Icons.build_outlined),
        SingleChildScrollView(
          scrollDirection: Axis.horizontal,
          child: Row(
            children: [
              _Chip(
                label: 'All',
                selected: _filter == null,
                onTap: () => setState(() => _filter = null),
              ),
              for (final s in WoStatus.values)
                _Chip(
                  label: s.label,
                  selected: _filter == s,
                  onTap: () => setState(() => _filter = s),
                ),
            ],
          ),
        ),
        gapMd,
        orders.when(
          loading: () => const ListSkeleton(rows: 4, height: 110),
          error: (e, _) => ErrorState(
            error: e,
            onRetry: () =>
                ref.read(workOrderQueueProvider(_filter).notifier).refresh(),
          ),
          data: (items) => items.isEmpty
              ? const EmptyState(
                  title: 'No work orders',
                  hint: 'Nothing matches this filter right now.',
                  icon: Icons.build_circle_outlined,
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

class _Chip extends StatelessWidget {
  const _Chip({
    required this.label,
    required this.selected,
    required this.onTap,
  });

  final String label;
  final bool selected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    return Padding(
      padding: const EdgeInsets.only(right: Sp.sm),
      child: ChoiceChip(
        label: Text(label),
        selected: selected,
        onSelected: (_) => onTap(),
        selectedColor: c.primary.withValues(alpha: 0.16),
      ),
    );
  }
}
