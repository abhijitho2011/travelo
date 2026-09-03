import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/data/owner_repository.dart';
import '../../core/models/owner_models.dart';
import '../../core/theme/app_colors.dart';
import '../../core/theme/app_spacing.dart';
import '../../core/theme/app_typography.dart';
import '../../core/widgets/states.dart';
import '../../core/widgets/status_badge.dart';

/// Nights shown at once. A fortnight is what an owner plans against, and it
/// still fits a phone by scrolling sideways rather than shrinking the columns
/// until nothing is readable.
const int kOwnerCalendarWindowDays = 14;

const double _kRowHeight = 40;
const double _kDayWidth = 46;
const double _kLabelWidth = 116;

/// First date on the chart, date-only and local. Keyed by property so two
/// hotels opened in turn do not inherit each other's scroll position in time.
final ownerCalendarStartProvider = StateProvider.family<DateTime, String>((
  ref,
  propertyId,
) {
  final now = DateTime.now();
  return DateTime(now.year, now.month, now.day);
});

/// The assembled tape chart: rooms as rows (grouped by type), the reservations
/// touching the window keyed by room, and the ones with no room yet on their
/// own lane so a booking is never invisible.
class OwnerCalendarData {
  const OwnerCalendarData({
    required this.rooms,
    required this.byRoom,
    required this.unassigned,
    required this.windowStart,
  });

  final List<Room> rooms;
  final Map<String, List<CalendarReservation>> byRoom;
  final List<CalendarReservation> unassigned;
  final DateTime windowStart;

  DateTime get windowEnd =>
      windowStart.add(const Duration(days: kOwnerCalendarWindowDays));
}

/// Natural-ish room-number order: "101" before "20" only when both parse as
/// integers; otherwise a plain string compare keeps "3A"/"G-12" sane.
int _compareRoomNumber(String a, String b) {
  final ai = int.tryParse(a);
  final bi = int.tryParse(b);
  if (ai != null && bi != null) return ai.compareTo(bi);
  return a.compareTo(b);
}

final ownerCalendarProvider = FutureProvider.autoDispose
    .family<OwnerCalendarData, String>((ref, propertyId) async {
      final start = ref.watch(ownerCalendarStartProvider(propertyId));
      final end = start.add(const Duration(days: kOwnerCalendarWindowDays));
      final repo = ref.watch(ownerRepositoryProvider);

      final rooms = await repo.propertyRooms(propertyId);
      final reservations = await repo.propertyReservations(
        propertyId,
        from: start,
        to: end,
      );

      final sorted = [...rooms]
        ..sort((a, b) {
          final byType = a.roomTypeName.compareTo(b.roomTypeName);
          return byType != 0 ? byType : _compareRoomNumber(a.number, b.number);
        });

      final byRoom = <String, List<CalendarReservation>>{};
      final unassigned = <CalendarReservation>[];
      for (final r in reservations) {
        if (r.roomId.isNotEmpty) {
          (byRoom[r.roomId] ??= <CalendarReservation>[]).add(r);
        } else {
          unassigned.add(r);
        }
      }

      return OwnerCalendarData(
        rooms: sorted,
        byRoom: byRoom,
        unassigned: unassigned,
        windowStart: start,
      );
    });

/// Reservation status → the app's shared status palette. Owners and the front
/// desk read the same colours, so nothing is invented locally here.
StatusTone reservationTone(String status) => switch (status.toUpperCase()) {
  'CONFIRMED' => StatusTone.available,
  'CHECKED_IN' => StatusTone.occupied,
  'CHECKED_OUT' => StatusTone.inspected,
  'CANCELLED' => StatusTone.critical,
  'NO_SHOW' => StatusTone.warning,
  _ => StatusTone.neutral,
};

String reservationStatusLabel(String status) => switch (status.toUpperCase()) {
  'CONFIRMED' => 'Confirmed',
  'CHECKED_IN' => 'In house',
  'CHECKED_OUT' => 'Departed',
  'CANCELLED' => 'Cancelled',
  'NO_SHOW' => 'No show',
  final s => s.isEmpty ? 'Unknown' : s,
};

