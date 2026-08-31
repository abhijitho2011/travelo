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
import '../../../core/theme/app_typography.dart';
import '../../../core/widgets/primitives.dart';
import '../../../core/widgets/states.dart';
import '../application/rooms_controllers.dart';
import '../data/room_models.dart';
import '../data/unit_models.dart';
import 'room_widgets.dart';
import 'workspace_media_sections.dart';
import 'workspace_rates_section.dart';
import 'workspace_units_section.dart';

/// Everything the form holds before it is saved.
///
/// A draft, not a [RoomType]: the server owns ids, timestamps and the live unit
/// count, and a half-filled form must never pretend to be a saved record.
class RoomTypeDraft {
  RoomTypeDraft({
    this.name = '',
    this.code = '',
    this.description = '',
    this.floorLabel = '',
    this.accommodationType = AccommodationType.room,
    this.smokingPolicy = SmokingPolicy.nonSmoking,
    this.accessible = false,
    this.sizeValue,
    this.sizeUnit = SizeUnit.sqm,
    this.baseOccupancy = 2,
    this.maxOccupancy = 2,
    this.maxAdults = 2,
    this.maxChildren = 0,
    this.maxInfants = 0,
    List<BedRow>? beds,
    this.extraBedAvailable = false,
    this.extraBedType = BedType.extraBed,
    this.extraBedCapacity = 1,
    this.extraBedPriceRupees,
    this.baseRateRupees,
    this.unitRoomCount = 1,
    this.privatePool = false,
    this.airConditioned = false,
    this.pricesIncludeTax = false,
    this.dynamicPricingEnabled = false,
    Set<String>? amenityIds,
  }) : beds = beds ?? [const BedRow(bedType: BedType.king)],
       amenityIds = amenityIds ?? <String>{};

  String name;
  String code;
  String description;
  String floorLabel;
  AccommodationType accommodationType;
  SmokingPolicy smokingPolicy;
  bool accessible;
  int? sizeValue;
  SizeUnit sizeUnit;

  int baseOccupancy;

  /// The most guests the room may ever hold. Its own number, not the sum:
  /// a room that allows 3 adults OR 2 adults + 2 children still sleeps 4, and
  /// deriving it would quietly overstate what the room can take.
  int maxOccupancy;
  int maxAdults;
  int maxChildren;
  int maxInfants;

  List<BedRow> beds;
  bool extraBedAvailable;
  BedType? extraBedType;
  int? extraBedCapacity;
  int? extraBedPriceRupees;

  /// Rupees in the form, paise on the wire. The conversion happens once, on
  /// save, so nothing in between can lose a hundredth.
  int? baseRateRupees;

  int unitRoomCount;
  bool privatePool;
  bool airConditioned;
  bool pricesIncludeTax;
  bool dynamicPricingEnabled;
  Set<String> amenityIds;

  /// The ceiling the maximum cannot exceed — you cannot sleep more people than
  /// the guest allowances add up to.
  int get occupancyCeiling => maxAdults + maxChildren + maxInfants;

  bool get isWholeUnit => accommodationType.isWholeUnit;

  static RoomTypeDraft from(RoomType type) => RoomTypeDraft(
    name: type.name,
    code: type.code ?? '',
    description: type.description ?? '',
    floorLabel: type.floorLabel ?? '',
    accommodationType: type.accommodationType,
    smokingPolicy: type.smokingPolicy,
    accessible: type.accessible,
    sizeValue: type.sizeValue,
    sizeUnit: type.sizeUnit,
    baseOccupancy: type.baseOccupancy,
    maxOccupancy: type.maxOccupancy,
    maxAdults: type.maxAdults,
    maxChildren: type.maxChildren,
    maxInfants: type.maxInfants,
    beds: type.beds.isEmpty
        ? [BedRow(bedType: type.bedType, quantity: type.bedCount)]
        : List<BedRow>.from(type.beds),
    extraBedAvailable: type.extraBedAvailable,
    extraBedType: type.extraBedType ?? BedType.extraBed,
    extraBedCapacity: type.extraBedCapacity ?? 1,
    extraBedPriceRupees: type.extraBedPricePaise == null
        ? null
        : type.extraBedPricePaise! ~/ 100,
    baseRateRupees: type.baseRate == 0 ? null : type.baseRate ~/ 100,
    unitRoomCount: type.unitRoomCount,
    privatePool: type.privatePool,
    airConditioned: type.airConditioned,
    pricesIncludeTax: type.pricesIncludeTax,
    dynamicPricingEnabled: type.dynamicPricingEnabled,
    amenityIds: type.amenityIds,
  );

  /// The write payload. Only fields the form actually owns — the workspace's
  /// other sections (units, photos, rate plans, fees, rules) save themselves
  /// against their own endpoints as they are edited.
  Map<String, dynamic> toPayload() => {
    'name': name.trim(),
    if (code.trim().isNotEmpty) 'code': code.trim(),
    'description': description.trim(),
    if (floorLabel.trim().isNotEmpty) 'floorLabel': floorLabel.trim(),
    'accommodationType': accommodationType.wire,
    // The server's narrower ROOM|VILLA flag drives villa maths; keep it in step
    // with the guest-facing shape rather than letting the two disagree.
    'unitKind': isWholeUnit ? UnitKind.villa.wire : UnitKind.room.wire,
    'unitRoomCount': isWholeUnit ? unitRoomCount : 1,
    'privatePool': privatePool,
    'smokingPolicy': smokingPolicy.wire,
    'accessible': accessible,
    if (sizeValue != null) 'sizeValue': sizeValue,
    'sizeUnit': sizeUnit.wire,
    'baseOccupancy': baseOccupancy,
    'maxOccupancy': maxOccupancy,
    'maxAdults': maxAdults,
    'maxChildren': maxChildren,
    'maxInfants': maxInfants,
    'beds': beds.map((b) => b.toJson()).toList(),
    'bedType': beds.isEmpty ? BedType.king.wire : beds.first.bedType.wire,
    'bedCount': beds.isEmpty ? 1 : beds.first.quantity,
    'airConditioned': airConditioned,
    'extraBedAvailable': extraBedAvailable,
    if (extraBedAvailable) ...{
      'extraBedType': (extraBedType ?? BedType.extraBed).wire,
      'extraBedCapacity': extraBedCapacity ?? 1,
      'extraBedPricePaise': (extraBedPriceRupees ?? 0) * 100,
    },
    'baseRate': (baseRateRupees ?? 0) * 100,
    'pricesIncludeTax': pricesIncludeTax,
    'dynamicPricingEnabled': dynamicPricingEnabled,
    'amenityIds': amenityIds.toList(),
  };
}

