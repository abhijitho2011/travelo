import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/networking/api_exception.dart';
import '../../../core/permissions/permission_keys.dart';
import '../../../core/providers.dart';
import '../../../core/routing/routes.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/theme/app_spacing.dart';
import '../../../core/theme/app_typography.dart';
import '../../../core/widgets/status_badge.dart';
import '../../rooms/data/room_models.dart';
import '../application/reception_controllers.dart';
import '../application/reservation_calendar_controllers.dart';
import '../data/reception_models.dart';
import '../data/reception_repository.dart' show ReservationErrors;

const double _cellW = 52;
const double _rowH = 48;
const double _labelW = 128;
const double _dateHeadH = 46;

/// The grab area on a pill's right end, used to drag the check-out later.
const double _handleW = 16;

DateTime _dateOnly(DateTime d) => DateTime(d.year, d.month, d.day);
int _daysBetween(DateTime a, DateTime b) =>
    _dateOnly(b).difference(_dateOnly(a)).inDays;

const _monthsShort = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
];

String _dayMonth(DateTime d) => '${d.day} ${_monthsShort[d.month - 1]}';
String _dayMonthYear(DateTime d) => '${_dayMonth(d)} ${d.year}';

/// The statuses a pill may be dragged from. A stay that is over, called off or
/// never arrived is history — moving or extending it would be nonsense, and the
/// server would refuse it anyway.
bool _isLive(ReservationStatus s) =>
    s == ReservationStatus.pending ||
    s == ReservationStatus.confirmed ||
    s == ReservationStatus.checkedIn;

/// Carried by the right-edge handle so the date cells can tell an extend-drag
/// apart from a move-drag: the two DragTargets are typed, so each ignores the
/// other's payload without any coordination between them.
class _ExtendIntent {
  const _ExtendIntent(this.reservation);
  final Reservation reservation;
}

/// The front-desk reservation calendar — a room rack. Rooms are rows, dates are
/// columns, and every booking is a pill spanning the nights it holds, with the
/// guest's name and a night count.
///
/// What it can do:
///  * tap a pill to open the reservation; tap an empty cell to start one there
///    (the form opens prefilled with that room and date);
///  * long-press a pill and drop it on another room to move/assign it;
///  * long-press the grip on a pill's right end and drop it on a later date to
///    extend the stay.
///
/// Every mutation asks first and reports what the server said — a drag is easy
/// to start by accident, and moving a guest is not a silent operation.
class ReservationCalendarScreen extends ConsumerStatefulWidget {
  const ReservationCalendarScreen({super.key});

  @override
  ConsumerState<ReservationCalendarScreen> createState() =>
      _ReservationCalendarScreenState();
}

