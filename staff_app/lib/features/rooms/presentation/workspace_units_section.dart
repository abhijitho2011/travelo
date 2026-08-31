import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
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
import '../application/rooms_controllers.dart';
import '../application/units_controllers.dart';
import '../data/room_models.dart';
import '../data/unit_models.dart';

/// **Physical units** (§8) and the **inventory summary** (§9).
///
/// The distinction this section exists to make: a room type is what a guest
/// books ("Deluxe King"); a unit is the door they walk through ("101"). The
/// header states it in as many words, because conflating the two is the single
/// most expensive mistake a new property can make in its inventory.
///
/// Nothing here is generated without the hotelier pressing a button — the
/// auto-generate sheet previews exactly what it will create and asks first.
class UnitsSection extends ConsumerWidget {
  const UnitsSection({super.key, required this.roomTypeId, this.draftName});

  /// Null while the room type is still being created — there is nothing to
  /// hang a unit on yet, so the section explains that instead.
  final String? roomTypeId;

  /// The name being typed upstairs, used in the explainer so the relationship
  /// reads with the hotelier's own words in it.
  final String? draftName;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final c = context.colors;
    final id = roomTypeId;

    return SoftCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Text(
            'Physical units',
            style: AppTypography.display(size: 15, color: c.foreground),
          ),
          const SizedBox(height: 2),
          Text(
            'Add the individual rooms or units that belong to this room type.',
            style: AppTypography.body(size: 11.5, color: c.mutedForeground),
          ),
          const SizedBox(height: Sp.lg),
          _Explainer(typeName: draftName),
          const SizedBox(height: Sp.lg),
          if (id == null) _NotYet() else _UnitsBody(roomTypeId: id),
        ],
      ),
    );
  }
}

/// The room-type-to-unit relationship, drawn rather than described.
class _Explainer extends StatelessWidget {
  const _Explainer({this.typeName});

  final String? typeName;

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    final name = (typeName == null || typeName!.trim().isEmpty)
        ? 'This room type'
        : typeName!.trim();

    return Container(
      padding: const EdgeInsets.all(Sp.md),
      decoration: BoxDecoration(color: c.accent, borderRadius: R.rMd),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(Icons.account_tree_outlined, size: 17, color: c.primary),
          const SizedBox(width: Sp.md),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  '$name is what a guest books.',
                  style: AppTypography.body(
                    size: 12.5,
                    weight: FontWeight.w600,
                    color: c.primary,
                  ),
                ),
                const SizedBox(height: 2),
                Text(
                  'Units — 101, 102, 103 — are the rooms it is fulfilled from. '
                  'Availability counts units, so a booking never sells the same '
                  'door twice.',
                  style: AppTypography.body(size: 11.5, color: c.primary),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _NotYet extends StatelessWidget {
  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    return Container(
      padding: const EdgeInsets.all(Sp.lg),
      decoration: BoxDecoration(
        color: c.muted,
        borderRadius: R.rMd,
        border: Border.all(color: c.border),
      ),
      child: Row(
        children: [
          Icon(Icons.save_outlined, size: 18, color: c.mutedForeground),
          const SizedBox(width: Sp.md),
          Expanded(
            child: Text(
              'Save the room type first — units are added to a saved type so '
              'they can never end up orphaned.',
              style: AppTypography.body(size: 12.5, color: c.mutedForeground),
            ),
          ),
        ],
      ),
    );
  }
}

class _UnitsBody extends ConsumerWidget {
  const _UnitsBody({required this.roomTypeId});

