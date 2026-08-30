import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/permissions/permission_gate.dart';
import '../../../core/permissions/permission_keys.dart';
import '../../../core/routing/routes.dart';
import '../../../core/utils/formatting.dart';
import '../../../core/widgets/cards.dart';
import '../../../core/widgets/primitives.dart';
import '../../../core/widgets/states.dart';
import '../../../core/widgets/status_badge.dart';
import '../application/spa_controllers.dart';
import '../data/spa_models.dart';

/// The Spa Manager's day at a glance: today's appointments, how many are done,
/// and quick access to the calendar and the service catalogue.
class SpaScreen extends ConsumerWidget {
  const SpaScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final async = ref.watch(spaDashboardProvider);
    return PageBody(
      onRefresh: () async => ref.invalidate(spaDashboardProvider),
      children: [
        PageHeader(
          eyebrow: 'Spa',
          title: 'Spa dashboard',
          subtitle: "Today's treatments and the therapists working them.",
          actions: [
            OutlinedButton.icon(
              onPressed: () => context.push(Routes.spaAppointments),
              icon: const Icon(Icons.event_available_outlined, size: 17),
              label: const Text('Appointments'),
            ),
            PermissionGate(
              permission: P.spaServiceRead,
              child: OutlinedButton.icon(
                onPressed: () => context.push(Routes.spaServices),
                icon: const Icon(Icons.spa_outlined, size: 17),
                label: const Text('Services'),
              ),
            ),
          ],
        ),
        gapSection,
        async.when(
          loading: () => const KpiSkeleton(),
          error: (e, _) => ErrorState(error: e, onRetry: () => ref.invalidate(spaDashboardProvider)),
          data: (d) {
            if (d == null) {
              return const EmptyState(
                title: 'No spa activity yet',
                hint: 'Booked treatments will summarise here.',
                icon: Icons.spa_outlined,
              );
            }
            final booked = d.byStatus['BOOKED'] ?? 0;
            final inProgress = d.byStatus['IN_PROGRESS'] ?? 0;
            return Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                KpiGrid(
                  children: [
                    KpiCard(label: 'Today', value: Fmt.count(d.todayCount)),
                    KpiCard(label: 'Booked', value: Fmt.count(booked)),
                    KpiCard(label: 'In progress', value: Fmt.count(inProgress)),
                    KpiCard(label: 'Completed', value: Fmt.count(d.completedCount)),
                  ],
                ),
                gapSection,
                if (d.appointments.isEmpty)
                  const EmptyState(
                    title: 'Nothing booked today',
                    icon: Icons.event_busy_outlined,
                  )
                else
                  Panel(
                    title: "Today's schedule",
                    description: '${d.appointments.length} appointments',
                    padBody: false,
                    child: Column(
                      children: [
                        for (var i = 0; i < d.appointments.length; i++) ...[
                          if (i > 0) const RowDivider(),
                          _ScheduleRow(a: d.appointments[i]),
                        ],
                      ],
                    ),
                  ),
              ],
            );
          },
        ),
      ],
    );
  }
}

class _ScheduleRow extends StatelessWidget {
  const _ScheduleRow({required this.a});

  final SpaAppointment a;

  @override
  Widget build(BuildContext context) {
    return DataRow2(
      title: a.guestName,
      subtitle: [
        a.serviceName,
        if (a.startAt != null) Fmt.time(a.startAt),
        if (!a.hasTherapist) 'Unassigned',
      ].join(' · '),
      badge: StatusBadge(tone: a.status.tone, label: a.status.label, dense: true),
    );
  }
}
