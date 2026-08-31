import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/networking/api_exception.dart';
import '../../../core/permissions/permission_gate.dart';
import '../../../core/permissions/permission_keys.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/theme/app_spacing.dart';
import '../../../core/theme/app_typography.dart';
import '../../../core/widgets/primitives.dart';
import '../../../core/widgets/states.dart';
import '../../../core/widgets/status_badge.dart';
import '../application/travel_desk_controllers.dart';
import '../data/transport_models.dart';

/// The vehicle fleet — list plus add / edit / retire.
class VehiclesScreen extends ConsumerWidget {
  const VehiclesScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final vehicles = ref.watch(vehiclesProvider);
    return Scaffold(
      floatingActionButton: ref.hasPermission(P.vehicleCreate)
          ? FloatingActionButton.extended(
              onPressed: () => _VehicleFormSheet.show(context, ref),
              icon: const Icon(Icons.add),
              label: const Text('Add vehicle'),
            )
          : null,
      body: PageBody(
        onRefresh: () async => ref.invalidate(vehiclesProvider),
        children: [
          const PageHeader(title: 'Vehicles', subtitle: 'The property fleet.'),
          gapSection,
          vehicles.when(
            loading: () => const ListSkeleton(rows: 4),
            error: (e, _) => ErrorState(
              error: e,
              onRetry: () => ref.invalidate(vehiclesProvider),
            ),
            data: (list) => list.isEmpty
                ? const EmptyState(
                    title: 'No vehicles yet',
                    hint: 'Add the cars and vans the desk can dispatch.',
                    icon: Icons.directions_car_outlined,
                  )
                : Column(
                    children: [
                      for (final v in list)
                        Padding(
                          padding: const EdgeInsets.only(bottom: Sp.md),
                          child: SoftCard(
                            onTap: ref.hasPermission(P.vehicleUpdate)
                                ? () => _VehicleFormSheet.show(
                                    context,
                                    ref,
                                    existing: v,
                                  )
                                : null,
                            child: Row(
                              children: [
                                Expanded(
                                  child: Column(
                                    crossAxisAlignment:
                                        CrossAxisAlignment.start,
                                    children: [
                                      Text(
                                        v.name,
                                        style: AppTypography.body(
                                          size: 14,
                                          weight: FontWeight.w700,
                                          color: context.colors.foreground,
                                        ),
                                      ),
                                      const SizedBox(height: 2),
                                      Text(
                                        '${v.plate} · ${v.seats} seats',
                                        style: AppTypography.body(
                                          size: 12.5,
                                          color: context.colors.mutedForeground,
                                        ),
                                      ),
                                    ],
                                  ),
                                ),
                                StatusBadge(
                                  tone: v.status.tone,
                                  label: v.status.label,
                                  dense: true,
                                ),
                              ],
                            ),
                          ),
                        ),
                    ],
                  ),
          ),
        ],
      ),
    );
  }
}

class _VehicleFormSheet extends ConsumerStatefulWidget {
  const _VehicleFormSheet({this.existing});
  final Vehicle? existing;

  static Future<void> show(
    BuildContext context,
    WidgetRef ref, {
    Vehicle? existing,
  }) => showModalBottomSheet<void>(
    context: context,
    isScrollControlled: true,
    showDragHandle: true,
    builder: (_) => _VehicleFormSheet(existing: existing),
  );

  @override
  ConsumerState<_VehicleFormSheet> createState() => _VehicleFormSheetState();
}

class _VehicleFormSheetState extends ConsumerState<_VehicleFormSheet> {
  final _form = GlobalKey<FormState>();
  late final TextEditingController _name;
  late final TextEditingController _plate;
  late final TextEditingController _seats;
  late VehicleStatus _status;
  bool _busy = false;
  String? _error;

  @override
  void initState() {
    super.initState();
    final e = widget.existing;
    _name = TextEditingController(text: e?.name ?? '');
    _plate = TextEditingController(text: e?.plate ?? '');
    _seats = TextEditingController(text: (e?.seats ?? 4).toString());
    _status = e?.status ?? VehicleStatus.available;
  }

  @override
  void dispose() {
    _name.dispose();
    _plate.dispose();
    _seats.dispose();
    super.dispose();
  }

  Future<void> _save() async {
    if (!_form.currentState!.validate()) return;
    setState(() {
      _busy = true;
      _error = null;
    });
    final body = <String, dynamic>{
      'name': _name.text.trim(),
      'plate': _plate.text.trim(),
      'seats': int.tryParse(_seats.text.trim()) ?? 4,
      'status': _status.wire,
    };
    final navigator = Navigator.of(context);
    try {
      final actions = ref.read(travelDeskActionsProvider);
      if (widget.existing == null) {
        await actions.createVehicle(body);
      } else {
        await actions.updateVehicle(widget.existing!.id, body);
      }
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
    return Padding(
      padding: EdgeInsets.only(
        left: Sp.lg,
        right: Sp.lg,
        top: Sp.md,
        bottom: MediaQuery.viewInsetsOf(context).bottom + Sp.lg,
      ),
      child: Form(
        key: _form,
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Text(
              widget.existing == null ? 'Add vehicle' : 'Edit vehicle',
              style: Theme.of(context).textTheme.titleMedium,
            ),
            const SizedBox(height: Sp.md),
            TextFormField(
              controller: _name,
              decoration: const InputDecoration(labelText: 'Name'),
              validator: (v) =>
                  (v == null || v.trim().isEmpty) ? 'Required' : null,
            ),
            const SizedBox(height: Sp.md),
            TextFormField(
              controller: _plate,
              decoration: const InputDecoration(labelText: 'Plate'),
              textCapitalization: TextCapitalization.characters,
              validator: (v) =>
                  (v == null || v.trim().isEmpty) ? 'Required' : null,
            ),
            const SizedBox(height: Sp.md),
            TextFormField(
              controller: _seats,
              decoration: const InputDecoration(labelText: 'Seats'),
              keyboardType: TextInputType.number,
            ),
            const SizedBox(height: Sp.md),
            DropdownButtonFormField<VehicleStatus>(
              initialValue: _status,
              decoration: const InputDecoration(labelText: 'Status'),
              items: [
                for (final s in VehicleStatus.values)
                  DropdownMenuItem(value: s, child: Text(s.label)),
              ],
              onChanged: (v) => setState(() => _status = v ?? _status),
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
              onPressed: _busy ? null : _save,
              child: _busy
                  ? const SizedBox(
                      height: 18,
                      width: 18,
                      child: CircularProgressIndicator(strokeWidth: 2),
                    )
                  : const Text('Save'),
            ),
          ],
        ),
      ),
    );
  }
}