const _kLegend = <String>[
  'CONFIRMED',
  'CHECKED_IN',
  'CHECKED_OUT',
  'CANCELLED',
  'NO_SHOW',
];

const _kMonths = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', //
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];
const _kWeekdays = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

bool _sameDay(DateTime a, DateTime b) =>
    a.year == b.year && a.month == b.month && a.day == b.day;

/// A READ-ONLY occupancy tape chart: rooms down, nights across, one bar per
/// stay. Owners look at their hotel here; they do not run the desk from it, so
/// nothing on this screen creates, moves or edits a booking.
class PropertyCalendarScreen extends ConsumerStatefulWidget {
  const PropertyCalendarScreen({
    super.key,
    required this.propertyId,
    this.propertyName,
  });

  final String propertyId;
  final String? propertyName;

  @override
  ConsumerState<PropertyCalendarScreen> createState() =>
      _PropertyCalendarScreenState();
}

class _PropertyCalendarScreenState
    extends ConsumerState<PropertyCalendarScreen> {
  /// The date header and the grid scroll as one surface — a header that can
  /// drift out of step with its columns is worse than no header.
  final _headerScroll = ScrollController();
  final _gridScroll = ScrollController();
  bool _syncing = false;

  @override
  void initState() {
    super.initState();
    _headerScroll.addListener(() => _sync(_headerScroll, _gridScroll));
    _gridScroll.addListener(() => _sync(_gridScroll, _headerScroll));
  }

  void _sync(ScrollController from, ScrollController to) {
    if (_syncing || !to.hasClients || !from.hasClients) return;
    if ((to.offset - from.offset).abs() < 0.5) return;
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
    _headerScroll.dispose();
    _gridScroll.dispose();
    super.dispose();
  }

  void _shift(int days) {
    final n = ref.read(ownerCalendarStartProvider(widget.propertyId).notifier);
    n.state = n.state.add(Duration(days: days));
  }

  void _today() {
    final now = DateTime.now();
    ref.read(ownerCalendarStartProvider(widget.propertyId).notifier).state =
        DateTime(now.year, now.month, now.day);
  }

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    final async = ref.watch(ownerCalendarProvider(widget.propertyId));

    return Scaffold(
      backgroundColor: c.background,
      appBar: AppBar(title: Text(widget.propertyName ?? 'Calendar')),
      body: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          _Toolbar(
            start: ref.watch(ownerCalendarStartProvider(widget.propertyId)),
            onPrev: () => _shift(-kOwnerCalendarWindowDays),
            onNext: () => _shift(kOwnerCalendarWindowDays),
            onToday: _today,
          ),
          const _Legend(),
          Expanded(
            child: async.when(
              loading: () => const Padding(
                padding: Sp.page,
                child: ListSkeleton(rows: 6, height: 40),
              ),
              error: (e, _) => Padding(
                padding: Sp.page,
                child: ErrorState(
                  error: e,
                  message: 'Could not load the booking calendar.',
                  onRetry: () =>
                      ref.invalidate(ownerCalendarProvider(widget.propertyId)),
                ),
              ),
              data: (data) => data.rooms.isEmpty && data.unassigned.isEmpty
                  ? const Padding(
                      padding: Sp.page,
                      child: EmptyState(
                        icon: Icons.calendar_month_outlined,
                        title: 'No rooms to show yet',
                        hint:
                            'Once your manager adds rooms, the occupancy chart '
                            'appears here.',
                      ),
                    )
                  : _Chart(
                      data: data,
                      headerScroll: _headerScroll,
                      gridScroll: _gridScroll,
                    ),
            ),
          ),
        ],
      ),
    );
  }
}

class _Toolbar extends StatelessWidget {
  const _Toolbar({
    required this.start,
    required this.onPrev,
    required this.onNext,
    required this.onToday,
  });

