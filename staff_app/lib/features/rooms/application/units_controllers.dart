import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../data/room_models.dart';
import '../data/rooms_repository.dart' show roomsRepositoryProvider;
import '../data/unit_models.dart';
import '../data/units_repository.dart';

/// The photo gallery for one room type. Presigned URLs expire, so this is
/// autoDispose — reopening the workspace re-fetches fresh links rather than
/// rendering a set of dead ones from a cache.
final roomTypePhotosProvider = FutureProvider.autoDispose
    .family<List<RoomTypePhoto>, String>(
      (ref, roomTypeId) =>
          ref.watch(unitsRepositoryProvider).photos(roomTypeId),
    );

final ratePlansProvider = FutureProvider.autoDispose
    .family<List<RatePlan>, String>(
      (ref, roomTypeId) =>
          ref.watch(unitsRepositoryProvider).ratePlans(roomTypeId: roomTypeId),
    );

/// Every rate plan on the property, in one request. The list page needs a
/// plan count and a starting price per row; fetching them together beats one
/// request per room type.
final allRatePlansProvider = FutureProvider.autoDispose<List<RatePlan>>(
  (ref) => ref.watch(unitsRepositoryProvider).ratePlans(),
);

final roomTypeFeesProvider = FutureProvider.autoDispose
    .family<List<RoomTypeFee>, String>(
      (ref, roomTypeId) => ref.watch(unitsRepositoryProvider).fees(roomTypeId),
    );

final pricingRulesProvider = FutureProvider.autoDispose
    .family<List<PricingRule>, String>(
      (ref, roomTypeId) =>
          ref.watch(unitsRepositoryProvider).pricingRules(roomTypeId),
    );

/// The physical units belonging to one room type, straight from the rooms
/// board's own endpoint — the workspace never keeps a second copy of the
/// inventory, so its table and the board cannot drift apart.
final unitsOfTypeProvider = FutureProvider.autoDispose.family<List<Room>, String>(
  (ref, roomTypeId) => ref
      .watch(roomsRepositoryProvider)
      .rooms(RoomFilter(roomTypeId: roomTypeId, limit: 200)),
);

/// The inventory summary card. Derived from the same rooms the table shows —
/// counted here rather than fetched, because a second source could disagree
/// with the rows directly above it.
final unitInventoryProvider = Provider.autoDispose
    .family<AsyncValue<UnitInventory>, String>((ref, roomTypeId) {
      return ref.watch(unitsOfTypeProvider(roomTypeId)).whenData((rooms) {
        var available = 0, occupied = 0, blocked = 0, outOfService = 0;
        for (final room in rooms) {
          switch (room.status) {
            case RoomStatus.available:
            case RoomStatus.ready:
            case RoomStatus.inspected:
              available += 1;
            case RoomStatus.occupied:
              occupied += 1;
            case RoomStatus.dirty:
            case RoomStatus.cleaning:
              blocked += 1;
            case RoomStatus.maintenance:
            case RoomStatus.outOfOrder:
              outOfService += 1;
          }
        }
        return UnitInventory(
          total: rooms.length,
          available: available,
          occupied: occupied,
          blocked: blocked,
          outOfService: outOfService,
        );
      });
    });

/// Mutations for everything the workspace owns beyond the room type itself.
/// Each one refreshes exactly the provider it invalidated, so a rate-plan edit
/// never re-fetches the photo gallery.
class UnitsActions {
  const UnitsActions(this._ref);

  final Ref _ref;

  UnitsRepository get _repo => _ref.read(unitsRepositoryProvider);

  // -- photos --

  Future<RoomTypePhoto> uploadPhoto(
    String roomTypeId, {
    required List<int> bytes,
    required String filename,
    PhotoCategory category = PhotoCategory.room,
  }) async {
    final photo = await _repo.uploadPhoto(
      roomTypeId,
      bytes: bytes,
      filename: filename,
      category: category,
    );
    _ref.invalidate(roomTypePhotosProvider(roomTypeId));
    return photo;
  }

  Future<void> setPrimaryPhoto(String roomTypeId, String photoId) async {
    await _repo.setPrimaryPhoto(roomTypeId, photoId);
    _ref.invalidate(roomTypePhotosProvider(roomTypeId));
  }

  Future<void> reorderPhotos(String roomTypeId, List<String> orderedIds) async {
    await _repo.reorderPhotos(roomTypeId, orderedIds);
    _ref.invalidate(roomTypePhotosProvider(roomTypeId));
  }