  final String roomTypeId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final units = ref.watch(unitsOfTypeProvider(roomTypeId));
    final inventory = ref.watch(unitInventoryProvider(roomTypeId));

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        inventory.maybeWhen(
          data: (i) => _InventorySummary(inventory: i),
          orElse: () => const SizedBox.shrink(),
        ),
        const SizedBox(height: Sp.lg),
        units.when(
          loading: () => const ListSkeleton(rows: 2, height: 44),
          error: (e, _) => ErrorState(
            error: e,
            onRetry: () => ref.invalidate(unitsOfTypeProvider(roomTypeId)),
          ),
          data: (rows) => rows.isEmpty
              ? _emptyUnits(context)
              : _UnitsTable(roomTypeId: roomTypeId, units: rows),
        ),
        const SizedBox(height: Sp.md),
        Wrap(
          spacing: Sp.sm,
          runSpacing: Sp.sm,
          children: [
            PermissionGate(
              permission: P.roomCreate,
              child: OutlinedButton.icon(
                onPressed: () => _addUnit(context, ref),
                icon: const Icon(Icons.add, size: 16),
                label: const Text('Add unit'),
              ),
            ),
            PermissionGate(
              permission: P.roomCreate,
              child: OutlinedButton.icon(
                onPressed: () => _autoGenerate(context, ref),
                icon: const Icon(Icons.auto_awesome_motion_outlined, size: 16),
                label: const Text('Auto generate units'),
              ),
            ),
          ],
        ),
      ],
    );
  }

  Widget _emptyUnits(BuildContext context) {
    final c = context.colors;
    return Container(
      padding: const EdgeInsets.symmetric(vertical: Sp.lg),
      alignment: Alignment.center,
      child: Text(
        'No units yet. Add them one at a time, or generate a numbered range.',
        textAlign: TextAlign.center,
        style: AppTypography.body(size: 12.5, color: c.mutedForeground),
      ),
    );
  }

  Future<void> _addUnit(BuildContext context, WidgetRef ref) async {
    final result = await showModalBottomSheet<_UnitFormResult>(
      context: context,
      isScrollControlled: true,
      showDragHandle: true,
      builder: (_) => const _UnitFormSheet(),
    );
    if (result == null) return;
    if (!context.mounted) return;

    final messenger = ScaffoldMessenger.of(context);
    try {
      await ref
          .read(roomActionsProvider)
          .create(
            NewRoom(
              roomTypeId: roomTypeId,
              number: result.number,
              floor: result.floor,
              status: result.status,
              notes: result.notes,
            ),
          );
      ref.invalidate(unitsOfTypeProvider(roomTypeId));
      messenger.showSnackBar(
        SnackBar(content: Text('Unit ${result.number} added')),
      );
    } on ApiException catch (e) {
      messenger.showSnackBar(SnackBar(content: Text(_friendly(e))));
    }
  }

  Future<void> _autoGenerate(BuildContext context, WidgetRef ref) async {
    final request = await showModalBottomSheet<BulkRoomRequest>(
      context: context,
      isScrollControlled: true,
      showDragHandle: true,
      builder: (_) => _AutoGenerateSheet(roomTypeId: roomTypeId),
    );
    if (request == null) return;
    if (!context.mounted) return;

    final messenger = ScaffoldMessenger.of(context);
    try {
      final result = await ref.read(roomActionsProvider).createMany(request);
      ref.invalidate(unitsOfTypeProvider(roomTypeId));
      messenger.showSnackBar(
        SnackBar(
          content: Text(
            '${result.created} '
            '${result.created == 1 ? 'unit' : 'units'} created'
            '${result.skipped.isEmpty ? '' : ' · ${result.skipped.length} already existed'}',
          ),
        ),
      );
    } on ApiException catch (e) {
      messenger.showSnackBar(SnackBar(content: Text(_friendly(e))));
    }
  }

  static String _friendly(ApiException e) => switch (e.code) {
    'ROOM_NUMBER_TAKEN' =>
      'That unit number is already used somewhere in this property.',
    _ => e.message,
  };
}

/// §9. The live counts behind this type, from the same rows the table shows.
class _InventorySummary extends StatelessWidget {
  const _InventorySummary({required this.inventory});

  final UnitInventory inventory;

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    final tiles = <({String label, int value, Color tone})>[
      (label: 'Total units', value: inventory.total, tone: c.foreground),
      (label: 'Available', value: inventory.available, tone: c.healthy),
      (label: 'Occupied', value: inventory.occupied, tone: c.stOccupied),
      (label: 'Blocked', value: inventory.blocked, tone: c.warning),
      (
        label: 'Out of service',
        value: inventory.outOfService,
        tone: c.critical,
      ),
    ];

    return Wrap(
      spacing: Sp.sm,
      runSpacing: Sp.sm,
      children: [
        for (final tile in tiles)
          Container(
            width: 118,
            padding: const EdgeInsets.symmetric(
              horizontal: Sp.md,
              vertical: Sp.sm,
            ),
            decoration: BoxDecoration(
              color: c.surface,
              borderRadius: R.rMd,
              border: Border.all(color: c.border),
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  '${tile.value}',
                  style: AppTypography.display(size: 20, color: tile.tone),
                ),
                Text(
                  tile.label,
                  style: AppTypography.labelXs(c.mutedForeground),
                ),
              ],
            ),
          ),
      ],
    );
  }
}

class _UnitsTable extends ConsumerWidget {
  const _UnitsTable({required this.roomTypeId, required this.units});