  final DateTime start;
  final VoidCallback onPrev;
  final VoidCallback onNext;
  final VoidCallback onToday;

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    final end = start.add(const Duration(days: kOwnerCalendarWindowDays - 1));
    final label = start.month == end.month
        ? '${start.day}–${end.day} ${_kMonths[start.month - 1]} ${start.year}'
        : '${start.day} ${_kMonths[start.month - 1]} – '
              '${end.day} ${_kMonths[end.month - 1]} ${end.year}';

    return Container(
      padding: Sp.panelHeader,
      decoration: BoxDecoration(
        color: c.card,
        border: Border(bottom: BorderSide(color: c.border)),
      ),
      child: Row(
        children: [
          IconButton(
            onPressed: onPrev,
            icon: const Icon(Icons.chevron_left),
            tooltip: 'Previous fortnight',
          ),
          Expanded(
            child: Text(
              label,
              textAlign: TextAlign.center,
              style: AppTypography.display(size: 15, color: c.foreground),
            ),
          ),
          IconButton(
            onPressed: onNext,
            icon: const Icon(Icons.chevron_right),
            tooltip: 'Next fortnight',
          ),
          TextButton(onPressed: onToday, child: const Text('Today')),
        ],
      ),
    );
  }
}

class _Legend extends StatelessWidget {
  const _Legend();

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.symmetric(horizontal: Sp.lg, vertical: Sp.sm),
      decoration: BoxDecoration(
        color: c.background,
        border: Border(bottom: BorderSide(color: c.border)),
      ),
      child: Wrap(
        spacing: Sp.md,
        runSpacing: Sp.xs,
        children: [
          for (final s in _kLegend)
            Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                StatusDot(tone: reservationTone(s), size: 8),
                const SizedBox(width: 5),
                Text(
                  reservationStatusLabel(s),
                  style: AppTypography.body(
                    size: 11.5,
                    color: c.mutedForeground,
                  ),
                ),
              ],
            ),
        ],
      ),
    );
  }
}

/// One row of the chart: either a room lane or the unassigned lane.
class _Lane {
  const _Lane({
    required this.label,
    required this.sublabel,
    required this.stays,
  });
  final String label;
  final String sublabel;
  final List<CalendarReservation> stays;
}

class _Chart extends StatelessWidget {
  const _Chart({
    required this.data,
    required this.headerScroll,
    required this.gridScroll,
  });

  final OwnerCalendarData data;
  final ScrollController headerScroll;
  final ScrollController gridScroll;

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    final days = [
      for (var i = 0; i < kOwnerCalendarWindowDays; i++)
        data.windowStart.add(Duration(days: i)),
    ];
    final gridWidth = _kDayWidth * kOwnerCalendarWindowDays;

    // Rooms in type order already; emit a group header whenever the type
    // changes so a run of rooms reads as one block.
    final blocks = <Widget>[];
    String? currentType;
    var runCount = 0;
    for (var i = 0; i < data.rooms.length; i++) {
      final room = data.rooms[i];
      final type = room.roomTypeName.isEmpty ? 'Rooms' : room.roomTypeName;
      if (type != currentType) {
        currentType = type;
        runCount = data.rooms.where((r) {
          final t = r.roomTypeName.isEmpty ? 'Rooms' : r.roomTypeName;
          return t == type;
        }).length;
        blocks.add(
          _GroupHeader(label: type, count: runCount, width: gridWidth),
        );
      }
      blocks.add(
        _LaneRow(
          lane: _Lane(
            label: room.number,
            sublabel: type,
            stays: data.byRoom[room.id] ?? const [],
          ),
          days: days,
          windowStart: data.windowStart,
        ),
      );
    }
    if (data.unassigned.isNotEmpty) {
      blocks
        ..add(
          _GroupHeader(
            label: 'Unassigned',
            count: data.unassigned.length,
            width: gridWidth,
          ),
        )
        ..add(
          _LaneRow(
            lane: _Lane(
              label: '—',
              sublabel: 'No room yet',
              stays: data.unassigned,
            ),
            days: days,
            windowStart: data.windowStart,
          ),
        );
    }

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        // Frozen label column + horizontally scrolling date header.
        Container(
          decoration: BoxDecoration(
            color: c.card,
            border: Border(bottom: BorderSide(color: c.border)),
          ),
          child: Row(
            children: [
              SizedBox(
                width: _kLabelWidth,
                height: 46,
                child: Padding(
                  padding: const EdgeInsets.symmetric(horizontal: Sp.md),
                  child: Align(
                    alignment: Alignment.centerLeft,
                    child: Text(
                      'Room',
                      style: AppTypography.labelXs(c.mutedForeground),
                    ),
                  ),
                ),
              ),
              Expanded(
                child: SingleChildScrollView(
                  controller: headerScroll,
                  scrollDirection: Axis.horizontal,
                  child: Row(
                    children: [for (final d in days) _DayHead(date: d)],
                  ),
                ),
              ),
            ],
          ),
        ),
        Expanded(
          child: SingleChildScrollView(
            controller: gridScroll,
            scrollDirection: Axis.horizontal,
            child: SizedBox(
              width: _kLabelWidth + gridWidth,
              child: ListView(
                padding: const EdgeInsets.only(bottom: 32),
                children: blocks,
              ),
            ),
          ),
        ),
      ],
    );
  }
}

