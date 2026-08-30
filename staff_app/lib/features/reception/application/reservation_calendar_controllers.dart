import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../rooms/data/room_models.dart';
import '../../rooms/data/rooms_repository.dart' show roomsRepositoryProvider;
import '../data/reception_models.dart';
import '../data/reception_repository.dart';

/// How many nights the tape chart shows at once. Wide enough to plan a fortnight
/// on a tablet, narrow enough to stay legible on a phone (it scrolls either way).
const int kCalendarWindowDays = 14;

/// The first date shown, date-only and local. Defaults to today; the header's
/// prev/next/today controls move it a window at a time.
final calendarWindowStartProvider = StateProvider<DateTime>((ref) {
  final now = DateTime.now();
  return DateTime(now.year, now.month, now.day);
});

/// One row of the room rack. The same list drives the frozen label column and
/// the scrolling grid, which is what keeps the two halves aligned. The rack is
/// FLAT — each room row carries its type inline ("101 · Deluxe") rather than
/// sitting under a group heading, matching the reference design.
sealed class CalendarLane {
  const CalendarLane();
}

class CalendarRoomLane extends CalendarLane {
  const CalendarRoomLane(this.room);
  final Room room;
}

/// Bookings with no room yet. Always first, so a hold is never out of sight.
class CalendarUnassignedLane extends CalendarLane {
  const CalendarUnassignedLane(this.count);
  final int count;
}

/// The assembled tape chart: rooms sorted by type then number, the reservations
/// that touch the window grouped by room, and the unassigned ones on their own
/// lane so a booking without a room is never invisible.
class CalendarData {
  const CalendarData({
    required this.rooms,
    required this.byRoom,
    required this.unassigned,
    required this.windowStart,
    required this.windowDays,
  });

  final List<Room> rooms;
  final Map<String, List<Reservation>> byRoom;
  final List<Reservation> unassigned;
  final DateTime windowStart;
  final int windowDays;

  DateTime get windowEnd => windowStart.add(Duration(days: windowDays));

  /// The rows to render, in order: the unassigned lane (when it has anything),
  /// then every room. [rooms] is already sorted by type then number, so rooms
  /// of one type stay together even without a heading between them.
  List<CalendarLane> get lanes => [
    if (unassigned.isNotEmpty) CalendarUnassignedLane(unassigned.length),
    for (final room in rooms) CalendarRoomLane(room),
  ];
}

/// Natural-ish room-number order: 101 before 20, 20 before 3 only when both
/// parse as ints; otherwise a plain string compare. Keeps "101, 102, 201" sane.
int _compareRoomNumber(String a, String b) {
  final ai = int.tryParse(a);
  final bi = int.tryParse(b);
  if (ai != null && bi != null) return ai.compareTo(bi);
  return a.compareTo(b);
}

final reservationCalendarProvider = FutureProvider.autoDispose<CalendarData>((ref) async {
  final start = ref.watch(calendarWindowStartProvider);
  final end = start.add(const Duration(days: kCalendarWindowDays));

  // Rooms drive the rows; reservations touching the window fill them. 200 is
  // the API's hard ceiling on BOTH pages (RoomFilterDto / ReservationFilterDto)
  // — asking for more is a 400, not a bigger page.
  final rooms = await ref.watch(roomsRepositoryProvider).rooms(const RoomFilter(limit: 200));
  final reservations = await ref
      .watch(receptionRepositoryProvider)
      .reservations(ReservationFilter(from: start, to: end, limit: 200));

  final sorted = [...rooms]..sort((a, b) {
    final byType = a.roomTypeName.compareTo(b.roomTypeName);
    return byType != 0 ? byType : _compareRoomNumber(a.number, b.number);
  });

  final byRoom = <String, List<Reservation>>{};
  final unassigned = <Reservation>[];
  for (final r in reservations) {
    final roomId = r.roomId;
    if (roomId != null && roomId.isNotEmpty) {
      (byRoom[roomId] ??= <Reservation>[]).add(r);
    } else {
      unassigned.add(r);
    }
  }

  return CalendarData(
    rooms: sorted,
    byRoom: byRoom,
    unassigned: unassigned,
    windowStart: start,
    windowDays: kCalendarWindowDays,
  );
});
