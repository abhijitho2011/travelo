import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/networking/api_exception.dart';
import '../../../core/permissions/permission_gate.dart';
import '../../../core/permissions/permission_keys.dart';
import '../../../core/routing/routes.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/theme/app_spacing.dart';
import '../../../core/widgets/primitives.dart';
import '../../../core/widgets/states.dart';
import '../application/rooms_controllers.dart';
import '../data/room_models.dart';
import '../data/rooms_repository.dart';
import 'room_widgets.dart';

/// Resolves `/room-types/:id` into the record the form edits. Without an id it
/// goes straight to the create form, so there is one layout, not two.
class RoomTypeFormScreen extends ConsumerWidget {
  const RoomTypeFormScreen({super.key, this.roomTypeId});

  final String? roomTypeId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final id = roomTypeId;
    if (id == null || id.isEmpty) return const RoomTypeForm();

    return ref
        .watch(roomTypeDetailProvider(id))
        .when(
          loading: () => const PageBody(children: [ListSkeleton(rows: 3)]),
          error: (error, _) => PageBody(
            children: [
              ErrorState(
                error: error,
                onRetry: () => ref.invalidate(roomTypeDetailProvider(id)),
              ),
            ],
          ),
          data: (type) => type == null
              ? PageBody(
                  children: [
                    EmptyState(
                      title: 'That room type is gone',
                      hint:
                          'It may have been removed since this screen was '
                          'opened.',
                      icon: Icons.bed_outlined,
                      action: OutlinedButton(
                        onPressed: () => context.go(Routes.roomTypes),
                        child: const Text('Back to room types'),
                      ),
                    ),
                  ],
                )
              : RoomTypeForm(existing: type),
        );
  }
}

/// Create and edit in one widget.
///
/// Passing [existing] switches it into edit mode: the fields arrive pre-filled
/// and saving sends a PATCH carrying ONLY what actually changed, so a field
/// nobody touched is never rewritten with a value this form happened to hold.
class RoomTypeForm extends ConsumerStatefulWidget {
  const RoomTypeForm({super.key, this.existing});

  final RoomType? existing;

  bool get isEdit => existing != null;

  @override
  ConsumerState<RoomTypeForm> createState() => _RoomTypeFormState();
}

class _RoomTypeFormState extends ConsumerState<RoomTypeForm> {
  final _formKey = GlobalKey<FormState>();

  late final TextEditingController _name;
  late final TextEditingController _description;
  late final TextEditingController _bedCount;
  late final TextEditingController _maxOccupancy;
  late final TextEditingController _maxAdults;
  late final TextEditingController _maxChildren;
  late final TextEditingController _baseRate;
  late final TextEditingController _sizeSqft;

  late BedType _bedType;
  late bool _airConditioned;
  late RoomTypeStatus _status;
  late Set<String> _amenityIds;

  bool _busy = false;
  String? _submitError;

  @override
  void initState() {
    super.initState();
    final e = widget.existing;
    _name = TextEditingController(text: e?.name ?? '');
    _description = TextEditingController(text: e?.description ?? '');
    _bedCount = TextEditingController(text: '${e?.bedCount ?? 1}');
    _maxOccupancy = TextEditingController(text: '${e?.maxOccupancy ?? 2}');
    _maxAdults = TextEditingController(text: '${e?.maxAdults ?? 2}');
    _maxChildren = TextEditingController(text: '${e?.maxChildren ?? 0}');
    _baseRate = TextEditingController(
      text: e == null ? '' : paiseToRupeeInput(e.baseRate),
    );
    _sizeSqft = TextEditingController(text: e?.sizeSqft?.toString() ?? '');
    _bedType = e?.bedType ?? BedType.doubleBed;
    _airConditioned = e?.airConditioned ?? false;
    _status = e?.status ?? RoomTypeStatus.active;
    _amenityIds = e?.amenityIds ?? <String>{};
  }

  @override
  void dispose() {
    for (final controller in [
      _name,
      _description,
      _bedCount,
      _maxOccupancy,
      _maxAdults,
      _maxChildren,
      _baseRate,
      _sizeSqft,
    ]) {
      controller.dispose();
    }
    super.dispose();
  }