class _DayHead extends StatelessWidget {
  const _DayHead({required this.date});
  final DateTime date;

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    final today = _sameDay(date, DateTime.now());
    final weekend = date.weekday >= DateTime.saturday;
    return Container(
      width: _kDayWidth,
      height: 46,
      alignment: Alignment.center,
      decoration: BoxDecoration(
        color: today
            ? c.primary.withValues(alpha: 0.12)
            : weekend
            ? c.muted.withValues(alpha: 0.5)
            : null,
        border: Border(left: BorderSide(color: c.border)),
      ),
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Text(
            _kWeekdays[date.weekday - 1],
            style: AppTypography.body(
              size: 10,
              weight: FontWeight.w600,
              color: today ? c.primary : c.mutedForeground,
            ),
          ),
          Text(
            '${date.day}',
            style: AppTypography.numeric(
              size: 13,
              weight: today ? FontWeight.w700 : FontWeight.w500,
              color: today ? c.primary : c.foreground,
            ),
          ),
        ],
      ),
    );
  }
}

class _GroupHeader extends StatelessWidget {
  const _GroupHeader({
    required this.label,
    required this.count,
    required this.width,
  });

  final String label;
  final int count;
  final double width;

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    return Container(
      width: _kLabelWidth + width,
      height: 28,
      padding: const EdgeInsets.symmetric(horizontal: Sp.md),
      alignment: Alignment.centerLeft,
      decoration: BoxDecoration(
        color: c.muted.withValues(alpha: 0.6),
        border: Border(bottom: BorderSide(color: c.border)),
      ),
      child: Text(
        '${label.toUpperCase()} · $count',
        style: AppTypography.labelXs(c.mutedForeground),
      ),
    );
  }
}

class _LaneRow extends StatelessWidget {
  const _LaneRow({
    required this.lane,
    required this.days,
    required this.windowStart,
  });