/// **Add / Edit room type** — the configuration workspace.
///
/// One page, several cards, in the order a hotelier actually thinks: what the
/// room IS, who fits in it, what they sleep on, which physical doors belong to
/// it, what it looks like, what it includes, and finally what it costs.
///
/// Sections that need a saved record (units, photos, rate plans, fees, pricing)
/// say so plainly while the type is still new rather than collecting data they
/// would have nowhere to put.
class RoomTypeWorkspaceScreen extends ConsumerStatefulWidget {
  const RoomTypeWorkspaceScreen({
    super.key,
    this.roomTypeId,
    this.duplicateOfId,
    this.roomId,
    this.newRoom = false,
  });

  /// Null for a new room type.
  final String? roomTypeId;

  /// Set when the page was opened from a row's Duplicate action.
  final String? duplicateOfId;

  /// The room being edited. Room mode: the page describes ONE physical room,
  /// and its specifications belong to that room rather than to a shared type.
  final String? roomId;

  /// Room mode, for a room that does not exist yet.
  final bool newRoom;

  @override
  ConsumerState<RoomTypeWorkspaceScreen> createState() =>
      _RoomTypeWorkspaceScreenState();
}

class _RoomTypeWorkspaceScreenState
    extends ConsumerState<RoomTypeWorkspaceScreen> {
  final _formKey = GlobalKey<FormState>();
  RoomTypeDraft _draft = RoomTypeDraft();

  /// Seeded once from the loaded record so the unsaved-changes prompt can tell
  /// a real edit from simply having opened the page.
  bool _seeded = false;
  bool _dirty = false;
  bool _busy = false;
  String? _submitError;

  /// Room identity — the fields that belong to the physical room rather than
  /// to its specifications.
  String _number = '';
  String _floor = '';
  String _roomNotes = '';
  RoomStatus _roomStatus = RoomStatus.available;

  /// The type behind the room, learned once the room is loaded. Rate plans,
  /// taxes and channels key on it.
  String? _roomTypeIdOfRoom;

  /// Whether this room's specs are its own. A shared type is editable only
  /// from the room type itself, so editing 201 cannot re-specify 202.
  bool _specsArePrivate = true;

  bool get _isRoomMode => widget.roomId != null || widget.newRoom;
  bool get _isEdit =>
      _isRoomMode ? widget.roomId != null : widget.roomTypeId != null;

  /// The room type the rate sections hang off, whichever mode we are in.
  String? get _effectiveTypeId =>
      _isRoomMode ? _roomTypeIdOfRoom : widget.roomTypeId;

  void _touch(VoidCallback change) {
    setState(() {
      change();
      _dirty = true;
    });
  }

  /// Raises the maximum when a guest allowance grows past it. Only upward —
  /// quietly REDUCING a number the hotelier typed would be the form overruling
  /// them; growing it just keeps the pair from being born invalid.
  void _liftCeiling() {
    if (_draft.maxOccupancy < _draft.maxAdults) {
      _draft.maxOccupancy = _draft.maxAdults;
    }
  }

  // ------------------------------------------------------------- validation --

  /// §18. Returns null when the draft may be saved, otherwise the first thing
  /// the hotelier needs to fix, in their words.
  String? _validate() {
    final d = _draft;
    if (_isRoomMode) {
      if (_number.trim().isEmpty) return 'Give this room a number.';
    } else if (d.name.trim().isEmpty) {
      return 'Give this room type a name.';
    }
    if (d.maxAdults < 1) return 'A room has to hold at least one adult.';
    if (d.baseOccupancy < 1) {
      return 'Base occupancy has to be at least one guest.';
    }
    if (d.maxChildren < 0 || d.maxInfants < 0) {
      return 'Guest counts cannot be negative.';
    }
    if (d.maxOccupancy < d.baseOccupancy) {
      return 'Maximum occupancy (${d.maxOccupancy}) cannot be lower than base '
          'occupancy (${d.baseOccupancy}).';
    }
    if (d.maxOccupancy < d.maxAdults) {
      return 'Maximum occupancy (${d.maxOccupancy}) has to fit the ${d.maxAdults} '
          'adults this room allows.';
    }
    if (d.maxOccupancy > d.occupancyCeiling) {
      return 'Maximum occupancy (${d.maxOccupancy}) is more than the adults, '
          'children and infants allowed add up to (${d.occupancyCeiling}).';
    }
    if ((d.baseRateRupees ?? 0) < 0) return 'A rate cannot be negative.';
    if (d.beds.isEmpty) return 'Add at least one bed.';
    if (d.beds.any((b) => b.quantity < 1)) {
      return 'Every bed row needs a quantity of at least one.';
    }
    if (d.extraBedAvailable && (d.extraBedPriceRupees ?? 0) < 0) {
      return 'An extra-bed price cannot be negative.';
    }
    if (d.isWholeUnit && d.unitRoomCount < 1) {
      return 'A ${d.accommodationType.label.toLowerCase()} contains at least '
          'one room.';
    }
    return null;
  }

  Future<void> _save() async {
    setState(() => _submitError = null);
    final problem = _validate();
    if (problem != null) {
      setState(() => _submitError = problem);
      return;
    }

    final messenger = ScaffoldMessenger.of(context);
    final router = GoRouter.of(context);
    setState(() => _busy = true);
    try {
      if (_isRoomMode) {
        await _saveRoom(messenger, router);
        return;
      }
      final actions = ref.read(roomTypeActionsProvider);
      if (_isEdit) {
        await actions.update(widget.roomTypeId!, _draft.toPayload());
        if (!mounted) return;
        setState(() => _dirty = false);
        messenger.showSnackBar(
          SnackBar(content: Text('${_draft.name.trim()} saved')),
        );
      } else {
        final created = await actions.create(_asNewRoomType());
        if (!mounted) return;
        setState(() => _dirty = false);
        messenger.showSnackBar(
          SnackBar(content: Text('${created.name} created successfully.')),
        );
        // Straight into the saved record, so units, photos and rates become
        // available without the hotelier hunting for the row they just made.
        router.go(Routes.roomType(created.id));
        return;
      }
    } on ApiException catch (e) {
      if (mounted) setState(() => _submitError = e.message);
    } catch (e) {
      if (mounted) setState(() => _submitError = '$e');
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  /// Room mode. The room's own specifications ride along as `specs`, and the
  /// server mints the private type behind them — there is no separate
  /// "create the type first" step for the hotelier to remember.
  Future<void> _saveRoom(
    ScaffoldMessengerState messenger,
    GoRouter router,
  ) async {
    final actions = ref.read(roomActionsProvider);
    final number = _number.trim();

    if (widget.roomId != null) {
      await actions.update(widget.roomId!, {
        'number': number,
        'floor': _floor.trim().isEmpty ? null : _floor.trim(),
        'notes': _roomNotes.trim().isEmpty ? null : _roomNotes.trim(),
        'status': _roomStatus.wire,
        'amenityIds': _draft.amenityIds.toList(),
        // Specs are only ours to change when the type is private to this room.
        if (_specsArePrivate) 'specs': _draft.toPayload(),
      });
      if (!mounted) return;
      setState(() => _dirty = false);
      messenger.showSnackBar(SnackBar(content: Text('Room $number saved')));
      return;
    }

    final created = await actions.create(
      NewRoom(
        number: number,
        specs: _draft.toPayload(),
        floor: int.tryParse(_floor.trim()),
        status: _roomStatus,
        notes: _roomNotes.trim().isEmpty ? null : _roomNotes.trim(),
        amenityIds: _draft.amenityIds.toList(),
      ),
    );
    if (!mounted) return;
    setState(() => _dirty = false);
    messenger.showSnackBar(
      SnackBar(content: Text('Room ${created.number} created successfully.')),
    );
    // Straight into the saved room, so photos and rates become available
    // without the hotelier hunting for the row they just made.
    router.go(Routes.room(created.id));
  }

  /// The create payload. [NewRoomType] carries the fields the original API has
  /// always taken; everything the workspace added rides in `extra`.
  NewRoomType _asNewRoomType() {
    final d = _draft;
    return NewRoomType(
      name: d.name.trim(),
      description: d.description.trim().isEmpty ? null : d.description.trim(),
      bedType: d.beds.isEmpty ? BedType.king : d.beds.first.bedType,
      bedCount: d.beds.isEmpty ? 1 : d.beds.first.quantity,
      maxOccupancy: d.maxOccupancy,
      maxAdults: d.maxAdults,
      maxChildren: d.maxChildren,
      airConditioned: d.airConditioned,
      baseRate: (d.baseRateRupees ?? 0) * 100,
      unitKind: d.isWholeUnit ? UnitKind.villa : UnitKind.room,
      unitRoomCount: d.isWholeUnit ? d.unitRoomCount : 1,
      privatePool: d.privatePool,
      sizeSqft: d.sizeValue == null
          ? null
          : (d.sizeUnit == SizeUnit.sqm
                ? (d.sizeValue! * 10.7639).round()
                : d.sizeValue),
      amenityIds: d.amenityIds.toList(),
      extra: d.toPayload(),
    );
  }

  Future<bool> _confirmLeave() async {
    if (!_dirty) return true;
    final ok = await showDialog<bool>(
      context: context,
      builder: (dialogContext) => AlertDialog(
        title: const Text('Unsaved changes'),
        content: const Text(
          'Are you sure you want to leave? Your changes will be lost.',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(dialogContext, false),
            child: const Text('Keep editing'),
          ),
          FilledButton(
            onPressed: () => Navigator.pop(dialogContext, true),
            child: const Text('Leave'),
          ),
        ],
      ),
    );
    return ok == true;
  }

  // ------------------------------------------------------------- room mode --

  /// The same workspace, describing ONE room. The specification sections are
  /// shared verbatim with the room-type mode — a room-first property fills in
  /// exactly the same sheet, it just belongs to the room.
  Widget _buildRoom(BuildContext context) {
    final id = widget.roomId;
    final source = id == null ? null : ref.watch(roomDetailProvider(id));

    if (source != null && !_seeded) {
      final room = source.valueOrNull;
      if (room != null) {
        _number = room.number;
        _floor = room.floor?.toString() ?? '';
        _roomNotes = room.notes ?? '';
        _roomStatus = room.status;
        _roomTypeIdOfRoom = room.roomTypeId;
        _specsArePrivate = room.specsArePrivate;
        // The specs sheet, when the server sent one. A room on a shared type
        // still shows it — read-only, with a link to the type.
        final specs = room.specs;
        if (specs != null) _draft = RoomTypeDraft.from(specs);
        _draft.amenityIds = room.extraAmenityIds;
        _seeded = true;
      }
    }

    if (source != null && !_seeded) {
      return Scaffold(
        appBar: AppBar(title: const Text('Room')),
        body: source.when(
          loading: () => const Center(child: CircularProgressIndicator()),
          error: (e, _) => ErrorState(
            error: e,
            onRetry: () => ref.invalidate(roomDetailProvider(id!)),
          ),
          data: (_) => const Center(child: CircularProgressIndicator()),
        ),
      );
    }

    final typeId = _effectiveTypeId;
    return PopScope(
      canPop: !_dirty,
      onPopInvokedWithResult: (didPop, _) async {
        if (didPop) return;
        if (await _confirmLeave() && mounted) {
          // ignore: use_build_context_synchronously — guarded by `mounted`.
          context.go(Routes.rooms);
        }
      },
      child: Scaffold(
        body: Form(
          key: _formKey,
          child: PageBody(
            children: [
              _roomHeader(context),
              gapSection,
              _roomIdentity(context),
              gapSection,
              if (!_specsArePrivate) ...[_sharedSpecsNote(context), gapSection],
              // Shared specifications are shown, not edited: the note above
              // says why, and the fields are inert rather than accepting typing
              // that save would then silently drop.
              IgnorePointer(
                ignoring: !_specsArePrivate,
                child: Opacity(
                  opacity: _specsArePrivate ? 1 : 0.6,
                  child: Column(
                    children: [
                      _basicInformation(context),
                      gapSection,
                      _occupancy(context),
                      gapSection,
                      _beds(context),
                    ],
                  ),
                ),
              ),
              gapSection,
              PhotosSection(
                owner: widget.roomId == null
                    ? null
                    : PhotoOwner.room(widget.roomId!),
              ),
              gapSection,
              AmenitiesSection(
                selected: _draft.amenityIds,
                onChanged: (ids) => _touch(() => _draft.amenityIds = ids),
              ),
              gapSection,
              if (typeId != null) ...[
                RatePlansSection(roomTypeId: typeId),
                gapSection,
                TaxesFeesSection(
                  roomTypeId: typeId,
                  baseRatePaise: (_draft.baseRateRupees ?? 0) * 100,
                  pricesIncludeTax: _draft.pricesIncludeTax,
                  onPricesIncludeTaxChanged: (v) =>
                      _touch(() => _draft.pricesIncludeTax = v),
                ),
                gapSection,
                DynamicPricingSection(
                  roomTypeId: typeId,
                  enabled: _draft.dynamicPricingEnabled,
                  onEnabledChanged: (v) =>
                      _touch(() => _draft.dynamicPricingEnabled = v),
                ),
                gapSection,
                SalesChannelsSection(roomTypeId: typeId),
              ] else
                const _SaveFirstNote(
                  what: 'Photos, rate plans, taxes and dynamic pricing',
                ),
              if (_submitError != null) ...[
                gapMd,
                FormErrorNote(message: _submitError!),
              ],
              gapSection,
            ],
          ),
        ),
        bottomNavigationBar: _saveBar(context),
      ),
    );
  }

  Widget _roomHeader(BuildContext context) => PageHeader(
    title: widget.roomId == null
        ? 'Add room'
        : 'Room ${_number.isEmpty ? '' : _number}'.trim(),
    subtitle: widget.roomId == null
        ? 'Describe this room. Everything here belongs to this room alone.'
        : 'This room and its own specifications.',
  );

  /// Why the specification fields below are not editable here.
  Widget _sharedSpecsNote(BuildContext context) {
    final c = context.colors;
    return SoftCard(
      child: Row(
        children: [
          Icon(Icons.link_outlined, size: 18, color: c.mutedForeground),
          const SizedBox(width: Sp.sm),
          Expanded(
            child: Text(
              'This room shares its specifications with the other rooms of '
              '“${_draft.name}”. Editing them here would change every one of '
              'them, so they are edited on the room type instead.',
              style: AppTypography.body(size: 12, color: c.mutedForeground),
            ),
          ),
          if (_roomTypeIdOfRoom != null)
            TextButton(
              onPressed: () => context.go(Routes.roomType(_roomTypeIdOfRoom!)),
              child: const Text('Open room type'),
            ),
        ],
      ),
    );
  }

  /// The physical room: what it is called and what state it is in.
  Widget _roomIdentity(BuildContext context) => _Section(
    title: 'Room',
    subtitle: 'How this room is identified on the board and on the key card.',
    child: Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        _Field(
          label: 'Room number',
          required: true,
          child: TextFormField(
            initialValue: _number,
            textCapitalization: TextCapitalization.characters,
            decoration: const InputDecoration(hintText: '201, 3A, G-12'),
            onChanged: (v) => _touch(() => _number = v),
          ),
        ),
        gapMd,
        _Field(
          label: 'Floor',
          child: TextFormField(
            initialValue: _floor,
            keyboardType: TextInputType.number,
            decoration: const InputDecoration(hintText: '2'),
            onChanged: (v) => _touch(() => _floor = v),
          ),
        ),
        gapMd,
        _Field(
          label: 'Status',
          child: DropdownButtonFormField<RoomStatus>(
            initialValue: _roomStatus,
            items: [
              for (final s in RoomStatus.values)
                DropdownMenuItem(value: s, child: Text(s.label)),
            ],
            onChanged: (v) => _touch(() => _roomStatus = v ?? _roomStatus),
          ),
        ),
        gapMd,
        _Field(
          label: 'Notes',
          child: TextFormField(
            initialValue: _roomNotes,
            maxLines: 3,
            decoration: const InputDecoration(
              hintText: 'Anything the desk should know about this room',
            ),
            onChanged: (v) => _touch(() => _roomNotes = v),
          ),
        ),
      ],
    ),
  );

  // ------------------------------------------------------------------ build --

  @override
  Widget build(BuildContext context) {
    if (_isRoomMode) return _buildRoom(context);

    // Editing loads the record; duplicating loads the source and drops its
    // identity so the copy is saved as a new type.
    final sourceId = widget.roomTypeId ?? widget.duplicateOfId;
    final source = sourceId == null
        ? null
        : ref.watch(roomTypeDetailProvider(sourceId));

    if (source != null && !_seeded) {
      final loaded = source.valueOrNull;
      if (loaded != null) {
        _draft = RoomTypeDraft.from(loaded);
        if (widget.duplicateOfId != null) {
          _draft.name = '${loaded.name} (copy)';
          _draft.code = '';
        }
        _seeded = true;
      }
    }

    if (source != null && !_seeded) {
      return Scaffold(
        appBar: AppBar(title: const Text('Room type')),
        body: source.when(
          loading: () => const Center(child: CircularProgressIndicator()),
          error: (e, _) => ErrorState(
            error: e,
            onRetry: () => ref.invalidate(roomTypeDetailProvider(sourceId!)),
          ),
          data: (_) => const Center(child: CircularProgressIndicator()),
        ),
      );
    }

    return PopScope(
      canPop: !_dirty,
      onPopInvokedWithResult: (didPop, _) async {
        if (didPop) return;
        if (await _confirmLeave() && mounted) {
          // ignore: use_build_context_synchronously — guarded by `mounted`.
          context.go(Routes.roomTypes);
        }
      },
      child: Scaffold(
        body: Form(
          key: _formKey,
          child: PageBody(
            children: [
              _header(context),
              gapSection,
              _basicInformation(context),
              gapSection,
              _occupancy(context),
              gapSection,
              _beds(context),
              gapSection,
              UnitsSection(
                roomTypeId: widget.roomTypeId,
                draftName: _draft.name,
              ),
              gapSection,
              PhotosSection(
                owner: widget.roomTypeId == null
                    ? null
                    : PhotoOwner.roomType(widget.roomTypeId!),
              ),
              gapSection,
              AmenitiesSection(
                selected: _draft.amenityIds,
                onChanged: (ids) => _touch(() => _draft.amenityIds = ids),
              ),
              gapSection,
              if (widget.roomTypeId != null) ...[
                RatePlansSection(roomTypeId: widget.roomTypeId!),
                gapSection,
                TaxesFeesSection(
                  roomTypeId: widget.roomTypeId!,
                  baseRatePaise: (_draft.baseRateRupees ?? 0) * 100,
                  pricesIncludeTax: _draft.pricesIncludeTax,
                  onPricesIncludeTaxChanged: (v) =>
                      _touch(() => _draft.pricesIncludeTax = v),
                ),
                gapSection,
                DynamicPricingSection(
                  roomTypeId: widget.roomTypeId!,
                  enabled: _draft.dynamicPricingEnabled,
                  onEnabledChanged: (v) =>
                      _touch(() => _draft.dynamicPricingEnabled = v),
                ),
                gapSection,
                SalesChannelsSection(roomTypeId: widget.roomTypeId!),
              ] else
                const _SaveFirstNote(
                  what: 'Rate plans, taxes and dynamic pricing',
                ),
              if (_submitError != null) ...[
                gapMd,
                FormErrorNote(message: _submitError!),
              ],
              gapSection,
            ],
          ),
        ),
        bottomNavigationBar: _saveBar(context),
      ),
    );
  }

  Widget _header(BuildContext context) {
    final c = context.colors;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        TextButton.icon(
          onPressed: () async {
            if (await _confirmLeave() && mounted) {
              // ignore: use_build_context_synchronously — guarded by `mounted`.
              context.go(Routes.roomTypes);
            }
          },
          icon: const Icon(Icons.arrow_back, size: 16),
          label: const Text('Room types & rates'),
          style: TextButton.styleFrom(
            padding: EdgeInsets.zero,
            foregroundColor: c.mutedForeground,
          ),
        ),
        const SizedBox(height: Sp.xs),
        Text(
          _isEdit ? 'Edit room type' : 'Add room type',
          style: AppTypography.display(size: 22, color: c.foreground),
        ),
        const SizedBox(height: 2),
        Text(
          'Set up the room type, occupancy, amenities, inventory and pricing.',
          style: AppTypography.body(size: 12.5, color: c.mutedForeground),
        ),
      ],
    );
  }

  /// Sticky footer rather than a button lost at the bottom of a long form.
  Widget _saveBar(BuildContext context) {
    final c = context.colors;
    return Container(
      padding: const EdgeInsets.fromLTRB(Sp.lg, Sp.md, Sp.lg, Sp.md),
      decoration: BoxDecoration(
        color: c.card,
        border: Border(top: BorderSide(color: c.border)),
      ),
      child: SafeArea(
        top: false,
        child: Row(
          children: [
            if (_dirty)
              Expanded(
                child: Text(
                  'Unsaved changes',
                  style: AppTypography.body(size: 12, color: c.warning),
                ),
              )
            else
              const Spacer(),
            OutlinedButton(
              onPressed: _busy
                  ? null
                  : () async {
                      if (await _confirmLeave() && mounted) {
                        // ignore: use_build_context_synchronously — `mounted`.
                        context.go(Routes.roomTypes);
                      }
                    },
              child: const Text('Cancel'),
            ),
            const SizedBox(width: Sp.sm),
            PermissionGate(
              permission: _isEdit ? P.roomTypeUpdate : P.roomTypeCreate,
              child: FilledButton(
                onPressed: _busy ? null : _save,
                child: _busy
                    ? const SizedBox(
                        width: 16,
                        height: 16,
                        child: CircularProgressIndicator(strokeWidth: 2),
                      )
                    : Text(_isEdit ? 'Save changes' : 'Save room type'),
              ),
            ),
          ],
        ),
      ),
    );
  }

  // ------------------------------------------------------ §5 basic details --

  Widget _basicInformation(BuildContext context) {
    final d = _draft;
    return _Section(
      title: 'Basic information',
      subtitle: 'What this room type is, and where it sits in the property.',
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          _Field(
            label: 'Room type name',
            required: true,
            child: TextFormField(
              initialValue: d.name,
              decoration: const InputDecoration(hintText: 'Deluxe King Room'),
              textCapitalization: TextCapitalization.words,
              onChanged: (v) => _touch(() => d.name = v),
            ),
          ),
          gapMd,
          _TwoUp(
            left: _Field(
              label: 'Internal code',
              child: TextFormField(
                initialValue: d.code,
                decoration: const InputDecoration(hintText: 'DLX-KING'),
                textCapitalization: TextCapitalization.characters,
                onChanged: (v) => _touch(() => d.code = v),
              ),
            ),
            right: _Field(
              label: 'Accommodation type',
              required: true,
              child: DropdownButtonFormField<AccommodationType>(
                initialValue: d.accommodationType,
                items: [
                  for (final t in AccommodationType.values)
                    DropdownMenuItem(value: t, child: Text(t.label)),
                ],
                onChanged: (t) => _touch(
                  () => d.accommodationType = t ?? AccommodationType.room,
                ),
              ),
            ),
          ),
          gapMd,
          _Field(
            label: 'Description',
            child: TextFormField(
              initialValue: d.description,
              minLines: 3,
              maxLines: 6,
              decoration: const InputDecoration(
                hintText:
                    'Describe the room, its features and what guests can '
                    'expect.',
              ),
              onChanged: (v) => _touch(() => d.description = v),
            ),
          ),
          gapMd,
          _TwoUp(
            left: _Field(
              label: 'Floor / location',
              child: TextFormField(
                initialValue: d.floorLabel,
                decoration: const InputDecoration(
                  hintText: '2nd floor, sea wing',
                ),
                onChanged: (v) => _touch(() => d.floorLabel = v),
              ),
            ),
            right: _Field(
              label: 'Floor size',
              child: Row(
                children: [
                  Expanded(
                    child: TextFormField(
                      initialValue: d.sizeValue?.toString() ?? '',
                      keyboardType: TextInputType.number,
                      inputFormatters: [FilteringTextInputFormatter.digitsOnly],
                      decoration: const InputDecoration(hintText: '32'),
                      onChanged: (v) =>
                          _touch(() => d.sizeValue = int.tryParse(v)),
                    ),
                  ),
                  const SizedBox(width: Sp.sm),
                  Segmented<SizeUnit>(
                    options: SizeUnit.values,
                    labelOf: (u) => u.label,
                    value: d.sizeUnit,
                    onChanged: (u) => _touch(() => d.sizeUnit = u),
                  ),
                ],
              ),
            ),
          ),
          gapMd,
          _Field(
            label: 'Smoking policy',
            child: Align(
              alignment: Alignment.centerLeft,
              child: Segmented<SmokingPolicy>(
                options: SmokingPolicy.values,
                labelOf: (p) => p.label,
                value: d.smokingPolicy,
                onChanged: (p) => _touch(() => d.smokingPolicy = p),
              ),
            ),
          ),
          gapSm,
          SwitchListTile(
            contentPadding: EdgeInsets.zero,
            value: d.accessible,
            onChanged: (v) => _touch(() => d.accessible = v),
            title: const Text('Accessible room'),
            subtitle: const Text(
              'Step-free access and an accessible bathroom.',
            ),
          ),
          SwitchListTile(
            contentPadding: EdgeInsets.zero,
            value: d.airConditioned,
            onChanged: (v) => _touch(() => d.airConditioned = v),
            title: const Text('Air conditioned'),
            subtitle: const Text(
              'A property of the room type, not an amenity — every unit of this '
              'type either has it or does not.',
            ),
          ),
          if (d.isWholeUnit) ...[
            const Divider(height: Sp.xl),
            _TwoUp(
              left: _Field(
                label:
                    'Rooms in one ${d.accommodationType.label.toLowerCase()}',
                child: _Stepper(
                  value: d.unitRoomCount,
                  min: 1,
                  onChanged: (v) => _touch(() => d.unitRoomCount = v),
                ),
              ),
              right: Padding(
                padding: const EdgeInsets.only(top: Sp.lg),
                child: SwitchListTile(
                  contentPadding: EdgeInsets.zero,
                  value: d.privatePool,
                  onChanged: (v) => _touch(() => d.privatePool = v),
                  title: const Text('Private pool'),
                ),
              ),
            ),
            const FieldNote(
              text:
                  'Rooms inside ONE unit — not how many units the property has. '
                  'That is the physical units below.',
            ),
          ],
        ],
      ),
    );
  }

  // ---------------------------------------------------------- §6 occupancy --

  Widget _occupancy(BuildContext context) {
    final c = context.colors;
    final d = _draft;
    return _Section(
      title: 'Occupancy',
      subtitle: 'Define how many guests this room can accommodate.',
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Wrap(
            spacing: Sp.xl,
            runSpacing: Sp.md,
            children: [
              _Counter(
                label: 'Base occupancy',
                value: d.baseOccupancy,
                min: 1,
                onChanged: (v) => _touch(() => d.baseOccupancy = v),
              ),
              _Counter(
                label: 'Maximum adults',
                value: d.maxAdults,
                min: 1,
                onChanged: (v) => _touch(() {
                  d.maxAdults = v;
                  _liftCeiling();
                }),
              ),
              _Counter(
                label: 'Maximum children',
                value: d.maxChildren,
                onChanged: (v) => _touch(() {
                  d.maxChildren = v;
                  _liftCeiling();
                }),
              ),
              _Counter(
                label: 'Maximum infants',
                value: d.maxInfants,
                onChanged: (v) => _touch(() {
                  d.maxInfants = v;
                  _liftCeiling();
                }),
              ),
              _Counter(
                label: 'Maximum occupancy',
                value: d.maxOccupancy,
                min: 1,
                onChanged: (v) => _touch(() => d.maxOccupancy = v),
              ),
            ],
          ),
          gapMd,
          Builder(
            builder: (context) {
              // The same three rules the validator enforces, said as the numbers
              // change rather than only when Save is pressed.
              final problem = d.maxOccupancy < d.baseOccupancy
                  ? 'Lower than base occupancy (${d.baseOccupancy}).'
                  : d.maxOccupancy < d.maxAdults
                  ? 'Too low to fit ${d.maxAdults} adults.'
                  : d.maxOccupancy > d.occupancyCeiling
                  ? 'More than the ${d.occupancyCeiling} the allowances add up to.'
                  : null;
              final bad = problem != null;
              return Container(
                padding: const EdgeInsets.symmetric(
                  horizontal: Sp.md,
                  vertical: Sp.sm,
                ),
                decoration: BoxDecoration(
                  color: bad ? c.destructive.withValues(alpha: 0.1) : c.accent,
                  borderRadius: R.rMd,
                ),
                child: Row(
                  children: [
                    Icon(
                      bad ? Icons.error_outline : Icons.people_outline,
                      size: 16,
                      color: bad ? c.destructive : c.primary,
                    ),
                    const SizedBox(width: Sp.sm),
                    Expanded(
                      child: Text(
                        bad
                            ? 'Maximum occupancy: ${d.maxOccupancy} — $problem'
                            : 'Maximum occupancy: ${d.maxOccupancy} '
                                  '${d.maxOccupancy == 1 ? 'guest' : 'guests'}'
                                  '${d.maxOccupancy < d.occupancyCeiling ? ' (up to ${d.occupancyCeiling} allowed by the mix)' : ''}',
                        style: AppTypography.body(
                          size: 13,
                          weight: FontWeight.w600,
                          color: bad ? c.destructive : c.primary,
                        ),
                      ),
                    ),
                  ],
                ),
              );
            },
          ),
          const FieldNote(
            text:
                'Base occupancy is the number of guests included in the base '
                'rate. Maximum occupancy is the most the room may ever hold, and '
                'is set on its own — a room that allows 3 adults or 2 adults and '
                '2 children may still only sleep 4.',
          ),
        ],
      ),
    );
  }

  // --------------------------------------------------------------- §7 beds --

  Widget _beds(BuildContext context) {
    final c = context.colors;
    final d = _draft;
    return _Section(
      title: 'Beds & sleeping arrangement',
      subtitle: 'What guests actually sleep on.',
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          for (var i = 0; i < d.beds.length; i++)
            Padding(
              padding: const EdgeInsets.only(bottom: Sp.sm),
              child: Row(
                children: [
                  Expanded(
                    flex: 3,
                    child: DropdownButtonFormField<BedType>(
                      initialValue: d.beds[i].bedType,
                      decoration: const InputDecoration(isDense: true),
                      items: [
                        for (final b in BedType.values)
                          DropdownMenuItem(value: b, child: Text(b.label)),
                      ],
                      onChanged: (b) => _touch(() {
                        if (b != null) {
                          d.beds[i] = d.beds[i].copyWith(bedType: b);
                        }
                      }),
                    ),
                  ),
                  const SizedBox(width: Sp.sm),
                  Expanded(
                    flex: 2,
                    child: _Stepper(
                      value: d.beds[i].quantity,
                      min: 1,
                      onChanged: (v) => _touch(
                        () => d.beds[i] = d.beds[i].copyWith(quantity: v),
                      ),
                    ),
                  ),
                  IconButton(
                    tooltip: 'Remove bed',
                    // The last row stays: a room type with no bed at all is not
                    // a thing the catalogue can describe.
                    onPressed: d.beds.length == 1
                        ? null
                        : () => _touch(() => d.beds.removeAt(i)),
                    icon: Icon(Icons.close, size: 18, color: c.mutedForeground),
                  ),
                ],
              ),
            ),
          Align(
            alignment: Alignment.centerLeft,
            child: TextButton.icon(
              onPressed: () => _touch(
                () => d.beds.add(const BedRow(bedType: BedType.single)),
              ),
              icon: const Icon(Icons.add, size: 16),
              label: const Text('Add bed'),
            ),
          ),
          const Divider(height: Sp.xl),
          SwitchListTile(
            contentPadding: EdgeInsets.zero,
            value: d.extraBedAvailable,
            onChanged: (v) => _touch(() => d.extraBedAvailable = v),
            title: const Text('Extra bed available'),
            subtitle: const Text(
              'Priced separately from the room rate, never folded into it.',
            ),
          ),
          if (d.extraBedAvailable) ...[
            gapSm,
            _TwoUp(
              left: _Field(
                label: 'Extra bed type',
                child: DropdownButtonFormField<BedType>(
                  initialValue: d.extraBedType ?? BedType.extraBed,
                  items: [
                    for (final b in BedType.values)
                      DropdownMenuItem(value: b, child: Text(b.label)),
                  ],
                  onChanged: (b) => _touch(() => d.extraBedType = b),
                ),
              ),
              right: _Field(
                label: 'Capacity',
                child: _Stepper(
                  value: d.extraBedCapacity ?? 1,
                  min: 1,
                  onChanged: (v) => _touch(() => d.extraBedCapacity = v),
                ),
              ),
            ),
            gapMd,
            _Field(
              label: 'Extra bed price (₹ per night)',
              child: TextFormField(
                initialValue: d.extraBedPriceRupees?.toString() ?? '',
                keyboardType: TextInputType.number,
                inputFormatters: [FilteringTextInputFormatter.digitsOnly],
                decoration: const InputDecoration(hintText: '750'),
                onChanged: (v) =>
                    _touch(() => d.extraBedPriceRupees = int.tryParse(v)),
              ),
            ),
          ],
          const Divider(height: Sp.xl),
          _Field(
            label: 'Base rate (₹ per night)',
            child: TextFormField(
              initialValue: d.baseRateRupees?.toString() ?? '',
              keyboardType: TextInputType.number,
              inputFormatters: [FilteringTextInputFormatter.digitsOnly],
              decoration: const InputDecoration(hintText: '4500'),
              onChanged: (v) =>
                  _touch(() => d.baseRateRupees = int.tryParse(v)),
            ),
          ),
          const FieldNote(
            text:
                'The fallback price, used when no rate plan applies. Rate plans '
                'below are what the room is normally sold on.',
          ),
        ],
      ),
    );
  }
}