  int _numberIn(TextEditingController controller, int fallback) =>
      int.tryParse(controller.text.trim()) ?? fallback;

  /// Only the keys whose value differs from the stored record. An empty result
  /// means there is nothing to save, and the form says so instead of sending a
  /// PATCH the server would reject with NOTHING_TO_UPDATE.
  Map<String, dynamic> _changedFields(RoomType e) {
    final body = <String, dynamic>{};

    void putText(String key, String next, String? previous) {
      if (next != (previous ?? '')) body[key] = next;
    }

    void putInt(String key, int next, int previous) {
      if (next != previous) body[key] = next;
    }

    putText('name', _name.text.trim(), e.name);
    putText('description', _description.text.trim(), e.description);
    if (_bedType != e.bedType) body['bedType'] = _bedType.wire;
    putInt('bedCount', _numberIn(_bedCount, e.bedCount), e.bedCount);
    putInt(
      'maxOccupancy',
      _numberIn(_maxOccupancy, e.maxOccupancy),
      e.maxOccupancy,
    );
    putInt('maxAdults', _numberIn(_maxAdults, e.maxAdults), e.maxAdults);
    putInt('maxChildren', _numberIn(_maxChildren, e.maxChildren), e.maxChildren);
    if (_airConditioned != e.airConditioned) {
      body['airConditioned'] = _airConditioned;
    }
    final paise = rupeesToPaise(_baseRate.text);
    if (paise != e.baseRate) body['baseRate'] = paise;
    final sqft = int.tryParse(_sizeSqft.text.trim());
    if (sqft != e.sizeSqft) body['sizeSqft'] = sqft;
    if (_status != e.status) body['status'] = _status.wire;
    if (!setEquals(_amenityIds, e.amenityIds)) {
      body['amenityIds'] = _amenityIds.toList();
    }
    return body;
  }