  final String roomTypeId;
  final List<Room> units;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final c = context.colors;
    return Container(
      clipBehavior: Clip.antiAlias,
      decoration: BoxDecoration(
        borderRadius: R.rMd,
        border: Border.all(color: c.border),
      ),
      child: Column(
        children: [
          Container(
            height: 34,
            padding: const EdgeInsets.symmetric(horizontal: Sp.md),
            color: c.surface,
            child: Row(
              children: [
                SizedBox(
                  width: 78,
                  child: Text(
                    'Unit',
                    style: AppTypography.labelXs(c.mutedForeground),
                  ),
                ),
                SizedBox(
                  width: 66,
                  child: Text(
                    'Floor',
                    style: AppTypography.labelXs(c.mutedForeground),
                  ),
                ),
                Expanded(
                  child: Text(
                    'Status',
                    style: AppTypography.labelXs(c.mutedForeground),
                  ),
                ),
                const SizedBox(width: 40),
              ],
            ),
          ),
          for (final unit in units)
            _UnitRow(roomTypeId: roomTypeId, unit: unit),
        ],
      ),
    );
  }
}

class _UnitRow extends ConsumerWidget {
  const _UnitRow({required this.roomTypeId, required this.unit});

  final String roomTypeId;
  final Room unit;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final c = context.colors;
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: Sp.md, vertical: Sp.sm),
      decoration: BoxDecoration(
        border: Border(top: BorderSide(color: c.border.withValues(alpha: 0.7))),
      ),
      child: Row(
        children: [
          SizedBox(
            width: 78,
            child: Text(
              unit.number,
              style: AppTypography.body(
                size: 13,
                weight: FontWeight.w600,
                color: c.foreground,
              ),
            ),
          ),
          SizedBox(
            width: 66,
            child: Text(
              unit.floor?.toString() ?? '—',
              style: AppTypography.body(size: 12.5, color: c.mutedForeground),
            ),
          ),
          Expanded(
            child: Row(
              children: [
                StatusBadge(label: unit.status.label, tone: unit.status.tone),
                if (unit.notes != null && unit.notes!.isNotEmpty) ...[
                  const SizedBox(width: Sp.sm),
                  Flexible(
                    child: Text(
                      unit.notes!,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: AppTypography.body(
                        size: 11.5,
                        color: c.mutedForeground,
                      ),
                    ),
                  ),
                ],
              ],
            ),
          ),
          SizedBox(
            width: 40,
            child: PopupMenuButton<String>(
              tooltip: 'Unit actions',
              icon: Icon(Icons.more_vert, size: 17, color: c.mutedForeground),
              onSelected: (action) => _run(context, ref, action),
              itemBuilder: (_) => const [
                PopupMenuItem(value: 'edit', child: Text('Edit')),
                PopupMenuItem(value: 'delete', child: Text('Remove')),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Future<void> _run(BuildContext context, WidgetRef ref, String action) async {
    final messenger = ScaffoldMessenger.of(context);
    if (action == 'edit') {
      final result = await showModalBottomSheet<_UnitFormResult>(
        context: context,
        isScrollControlled: true,
        showDragHandle: true,
        builder: (_) => _UnitFormSheet(unit: unit),
      );
      if (result == null) return;
      try {
        await ref.read(roomActionsProvider).update(unit.id, {
          'number': result.number,
          'floor': result.floor,
          'status': result.status?.wire,
          'notes': result.notes,
        });
        ref.invalidate(unitsOfTypeProvider(roomTypeId));
        messenger.showSnackBar(
          SnackBar(content: Text('Unit ${result.number} updated')),
        );
      } on ApiException catch (e) {
        messenger.showSnackBar(SnackBar(content: Text(e.message)));
      }
      return;
    }

    final ok = await showDialog<bool>(
      context: context,
      builder: (dialogContext) => AlertDialog(
        title: Text('Remove unit ${unit.number}?'),
        content: const Text(
          'The unit stops being sellable. A unit with reservations on it '
          'cannot be removed.',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(dialogContext, false),
            child: const Text('Cancel'),
          ),
          FilledButton(
            onPressed: () => Navigator.pop(dialogContext, true),
            child: const Text('Remove'),
          ),
        ],
      ),
    );
    if (ok != true) return;
    try {
      await ref.read(roomActionsProvider).remove(unit.id);
      ref.invalidate(unitsOfTypeProvider(roomTypeId));
      messenger.showSnackBar(
        SnackBar(content: Text('Unit ${unit.number} removed')),
      );
    } on ApiException catch (e) {
      messenger.showSnackBar(SnackBar(content: Text(e.message)));
    }
  }
}

/// What the add/edit sheet hands back.
class _UnitFormResult {
  const _UnitFormResult({
    required this.number,
    this.floor,
    this.status,
    this.notes,
  });

  final String number;
  final int? floor;
  final RoomStatus? status;
  final String? notes;
}

class _UnitFormSheet extends StatefulWidget {
  const _UnitFormSheet({this.unit});

  final Room? unit;

  @override
  State<_UnitFormSheet> createState() => _UnitFormSheetState();
}

class _UnitFormSheetState extends State<_UnitFormSheet> {
  late final TextEditingController _number = TextEditingController(
    text: widget.unit?.number ?? '',
  );
  late final TextEditingController _floor = TextEditingController(
    text: widget.unit?.floor?.toString() ?? '',
  );
  late final TextEditingController _notes = TextEditingController(
    text: widget.unit?.notes ?? '',
  );
  late RoomStatus _status = widget.unit?.status ?? RoomStatus.available;
  String? _error;

  /// The three states a hotelier sets by hand. Everything else on the board —
  /// dirty, cleaning, occupied — is set by the operation itself, so offering
  /// them here would invite someone to lie about a room.
  static const _settable = [
    RoomStatus.available,
    RoomStatus.outOfOrder,
    RoomStatus.maintenance,
  ];

  @override
  void dispose() {
    _number.dispose();
    _floor.dispose();
    _notes.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    return SafeArea(
      child: Padding(
        padding: EdgeInsets.fromLTRB(
          Sp.lg,
          0,
          Sp.lg,
          MediaQuery.viewInsetsOf(context).bottom + Sp.lg,
        ),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Text(
              widget.unit == null
                  ? 'Add unit'
                  : 'Edit unit ${widget.unit!.number}',
              style: AppTypography.display(size: 16, color: c.foreground),
            ),
            const SizedBox(height: Sp.lg),
            TextField(
              controller: _number,
              autofocus: widget.unit == null,
              decoration: const InputDecoration(
                labelText: 'Unit number',
                hintText: '101',
              ),
            ),
            const SizedBox(height: Sp.md),
            TextField(
              controller: _floor,
              keyboardType: TextInputType.number,
              inputFormatters: [FilteringTextInputFormatter.digitsOnly],
              decoration: const InputDecoration(
                labelText: 'Floor',
                hintText: '1',
              ),
            ),
            const SizedBox(height: Sp.md),
            DropdownButtonFormField<RoomStatus>(
              initialValue: _settable.contains(_status)
                  ? _status
                  : RoomStatus.available,
              decoration: const InputDecoration(labelText: 'Status'),
              items: [
                for (final s in _settable)
                  DropdownMenuItem(value: s, child: Text(s.label)),
              ],
              onChanged: (s) =>
                  setState(() => _status = s ?? RoomStatus.available),
            ),
            const SizedBox(height: Sp.md),
            TextField(
              controller: _notes,
              maxLines: 2,
              decoration: const InputDecoration(
                labelText: 'Notes',
                hintText: 'Maintenance until Friday',
              ),
            ),
            if (_error != null) ...[
              const SizedBox(height: Sp.sm),
              Text(
                _error!,
                style: AppTypography.body(size: 12, color: c.destructive),
              ),
            ],
            const SizedBox(height: Sp.lg),
            FilledButton(
              onPressed: () {
                final number = _number.text.trim();
                if (number.isEmpty) {
                  setState(() => _error = 'A unit needs a number.');
                  return;
                }
                Navigator.pop(
                  context,
                  _UnitFormResult(
                    number: number,
                    floor: int.tryParse(_floor.text.trim()),
                    status: _status,
                    notes: _notes.text.trim().isEmpty
                        ? null
                        : _notes.text.trim(),
                  ),
                );
              },
              child: Text(widget.unit == null ? 'Add unit' : 'Save unit'),
            ),
          ],
        ),
      ),
    );
  }
}

/// Generates a numbered range, previewing the exact list before it commits —
/// §8's rule that nothing is created without confirmation.
class _AutoGenerateSheet extends StatefulWidget {
  const _AutoGenerateSheet({required this.roomTypeId});

  final String roomTypeId;

  @override
  State<_AutoGenerateSheet> createState() => _AutoGenerateSheetState();
}

class _AutoGenerateSheetState extends State<_AutoGenerateSheet> {
  final _prefix = TextEditingController();
  final _from = TextEditingController(text: '101');
  final _to = TextEditingController(text: '110');
  final _floor = TextEditingController();
  String? _error;

  @override
  void dispose() {
    _prefix.dispose();
    _from.dispose();
    _to.dispose();
    _floor.dispose();
    super.dispose();
  }

  /// What will be created, exactly — capped in the preview so a fat-fingered
  /// range does not render ten thousand chips.
  List<String> get _preview {
    final from = int.tryParse(_from.text.trim());
    final to = int.tryParse(_to.text.trim());
    if (from == null || to == null || to < from) return const [];
    final prefix = _prefix.text.trim();
    return [for (var n = from; n <= to && n - from < 40; n++) '$prefix$n'];
  }

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    final from = int.tryParse(_from.text.trim());
    final to = int.tryParse(_to.text.trim());
    final count = (from != null && to != null && to >= from)
        ? to - from + 1
        : 0;

    return SafeArea(
      child: Padding(
        padding: EdgeInsets.fromLTRB(
          Sp.lg,
          0,
          Sp.lg,
          MediaQuery.viewInsetsOf(context).bottom + Sp.lg,
        ),
        child: SingleChildScrollView(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Text(
                'Auto generate units',
                style: AppTypography.display(size: 16, color: c.foreground),
              ),
              const SizedBox(height: 2),
              Text(
                'Creates one unit per number in the range. Numbers that already '
                'exist are skipped, never overwritten.',
                style: AppTypography.body(size: 11.5, color: c.mutedForeground),
              ),
              const SizedBox(height: Sp.lg),
              Row(
                children: [
                  Expanded(
                    child: TextField(
                      controller: _prefix,
                      decoration: const InputDecoration(
                        labelText: 'Prefix',
                        hintText: 'A-',
                      ),
                      onChanged: (_) => setState(() {}),
                    ),
                  ),
                  const SizedBox(width: Sp.sm),
                  Expanded(
                    child: TextField(
                      controller: _from,
                      keyboardType: TextInputType.number,
                      inputFormatters: [FilteringTextInputFormatter.digitsOnly],
                      decoration: const InputDecoration(labelText: 'Start'),
                      onChanged: (_) => setState(() {}),
                    ),
                  ),
                  const SizedBox(width: Sp.sm),
                  Expanded(
                    child: TextField(
                      controller: _to,
                      keyboardType: TextInputType.number,
                      inputFormatters: [FilteringTextInputFormatter.digitsOnly],
                      decoration: const InputDecoration(labelText: 'End'),
                      onChanged: (_) => setState(() {}),
                    ),
                  ),
                ],
              ),
              const SizedBox(height: Sp.md),
              TextField(
                controller: _floor,
                keyboardType: TextInputType.number,
                inputFormatters: [FilteringTextInputFormatter.digitsOnly],
                decoration: const InputDecoration(
                  labelText: 'Floor (optional)',
                  hintText: '1',
                ),
              ),
              const SizedBox(height: Sp.lg),
              if (_preview.isNotEmpty) ...[
                Text(
                  'Will create $count '
                  '${count == 1 ? 'unit' : 'units'}',
                  style: AppTypography.body(
                    size: 12.5,
                    weight: FontWeight.w600,
                    color: c.foreground,
                  ),
                ),
                const SizedBox(height: Sp.sm),
                Wrap(
                  spacing: 6,
                  runSpacing: 6,
                  children: [
                    for (final number in _preview)
                      Container(
                        padding: const EdgeInsets.symmetric(
                          horizontal: 8,
                          vertical: 3,
                        ),
                        decoration: BoxDecoration(
                          color: c.muted,
                          borderRadius: R.rSm,
                          border: Border.all(color: c.border),
                        ),
                        child: Text(
                          number,
                          style: AppTypography.body(
                            size: 11.5,
                            color: c.foreground,
                          ),
                        ),
                      ),
                    if (count > _preview.length)
                      Text(
                        '+${count - _preview.length} more',
                        style: AppTypography.body(
                          size: 11.5,
                          color: c.mutedForeground,
                        ),
                      ),
                  ],
                ),
              ],
              if (_error != null) ...[
                const SizedBox(height: Sp.sm),
                Text(
                  _error!,
                  style: AppTypography.body(size: 12, color: c.destructive),
                ),
              ],
              const SizedBox(height: Sp.lg),
              FilledButton(
                onPressed: count == 0
                    ? null
                    : () {
                        if (count > 200) {
                          setState(
                            () => _error =
                                'That is $count units in one go. Generate at '
                                'most 200 at a time.',
                          );
                          return;
                        }
                        Navigator.pop(
                          context,
                          BulkRoomRequest.range(
                            roomTypeId: widget.roomTypeId,
                            from: int.parse(_from.text.trim()),
                            to: int.parse(_to.text.trim()),
                            prefix: _prefix.text.trim().isEmpty
                                ? null
                                : _prefix.text.trim(),
                            floor: int.tryParse(_floor.text.trim()),
                          ),
                        );
                      },
                child: Text(count == 0 ? 'Set a range' : 'Create $count units'),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
