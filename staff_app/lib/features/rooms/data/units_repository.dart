import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/networking/api_client.dart';
import '../../../core/providers.dart';
import 'unit_models.dart';

/// Everything the room and room-type workspaces read and write that is not
/// already covered by [RoomsRepository]: the room type's photo gallery, its
/// rate plans, its taxes and fees, and its dynamic-pricing rules.
///
/// Kept separate from the rooms repository on purpose — that one is the
/// inventory board's data source and is used by half the app; this one exists
/// for the configuration workspace and nothing else depends on it.
class UnitsRepository {
  const UnitsRepository(this._api);

  final ApiClient _api;

  static List<T> _listOf<T>(dynamic data, T Function(Map) parse) {
    final items = data is Map ? (data['items'] ?? data['rows']) : data;
    return items is List
        ? items.whereType<Map>().map(parse).toList(growable: false)
        : <T>[];
  }

  // ------------------------------------------------------------- photos --

  Future<List<RoomTypePhoto>> photos(PhotoOwner owner) async {
    final data = await _api.get(owner.path);
    return _listOf(data, RoomTypePhoto.fromJson);
  }

  /// Uploads one image. [bytes] rather than a path so the same call works on
  /// web (where there is no file system) and on a tablet.
  Future<RoomTypePhoto> uploadPhoto(
    PhotoOwner owner, {
    required List<int> bytes,
    required String filename,
    PhotoCategory category = PhotoCategory.room,
  }) async {
    final form = FormData.fromMap({
      'file': MultipartFile.fromBytes(bytes, filename: filename),
      'category': category.wire,
    });
    final data = await _api.postMultipart(owner.path, form);
    return RoomTypePhoto.fromJson(data as Map);
  }

  Future<void> setPrimaryPhoto(PhotoOwner owner, String photoId) =>
      _api.post('${owner.path}/$photoId/primary');

  Future<void> reorderPhotos(PhotoOwner owner, List<String> orderedIds) =>
      _api.patch('${owner.path}/order', body: {'ids': orderedIds});

  Future<void> deletePhoto(PhotoOwner owner, String photoId) =>
      _api.delete('${owner.path}/$photoId');

  // --------------------------------------------------------- rate plans --

  Future<List<RatePlan>> ratePlans({String? roomTypeId}) async {
    final data = await _api.get(
      '/rate-plans',
      query: {if (roomTypeId != null) 'roomTypeId': roomTypeId},
    );
    return _listOf(data, RatePlan.fromJson);
  }

  Future<RatePlan> createRatePlan(RatePlanInput input) async {
    final data = await _api.post('/rate-plans', body: input.toJson());
    return RatePlan.fromJson(data as Map);
  }

  Future<RatePlan> updateRatePlan(
    String id,
    Map<String, dynamic> changes,
  ) async {
    final data = await _api.patch('/rate-plans/$id', body: changes);
    return RatePlan.fromJson(data as Map);
  }

  Future<RatePlan> setRatePlanStatus(String id, RatePlanStatus status) async {
    final data = await _api.post(
      '/rate-plans/$id/status',
      body: {'status': status.wire},
    );
    return RatePlan.fromJson(data as Map);
  }

  Future<void> deleteRatePlan(String id) => _api.delete('/rate-plans/$id');

  // -------------------------------------------------------- taxes & fees --

  Future<List<RoomTypeFee>> fees(String roomTypeId) async {
    final data = await _api.get('/room-types/$roomTypeId/fees');
    return _listOf(data, RoomTypeFee.fromJson);
  }

  Future<RoomTypeFee> createFee(String roomTypeId, RoomTypeFee fee) async {
    final data = await _api.post(
      '/room-types/$roomTypeId/fees',
      body: fee.toJson(),
    );
    return RoomTypeFee.fromJson(data as Map);
  }

  Future<RoomTypeFee> updateFee(
    String feeId,
    Map<String, dynamic> changes,
  ) async {
    final data = await _api.patch('/room-types/fees/$feeId', body: changes);
    return RoomTypeFee.fromJson(data as Map);
  }

  Future<void> deleteFee(String feeId) =>
      _api.delete('/room-types/fees/$feeId');

  // ----------------------------------------------------- dynamic pricing --

  Future<List<PricingRule>> pricingRules(String roomTypeId) async {
    final data = await _api.get('/room-types/$roomTypeId/pricing-rules');
    return _listOf(data, PricingRule.fromJson);
  }

  Future<PricingRule> createPricingRule(
    String roomTypeId,
    PricingRule rule,
  ) async {
    final data = await _api.post(
      '/room-types/$roomTypeId/pricing-rules',
      body: rule.toJson(),
    );
    return PricingRule.fromJson(data as Map);
  }

  Future<PricingRule> updatePricingRule(
    String ruleId,
    Map<String, dynamic> changes,
  ) async {
    final data = await _api.patch(
      '/room-types/pricing-rules/$ruleId',
      body: changes,
    );
    return PricingRule.fromJson(data as Map);
  }

  Future<void> deletePricingRule(String ruleId) =>
      _api.delete('/room-types/pricing-rules/$ruleId');

  // ------------------------------------------------------ sales channels --

  /// Every channel-manager connection the property has, whether or not this
  /// room type is mapped to it — the section shows both states.
  Future<List<ChannelMapping>> channelMappings(String roomTypeId) async {
    final data = await _api.get('/room-types/$roomTypeId/channels');
    return _listOf(data, ChannelMapping.fromJson);
  }

  Future<ChannelMapping> mapChannel(
    String roomTypeId,
    String connectionId, {
    required String channelRoomTypeId,
    String? channelRatePlanId,
  }) async {
    final data = await _api.put(
      '/room-types/$roomTypeId/channels/$connectionId',
      body: {
        'channelRoomTypeId': channelRoomTypeId,
        if (channelRatePlanId != null && channelRatePlanId.isNotEmpty)
          'channelRatePlanId': channelRatePlanId,
      },
    );
    return ChannelMapping.fromJson(data as Map);
  }

  Future<ChannelMapping> unmapChannel(
    String roomTypeId,
    String connectionId,
  ) async {
    final data = await _api.delete(
      '/room-types/$roomTypeId/channels/$connectionId',
    );
    return ChannelMapping.fromJson(data as Map);
  }
}

final unitsRepositoryProvider = Provider<UnitsRepository>(
  (ref) => UnitsRepository(ref.watch(apiClientProvider)),
);
