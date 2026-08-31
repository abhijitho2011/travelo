import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/networking/api_exception.dart';
import '../../../core/theme/app_spacing.dart';
import '../../../core/widgets/states.dart';
import '../application/travel_desk_controllers.dart';
import '../data/transport_models.dart';

/// Assign a driver (and optionally a vehicle) to a transport request.
class AssignSheet extends ConsumerStatefulWidget {
  const AssignSheet({super.key, required this.request});

  final TransportRequest request;

  static Future<void> show(
    BuildContext context,
    WidgetRef ref,
    TransportRequest request,
  ) => showModalBottomSheet<void>(
    context: context,
    isScrollControlled: true,
    showDragHandle: true,
    constraints: BoxConstraints(
      maxHeight: MediaQuery.sizeOf(context).height * 0.85,
    ),
    builder: (_) => AssignSheet(request: request),
  );

  @override
  ConsumerState<AssignSheet> createState() => _AssignSheetState();
}

class _AssignSheetState extends ConsumerState<AssignSheet> {
  String? _driverId;
  String? _vehicleId;
  bool _busy = false;
  String? _error;

  @override
  void initState() {
    super.initState();
    _driverId = widget.request.driverStaffId;
    _vehicleId = widget.request.vehicleId;
  }

  Future<void> _assign() async {
    if (_driverId == null) {
      setState(() => _error = 'Pick a driver to assign the trip to.');
      return;
    }
    setState(() {
      _busy = true;
      _error = null;
    });
    final navigator = Navigator.of(context);
    try {
      await ref
          .read(travelDeskActionsProvider)
          .assign(
            widget.request.id,
            driverStaffId: _driverId!,
            vehicleId: _vehicleId,
          );
      navigator.pop();
    } on ApiException catch (e) {
      setState(() {
        _busy = false;
        _error = e.message;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final drivers = ref.watch(driversProvider);
    final vehicles = ref.watch(vehiclesProvider);

    return Padding(
      padding: EdgeInsets.only(
        left: Sp.lg,
        right: Sp.lg,
        top: Sp.md,
        bottom: MediaQuery.viewInsetsOf(context).bottom + Sp.lg,
      ),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Text(
            'Assign ${widget.request.guestName}',
            style: Theme.of(context).textTheme.titleMedium,
          ),
          const SizedBox(height: Sp.md),
          drivers.when(
            loading: () => const ListSkeleton(rows: 1, height: 56),
            error: (e, _) => Text(
              'Could not load drivers: ${e is ApiException ? e.message : e}',
            ),
            data: (list) => list.isEmpty
                ? const EmptyState(
                    title: 'No drivers found',
                    hint: 'Add a staff member with the Driver role first.',
                    icon: Icons.person_off_outlined,
                  )
                : DropdownButtonFormField<String>(
                    initialValue: _driverId,
                    decoration: const InputDecoration(labelText: 'Driver'),
                    items: [
                      for (final d in list)
                        DropdownMenuItem(value: d.id, child: Text(d.name)),
                    ],
                    onChanged: (v) => setState(() => _driverId = v),
                  ),
          ),
          const SizedBox(height: Sp.md),
          vehicles.when(
            loading: () => const SizedBox.shrink(),
            error: (_, _) => const SizedBox.shrink(),
            data: (list) => DropdownButtonFormField<String?>(
              initialValue: _vehicleId,
              decoration: const InputDecoration(
                labelText: 'Vehicle (optional)',
              ),
              items: [
                const DropdownMenuItem(value: null, child: Text('No vehicle')),
                for (final v in list.where(
                  (v) =>
                      v.status == VehicleStatus.available || v.id == _vehicleId,
                ))
                  DropdownMenuItem(
                    value: v.id,
                    child: Text('${v.name} (${v.plate})'),
                  ),
              ],
              onChanged: (v) => setState(() => _vehicleId = v),
            ),
          ),
          if (_error != null) ...[
            const SizedBox(height: Sp.md),
            Text(
              _error!,
              style: TextStyle(color: Theme.of(context).colorScheme.error),
            ),
          ],
          const SizedBox(height: Sp.lg),
          FilledButton(
            onPressed: _busy ? null : _assign,
            child: _busy
                ? const SizedBox(
                    height: 18,
                    width: 18,
                    child: CircularProgressIndicator(strokeWidth: 2),
                  )
                : const Text('Assign'),
          ),
        ],
      ),
    );
  }
}