// ------------------------------------------------------------ small pieces --

/// One card of the workspace: a titled, explained group of fields.
class _Section extends StatelessWidget {
  const _Section({required this.title, this.subtitle, required this.child});

  final String title;
  final String? subtitle;
  final Widget child;

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    return SoftCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Text(
            title,
            style: AppTypography.display(size: 15, color: c.foreground),
          ),
          if (subtitle != null) ...[
            const SizedBox(height: 2),
            Text(
              subtitle!,
              style: AppTypography.body(size: 11.5, color: c.mutedForeground),
            ),
          ],
          const SizedBox(height: Sp.lg),
          child,
        ],
      ),
    );
  }
}

/// A labelled form field. The asterisk is the only place "required" is stated,
/// so it never disagrees with the validator.
class _Field extends StatelessWidget {
  const _Field({
    required this.label,
    required this.child,
    this.required = false,
  });

  final String label;
  final Widget child;
  final bool required;

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          children: [
            Text(label, style: AppTypography.labelXs(c.mutedForeground)),
            if (required)
              Text(' *', style: AppTypography.labelXs(c.destructive)),
          ],
        ),
        const SizedBox(height: 5),
        child,
      ],
    );
  }
}

/// Two fields side by side on a wide screen, stacked on a narrow one — §20.
class _TwoUp extends StatelessWidget {
  const _TwoUp({required this.left, required this.right});

