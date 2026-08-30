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
import '../application/reservation_calendar_controllers.dart';
import '../application/reception_controllers.dart';
import '../data/reception_models.dart';
import '../data/reception_repository.dart' show ReservationErrors;

const double _cellW = 48;
const double _rowH = 46;
const double _groupH = 30;
const double _labelW = 128;
const double _dateHeadH = 44;

/// The width of the grab handle on a bar's right edge, used to extend a stay.
const double _handleW = 14;

DateTime _dateOnly(DateTime d) => DateTime(d.year, d.month, d.day);
int _daysBetween(DateTime a, DateTime b) => _dateOnly(b).difference(_dateOnly(a)).inDays;

/// The statuses a bar may be dragged from. A stay that is over, called off or
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

/// The front-desk reservation calendar — a tape chart of rooms (rows) against dates
/// (columns), with each reservation drawn as a bar across the nights it holds.
///
/// What it can do:
///  * tap a bar to open the reservation, tap an empty cell to start one there
///    (the form opens prefilled with that room and date);
///  * long-press a bar and drop it on another room to move/assign it;
///  * long-press the handle on a bar's right edge and drop it on a later date
///    to extend the stay.
///
/// Every mutation asks first and reports what the server said — a drag is easy
/// to start by accident, and moving a guest is not a silent operation.
class ReservationCalendarScreen extends ConsumerStatefulWidget {
  const ReservationCalendarScreen({super.key});

  @override
  ConsumerState<ReservationCalendarScreen> createState() => _ReservationCalendarScreenState();
}

class _ReservationCalendarScreenState extends ConsumerState<ReservationCalendarScreen> {
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
    to.jumpTo(from.offset.clamp(to.position.minScrollExtent, to.position.maxScrollExtent));
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
    ref.read(calendarWindowStartProvider.notifier).state = _dateOnly(DateTime.now());
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

  /// Dropping a bar on another room. A guest already in the building is MOVED
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

