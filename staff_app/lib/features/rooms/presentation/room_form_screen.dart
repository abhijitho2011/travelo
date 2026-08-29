import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/networking/api_exception.dart';
import '../../../core/permissions/permission_gate.dart';
import '../../../core/permissions/permission_keys.dart';
import '../../../core/routing/routes.dart';
import '../../../core/theme/app_spacing.dart';
import '../../../core/widgets/primitives.dart';
import '../../../core/widgets/states.dart';
import '../application/rooms_controllers.dart';
import '../data/room_models.dart';
import '../data/rooms_repository.dart';
import 'room_widgets.dart';

/// Resolves `/rooms/:id` into the record the form edits. Without an id it goes
/// straight to the create form.
class RoomFormScreen extends ConsumerWidget {
  const RoomFormScreen({super.key, this.roomId});

  final String? roomId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final id = roomId;
    if (id == null || id.isEmpty) return const RoomForm();

    return ref
        .watch(roomDetailProvider(id))
        .when(
          loading: () => const PageBody(children: [ListSkeleton(rows: 3)]),
          error: (error, _) => PageBody(
            children: [
              ErrorState(
                error: error,
                onRetry: () => ref.invalidate(roomDetailProvider(id)),
              ),
            ],
          ),
          data: (room) => room == null
              ? PageBody(
                  children: [
                    EmptyState(
                      title: 'That room is gone',
                      hint:
                          'It may have been removed since this screen was '
                          'opened.',
                      icon: Icons.meeting_room_outlined,
                      action: OutlinedButton(
                        onPressed: () => context.go(Routes.rooms),
                        child: const Text('Back to rooms'),
                      ),
                    ),
                  ],
                )
              : RoomForm(existing: room),
        );
  }
}

/// One room, created or edited.
///
/// On edit the PATCH carries only what changed, and the amenity picker offers
/// only extras: what the room type provides is shown but not editable here,
/// because unticking it would promise something this endpoint cannot do.
class RoomForm extends ConsumerStatefulWidget {
  const RoomForm({super.key, this.existing});

  final Room? existing;

  bool get isEdit => existing != null;

  @override
  ConsumerState<RoomForm> createState() => _RoomFormState();
}

class _RoomFormState extends ConsumerState<RoomForm> {
  final _formKey = GlobalKey<FormState>();

  late final TextEditingController _number;
  late final TextEditingController _floor;
  late final TextEditingController _notes;

  String? _roomTypeId;
  late RoomStatus _status;
  late Set<String> _amenityIds;

  bool _busy = false;
  String? _submitError;

  @override
  void initState() {
    super.initState();
    final e = widget.existing;
    _number = TextEditingController(text: e?.number ?? '');
    _floor = TextEditingController(text: e?.floor?.toString() ?? '');
    _notes = TextEditingController(text: e?.notes ?? '');
    _roomTypeId = e?.roomTypeId;
    _status = e?.status ?? RoomStatus.available;
    _amenityIds = e?.extraAmenityIds ?? <String>{};
  }

  @override
  void dispose() {
    for (final controller in [_number, _floor, _notes]) {
      controller.dispose();
    }
    super.dispose();
  }

  /// Only the keys whose value differs from the stored record.
  Map<String, dynamic> _changedFields(Room e) {
    final body = <String, dynamic>{};
    if (_roomTypeId != null && _roomTypeId != e.roomTypeId) {
      body['roomTypeId'] = _roomTypeId;
    }
    if (_number.text.trim() != e.number) body['number'] = _number.text.trim();
    final floor = int.tryParse(_floor.text.trim());
    if (floor != e.floor) body['floor'] = floor;
    if (_notes.text.trim() != (e.notes ?? '')) {
      body['notes'] = _notes.text.trim();
    }
    if (_status != e.status) body['status'] = _status.wire;
    if (!setEquals(_amenityIds, e.extraAmenityIds)) {
      body['amenityIds'] = _amenityIds.toList();
    }
    return body;
  }

