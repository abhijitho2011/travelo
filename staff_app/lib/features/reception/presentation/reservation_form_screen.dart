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
import '../../../core/utils/formatting.dart';
import '../../../core/widgets/primitives.dart';
import '../../../core/widgets/states.dart';
import '../../rooms/data/room_models.dart' show formatPaise;
import '../../rooms/presentation/room_widgets.dart'
    show FieldNote, FormErrorNote;
import '../application/reception_controllers.dart';
import '../data/reception_models.dart';
import '../data/reception_repository.dart';

/// Take a booking.
///
/// The form is built around the one thing that actually goes wrong at a desk:
/// selling a room type that has nothing left. The type picker therefore shows
/// LIVE availability for the dates currently in the form, recomputed whenever
/// either date moves, so the clerk sees "Deluxe · 0 of 4 free" before they
/// promise anything rather than a NO_AVAILABILITY after.
class ReservationFormScreen extends ConsumerStatefulWidget {
  const ReservationFormScreen({
    super.key,
    this.initialCheckIn,
    this.initialRoomId,
    this.initialRoomTypeId,
  });

  /// Arrival to open on — the calendar passes the date cell that was tapped so
  /// the clerk does not re-enter what they just pointed at. Null means today.
  final DateTime? initialCheckIn;

  /// The room the booking should land in, when it was started from a specific
  /// room's lane on the calendar. Optional everywhere else: reception usually
  /// picks the room on arrival.
  final String? initialRoomId;

  /// The type that room is sold as, so the form opens with the right rate.
  final String? initialRoomTypeId;

  @override
  ConsumerState<ReservationFormScreen> createState() =>
      _ReservationFormScreenState();
}

class _ReservationFormScreenState extends ConsumerState<ReservationFormScreen> {
  final _formKey = GlobalKey<FormState>();

  final _name = TextEditingController();
  final _phone = TextEditingController();
  final _email = TextEditingController();
  final _notes = TextEditingController();

  /// Rupees, because that is what a guest is quoted. Converted to paise on the
  /// way out — the wire is paise everywhere in this app.
  final _rate = TextEditingController();

  late DateTime _checkIn;
  late DateTime _checkOut;
  String? _roomTypeId;

  /// Set only when the booking was started from a room's lane on the calendar.
  String? _roomId;
  int _adults = 2;
  int _children = 0;
  ReservationSource _source = ReservationSource.walkIn;

  /// A walk-in standing at the desk is not a soft hold, so the common case is
  /// the default and the clerk presses one button, not two.
  bool _confirmNow = true;

  /// True once the clerk has typed over the prefilled rate. After that a
  /// change of room type must not silently overwrite what they entered.
  bool _rateEdited = false;

  bool _busy = false;
  String? _submitError;

  @override
  void initState() {
    super.initState();
    // Prefilled from the calendar when the clerk tapped a room/date cell;
    // otherwise a one-night stay starting today, the desk's common case.
    final start = dateOnly(widget.initialCheckIn ?? DateTime.now());
    _checkIn = start;
    _checkOut = start.add(const Duration(days: 1));
    _roomId = widget.initialRoomId;
    _roomTypeId = widget.initialRoomTypeId;
  }

  @override
  void dispose() {
    for (final c in [_name, _phone, _email, _notes, _rate]) {
      c.dispose();
    }
    super.dispose();
  }

  StayRange get _range => (checkIn: _checkIn, checkOut: _checkOut);

  int get _nights => nightsBetween(_checkIn, _checkOut);

  Future<void> _pickDate({required bool isArrival}) async {
    final now = dateOnly(DateTime.now());
    final picked = await showDatePicker(
      context: context,
      initialDate: isArrival ? _checkIn : _checkOut,
      // A booking can be taken for a stay that has already started (a guest
      // who walked in yesterday and is only now being entered), but not for
      // one that started last year.
      firstDate: now.subtract(const Duration(days: 30)),
      lastDate: now.add(const Duration(days: 730)),
    );
    if (picked == null) return;
    setState(() {
      if (isArrival) {
        _checkIn = dateOnly(picked);
        // Check-out is EXCLUSIVE and a stay is at least one night, so pulling
        // arrival past departure pushes departure rather than producing a
        // range the server would refuse.
        if (!datesInOrder(_checkIn, _checkOut)) {
          _checkOut = _checkIn.add(const Duration(days: 1));
        }
      } else {
        _checkOut = dateOnly(picked);
        if (!datesInOrder(_checkIn, _checkOut)) {
          _checkIn = _checkOut.subtract(const Duration(days: 1));
        }
      }
    });
  }

