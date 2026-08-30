import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/networking/api_exception.dart';
import '../../../core/permissions/permission_gate.dart';
import '../../../core/permissions/permission_keys.dart';
import '../../../core/providers.dart';
import '../../../core/routing/routes.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/theme/app_spacing.dart';
import '../../../core/theme/app_typography.dart';
import '../../../core/utils/formatting.dart';
import '../../../core/widgets/primitives.dart';
import '../../../core/widgets/states.dart';
import '../../../core/widgets/status_badge.dart';
import '../application/travel_desk_controllers.dart';
import '../data/transport_models.dart';
import 'transport_form_sheet.dart';
import 'assign_sheet.dart';

/// The Travel Desk dashboard: today's transfers and the pending queue, then the
/// full requests list with a per-request assign / status flow.
class TravelDeskScreen extends ConsumerWidget {
  const TravelDeskScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final summary = ref.watch(transportSummaryProvider);
    final requests = ref.watch(transportRequestsProvider);
    final filter = ref.watch(transportFilterProvider);
    final session = ref.watch(sessionProvider);

    return Scaffold(
      floatingActionButton: ref.hasPermission(P.transportCreate)
          ? FloatingActionButton.extended(
              onPressed: () => TransportFormSheet.show(context, ref),
              icon: const Icon(Icons.add),
              label: const Text('New request'),
            )
          : null,
      body: PageBody(
        onRefresh: () async {
          ref.invalidate(transportSummaryProvider);
          ref.invalidate(transportRequestsProvider);
        },
        children: [
          PageHeader(
            eyebrow: [
              'Travel desk',
              session?.hotel?.name,
            ].where((s) => s != null && s.isNotEmpty).join(' · '),
            title: 'Travel Desk',
            subtitle: 'Transfers, tours and the fleet.',
            actions: [
              PermissionGate(
                permission: P.vehicleRead,
                child: OutlinedButton.icon(
                  onPressed: () => context.go(Routes.travelDeskVehicles),
                  icon: const Icon(Icons.directions_car_outlined, size: 16),
                  label: const Text('Vehicles'),
                ),
              ),
            ],
          ),
          gapSection,
          summary.when(
            loading: () => const KpiSkeleton(count: 3),
            error: (e, _) => ErrorState(
              error: e,
              onRetry: () => ref.invalidate(transportSummaryProvider),
            ),
            data: (s) => KpiGrid(
              minTileWidth: 150,
              children: [
                KpiCard(label: "Today's transfers", value: Fmt.count(s?.todayCount)),
                KpiCard(
                  label: 'Pending',
                  value: Fmt.count(s?.pendingCount),
                  tone: (s?.pendingCount ?? 0) > 0 ? context.colors.warning : null,
                ),
                KpiCard(label: 'On the road', value: Fmt.count(s?.inProgressCount)),
              ],
            ),
          ),
          gapSection,
          SectionHeader(
            title: 'Requests',
            trailing: _StatusFilter(
              value: filter.status,
              onChanged: (v) => ref
                  .read(transportFilterProvider.notifier)
                  .update(
                    (f) => v == null ? f.copyWith(clearStatus: true) : f.copyWith(status: v),
                  ),
            ),
          ),
          requests.when(
            loading: () => const ListSkeleton(rows: 4),
            error: (e, _) => ErrorState(
              error: e,
              onRetry: () => ref.invalidate(transportRequestsProvider),
            ),
            data: (list) => list.isEmpty
                ? const EmptyState(
                    title: 'No transport requests',
                    hint: 'Raise a pickup, drop, tour or rental for a guest.',
                    icon: Icons.local_taxi_outlined,
                  )
                : Column(
                    children: [
                      for (final r in list) _RequestRow(request: r),
                    ],
                  ),
          ),
        ],
      ),
    );
  }
}

class _StatusFilter extends StatelessWidget {
  const _StatusFilter({required this.value, required this.onChanged});
  final TransportStatus? value;
  final ValueChanged<TransportStatus?> onChanged;

