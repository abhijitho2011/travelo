import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/permissions/permission_gate.dart';
import '../../../core/permissions/permission_keys.dart';
import '../../../core/providers.dart';
import '../../../core/routing/routes.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/theme/app_spacing.dart';
import '../../../core/utils/formatting.dart';
import '../../../core/widgets/cards.dart';
import '../../../core/widgets/primitives.dart';
import '../../../core/widgets/states.dart';
import '../../../core/widgets/status_badge.dart';
import '../application/management_controllers.dart';
import '../data/management_models.dart';

/// The GM / AGM home. Modelled on HF's `gm.tsx`: KPI grid, operational alert
/// cards, then the approval queue.
///
/// The AGM sees the identical layout — what differs is which KPI tiles and
/// actions their permission set unlocks (no revenue export, no payroll).
class ManagementDashboardScreen extends ConsumerWidget {
  const ManagementDashboardScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final c = context.colors;
    final session = ref.watch(sessionProvider);
    final overview = ref.watch(managementOverviewProvider);
    final approvals = ref.watch(approvalsProvider);

    return PageBody(
      onRefresh: () async {
        ref.invalidate(managementOverviewProvider);
        await ref.read(approvalsProvider.notifier).refresh();
      },
      children: [
        PageHeader(
          eyebrow: [
            session?.hotel?.name,
            session?.hotel?.location,
          ].where((s) => s != null && s.isNotEmpty).join(' · '),
          title: 'Hotel operations',
          subtitle: Fmt.fullDate(DateTime.now()),
          actions: [
            PermissionGate(
              permission: P.staffRead,
              child: OutlinedButton.icon(
                onPressed: () => context.go(Routes.team),
                icon: const Icon(Icons.groups_outlined, size: 16),
                label: const Text('Team'),
              ),
            ),
            PermissionGate(
              permission: P.approvalRead,
              child: FilledButton.icon(
                onPressed: () => context.go(Routes.approvals),
                icon: const Icon(Icons.fact_check_outlined, size: 16),
                label: const Text('Approvals'),
              ),
            ),
          ],
        ),
        gapSection,

        overview.when(
          loading: () => const KpiSkeleton(count: 6),
          error: (e, _) => ErrorState(
            error: e,
            onRetry: () => ref.invalidate(managementOverviewProvider),
          ),
          data: (data) => _Overview(data: data),
        ),

        gapSection,
        SectionHeader(
          title: 'Approvals',
          icon: Icons.fact_check_outlined,
          trailing: PermissionGate(
            permission: P.approvalRead,
            child: TextButton(
              onPressed: () => context.go(Routes.approvals),
              child: const Text('See all'),
            ),
          ),
        ),
        approvals.when(
          loading: () => const ListSkeleton(rows: 2),
          error: (e, _) => ErrorState(
            error: e,
            onRetry: () => ref.read(approvalsProvider.notifier).refresh(),
          ),
          data: (items) => items.isEmpty
              ? const EmptyState(
                  title: 'Nothing waiting on you',
                  hint: 'New requests from your team will appear here.',
                  icon: Icons.task_alt_outlined,
                )
              : Column(
                  children: [
                    for (final item in items.take(3))
                      Padding(
                        padding: const EdgeInsets.only(bottom: Sp.md),
                        child: ApprovalCard(
                          kindLabel: item.kind.label,
                          title: item.title,
                          subtitle: item.subtitle,
                          meta: item.requestedAt == null
                              ? null
                              : Fmt.ago(item.requestedAt),
                          amountLabel: item.amount == null
                              ? null
                              : Fmt.money(item.amount, compact: true),
                          icon: _iconFor(item.kind),
                          actions: PermissionGate(
                            permission: P.approvalAct,
                            child: OutlinedButton(
                              onPressed: () => context.go(Routes.approvals),
                              child: const Text('Review'),
                            ),
                          ),
                        ),
                      ),
                    if (items.length > 3)
                      Align(
                        alignment: Alignment.centerLeft,
                        child: Text(
                          '+ ${items.length - 3} more waiting',
                          style: Theme.of(context).textTheme.bodySmall
                              ?.copyWith(color: c.mutedForeground),
                        ),
                      ),
                  ],
                ),
        ),
      ],
    );
  }

  static IconData _iconFor(ApprovalKind kind) => switch (kind) {
    ApprovalKind.staff => Icons.person_add_alt_outlined,
    ApprovalKind.discount => Icons.percent_outlined,
    ApprovalKind.refund => Icons.undo_outlined,
    ApprovalKind.purchase => Icons.shopping_cart_outlined,
    ApprovalKind.leave => Icons.event_busy_outlined,
    ApprovalKind.other => Icons.fact_check_outlined,
  };
}

class _Overview extends ConsumerWidget {
  const _Overview({required this.data});

  final ManagementOverview data;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    if (data.isEmpty) {
      return const EmptyState(
        title: 'Live figures are not available yet',
        hint:
            'The operations feed for this property has not been switched on. '
            'Nothing is broken — there is simply nothing to report yet.',
        icon: Icons.insights_outlined,
      );
    }

    final s = data.snapshot;
    final canSeeRevenue = ref.watch(canProvider(P.revenueRead));

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        if (s != null)
          KpiGrid(
            children: [
              KpiCard(
                label: 'Occupancy',
                value: Fmt.percent(s.occupancyPct),
                delta: s.occupancyDelta,
                hint: s.availableRooms == null
                    ? null
                    : '${s.availableRooms} available',
              ),
              KpiCard(label: 'Arrivals', value: Fmt.count(s.arrivals)),
              KpiCard(label: 'Departures', value: Fmt.count(s.departures)),
              KpiCard(label: 'In-house', value: Fmt.count(s.inHouse)),
              // Revenue is permission-gated at the tile level: an AGM without
              // revenue.read simply never sees these two.
              if (canSeeRevenue)
                KpiCard(
                  label: 'Revenue today',
                  value: Fmt.money(s.revenueToday, compact: true),
                  delta: s.revenueDelta,
                ),
              if (canSeeRevenue)
                KpiCard(label: 'ADR', value: Fmt.money(s.adr, compact: true)),
            ],
          ),
        if (data.alerts.isNotEmpty) ...[
          gapSection,
          const SectionHeader(
            title: 'Needs attention',
            icon: Icons.notifications_active_outlined,
          ),
          for (final alert in data.alerts)
            Padding(
              padding: const EdgeInsets.only(bottom: Sp.md),
              child: AlertCard(
                title: alert.title,
                count: alert.count,
                tone: alert.severity,
                detail: alert.detail,
              ),
            ),
        ],
      ],
    );
  }
}

/// Re-exported so other management screens can share the tone mapping.
StatusTone toneForCount(int count) =>
    count == 0 ? StatusTone.healthy : StatusTone.warning;
