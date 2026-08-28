import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:image_picker/image_picker.dart';

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

  /// Returns the id of the property that was just created, so photos can be
  /// uploaded against it.
  Future<String> createProperty(Map<String, dynamic> body) async {
    final d = await _api.post('/properties', body: body);
    return (d as Map)['id'] as String;
  }

  /// Uploads one picked image. On web an [XFile] has no readable path, so the
  /// bytes are read explicitly; on mobile/desktop the path is used directly.
  Future<void> uploadPropertyPhoto(String propertyId, XFile file) async {
    final name = file.name.isNotEmpty ? file.name : 'photo.jpg';
    final bytes = await file.readAsBytes();
    final form = FormData.fromMap({
      'files': MultipartFile.fromBytes(bytes, filename: name),
    });
    await _api.postMultipart('/properties/$propertyId/photos', form);
  }

  Future<List<Map<String, dynamic>>> propertyPhotos(String propertyId) async {
    final d = await _api.get('/properties/$propertyId/photos');
    return (d as List).map((e) => Map<String, dynamic>.from(e as Map)).toList();
  }

  Future<void> deletePropertyPhoto(String propertyId, String photoId) =>
      _api.delete('/properties/$propertyId/photos/$photoId');

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
