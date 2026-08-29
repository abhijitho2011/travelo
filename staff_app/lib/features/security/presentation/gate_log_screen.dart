import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/permissions/permission_gate.dart';
import '../../../core/permissions/permission_keys.dart';
import '../../../core/widgets/primitives.dart';
import '../../../core/widgets/states.dart';
import '../data/security_models.dart';
import '../data/security_repository.dart';
import 'gate_screen.dart' show GateLogRow;
import 'record_sheets.dart';

/// The vehicle log and the staff-movement log are the same list filtered
/// differently, so they share one screen driven by [vehicles].
class GateLogScreen extends ConsumerWidget {
  const GateLogScreen({super.key, required this.vehicles});

  final bool vehicles;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final async = ref.watch(gateLogProvider(vehicles));

    return PageBody(
      onRefresh: () async => ref.invalidate(gateLogProvider(vehicles)),
      children: [
        PageHeader(
          eyebrow: 'Security',
          title: vehicles ? 'Vehicle log' : 'Staff movement',
          subtitle: vehicles
              ? 'Every vehicle in and out of the property gate.'
              : 'Staff entering and leaving the property.',
          actions: [
            PermissionGate(
              permission: vehicles ? P.vehicleEntry : P.staffEntry,
              child: FilledButton.icon(
                onPressed: () async {
                  final saved = await SecuritySheets.movement(
                    context,
                    ref,
                    vehicles ? GateMovement.vehicleIn : GateMovement.staffIn,
                  );
                  if (saved == true) ref.invalidate(gateLogProvider(vehicles));
                },
                icon: const Icon(Icons.add, size: 17),
                label: Text(vehicles ? 'Vehicle in' : 'Staff in'),
              ),
            ),
            PermissionGate(
              permission: vehicles ? P.vehicleExit : P.staffEntry,
              child: OutlinedButton.icon(
                onPressed: () async {
                  final saved = await SecuritySheets.movement(
                    context,
                    ref,
                    vehicles ? GateMovement.vehicleOut : GateMovement.staffOut,
                  );
                  if (saved == true) ref.invalidate(gateLogProvider(vehicles));
                },
                icon: const Icon(Icons.logout, size: 17),
                label: Text(vehicles ? 'Vehicle out' : 'Staff out'),
              ),
            ),
          ],
        ),
        gapSection,
        async.when(
          loading: () => const ListSkeleton(rows: 5, height: 64),
          error: (e, _) => ErrorState(
            error: e,
            onRetry: () => ref.invalidate(gateLogProvider(vehicles)),
          ),
          data: (entries) {
            final filtered = vehicles
                ? entries.where((e) => e.movement.isVehicle).toList()
                : entries.where((e) => !e.movement.isVehicle).toList();
            if (filtered.isEmpty) {
              return EmptyState(
                title: vehicles
                    ? 'No vehicles logged'
                    : 'No staff movements logged',
                hint: 'Use the buttons above to record the first one.',
                icon: vehicles
                    ? Icons.directions_car_outlined
                    : Icons.transfer_within_a_station_outlined,
              );
            }
            return Panel(
              title: vehicles ? 'Vehicles' : 'Staff',
              padBody: false,
              child: Column(
                children: [
                  for (var i = 0; i < filtered.length; i++) ...[
                    if (i > 0) const RowDivider(),
                    GateLogRow(entry: filtered[i]),
                  ],
                ],
              ),
            );
          },
        ),
      ],
    );
  }
}
