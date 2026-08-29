import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/permissions/permission_gate.dart';
import '../../../core/permissions/permission_keys.dart';
import '../../../core/providers.dart';
import '../../../core/routing/routes.dart';
import '../../../core/utils/formatting.dart';
import '../../../core/widgets/primitives.dart';
import '../../../core/widgets/states.dart';
import '../data/reception_repository.dart';
import 'reservation_list.dart';

/// The receptionist's home — HF's `front-desk.tsx`: a dense KPI strip, then the
/// live arrival queue.
class ReceptionDashboardScreen extends ConsumerWidget {
  const ReceptionDashboardScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final session = ref.watch(sessionProvider);
    final summary = ref.watch(deskSummaryProvider);
    final reservations = ref.watch(reservationsProvider);

    return PageBody(
      onRefresh: () async {
        ref.invalidate(deskSummaryProvider);
        ref.invalidate(reservationsProvider);
      },
      children: [
        PageHeader(
          eyebrow: [
            'Front office',
            session?.hotel?.name,
          ].where((s) => s != null && s.isNotEmpty).join(' · '),
          title: 'Front desk',
          subtitle: Fmt.fullDate(DateTime.now()),
          actions: [
            PermissionGate(
              permission: P.reservationCreate,
              child: OutlinedButton.icon(
                onPressed: () => context.go(Routes.reservations),
                icon: const Icon(Icons.person_add_alt_outlined, size: 16),
                label: const Text('Walk-in'),
              ),
            ),
            PermissionGate(
              permission: P.checkInPerform,
              child: FilledButton.icon(
                onPressed: () => context.go(Routes.checkIn),
                icon: const Icon(Icons.login_outlined, size: 16),
                label: const Text('Start check-in'),
              ),
            ),
          ],
        ),
        gapSection,

        summary.when(
          loading: () => const KpiSkeleton(count: 6),
          error: (e, _) =>
              ErrorState(error: e, onRetry: () => ref.invalidate(deskSummaryProvider)),
          data: (s) => s == null
              ? const EmptyState(
                  title: 'Desk figures are not available yet',
                  hint:
                      'The front-office feed for this property has not been '
                      'switched on. Reservations below will still load once '
                      'they exist.',
                  icon: Icons.insights_outlined,
                )
              : KpiGrid(
                  children: [
                    KpiCard(
                      label: 'Arrivals',
                      value: Fmt.count(s.arrivals),
                      hint: s.arrivalsUnassigned == null
                          ? null
                          : '${s.arrivalsUnassigned} without a room',
                    ),
                    KpiCard(
                      label: 'Departures',
                      value: Fmt.count(s.departures),
                      hint: s.lateCheckouts == null
                          ? null
                          : '${s.lateCheckouts} late checkout',
                    ),
                    KpiCard(label: 'In-house', value: Fmt.count(s.inHouse)),
                    KpiCard(
                      label: 'Available',
                      value: Fmt.count(s.available),
                      hint: 'ready to sell',
                    ),
                    KpiCard(label: 'Dirty', value: Fmt.count(s.dirty)),
                    KpiCard(label: 'Walk-ins', value: Fmt.count(s.walkIns)),
                    // Money is shown only to someone allowed to take it.
                    if (ref.watch(canProvider(P.paymentCollect)))
                      KpiCard(
                        label: 'Pending payment',
                        value: Fmt.money(s.pendingPayment, compact: true),
                      ),
                    KpiCard(label: 'Ready', value: Fmt.count(s.ready)),
                  ],
                ),
        ),

        gapSection,
        SectionHeader(
          title: 'Arrival queue',
          icon: Icons.flight_land_outlined,
          trailing: TextButton(
            onPressed: () => context.go(Routes.reservations),
            child: const Text('All bookings'),
          ),
        ),
        reservations.when(
          loading: () => const ListSkeleton(rows: 3),
          error: (e, _) =>
              ErrorState(error: e, onRetry: () => ref.invalidate(reservationsProvider)),
          data: (items) => ReservationList(
            reservations: items.take(6).toList(),
            emptyTitle: 'No arrivals in the book',
            emptyHint:
                "When today's arrivals are loaded they appear here, sorted by "
                'expected time.',
          ),
        ),
      ],
    );
  }
}