  /// Prefills the rate from the chosen type, unless the clerk has already
  /// overridden it.
  void _onTypeChanged(String? id, List<RoomTypeAvailability> options) {
    setState(() {
      _roomTypeId = id;
      if (_rateEdited) return;
      final chosen = options.where((o) => o.roomTypeId == id).firstOrNull;
      if (chosen != null) {
        _rate.text = (chosen.baseRate / 100).round().toString();
      }
    });
  }

  Future<void> _submit() async {
    setState(() => _submitError = null);
    if (!(_formKey.currentState?.validate() ?? false)) return;
    if (_roomTypeId == null || _roomTypeId!.isEmpty) {
      setState(() => _submitError = 'Choose what this booking is sold as.');
      return;
    }
    if (!datesInOrder(_checkIn, _checkOut)) {
      setState(
        () => _submitError =
            'Check-out has to be at least one day after '
            'check-in.',
      );
      return;
    }

    final rupees = int.tryParse(_rate.text.trim());
    setState(() => _busy = true);
    final messenger = ScaffoldMessenger.of(context);
    final router = GoRouter.of(context);
    try {
      final created = await ref
          .read(reservationActionsProvider)
          .create(
            NewReservation(
              roomTypeId: _roomTypeId!,
              roomId: _roomId,
              guestName: _name.text.trim(),
              guestPhone: _phone.text.trim(),
              guestEmail: _email.text.trim(),
              adults: _adults,
              children: _children,
              checkIn: _checkIn,
              checkOut: _checkOut,
              ratePaise: rupees == null ? null : rupees * 100,
              source: _source,
              notes: _notes.text.trim(),
              confirmImmediately: _confirmNow,
            ),
          );
      messenger.showSnackBar(
        SnackBar(
          content: Text(
            '${created.reservationNumber} · ${created.guestName} booked',
          ),
        ),
      );
      router.go(Routes.reservation(created.id));
    } on ApiException catch (e) {
      if (mounted) setState(() => _submitError = ReservationErrors.friendly(e));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    final availability = ref.watch(availabilityProvider(_range));
    final options = availability.value ?? const <RoomTypeAvailability>[];
    final chosen = options
        .where((o) => o.roomTypeId == _roomTypeId)
        .firstOrNull;
    final rupees = int.tryParse(_rate.text.trim()) ?? 0;

    return PageBody(
      children: [
        Align(
          alignment: Alignment.centerLeft,
          child: TextButton.icon(
            onPressed: () => context.go(Routes.reservations),
            icon: const Icon(Icons.arrow_back, size: 16),
            label: const Text('Bookings'),
          ),
        ),
        const PageHeader(
          eyebrow: 'Front office',
          title: 'New booking',
          subtitle:
              'A room type and a date range. The physical room is picked at '
              'check-in, when you know which one is clean.',
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
                    const LabelXs('The guest'),
                    const SizedBox(height: Sp.md),
                    TextFormField(
                      controller: _name,
                      textCapitalization: TextCapitalization.words,
                      decoration: const InputDecoration(
                        labelText: 'Guest name',
                        prefixIcon: Icon(Icons.person_outline, size: 20),
                      ),
                      validator: (v) =>
                          (v ?? '').trim().length < 2 ? 'Required' : null,
                    ),
                    gapMd,
                    TextFormField(
                      controller: _phone,
                      keyboardType: TextInputType.phone,
                      inputFormatters: [
                        FilteringTextInputFormatter.allow(RegExp(r'[0-9+ ]')),
                      ],
                      decoration: const InputDecoration(
                        labelText: 'Mobile',
                        hintText: '9876543210',
                        prefixIcon: Icon(Icons.phone_outlined, size: 20),
                      ),
                      // The phone number is how a hotel reaches a guest who is
                      // running late, so it is required rather than polite.
                      validator: (v) =>
                          (v ?? '').trim().length < 6 ? 'Required' : null,
                    ),
                    gapMd,
                    TextFormField(
                      controller: _email,
                      keyboardType: TextInputType.emailAddress,
                      decoration: const InputDecoration(
                        labelText: 'Email (optional)',
                        prefixIcon: Icon(Icons.mail_outline, size: 20),
                      ),
                    ),
                    gapMd,
                    Row(
                      children: [
                        Expanded(
                          child: _Counter(
                            label: 'Adults',
                            value: _adults,
                            min: 1,
                            onChanged: (v) => setState(() => _adults = v),
                          ),
                        ),
                        const SizedBox(width: Sp.md),
                        Expanded(
                          child: _Counter(
                            label: 'Children',
                            value: _children,
                            min: 0,
                            onChanged: (v) => setState(() => _children = v),
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
                    const LabelXs('The stay'),
                    const SizedBox(height: Sp.md),
                    Row(
                      children: [
                        Expanded(
                          child: _DateField(
                            label: 'Check-in',
                            value: _checkIn,
                            onTap: () => _pickDate(isArrival: true),
                          ),
                        ),
                        const SizedBox(width: Sp.md),
                        Expanded(
                          child: _DateField(
                            label: 'Check-out',
                            value: _checkOut,
                            onTap: () => _pickDate(isArrival: false),
                          ),
                        ),
                      ],
                    ),
                    const SizedBox(height: 6),
                    FieldNote(
                      text:
                          '$_nights ${_nights == 1 ? 'night' : 'nights'}. '
                          'Check-out is the morning the room frees up, so the '
                          'room is on sale again that day.',
                    ),
                    gapMd,
                    _RoomTypePicker(
                      availability: availability,
                      value: _roomTypeId,
                      onChanged: (id) => _onTypeChanged(id, options),
                    ),
                    gapMd,
                    DropdownButtonFormField<ReservationSource>(
                      initialValue: _source,
                      isExpanded: true,
                      decoration: const InputDecoration(
                        labelText: 'Booked through',
                      ),
                      items: [
                        for (final s in ReservationSource.values)
                          DropdownMenuItem(value: s, child: Text(s.label)),
                      ],
                      onChanged: (s) => setState(() => _source = s ?? _source),
                    ),
                  ],
                ),
              ),
              gapMd,

              SoftCard(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    const LabelXs('The money'),
                    const SizedBox(height: Sp.md),
                    TextFormField(
                      controller: _rate,
                      keyboardType: TextInputType.number,
                      inputFormatters: [FilteringTextInputFormatter.digitsOnly],
                      decoration: InputDecoration(
                        labelText: 'Rate per night (₹)',
                        prefixIcon: const Icon(Icons.currency_rupee, size: 18),
                        helperText: chosen == null
                            ? 'Prefilled from the room type once you pick one.'
                            : 'Room type rate is '
                                  '${formatPaise(chosen.baseRate)}.',
                      ),
                      onChanged: (_) => setState(() => _rateEdited = true),
                    ),
                    const SizedBox(height: Sp.md),
                    Row(
                      children: [
                        Expanded(
                          child: Text(
                            'Total for $_nights '
                            '${_nights == 1 ? 'night' : 'nights'}',
                            style: Theme.of(context).textTheme.bodyMedium
                                ?.copyWith(color: c.mutedForeground),
                          ),
                        ),
                        Text(
                          formatPaise(rupees * 100 * _nights),
                          style: Theme.of(context).textTheme.titleMedium,
                        ),
                      ],
                    ),
                    gapMd,
                    SwitchListTile.adaptive(
                      contentPadding: EdgeInsets.zero,
                      value: _confirmNow,
                      onChanged: (v) => setState(() => _confirmNow = v),
                      title: const Text('Confirm straight away'),
                      subtitle: const Text(
                        'A confirmed booking holds a room. Leave it off only '
                        'for a tentative hold that nobody is counting on.',
                      ),
                    ),
                  ],
                ),
              ),
              gapMd,

              SoftCard(
                child: TextFormField(
                  controller: _notes,
                  minLines: 2,
                  maxLines: 4,
                  textCapitalization: TextCapitalization.sentences,
                  decoration: const InputDecoration(
                    labelText: 'Notes (optional)',
                    hintText:
                        'Anything the desk should know — late arrival, high '
                        'floor, travelling with an infant.',
                    alignLabelWithHint: true,
                  ),
                ),
              ),

              if (_submitError != null) ...[
                gapMd,
                FormErrorNote(message: _submitError!),
              ],

              gapSection,
              PermissionGate(
                permission: P.reservationCreate,
                fallback: const PermissionNote(
                  text:
                      'Your role can see the book but not add to it. Reception '
                      'and management take bookings.',
                ),
                child: FilledButton(
                  onPressed: _busy ? null : _submit,
                  child: _busy
                      ? const SizedBox(
                          width: 18,
                          height: 18,
                          child: CircularProgressIndicator(strokeWidth: 2),
                        )
                      : Text(_confirmNow ? 'Confirm booking' : 'Hold booking'),
                ),
              ),
            ],
          ),
        ),
      ],
    );
  }
}