  Future<void> _submit() async {
    setState(() => _submitError = null);
    if (!(_formKey.currentState?.validate() ?? false)) return;
    if (_roomTypeId == null || _roomTypeId!.isEmpty) {
      setState(() => _submitError = 'Choose the type this room is sold as.');
      return;
    }

    final existing = widget.existing;
    setState(() => _busy = true);
    final messenger = ScaffoldMessenger.of(context);
    final router = GoRouter.of(context);
    try {
      if (existing == null) {
        await ref
            .read(roomActionsProvider)
            .create(
              NewRoom(
                roomTypeId: _roomTypeId!,
                number: _number.text.trim(),
                floor: int.tryParse(_floor.text.trim()),
                status: _status,
                notes: _notes.text.trim(),
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
        await ref.read(roomActionsProvider).update(existing.id, body);
      }
      messenger.showSnackBar(
        SnackBar(
          content: Text(
            existing == null
                ? 'Room ${_number.text.trim()} added'
                : 'Changes to room ${_number.text.trim()} saved',
          ),
        ),
      );
      router.go(Routes.rooms);
    } on ApiException catch (e) {
      if (mounted) setState(() => _submitError = RoomErrors.friendly(e));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final isEdit = widget.isEdit;
    final types = ref.watch(roomTypeOptionsProvider);
    final inherited = widget.existing?.inheritedAmenities ?? const <Amenity>[];

    return PageBody(
      children: [
        Align(
          alignment: Alignment.centerLeft,
          child: TextButton.icon(
            onPressed: () => context.go(Routes.rooms),
            icon: const Icon(Icons.arrow_back, size: 16),
            label: const Text('Rooms'),
          ),
        ),
        PageHeader(
          eyebrow: 'Rooms',
          title: isEdit ? 'Edit room' : 'Add a room',
          subtitle: isEdit
              ? 'The room keeps its history; only what you change here moves.'
              : 'One room. To create a whole floor at once, use Bulk add.',
          actions: [
            if (!isEdit)
              PermissionGate(
                permission: P.roomCreate,
                child: OutlinedButton.icon(
                  onPressed: () => context.go(Routes.roomBulk),
                  icon: const Icon(Icons.playlist_add, size: 16),
                  label: const Text('Bulk add instead'),
                ),
              ),
          ],
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
                    const LabelXs('The room'),
                    const SizedBox(height: Sp.md),
                    RoomTypeDropdown(
                      types: types,
                      value: _roomTypeId,
                      onChanged: (id) => setState(() => _roomTypeId = id),
                    ),
                    gapMd,
                    Row(
                      children: [
                        Expanded(
                          flex: 3,
                          child: TextFormField(
                            controller: _number,
                            textCapitalization: TextCapitalization.characters,
                            decoration: const InputDecoration(
                              labelText: 'Room number',
                              hintText: '304',
                              prefixIcon: Icon(Icons.tag, size: 20),
                            ),
                            validator: (v) =>
                                (v ?? '').trim().isEmpty ? 'Required' : null,
                          ),
                        ),
                        const SizedBox(width: Sp.md),
                        Expanded(
                          flex: 2,
                          child: TextFormField(
                            controller: _floor,
                            keyboardType: TextInputType.number,
                            inputFormatters: [
                              FilteringTextInputFormatter.digitsOnly,
                            ],
                            decoration: const InputDecoration(
                              labelText: 'Floor',
                              hintText: '3',
                            ),
                          ),
                        ),
                      ],
                    ),
                    gapMd,
                    DropdownButtonFormField<RoomStatus>(
                      initialValue: _status,
                      isExpanded: true,
                      decoration: const InputDecoration(
                        labelText: 'Status',
                      ),
                      items: [
                        for (final status in RoomStatus.values)
                          DropdownMenuItem(
                            value: status,
                            child: Text(status.label),
                          ),
                      ],
                      onChanged: (status) =>
                          setState(() => _status = status ?? _status),
                    ),
                    gapMd,
                    TextFormField(
                      controller: _notes,
                      minLines: 2,
                      maxLines: 4,
                      textCapitalization: TextCapitalization.sentences,
                      decoration: const InputDecoration(
                        labelText: 'Notes (optional)',
                        hintText:
                            'Anything the desk and housekeeping should know — '
                            'corner room, connecting door, noisy AC.',
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
                    const LabelXs('Extra amenities'),
                    const SizedBox(height: 6),
                    const FieldNote(
                      text:
                          'Extras this one room has on top of its type. '
                          'Everything the type already includes comes '
                          'automatically and is not listed here.',
                    ),
                    if (inherited.isNotEmpty) ...[
                      const SizedBox(height: Sp.md),
                      const LabelXs('From the room type'),
                      const SizedBox(height: 6),
                      AmenityWrap(amenities: inherited, max: 12),
                    ],
                    const SizedBox(height: Sp.md),
                    AmenityPicker(
                      selected: _amenityIds,
                      excluded: inherited.map((a) => a.id).toSet(),
                      onChanged: (next) => setState(() => _amenityIds = next),
                      excludedNote:
                          'The room type already provides every amenity in the '
                          'catalogue, so there is nothing left to add here.',
                    ),
                  ],
                ),
              ),

              if (_submitError != null) ...[
                gapMd,
                FormErrorNote(message: _submitError!),
              ],

              gapSection,
              PermissionGate(
                permission: isEdit ? P.roomUpdate : P.roomCreate,
                fallback: const PermissionNote(
                  text:
                      'You can see this room, but your role cannot change it. '
                      'Ask a General Manager or Assistant General Manager.',
                ),
                child: FilledButton(
                  onPressed: _busy ? null : _submit,
                  child: _busy
                      ? const SizedBox(
                          width: 18,
                          height: 18,
                          child: CircularProgressIndicator(strokeWidth: 2),
                        )
                      : Text(isEdit ? 'Save changes' : 'Add room'),
                ),
              ),
            ],
          ),
        ),
      ],
    );
  }
}

