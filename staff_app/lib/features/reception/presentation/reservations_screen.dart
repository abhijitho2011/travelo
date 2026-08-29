import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/widgets/primitives.dart';
import '../../../core/widgets/states.dart';
import '../data/reception_repository.dart';
import 'reservation_list.dart';

/// The full booking list, segmented by arrivals / departures / in house / all.
class ReservationsScreen extends ConsumerWidget {
  const ReservationsScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final filter = ref.watch(reservationFilterProvider);
    final reservations = ref.watch(reservationsProvider);

    return PageBody(
      onRefresh: () async => ref.invalidate(reservationsProvider),
      children: [
        const PageHeader(
          eyebrow: 'Front office',
          title: 'Bookings',
          subtitle: 'Arrivals, departures and everyone currently in house.',
        ),
        gapSection,
        Align(
          alignment: Alignment.centerLeft,
          child: SingleChildScrollView(
            scrollDirection: Axis.horizontal,
            child: Segmented<ReservationFilter>(
              options: ReservationFilter.values,
              labelOf: (f) => f.label,
              value: filter,
              onChanged: (f) =>
                  ref.read(reservationFilterProvider.notifier).state = f,
            ),
          ),
        ),
        gapMd,
        reservations.when(
          loading: () => const ListSkeleton(rows: 4),
          error: (e, _) => ErrorState(
            error: e,
            onRetry: () => ref.invalidate(reservationsProvider),
          ),
          data: (items) => ReservationList(
            reservations: items,
            emptyTitle: 'Nothing in ${filter.label.toLowerCase()}',
            emptyHint:
                'Bookings appear here as soon as the property has them in the '
                'system.',
          ),
        ),
      ],
    );
  }
}