  @override
  Widget build(BuildContext context) {
    return DropdownButton<TransportStatus?>(
      value: value,
      hint: const Text('All', style: TextStyle(fontSize: 13)),
      underline: const SizedBox.shrink(),
      isDense: true,
      items: [
        const DropdownMenuItem(value: null, child: Text('All')),
        for (final s in TransportStatus.values)
          DropdownMenuItem(value: s, child: Text(s.label)),
      ],
      onChanged: onChanged,
    );
  }
}

class _RequestRow extends ConsumerWidget {
  const _RequestRow({required this.request});
  final TransportRequest request;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final c = context.colors;
    final r = request;
    final route = [r.fromLocation, r.toLocation].where((s) => s != null && s.isNotEmpty).join(' → ');
    return Padding(
      padding: const EdgeInsets.only(bottom: Sp.md),
      child: SoftCard(
      onTap: () => _openActions(context, ref, r),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Expanded(
                child: Text(
                  r.guestName,
                  style: AppTypography.body(
                    size: 14,
                    weight: FontWeight.w700,
                    color: c.foreground,
                  ),
                ),
              ),
              StatusBadge(tone: r.status.tone, label: r.status.label, dense: true),
            ],
          ),
          const SizedBox(height: 4),
          Text(
            '${r.type.label} · ${Fmt.dateTime(r.pickupAt)}',
            style: AppTypography.body(size: 12.5, color: c.mutedForeground),
          ),
          if (route.isNotEmpty) ...[
            const SizedBox(height: 2),
            Text(
              route,
              style: AppTypography.body(size: 12.5, color: c.mutedForeground),
            ),
          ],
          if (r.driverName != null) ...[
            const SizedBox(height: 4),
            Row(
              children: [
                Icon(Icons.badge_outlined, size: 13, color: c.mutedForeground),
                const SizedBox(width: 4),
                Text(
                  [r.driverName, r.vehicleName].where((s) => s != null).join(' · '),
                  style: AppTypography.body(size: 12, color: c.mutedForeground),
                ),
              ],
            ),
          ],
        ],
      ),
      ),
    );
  }

  void _openActions(BuildContext context, WidgetRef ref, TransportRequest r) {
    showModalBottomSheet<void>(
      context: context,
      showDragHandle: true,
      builder: (sheetCtx) => SafeArea(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            if (ref.hasPermission(P.transportAssign) &&
                (r.status == TransportStatus.requested ||
                    r.status == TransportStatus.assigned))
              ListTile(
                leading: const Icon(Icons.person_add_alt_1_outlined),
                title: Text(
                  r.status == TransportStatus.assigned ? 'Reassign driver' : 'Assign driver',
                ),
                onTap: () {
                  Navigator.of(sheetCtx).pop();
                  AssignSheet.show(context, ref, r);
                },
              ),
            if (ref.hasPermission(P.transportUpdate) &&
                r.status != TransportStatus.completed &&
                r.status != TransportStatus.cancelled)
              ListTile(
                leading: const Icon(Icons.edit_outlined),
                title: const Text('Edit request'),
                onTap: () {
                  Navigator.of(sheetCtx).pop();
                  TransportFormSheet.show(context, ref, existing: r);
                },
              ),
            if (ref.hasPermission(P.transportUpdate) &&
                r.status != TransportStatus.completed &&
                r.status != TransportStatus.cancelled)
              ListTile(
                leading: Icon(Icons.cancel_outlined, color: context.colors.critical),
                title: const Text('Cancel request'),
                onTap: () async {
                  Navigator.of(sheetCtx).pop();
                  await _run(context, ref, () => ref
                      .read(travelDeskActionsProvider)
                      .setStatus(r.id, TransportStatus.cancelled));
                },
              ),
          ],
        ),
      ),
    );
  }

  Future<void> _run(BuildContext context, WidgetRef ref, Future<void> Function() op) async {
    final messenger = ScaffoldMessenger.of(context);
    try {
      await op();
    } on ApiException catch (e) {
      messenger.showSnackBar(SnackBar(content: Text(e.message)));
    }
  }
}