  /// Dropping the right-edge handle on a date. Check-out is EXCLUSIVE, so
  /// dropping on the 14th means "the 14th is the last night" → check-out 15th.
  Future<void> _onDropExtend(Reservation r, DateTime lastNight) async {
    if (_busy) return;
    final current = r.checkOut;
    if (current == null) return;
    final newCheckOut = _dateOnly(lastNight).add(const Duration(days: 1));
    if (!newCheckOut.isAfter(_dateOnly(current))) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Drag past the current check-out to extend a stay.')),
      );
      return;
    }
    final extraNights = _daysBetween(current, newCheckOut);
    final ok = await _confirm(
      'Extend stay?',
      '${r.guestName} will stay $extraNights more '
      '${extraNights == 1 ? 'night' : 'nights'}, to ${_monthDay(newCheckOut)}.',
    );
    if (!ok || !mounted) return;

    final messenger = ScaffoldMessenger.of(context);
    setState(() => _busy = true);
    try {
      await ref.read(reservationActionsProvider).extendStay(r.id, newCheckOut);
      messenger.showSnackBar(
        SnackBar(content: Text('${r.guestName} extended to ${_monthDay(newCheckOut)}')),
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
            _toolbar(context),
            const _StatusLegend(),
            if (_busy) const LinearProgressIndicator(minHeight: 2),
            Expanded(
              child: async.when(
                loading: () => const Center(child: CircularProgressIndicator()),
                error: (e, _) => _errorState(context, e),
                data: (data) => _chart(context, data),
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _toolbar(BuildContext context) {
    final c = context.colors;
    final start = ref.watch(calendarWindowStartProvider);
    final end = start.add(const Duration(days: kCalendarWindowDays - 1));
    return Container(
      padding: const EdgeInsets.fromLTRB(Sp.lg, Sp.md, Sp.md, Sp.sm),
      decoration: BoxDecoration(color: c.background),
      child: Row(
        children: [
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  'Reservation calendar',
                  style: AppTypography.display(size: 18, color: c.foreground),
                ),
                Text(
                  '${_monthDay(start)} – ${_monthDay(end)}',
                  style: AppTypography.body(size: 12.5, color: c.mutedForeground),
                ),
              ],
            ),
          ),
          IconButton(
            tooltip: 'Previous',
            color: c.foreground,
            onPressed: _busy ? null : () => _shift(-kCalendarWindowDays),
            icon: const Icon(Icons.chevron_left, size: 22),
          ),
          OutlinedButton(onPressed: _busy ? null : _today, child: const Text('Today')),
          IconButton(
            tooltip: 'Next',
            color: c.foreground,
            onPressed: _busy ? null : () => _shift(kCalendarWindowDays),
            icon: const Icon(Icons.chevron_right, size: 22),
          ),
        ],
      ),
    );
  }

  Widget _chart(BuildContext context, CalendarData data) {
    final c = context.colors;
    final days = data.windowDays;
    final gridW = days * _cellW;
    final lanes = data.lanes;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
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
                          _dayHead(c, data.windowStart.add(Duration(days: i))),
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
                        for (final lane in lanes) _laneRow(c, lane, data, gridW),
                      ],
                    ),
                  ),
                ),
              ],
            ),
          ),
        ),
      ],
    );
  }

  Widget _laneLabel(AppColors c, CalendarLane lane) => switch (lane) {
    CalendarGroupLane(:final title, :final roomCount) => Container(
      width: _labelW,
      height: _groupH,
      padding: const EdgeInsets.symmetric(horizontal: Sp.md),
      alignment: Alignment.centerLeft,
      decoration: BoxDecoration(
        color: c.muted,
        border: Border(
          right: BorderSide(color: c.border),
          bottom: BorderSide(color: c.border),
        ),
      ),
      child: Text(
        '${title.toUpperCase()} · $roomCount',
        maxLines: 1,
        overflow: TextOverflow.ellipsis,
        style: AppTypography.labelXs(c.mutedForeground),
      ),
    ),
    CalendarUnassignedLane(:final count) => _rowLabel(
      c,
      title: 'Unassigned',
      subtitle: '$count awaiting a room',
    ),
    CalendarRoomLane(:final room) => _rowLabel(
      c,
      title: 'Room ${room.number}',
      subtitle: room.status.label,
    ),
  };

  Widget _laneRow(AppColors c, CalendarLane lane, CalendarData data, double gridW) =>
      switch (lane) {
        // The heading's grid half is a plain band — it carries no dates.
        CalendarGroupLane() => Container(
          width: gridW,
          height: _groupH,
          decoration: BoxDecoration(
            color: c.muted,
            border: Border(bottom: BorderSide(color: c.border)),
          ),
        ),
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
      border: Border(right: BorderSide(color: c.border), bottom: BorderSide(color: c.border)),
    ),
    alignment: Alignment.centerLeft,
    padding: const EdgeInsets.only(left: Sp.md),
    child: Text('Rooms', style: AppTypography.labelXs(c.mutedForeground)),
  );

  Widget _dayHead(AppColors c, DateTime day) {
    final isToday = _dateOnly(day) == _dateOnly(DateTime.now());
    final weekend = day.weekday == DateTime.saturday || day.weekday == DateTime.sunday;
    return Container(
      width: _cellW,
      height: _dateHeadH,
      decoration: BoxDecoration(
        color: isToday ? c.accent : (weekend ? c.surface : c.background),
        border: Border(right: BorderSide(color: c.border), bottom: BorderSide(color: c.border)),
      ),
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Text(
            _weekday(day),
            style: AppTypography.body(size: 10, color: isToday ? c.primary : c.mutedForeground),
          ),
          Text(
            '${day.day}',
            style: AppTypography.body(
              size: 13,
              weight: FontWeight.w600,
              color: isToday ? c.primary : c.foreground,
            ),
          ),
        ],
      ),
    );
  }

  Widget _rowLabel(AppColors c, {required String title, required String subtitle}) => Container(
    width: _labelW,
    height: _rowH,
    padding: const EdgeInsets.symmetric(horizontal: Sp.md),
    decoration: BoxDecoration(
      color: c.surface,
      border: Border(right: BorderSide(color: c.border), bottom: BorderSide(color: c.border)),
    ),
    child: Column(
      mainAxisAlignment: MainAxisAlignment.center,
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          title,
          maxLines: 1,
          overflow: TextOverflow.ellipsis,
          style: AppTypography.body(size: 13, weight: FontWeight.w600, color: c.foreground),
        ),
        Text(
          subtitle,
          maxLines: 1,
          overflow: TextOverflow.ellipsis,
          style: AppTypography.body(size: 10.5, color: c.mutedForeground),
        ),
      ],
    ),
  );

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
              style: AppTypography.body(size: 14, weight: FontWeight.w600, color: c.foreground),
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
  static String _monthDay(DateTime d) =>
      '${d.day} ${const ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][d.month - 1]}';
}

/// What the bar colours mean. Four states carry the chart — the terminal ones
/// (checked out / cancelled / no show) explain themselves in the bar's own
/// tooltip and would only crowd the strip.
class _StatusLegend extends StatelessWidget {
  const _StatusLegend();

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    const shown = [
      ReservationStatus.pending,
      ReservationStatus.confirmed,
      ReservationStatus.checkedIn,
      ReservationStatus.checkedOut,
    ];
    return Container(
      padding: const EdgeInsets.fromLTRB(Sp.lg, 0, Sp.lg, Sp.sm),
      decoration: BoxDecoration(
        color: c.background,
        border: Border(bottom: BorderSide(color: c.border)),
      ),
      child: SingleChildScrollView(
        scrollDirection: Axis.horizontal,
        child: Row(
          children: [
            for (final s in shown) ...[
              Container(
                width: 9,
                height: 9,
                decoration: BoxDecoration(
                  color: s.tone.color(c).withValues(alpha: 0.22),
                  border: Border.all(color: s.tone.color(c)),
                  borderRadius: BorderRadius.circular(3),
                ),
              ),
              const SizedBox(width: 5),
              Text(s.label, style: AppTypography.body(size: 11, color: c.mutedForeground)),
              const SizedBox(width: Sp.md),
            ],
          ],
        ),
      ),
    );
  }
}

