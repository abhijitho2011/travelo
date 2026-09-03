import '../../../core/networking/api_client.dart';
import 'property_settings_models.dart';

/// `api/v1/staff/property/*` — settings and the four catalogues.
class PropertySettingsRepository {
  PropertySettingsRepository(this._api);
  final ApiClient _api;

  List<T> _list<T>(Object? data, T Function(Map) parse) {
    final raw = data is Map && data['items'] is List ? data['items'] : data;
    return (raw as List? ?? const []).whereType<Map>().map(parse).toList();
  }

  Future<PropertySettings> settings() async =>
      PropertySettings.fromJson(await _api.get('/property/settings') as Map);
  Future<PropertySettings> updateSettings(Map<String, dynamic> patch) async =>
      PropertySettings.fromJson(
        await _api.patch('/property/settings', body: patch) as Map,
      );

  Future<List<PropertyTax>> taxes() async =>
      _list(await _api.get('/property/taxes'), PropertyTax.fromJson);
  Future<void> createTax(Map<String, dynamic> b) =>
      _api.post('/property/taxes', body: b);
  Future<void> updateTax(String id, Map<String, dynamic> b) =>
      _api.patch('/property/taxes/$id', body: b);
  Future<void> deleteTax(String id) => _api.delete('/property/taxes/$id');

  Future<List<PropertyPolicy>> policies() async =>
      _list(await _api.get('/property/policies'), PropertyPolicy.fromJson);
  Future<void> createPolicy(Map<String, dynamic> b) =>
      _api.post('/property/policies', body: b);
  Future<void> updatePolicy(String id, Map<String, dynamic> b) =>
      _api.patch('/property/policies/$id', body: b);
  Future<void> deletePolicy(String id) => _api.delete('/property/policies/$id');

  Future<List<AddonService>> addons() async =>
      _list(await _api.get('/property/addons'), AddonService.fromJson);
  Future<void> createAddon(Map<String, dynamic> b) =>
      _api.post('/property/addons', body: b);
  Future<void> updateAddon(String id, Map<String, dynamic> b) =>
      _api.patch('/property/addons/$id', body: b);
  Future<void> deleteAddon(String id) => _api.delete('/property/addons/$id');

  Future<List<BookingSource>> sources() async => _list(
    await _api.get('/property/booking-sources'),
    BookingSource.fromJson,
  );
  Future<void> createSource(Map<String, dynamic> b) =>
      _api.post('/property/booking-sources', body: b);
  Future<void> updateSource(String id, Map<String, dynamic> b) =>
      _api.patch('/property/booking-sources/$id', body: b);
  Future<void> deleteSource(String id) =>
      _api.delete('/property/booking-sources/$id');

  Future<List<Coupon>> coupons() async =>
      _list(await _api.get('/property/coupons'), Coupon.fromJson);
  Future<void> createCoupon(Map<String, dynamic> b) =>
      _api.post('/property/coupons', body: b);
  Future<void> updateCoupon(String id, Map<String, dynamic> b) =>
      _api.patch('/property/coupons/$id', body: b);
  Future<void> deleteCoupon(String id) => _api.delete('/property/coupons/$id');
}
