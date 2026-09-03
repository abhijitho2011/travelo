import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../../core/routing/routes.dart';
import 'package:intl/intl.dart';

import '../../../core/networking/api_exception.dart';
import '../../../core/permissions/permission_gate.dart';
import '../../../core/permissions/permission_keys.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/theme/app_spacing.dart';
import '../../../core/theme/app_typography.dart';
import '../../../core/widgets/primitives.dart';
import '../../../core/widgets/states.dart';
import '../../rooms/data/room_models.dart' show formatPaise;
import '../application/reports_controllers.dart';
import '../data/reports_models.dart';

/// **Reports** — the night-audit report set: every closed business day with
/// occupancy, ADR and RevPAR, plus the manual close for a missed run.
class ReportsScreen extends ConsumerWidget {
  const ReportsScreen({super.key});

  static final _d = DateFormat('EEE d MMM');

  Future<void> _run(BuildContext context, WidgetRef ref) async {
    final messenger = ScaffoldMessenger.of(context);
    final ok = await showDialog<bool>(
      context: context,
      builder: (d) => AlertDialog(
        title: const Text('Close the day now?'),
        content: const Text(
          'Flags no-shows for arrivals that never came and writes the night-audit snapshot for the day that closed. Safe to repeat — the same day is rewritten, not doubled.',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(d, false),
            child: const Text('Cancel'),
          ),
          FilledButton(
            onPressed: () => Navigator.pop(d, true),
            child: const Text('Run night audit'),
          ),
        ],
      ),
    );
    if (ok != true) return;
    try {
      final res = await ref.read(reportsRepositoryProvider).runNightAudit();
      ref.invalidate(nightAuditProvider);
      messenger.showSnackBar(
        SnackBar(
          content: Text('Closed. ${res['noShows']} no-show(s) flagged.'),
        ),
      );
    } on ApiException catch (e) {
      messenger.showSnackBar(SnackBar(content: Text(e.message)));
    }
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final c = context.colors;
    final days = ref.watch(nightAuditProvider);
    return PageBody(
      onRefresh: () async => ref.invalidate(nightAuditProvider),
      children: [
        PageHeader(
          eyebrow: 'Management',
          title: 'Reports',
          actions: [
            OutlinedButton.icon(
              onPressed: () => context.go(Routes.reportBuilder),
              icon: const Icon(Icons.table_chart_outlined, size: 16),
              label: const Text('Custom'),
            ),
            PermissionGate(
              permission: P.reportsExport,
              child: OutlinedButton.icon(
                onPressed: () => _run(context, ref),
                icon: const Icon(Icons.nightlight_outlined, size: 16),
                label: const Text('Night audit'),
              ),
            ),
          ],
        ),
        gapSection,
        days.when(
          loading: () => const ListSkeleton(rows: 4),
          error: (e, _) => ErrorState(
            error: e,
            onRetry: () => ref.invalidate(nightAuditProvider),
          ),
          data: (list) {
            if (list.isEmpty) {
              return const EmptyState(
                title: 'No closed days yet',
                hint:
                    'The night audit runs just after midnight. Each closed day appears here with its numbers.',
                icon: Icons.nightlight_outlined,
              );
            }
            final last7 = list.take(7).toList();
            final rev = last7.fold<int>(0, (s, d) => s + d.revenuePaise);
            final sold = last7.fold<int>(0, (s, d) => s + d.roomsSold);
            final avail = last7.fold<int>(0, (s, d) => s + d.roomsAvailable);
            return Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                const SectionHeader(
                  title: 'Last 7 closed days',
                  icon: Icons.insights_outlined,
                ),
                KpiGrid(
                  children: [
                    KpiCard(
                      label: 'Occupancy',
                      value: avail > 0
                          ? '${(sold * 100 / avail).round()}%'
                          : '—',
                    ),
                    KpiCard(
                      label: 'ADR',
                      value: sold > 0 ? formatPaise(rev ~/ sold) : '—',
                      hint: 'revenue ÷ rooms sold',
                    ),
                    KpiCard(
                      label: 'RevPAR',
                      value: avail > 0 ? formatPaise(rev ~/ avail) : '—',
                      hint: 'revenue ÷ rooms available',
                    ),
                    KpiCard(label: 'Room revenue', value: formatPaise(rev)),
                  ],
                ),
                gapSection,
                const SectionHeader(
                  title: 'Night audit',
                  icon: Icons.nightlight_outlined,
                ),
                SoftCard(
                  padding: EdgeInsets.zero,
                  child: Column(
                    children: [
                      for (var i = 0; i < list.length; i++) ...[
                        if (i > 0) const RowDivider(),
                        _DayRow(day: list[i]),
                      ],
                    ],
                  ),
                ),
                gapSection,
                Text(
                  'ADR is room revenue over rooms sold; RevPAR is room revenue over rooms available. Both come from the closed day, so they match the invoice book.',
                  style: AppTypography.body(
                    size: 11.5,
                    color: c.mutedForeground,
                  ),
                ),
                gapSection,
              ],
            );
          },
        ),
      ],
    );
  }
}

class _DayRow extends StatelessWidget {
  const _DayRow({required this.day});
  final NightAuditDay day;

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: Sp.md, vertical: Sp.sm),
      child: Row(
        children: [
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  ReportsScreen._d.format(day.businessDate),
                  style: AppTypography.body(
                    size: 13,
                    weight: FontWeight.w600,
                    color: c.foreground,
                  ),
                ),
                Text(
                  '${day.arrivals} in · ${day.departures} out · ${day.inHouse} in-house · ${day.noShows} no-show',
                  style: AppTypography.body(size: 11, color: c.mutedForeground),
                ),
              ],
            ),
          ),
          Column(
            crossAxisAlignment: CrossAxisAlignment.end,
            children: [
              Text(
                '${day.occupancyPct}% · ${formatPaise(day.revenuePaise)}',
                style: AppTypography.numeric(
                  size: 12.5,
                  weight: FontWeight.w700,
                  color: c.foreground,
                ),
              ),
              Text(
                'ADR ${formatPaise(day.adrPaise)} · RevPAR ${formatPaise(day.revparPaise)}',
                style: AppTypography.body(size: 10.5, color: c.mutedForeground),
              ),
            ],
          ),
        ],
      ),
    );
  }
}
