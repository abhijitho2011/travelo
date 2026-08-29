import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/networking/api_exception.dart';
import '../../../core/permissions/permission_gate.dart';
import '../../../core/permissions/permission_keys.dart';
import '../../../core/routing/routes.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/theme/app_spacing.dart';
import '../../../core/theme/app_typography.dart';
import '../../../core/utils/formatting.dart';
import '../../../core/widgets/cards.dart';
import '../../../core/widgets/primitives.dart';
import '../../../core/widgets/states.dart';
import '../../rooms/presentation/room_widgets.dart'
    show FieldNote, FormErrorNote;
import '../application/reception_controllers.dart';
import '../data/reception_models.dart';
import '../data/reception_repository.dart';
import 'room_picker_sheet.dart';

/// The guided check-in.
///
/// Four steps, because four things actually happen at the desk: you look at
/// the booking, you write down the ID, you pick a room, and you hand over the
/// key. Every step feeds the ONE request that admits the guest — there is no
/// step here that does not end up in `POST /reservations/:id/check-in`, which
/// is what stops the flow becoming a wizard nobody finishes.
///
/// Nothing is written until the last step. A clerk interrupted halfway leaves
/// the booking exactly as they found it, rather than half-arrived.
class CheckInScreen extends ConsumerWidget {
  const CheckInScreen({super.key, this.reservationId});

  final String? reservationId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final id = reservationId;
    if (id == null || id.isEmpty) {
      return PageBody(
        children: [
          const PageHeader(
            eyebrow: 'Front office',
            title: 'Check in',
            subtitle: 'Start from the booking you are admitting.',
          ),
          gapSection,
          EmptyState(
            title: 'Pick a booking first',
            hint:
                'Check-in attaches to a reservation. Open today’s arrivals and '
                'start from the guest in front of you.',
            icon: Icons.event_note_outlined,
            action: FilledButton(
              onPressed: () => context.go(Routes.reception),
              child: const Text('Today’s arrivals'),
            ),
          ),
        ],
      );
    }

    return ref
        .watch(reservationProvider(id))
        .when(
          loading: () => const PageBody(children: [ListSkeleton(rows: 3)]),
          error: (error, _) => PageBody(
            children: [
              ErrorState(
                error: error,
                onRetry: () => ref.invalidate(reservationProvider(id)),
              ),
            ],
          ),
          data: (reservation) => reservation == null
              ? PageBody(
                  children: [
                    EmptyState(
                      title: 'That booking is gone',
                      hint:
                          'It may have been cancelled since this screen was '
                          'opened.',
                      icon: Icons.search_off_outlined,
                      action: OutlinedButton(
                        onPressed: () => context.go(Routes.reception),
                        child: const Text('Back to the desk'),
                      ),
                    ),
                  ],
                )
              : _CheckInFlow(reservation: reservation),
        );
  }
}

class _CheckInFlow extends ConsumerStatefulWidget {
  const _CheckInFlow({required this.reservation});

  final Reservation reservation;

  @override
  ConsumerState<_CheckInFlow> createState() => _CheckInFlowState();
}

class _CheckInFlowState extends ConsumerState<_CheckInFlow> {
  static const _idTypes = <String>[
    'AADHAAR',
    'PASSPORT',
    'DRIVING_LICENCE',
    'VOTER_ID',
    'PAN',
    'OTHER',
  ];

  int _index = 0;
  final _idNumber = TextEditingController();
  String? _idType;
  String? _roomId;
  String? _roomNumber;

  bool _busy = false;
  String? _error;

  @override
  void initState() {
    super.initState();
    final r = widget.reservation;
    // A booking that already carries an ID or a room starts with those steps
    // filled in — re-typing a passport number the guest gave over the phone is
    // the kind of busywork that gets a PMS worked around.
    _idType = r.guestIdType;
    _idNumber.text = r.guestIdNumber ?? '';
    _roomId = r.roomId;
    _roomNumber = r.roomNumber;
  }

  @override
  void dispose() {
    _idNumber.dispose();
    super.dispose();
  }

  List<CheckInStep> get _steps => CheckInStep.ordered;

  CheckInStep get _current => _steps[_index];