class _ReservationCalendarScreenState
    extends ConsumerState<ReservationCalendarScreen> {
  final _datesCtrl = ScrollController();
  final _gridCtrl = ScrollController();
  bool _syncing = false;
  bool _busy = false;

  @override
  void initState() {
    super.initState();
    _datesCtrl.addListener(() => _sync(_datesCtrl, _gridCtrl));
    _gridCtrl.addListener(() => _sync(_gridCtrl, _datesCtrl));
  }

  // Keep the date header and the grid body scrolled to the same horizontal
  // offset without the two listeners chasing each other into a loop.
  void _sync(ScrollController from, ScrollController to) {
    if (_syncing || !to.hasClients || !from.hasClients) return;
    if (to.offset == from.offset) return;
    _syncing = true;
    to.jumpTo(
      from.offset.clamp(
        to.position.minScrollExtent,
        to.position.maxScrollExtent,
      ),
    );
    _syncing = false;
  }

  @override
  void dispose() {
    _datesCtrl.dispose();
    _gridCtrl.dispose();
    super.dispose();
  }

  void _shift(int days) {
    final n = ref.read(calendarWindowStartProvider.notifier);
    n.state = _dateOnly(n.state.add(Duration(days: days)));
  }

  void _today() {
    ref.read(calendarWindowStartProvider.notifier).state = _dateOnly(
      DateTime.now(),
    );
  }

  bool get _canEdit => ref.watch(permissionsProvider).has(P.reservationUpdate);

  // ------------------------------------------------------------- mutations --

  Future<bool> _confirm(String title, String message) async {
    final ok = await showDialog<bool>(
      context: context,
      builder: (dialogContext) => AlertDialog(
        title: Text(title),
        content: Text(message),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(dialogContext, false),
            child: const Text('Cancel'),
          ),
          FilledButton(
            onPressed: () => Navigator.pop(dialogContext, true),
            child: const Text('Confirm'),
          ),
        ],
      ),
    );
    return ok == true;
  }

  /// Dropping a pill on another room. A guest already in the building is MOVED
  /// (the server re-quotes on a type change); anyone earlier in the stay is
  /// simply assigned the room.
  Future<void> _onDropMove(Reservation r, Room room) async {
    if (_busy || r.roomId == room.id) return;
    final inHouse = r.status == ReservationStatus.checkedIn;
    final ok = await _confirm(
      inHouse ? 'Move guest?' : 'Assign room?',
      inHouse
          ? '${r.guestName} will be moved to room ${room.number}.'
          : '${r.guestName} (${r.reservationNumber}) will be assigned room ${room.number}.',
    );
    if (!ok || !mounted) return;

    final messenger = ScaffoldMessenger.of(context);
    final actions = ref.read(reservationActionsProvider);
    setState(() => _busy = true);
    try {
      if (inHouse) {
        await actions.moveRoom(r.id, room.id);
      } else {
        await actions.assignRoom(r.id, room.id);
      }
      messenger.showSnackBar(
        SnackBar(content: Text('${r.guestName} → room ${room.number}')),
      );
    } on ApiException catch (e) {
      messenger.showSnackBar(
        SnackBar(content: Text(ReservationErrors.friendly(e))),
      );
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  /// Dropping the right-edge grip on a date. Check-out is EXCLUSIVE, so
  /// dropping on the 14th means "the 14th is the last night" → check-out 15th.
  Future<void> _onDropExtend(Reservation r, DateTime lastNight) async {
    if (_busy) return;
    final current = r.checkOut;
    if (current == null) return;
    final newCheckOut = _dateOnly(lastNight).add(const Duration(days: 1));
    if (!newCheckOut.isAfter(_dateOnly(current))) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('Drag past the current check-out to extend a stay.'),
        ),
      );
      return;
    }
    final extraNights = _daysBetween(current, newCheckOut);
    final ok = await _confirm(
      'Extend stay?',
      '${r.guestName} will stay $extraNights more '
          '${extraNights == 1 ? 'night' : 'nights'}, to ${_dayMonth(newCheckOut)}.',
    );
    if (!ok || !mounted) return;

    final messenger = ScaffoldMessenger.of(context);
    setState(() => _busy = true);
    try {
      await ref.read(reservationActionsProvider).extendStay(r.id, newCheckOut);
      messenger.showSnackBar(
        SnackBar(
          content: Text('${r.guestName} extended to ${_dayMonth(newCheckOut)}'),
        ),
      );
    } on ApiException catch (e) {
      messenger.showSnackBar(
        SnackBar(content: Text(ReservationErrors.friendly(e))),
      );
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  // ----------------------------------------------------------------- build --

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    final async = ref.watch(reservationCalendarProvider);

    return Scaffold(
      backgroundColor: c.background,
      body: SafeArea(
        top: false,
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            _header(context),
            _legend(context),
            if (_busy) const LinearProgressIndicator(minHeight: 2),
            Expanded(
              child: async.when(
                loading: () => const Center(child: CircularProgressIndicator()),
                error: (e, _) => _errorState(context, e),
                data: (data) => _rack(context, data),
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _header(BuildContext context) {
    final c = context.colors;
    final start = ref.watch(calendarWindowStartProvider);
    final end = start.add(const Duration(days: kCalendarWindowDays - 1));
    return Padding(
      padding: const EdgeInsets.fromLTRB(Sp.lg, Sp.md, Sp.lg, Sp.sm),
      child: Wrap(
        alignment: WrapAlignment.spaceBetween,
        crossAxisAlignment: WrapCrossAlignment.center,
        runSpacing: Sp.sm,
        children: [
          Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            mainAxisSize: MainAxisSize.min,
            children: [
              Text(
                'Reservation calendar',
                style: AppTypography.display(size: 19, color: c.foreground),
              ),
              const SizedBox(height: 2),
              Text(
                _canEdit
                    ? 'Drag a booking to move rooms · drag its grip to extend the stay'
                    : 'Every stay, room by room and night by night',
                style: AppTypography.body(size: 12, color: c.mutedForeground),
              ),
            ],
          ),
          Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              // The window, as one pill: ‹ 25 Aug – 7 Sep 2026 ›
              Container(
                height: 34,
                decoration: BoxDecoration(
                  color: c.card,
                  borderRadius: R.rPill,
                  border: Border.all(color: c.border),
                ),
                child: Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    _chevron(
                      c,
                      Icons.chevron_left,
                      () => _shift(-kCalendarWindowDays),
                    ),
                    Padding(
                      padding: const EdgeInsets.symmetric(horizontal: 2),
                      child: Text(
                        '${_dayMonth(start)} – ${_dayMonthYear(end)}',
                        style: AppTypography.body(
                          size: 12.5,
                          weight: FontWeight.w600,
                          color: c.foreground,
                        ),
                      ),
                    ),
                    _chevron(
                      c,
                      Icons.chevron_right,
                      () => _shift(kCalendarWindowDays),
                    ),
                  ],
                ),
              ),
              const SizedBox(width: Sp.sm),
              SizedBox(
                height: 34,
                child: OutlinedButton(
                  onPressed: _busy ? null : _today,
                  child: const Text('Today'),
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }

  Widget _chevron(AppColors c, IconData icon, VoidCallback onTap) => InkWell(
    onTap: _busy ? null : onTap,
    borderRadius: R.rPill,
    child: Padding(
      padding: const EdgeInsets.symmetric(horizontal: 6),
      child: Icon(icon, size: 18, color: c.mutedForeground),
    ),
  );

  /// Every status the pills can wear, dot + label, with the extend hint.
  Widget _legend(BuildContext context) {
    final c = context.colors;
    return Container(
      margin: const EdgeInsets.fromLTRB(Sp.lg, 0, Sp.lg, Sp.sm),
      padding: const EdgeInsets.symmetric(horizontal: Sp.md, vertical: 8),
      decoration: BoxDecoration(
        color: c.card,
        borderRadius: R.rMd,
        border: Border.all(color: c.border),
      ),
      child: SingleChildScrollView(
        scrollDirection: Axis.horizontal,
        child: Row(
          children: [
            for (final s in ReservationStatus.values) ...[
              Container(
                width: 8,
                height: 8,
                decoration: BoxDecoration(
                  color: s.tone.color(c),
                  shape: BoxShape.circle,
                ),
              ),
              const SizedBox(width: 5),
              Text(
                s.label,
                style: AppTypography.body(
                  size: 11.5,
                  weight: FontWeight.w500,
                  color: c.foreground.withValues(alpha: 0.75),
                ),
              ),
              const SizedBox(width: Sp.lg),
            ],
            Icon(Icons.info_outline, size: 13, color: c.mutedForeground),
            const SizedBox(width: 5),
            Text(
              _canEdit
                  ? 'Long-press to drag · the grip extends the stay'
                  : 'Tap a booking for its details',
              style: AppTypography.body(size: 11.5, color: c.mutedForeground),
            ),
          ],
        ),
      ),
    );
  }

  /// The rack itself: one rounded card holding the header, date row and lanes.
  Widget _rack(BuildContext context, CalendarData data) {
    final c = context.colors;
    final days = data.windowDays;
    final gridW = days * _cellW;
    final lanes = data.lanes;

    return Container(
      margin: const EdgeInsets.fromLTRB(Sp.lg, 0, Sp.lg, Sp.lg),
      clipBehavior: Clip.antiAlias,
      decoration: BoxDecoration(
        color: c.card,
        borderRadius: R.rLg,
        border: Border.all(color: c.border),
        boxShadow: c.elevation1,
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(Sp.lg, Sp.md, Sp.lg, Sp.md),
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.end,
              children: [
                Text(
                  'Room rack',
                  style: AppTypography.display(size: 15, color: c.foreground),
                ),
                const SizedBox(width: Sp.sm),
                Text(
                  '${data.rooms.length} '
                  '${data.rooms.length == 1 ? 'room' : 'rooms'} · $days nights',
                  style: AppTypography.body(
                    size: 11.5,
                    color: c.mutedForeground,
                  ),
                ),
              ],
            ),
          ),
          // Date header: fixed corner + horizontally scrolling day columns.
          SizedBox(
            height: _dateHeadH,
            child: Row(
              children: [
                _corner(c),
                Expanded(
                  child: SingleChildScrollView(
                    controller: _datesCtrl,
                    scrollDirection: Axis.horizontal,
                    child: SizedBox(
                      width: gridW,
                      child: Row(
                        children: [
                          for (int i = 0; i < days; i++)
                            _dayHead(
                              c,
                              data.windowStart.add(Duration(days: i)),
                            ),
                        ],
                      ),
                    ),
                  ),
                ),
              ],
            ),
          ),
          Expanded(
            child: SingleChildScrollView(
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  // Fixed left column. Rendered from the SAME lane list as the
                  // grid, so labels and rows can never drift apart.
                  Column(
                    children: [for (final lane in lanes) _laneLabel(c, lane)],
                  ),
                  Expanded(
                    child: SingleChildScrollView(
                      controller: _gridCtrl,
                      scrollDirection: Axis.horizontal,
                      child: Column(
                        children: [
                          for (final lane in lanes)
                            _laneRow(c, lane, data, gridW),
                        ],
                      ),
                    ),
                  ),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _laneLabel(AppColors c, CalendarLane lane) => switch (lane) {
    CalendarUnassignedLane(:final count) => Container(
      width: _labelW,
      height: _rowH,
      padding: const EdgeInsets.symmetric(horizontal: Sp.md),
      decoration: BoxDecoration(
        color: c.surface,
        border: Border(
          right: BorderSide(color: c.border),
          bottom: BorderSide(color: c.border),
        ),
      ),
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            'Unassigned',
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            style: AppTypography.body(
              size: 12.5,
              weight: FontWeight.w600,
              color: c.foreground,
            ),
          ),
          Text(
            '$count awaiting a room',
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            style: AppTypography.body(size: 10, color: c.mutedForeground),
          ),
        ],
      ),
    ),
    // "101  Deluxe" — number bold, type muted beside it, as the rack reads.
    CalendarRoomLane(:final room) => Container(
      width: _labelW,
      height: _rowH,
      padding: const EdgeInsets.symmetric(horizontal: Sp.md),
      alignment: Alignment.centerLeft,
      decoration: BoxDecoration(
        color: c.surface,
        border: Border(
          right: BorderSide(color: c.border),
          bottom: BorderSide(color: c.border),
        ),
      ),
      child: Row(
        children: [
          Text(
            room.number,
            style: AppTypography.body(
              size: 13.5,
              weight: FontWeight.w700,
              color: c.foreground,
            ),
          ),
          const SizedBox(width: 8),
          Expanded(
            child: Text(
              room.roomTypeName,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: AppTypography.body(size: 10.5, color: c.mutedForeground),
            ),
          ),
        ],
      ),
    ),
  };

  Widget _laneRow(
    AppColors c,
    CalendarLane lane,
    CalendarData data,
    double gridW,
  ) => switch (lane) {
    CalendarUnassignedLane() => _TapeRow(
      width: gridW,
      windowStart: data.windowStart,
      days: data.windowDays,
      reservations: data.unassigned,
      canEdit: _canEdit,
      onOpen: (r) => context.go(Routes.reservation(r.id)),
      onExtend: _onDropExtend,
    ),
    CalendarRoomLane(:final room) => DragTarget<Reservation>(
      onWillAcceptWithDetails: (d) => _canEdit && d.data.roomId != room.id,
      onAcceptWithDetails: (d) => _onDropMove(d.data, room),
      builder: (context, candidate, _) => _TapeRow(
        width: gridW,
        windowStart: data.windowStart,
        days: data.windowDays,
        reservations: data.byRoom[room.id] ?? const [],
        canEdit: _canEdit,
        highlight: candidate.isNotEmpty,
        onOpen: (r) => context.go(Routes.reservation(r.id)),
        onExtend: _onDropExtend,
        onEmptyTap: (date) => context.go(
          Routes.reservationNew,
          extra: NewBookingSeed(
            checkIn: date,
            roomId: room.id,
            roomTypeId: room.roomTypeId,
          ),
        ),
      ),
    ),
  };

  Widget _corner(AppColors c) => Container(
    width: _labelW,
    height: _dateHeadH,
    decoration: BoxDecoration(
      color: c.surface,
      border: Border(
        right: BorderSide(color: c.border),
        bottom: BorderSide(color: c.border),
      ),
    ),
    alignment: Alignment.centerLeft,
    padding: const EdgeInsets.only(left: Sp.md),
    child: Text('ROOM', style: AppTypography.labelXs(c.mutedForeground)),
  );

  Widget _dayHead(AppColors c, DateTime day) {
    final isToday = _dateOnly(day) == _dateOnly(DateTime.now());
    final weekend =
        day.weekday == DateTime.saturday || day.weekday == DateTime.sunday;
    return Container(
      width: _cellW,
      height: _dateHeadH,
      decoration: BoxDecoration(
        color: isToday ? c.accent : (weekend ? c.surface : c.card),
        border: Border(
          right: BorderSide(color: c.border),
          bottom: BorderSide(color: c.border),
        ),
      ),
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Text(
            _weekday(day).toUpperCase(),
            style: AppTypography.body(
              size: 9,
              weight: FontWeight.w600,
              color: isToday ? c.primary : c.mutedForeground,
            ).copyWith(letterSpacing: 0.5),
          ),
          const SizedBox(height: 1),
          Text(
            '${day.day}',
            style: AppTypography.body(
              size: 13.5,
              weight: FontWeight.w600,
              color: isToday ? c.primary : c.foreground,
            ),
          ),
        ],
      ),
    );
  }

  Widget _errorState(BuildContext context, Object e) {
    final c = context.colors;
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(Sp.xl),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(Icons.event_busy_outlined, size: 40, color: c.mutedForeground),
            const SizedBox(height: Sp.md),
            Text(
              'Could not load the calendar',
              style: AppTypography.body(
                size: 14,
                weight: FontWeight.w600,
                color: c.foreground,
              ),
            ),
            const SizedBox(height: Sp.xs),
            Text(
              '$e',
              textAlign: TextAlign.center,
              style: AppTypography.body(size: 12, color: c.mutedForeground),
            ),
            const SizedBox(height: Sp.md),
            FilledButton(
              onPressed: () => ref.invalidate(reservationCalendarProvider),
              child: const Text('Retry'),
            ),
          ],
        ),
      ),
    );
  }

  static String _weekday(DateTime d) =>
      const ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'][d.weekday - 1];
}