  Future<void> deletePhoto(String roomTypeId, String photoId) async {
    await _repo.deletePhoto(roomTypeId, photoId);
    _ref.invalidate(roomTypePhotosProvider(roomTypeId));
  }

  // -- rate plans --

  Future<RatePlan> createRatePlan(RatePlanInput input) async {
    final plan = await _repo.createRatePlan(input);
    _ref.invalidate(ratePlansProvider(input.roomTypeId));
    return plan;
  }

  Future<RatePlan> updateRatePlan(
    String roomTypeId,
    String id,
    Map<String, dynamic> changes,
  ) async {
    final plan = await _repo.updateRatePlan(id, changes);
    _ref.invalidate(ratePlansProvider(roomTypeId));
    return plan;
  }

  Future<void> setRatePlanStatus(
    String roomTypeId,
    String id,
    RatePlanStatus status,
  ) async {
    await _repo.setRatePlanStatus(id, status);
    _ref.invalidate(ratePlansProvider(roomTypeId));
  }

  Future<void> deleteRatePlan(String roomTypeId, String id) async {
    await _repo.deleteRatePlan(id);
    _ref.invalidate(ratePlansProvider(roomTypeId));
  }

  // -- fees --

  Future<void> createFee(String roomTypeId, RoomTypeFee fee) async {
    await _repo.createFee(roomTypeId, fee);
    _ref.invalidate(roomTypeFeesProvider(roomTypeId));
  }

  Future<void> updateFee(
    String roomTypeId,
    String feeId,
    Map<String, dynamic> changes,
  ) async {
    await _repo.updateFee(feeId, changes);
    _ref.invalidate(roomTypeFeesProvider(roomTypeId));
  }

  Future<void> deleteFee(String roomTypeId, String feeId) async {
    await _repo.deleteFee(feeId);
    _ref.invalidate(roomTypeFeesProvider(roomTypeId));
  }

  // -- pricing rules --

  Future<void> createPricingRule(String roomTypeId, PricingRule rule) async {
    await _repo.createPricingRule(roomTypeId, rule);
    _ref.invalidate(pricingRulesProvider(roomTypeId));
  }

  Future<void> updatePricingRule(
    String roomTypeId,
    String ruleId,
    Map<String, dynamic> changes,
  ) async {
    await _repo.updatePricingRule(ruleId, changes);
    _ref.invalidate(pricingRulesProvider(roomTypeId));
  }

  Future<void> deletePricingRule(String roomTypeId, String ruleId) async {
    await _repo.deletePricingRule(ruleId);
    _ref.invalidate(pricingRulesProvider(roomTypeId));
  }
}

final unitsActionsProvider = Provider<UnitsActions>(UnitsActions.new);

/// The guest-price preview under Taxes & fees.
///
/// Mirrors the server's own preview arithmetic: percentage fees are basis
/// points applied to the base, PER_GUEST multiplies by guests, PER_NIGHT by
/// nights, and when the property quotes tax-inclusive prices the tax is shown
/// as extracted from the rate rather than added on top (so the guest total
/// equals the rate). Integer paise throughout — no floating point.
class PricePreview {
  const PricePreview({
    required this.basePaise,
    required this.lines,
    required this.taxTotalPaise,
    required this.guestTotalPaise,
  });

  final int basePaise;
  final List<({String name, int amountPaise})> lines;
  final int taxTotalPaise;
  final int guestTotalPaise;

  static PricePreview compute({
    required int basePaise,
    required List<RoomTypeFee> fees,
    int nights = 1,
    int guests = 2,
    bool pricesIncludeTax = false,
  }) {
    final base = basePaise * nights;
    final lines = <({String name, int amountPaise})>[];
    var total = 0;

    for (final fee in fees) {
      var amount = fee.calculation == FeeCalculation.percent
          // Basis points on the per-night rate, then per night below.
          ? (basePaise * fee.value) ~/ 10000
          : fee.value;
      if (fee.basis == FeeBasis.perGuest) amount *= guests;
      if (fee.period == FeePeriod.perNight) amount *= nights;
      lines.add((name: fee.name, amountPaise: amount));
      total += amount;
    }

    return PricePreview(
      basePaise: base,
      lines: lines,
      taxTotalPaise: total,
      // Inclusive pricing means the fees are already inside the quoted rate:
      // the guest pays the rate, and the lines explain what sits inside it.
      guestTotalPaise: pricesIncludeTax ? base : base + total,
    );
  }
}