/// One lane's grid: empty date cells (tap to start a booking, or drop an
/// extend-handle on to lengthen a stay) with the reservation bars over them.
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
          // Reservation bars.
          for (final bar in _bars(context)) bar,
        ],
      ),
    );
  }

  Widget _cell(BuildContext context, AppColors c, DateTime date) {
    // Typed target: only an extend-handle lands here. A whole-bar move carries
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
                : (highlight ? c.accent.withValues(alpha: 0.5) : null),
            border: Border(
              right: BorderSide(color: c.border.withValues(alpha: 0.6)),
              bottom: BorderSide(color: c.border),
            ),
          ),
        ),
      ),
    );
  }

  List<Widget> _bars(BuildContext context) {
    final c = context.colors;
    final out = <Widget>[];
    for (final r in reservations) {
      final ci = r.checkIn;
      final co = r.checkOut;
      if (ci == null || co == null) continue;
      final startIdx = _daysBetween(windowStart, ci).clamp(0, days);
      final endIdx = _daysBetween(windowStart, co).clamp(0, days); // checkout exclusive
      if (endIdx <= startIdx) continue;

      final color = r.status.tone.color(c);
      final draggable = canEdit && _isLive(r.status);
      // True when the real check-out falls inside the window, so the handle sits
      // on the stay's actual end rather than on the window's edge.
      final endsInWindow = _daysBetween(windowStart, co) <= days;

      out.add(
        Positioned(
          left: startIdx * _cellW + 1.5,
          top: 5,
          width: (endIdx - startIdx) * _cellW - 3,
          height: _rowH - 10,
          child: _Bar(
            reservation: r,
            color: color,
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

/// A single reservation bar: tap to open, long-press to move, and (when the
/// stay ends inside the window) a right-edge handle to drag the check-out out.
class _Bar extends StatelessWidget {
  const _Bar({
    required this.reservation,
    required this.color,
    required this.draggable,
    required this.showHandle,
    required this.onOpen,
  });

  final Reservation reservation;
  final Color color;
  final bool draggable;
  final bool showHandle;
  final VoidCallback onOpen;

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    final body = GestureDetector(
      onTap: onOpen,
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 6),
        alignment: Alignment.centerLeft,
        decoration: BoxDecoration(
          color: color.withValues(alpha: 0.16),
          borderRadius: R.rSm,
          border: Border.all(color: color.withValues(alpha: 0.5)),
        ),
        child: Text(
          reservation.guestName,
          maxLines: 1,
          overflow: TextOverflow.ellipsis,
          style: AppTypography.body(size: 11.5, weight: FontWeight.w600, color: color),
        ),
      ),
    );

    // Long-press to drag: a plain drag belongs to the scroll views this chart
    // lives inside, so the two never fight over the same gesture.
    final movable = draggable
        ? LongPressDraggable<Reservation>(
            data: reservation,
            dragAnchorStrategy: pointerDragAnchorStrategy,
            feedback: _feedback(context, reservation.guestName, color),
            childWhenDragging: Opacity(opacity: 0.35, child: body),
            child: body,
          )
        : body;

    return Tooltip(
      message: '${reservation.reservationNumber} · ${reservation.guestName}\n'
          '${reservation.status.label}',
      child: Stack(
        children: [
          Positioned.fill(child: movable),
          if (showHandle)
            Positioned(
              right: 0,
              top: 0,
              bottom: 0,
              width: _handleW,
              child: LongPressDraggable<_ExtendIntent>(
                data: _ExtendIntent(reservation),
                dragAnchorStrategy: pointerDragAnchorStrategy,
                feedback: _feedback(context, 'Extend stay', color),
                child: MouseRegion(
                  cursor: SystemMouseCursors.resizeLeftRight,
                  child: Container(
                    decoration: BoxDecoration(
                      color: color.withValues(alpha: 0.28),
                      borderRadius: const BorderRadius.horizontal(
                        right: Radius.circular(R.sm),
                      ),
                    ),
                    alignment: Alignment.center,
                    child: Icon(Icons.drag_indicator, size: 11, color: c.surface),
                  ),
                ),
              ),
            ),
        ],
      ),
    );
  }

  Widget _feedback(BuildContext context, String label, Color color) {
    final c = context.colors;
    return Material(
      color: Colors.transparent,
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
        decoration: BoxDecoration(
          color: c.card,
          borderRadius: R.rSm,
          border: Border.all(color: color),
          boxShadow: c.elevation2,
        ),
        child: Text(
          label,
          style: AppTypography.body(size: 12, weight: FontWeight.w600, color: color),
        ),
      ),
    );
  }
}
