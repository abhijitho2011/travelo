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

  /// Partial edit of one GM/AGM. Only the changed keys are sent, so an
  /// untouched field is never overwritten with a stale value.
  Future<void> updateStaff(
    String propertyId,
    String staffId,
    Map<String, dynamic> body,
  ) =>
      _api.patch('/properties/$propertyId/staff/$staffId', body: body);

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

  /// The same catalogue carrying ids. The profile form posts
  /// `location_states.id` / `location_districts.id`, unlike the property and
  /// staff forms which post names.
  Future<List<CatalogueState>> locationCatalogue() async {
    final d = await _api.get('/reference/locations') as Map;
    final list = (d['catalogue'] ?? []) as List;
    return list.map((e) => CatalogueState.fromJson(e as Map)).toList();
  }

  // ---------- Profile ----------

  Future<OwnerAccount> profile() async =>
      OwnerAccount.fromJson(await _api.get('/profile') as Map);

  Future<OwnerAccount> updateProfile(Map<String, dynamic> body) async =>
      OwnerAccount.fromJson(await _api.patch('/profile', body: body) as Map);

  // ---------- Subscription ----------

  Future<SubscriptionDetail> subscription() async =>
      SubscriptionDetail.fromJson(await _api.get('/subscription') as Map);

  Future<List<Invoice>> invoices() async {
    final d = await _api.get('/subscription/invoices');
    final list = d is Map ? (d['items'] ?? []) : d;
    return (list as List).map((e) => Invoice.fromJson(e as Map)).toList();
  }

  // ---------- Support ----------

  Future<List<SupportTicket>> tickets({String? status, String? q}) async {
    final d = await _api.get('/support/tickets', query: {
      if (status != null && status.isNotEmpty) 'status': status,
      if (q != null && q.trim().isNotEmpty) 'q': q.trim(),
    });
    final list = d is Map ? (d['items'] ?? []) : d;
    return (list as List).map((e) => SupportTicket.fromJson(e as Map)).toList();
  }

  Future<SupportTicket> ticket(String id) async =>
      SupportTicket.fromJson(await _api.get('/support/tickets/$id') as Map);

  Future<SupportTicket> createTicket(Map<String, dynamic> body) async =>
      SupportTicket.fromJson(await _api.post('/support/tickets', body: body) as Map);

  Future<void> replyToTicket(String id, String body) =>
      _api.post('/support/tickets/$id/messages', body: {'body': body});

  // ---------- Security / sessions ----------

  Future<List<OwnerSession>> sessions() async {
    final d = await _api.get('/sessions');
    final list = d is Map ? (d['items'] ?? []) : d;
    return (list as List).map((e) => OwnerSession.fromJson(e as Map)).toList();
  }

  /// Returns true when the revoked session was the one this device is using —
  /// the caller must then sign out locally.
  Future<bool> revokeSession(String id) async {
    final d = await _api.delete('/sessions/$id');
    return d is Map && d['wasCurrent'] == true;
  }

  Future<int> revokeOtherSessions() async {
    final d = await _api.post('/sessions/revoke-all');
    return d is Map ? ((d['revoked'] as num?)?.toInt() ?? 0) : 0;
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

final ownerAccountProvider = FutureProvider.autoDispose<OwnerAccount>(
  (ref) => ref.watch(ownerRepositoryProvider).profile(),
);

/// State/district catalogue WITH ids, for the profile form. Kept separate from
/// `locationsProvider` (names) so neither form has to translate.
final locationCatalogueProvider = FutureProvider<List<CatalogueState>>(
  (ref) => ref.watch(ownerRepositoryProvider).locationCatalogue(),
);

final subscriptionProvider = FutureProvider.autoDispose<SubscriptionDetail>(
  (ref) => ref.watch(ownerRepositoryProvider).subscription(),
);

final invoicesProvider = FutureProvider.autoDispose<List<Invoice>>(
  (ref) => ref.watch(ownerRepositoryProvider).invoices(),
);

/// Ticket list, filtered by status ('' means all).
final ticketsProvider =
    FutureProvider.autoDispose.family<List<SupportTicket>, String>(
  (ref, status) => ref.watch(ownerRepositoryProvider).tickets(status: status),
);

final ticketProvider =
    FutureProvider.autoDispose.family<SupportTicket, String>(
  (ref, id) => ref.watch(ownerRepositoryProvider).ticket(id),
);

final sessionsProvider = FutureProvider.autoDispose<List<OwnerSession>>(
  (ref) => ref.watch(ownerRepositoryProvider).sessions(),
);