/// The room-type picker, carrying live availability for the dates on the form.
///
/// A sold-out type is shown and disabled rather than dropped: "Deluxe · 0 of 4
/// free" tells the clerk something true, while a missing row reads as a broken
/// catalogue and prompts a phone call to IT.
class _RoomTypePicker extends StatelessWidget {
  const _RoomTypePicker({
    required this.availability,
    required this.value,
    required this.onChanged,
  });

  final AsyncValue<List<RoomTypeAvailability>> availability;
  final String? value;
  final ValueChanged<String?> onChanged;

  @override
  Widget build(BuildContext context) {
    return availability.when(
      loading: () => const Shimmer(height: 52, radius: R.md),
      error: (error, _) => ErrorState(error: error),
      data: (options) {
        if (options.isEmpty) {
          return const FieldNote(
            text:
                'There are no active room types yet. A booking has to be sold '
                'as something, so a manager needs to create one first.',
            icon: Icons.warning_amber_outlined,
          );
        }
        final ids = options.map((o) => o.roomTypeId).toSet();
        return DropdownButtonFormField<String>(
          initialValue: ids.contains(value) ? value : null,
          isExpanded: true,
          decoration: const InputDecoration(
            labelText: 'Room type',
            prefixIcon: Icon(Icons.bed_outlined, size: 20),
          ),
          items: [
            for (final option in options)
              DropdownMenuItem(
                value: option.roomTypeId,
                enabled: !option.soldOut,
                child: Text(
                  option.pickerLabel,
                  overflow: TextOverflow.ellipsis,
                  style: option.soldOut
                      ? TextStyle(color: context.colors.mutedForeground)
                      : null,
                ),
              ),
          ],
          onChanged: onChanged,
        );
      },
    );
  }
}

