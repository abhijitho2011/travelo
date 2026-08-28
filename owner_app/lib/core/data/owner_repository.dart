import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../api/api_client.dart';
import '../models/owner_models.dart';
import '../providers.dart';

/// Owner-facing data access. Endpoints live under `/owner/*` on the backend.
class OwnerRepository {
  OwnerRepository(this._api);
  final ApiClient _api;

  Future<PortfolioSummary> portfolio() async {
    final d = await _api.get('/portfolio/summary') as Map;
    return PortfolioSummary.fromJson(d);
  }

  Future<List<Property>> properties() async {
    final d = await _api.get('/properties');
    final list = d is Map ? (d['items'] ?? d['data'] ?? []) : d;
    return (list as List).map((e) => Property.fromJson(e as Map)).toList();
  }

  Future<void> createProperty(Map<String, dynamic> body) =>
      _api.post('/properties', body: body);

  Future<List<StaffMember>> staff(String propertyId) async {
    final d = await _api.get('/properties/$propertyId/staff');
    final list = d is Map ? (d['items'] ?? d['data'] ?? []) : d;
    return (list as List).map((e) => StaffMember.fromJson(e as Map)).toList();
  }

  Future<void> createStaff(String propertyId, Map<String, dynamic> body) =>
      _api.post('/properties/$propertyId/staff', body: body);

  Future<void> setStaffStatus(String propertyId, String staffId, String status) =>
      _api.post('/properties/$propertyId/staff/$staffId/status', body: {'status': status});

  Future<void> deleteStaff(String propertyId, String staffId) =>
      _api.delete('/properties/$propertyId/staff/$staffId');

  /// Admin-managed state → districts reference. Falls back to a bundled asset
  /// (loaded by the caller) when the endpoint is unavailable.
  Future<Map<String, List<String>>> locations() async {
    final d = await _api.get('/reference/locations') as Map;
    final states = (d['states'] ?? d) as Map;
    return states.map(
      (k, v) => MapEntry(k.toString(), (v as List).map((e) => e.toString()).toList()),
    );
  }
}

final ownerRepositoryProvider = Provider<OwnerRepository>(
  (ref) => OwnerRepository(ref.watch(apiClientProvider)),
);

final portfolioProvider = FutureProvider.autoDispose<PortfolioSummary>(
  (ref) => ref.watch(ownerRepositoryProvider).portfolio(),
);

final propertiesProvider = FutureProvider.autoDispose<List<Property>>(
  (ref) => ref.watch(ownerRepositoryProvider).properties(),
);

final staffProvider =
    FutureProvider.autoDispose.family<List<StaffMember>, String>(
  (ref, propertyId) => ref.watch(ownerRepositoryProvider).staff(propertyId),
);
