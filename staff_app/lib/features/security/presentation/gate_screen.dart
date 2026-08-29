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
import '../../../core/utils/formatting.dart';
import '../../../core/widgets/cards.dart';
import '../../../core/widgets/primitives.dart';
import '../../../core/widgets/states.dart';
import '../../../core/widgets/status_badge.dart';
import '../data/security_models.dart';
import '../data/security_repository.dart';
import 'record_sheets.dart';

/// The gate. Four large actions and today's movement log — everything a guard
/// on their feet needs, and nothing they should not see.
class GateScreen extends ConsumerWidget {
  const GateScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final session = ref.watch(sessionProvider);
    final log = ref.watch(gateLogProvider(false));

    return PageBody(
      onRefresh: () async => ref.invalidate(gateLogProvider(false)),
      children: [
        PageHeader(
          eyebrow: [
            'Security',
            session?.hotel?.name,
          ].where((s) => s != null && s.isNotEmpty).join(' · '),
          title: 'Gate',
          subtitle: Fmt.fullDate(DateTime.now()),
        ),
        gapSection,

        PermissionGate(
          permission: P.vehicleEntry,
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              const SectionHeader(
                title: 'Record a movement',
                icon: Icons.swap_horiz,
              ),
              GridView.count(
                crossAxisCount: 2,
                crossAxisSpacing: Sp.md,
                mainAxisSpacing: Sp.md,
                shrinkWrap: true,
                physics: const NeverScrollableScrollPhysics(),
                childAspectRatio: 2.1,
                children: [
                  for (final m in GateMovement.values)
                    _ActionTile(
                      movement: m,
                      onTap: () async {
                        final saved = await SecuritySheets.movement(
                          context,
                          ref,
                          m,
                        );
                        if (saved == true) {
                          ref.invalidate(gateLogProvider(false));
                        }
                      },
                    ),
                ],
              ),
            ],
          ),
        ),

        gapSection,
        SectionHeader(
          title: "Today's movements",
          icon: Icons.receipt_long_outlined,
          trailing: TextButton(
            onPressed: () => context.go(Routes.securityVehicles),
            child: const Text('Vehicle log'),
          ),
        ),
        log.when(
          loading: () => const ListSkeleton(rows: 3, height: 64),
          error: (e, _) => ErrorState(
            error: e,
            onRetry: () => ref.invalidate(gateLogProvider(false)),
          ),
          data: (entries) => entries.isEmpty
              ? const EmptyState(
                  title: 'Nothing logged yet today',
                  hint:
                      'Every entry and exit you record appears here, newest '
                      'first.',
                  icon: Icons.sensor_door_outlined,
                )
              : Panel(
                  title: 'Gate log',
                  padBody: false,
                  child: Column(
                    children: [
                      for (var i = 0; i < entries.length; i++) ...[
                        if (i > 0) const RowDivider(),
                        GateLogRow(entry: entries[i]),
                      ],
                    ],
                  ),
                ),
        ),
      ],
    );
  }
}

class _ActionTile extends StatelessWidget {
  const _ActionTile({required this.movement, required this.onTap});

  final GateMovement movement;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    final tone = movement.tone.color(c);
    return SoftCard(
      onTap: onTap,
      padding: const EdgeInsets.all(Sp.md),
      child: Row(
        children: [
          Container(
            width: 38,
            height: 38,
            decoration: BoxDecoration(
              color: tone.withValues(alpha: 0.12),
              borderRadius: R.rSm,
              border: Border.all(color: tone.withValues(alpha: 0.3)),
            ),
            alignment: Alignment.center,
            child: Icon(movement.icon, size: 19, color: tone),
          ),
          const SizedBox(width: Sp.md),
          Expanded(
            child: Text(
              movement.label,
              style: AppTypography.body(
                size: 13.5,
                weight: FontWeight.w700,
                color: c.foreground,
              ),
            ),
          ),
        ],
      ),
    );
  }
}

/// One row of the gate log — shared with the vehicle and staff-movement pages.
class GateLogRow extends StatelessWidget {
  const GateLogRow({super.key, required this.entry});

  final GateLogEntry entry;

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    return DataRow2(
      leading: Icon(entry.movement.icon, size: 18, color: c.mutedForeground),
      title: entry.subject,
      subtitle: [
        entry.movement.label,
        Fmt.time(entry.at),
        if (entry.detail != null && entry.detail!.isNotEmpty) entry.detail!,
      ].join(' · '),
      badge: entry.pendingSync
          ? const StatusBadge(
              tone: StatusTone.warning,
              label: 'Queued',
              dense: true,
            )
          : null,
    );
  }
}
