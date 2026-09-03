import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:tavelo_owner/core/models/owner_models.dart';
import 'package:tavelo_owner/features/properties/property_format.dart';

/// The inventory parsers exist to survive a payload that is missing fields, or
/// that arrives in snake_case, without throwing — a hotel screen that crashes
/// on one absent key is worse than one showing a blank. These tests pin that
/// behaviour rather than the happy path.
void main() {
  group('Amenity.fromJson', () {
    test('parses a full catalogue row', () {
      final a = Amenity.fromJson({
        'id': 'am_1',
        'key': 'pool',
        'name': 'Pool',
        'scope': 'PROPERTY',
        'icon': 'pool',
        'sortOrder': 10,
        'status': 'ACTIVE',
      });
      expect(a.id, 'am_1');
      expect(a.key, 'pool');
      expect(a.name, 'Pool');
      expect(a.scope, 'PROPERTY');
      expect(a.icon, 'pool');
      expect(a.sortOrder, 10);
      expect(a.status, 'ACTIVE');
    });

    test('tolerates a missing icon — the column is nullable, and the trimmed '
        'refs attached to room types carry no icon at all', () {
      final a = Amenity.fromJson({'id': 'am_2', 'key': 'gym', 'name': 'Gym'});
      expect(a.icon, '');
      expect(a.scope, '');
      expect(a.sortOrder, 0);
      // A blank icon must still resolve to something drawable.
      expect(amenityIcon(a.icon), Icons.check_circle_outline);
    });

    test('an entirely empty object does not throw', () {
      final a = Amenity.fromJson({});
      expect(a.id, '');
      expect(a.name, '');
    });
  });

  group('PropertyAmenities.fromJson', () {
    test('reads selected, selectedIds and the catalogue', () {
      final p = PropertyAmenities.fromJson({
        'selected': [
          {'id': 'am_1', 'key': 'pool', 'name': 'Pool', 'icon': 'pool'},
        ],
        'selectedIds': ['am_1'],
        'catalogue': [
          {'id': 'am_1', 'key': 'pool', 'name': 'Pool', 'icon': 'pool'},
          {'id': 'am_2', 'key': 'gym', 'name': 'Gym', 'icon': 'fitness_center'},
        ],
      });
      expect(p.selected.single.name, 'Pool');
      expect(p.selectedIds, ['am_1']);
      expect(p.catalogue.length, 2);
    });

    test('falls back to the ids on `selected` when selectedIds is absent', () {
      final p = PropertyAmenities.fromJson({
        'selected': [
          {'id': 'am_7', 'name': 'Spa'},
        ],
      });
      expect(p.selectedIds, ['am_7']);
      expect(p.catalogue, isEmpty);
    });
  });

  group('RoomType.fromJson', () {
    test('accepts snake_case keys and fills in the fields that are missing', () {
      final t = RoomType.fromJson({
        'id': 'rt_1',
        'property_id': 'p_1',
        'name': 'Deluxe',
        'bed_type': 'Queen',
        'bed_count': 2,
        'max_occupancy': 3,
        'base_rate': 450000,
        'room_count': 8,
        // description, currency, sizeSqft, amenities and the timestamps are all
        // absent on purpose.
      });
      expect(t.id, 'rt_1');
      expect(t.propertyId, 'p_1');
      expect(t.bedType, 'Queen');
      expect(t.bedCount, 2);
      expect(t.maxOccupancy, 3);
      expect(t.baseRate, 450000);
      expect(t.roomCount, 8);
      expect(t.description, '');
      expect(t.sizeSqft, 0);
      expect(t.airConditioned, isFalse);
      expect(t.amenities, isEmpty);
      expect(t.createdAt, isNull);
      // An absent currency must never render as a blank price prefix.
      expect(t.currency, 'INR');
    });

    test('parses the camelCase payload the API actually sends', () {
      final t = RoomType.fromJson({
        'id': 'rt_2',
        'propertyId': 'p_1',
        'name': 'Suite',
        'bedType': 'King',
        'bedCount': 1,
        'maxOccupancy': 2,
        'airConditioned': true,
        'baseRate': 999900,
        'currency': 'INR',
        'sizeSqft': 420,
        'status': 'ACTIVE',
        'amenities': [
          {'id': 'am_3', 'key': 'tv', 'name': 'TV', 'icon': 'tv'},
        ],
        'roomCount': 3,
        'createdAt': '2026-01-05T10:00:00.000Z',
      });
      expect(t.airConditioned, isTrue);
      expect(t.sizeSqft, 420);
      expect(t.amenities.single.name, 'TV');
      expect(t.createdAt, isNotNull);
      expect(bedSummary(t), 'King');
    });

    test('bedSummary counts the beds only when there is more than one', () {
      RoomType typeWith({required String bed, required int count}) =>
          RoomType.fromJson({'bedType': bed, 'bedCount': count});
      expect(bedSummary(typeWith(bed: 'Queen', count: 2)), '2 × Queen');
      expect(bedSummary(typeWith(bed: 'Queen', count: 1)), 'Queen');
      // Nothing to say when the GM has not set a bed type yet.
      expect(bedSummary(typeWith(bed: '', count: 2)), '');
    });
  });

  group('Room.fromJson', () {
    test('a null floor reads as unassigned, not as a crash', () {
      final r = Room.fromJson({
        'id': 'r_1',
        'propertyId': 'p_1',
        'roomTypeId': 'rt_1',
        'roomTypeName': null,
        'bedType': null,
        'airConditioned': null,
        'number': '101',
        'floor': null,
        'status': 'AVAILABLE',
        'notes': null,
      });
      expect(r.floor, '');
      expect(r.roomTypeName, '');
      expect(r.bedType, '');
      expect(r.notes, '');
      expect(r.airConditioned, isFalse);
      expect(r.number, '101');
      expect(r.status, 'AVAILABLE');
    });

    test(
      'keeps a non-numeric floor verbatim — "G" and "LG" are real floors',
      () {
        expect(Room.fromJson({'floor': 'G'}).floor, 'G');
        expect(Room.fromJson({'floor': 'LG'}).floor, 'LG');
        // A numeric floor arrives as a string, but a stray int must not throw.
        expect(Room.fromJson({'floor': 3}).floor, '3');
      },
    );

    test('accepts snake_case keys', () {
      final r = Room.fromJson({
        'id': 'r_2',
        'property_id': 'p_1',
        'room_type_id': 'rt_1',
        'room_type_name': 'Deluxe',
        'bed_type': 'Queen',
        'air_conditioned': true,
        'number': '202',
        'floor': '2',
        'status': 'OCCUPIED',
      });
      expect(r.propertyId, 'p_1');
      expect(r.roomTypeName, 'Deluxe');
      expect(r.airConditioned, isTrue);
      expect(r.floor, '2');
    });
  });

  group('formatPaise', () {
    test('renders paise as whole rupees', () {
      expect(formatPaise(0), '₹0');
      expect(formatPaise(250000), '₹2,500');
    });

    test('groups lakhs the Indian way', () {
      expect(formatPaise(10000000), '₹1,00,000');
    });

    test('a non-INR currency keeps its code rather than borrowing the ₹', () {
      expect(formatPaise(250000, 'USD'), startsWith('USD'));
      expect(formatPaise(250000, 'USD'), isNot(contains('₹')));
    });
  });

  group('amenityIcon', () {
    test('maps every icon name the seeded catalogue uses', () {
      const seeded = [
        'pool',
        'fitness_center',
        'local_parking',
        'restaurant',
        'spa',
        'local_bar',
        'meeting_room',
        'airport_shuttle',
        'local_laundry_service',
        'concierge',
        'elevator',
        'bolt',
        'ac_unit',
        'tv',
        'wifi',
        'kitchen',
        'lock',
        'bathtub',
        'balcony',
        'waves',
        'landscape',
        'accessible',
        'coffee',
        'desk',
        'air',
      ];
      for (final name in seeded) {
        expect(
          kAmenityIcons.containsKey(name),
          isTrue,
          reason: 'the catalogue seeds "$name" but nothing maps it',
        );
        expect(
          amenityIcon(name),
          isNot(Icons.check_circle_outline),
          reason: '"$name" fell through to the fallback',
        );
      }
    });

    test('falls back for a name this build has never heard of', () {
      // An admin can add a catalogue entry any time; the app must not need a
      // release to render it.
      expect(amenityIcon('helipad'), Icons.check_circle_outline);
      expect(amenityIcon(''), Icons.check_circle_outline);
      expect(amenityIcon(null), Icons.check_circle_outline);
    });
  });

  group('SubscriptionDetail + Invoice + SubscriptionOrder', () {
    test('SubscriptionDetail parses autoRenew', () {
      final s = SubscriptionDetail.fromJson({
        'id': 'sub-1',
        'planName': 'Growth',
        'status': 'ACTIVE',
        'autoRenew': true,
        'features': <String>[],
      });
      expect(s.autoRenew, isTrue);
      expect(SubscriptionDetail.fromJson({'id': 'x'}).autoRenew, isFalse);
    });

    test('Invoice parses documentUrl and exposes hasDocument', () {
      final withDoc = Invoice.fromJson({
        'id': 'inv-1',
        'invoiceNumber': 'INV-1',
        'total': 250000,
        'documentUrl': 'https://signed.example/inv-1.pdf',
      });
      expect(withDoc.hasDocument, isTrue);
      expect(withDoc.documentUrl, contains('inv-1.pdf'));
      expect(Invoice.fromJson({'id': 'inv-2'}).hasDocument, isFalse);
    });

    test('SubscriptionOrder parses gateway fields', () {
      final o = SubscriptionOrder.fromJson({
        'paymentId': 'pay-1',
        'gateway': 'CASHFREE',
        'orderId': 'order-1',
        'amount': 250000,
        'currency': 'INR',
        'paymentSessionId': 'sess_abc',
        'appId': 'app_1',
      });
      expect(o.gateway, 'CASHFREE');
      expect(o.paymentSessionId, 'sess_abc');
      expect(o.keyId, isNull);
    });
  });

  group('OwnerNotification', () {
    test('reads readAt so a delivered notification is not unread forever', () {
      expect(
        OwnerNotification.fromJson({
          'id': 'n1',
          'title': 'Renewal due',
          'readAt': null,
        }).read,
        isFalse,
      );
      expect(
        OwnerNotification.fromJson({
          'id': 'n2',
          'readAt': '2026-08-30T10:00:00Z',
        }).read,
        isTrue,
      );
    });
  });
}