  /// Whether the step showing can be left. Only the two steps that collect
  /// something can block, and only on the thing the server actually needs.
  bool get _canAdvance => switch (_current) {
    CheckInStep.verifyGuest => true,
    // The ID is a legal requirement for a hotel in India, so a blank one stops
    // the flow here rather than being discovered at audit time.
    CheckInStep.captureId =>
      _idType != null && _idNumber.text.trim().isNotEmpty,
    CheckInStep.assignRoom => _roomId != null,
    CheckInStep.confirm => true,
  };

  Future<void> _pickRoom() async {
    final r = widget.reservation;
    final roomId = await RoomPickerSheet.show(
      context,
      roomTypeId: r.roomTypeId,
      roomTypeName: r.roomTypeName,
    );
    if (roomId == null) return;
    // The sheet only ever offers rooms of the right type in a fit state, so
    // the number is looked up from the same list rather than re-fetched.
    final rooms = ref.read(assignableRoomsProvider(r.roomTypeId)).value;
    setState(() {
      _roomId = roomId;
      _roomNumber = rooms?.where((x) => x.id == roomId).firstOrNull?.number;
      _error = null;
    });
  }

  void _next() {
    if (!_canAdvance) return;
    setState(() {
      _index = (_index + 1).clamp(0, _steps.length - 1);
      _error = null;
    });
  }

  void _back() => setState(() {
    _index = (_index - 1).clamp(0, _steps.length - 1);
    _error = null;
  });

  Future<void> _finish() async {
    setState(() {
      _busy = true;
      _error = null;
    });
    final r = widget.reservation;
    final messenger = ScaffoldMessenger.of(context);
    final router = GoRouter.of(context);
    try {
      final result = await ref
          .read(reservationActionsProvider)
          .checkIn(
            r.id,
            roomId: _roomId,
            guestIdType: _idType,
            guestIdNumber: _idNumber.text.trim(),
          );
      messenger.showSnackBar(
        SnackBar(
          content: Text(
            '${result.guestName} checked in to room '
            '${result.roomNumber ?? _roomNumber ?? ''}',
          ),
        ),
      );
      router.go(Routes.reservation(r.id));
    } on ApiException catch (e) {
      if (mounted) setState(() => _error = ReservationErrors.friendly(e));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    final r = widget.reservation;
    final steps = _steps;
    final isLast = _index == steps.length - 1;

    return PageBody(
      children: [
        Align(
          alignment: Alignment.centerLeft,
          child: TextButton.icon(
            onPressed: () => context.go(Routes.reservation(r.id)),
            icon: const Icon(Icons.arrow_back, size: 16),
            label: const Text('Booking'),
          ),
        ),
        PageHeader(
          eyebrow: 'Front office · ${r.reservationNumber}',
          title: 'Check in ${r.guestName}',
          subtitle: 'Step ${_index + 1} of ${steps.length} · '
              '${_current.title}',
        ),
        gapMd,

        ClipRRect(
          borderRadius: BorderRadius.circular(999),
          child: LinearProgressIndicator(
            value: (_index + 1) / steps.length,
            minHeight: 6,
            backgroundColor: c.muted,
          ),
        ),
        gapSection,

        // Every step is listed, not just the one showing. A clerk who can see
        // what is still coming does not have to guess how long this will take.
        for (var i = 0; i < steps.length; i++)
          Padding(
            padding: const EdgeInsets.only(bottom: 6),
            child: _StepTile(
              step: steps[i],
              index: i,
              state: i < _index
                  ? _StepState.done
                  : i == _index
                  ? _StepState.current
                  : _StepState.pending,
              onTap: i < _index ? () => setState(() => _index = i) : null,
            ),
          ),
        gapSection,

        SoftCard(
          child: switch (_current) {
            CheckInStep.verifyGuest => _VerifyGuest(reservation: r),
            CheckInStep.captureId => _CaptureId(
              idTypes: _idTypes,
              idType: _idType,
              controller: _idNumber,
              onTypeChanged: (v) => setState(() => _idType = v),
              onNumberChanged: () => setState(() {}),
            ),
            CheckInStep.assignRoom => _AssignRoom(
              reservation: r,
              roomNumber: _roomNumber,
              onPick: _pickRoom,
            ),
            CheckInStep.confirm => _ConfirmArrival(
              reservation: r,
              roomNumber: _roomNumber,
              idType: _idType,
              idNumber: _idNumber.text.trim(),
            ),
          },
        ),

        if (_error != null) ...[gapMd, FormErrorNote(message: _error!)],

        gapSection,
        Row(
          children: [
            if (_index > 0)
              Expanded(
                child: OutlinedButton(
                  onPressed: _busy ? null : _back,
                  child: const Text('Back'),
                ),
              ),
            if (_index > 0) const SizedBox(width: Sp.md),
            Expanded(
              flex: 2,
              child: PermissionGate(
                permission: P.checkInPerform,
                fallback: const PermissionNote(
                  text:
                      'Your role can see this booking but not admit the guest. '
                      'Reception and management check people in.',
                ),
                child: FilledButton(
                  onPressed: _busy || !_canAdvance
                      ? null
                      : (isLast ? _finish : _next),
                  child: _busy
                      ? const SizedBox(
                          width: 18,
                          height: 18,
                          child: CircularProgressIndicator(strokeWidth: 2),
                        )
                      : Text(isLast ? 'Check in' : _current.doneLabel),
                ),
              ),
            ),
          ],
        ),
      ],
    );
  }
}

enum _StepState { done, current, pending }

class _StepTile extends StatelessWidget {
  const _StepTile({
    required this.step,
    required this.index,
    required this.state,
    this.onTap,
  });

