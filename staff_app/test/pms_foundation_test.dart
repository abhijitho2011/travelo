import 'package:flutter_test/flutter_test.dart';
import 'package:tavelo_staff/features/property_settings/data/property_settings_models.dart';
import 'package:tavelo_staff/features/rates/data/rates_models.dart';
import 'package:tavelo_staff/features/reception/data/reception_models.dart';

void main() {
  group('Folio — tax-inclusive', () {
    test(
      'parses the tax break-up and keeps the balance the server computed',
      () {
        final f = Folio.fromJson({
          'roomChargePaise': 500000,
          'roomTaxPaise': 60000,
          'roomTaxRatePercent': 12,
          'ancillaryPaise': 200000,
          'lineTaxPaise': 20400,
          'propertyTaxPaise': 0,
          'taxPaise': 80400,
          'subtotalPaise': 700000,
          'chargesPaise': 780400,
          'netPaidPaise': 330000,
          'balancePaise': 450400,
          'intraState': false,
          'lineItems': [
            {
              'id': 'l1',
              'kind': 'RESTAURANT',
              'description': 'Dinner',
              'amountPaise': 120000,
              'taxPaise': 6000,
              'taxRateBp': 500,
            },
            {
              'id': 'l2',
              'kind': 'ADJUSTMENT',
              'description': 'Discount — Loyal guest',
              'amountPaise': -50000,
              'taxExempt': true,
            },
            {
              'id': 'l3',
              'kind': 'MISC',
              'description': 'Voided',
              'amountPaise': 1,
              'voidedAt': '2026-09-01T00:00:00Z',
            },
          ],
          'payments': [],
        });
        expect(f.roomTaxRatePercent, 12);
        expect(f.chargesPaise, 780400);
        expect(f.balancePaise, 450400);
        expect(f.intraState, isFalse);
        expect(f.lineItems[0].taxLabel, '+₹60 tax (5%)');
        expect(f.lineItems[1].isDiscount, isTrue);
        expect(f.lineItems[1].taxLabel, 'tax exempt');
        expect(f.lineItems[2].voided, isTrue);
      },
    );
  });

  group('Reservation — placement and holds', () {
    test(
      'reads lock, hold deadline, plan and company fields; old payloads default safely',
      () {
        final r = Reservation.fromJson({
          'id': 'r1',
          'reservationNumber': 'RES-1',
          'roomTypeId': 't1',
          'guestName': 'Asha',
          'status': 'CONFIRMED',
          'checkIn': '2026-09-10',
          'checkOut': '2026-09-12',
          'roomLocked': true,
          'holdExpiresAt': '2026-09-01T10:00:00Z',
          'ratePlanId': 'p1',
          'segment': 'CORPORATE',
          'companyGstin': '27AAAAA0000A1Z5',
        });
        expect(r.roomLocked, isTrue);
        expect(r.holdExpiresAt, isNotNull);
        expect(r.ratePlanId, 'p1');
        expect(r.companyGstin, '27AAAAA0000A1Z5');

        final old = Reservation.fromJson({
          'id': 'r2',
          'reservationNumber': 'RES-2',
          'roomTypeId': 't1',
          'guestName': 'B',
          'status': 'PENDING',
          'checkIn': '2026-09-10',
          'checkOut': '2026-09-11',
        });
        expect(old.roomLocked, isFalse);
        expect(old.holdExpiresAt, isNull);
      },
    );

    test(
      'a new booking sends its plan, source, segment, hold and company only when set',
      () {
        final full = NewReservation(
          roomTypeId: 't1',
          guestName: 'Asha',
          guestPhone: '9876543210',
          checkIn: DateTime(2026, 9, 10),
          checkOut: DateTime(2026, 9, 12),
          ratePlanId: 'p1',
          bookingSourceId: 's1',
          segment: 'LEISURE',
          holdMinutes: 30,
          companyName: 'Infosys',
          companyGstin: '29AAAAA0000A1Z5',
        ).toJson();
        expect(full['ratePlanId'], 'p1');
        expect(full['bookingSourceId'], 's1');
        expect(full['holdMinutes'], 30);
        expect(full['companyGstin'], '29AAAAA0000A1Z5');

        final bare = NewReservation(
          roomTypeId: 't1',
          guestName: 'Asha',
          guestPhone: '9876543210',
          checkIn: DateTime(2026, 9, 10),
          checkOut: DateTime(2026, 9, 12),
          segment: '',
          companyName: '',
        ).toJson();
        for (final k in [
          'ratePlanId',
          'bookingSourceId',
          'segment',
          'holdMinutes',
          'companyName',
          'companyGstin',
        ]) {
          expect(bare.containsKey(k), isFalse, reason: k);
        }
      },
    );

    test('the booking-page source round-trips', () {
      expect(
        ReservationSource.fromWire('BOOKING_ENGINE'),
        ReservationSource.bookingEngine,
      );
    });
  });

  group('Rates grid', () {
    test(
      'a cell knows where its price came from and whether it is restricted',
      () {
        final g = RateGrid.fromJson({
          'from': '2026-09-10',
          'to': '2026-09-12',
          'roomTypes': [
            {
              'id': 't1',
              'name': 'Deluxe',
              'baseRatePaise': 300000,
              'physical': 10,
              'days': [
                {
                  'roomTypeId': 't1',
                  'date': '2026-09-10',
                  'pricePaise': 500000,
                  'priceSource': 'day',
                  'available': 4,
                  'physical': 10,
                  'sold': 1,
                  'cap': 4,
                  'minLos': 2,
                },
                {
                  'roomTypeId': 't1',
                  'date': '2026-09-11',
                  'pricePaise': 300000,
                  'priceSource': 'base',
                  'available': 0,
                  'physical': 10,
                  'sold': 0,
                  'stopSell': true,
                },
              ],
            },
          ],
        });
        final row = g.rows.single;
        expect(row.days[0].priceLabel, '₹5000');
        expect(row.days[0].restricted, isTrue);
        expect(row.days[1].stopSell, isTrue);
        expect(row.days[1].available, 0);
      },
    );

    test('a change reads back as a human sentence', () {
      final ch = RateChange.fromJson({
        'roomTypeId': 't1',
        'date': '2026-09-10',
        'field': 'price',
        'before': 300000,
        'after': 500000,
        'actorKind': 'STAFF',
        'createdAt': '2026-09-01T10:00:00Z',
      });
      expect(ch.fieldLabel, 'Price');
      expect(ch.beforeLabel, '₹3000');
      expect(ch.afterLabel, '₹5000');
    });
  });

  group('Property settings', () {
    test('defaults are the sensible ones when the server row is bare', () {
      final s = PropertySettings.fromJson(const {});
      expect(s.invoicePrefix, 'INV');
      expect(s.checkinModel, CheckinModel.single);
      expect(s.checkinTime, '14:00');
      expect(s.holdExpiryMinutes, isNull);
      expect(s.bookingEngineEnabled, isFalse);
    });

    test('a tax describes itself the way the invoice will', () {
      expect(
        PropertyTax.fromJson({
          'id': 'x',
          'name': 'Service',
          'value': 500,
          'calculation': 'PERCENT',
        }).valueLabel,
        '5%',
      );
      expect(
        PropertyTax.fromJson({
          'id': 'y',
          'name': 'Levy',
          'value': 10000,
          'calculation': 'FIXED',
          'basis': 'PER_NIGHT',
        }).valueLabel,
        '₹100 per night',
      );
      expect(
        PropertyPolicy.fromJson({
          'id': 'p',
          'kind': 'CANCELLATION',
          'name': 'Strict',
          'chargeKind': 'PERCENT',
          'value': 5000,
        }).chargeLabel,
        '50% of the stay',
      );
    });
  });
}
