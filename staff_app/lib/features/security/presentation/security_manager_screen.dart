import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/routing/routes.dart';
import '../../../core/utils/formatting.dart';
import '../../../core/widgets/primitives.dart';
import '../../../core/widgets/states.dart';
import '../data/security_repository.dart';

/// The Security Manager's oversight dashboard: who is on duty, who is on site,
/// and what is still open. The gate, visitor and incident ledgers live in their
/// own screens (reached from the More menu); this is the summary above them.
class SecurityManagerScreen extends ConsumerWidget {
  const SecurityManagerScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final async = ref.watch(securityDashboardProvider);
    return PageBody(
      onRefresh: () async => ref.invalidate(securityDashboardProvider),
      children: [
        PageHeader(
          eyebrow: 'Security',
          title: 'Security dashboard',
          subtitle: 'Guards on duty, visitors on site and open incidents.',
          actions: [
            OutlinedButton.icon(
              onPressed: () => context.push(Routes.securityIncidents),
              icon: const Icon(Icons.report_gmailerrorred_outlined, size: 17),
              label: const Text('Incidents'),
            ),
            OutlinedButton.icon(
              onPressed: () => context.push(Routes.securityRoster),
              icon: const Icon(Icons.groups_outlined, size: 17),
              label: const Text('Roster'),
            ),
          ],
        ),
        gapSection,
        async.when(
          loading: () => const KpiSkeleton(),
          error: (e, _) => ErrorState(
            error: e,
            onRetry: () => ref.invalidate(securityDashboardProvider),
          ),
          data: (d) {
            if (d == null) {
              return const EmptyState(
                title: 'No security activity yet',
                hint: 'Shifts, visitors and incidents will summarise here.',
                icon: Icons.shield_outlined,
              );
            }
            return Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                KpiGrid(
                  children: [
                    KpiCard(label: 'On duty', value: Fmt.count(d.activeStaff)),
                    KpiCard(
                      label: 'Visitors on site',
                      value: Fmt.count(d.visitorsOnSite),
                    ),
                    KpiCard(
                      label: 'Open incidents',
                      value: Fmt.count(d.openIncidents),
                      tone: d.openIncidents > 0
                          ? Theme.of(context).colorScheme.error
                          : null,
                    ),
                    KpiCard(
                      label: 'High severity',
                      value: Fmt.count(d.openBySeverity['HIGH'] ?? 0),
                    ),
                  ],
                ),
                gapSection,
                Panel(
                  title: 'Open incidents by severity',
                  child: Column(
                    children: [
                      for (final sev in const ['HIGH', 'MEDIUM', 'LOW'])
                        Padding(
                          padding: const EdgeInsets.symmetric(vertical: 4),
                          child: Row(
                            mainAxisAlignment: MainAxisAlignment.spaceBetween,
                            children: [
                              Text(_severityLabel(sev)),
                              Text(Fmt.count(d.openBySeverity[sev] ?? 0)),
                            ],
                          ),
                        ),
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

  String _severityLabel(String sev) => switch (sev) {
    'HIGH' => 'High',
    'MEDIUM' => 'Medium',
    _ => 'Low',
  };
}