  final CheckInStep step;
  final int index;
  final _StepState state;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    final tint = switch (state) {
      _StepState.done => c.healthy,
      _StepState.current => c.primary,
      _StepState.pending => c.mutedForeground,
    };
    return Material(
      color: Colors.transparent,
      child: InkWell(
        onTap: onTap,
        borderRadius: R.rMd,
        child: Container(
          padding: const EdgeInsets.symmetric(
            horizontal: Sp.md,
            vertical: Sp.sm,
          ),
          decoration: BoxDecoration(
            color: state == _StepState.current
                ? tint.withValues(alpha: 0.08)
                : Colors.transparent,
            borderRadius: R.rMd,
            border: Border.all(
              color: state == _StepState.current
                  ? tint.withValues(alpha: 0.45)
                  : c.border,
            ),
          ),
          child: Row(
            children: [
              Icon(
                state == _StepState.done
                    ? Icons.check_circle
                    : Icons.radio_button_unchecked,
                size: 18,
                color: tint,
              ),
              const SizedBox(width: Sp.md),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      '${index + 1}. ${step.title}',
                      style: AppTypography.body(
                        size: 13.5,
                        weight: FontWeight.w600,
                        color: state == _StepState.pending
                            ? c.mutedForeground
                            : c.foreground,
                      ),
                    ),
                    if (state == _StepState.current)
                      Text(
                        step.detail,
                        style: AppTypography.body(
                          size: 11.5,
                          color: c.mutedForeground,
                        ),
                      ),
                  ],
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

/// Step 1 — the booking, printed plainly so it can be read against the person
/// standing at the desk.
class _VerifyGuest extends StatelessWidget {
  const _VerifyGuest({required this.reservation});

  final Reservation reservation;

  @override
  Widget build(BuildContext context) {
    final r = reservation;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        const LabelXs('Verify the booking'),
        const SizedBox(height: Sp.md),
        ReservationCard(
          guestName: r.guestName,
          reference: r.reservationNumber,
          stay: r.stayLine,
          statusLabel: r.status.label,
          statusTone: r.tone,
          roomLabel: r.roomLabel,
        ),
        const SizedBox(height: Sp.md),
        _Line(label: 'Arriving', value: Fmt.dayMonth(r.checkIn)),
        _Line(label: 'Leaving', value: Fmt.dayMonth(r.checkOut)),
        _Line(label: 'Nights', value: r.nightsLabel),
        _Line(label: 'Guests', value: r.guestMixLabel),
        _Line(label: 'Mobile', value: r.guestPhone ?? Fmt.dash),
      ],
    );
  }
}

/// Step 2 — the ID. Two fields, both of which go straight onto the booking.
class _CaptureId extends StatelessWidget {
  const _CaptureId({
    required this.idTypes,
    required this.idType,
    required this.controller,
    required this.onTypeChanged,
    required this.onNumberChanged,
  });

  final List<String> idTypes;
  final String? idType;
  final TextEditingController controller;
  final ValueChanged<String?> onTypeChanged;
  final VoidCallback onNumberChanged;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        const LabelXs('Identification'),
        const SizedBox(height: 6),
        const FieldNote(
          text:
              'A hotel in India has to record an ID for every guest it admits. '
              'Both fields are kept on the booking.',
        ),
        const SizedBox(height: Sp.md),
        DropdownButtonFormField<String>(
          initialValue: idTypes.contains(idType) ? idType : null,
          isExpanded: true,
          decoration: const InputDecoration(
            labelText: 'ID type',
            prefixIcon: Icon(Icons.badge_outlined, size: 20),
          ),
          items: [
            for (final type in idTypes)
              DropdownMenuItem(value: type, child: Text(Fmt.humanise(type))),
          ],
          onChanged: onTypeChanged,
        ),
        gapMd,
        TextField(
          controller: controller,
          textCapitalization: TextCapitalization.characters,
          decoration: const InputDecoration(
            labelText: 'ID number',
            hintText: 'As printed on the document',
            prefixIcon: Icon(Icons.pin_outlined, size: 20),
          ),
          onChanged: (_) => onNumberChanged(),
        ),
      ],
    );
  }
}