  final Widget left;
  final Widget right;

  @override
  Widget build(BuildContext context) {
    return LayoutBuilder(
      builder: (context, constraints) {
        if (constraints.maxWidth < 520) {
          return Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              left,
              const SizedBox(height: Sp.md),
              right,
            ],
          );
        }
        return Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Expanded(child: left),
            const SizedBox(width: Sp.lg),
            Expanded(child: right),
          ],
        );
      },
    );
  }
}

/// A compact − / value / + control, used wherever a count is small enough that
/// typing a number is more work than pressing a button.
class _Stepper extends StatelessWidget {
  const _Stepper({required this.value, required this.onChanged, this.min = 0});

  final int value;
  final ValueChanged<int> onChanged;
  final int min;

  /// No ceiling is enforced here: a dormitory can hold a lot of guests, and a
  /// hard cap in the widget would be a rule invented by the form.
  static const int max = 99;

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    return Container(
      height: 40,
      decoration: BoxDecoration(
        borderRadius: R.rMd,
        border: Border.all(color: c.border),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          IconButton(
            visualDensity: VisualDensity.compact,
            onPressed: value > min ? () => onChanged(value - 1) : null,
            icon: const Icon(Icons.remove, size: 16),
            tooltip: 'Decrease',
          ),
          SizedBox(
            width: 28,
            child: Text(
              '$value',
              textAlign: TextAlign.center,
              style: AppTypography.body(
                size: 14,
                weight: FontWeight.w600,
                color: c.foreground,
              ),
            ),
          ),
          IconButton(
            visualDensity: VisualDensity.compact,
            onPressed: value < max ? () => onChanged(value + 1) : null,
            icon: const Icon(Icons.add, size: 16),
            tooltip: 'Increase',
          ),
        ],
      ),
    );
  }
}