/// One lane's grid: empty date cells (tap to start a booking, or drop an
/// extend-grip on to lengthen a stay) with the reservation pills over them.
class _TapeRow extends StatelessWidget {
  const _TapeRow({
    required this.width,
    required this.windowStart,
    required this.days,
    required this.reservations,
    required this.canEdit,
    required this.onOpen,
    required this.onExtend,
    this.onEmptyTap,
    this.highlight = false,
  });

  final double width;
  final DateTime windowStart;
  final int days;
  final List<Reservation> reservations;
  final bool canEdit;
  final bool highlight;
  final void Function(Reservation) onOpen;
  final Future<void> Function(Reservation, DateTime) onExtend;

  /// Null on the unassigned lane — there is no room to book into there.
  final void Function(DateTime)? onEmptyTap;

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    return SizedBox(
      width: width,
      height: _rowH,
      child: Stack(
        children: [
          // Grid cells. Each is also the extend-drop target for its own date.
          Row(
            children: [
              for (int i = 0; i < days; i++)
                _cell(context, c, windowStart.add(Duration(days: i))),
            ],
          ),
          // Reservation pills.
          for (final pill in _pills(context)) pill,
        ],
      ),
    );
  }

  Widget _cell(BuildContext context, AppColors c, DateTime date) {
    final weekend =
        date.weekday == DateTime.saturday || date.weekday == DateTime.sunday;
    // Typed target: only an extend-grip lands here. A whole-pill move carries
    // a Reservation and is caught by the row's own DragTarget instead.
    return DragTarget<_ExtendIntent>(
      onWillAcceptWithDetails: (_) => canEdit,
      onAcceptWithDetails: (d) => onExtend(d.data.reservation, date),
      builder: (context, candidate, _) => GestureDetector(
        behavior: HitTestBehavior.opaque,
        onTap: onEmptyTap == null ? null : () => onEmptyTap!(date),
        child: Container(
          width: _cellW,
          height: _rowH,
          decoration: BoxDecoration(
            color: candidate.isNotEmpty
                ? c.primary.withValues(alpha: 0.14)
                : (highlight
                      ? c.accent.withValues(alpha: 0.5)
                      : (weekend ? c.surface.withValues(alpha: 0.55) : null)),
            border: Border(
              right: BorderSide(color: c.border.withValues(alpha: 0.55)),
              bottom: BorderSide(color: c.border),
            ),
          ),
        ),
      ),
    );
  }

  List<Widget> _pills(BuildContext context) {
    final out = <Widget>[];
    for (final r in reservations) {
      final ci = r.checkIn;
      final co = r.checkOut;
      if (ci == null || co == null) continue;
      final startIdx = _daysBetween(windowStart, ci).clamp(0, days);
      final endIdx = _daysBetween(
        windowStart,
        co,
      ).clamp(0, days); // checkout exclusive
      if (endIdx <= startIdx) continue;

      final draggable = canEdit && _isLive(r.status);
      // True when the real check-out falls inside the window, so the grip sits
      // on the stay's actual end rather than on the window's edge.
      final endsInWindow = _daysBetween(windowStart, co) <= days;

      out.add(
        Positioned(
          left: startIdx * _cellW + 2,
          top: 7,
          width: (endIdx - startIdx) * _cellW - 4,
          height: _rowH - 14,
          child: _Pill(
            reservation: r,
            draggable: draggable,
            showHandle: draggable && endsInWindow,
            onOpen: () => onOpen(r),
          ),
        ),
      );
    }
    return out;
  }
}