/// Step 3 — the room. The picker does the narrowing; this step only shows
/// what was chosen and lets it be changed.
class _AssignRoom extends StatelessWidget {
  const _AssignRoom({
    required this.reservation,
    required this.roomNumber,
    required this.onPick,
  });

  final Reservation reservation;
  final String? roomNumber;
  final VoidCallback onPick;

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        const LabelXs('The room'),
        const SizedBox(height: 6),
        FieldNote(
          text:
              'Only clean, ready ${reservation.roomTypeName ?? 'rooms'} of the '
              'type this booking was sold as are offered.',
        ),
        const SizedBox(height: Sp.md),
        if (roomNumber != null)
          Container(
            padding: const EdgeInsets.all(Sp.md),
            decoration: BoxDecoration(
              color: c.healthy.withValues(alpha: 0.08),
              borderRadius: R.rMd,
              border: Border.all(color: c.healthy.withValues(alpha: 0.4)),
            ),
            child: Row(
              children: [
                Icon(Icons.meeting_room_outlined, size: 18, color: c.healthy),
                const SizedBox(width: Sp.md),
                Expanded(
                  child: Text(
                    'Room $roomNumber',
                    style: AppTypography.body(
                      size: 14,
                      weight: FontWeight.w600,
                      color: c.foreground,
                    ),
                  ),
                ),
              ],
            ),
          ),
        const SizedBox(height: Sp.md),
        OutlinedButton.icon(
          onPressed: onPick,
          icon: const Icon(Icons.search, size: 16),
          label: Text(roomNumber == null ? 'Pick a room' : 'Pick another room'),
        ),
      ],
    );
  }
}

/// Step 4 — everything that is about to be written, before it is written.
class _ConfirmArrival extends StatelessWidget {
  const _ConfirmArrival({
    required this.reservation,
    required this.roomNumber,
    required this.idType,
    required this.idNumber,
  });

  final Reservation reservation;
  final String? roomNumber;
  final String? idType;
  final String idNumber;

  @override
  Widget build(BuildContext context) {
    final r = reservation;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        const LabelXs('Ready to admit'),
        const SizedBox(height: Sp.md),
        _Line(label: 'Guest', value: r.guestName),
        _Line(label: 'Room', value: roomNumber ?? Fmt.dash),
        _Line(
          label: 'ID',
          value: idType == null ? Fmt.dash : '${Fmt.humanise(idType!)} $idNumber',
        ),
        _Line(label: 'Nights', value: r.nightsLabel),
        _Line(label: 'Balance', value: r.balanceLabel),
        const SizedBox(height: Sp.md),
        const FieldNote(
          text:
              'Checking in marks the room occupied. Nothing above has been '
              'saved yet.',
          icon: Icons.info_outline,
        ),
      ],
    );
  }
}

class _Line extends StatelessWidget {
  const _Line({required this.label, required this.value});

  final String label;
  final String value;

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    return Padding(
      padding: const EdgeInsets.only(bottom: 6),
      child: Row(
        children: [
          Expanded(
            child: Text(
              label,
              style: AppTypography.body(size: 13, color: c.mutedForeground),
            ),
          ),
          Flexible(
            child: Text(
              value,
              textAlign: TextAlign.right,
              style: AppTypography.body(
                size: 13.5,
                weight: FontWeight.w600,
                color: c.foreground,
              ),
            ),
          ),
        ],
      ),
    );
  }
}
