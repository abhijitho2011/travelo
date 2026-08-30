import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/routing/routes.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/theme/app_spacing.dart';
import '../../../core/theme/app_typography.dart';
import '../../../core/widgets/status_badge.dart';
import '../application/booking_calendar_controllers.dart';
import '../data/reception_models.dart';

const double _cellW = 48;
const double _rowH = 46;
const double _labelW = 120;
const double _headerH = 44;

DateTime _dateOnly(DateTime d) => DateTime(d.year, d.month, d.day);
int _daysBetween(DateTime a, DateTime b) => _dateOnly(b).difference(_dateOnly(a)).inDays;

/// The front-desk booking calendar — a tape chart of rooms (rows) against dates
/// (columns), with each reservation drawn as a bar across the nights it holds.
/// A bar opens the reservation; an empty cell starts a new one. Unassigned
/// bookings ride their own lane at the top so a room-less hold is never hidden.
class BookingCalendarScreen extends ConsumerStatefulWidget {
  const BookingCalendarScreen({super.key});

  @override
  ConsumerState<BookingCalendarScreen> createState() => _BookingCalendarScreenState();
}

class _BookingCalendarScreenState extends ConsumerState<BookingCalendarScreen> {
  final _datesCtrl = ScrollController();
  final _gridCtrl = ScrollController();
  bool _syncing = false;

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

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    final async = ref.watch(bookingCalendarProvider);

    return Scaffold(
      backgroundColor: c.background,
      body: SafeArea(
        top: false,
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            _toolbar(context),
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
      padding: const EdgeInsets.fromLTRB(Sp.lg, Sp.md, Sp.md, Sp.md),
      decoration: BoxDecoration(
        color: c.background,
        border: Border(bottom: BorderSide(color: c.border)),
      ),
      child: Row(
        children: [
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text('Calendar', style: AppTypography.display(size: 18, color: c.foreground)),
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
            onPressed: () => _shift(-kCalendarWindowDays),
            icon: const Icon(Icons.chevron_left, size: 22),
          ),
          OutlinedButton(onPressed: _today, child: const Text('Today')),
          IconButton(
            tooltip: 'Next',
            color: c.foreground,
            onPressed: () => _shift(kCalendarWindowDays),
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

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        // Date header: fixed corner + horizontally scrolling day columns.
        SizedBox(
          height: _headerH,
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
                // Fixed left column: labels aligned row-for-row with the grid.
                Column(
                  children: [
                    if (data.unassigned.isNotEmpty)
                      _rowLabel(c, title: 'Unassigned', subtitle: '${data.unassigned.length} held'),
                    for (final room in data.rooms)
                      _rowLabel(c, title: 'Room ${room.number}', subtitle: room.roomTypeName),
                  ],
                ),
                // Scrolling grid.
                Expanded(
                  child: SingleChildScrollView(
                    controller: _gridCtrl,
                    scrollDirection: Axis.horizontal,
                    child: Column(
                      children: [
                        if (data.unassigned.isNotEmpty)
                          _TapeRow(
                            width: gridW,
                            windowStart: data.windowStart,
                            days: days,
                            reservations: data.unassigned,
                          ),
                        for (final room in data.rooms)
                          _TapeRow(
                            width: gridW,
                            windowStart: data.windowStart,
                            days: days,
                            reservations: data.byRoom[room.id] ?? const [],
                            roomId: room.id,
                          ),
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

  Widget _corner(AppColors c) => Container(
    width: _labelW,
    height: _headerH,
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
      height: _headerH,
      decoration: BoxDecoration(
        color: isToday ? c.accent : (weekend ? c.surface : c.background),
        border: Border(right: BorderSide(color: c.border), bottom: BorderSide(color: c.border)),
      ),
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Text(
            _weekday(day),
            style: AppTypography.body(
              size: 10,
              color: isToday ? c.primary : c.mutedForeground,
            ),
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
              onPressed: () => ref.invalidate(bookingCalendarProvider),
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

/// One room's lane: the empty date cells (tap to start a booking on that day)
/// with the reservation bars laid over them.
class _TapeRow extends StatelessWidget {
  const _TapeRow({
    required this.width,
    required this.windowStart,
    required this.days,
    required this.reservations,
    this.roomId,
  });

  final double width;
  final DateTime windowStart;
  final int days;
  final List<Reservation> reservations;
  final String? roomId;

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    return SizedBox(
      width: width,
      height: _rowH,
      child: Stack(
        children: [
          // Grid cells (also the tap target for a new booking on that date).
          Row(
            children: [
              for (int i = 0; i < days; i++)
                GestureDetector(
                  behavior: HitTestBehavior.opaque,
                  onTap: () => context.go(Routes.reservationNew),
                  child: Container(
                    width: _cellW,
                    height: _rowH,
                    decoration: BoxDecoration(
                      border: Border(
                        right: BorderSide(color: c.border.withValues(alpha: 0.6)),
                        bottom: BorderSide(color: c.border),
                      ),
                    ),
                  ),
                ),
            ],
          ),
          // Reservation bars.
          for (final bar in _bars(context)) bar,
        ],
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
      out.add(
        Positioned(
          left: startIdx * _cellW + 1.5,
          top: 5,
          width: (endIdx - startIdx) * _cellW - 3,
          height: _rowH - 10,
          child: GestureDetector(
            onTap: () => context.go(Routes.reservation(r.id)),
            child: Container(
              padding: const EdgeInsets.symmetric(horizontal: 6),
              alignment: Alignment.centerLeft,
              decoration: BoxDecoration(
                color: color.withValues(alpha: 0.16),
                borderRadius: R.rSm,
                border: Border.all(color: color.withValues(alpha: 0.5)),
              ),
              child: Text(
                r.guestName,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: AppTypography.body(size: 11.5, weight: FontWeight.w600, color: color),
              ),
            ),
          ),
        ),
      );
    }
    return out;
  }
}
