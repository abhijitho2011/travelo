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
import '../application/reception_controllers.dart';
import '../data/reception_models.dart';
import 'reservation_list.dart';

/// The receptionist's home: today's four numbers, then the three queues the
/// shift actually works through — arrivals, departures, and who is in house.
///
/// All of it comes from one `GET /desk/today`, so the counts and the lists can
/// never disagree with each other.
class ReceptionDashboardScreen extends ConsumerWidget {
  const ReceptionDashboardScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final session = ref.watch(sessionProvider);
    final board = ref.watch(deskTodayProvider);

    return PageBody(
      onRefresh: () async => ref.invalidate(deskTodayProvider),
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
                onPressed: () => context.go(Routes.reservationNew),
                icon: const Icon(Icons.person_add_alt_outlined, size: 16),
                label: const Text('New booking'),
              ),
            ),
            // The room-by-night chart. It sits with the desk's other two
            // actions because it answers the question they lead to: what is
            // free, and who is where.
            PermissionGate(
              permission: P.reservationRead,
              child: OutlinedButton.icon(
                onPressed: () => context.go(Routes.reservationCalendar),
                icon: const Icon(Icons.calendar_month_outlined, size: 16),
                label: const Text('Calendar'),
              ),
            ),
            PermissionGate(
              permission: P.reservationRead,
              child: FilledButton.icon(
                onPressed: () => context.go(Routes.reservations),
                icon: const Icon(Icons.event_note_outlined, size: 16),
                label: const Text('All bookings'),
              ),
            ),
          ],
        ),
        gapSection,

        board.when(
          loading: () => const KpiSkeleton(count: 4),
          error: (e, _) =>
              ErrorState(error: e, onRetry: () => ref.invalidate(deskTodayProvider)),
          data: (data) => data == null
              ? const EmptyState(
                  title: 'The desk board is not available yet',
                  hint:
                      'The reservations service has not been switched on for '
                      'this property.',
                  icon: Icons.insights_outlined,
                )
              : _Board(board: data),
        ),
      ],
    );
  }
}

class _Board extends StatelessWidget {
  const _Board({required this.board});

  final DeskBoard board;

  @override
  Widget build(BuildContext context) {
    final counts = board.counts;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        KpiGrid(
          children: [
            KpiCard(
              label: 'Arrivals',
              value: Fmt.count(counts.arrivals),
              hint: 'still to check in',
            ),
            KpiCard(
              label: 'Departures',
              value: Fmt.count(counts.departures),
              hint: 'due out today',
            ),
            KpiCard(label: 'In-house', value: Fmt.count(counts.inHouse)),
            KpiCard(
              label: 'Rooms free',
              value: Fmt.count(counts.availableRooms),
              hint: 'ready to sell',
            ),
          ],
        ),

        gapSection,
        const SectionHeader(
          title: 'Arrivals',
          icon: Icons.flight_land_outlined,
        ),
        ReservationList(
          reservations: board.arrivals,
          emptyTitle: 'Nobody left to check in',
          emptyHint: "Every confirmed arrival for today is already in house.",
        ),

        gapSection,
        const SectionHeader(
          title: 'Departures',
          icon: Icons.flight_takeoff_outlined,
        ),
        ReservationList(
          reservations: board.departures,
          emptyTitle: 'No departures today',
          emptyHint: 'Nobody in house is due out before tomorrow.',
        ),

        gapSection,
        const SectionHeader(title: 'In house', icon: Icons.hotel_outlined),
        ReservationList(
          reservations: board.inHouse,
          emptyTitle: 'The hotel is empty tonight',
          emptyHint: 'Guests appear here from the moment they are checked in.',
        ),
      ],
    );
  }
}