  Future<void> _submit() async {
    setState(() => _submitError = null);
    if (!(_formKey.currentState?.validate() ?? false)) return;

    final occupancy = _numberIn(_maxOccupancy, 0);
    if (_numberIn(_maxAdults, 0) > occupancy) {
      setState(
        () => _submitError =
            'The number of adults cannot be more than the maximum occupancy.',
      );
      return;
    }

    final existing = widget.existing;
    setState(() => _busy = true);
    final messenger = ScaffoldMessenger.of(context);
    final router = GoRouter.of(context);
    try {
      if (existing == null) {
        await ref
            .read(roomTypeActionsProvider)
            .create(
              NewRoomType(
                name: _name.text.trim(),
                description: _description.text.trim(),
                bedType: _bedType,
                bedCount: _numberIn(_bedCount, 1),
                maxOccupancy: occupancy,
                maxAdults: _numberIn(_maxAdults, 1),
                maxChildren: _numberIn(_maxChildren, 0),
                airConditioned: _airConditioned,
                baseRate: rupeesToPaise(_baseRate.text),
                sizeSqft: int.tryParse(_sizeSqft.text.trim()),
                amenityIds: _amenityIds.toList(),
              ),
            );
      } else {
        final body = _changedFields(existing);
        if (body.isEmpty) {
          setState(() {
            _busy = false;
            _submitError = 'Nothing has changed yet.';
          });
          return;
        }
        await ref.read(roomTypeActionsProvider).update(existing.id, body);
      }
      messenger.showSnackBar(
        SnackBar(
          content: Text(
            existing == null
                ? '${_name.text.trim()} added'
                : 'Changes to ${_name.text.trim()} saved',
          ),
        ),
      );
      router.go(Routes.roomTypes);
    } on ApiException catch (e) {
      if (mounted) setState(() => _submitError = RoomErrors.friendly(e));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    final isEdit = widget.isEdit;

    return PageBody(
      children: [
        Align(
          alignment: Alignment.centerLeft,
          child: TextButton.icon(
            onPressed: () => context.go(Routes.roomTypes),
            icon: const Icon(Icons.arrow_back, size: 16),
            label: const Text('Room types'),
          ),
        ),
        PageHeader(
          eyebrow: 'Rooms',
          title: isEdit ? 'Edit room type' : 'Add a room type',
          subtitle: isEdit
              ? 'Changes apply to every room of this type, including the ones '
                    'already sold tonight.'
              : 'Describe the category once; every room you put on it inherits '
                    'these settings.',
        ),
        gapSection,

        Form(
          key: _formKey,
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              SoftCard(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    const LabelXs('The basics'),
                    const SizedBox(height: Sp.md),
                    TextFormField(
                      controller: _name,
                      textCapitalization: TextCapitalization.words,
                      decoration: const InputDecoration(
                        labelText: 'Name',
                        hintText: 'Deluxe Double',
                        prefixIcon: Icon(Icons.bed_outlined, size: 20),
                      ),
                      validator: (v) =>
                          (v ?? '').trim().isEmpty ? 'Required' : null,
                    ),
                    gapMd,
                    TextFormField(
                      controller: _description,
                      maxLines: 3,
                      minLines: 2,
                      textCapitalization: TextCapitalization.sentences,
                      decoration: const InputDecoration(
                        labelText: 'Description (optional)',
                        hintText:
                            'What a guest gets — the view, the layout, '
                            'anything that sets it apart.',
                        alignLabelWithHint: true,
                      ),
                    ),
                  ],
                ),
              ),
              gapMd,

              SoftCard(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    const LabelXs('Beds and occupancy'),
                    const SizedBox(height: Sp.md),
                    Row(
                      children: [
                        Expanded(
                          flex: 3,
                          child: DropdownButtonFormField<BedType>(
                            initialValue: _bedType,
                            isExpanded: true,
                            decoration: const InputDecoration(
                              labelText: 'Bed type',
                            ),
                            items: [
                              for (final bed in BedType.values)
                                DropdownMenuItem(
                                  value: bed,
                                  child: Text(bed.label),
                                ),
                            ],
                            onChanged: (bed) => setState(
                              () => _bedType = bed ?? _bedType,
                            ),
                          ),
                        ),
                        const SizedBox(width: Sp.md),
                        Expanded(
                          flex: 2,
                          child: _CountField(
                            controller: _bedCount,
                            label: 'Beds',
                            minimum: 1,
                          ),
                        ),
                      ],
                    ),
                    gapMd,
                    _CountField(
                      controller: _maxOccupancy,
                      label: 'Maximum occupancy',
                      minimum: 1,
                      icon: Icons.people_outline,
                    ),
                    gapMd,
                    Row(
                      children: [
                        Expanded(
                          child: _CountField(
                            controller: _maxAdults,
                            label: 'Max adults',
                            minimum: 1,
                          ),
                        ),
                        const SizedBox(width: Sp.md),
                        Expanded(
                          child: _CountField(
                            controller: _maxChildren,
                            label: 'Max children',
                            minimum: 0,
                          ),
                        ),
                      ],
                    ),
                  ],
                ),
              ),
              gapMd,

              SoftCard(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    const LabelXs('Comfort'),
                    const SizedBox(height: Sp.sm),
                    SwitchListTile.adaptive(
                      contentPadding: EdgeInsets.zero,
                      value: _airConditioned,
                      onChanged: (value) =>
                          setState(() => _airConditioned = value),
                      secondary: Icon(
                        _airConditioned ? Icons.ac_unit : Icons.air_outlined,
                        size: 20,
                        color: _airConditioned
                            ? c.stInspected
                            : c.mutedForeground,
                      ),
                      title: const Text('Air-conditioned'),
                    ),
                    const FieldNote(
                      text:
                          'Air conditioning belongs to the room type itself, '
                          'not to the amenity list — it decides how the room is '
                          'rated and sold, and every room of this type inherits '
                          'it. That is why you will not find it among the '
                          'amenities below.',
                    ),
                    const SizedBox(height: Sp.lg),
                    const LabelXs('Amenities'),
                    const SizedBox(height: 6),
                    const FieldNote(
                      text:
                          'Everything a room of this type comes with. Rooms can '
                          'add extras of their own on top.',
                    ),
                    const SizedBox(height: Sp.md),
                    AmenityPicker(
                      selected: _amenityIds,
                      onChanged: (next) => setState(() => _amenityIds = next),
                    ),
                  ],
                ),
              ),
              gapMd,

              SoftCard(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    const LabelXs('Rate and size'),
                    const SizedBox(height: Sp.md),
                    TextFormField(
                      controller: _baseRate,
                      keyboardType: const TextInputType.numberWithOptions(
                        decimal: true,
                      ),
                      inputFormatters: [
                        FilteringTextInputFormatter.allow(
                          RegExp(r'[0-9.]'),
                        ),
                      ],
                      decoration: const InputDecoration(
                        labelText: 'Base rate per night',
                        prefixText: '₹ ',
                        helperText: 'Before taxes and any seasonal pricing.',
                      ),
                      validator: (v) {
                        final text = (v ?? '').trim();
                        if (text.isEmpty) return 'Required';
                        final rupees = double.tryParse(text);
                        if (rupees == null) return 'Enter an amount in rupees';
                        if (rupees < 0) return 'A rate cannot be negative';
                        return null;
                      },
                    ),
                    gapMd,
                    TextFormField(
                      controller: _sizeSqft,
                      keyboardType: TextInputType.number,
                      inputFormatters: [FilteringTextInputFormatter.digitsOnly],
                      decoration: const InputDecoration(
                        labelText: 'Size (optional)',
                        suffixText: 'sq ft',
                        prefixIcon: Icon(Icons.straighten_outlined, size: 20),
                      ),
                    ),
                    if (isEdit) ...[
                      gapMd,
                      DropdownButtonFormField<RoomTypeStatus>(
                        initialValue: _status,
                        isExpanded: true,
                        decoration: const InputDecoration(
                          labelText: 'Status',
                        ),
                        items: [
                          for (final status in RoomTypeStatus.values)
                            DropdownMenuItem(
                              value: status,
                              child: Text(status.label),
                            ),
                        ],
                        onChanged: (status) =>
                            setState(() => _status = status ?? _status),
                      ),
                      const SizedBox(height: Sp.sm),
                      const FieldNote(
                        text:
                            'Archiving takes the type out of new bookings and '
                            'leaves every existing room and stay exactly as it '
                            'is. It is the safe alternative to deleting.',
                      ),
                    ],
                  ],
                ),
              ),

              if (_submitError != null) ...[
                gapMd,
                FormErrorNote(message: _submitError!),
              ],

              gapSection,
              // The guard lets anyone with `room.read` reach this path, so the
              // button asks for the permission the write actually needs.
              PermissionGate(
                permission: isEdit ? P.roomTypeUpdate : P.roomTypeCreate,
                fallback: const PermissionNote(
                  text:
                      'You can see this room type, but your role cannot change '
                      'it. Ask a General Manager or Assistant General Manager.',
                ),
                child: FilledButton(
                  onPressed: _busy ? null : _submit,
                  child: _busy
                      ? const SizedBox(
                          width: 18,
                          height: 18,
                          child: CircularProgressIndicator(strokeWidth: 2),
                        )
                      : Text(isEdit ? 'Save changes' : 'Add room type'),
                ),
              ),
            ],
          ),
        ),
      ],
    );
  }
}

/// A whole-number field with a floor, used for beds and heads.
class _CountField extends StatelessWidget {
  const _CountField({
    required this.controller,
    required this.label,
    required this.minimum,
    this.icon,
  });

  final TextEditingController controller;
  final String label;
  final int minimum;
  final IconData? icon;

  @override
  Widget build(BuildContext context) {
    return TextFormField(
      controller: controller,
      keyboardType: TextInputType.number,
      inputFormatters: [FilteringTextInputFormatter.digitsOnly],
      decoration: InputDecoration(
        labelText: label,
        prefixIcon: icon == null ? null : Icon(icon, size: 20),
      ),
      validator: (v) {
        final value = int.tryParse((v ?? '').trim());
        if (value == null) return 'Required';
        if (value < minimum) return 'At least $minimum';
        return null;
      },
    );
  }
}
