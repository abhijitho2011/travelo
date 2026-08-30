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

/// One row of the chart. Rooms are grouped under their room type, so the desk
/// reads "Deluxe · 6 rooms" and then the rooms themselves — the same shape the
/// left label column and the grid both render from, which is what keeps the two
/// halves aligned however the grouping falls out.
sealed class CalendarLane {
  const CalendarLane();
}

/// A room-type heading above the run of rooms that belong to it.
class CalendarGroupLane extends CalendarLane {
  const CalendarGroupLane({required this.title, required this.roomCount});
  final String title;
  final int roomCount;
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
  /// then each room type's heading followed by its rooms. [rooms] is already
  /// sorted by type then number, so a run of the same type is contiguous.
  List<CalendarLane> get lanes {
    final out = <CalendarLane>[];
    if (unassigned.isNotEmpty) out.add(CalendarUnassignedLane(unassigned.length));

    String? current;
    for (var i = 0; i < rooms.length; i++) {
      final room = rooms[i];
      if (room.roomTypeName != current) {
        current = room.roomTypeName;
        final count = rooms.where((r) => r.roomTypeName == current).length;
        out.add(CalendarGroupLane(title: current, roomCount: count));
      }
      out.add(CalendarRoomLane(room));
    }
    return out;
  }
}

/// Natural-ish room-number order: 101 before 20, 20 before 3 only when both
/// parse as ints; otherwise a plain string compare. Keeps "101, 102, 201" sane.
int _compareRoomNumber(String a, String b) {
  final ai = int.tryParse(a);
  final bi = int.tryParse(b);
  if (ai != null && bi != null) return ai.compareTo(bi);
  return a.compareTo(b);
}

final bookingCalendarProvider = FutureProvider.autoDispose<CalendarData>((ref) async {
  final start = ref.watch(calendarWindowStartProvider);
  final end = start.add(const Duration(days: kCalendarWindowDays));

  // Rooms drive the rows; reservations touching the window fill them. Both are
  // capped generously — a single property's rooms and a fortnight of stays are
  // small sets.
  final rooms = await ref.watch(roomsRepositoryProvider).rooms(const RoomFilter(limit: 500));
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