/// A booking pill: guest name + night count, styled by status. Confirmed reads
/// as a clean outlined pill on the card surface; every other status wears its
/// tone as a tint with a leading dot. Tap opens; long-press drags; the grip on
/// the right end (live stays only) drags the check-out later.
class _Pill extends StatelessWidget {
  const _Pill({
    required this.reservation,
    required this.draggable,
    required this.showHandle,
    required this.onOpen,
  });

  final Reservation reservation;
  final bool draggable;
  final bool showHandle;
  final VoidCallback onOpen;

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    final tone = reservation.status.tone.color(c);
    final confirmed = reservation.status == ReservationStatus.confirmed;

    final bg = confirmed ? c.card : tone.withValues(alpha: 0.13);
    final borderColor = confirmed
        ? c.foreground.withValues(alpha: 0.55)
        : tone.withValues(alpha: 0.5);
    final nights = reservation.nights;

    final body = GestureDetector(
      onTap: onOpen,
      child: Container(
        padding: EdgeInsets.only(
          left: 10,
          right: showHandle ? _handleW + 4 : 8,
        ),
        alignment: Alignment.centerLeft,
        decoration: BoxDecoration(
          color: bg,
          borderRadius: R.rPill,
          border: Border.all(color: borderColor),
          boxShadow: confirmed ? c.elevation1 : null,
        ),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            if (!confirmed) ...[
              Container(
                width: 7,
                height: 7,
                decoration: BoxDecoration(color: tone, shape: BoxShape.circle),
              ),
              const SizedBox(width: 6),
            ],
            Flexible(
              child: Text(
                reservation.guestName,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: AppTypography.body(
                  size: 11.5,
                  weight: FontWeight.w600,
                  color: c.foreground,
                ),
              ),
            ),
            if (nights > 0) ...[
              const SizedBox(width: 6),
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 5, vertical: 1),
                decoration: BoxDecoration(
                  borderRadius: R.rPill,
                  border: Border.all(color: c.border),
                ),
                child: Text(
                  '${nights}N',
                  style: AppTypography.body(
                    size: 9.5,
                    weight: FontWeight.w600,
                    color: c.mutedForeground,
                  ),
                ),
              ),
            ],
          ],
        ),
      ),
    );

    // Long-press to drag: a plain drag belongs to the scroll views this chart
    // lives inside, so the two never fight over the same gesture.
    final movable = draggable
        ? LongPressDraggable<Reservation>(
            data: reservation,
            dragAnchorStrategy: pointerDragAnchorStrategy,
            feedback: _feedback(context, reservation.guestName),
            childWhenDragging: Opacity(opacity: 0.35, child: body),
            child: body,
          )
        : body;

    return Tooltip(
      message:
          '${reservation.reservationNumber} · ${reservation.guestName}\n'
          '${reservation.status.label}',
      child: Stack(
        children: [
          Positioned.fill(child: movable),
          if (showHandle)
            Positioned(
              right: 2,
              top: 2,
              bottom: 2,
              width: _handleW,
              child: LongPressDraggable<_ExtendIntent>(
                data: _ExtendIntent(reservation),
                dragAnchorStrategy: pointerDragAnchorStrategy,
                feedback: _feedback(context, 'Extend stay'),
                child: MouseRegion(
                  cursor: SystemMouseCursors.resizeLeftRight,
                  child: Container(
                    decoration: BoxDecoration(
                      color: tone.withValues(alpha: 0.22),
                      borderRadius: R.rPill,
                    ),
                    alignment: Alignment.center,
                    child: Icon(
                      Icons.drag_indicator,
                      size: 10,
                      color: c.foreground.withValues(alpha: 0.5),
                    ),
                  ),
                ),
              ),
            ),
        ],
      ),
    );
  }

  Widget _feedback(BuildContext context, String label) {
    final c = context.colors;
    final tone = reservation.status.tone.color(c);
    return Material(
      color: Colors.transparent,
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 7),
        decoration: BoxDecoration(
          color: c.card,
          borderRadius: R.rPill,
          border: Border.all(color: tone),
          boxShadow: c.elevation2,
        ),
        child: Text(
          label,
          style: AppTypography.body(
            size: 12,
            weight: FontWeight.w600,
            color: c.foreground,
          ),
        ),
      ),
    );
  }
}