/// A labelled [_Stepper] for the occupancy grid.
class _Counter extends StatelessWidget {
  const _Counter({
    required this.label,
    required this.value,
    required this.onChanged,
    this.min = 0,
  });

  final String label;
  final int value;
  final ValueChanged<int> onChanged;
  final int min;

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      mainAxisSize: MainAxisSize.min,
      children: [
        Text(label, style: AppTypography.labelXs(c.mutedForeground)),
        const SizedBox(height: 5),
        _Stepper(value: value, min: min, onChanged: onChanged),
      ],
    );
  }
}

/// Shown in place of the sections that need a saved record. Better than
/// disabled controls: it says what to do rather than only what cannot be done.
class _SaveFirstNote extends StatelessWidget {
  const _SaveFirstNote({required this.what});

  final String what;

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    return Container(
      padding: const EdgeInsets.all(Sp.lg),
      decoration: BoxDecoration(
        color: c.muted,
        borderRadius: R.rLg,
        border: Border.all(color: c.border),
      ),
      child: Row(
        children: [
          Icon(Icons.save_outlined, size: 18, color: c.mutedForeground),
          const SizedBox(width: Sp.md),
          Expanded(
            child: Text(
              '$what become available once the room type is saved.',
              style: AppTypography.body(size: 12.5, color: c.mutedForeground),
            ),
          ),
        ],
      ),
    );
  }
}