/// A read-only field that opens a date picker. A plain text field for a date
/// invites "14/3" and "next Tuesday", neither of which the API takes.
class _DateField extends StatelessWidget {
  const _DateField({
    required this.label,
    required this.value,
    required this.onTap,
  });

  final String label;
  final DateTime value;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return InkWell(
      onTap: onTap,
      borderRadius: R.rMd,
      child: InputDecorator(
        decoration: InputDecoration(
          labelText: label,
          prefixIcon: const Icon(Icons.event_outlined, size: 20),
        ),
        child: Text(Fmt.dayMonth(value)),
      ),
    );
  }
}

/// Adults and children. Steppers rather than a keyboard: the numbers are small
/// and a clerk with a queue should not be opening a numeric keypad for "2".
class _Counter extends StatelessWidget {
  const _Counter({
    required this.label,
    required this.value,
    required this.min,
    required this.onChanged,
  });

  final String label;
  final int value;
  final int min;
  final ValueChanged<int> onChanged;

  @override
  Widget build(BuildContext context) {
    return InputDecorator(
      decoration: InputDecoration(labelText: label),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          IconButton(
            visualDensity: VisualDensity.compact,
            onPressed: value > min ? () => onChanged(value - 1) : null,
            icon: const Icon(Icons.remove_circle_outline, size: 20),
          ),
          Text('$value', style: Theme.of(context).textTheme.titleMedium),
          IconButton(
            visualDensity: VisualDensity.compact,
            onPressed: value < 20 ? () => onChanged(value + 1) : null,
            icon: const Icon(Icons.add_circle_outline, size: 20),
          ),
        ],
      ),
    );
  }
}
