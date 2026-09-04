import 'package:flutter_test/flutter_test.dart';
import 'package:tavelo_staff/core/permissions/permission_keys.dart';
import 'package:tavelo_staff/core/permissions/permission_set.dart';
import 'package:tavelo_staff/core/permissions/role_config.dart';
import 'package:tavelo_staff/core/routing/guards.dart';
import 'package:tavelo_staff/core/routing/routes.dart';
import 'package:tavelo_staff/core/widgets/status_badge.dart';
import 'package:tavelo_staff/features/reception/data/reception_models.dart';

/// The booking engine as the app sees it: what the wire says, what the desk
/// reads, and who gets to open the book at all.
void main() {
  group('ReservationStatus', () {
    test('every status survives a trip through the wire', () {
      for (final status in ReservationStatus.values) {
        expect(
          ReservationStatus.fromWire(status.wire),
          status,
          reason: status.wire,
        );
      }
    });

    test('the six the schema documents are all present', () {
      expect(ReservationStatus.values.map((s) => s.wire).toList(), [
        'PENDING',
        'CONFIRMED',
        'CHECKED_IN',
        'CHECKED_OUT',
        'CANCELLED',
        'NO_SHOW',
      ]);
    });

    test('a status arrives however the server spelt it', () {
      expect(
        ReservationStatus.fromWire('checked_in'),
        ReservationStatus.checkedIn,
      );
      expect(
        ReservationStatus.fromWire('CHECKED-IN'),
        ReservationStatus.checkedIn,
      );
      expect(
        ReservationStatus.fromWire('  no show  '),
        ReservationStatus.noShow,
      );
    });

    test('an unknown status degrades to the least committal one', () {
      // PENDING blocks nothing. Falling back to CONFIRMED would make an
      // unrecognised value look like a room that has been sold.
      expect(
        ReservationStatus.fromWire('TELEPORTED'),
        ReservationStatus.pending,
      );
      expect(ReservationStatus.fromWire(null), ReservationStatus.pending);
      expect(ReservationStatus.fromWire(''), ReservationStatus.pending);
    });

    test('each status carries a tone, a label and a plain-English hint', () {
      for (final status in ReservationStatus.values) {
        expect(status.label.trim(), isNotEmpty, reason: status.wire);
        expect(status.hint.trim(), isNotEmpty, reason: status.wire);
      }
      expect(ReservationStatus.pending.tone, StatusTone.warning);
      expect(ReservationStatus.confirmed.tone, StatusTone.info);
      expect(ReservationStatus.checkedIn.tone, StatusTone.occupied);
      expect(ReservationStatus.checkedOut.tone, StatusTone.neutral);
      expect(ReservationStatus.cancelled.tone, StatusTone.critical);
      expect(ReservationStatus.noShow.tone, StatusTone.critical);
    });

    test('the offered moves match the server transition map', () {
      expect(ReservationStatus.pending.canConfirm, isTrue);
      expect(ReservationStatus.confirmed.canConfirm, isFalse);

      // Only a CONFIRMED booking admits a guest — a pending hold has to be
      // committed first, which is exactly what the server refuses otherwise.
      expect(ReservationStatus.confirmed.canCheckIn, isTrue);
      expect(ReservationStatus.pending.canCheckIn, isFalse);

      expect(ReservationStatus.checkedIn.canCheckOut, isTrue);
      expect(ReservationStatus.confirmed.canCheckOut, isFalse);

      expect(ReservationStatus.confirmed.canNoShow, isTrue);
      expect(ReservationStatus.checkedIn.canNoShow, isFalse);

      // A guest already in the building is departed, not cancelled.
      expect(ReservationStatus.checkedIn.canCancel, isFalse);
      expect(ReservationStatus.pending.canCancel, isTrue);
      expect(ReservationStatus.confirmed.canCancel, isTrue);
    });

    test('a finished or written-off booking is no longer open', () {
      expect(ReservationStatus.pending.isOpen, isTrue);
      expect(ReservationStatus.confirmed.isOpen, isTrue);
      expect(ReservationStatus.checkedIn.isOpen, isTrue);
      expect(ReservationStatus.checkedOut.isOpen, isFalse);
      expect(ReservationStatus.cancelled.isOpen, isFalse);
      expect(ReservationStatus.noShow.isOpen, isFalse);
    });
  });

  group('ReservationSource', () {
    test('every source survives a trip through the wire', () {
      for (final source in ReservationSource.values) {
        expect(
          ReservationSource.fromWire(source.wire),
          source,
          reason: source.wire,
        );
      }
    });

    test('the six the schema documents are all present', () {
      expect(ReservationSource.values.map((s) => s.wire).toList(), [
        'WALK_IN',
        'PHONE',
        'EMAIL',
        'OTA',
        'BOOKING_ENGINE',
        'OTHER',
      ]);
    });

    test('an unknown source falls back to the commonest one', () {
      expect(
        ReservationSource.fromWire('CARRIER_PIGEON'),
        ReservationSource.walkIn,
      );
      expect(ReservationSource.fromWire('walk in'), ReservationSource.walkIn);
      expect(ReservationSource.fromWire(null), ReservationSource.walkIn);
    });
  });

  group('stay dates', () {
    test('check-out is exclusive, so 14th to 15th is one night', () {
      expect(nightsBetween(DateTime(2026, 3, 14), DateTime(2026, 3, 15)), 1);
      expect(nightsBetween(DateTime(2026, 3, 14), DateTime(2026, 3, 20)), 6);
    });

    test('the time of day never buys or loses a night', () {
      // A guest walking in at 23:00 and one walking in at 09:00 have booked
      // the same night. Everything here works on the calendar date alone.
      expect(
        nightsBetween(
          DateTime(2026, 3, 14, 23, 30),
          DateTime(2026, 3, 15, 6, 15),
        ),
        1,
      );
    });

    test('a same-day or backwards range is not a stay', () {
      final day = DateTime(2026, 3, 14);
      expect(nightsBetween(day, day), 0);
      expect(nightsBetween(day, DateTime(2026, 3, 13)), 0);
      expect(datesInOrder(day, day), isFalse);
      expect(datesInOrder(day, DateTime(2026, 3, 13)), isFalse);
      expect(datesInOrder(day, DateTime(2026, 3, 15)), isTrue);
    });

    test('same-day turnover between two stays is legal', () {
      // The outgoing stay ends on the 15th and the incoming one starts on the
      // 15th. Neither is invalid, and they do not overlap — that strictness is
      // the whole reason check-out is exclusive.
      final leaving = (
        checkIn: DateTime(2026, 3, 14),
        checkOut: DateTime(2026, 3, 15),
      );
      final arriving = (
        checkIn: DateTime(2026, 3, 15),
        checkOut: DateTime(2026, 3, 17),
      );
      expect(datesInOrder(leaving.checkIn, leaving.checkOut), isTrue);
      expect(datesInOrder(arriving.checkIn, arriving.checkOut), isTrue);
      expect(
        leaving.checkOut.isAfter(arriving.checkIn),
        isFalse,
        reason: 'the room frees up on the morning the next guest arrives',
      );
    });

    test('dates go on the wire as YYYY-MM-DD and nothing else', () {
      expect(isoDate(DateTime(2026, 3, 4)), '2026-03-04');
      expect(isoDate(DateTime(2026, 12, 31, 23, 59)), '2026-12-31');
    });

    test('dateOnly throws the clock away', () {
      expect(dateOnly(DateTime(2026, 3, 4, 17, 45)), DateTime(2026, 3, 4));
    });
  });

  group('Reservation.fromJson', () {
    final full = <String, dynamic>{
      'id': 'rsv_1',
      'propertyId': 'p_1',
      'reservationNumber': 'RSV-000123',
      'roomTypeId': 'rt_1',
      'roomTypeName': 'Deluxe Double',
      'roomId': 'r_1',
      'roomNumber': '304',
      'roomStatus': 'READY',
      'guestName': 'Asha Nair',
      'guestPhone': '+919876543210',
      'guestEmail': 'asha@example.com',
      'guestIdType': 'PASSPORT',
      'guestIdNumber': 'Z1234567',
      'adults': 2,
      'children': 1,
      'checkIn': '2026-03-14',
      'checkOut': '2026-03-17',
      'nights': 3,
      'status': 'CONFIRMED',
      'ratePaise': 450000,
      'totalPaise': 1350000,
      'paidPaise': 350000,
      'balancePaise': 1000000,
      'currency': 'INR',
      'source': 'PHONE',
      'notes': 'Late arrival, around 23:00',
      'createdAt': '2026-03-01T10:00:00.000Z',
    };

    test('reads the documented payload whole', () {
      final r = Reservation.fromJson(full);
      expect(r.id, 'rsv_1');
      expect(r.propertyId, 'p_1');
      expect(r.reservationNumber, 'RSV-000123');
      expect(r.roomTypeId, 'rt_1');
      expect(r.roomTypeName, 'Deluxe Double');
      expect(r.roomId, 'r_1');
      expect(r.roomNumber, '304');
      expect(r.roomStatus, 'READY');
      expect(r.guestName, 'Asha Nair');
      expect(r.guestPhone, '+919876543210');
      expect(r.guestEmail, 'asha@example.com');
      expect(r.guestIdType, 'PASSPORT');
      expect(r.guestIdNumber, 'Z1234567');
      expect(r.adults, 2);
      expect(r.children, 1);
      expect(r.nights, 3);
      expect(r.status, ReservationStatus.confirmed);
      expect(r.ratePaise, 450000);
      expect(r.totalPaise, 1350000);
      expect(r.paidPaise, 350000);
      expect(r.balancePaise, 1000000);
      expect(r.source, ReservationSource.phone);
      expect(r.notes, 'Late arrival, around 23:00');
      expect(r.roomAssigned, isTrue);
      expect(r.guestCount, 3);
    });

    test(
      'an empty payload yields a usable record rather than an exception',
      () {
        final r = Reservation.fromJson(const <String, dynamic>{});
        expect(r.id, '');
        expect(r.reservationNumber, '—');
        expect(r.guestName, 'Guest');
        expect(r.status, ReservationStatus.pending);
        expect(r.source, ReservationSource.walkIn);
        expect(r.adults, 1);
        expect(r.children, 0);
        expect(r.nights, 0);
        expect(r.checkIn, isNull);
        expect(r.roomAssigned, isFalse);
        expect(r.events, isEmpty);
      },
    );

    test('snake_case keys are read when camelCase is absent', () {
      final r = Reservation.fromJson(const <String, dynamic>{
        'id': 'rsv_2',
        'reservation_number': 'RSV-000200',
        'room_type_id': 'rt_9',
        'room_type_name': 'Suite',
        'room_number': '901',
        'guest_name': 'Rahul Menon',
        'guest_phone': '+919000000000',
        'check_in': '2026-04-01',
        'check_out': '2026-04-03',
        'rate_paise': 900000,
        'total_paise': 1800000,
        'paid_paise': 0,
        'status': 'CHECKED_IN',
      });
      expect(r.reservationNumber, 'RSV-000200');
      expect(r.roomTypeId, 'rt_9');
      expect(r.roomTypeName, 'Suite');
      expect(r.roomNumber, '901');
      expect(r.guestName, 'Rahul Menon');
      expect(r.guestPhone, '+919000000000');
      expect(r.ratePaise, 900000);
      expect(r.status, ReservationStatus.checkedIn);
    });

    test('numbers arriving as strings are still numbers', () {
      final r = Reservation.fromJson(const <String, dynamic>{
        'adults': '3',
        'children': '2',
        'nights': '4',
        'ratePaise': '250000',
        'totalPaise': '1000000',
        'paidPaise': '250000',
        'balancePaise': '750000',
      });
      expect(r.adults, 3);
      expect(r.children, 2);
      expect(r.nights, 4);
      expect(r.ratePaise, 250000);
      expect(r.balancePaise, 750000);
    });

    test('a missing balance is derived rather than shown as nothing owed', () {
      final r = Reservation.fromJson(const <String, dynamic>{
        'totalPaise': 1350000,
        'paidPaise': 350000,
      });
      expect(r.balancePaise, 1000000);
    });

    test('a missing nights count is derived from the dates', () {
      final r = Reservation.fromJson(const <String, dynamic>{
        'checkIn': '2026-03-14',
        'checkOut': '2026-03-17',
      });
      expect(r.nights, 3);
    });

    test('the event trail comes back only where the server sends one', () {
      final r = Reservation.fromJson(const <String, dynamic>{
        'id': 'rsv_3',
        'events': [
          {
            'id': 'e1',
            'type': 'created',
            'createdAt': '2026-03-01T10:00:00.000Z',
          },
          {
            'id': 'e2',
            'type': 'room_assigned',
            'payload': {'roomNumber': '304'},
          },
        ],
      });
      expect(r.events, hasLength(2));
      expect(r.events.first.label, 'Created');
      // `Fmt.humanise` title-cases each word of a SCREAMING_SNAKE wire value,
      // which is how every other event label in the app already reads.
      expect(r.events.last.label, 'Room Assigned');
      expect(r.events.last.detail, '304');
    });

    test('the derived labels read the way the card prints them', () {
      final r = Reservation.fromJson(full);
      expect(r.nightsLabel, '3 nights');
      expect(r.guestMixLabel, '2 adults, 1 child');
      expect(r.roomLabel, 'Room 304');
      expect(r.stayLine, contains('Deluxe Double'));
      expect(r.stayLine, contains('3 nights'));
      expect(r.stayLine, contains('Phone'));
    });

    test('one night and one adult are singular', () {
      final r = Reservation.fromJson(const <String, dynamic>{
        'adults': 1,
        'children': 0,
        'nights': 1,
      });
      expect(r.nightsLabel, '1 night');
      expect(r.guestMixLabel, '1 adult');
    });
  });

  group('DeskBoard.fromJson', () {
    final payload = <String, dynamic>{
      'date': '2026-03-14',
      'arrivals': [
        {'id': 'a1', 'guestName': 'Asha Nair', 'status': 'CONFIRMED'},
      ],
      'departures': [
        {'id': 'd1', 'guestName': 'Rahul Menon', 'status': 'CHECKED_IN'},
        {'id': 'd2', 'guestName': 'Sara Iyer', 'status': 'CHECKED_IN'},
      ],
      'inHouse': [
        {'id': 'h1', 'guestName': 'Vikram Rao', 'status': 'CHECKED_IN'},
      ],
      'counts': {
        'arrivals': 1,
        'departures': 2,
        'inHouse': 1,
        'availableRooms': 11,
      },
    };

    test('reads the documented payload whole', () {
      final board = DeskBoard.fromJson(payload);
      expect(board.date, '2026-03-14');
      expect(board.arrivals, hasLength(1));
      expect(board.departures, hasLength(2));
      expect(board.inHouse, hasLength(1));
      expect(board.arrivals.single.guestName, 'Asha Nair');
      expect(board.counts.arrivals, 1);
      expect(board.counts.departures, 2);
      expect(board.counts.inHouse, 1);
      expect(board.counts.availableRooms, 11);
      expect(board.isEmpty, isFalse);
    });

    test('an empty payload is an empty desk, not an exception', () {
      final board = DeskBoard.fromJson(const <String, dynamic>{});
      expect(board.date, isNull);
      expect(board.arrivals, isEmpty);
      expect(board.departures, isEmpty);
      expect(board.inHouse, isEmpty);
      expect(board.counts.availableRooms, 0);
      expect(board.isEmpty, isTrue);
    });

    test('snake_case and stringy counts are read all the same', () {
      final board = DeskBoard.fromJson(const <String, dynamic>{
        'in_house': [
          {'id': 'h1', 'guest_name': 'Vikram Rao'},
        ],
        'counts': {'in_house': '4', 'available_rooms': '7'},
      });
      expect(board.inHouse, hasLength(1));
      expect(board.counts.inHouse, 4);
      expect(board.counts.availableRooms, 7);
    });

    test('a counts block that is not an object leaves the tiles at zero', () {
      final board = DeskBoard.fromJson(const <String, dynamic>{
        'counts': 'n/a',
      });
      expect(board.counts.arrivals, 0);
      expect(board.counts.inHouse, 0);
    });
  });

  group('GmDashboard.fromJson', () {
    final payload = <String, dynamic>{
      'date': '2026-03-14',
      'occupancy': 72.5,
      'rooms': {
        'total': 40,
        'occupied': 29,
        'available': 6,
        'dirty': 3,
        'maintenance': 2,
      },
      'arrivalsToday': 8,
      'departuresToday': 5,
      'inHouse': 29,
      'monthRevenuePaise': 128450000,
      'pendingApprovals': 2,
    };

    test('reads the documented payload whole', () {
      final d = GmDashboard.fromJson(payload);
      expect(d.date, '2026-03-14');
      expect(d.occupancy, 72.5);
      expect(d.rooms.total, 40);
      expect(d.rooms.occupied, 29);
      expect(d.rooms.available, 6);
      expect(d.rooms.dirty, 3);
      expect(d.rooms.maintenance, 2);
      expect(d.arrivalsToday, 8);
      expect(d.departuresToday, 5);
      expect(d.inHouse, 29);
      expect(d.monthRevenuePaise, 128450000);
      expect(d.pendingApprovals, 2);
    });

    test('an empty payload yields zeroes rather than an exception', () {
      final d = GmDashboard.fromJson(const <String, dynamic>{});
      expect(d.occupancy, 0);
      expect(d.rooms.total, 0);
      expect(d.monthRevenuePaise, 0);
      expect(d.pendingApprovals, 0);
    });

    test('snake_case and numbers-as-strings are read all the same', () {
      final d = GmDashboard.fromJson(const <String, dynamic>{
        'occupancy': '61.4',
        'arrivals_today': '3',
        'departures_today': '4',
        'in_house': '18',
        'month_revenue_paise': '900000',
        'pending_approvals': '1',
      });
      expect(d.occupancy, 61.4);
      expect(d.arrivalsToday, 3);
      expect(d.departuresToday, 4);
      expect(d.inHouse, 18);
      expect(d.monthRevenuePaise, 900000);
      expect(d.pendingApprovals, 1);
    });

    test('revenue is shown in rupees, never in the paise it arrives as', () {
      final d = GmDashboard.fromJson(const <String, dynamic>{
        'monthRevenuePaise': 128450000,
      });
      expect(d.monthRevenueLabel, isNot(contains('128450000')));
      expect(d.monthRevenueLabel, contains('₹'));
    });
  });

  group('RoomTypeAvailability.fromJson', () {
    test('reads the documented payload whole', () {
      final a = RoomTypeAvailability.fromJson(const <String, dynamic>{
        'roomTypeId': 'rt_1',
        'name': 'Deluxe',
        'bedType': 'QUEEN',
        'maxOccupancy': 3,
        'baseRate': 450000,
        'currency': 'INR',
        'totalRooms': 5,
        'bookedRooms': 2,
        'availableRooms': 3,
      });
      expect(a.roomTypeId, 'rt_1');
      expect(a.name, 'Deluxe');
      expect(a.maxOccupancy, 3);
      expect(a.baseRate, 450000);
      expect(a.totalRooms, 5);
      expect(a.availableRooms, 3);
      expect(a.soldOut, isFalse);
      expect(a.pickerLabel, 'Deluxe · 3 of 5 free');
    });

    test('a sold-out type says so instead of pretending', () {
      final a = RoomTypeAvailability.fromJson(const <String, dynamic>{
        'roomTypeId': 'rt_2',
        'name': 'Suite',
        'totalRooms': 2,
        'bookedRooms': 2,
        'availableRooms': 0,
      });
      expect(a.soldOut, isTrue);
      expect(a.pickerLabel, 'Suite · 0 of 2 free');
    });

    test('a type with no rooms is a gap in the inventory, not a sell-out', () {
      final a = RoomTypeAvailability.fromJson(const <String, dynamic>{
        'roomTypeId': 'rt_3',
        'name': 'Cottage',
      });
      expect(a.pickerLabel, 'Cottage · no rooms yet');
    });
  });

  group('filters', () {
    test('an empty filter sends no query at all', () {
      const filter = ReservationFilter();
      expect(filter.isEmpty, isTrue);
      expect(filter.toQuery(), isEmpty);
    });

    test('a filter sends only what was set', () {
      final filter = ReservationFilter(
        status: ReservationStatus.checkedIn,
        from: DateTime(2026, 3, 1),
        to: DateTime(2026, 3, 31),
        query: 'Nair',
        roomId: 'r_1',
        limit: 25,
        offset: 50,
      );
      expect(filter.isEmpty, isFalse);
      expect(filter.toQuery(), {
        'status': 'CHECKED_IN',
        'from': '2026-03-01',
        'to': '2026-03-31',
        'q': 'Nair',
        'roomId': 'r_1',
        'limit': 25,
        'offset': 50,
      });
    });

    test('a blank search is no search', () {
      const filter = ReservationFilter(query: '');
      expect(filter.isEmpty, isTrue);
      expect(filter.toQuery(), isEmpty);
    });

    test('clearing a facet removes it rather than blanking it', () {
      final filter = ReservationFilter(
        status: ReservationStatus.pending,
        from: DateTime(2026, 3, 1),
        to: DateTime(2026, 3, 31),
        query: 'Nair',
      );

      final noStatus = filter.copyWith(clearStatus: true);
      expect(noStatus.status, isNull);
      expect(noStatus.toQuery().containsKey('status'), isFalse);
      // Clearing one facet must not quietly drop the others.
      expect(noStatus.toQuery()['q'], 'Nair');
      expect(noStatus.toQuery()['from'], '2026-03-01');

      final noDates = filter.copyWith(clearDates: true);
      expect(noDates.from, isNull);
      expect(noDates.to, isNull);
      expect(noDates.toQuery().containsKey('from'), isFalse);
      expect(noDates.toQuery().containsKey('to'), isFalse);
      expect(noDates.toQuery()['status'], 'PENDING');
    });

    test('copyWith without a clear flag leaves what it was not given', () {
      final filter = ReservationFilter(
        status: ReservationStatus.confirmed,
        from: DateTime(2026, 3, 1),
      );
      final next = filter.copyWith(query: 'Menon');
      expect(next.status, ReservationStatus.confirmed);
      expect(next.from, DateTime(2026, 3, 1));
      expect(next.query, 'Menon');
    });
  });

  group('payloads', () {
    final checkIn = DateTime(2026, 3, 14);
    final checkOut = DateTime(2026, 3, 17);

    test('a new booking omits every optional field left blank', () {
      final payload = NewReservation(
        roomTypeId: 'rt_1',
        guestName: 'Asha Nair',
        guestPhone: '+919876543210',
        checkIn: checkIn,
        checkOut: checkOut,
      ).toJson();

      expect(payload, {
        'roomTypeId': 'rt_1',
        'guestName': 'Asha Nair',
        'guestPhone': '+919876543210',
        'adults': 1,
        'checkIn': '2026-03-14',
        'checkOut': '2026-03-17',
        'status': 'PENDING',
      });
    });

    test('a walk-in books straight into CONFIRMED', () {
      final payload = NewReservation(
        roomTypeId: 'rt_1',
        guestName: 'Asha Nair',
        guestPhone: '+919876543210',
        checkIn: checkIn,
        checkOut: checkOut,
        confirmImmediately: true,
      ).toJson();
      expect(payload['status'], 'CONFIRMED');
    });

    test('everything that was filled in reaches the wire', () {
      final payload = NewReservation(
        roomTypeId: 'rt_1',
        roomId: 'r_1',
        guestName: 'Asha Nair',
        guestPhone: '+919876543210',
        guestEmail: 'asha@example.com',
        guestIdType: 'PASSPORT',
        guestIdNumber: 'Z1234567',
        adults: 2,
        children: 1,
        checkIn: checkIn,
        checkOut: checkOut,
        ratePaise: 450000,
        source: ReservationSource.ota,
        notes: 'High floor',
        confirmImmediately: true,
      ).toJson();

      expect(payload['roomId'], 'r_1');
      expect(payload['guestEmail'], 'asha@example.com');
      expect(payload['guestIdNumber'], 'Z1234567');
      expect(payload['children'], 1);
      expect(payload['ratePaise'], 450000);
      expect(payload['source'], 'OTA');
      expect(payload['notes'], 'High floor');
    });

    test('a rate nobody typed is left to the server to snapshot', () {
      // Sending 0 would quote the guest nothing; omitting the key makes the
      // server use the room type's base rate, which is what the desk expects.
      final payload = NewReservation(
        roomTypeId: 'rt_1',
        guestName: 'Asha Nair',
        guestPhone: '+919876543210',
        checkIn: checkIn,
        checkOut: checkOut,
      ).toJson();
      expect(payload.containsKey('ratePaise'), isFalse);
    });

    test('the payload knows its own night count', () {
      expect(
        NewReservation(
          roomTypeId: 'rt_1',
          guestName: 'Asha Nair',
          guestPhone: '+919876543210',
          checkIn: checkIn,
          checkOut: checkOut,
        ).nights,
        3,
      );
    });
  });

  group('the check-in flow', () {
    test('four steps, each mapping to something the endpoint takes', () {
      expect(CheckInStep.ordered, [
        CheckInStep.verifyGuest,
        CheckInStep.captureId,
        CheckInStep.assignRoom,
        CheckInStep.confirm,
      ]);
    });

    test('every step has a title, a detail and a done label', () {
      for (final step in CheckInStep.values) {
        expect(step.title.trim(), isNotEmpty, reason: step.name);
        expect(step.detail.trim(), isNotEmpty, reason: step.name);
        expect(step.doneLabel.trim(), isNotEmpty, reason: step.name);
      }
    });
  });

  group('routes', () {
    test('a booking path canonicalises to the Bookings nav route', () {
      expect(
        GuardContext.canonicalise(Routes.reservations),
        Routes.reservations,
      );
      expect(
        GuardContext.canonicalise(Routes.reservationNew),
        Routes.reservations,
      );
      expect(
        GuardContext.canonicalise(Routes.reservation('rsv_1')),
        Routes.reservations,
      );
      expect(
        GuardContext.canonicalise('/reception/reservations/rsv_1?tab=folio'),
        Routes.reservations,
      );
    });

    test('the create form is a literal path, not a booking called "new"', () {
      // go_router matches in declaration order, so `/reception/reservations/new`
      // has to be declared before `:id` — and it has to be a distinct constant
      // for the router to declare.
      expect(Routes.reservationNew, '/reception/reservations/new');
      expect(Routes.reservation('new'), Routes.reservationNew);
    });

    test('the desk and the book are separate destinations', () {
      expect(GuardContext.canonicalise(Routes.reception), Routes.reception);
      expect(
        GuardContext.canonicalise(Routes.checkIn),
        isNot(Routes.reservations),
      );
      expect(Routes.reservations.startsWith(Routes.reception), isTrue);
    });
  });

  group('who sees the bookings', () {
    // The server's grants, mirrored. Nothing below asks what role anybody is.
    const managementPermissions = PermissionSet({
      'dashboard.read',
      'reservation.*',
      'checkin.perform',
      'checkout.perform',
      'room.*',
    });
    const receptionistPermissions = PermissionSet({
      'reservation.read',
      'reservation.create',
      'reservation.update',
      'checkin.perform',
      'checkout.perform',
      'room.read',
      'room.status.update',
    });
    const housekeepingPermissions = PermissionSet({
      'housekeeping.read',
      'task.read',
      'room.read',
      'room.status.update',
    });

    Iterable<String> routesOf(StaffRole role) {
      final config = RoleConfig.of(role);
      return [
        for (final item in config.bottomNav) item.route,
        for (final item in config.moreMenu) item.route,
      ];
    }

    test('the front desk reaches the desk board, the book and check-in', () {
      final config = RoleConfig.of(StaffRole.receptionist);
      expect(routesOf(StaffRole.receptionist), contains(Routes.reception));
      expect(routesOf(StaffRole.receptionist), contains(Routes.checkIn));
      expect(config.allowedRoutes, contains(Routes.reservations));
      // The dedupe: Bookings is no longer its own nav item — the Front desk
      // button reaches it — but the guard must still admit the route.
      expect(
        config.visibleNav(receptionistPermissions).map((i) => i.route),
        isNot(contains(Routes.reservations)),
      );
    });

    test('a GM and an AGM reach the book from the sidebar', () {
      // The Tavelo sidebar lists Reservations directly (with the in-house
      // count beside it); Calendar and Check-in ride alongside.
      for (final role in [
        StaffRole.generalManager,
        StaffRole.assistantGeneralManager,
      ]) {
        final config = RoleConfig.of(role);
        expect(
          config.allowedRoutes,
          contains(Routes.checkIn),
          reason: role.wire,
        );
        final visible = config
            .visibleNav(managementPermissions)
            .map((i) => i.route);
        expect(visible, contains(Routes.reservations), reason: role.wire);
        expect(
          visible,
          contains(Routes.reservationCalendar),
          reason: role.wire,
        );
      }
    });

    test('the book stays permission-gated where it is still a nav item', () {
      // Every role now reaches the book through a nav item, so the guard
      // checks reservation.read for all of them.
      for (final role in [
        StaffRole.generalManager,
        StaffRole.assistantGeneralManager,
        StaffRole.receptionist,
        StaffRole.accounts,
        StaffRole.salesManager,
      ]) {
        expect(
          RoleConfig.of(role).requirementsFor(Routes.reservations),
          [P.reservationRead],
          reason: role.wire,
        );
      }
    });

    test('housekeeping and attendants never reach the book', () {
      for (final role in [
        StaffRole.housekeepingSupervisor,
        StaffRole.roomAttendant,
        StaffRole.cleaningStaff,
      ]) {
        final config = RoleConfig.of(role);
        expect(
          config.allowedRoutes,
          isNot(contains(Routes.reservations)),
          reason: role.wire,
        );
        expect(
          config.allowedRoutes,
          isNot(contains(Routes.checkIn)),
          reason: role.wire,
        );
      }
      // Even granted the key, the destination is not in their map — which is
      // what stops a server-side grant quietly widening their surface.
      expect(
        RoleConfig.of(
          StaffRole.roomAttendant,
        ).visibleMore(housekeepingPermissions).map((i) => i.route),
        isNot(contains(Routes.reservations)),
      );
    });

    test('security staff and outlet roles get no bookings surface', () {
      for (final role in [
        StaffRole.securityStaff,
        StaffRole.chef,
        StaffRole.waiter,
      ]) {
        expect(
          RoleConfig.of(role).allowedRoutes,
          isNot(contains(Routes.reservations)),
          reason: role.wire,
        );
      }
    });

    test('the reservation permission keys match the server catalogue', () {
      expect(P.reservationRead, 'reservation.read');
      expect(P.reservationCreate, 'reservation.create');
      expect(P.reservationUpdate, 'reservation.update');
      expect(P.reservationCancel, 'reservation.cancel');
      expect(P.checkInPerform, 'checkin.perform');
      expect(P.checkOutPerform, 'checkout.perform');
      expect(P.dashboardRead, 'dashboard.read');
      expect(P.revenueRead, 'revenue.read');
    });

    test('cancelling is a separate key from amending', () {
      // A receptionist amends bookings all day and may never write one off.
      // If these ever collapse into one key, the desk silently gains the power
      // to destroy revenue.
      expect(receptionistPermissions.has(P.reservationUpdate), isTrue);
      expect(receptionistPermissions.has(P.reservationCancel), isFalse);
      expect(managementPermissions.has(P.reservationCancel), isTrue);
    });

    test('check-in and check-out are keys of their own', () {
      // A night auditor may depart a guest without being able to rewrite the
      // booking, so these do not live under reservation.*.
      const auditor = PermissionSet({'reservation.read', 'checkout.perform'});
      expect(auditor.has(P.checkOutPerform), isTrue);
      expect(auditor.has(P.reservationUpdate), isFalse);
      expect(auditor.has(P.checkInPerform), isFalse);
    });
  });

  group('Folio', () {
    test('parses charges, ancillary lines, payments and balance', () {
      final folio = Folio.fromJson({
        'roomChargePaise': 500000,
        'ancillaryPaise': 200000,
        'chargesPaise': 700000,
        'netPaidPaise': 330000,
        'balancePaise': 370000,
        'lineItems': [
          {
            'kind': 'RESTAURANT',
            'description': 'Restaurant ORD-1',
            'amountPaise': 120000,
          },
          {
            'kind': 'SPA',
            'description': 'Spa — Deep Tissue',
            'amountPaise': 80000,
          },
        ],
        'payments': [
          {'direction': 'PAYMENT', 'method': 'CARD', 'amountPaise': 350000},
          {'direction': 'REFUND', 'method': 'CARD', 'amountPaise': 20000},
        ],
      });
      expect(folio.roomChargePaise, 500000);
      expect(folio.chargesPaise, 700000);
      expect(folio.balancePaise, 370000);
      expect(folio.hasBalance, isTrue);
      expect(folio.lineItems, hasLength(2));
      expect(folio.lineItems.first.description, 'Restaurant ORD-1');
      expect(folio.payments, hasLength(2));
      expect(folio.payments.last.isRefund, isTrue);
    });

    test('accepts snake_case keys and tolerates missing lists', () {
      final folio = Folio.fromJson({
        'room_charge_paise': 100000,
        'charges_paise': 100000,
        'net_paid_paise': 0,
        'balance_paise': 100000,
      });
      expect(folio.roomChargePaise, 100000);
      expect(folio.balancePaise, 100000);
      expect(folio.lineItems, isEmpty);
      expect(folio.payments, isEmpty);
    });
  });
}
