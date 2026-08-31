import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/permissions/permission_gate.dart';
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

/// The restaurant manager's dashboard: today's numbers, the floor at a glance,
/// the payment-method split, and the way in to menu and table management.
class RestaurantScreen extends ConsumerWidget {
  const RestaurantScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final summary = ref.watch(summaryProvider);
    final tables = ref.watch(tablesProvider);
    final session = ref.watch(sessionProvider);

    return PageBody(
      onRefresh: () async {
        ref.invalidate(summaryProvider);
        ref.invalidate(tablesProvider);
      },
      children: [
        PageHeader(
          eyebrow: [
            'Restaurant',
            session?.hotel?.name,
          ].where((s) => s != null && s.isNotEmpty).join(' · '),
          title: 'Restaurant',
          subtitle: 'The outlet today — covers, revenue and the floor.',
          actions: [
            PermissionGate(
              permission: P.menuManage,
              child: OutlinedButton.icon(
                onPressed: () => context.go(Routes.restaurantMenu),
                icon: const Icon(Icons.menu_book_outlined, size: 16),
                label: const Text('Menu'),
              ),
            ),
            PermissionGate(
              permission: P.tableManage,
              child: OutlinedButton.icon(
                onPressed: () => context.go(Routes.restaurantTables),
                icon: const Icon(Icons.table_bar_outlined, size: 16),
                label: const Text('Tables'),
              ),
            ),
          ],
        ),
        gapSection,

        summary.when(
          loading: () => const KpiSkeleton(count: 4),
          error: (e, _) => ErrorState(
            error: e,
            onRetry: () => ref.invalidate(summaryProvider),
          ),
          data: (s) => s == null
              ? const EmptyState(
                  title: 'The outlet is not set up yet',
                  hint: 'Add tables and a menu to start taking orders.',
                  icon: Icons.storefront_outlined,
                )
              : _Dashboard(summary: s),
        ),
        gapSection,

        SectionHeader(title: 'The floor'),
        tables.when(
          loading: () => const ListSkeleton(rows: 1, height: 90),
          error: (_, _) => const SizedBox.shrink(),
          data: (list) => list.isEmpty
              ? const EmptyState(
                  title: 'No tables yet',
                  hint: 'Set up the floor from Tables.',
                  icon: Icons.table_restaurant_outlined,
                )
              : _FloorGrid(tables: list),
        ),
      ],
    );
  }
}

class _Dashboard extends StatelessWidget {
  const _Dashboard({required this.summary});

  final RestaurantSummary summary;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        KpiGrid(
          children: [
            KpiCard(label: "Today's revenue", value: summary.revenueLabel),
            KpiCard(label: 'Bills settled', value: '${summary.paidOrders}'),
            KpiCard(label: 'Open orders', value: '${summary.openOrders}'),
            KpiCard(label: 'Tables', value: '${summary.totalTables}'),
          ],
        ),
        if (summary.methodBreakdown.isNotEmpty) ...[
          gapMd,
          Panel(
            title: 'Revenue by method',
            child: Column(
              children: [
                for (final entry in summary.methodBreakdown.entries)
                  Padding(
                    padding: const EdgeInsets.symmetric(vertical: 4),
                    child: Row(
                      mainAxisAlignment: MainAxisAlignment.spaceBetween,
                      children: [
                        Text(
                          entry.key.label,
                          style: AppTypography.body(
                            size: 13,
                            color: context.colors.foreground,
                          ),
                        ),
                        Text(
                          formatPaise(entry.value),
                          style: AppTypography.numeric(
                            size: 13,
                            weight: FontWeight.w700,
                            color: context.colors.foreground,
                          ),
                        ),
                      ],
                    ),
                  ),
              ],
            ),
          ),
        ],
      ],
    );
  }
}

class _FloorGrid extends StatelessWidget {
  const _FloorGrid({required this.tables});

  final List<RestaurantTable> tables;

  @override
  Widget build(BuildContext context) {
    return LayoutBuilder(
      builder: (context, constraints) {
        const spacing = Sp.sm;
        final columns = (constraints.maxWidth / 130).floor().clamp(2, 8);
        final width =
            (constraints.maxWidth - spacing * (columns - 1)) / columns;
        return Wrap(
          spacing: spacing,
          runSpacing: spacing,
          children: [
            for (final t in tables)
              SizedBox(
                width: width,
                child: SoftCard(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        t.name,
                        style: AppTypography.body(
                          size: 14,
                          weight: FontWeight.w700,
                          color: context.colors.foreground,
                        ),
                      ),
                      const SizedBox(height: 4),
                      StatusBadge(
                        tone: t.status.tone,
                        label: t.status.label,
                        dense: true,
                      ),
                    ],
                  ),
                ),
              ),
          ],
        );
      },
    );
  }
}
