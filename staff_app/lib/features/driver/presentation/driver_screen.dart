import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/providers.dart';
import '../../../core/routing/routes.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/theme/app_spacing.dart';
import '../../../core/theme/app_typography.dart';
import '../../../core/utils/formatting.dart';
import '../../../core/widgets/primitives.dart';
import '../../../core/widgets/states.dart';
import '../../../core/widgets/status_badge.dart';
import '../../travel_desk/data/transport_models.dart';
import '../application/driver_controllers.dart';

/// The driver's home: the trips assigned to them, active ones first.
class DriverScreen extends ConsumerWidget {
  const DriverScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final trips = ref.watch(myTripsProvider);
    final session = ref.watch(sessionProvider);

    return PageBody(
      onRefresh: () async => ref.invalidate(myTripsProvider),
      children: [
        PageHeader(
          eyebrow: [
            'Driver',
            session?.hotel?.name,
          ].where((s) => s != null && s.isNotEmpty).join(' · '),
          title: 'My Trips',
          subtitle: 'The transfers assigned to you.',
        ),
        gapSection,
        trips.when(
          loading: () => const ListSkeleton(rows: 4),
          error: (e, _) => ErrorState(
            error: e,
            onRetry: () => ref.invalidate(myTripsProvider),
          ),
          data: (list) {
            if (list.isEmpty) {
              return const EmptyState(
                title: 'No trips assigned',
                hint: 'Trips the travel desk assigns to you will appear here.',
                icon: Icons.local_taxi_outlined,
              );
            }
            final active = list.where((t) => t.status.isActive).toList();
            final done = list.where((t) => !t.status.isActive).toList();
            return Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                if (active.isNotEmpty) ...[
                  SectionHeader(
                    title: 'Active',
                    icon: Icons.play_circle_outline,
                  ),
                  for (final t in active) _TripCard(trip: t),
                  gapSection,
                ],
                if (done.isNotEmpty) ...[
                  SectionHeader(title: 'History', icon: Icons.history),
                  for (final t in done) _TripCard(trip: t),
                ],
              ],
            );
          },
        ),
      ],
    );
  }
}

class _TripCard extends StatelessWidget {
  const _TripCard({required this.trip});
  final TransportRequest trip;

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    final route = [
      trip.fromLocation,
      trip.toLocation,
    ].where((s) => s != null && s.isNotEmpty).join(' → ');
    return Padding(
      padding: const EdgeInsets.only(bottom: Sp.md),
      child: SoftCard(
        onTap: () => context.go(Routes.driverTrip(trip.id)),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Expanded(
                  child: Text(
                    trip.guestName,
                    style: AppTypography.body(
                      size: 15,
                      weight: FontWeight.w700,
                      color: c.foreground,
                    ),
                  ),
                ),
                StatusBadge(
                  tone: trip.status.tone,
                  label: trip.driverStage?.label ?? trip.status.label,
                  dense: true,
                ),
              ],
            ),
            const SizedBox(height: 4),
            Text(
              '${trip.type.label} · ${Fmt.dateTime(trip.pickupAt)}',
              style: AppTypography.body(size: 12.5, color: c.mutedForeground),
            ),
            if (route.isNotEmpty) ...[
              const SizedBox(height: 2),
              Text(
                route,
                style: AppTypography.body(size: 12.5, color: c.mutedForeground),
              ),
            ],
          ],
        ),
      ),
    );
  }
}