/// The room-type picker, shared by the single-room and bulk forms.
///
/// A catalogue that is still loading, empty, or unreadable says so rather than
/// showing an empty dropdown that looks like a bug.
class RoomTypeDropdown extends StatelessWidget {
  const RoomTypeDropdown({
    super.key,
    required this.types,
    required this.value,
    required this.onChanged,
  });

  final AsyncValue<List<RoomType>> types;
  final String? value;
  final ValueChanged<String?> onChanged;

  @override
  Widget build(BuildContext context) {
    return types.when(
      loading: () => const Shimmer(height: 52, radius: R.md),
      error: (error, _) => ErrorState(error: error),
      data: (list) {
        if (list.isEmpty) {
          return const FieldNote(
            text:
                'There are no active room types yet. Create one first — a room '
                'has to be sold as something.',
            icon: Icons.warning_amber_outlined,
          );
        }
        // A type that was archived after the room was created is still the
        // room's type; keeping the stale id out of the dropdown would silently
        // re-point the room on the next save.
        final ids = list.map((t) => t.id).toSet();
        final selected = ids.contains(value) ? value : null;
        return DropdownButtonFormField<String>(
          initialValue: selected,
          isExpanded: true,
          decoration: const InputDecoration(
            labelText: 'Room type',
            prefixIcon: Icon(Icons.bed_outlined, size: 20),
          ),
          items: [
            for (final type in list)
              DropdownMenuItem(
                value: type.id,
                child: Text(
                  '${type.name} · ${type.baseRateLabel}',
                  overflow: TextOverflow.ellipsis,
                ),
              ),
          ],
          onChanged: onChanged,
        );
      },
    );
  }
}