  final _Lane lane;
  final List<DateTime> days;
  final DateTime windowStart;

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    return Container(
      height: _kRowHeight,
      decoration: BoxDecoration(
        border: Border(bottom: BorderSide(color: c.border)),
      ),
      child: Row(
        children: [
          SizedBox(
            width: _kLabelWidth,
            child: Padding(
              padding: const EdgeInsets.symmetric(horizontal: Sp.md),
              child: Column(
                mainAxisAlignment: MainAxisAlignment.center,
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    lane.label,
                    overflow: TextOverflow.ellipsis,
                    style: AppTypography.body(
                      size: 13,
                      weight: FontWeight.w600,
                      color: c.foreground,
                    ),
                  ),
                  Text(
                    lane.sublabel,
                    overflow: TextOverflow.ellipsis,
                    style: AppTypography.body(
                      size: 10.5,
                      color: c.mutedForeground,
                    ),
                  ),
                ],
              ),
            ),
          ),
          Expanded(
            child: Stack(
              children: [
                Row(
                  children: [
                    for (final d in days)
                      Container(
                        width: _kDayWidth,
                        decoration: BoxDecoration(
                          color: d.weekday >= DateTime.saturday
                              ? c.muted.withValues(alpha: 0.35)
                              : null,
                          border: Border(left: BorderSide(color: c.border)),
                        ),
                      ),
                  ],
                ),
                for (final s in lane.stays) _bar(context, s),
              ],
            ),
          ),
        ],
      ),
    );
  }

  /// Clips the stay to the visible window: a booking that started before the
  /// window still shows its remaining nights rather than vanishing.
  Widget _bar(BuildContext context, CalendarReservation s) {
    final start = s.checkIn ?? windowStart;
    final end = s.checkOut ?? start.add(const Duration(days: 1));
    final fromIdx = start.difference(windowStart).inDays;
    final toIdx = end.difference(windowStart).inDays;
    final left = fromIdx.clamp(0, kOwnerCalendarWindowDays);
    final right = toIdx.clamp(0, kOwnerCalendarWindowDays);
    final span = right - left;
    if (span <= 0) return const SizedBox.shrink();

    final c = context.colors;
    final tint = reservationTone(s.status).color(c);
    return Positioned(
      left: left * _kDayWidth + 2,
      top: 5,
      width: span * _kDayWidth - 4,
      height: _kRowHeight - 14,
      child: Tooltip(
        message: '${s.guestName} · ${reservationStatusLabel(s.status)}',
        child: InkWell(
          borderRadius: R.rSm,
          onTap: () => _showDetail(context, s),
          child: Container(
            padding: const EdgeInsets.symmetric(horizontal: 6),
            alignment: Alignment.centerLeft,
            decoration: BoxDecoration(
              color: tint.withValues(alpha: 0.18),
              borderRadius: R.rSm,
              border: Border.all(color: tint.withValues(alpha: 0.55)),
            ),
            child: Text(
              s.guestName,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: AppTypography.body(
                size: 11.5,
                weight: FontWeight.w600,
                color: tint,
              ),
            ),
          ),
        ),
      ),
    );
  }
}

/// A read-only peek at one stay. There is no edit affordance here on purpose —
/// changing a booking is the front desk's job, in the staff app.
void _showDetail(BuildContext context, CalendarReservation s) {
  final c = context.colors;
  String fmt(DateTime? d) =>
      d == null ? '—' : '${d.day} ${_kMonths[d.month - 1]} ${d.year}';

  showModalBottomSheet<void>(
    context: context,
    backgroundColor: c.card,
    shape: const RoundedRectangleBorder(
      borderRadius: BorderRadius.vertical(top: Radius.circular(R.xl)),
    ),
    builder: (_) => Padding(
      padding: const EdgeInsets.fromLTRB(Sp.xl, Sp.xl, Sp.xl, 32),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            s.guestName.isEmpty ? 'Guest' : s.guestName,
            style: AppTypography.display(size: 18, color: c.foreground),
          ),
          const SizedBox(height: Sp.xs),
          Text(
            s.reservationNumber,
            style: AppTypography.numeric(size: 12, color: c.mutedForeground),
          ),
          const SizedBox(height: Sp.md),
          StatusBadge(
            tone: reservationTone(s.status),
            label: reservationStatusLabel(s.status),
          ),
          const SizedBox(height: Sp.md),
          Text(
            '${fmt(s.checkIn)}  →  ${fmt(s.checkOut)}',
            style: AppTypography.body(size: 13.5, color: c.foreground),
          ),
          const SizedBox(height: Sp.xxs),
          Text(
            '${s.nights} ${s.nights == 1 ? 'night' : 'nights'}',
            style: AppTypography.body(size: 12, color: c.mutedForeground),
          ),
        ],
      ),
    ),
  );
}
