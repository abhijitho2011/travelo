import 'package:flutter_test/flutter_test.dart';
import 'package:tavelo_staff/core/permissions/permission_keys.dart';
import 'package:tavelo_staff/core/permissions/permission_set.dart';
import 'package:tavelo_staff/core/permissions/role_config.dart';
import 'package:tavelo_staff/core/routing/guards.dart';
import 'package:tavelo_staff/core/routing/routes.dart';
import 'package:tavelo_staff/core/widgets/status_badge.dart';
import 'package:tavelo_staff/features/rooms/data/room_models.dart';

/// The room inventory: what the wire says, what the app shows, and who gets to
/// see it at all.
void main() {
  group('RoomStatus', () {
    test('every status survives a trip through the wire', () {
      for (final status in RoomStatus.values) {
        expect(RoomStatus.fromWire(status.wire), status, reason: status.wire);
      }
    });

    test('a status arrives however the server spelt it', () {
      expect(RoomStatus.fromWire('out_of_order'), RoomStatus.outOfOrder);
      expect(RoomStatus.fromWire('OUT-OF-ORDER'), RoomStatus.outOfOrder);
      expect(RoomStatus.fromWire('  Occupied  '), RoomStatus.occupied);
    });

    test('an unknown status degrades instead of throwing', () {
      expect(RoomStatus.fromWire('TELEPORTED'), RoomStatus.available);
      expect(RoomStatus.fromWire(null), RoomStatus.available);
      expect(RoomStatus.fromWire(''), RoomStatus.available);
    });

    test('each status carries the palette tone that matches its meaning', () {
      expect(RoomStatus.available.tone, StatusTone.available);
      expect(RoomStatus.occupied.tone, StatusTone.occupied);
      expect(RoomStatus.dirty.tone, StatusTone.dirty);
      expect(RoomStatus.cleaning.tone, StatusTone.cleaning);
      expect(RoomStatus.inspected.tone, StatusTone.inspected);
      expect(RoomStatus.maintenance.tone, StatusTone.maintenance);
      expect(RoomStatus.outOfOrder.tone, StatusTone.outOfOrder);
    });

    test('READY borrows the available tone rather than inventing one', () {
      // A ready room is sellable. There is no eighth operational colour in the
      // palette, and adding one nobody has learnt to read would be worse than
      // sharing the green.
      expect(RoomStatus.ready.tone, StatusTone.available);
    });

    test('every status has a label and a plain-English hint', () {
      for (final status in RoomStatus.values) {
        expect(status.label.trim(), isNotEmpty, reason: status.wire);
        expect(status.hint.trim(), isNotEmpty, reason: status.wire);
      }
    });
  });

  group('BedType', () {
    test('every bed type survives a trip through the wire', () {
      for (final bed in BedType.values) {
        expect(BedType.fromWire(bed.wire), bed, reason: bed.wire);
      }
    });

    test('the six the API documents are all present', () {
      expect(
        BedType.values.map((b) => b.wire).toList(),
        ['SINGLE', 'TWIN', 'DOUBLE', 'QUEEN', 'KING', 'BUNK'],
      );
    });

    test('an unknown bed type falls back to the commonest one', () {
      expect(BedType.fromWire('WATERBED'), BedType.doubleBed);
      expect(BedType.fromWire(null), BedType.doubleBed);
    });
  });

  group('RoomTypeStatus', () {
    test('round-trips, and anything unrecognised counts as active', () {
      expect(RoomTypeStatus.fromWire('ACTIVE'), RoomTypeStatus.active);
      expect(RoomTypeStatus.fromWire('ARCHIVED'), RoomTypeStatus.archived);
      expect(RoomTypeStatus.fromWire('archived'), RoomTypeStatus.archived);
      expect(RoomTypeStatus.fromWire(null), RoomTypeStatus.active);
      expect(RoomTypeStatus.fromWire('SOMETHING_NEW'), RoomTypeStatus.active);
    });
  });

  group('RoomType.fromJson', () {
    final full = <String, dynamic>{
      'id': 'rt_1',
      'propertyId': 'p_1',
      'name': 'Deluxe Double',
      'description': 'Corner room with a balcony',
      'bedType': 'QUEEN',
      'bedCount': 1,
      'maxOccupancy': 3,
      'maxAdults': 2,
      'maxChildren': 1,
      'airConditioned': true,
      'baseRate': 450000,
      'currency': 'INR',
      'sizeSqft': 320,
      'status': 'ACTIVE',
      'amenities': [
        {'id': 'a1', 'key': 'WIFI', 'name': 'Wi-Fi', 'icon': 'wifi'},
        {'id': 'a2', 'key': 'MINI_BAR', 'name': 'Mini bar'},
      ],
      'roomCount': 12,
      'createdAt': '2026-01-04T10:00:00.000Z',
    };

    test('reads the documented payload whole', () {
      final type = RoomType.fromJson(full);
      expect(type.id, 'rt_1');
      expect(type.propertyId, 'p_1');
      expect(type.name, 'Deluxe Double');
      expect(type.bedType, BedType.queen);
      expect(type.bedCount, 1);
      expect(type.maxOccupancy, 3);
      expect(type.maxAdults, 2);
      expect(type.maxChildren, 1);
      expect(type.airConditioned, isTrue);
      expect(type.baseRate, 450000);
      expect(type.sizeSqft, 320);
      expect(type.status, RoomTypeStatus.active);
      expect(type.amenities.map((a) => a.name), ['Wi-Fi', 'Mini bar']);
      expect(type.roomCount, 12);
      expect(type.createdAt, isNotNull);
    });

    test('an empty payload yields a usable record rather than an exception', () {
      final type = RoomType.fromJson(const <String, dynamic>{});
      expect(type.id, '');
      expect(type.name, 'Untitled room type');
      expect(type.description, isNull);
      expect(type.bedType, BedType.doubleBed);
      expect(type.bedCount, 1);
      expect(type.maxOccupancy, 2);
      expect(type.maxAdults, 2);
      expect(type.maxChildren, 0);
      expect(type.airConditioned, isFalse);
      expect(type.baseRate, 0);
      expect(type.currency, 'INR');
      expect(type.sizeSqft, isNull);
      expect(type.status, RoomTypeStatus.active);
      expect(type.amenities, isEmpty);
      expect(type.roomCount, 0);
    });

    test('snake_case keys are read when camelCase is absent', () {
      final type = RoomType.fromJson(const <String, dynamic>{
        'id': 'rt_2',
        'property_id': 'p_9',
        'name': 'Twin',
        'bed_type': 'TWIN',
        'bed_count': 2,
        'max_occupancy': 2,
        'max_adults': 2,
        'max_children': 0,
        'air_conditioned': true,
        'base_rate': 300000,
        'size_sqft': 240,
        'room_count': 4,
      });
      expect(type.propertyId, 'p_9');
      expect(type.bedType, BedType.twin);
      expect(type.bedCount, 2);
      expect(type.maxOccupancy, 2);
      expect(type.airConditioned, isTrue);
      expect(type.baseRate, 300000);
      expect(type.sizeSqft, 240);
      expect(type.roomCount, 4);
    });

    test('numbers arriving as strings are still numbers', () {
      final type = RoomType.fromJson(const <String, dynamic>{
        'baseRate': '450000',
        'bedCount': '2',
        'airConditioned': 'true',
        'sizeSqft': '150',
      });
      expect(type.baseRate, 450000);
      expect(type.bedCount, 2);
      expect(type.airConditioned, isTrue);
      expect(type.sizeSqft, 150);
    });

    test('an amenity with no name falls back to a readable key', () {
      final amenity = Amenity.fromJson(const {'id': 'a9', 'key': 'ROOM_SAFE'});
      expect(amenity.name, 'Room Safe');
      expect(amenity.fromRoomType, isFalse);
    });

    test('the derived labels read the way the card prints them', () {
      final single = RoomType.fromJson({...full, 'bedCount': 1});
      expect(single.bedLabel, 'Queen');
      final twoBeds = RoomType.fromJson({...full, 'bedCount': 2});
      expect(twoBeds.bedLabel, '2 × Queen');
      expect(single.occupancyLabel, 'Sleeps 3');
      expect(single.guestMixLabel, '2 adults, 1 child');
      expect(single.roomCountLabel, '12 rooms');
      expect(
        RoomType.fromJson({...full, 'roomCount': 1}).roomCountLabel,
        '1 room',
      );
    });
  });

  group('money', () {
    test('a whole rate is shown in rupees, never paise', () {
      final type = RoomType.fromJson(const {'baseRate': 250000});
      expect(type.baseRateLabel, startsWith('₹'));
      expect(type.baseRateLabel, contains('2,500'));
      expect(type.baseRateLabel, isNot(contains('250000')));
    });

    test('a rate with paise keeps them rather than rounding them away', () {
      final type = RoomType.fromJson(const {'baseRate': 249950});
      expect(type.baseRateLabel, contains('2,499.50'));
    });

    test('the form shows a whole rate without a decimal tail', () {
      expect(paiseToRupeeInput(250000), '2500');
      expect(paiseToRupeeInput(249950), '2499.50');
      expect(paiseToRupeeInput(0), '0');
    });

    test('rupees typed into the form become paise on the wire', () {
      expect(rupeesToPaise('2500'), 250000);
      expect(rupeesToPaise('2500.50'), 250050);
      expect(rupeesToPaise(' 2,500 '), 250000);
      expect(rupeesToPaise('not a number'), 0);
      expect(rupeesToPaise(''), 0);
    });
  });

  group('Room.fromJson', () {
    test('reads the documented payload whole', () {
      final room = Room.fromJson(const <String, dynamic>{
        'id': 'r_1',
        'propertyId': 'p_1',
        'roomTypeId': 'rt_1',
        'roomTypeName': 'Deluxe Double',
        'bedType': 'KING',
        'airConditioned': true,
        'number': '304',
        'floor': 3,
        'status': 'DIRTY',
        'notes': 'Connecting door to 305',
        'amenities': [
          {'id': 'a1', 'key': 'WIFI', 'name': 'Wi-Fi', 'fromRoomType': true},
          {'id': 'a7', 'key': 'BALCONY', 'name': 'Balcony'},
        ],
      });
      expect(room.id, 'r_1');
      expect(room.roomTypeId, 'rt_1');
      expect(room.roomTypeName, 'Deluxe Double');
      expect(room.bedType, BedType.king);
      expect(room.airConditioned, isTrue);
      expect(room.number, '304');
      expect(room.floor, 3);
      expect(room.status, RoomStatus.dirty);
      expect(room.tone, StatusTone.dirty);
      expect(room.notes, 'Connecting door to 305');
    });

    test('an empty payload yields a usable record rather than an exception', () {
      final room = Room.fromJson(const <String, dynamic>{});
      expect(room.id, '');
      expect(room.roomTypeId, '');
      expect(room.roomTypeName, 'Room');
      expect(room.bedType, isNull);
      expect(room.number, '—');
      expect(room.floor, isNull);
      expect(room.floorLabel, 'Floor not set');
      expect(room.status, RoomStatus.available);
      expect(room.amenities, isEmpty);
    });

    test('snake_case keys are read when camelCase is absent', () {
      final room = Room.fromJson(const <String, dynamic>{
        'room_type_id': 'rt_5',
        'room_type_name': 'Suite',
        'bed_type': 'BUNK',
        'air_conditioned': true,
        'number': 'A-1',
      });
      expect(room.roomTypeId, 'rt_5');
      expect(room.roomTypeName, 'Suite');
      expect(room.bedType, BedType.bunk);
      expect(room.airConditioned, isTrue);
    });

    test('amenities split into what the type gives and what the room adds', () {
      final room = Room.fromJson(const <String, dynamic>{
        'amenities': [
          {'id': 'a1', 'key': 'WIFI', 'name': 'Wi-Fi', 'fromRoomType': true},
          {'id': 'a2', 'key': 'TV', 'name': 'TV', 'fromRoomType': true},
          {'id': 'a7', 'key': 'BALCONY', 'name': 'Balcony'},
        ],
      });
      expect(room.inheritedAmenities.map((a) => a.id), ['a1', 'a2']);
      expect(room.extraAmenities.map((a) => a.id), ['a7']);
      // Only the extras are editable per room, so only they are ever sent back.
      expect(room.extraAmenityIds, {'a7'});
    });
  });

  group('grouping the board by floor', () {
    Room roomOn(int? floor, String number) => Room.fromJson({
      'id': 'r_$number',
      'number': number,
      'floor': floor,
    });

    test('floors come out in order, with the unrecorded ones last', () {
      final groups = groupRoomsByFloor([
        roomOn(3, '301'),
        roomOn(null, 'ANNEX-1'),
        roomOn(1, '101'),
        roomOn(2, '201'),
      ]);
      expect(groups.map((g) => g.floor), [1, 2, 3, null]);
      expect(groups.last.label, 'Floor not set');
    });

    test('room numbers sort as numbers, so 10 follows 9', () {
      final groups = groupRoomsByFloor([
        roomOn(1, '110'),
        roomOn(1, '19'),
        roomOn(1, '2'),
      ]);
      expect(groups.single.rooms.map((r) => r.number), ['2', '19', '110']);
    });

    test('numbers that are not numbers still sort predictably', () {
      final groups = groupRoomsByFloor([
        roomOn(1, 'B1'),
        roomOn(1, '12'),
        roomOn(1, 'A2'),
      ]);
      expect(groups.single.rooms.map((r) => r.number), ['12', 'A2', 'B1']);
    });

    test('the panel header names the floor and counts it', () {
      final groups = groupRoomsByFloor([roomOn(3, '301'), roomOn(3, '302')]);
      expect(groups.single.headline, 'Floor 3 · 2 rooms');
      expect(
        groupRoomsByFloor([roomOn(3, '301')]).single.headline,
        'Floor 3 · 1 room',
      );
    });

    test('no rooms means no floors', () {
      expect(groupRoomsByFloor(const []), isEmpty);
    });
  });

  group('bulk creation', () {
    test('a range expands to exactly the numbers it will create', () {
      expect(
        BulkRoomRequest.expandRange(from: 101, to: 105),
        ['101', '102', '103', '104', '105'],
      );
    });

    test('a prefix and zero-padding land where the preview shows them', () {
      expect(
        BulkRoomRequest.expandRange(prefix: 'A-', from: 7, to: 9, pad: 3),
        ['A-007', 'A-008', 'A-009'],
      );
      // Padding never truncates a number that is already wider than the pad.
      expect(
        BulkRoomRequest.expandRange(from: 1200, to: 1200, pad: 3),
        ['1200'],
      );
    });

    test('a backwards or single-step range never runs away', () {
      expect(BulkRoomRequest.expandRange(from: 10, to: 1), isEmpty);
      expect(BulkRoomRequest.expandRange(from: 5, to: 5), ['5']);
    });

    test('a typed list splits on commas, spaces and new lines', () {
      expect(
        BulkRoomRequest.parseNumbers('301, 302  303\n304'),
        ['301', '302', '303', '304'],
      );
    });

    test('a typed list drops blanks and repeats but keeps the order typed', () {
      expect(
        BulkRoomRequest.parseNumbers(' 305,,301 , 305 , 302 '),
        ['305', '301', '302'],
      );
      expect(BulkRoomRequest.parseNumbers('   '), isEmpty);
    });

    test('the range payload carries the range, never an expanded list', () {
      const request = BulkRoomRequest.range(
        roomTypeId: 'rt_1',
        prefix: 'A-',
        from: 1,
        to: 3,
        pad: 3,
        floor: 2,
        status: RoomStatus.dirty,
      );
      expect(request.preview, ['A-001', 'A-002', 'A-003']);
      expect(request.toJson(), {
        'roomTypeId': 'rt_1',
        'floor': 2,
        'status': 'DIRTY',
        'prefix': 'A-',
        'from': 1,
        'to': 3,
        'pad': 3,
      });
    });

    test('an unpadded range leaves pad and prefix off the wire entirely', () {
      const request = BulkRoomRequest.range(
        roomTypeId: 'rt_1',
        from: 101,
        to: 102,
      );
      expect(request.toJson(), {
        'roomTypeId': 'rt_1',
        'from': 101,
        'to': 102,
      });
    });

    test('the list payload carries the numbers and no range keys', () {
      const request = BulkRoomRequest.list(
        roomTypeId: 'rt_1',
        numbers: ['301', '302'],
      );
      expect(request.preview, ['301', '302']);
      expect(request.toJson(), {
        'roomTypeId': 'rt_1',
        'numbers': ['301', '302'],
      });
    });

    test('the result names the numbers it skipped', () {
      final result = BulkRoomResult.fromJson(const {
        'requested': 5,
        'created': 3,
        'skipped': ['302', '305'],
        'items': [
          {'id': 'r1', 'number': '301'},
        ],
        'propertyRoomCount': 41,
      });
      expect(result.requested, 5);
      expect(result.created, 3);
      expect(result.skipped, ['302', '305']);
      expect(result.hasSkipped, isTrue);
      expect(result.items.single.number, '301');
      expect(result.propertyRoomCount, 41);
    });

    test('a result with nothing skipped says so', () {
      final result = BulkRoomResult.fromJson(const {
        'requested': 2,
        'created': 2,
      });
      expect(result.hasSkipped, isFalse);
      expect(result.skipped, isEmpty);
      expect(result.propertyRoomCount, isNull);
    });
  });

  group('filters', () {
    test('an empty room filter sends no query at all', () {
      expect(const RoomFilter().toQuery(), isEmpty);
      expect(const RoomFilter().isEmpty, isTrue);
    });

    test('a room filter sends only what was set', () {
      const filter = RoomFilter(
        status: RoomStatus.outOfOrder,
        roomTypeId: 'rt_1',
        floor: 3,
        query: '30',
      );
      expect(filter.toQuery(), {
        'status': 'OUT_OF_ORDER',
        'roomTypeId': 'rt_1',
        'floor': 3,
        'q': '30',
      });
      expect(filter.isEmpty, isFalse);
    });

    test('clearing a facet removes it rather than blanking it', () {
      const filter = RoomFilter(status: RoomStatus.dirty, roomTypeId: 'rt_1');
      expect(filter.copyWith(clearStatus: true).toQuery(), {
        'roomTypeId': 'rt_1',
      });
      expect(filter.copyWith(clearRoomType: true).toQuery(), {
        'status': 'DIRTY',
      });
    });

    test('a room-type filter sends only what was set', () {
      expect(const RoomTypeFilter().toQuery(), isEmpty);
      expect(
        const RoomTypeFilter(
          status: RoomTypeStatus.archived,
          query: 'suite',
        ).toQuery(),
        {'status': 'ARCHIVED', 'q': 'suite'},
      );
      expect(
        const RoomTypeFilter(status: RoomTypeStatus.active)
            .copyWith(clearStatus: true)
            .toQuery(),
        isEmpty,
      );
    });
  });

  group('payloads', () {
    test('a new room type omits every optional field left blank', () {
      const input = NewRoomType(
        name: 'Twin',
        bedType: BedType.twin,
        bedCount: 2,
        maxOccupancy: 2,
        maxAdults: 2,
        maxChildren: 0,
        airConditioned: false,
        baseRate: 300000,
        description: '',
      );
      expect(input.toJson(), {
        'name': 'Twin',
        'unitKind': 'ROOM',
        'unitRoomCount': 1,
        'privatePool': false,
        'bedType': 'TWIN',
        'bedCount': 2,
        'maxOccupancy': 2,
        'maxAdults': 2,
        'maxChildren': 0,
        'airConditioned': false,
        'baseRate': 300000,
      });
    });

    test('a new room sends the status and extras only when they exist', () {
      const bare = NewRoom(roomTypeId: 'rt_1', number: '304');
      expect(bare.toJson(), {'roomTypeId': 'rt_1', 'number': '304'});

      const full = NewRoom(
        roomTypeId: 'rt_1',
        number: '304',
        floor: 3,
        status: RoomStatus.cleaning,
        notes: 'Corner room',
        amenityIds: ['a7'],
      );
      expect(full.toJson(), {
        'roomTypeId': 'rt_1',
        'number': '304',
        'floor': 3,
        'status': 'CLEANING',
        'notes': 'Corner room',
        'amenityIds': ['a7'],
      });
    });
  });

  group('routes', () {
    test('a room path canonicalises to the Rooms nav route', () {
      expect(GuardContext.canonicalise(Routes.rooms), Routes.rooms);
      expect(GuardContext.canonicalise(Routes.roomNew), Routes.rooms);
      expect(GuardContext.canonicalise(Routes.roomBulk), Routes.rooms);
      expect(GuardContext.canonicalise(Routes.room('r_1')), Routes.rooms);
      expect(GuardContext.canonicalise('/rooms/r_1?tab=notes'), Routes.rooms);
    });

    test('a room-type path canonicalises to the Room types nav route', () {
      expect(GuardContext.canonicalise(Routes.roomTypes), Routes.roomTypes);
      expect(GuardContext.canonicalise(Routes.roomTypeNew), Routes.roomTypes);
      expect(
        GuardContext.canonicalise(Routes.roomType('rt_1')),
        Routes.roomTypes,
      );
    });

    test('the two families never swallow each other', () {
      // `/room-types` does not start with `/rooms`, which is the whole reason
      // the catalogue lives at a hyphenated top-level path instead of under
      // `/rooms/types`. If that ever changes, a receptionist reaches the
      // catalogue through the Rooms guard.
      expect(GuardContext.canonicalise(Routes.roomTypes), isNot(Routes.rooms));
      expect(
        GuardContext.canonicalise(Routes.roomTypeNew),
        isNot(Routes.rooms),
      );
      expect(Routes.room('r_1'), '/rooms/r_1');
      expect(Routes.roomType('rt_1'), '/room-types/rt_1');
      expect(Routes.roomTypes.startsWith(Routes.rooms), isFalse);
    });
  });

  group('who sees the room inventory', () {
    // The server's grants, mirrored. Nothing below asks what role anybody is.
    const managementPermissions = PermissionSet({
      'dashboard.read',
      'reservation.read',
      'room.*',
      'roomtype.*',
    });
    const receptionistPermissions = PermissionSet({
      'reservation.read',
      'checkin.perform',
      'room.read',
      'room.status.update',
    });
    const housekeepingPermissions = PermissionSet({
      'housekeeping.read',
      'task.read',
      'room.read',
      'room.status.update',
    });
    const technicianPermissions = PermissionSet({
      'maintenance.read',
      'task.read',
      'room.read',
    });

    Iterable<String> moreRoutesOf(StaffRole role) =>
        RoleConfig.of(role).moreMenu.map((i) => i.route);

    test('a GM and an AGM get both the board and the catalogue', () {
      for (final role in [
        StaffRole.generalManager,
        StaffRole.assistantGeneralManager,
      ]) {
        final config = RoleConfig.of(role);
        // The board is still a More destination; the catalogue has moved into
        // the Room settings hub, so it reaches the role through extraRoutes
        // rather than a More entry — but it must stay in allowedRoutes so the
        // hub can link to it and the guard admits it.
        expect(moreRoutesOf(role), contains(Routes.rooms), reason: role.wire);
        final visible = config
            .visibleMore(managementPermissions)
            .map((i) => i.route);
        expect(visible, contains(Routes.rooms), reason: role.wire);
        expect(config.allowedRoutes, contains(Routes.rooms), reason: role.wire);
        expect(
          config.allowedRoutes,
          contains(Routes.roomTypes),
          reason: role.wire,
        );
      }
    });

    test('a receptionist gets Rooms and never Room types', () {
      final config = RoleConfig.of(StaffRole.receptionist);
      expect(moreRoutesOf(StaffRole.receptionist), contains(Routes.rooms));
      expect(config.allowedRoutes, contains(Routes.rooms));
      expect(config.allowedRoutes, isNot(contains(Routes.roomTypes)));

      final visible = config
          .visibleMore(receptionistPermissions)
          .map((i) => i.route);
      expect(visible, contains(Routes.rooms));
      expect(visible, isNot(contains(Routes.roomTypes)));
    });

    test('the catalogue stays out of reach even if the key were granted', () {
      // The permission is only half the story: the destination has to be in the
      // role's map at all. This is what stops a server-side grant from quietly
      // widening the front desk's surface.
      const overreaching = PermissionSet({'room.read', 'roomtype.read'});
      final visible = RoleConfig.of(
        StaffRole.receptionist,
      ).visibleMore(overreaching).map((i) => i.route);
      expect(visible, isNot(contains(Routes.roomTypes)));
    });

    test('housekeeping, attendants and technicians get the board only', () {
      final cases = {
        StaffRole.housekeepingSupervisor: housekeepingPermissions,
        StaffRole.roomAttendant: housekeepingPermissions,
        StaffRole.technician: technicianPermissions,
      };
      for (final entry in cases.entries) {
        final config = RoleConfig.of(entry.key);
        expect(
          moreRoutesOf(entry.key),
          contains(Routes.rooms),
          reason: entry.key.wire,
        );
        expect(
          config.visibleMore(entry.value).map((i) => i.route),
          contains(Routes.rooms),
          reason: entry.key.wire,
        );
        expect(
          config.allowedRoutes,
          isNot(contains(Routes.roomTypes)),
          reason: entry.key.wire,
        );
      }
    });

    test('a chef or a waiter sees neither — the server grants them no room key',
        () {
      for (final role in [StaffRole.chef, StaffRole.waiter]) {
        final config = RoleConfig.of(role);
        expect(
          config.allowedRoutes,
          isNot(contains(Routes.rooms)),
          reason: role.wire,
        );
        expect(
          config.allowedRoutes,
          isNot(contains(Routes.roomTypes)),
          reason: role.wire,
        );
      }
    });

    test('cleaning staff hold no room key, so they get no room destination', () {
      // They share the attendant's task list but not the attendant's room.read,
      // which is why the entry is on one config and not the other.
      expect(
        RoleConfig.of(StaffRole.cleaningStaff).allowedRoutes,
        isNot(contains(Routes.rooms)),
      );
    });

    test('security staff keep a surface with no room inventory on it', () {
      final routes = RoleConfig.of(StaffRole.securityStaff).allowedRoutes;
      expect(routes, isNot(contains(Routes.rooms)));
      expect(routes, isNot(contains(Routes.roomTypes)));
    });

    test('each destination declares the permission the guard must check', () {
      final gm = RoleConfig.of(StaffRole.generalManager);
      expect(gm.requirementsFor(Routes.rooms), [P.roomRead]);
      // Room types is no longer a nav item (it lives in the Room settings hub),
      // so it carries no route-level requirement — the RoomTypesScreen and its
      // API gate the catalogue on roomtype.read directly.
      expect(gm.requirementsFor(Routes.roomTypes), isNull);
      expect(
        RoleConfig.of(StaffRole.receptionist).requirementsFor(Routes.rooms),
        [P.roomRead],
      );
    });

    test('the room permission keys match the server catalogue', () {
      expect(P.roomRead, 'room.read');
      expect(P.roomStatusUpdate, 'room.status.update');
      expect(P.roomCreate, 'room.create');
      expect(P.roomUpdate, 'room.update');
      expect(P.roomDelete, 'room.delete');
      expect(P.roomTypeRead, 'roomtype.read');
      expect(P.roomTypeCreate, 'roomtype.create');
      expect(P.roomTypeUpdate, 'roomtype.update');
      expect(P.roomTypeDelete, 'roomtype.delete');
    });

    test('a group wildcard covers the nested status key', () {
      // `room.*` has to reach `room.status.update`, or a GM loses the one
      // action every shift uses.
      const wildcard = PermissionSet({'room.*'});
      expect(wildcard.has(P.roomStatusUpdate), isTrue);
      expect(wildcard.has(P.roomDelete), isTrue);
      expect(wildcard.has(P.roomTypeRead), isFalse);
    });
  });
}
