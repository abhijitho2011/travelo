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
import '../../rooms/data/room_models.dart' show formatPaise;
import '../../../core/utils/formatting.dart';
import '../../../core/widgets/cards.dart';
import '../../../core/widgets/primitives.dart';
import '../../../core/widgets/states.dart';
import '../../../core/widgets/status_badge.dart';
import '../../reception/application/reception_controllers.dart';
import '../../reception/data/reception_models.dart';
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
    final live = ref.watch(gmDashboardProvider);
    final approvals = ref.watch(approvalsProvider);

    return PageBody(
      onRefresh: () async {
        ref.invalidate(managementOverviewProvider);
        ref.invalidate(gmDashboardProvider);
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

        // The real figures, straight off `GET /dashboard`. The legacy overview
        // feed below still carries the alert cards, so the two coexist rather
        // than one replacing the other wholesale.
        live.when(
          loading: () => const KpiSkeleton(count: 6),
          error: (e, _) => ErrorState(
            error: e,
            onRetry: () => ref.invalidate(gmDashboardProvider),
          ),
          data: (data) => data == null
              ? const SizedBox.shrink()
              : Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    _LiveFigures(data: data),
                    gapMd,
                    _AvailableTonight(items: data.availableByType),
                    gapMd,
                    _RecentBookings(items: data.recentBookings),
                  ],
                ),
        ),

        overview.when(
          loading: () => const SizedBox.shrink(),
          error: (e, _) => ErrorState(
            error: e,
            onRetry: () => ref.invalidate(managementOverviewProvider),
          ),
          data: (data) =>
              _Overview(data: data, hasLiveFigures: live.value != null),
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
    ApprovalKind.expense => Icons.receipt_long_outlined,
    ApprovalKind.leave => Icons.event_busy_outlined,
    ApprovalKind.other => Icons.fact_check_outlined,
  };
}

/// The GM tiles that come from the booking engine itself. Every number here is
/// from one request, so occupancy and the room breakdown behind it can never
/// disagree.
class _LiveFigures extends ConsumerWidget {
  const _LiveFigures({required this.data});

  final GmDashboard data;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final rooms = data.rooms;
    return KpiGrid(
      children: [
        KpiCard(
          label: 'Occupancy',
          value: Fmt.percent(data.occupancy),
          hint: '${rooms.occupied} of ${rooms.total} rooms',
        ),
        KpiCard(
          label: 'Arrivals',
          value: Fmt.count(data.arrivalsToday),
          hint: 'today',
        ),
        KpiCard(
          label: 'Departures',
          value: Fmt.count(data.departuresToday),
          hint: 'today',
        ),
        KpiCard(label: 'In-house', value: Fmt.count(data.inHouse)),
        KpiCard(
          label: 'Rooms free',
          value: Fmt.count(rooms.available),
          hint: 'ready to sell',
        ),
        KpiCard(
          label: 'Needs cleaning',
          value: Fmt.count(rooms.dirty),
          hint: rooms.maintenance == 0
              ? null
              : '${rooms.maintenance} out of service',
        ),
        // Month revenue is the one figure on this screen an AGM may not hold
        // the key for, so it is gated at the tile rather than the page.
        if (ref.watch(canProvider(P.revenueRead)))
          KpiCard(
            label: 'Revenue this month',
            value: data.monthRevenueLabel,
            hint: 'booked, approximate',
          ),
        KpiCard(
          label: 'Awaiting approval',
          value: Fmt.count(data.pendingApprovals),
          hint: 'staff accounts',
        ),
        if (ref.watch(canProvider(P.revenueRead)) &&
            data.monthToDate.closedDays > 0) ...[
          KpiCard(
            label: 'ADR',
            value: formatPaise(data.monthToDate.adrPaise),
            hint: 'MTD, ${data.monthToDate.closedDays} closed days',
          ),
          KpiCard(
            label: 'RevPAR',
            value: formatPaise(data.monthToDate.revparPaise),
            hint: '${data.monthToDate.occupancyPct}% occupancy MTD',
          ),
        ],
      ],
    );
  }
}

/// Rooms free tonight per type, with the price they sell at.
class _AvailableTonight extends StatelessWidget {
  const _AvailableTonight({required this.items});
  final List<AvailableByType> items;

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    if (items.isEmpty) return const SizedBox.shrink();
    return Panel(
      title: 'Available tonight',
      padBody: false,
      child: Column(
        children: [
          for (var i = 0; i < items.length; i++) ...[
            if (i > 0) const RowDivider(),
            Padding(
              padding: const EdgeInsets.symmetric(
                horizontal: Sp.md,
                vertical: Sp.sm,
              ),
              child: Row(
                children: [
                  Expanded(
                    child: Text(
                      items[i].name,
                      style: AppTypography.body(size: 13, color: c.foreground),
                    ),
                  ),
                  Text(
                    '${items[i].available}/${items[i].total}',
                    style: AppTypography.numeric(
                      size: 13,
                      weight: FontWeight.w700,
                      color: items[i].available == 0
                          ? c.destructive
                          : c.foreground,
                    ),
                  ),
                  const SizedBox(width: Sp.md),
                  Text(
                    formatPaise(items[i].basePricePaise),
                    style: AppTypography.body(
                      size: 12,
                      color: c.mutedForeground,
                    ),
                  ),
                ],
              ),
            ),
          ],
        ],
      ),
    );
  }
}

/// The newest bookings across every source.
class _RecentBookings extends StatelessWidget {
  const _RecentBookings({required this.items});
  final List<RecentBooking> items;

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    if (items.isEmpty) return const SizedBox.shrink();
    return Panel(
      title: 'Newest bookings',
      padBody: false,
      child: Column(
        children: [
          for (var i = 0; i < items.length; i++) ...[
            if (i > 0) const RowDivider(),
            ListTile(
              dense: true,
              title: Text(
                '${items[i].guestName} · ${items[i].roomTypeName ?? ''}',
              ),
              subtitle: Text(
                '${items[i].reservationNumber} · '
                '${items[i].source.toLowerCase().replaceAll('_', ' ')} · '
                '${items[i].status.toLowerCase().replaceAll('_', ' ')}',
                style: AppTypography.body(size: 11, color: c.mutedForeground),
              ),
              trailing: Text(
                formatPaise(items[i].totalPaise),
                style: AppTypography.numeric(
                  size: 12.5,
                  weight: FontWeight.w600,
                  color: c.foreground,
                ),
              ),
              onTap: () => context.go(Routes.reservation(items[i].id)),
            ),
          ],
        ],
      ),
    );
  }
}

class _Overview extends ConsumerWidget {
  const _Overview({required this.data, this.hasLiveFigures = false});

  final ManagementOverview data;

  /// When the real dashboard answered, an empty legacy feed is not news — the
  /// screen already has its numbers and must not shout that it has none.
  final bool hasLiveFigures;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    if (data.isEmpty) {
      if (hasLiveFigures) return const SizedBox.shrink();
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
        // The legacy snapshot repeats occupancy, arrivals and departures. When
        // the real dashboard answered, showing both would print two versions
        // of the same number a few pixels apart.
        if (s != null && !hasLiveFigures)
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
