import 'package:flutter_test/flutter_test.dart';
import 'package:tavelo_staff/features/reception/application/booking_calendar_controllers.dart';
import 'package:tavelo_staff/features/reception/data/reception_models.dart';
import 'package:tavelo_staff/features/rooms/data/room_models.dart';

Room _room(String id, String number, String typeName) => Room(
  id: id,
  roomTypeId: 'type-$typeName',
  roomTypeName: typeName,
  number: number,
  status: RoomStatus.available,
);

Reservation _res(
  String id, {
  String? roomId,
  required DateTime checkIn,
  required DateTime checkOut,
}) => Reservation(
  id: id,
  reservationNumber: 'RES-$id',
  roomTypeId: 'type-Deluxe',
  guestName: 'Guest $id',
  status: ReservationStatus.confirmed,
  checkIn: checkIn,
  checkOut: checkOut,
  roomId: roomId,
);

CalendarData _data({
  required List<Room> rooms,
  Map<String, List<Reservation>> byRoom = const {},
  List<Reservation> unassigned = const [],
}) => CalendarData(
  rooms: rooms,
  byRoom: byRoom,
  unassigned: unassigned,
  windowStart: DateTime(2026, 9, 1),
  windowDays: kCalendarWindowDays,
);

void main() {
  group('CalendarData.lanes — room-type grouping', () {
    test('each run of one type gets a heading carrying that type\'s room count', () {
      final data = _data(
        rooms: [
          _room('r1', '101', 'Deluxe'),
          _room('r2', '102', 'Deluxe'),
          _room('r3', '201', 'Suite'),
        ],
      );

      final lanes = data.lanes;
      expect(lanes.length, 5); // 2 headings + 3 rooms

      final first = lanes[0] as CalendarGroupLane;
      expect(first.title, 'Deluxe');
      expect(first.roomCount, 2);
      expect((lanes[1] as CalendarRoomLane).room.number, '101');
      expect((lanes[2] as CalendarRoomLane).room.number, '102');

      final second = lanes[3] as CalendarGroupLane;
      expect(second.title, 'Suite');
      expect(second.roomCount, 1);
      expect((lanes[4] as CalendarRoomLane).room.number, '201');
    });

    test('the unassigned lane comes first, and only when it holds something', () {
      final rooms = [_room('r1', '101', 'Deluxe')];

      // Nothing unassigned: the chart opens straight on the first room type.
      expect(_data(rooms: rooms).lanes.first, isA<CalendarGroupLane>());

      final held = _res(
        'a',
        checkIn: DateTime(2026, 9, 2),
        checkOut: DateTime(2026, 9, 4),
      );
      final withHeld = _data(rooms: rooms, unassigned: [held]).lanes;
      expect(withHeld.first, isA<CalendarUnassignedLane>());
      expect((withHeld.first as CalendarUnassignedLane).count, 1);
    });

    test('no rooms means no lanes at all', () {
      expect(_data(rooms: const []).lanes, isEmpty);
    });
  });

  group('window arithmetic', () {
    test('the window ends exactly windowDays after it starts', () {
      final data = _data(rooms: const []);
      expect(data.windowEnd.difference(data.windowStart).inDays, kCalendarWindowDays);
    });
  });
}
