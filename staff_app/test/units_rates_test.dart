import 'package:flutter_test/flutter_test.dart';
import 'package:tavelo_staff/features/rooms/application/units_controllers.dart';
import 'package:tavelo_staff/features/rooms/data/room_models.dart';
import 'package:tavelo_staff/features/rooms/data/unit_models.dart';
import 'package:tavelo_staff/features/rooms/presentation/room_type_workspace_screen.dart';

RoomTypeFee _fee({
  required String name,
  required int value,
  FeeCalculation calculation = FeeCalculation.percent,
  FeeBasis basis = FeeBasis.perRoom,
  FeePeriod period = FeePeriod.perNight,
}) => RoomTypeFee(
  id: name,
  roomTypeId: 't1',
  name: name,
  value: value,
  calculation: calculation,
  basis: basis,
  period: period,
);

void main() {
  group('RoomTypeDraft occupancy', () {
    test(
      'maximum occupancy is its own number, not the guest counts added up',
      () {
        // A room may allow 3 adults OR 2 adults and 2 children and still only
        // sleep 5 — so the maximum is set, and the counts only cap it.
        final draft = RoomTypeDraft(
          maxOccupancy: 5,
          maxAdults: 3,
          maxChildren: 2,
          maxInfants: 1,
        );
        expect(draft.maxOccupancy, 5);
        expect(draft.occupancyCeiling, 6);
      },
    );

    test('the ceiling is what the allowances add up to', () {
      expect(
        RoomTypeDraft(
          maxAdults: 2,
          maxChildren: 1,
          maxInfants: 1,
        ).occupancyCeiling,
        4,
      );
    });

    test('a whole-unit shape reports itself as one, a room does not', () {
      expect(
        RoomTypeDraft(accommodationType: AccommodationType.villa).isWholeUnit,
        isTrue,
      );
      expect(
        RoomTypeDraft(
          accommodationType: AccommodationType.apartment,
        ).isWholeUnit,
        isTrue,
      );
      expect(
        RoomTypeDraft(accommodationType: AccommodationType.room).isWholeUnit,
        isFalse,
      );
      expect(
        RoomTypeDraft(accommodationType: AccommodationType.suite).isWholeUnit,
        isFalse,
      );
    });
  });

  group('RoomTypeDraft payload', () {
    test('rupees become paise exactly once, on the way out', () {
      final payload = RoomTypeDraft(
        name: 'Deluxe King',
        baseRateRupees: 4500,
        extraBedAvailable: true,
        extraBedPriceRupees: 750,
      ).toPayload();

      expect(payload['baseRate'], 450000);
      expect(payload['extraBedPricePaise'], 75000);
    });

    test('a villa keeps its room count; a plain room is forced back to one', () {
      final villa = RoomTypeDraft(
        accommodationType: AccommodationType.villa,
        unitRoomCount: 3,
      ).toPayload();
      expect(villa['unitKind'], 'VILLA');
      expect(villa['unitRoomCount'], 3);

      // The count only means something for a whole unit — sending 3 for a room
      // would tell the availability maths a room contains three rooms.
      final room = RoomTypeDraft(
        accommodationType: AccommodationType.room,
        unitRoomCount: 3,
      ).toPayload();
      expect(room['unitKind'], 'ROOM');
      expect(room['unitRoomCount'], 1);
    });

    test('the denormalised primary bed mirrors the first sleeping row', () {
      final payload = RoomTypeDraft(
        beds: const [
          BedRow(bedType: BedType.king, quantity: 1),
          BedRow(bedType: BedType.single, quantity: 2),
        ],
      ).toPayload();

      expect(payload['bedType'], 'KING');
      expect(payload['bedCount'], 1);
      expect((payload['beds'] as List).length, 2);
    });

    test(
      'extra-bed detail is omitted entirely when no extra bed is offered',
      () {
        final payload = RoomTypeDraft(extraBedAvailable: false).toPayload();
        expect(payload.containsKey('extraBedPricePaise'), isFalse);
        expect(payload['extraBedAvailable'], false);
      },
    );

    test('an edit round-trips through the draft without drifting', () {
      final type = RoomType(
        id: 't1',
        name: 'Deluxe King',
        bedType: BedType.king,
        bedCount: 1,
        maxOccupancy: 4,
        maxAdults: 3,
        maxChildren: 1,
        airConditioned: true,
        baseRate: 450000,
        status: RoomTypeStatus.active,
        code: 'DLX-KING',
        baseOccupancy: 2,
        sizeValue: 32,
        sizeUnit: SizeUnit.sqm,
      );

      final payload = RoomTypeDraft.from(type).toPayload();
      expect(payload['name'], 'Deluxe King');
      expect(payload['code'], 'DLX-KING');
      expect(payload['baseRate'], 450000);
      expect(payload['baseOccupancy'], 2);
      expect(payload['sizeValue'], 32);
      expect(payload['sizeUnit'], 'SQM');
    });
  });

  group('PricePreview', () {
    test('a percentage fee is basis points on the rate', () {
      final preview = PricePreview.compute(
        basePaise: 450000,
        fees: [_fee(name: 'GST', value: 1250)], // 12.5%
      );
      expect(preview.taxTotalPaise, 56250);
      expect(preview.guestTotalPaise, 506250);
    });

    test(
      'per-guest and per-night multiply, and the lines sum to the total',
      () {
        final preview = PricePreview.compute(
          basePaise: 100000,
          fees: [
            _fee(
              name: 'City tax',
              value: 5000,
              calculation: FeeCalculation.fixed,
              basis: FeeBasis.perGuest,
            ),
          ],
          nights: 3,
          guests: 2,
        );
        // ₹50 (5,000 paise) × 2 guests × 3 nights = ₹300.
        expect(preview.lines.single.amountPaise, 30000);
        expect(
          preview.lines.fold<int>(0, (sum, l) => sum + l.amountPaise),
          preview.taxTotalPaise,
        );
      },
    );

    test('a per-stay fee is charged once however long the stay', () {
      final preview = PricePreview.compute(
        basePaise: 100000,
        fees: [
          _fee(
            name: 'Cleaning',
            value: 25000,
            calculation: FeeCalculation.fixed,
            period: FeePeriod.perStay,
          ),
        ],
        nights: 5,
      );
      expect(preview.taxTotalPaise, 25000);
    });

    test(
      'inclusive pricing charges the rate — the fees explain what is inside',
      () {
        final fees = [_fee(name: 'GST', value: 1250)];
        final exclusive = PricePreview.compute(basePaise: 450000, fees: fees);
        final inclusive = PricePreview.compute(
          basePaise: 450000,
          fees: fees,
          pricesIncludeTax: true,
        );

        expect(exclusive.guestTotalPaise, greaterThan(exclusive.basePaise));
        expect(inclusive.guestTotalPaise, inclusive.basePaise);
      },
    );

    test('no fees means the guest pays exactly the rate', () {
      final preview = PricePreview.compute(basePaise: 450000, fees: const []);
      expect(preview.taxTotalPaise, 0);
      expect(preview.guestTotalPaise, 450000);
      expect(preview.lines, isEmpty);
    });
  });

  group('rate plan wire shape', () {
    test('a plan round-trips through the input payload', () {
      final json = const RatePlanInput(
        roomTypeId: 't1',
        name: 'Non-refundable',
        basePricePaise: 400000,
        mealPlan: MealPlan.breakfast,
        cancellationPolicy: CancellationPolicy.nonRefundable,
        minStay: 2,
      ).toJson();

      expect(json['name'], 'Non-refundable');
      expect(json['basePricePaise'], 400000);
      expect(json['mealPlan'], 'BREAKFAST');
      expect(json['cancellationPolicy'], 'NON_REFUNDABLE');
      expect(json['minStay'], 2);
      // Unset restrictions are absent, not zero — zero would mean "no maximum
      // stay of nought nights", which the server would rightly refuse.
      expect(json.containsKey('maxStay'), isFalse);
    });

    test('an unknown enum from a newer server degrades to a safe default', () {
      final plan = RatePlan.fromJson({
        'id': 'p1',
        'roomTypeId': 't1',
        'name': 'Mystery',
        'basePricePaise': 1,
        'mealPlan': 'BRUNCH_ONLY',
        'cancellationPolicy': 'WHENEVER',
      });
      expect(plan.mealPlan, MealPlan.roomOnly);
      expect(plan.cancellationPolicy, CancellationPolicy.flexible);
    });
  });

  group('fee display', () {
    test('a percentage shows as a percentage, a fixed amount as rupees', () {
      expect(_fee(name: 'GST', value: 1250).valueLabel, '12.5%');
      expect(_fee(name: 'GST', value: 1800).valueLabel, '18%');
      expect(
        _fee(
          name: 'Fee',
          value: 25000,
          calculation: FeeCalculation.fixed,
        ).valueLabel,
        '₹250',
      );
    });
  });
}
