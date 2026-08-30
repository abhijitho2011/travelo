import 'dart:async';

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

  // ---------- Inventory: amenities, room types, rooms ----------

  /// What this hotel offers plus the catalogue to pick from, in one call.
  Future<PropertyAmenities> propertyAmenities(String propertyId) async =>
      PropertyAmenities.fromJson(
        await _api.get('/properties/$propertyId/amenities') as Map,
      );

  /// PUT semantics: [ids] is the COMPLETE desired set, so an amenity left out
  /// is removed. Returns the hotel's facilities as the server now holds them.
  Future<List<Amenity>> setPropertyAmenities(
    String propertyId,
    List<String> ids,
  ) async {
    final d = await _api.put(
      '/properties/$propertyId/amenities',
      body: {'amenityIds': ids},
    );
    final list = d is Map ? (d['selected'] ?? []) : d;
    return (list as List).map((e) => Amenity.fromJson(e as Map)).toList();
  }

  /// Read-only. Owners do not create room types — the GM does, from the staff
  /// app — so there is no create/update counterpart here.
  Future<List<RoomType>> propertyRoomTypes(String propertyId) async {
    final d = await _api.get('/properties/$propertyId/room-types');
    final list = d is Map ? (d['items'] ?? []) : d;
    return (list as List).map((e) => RoomType.fromJson(e as Map)).toList();
  }

  /// Read-only, same reasoning. Asks for the server's maximum page so the
  /// by-status summary covers a whole hotel rather than the first 100 rooms.
  Future<List<Room>> propertyRooms(String propertyId) async {
    final d = await _api.get(
      '/properties/$propertyId/rooms',
      query: {'limit': 200},
    );
    final list = d is Map ? (d['items'] ?? []) : d;
    return (list as List).map((e) => Room.fromJson(e as Map)).toList();
  }

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

  Future<({List<OwnerNotification> items, int unread})> notifications() async {
    final d = await _api.get('/notifications');
    final list = d is Map ? (d['items'] ?? const []) : (d ?? const []);
    final items = (list as List)
        .whereType<Map>()
        .map(OwnerNotification.fromJson)
        .toList();
    final unread = d is Map && d['unread'] is num
        ? (d['unread'] as num).toInt()
        : items.where((n) => !n.read).length;
    return (items: items, unread: unread);
  }

  Future<void> markNotificationRead(String id) =>
      _api.post('/notifications/$id/read');

  Future<void> markAllNotificationsRead() =>
      _api.post('/notifications/read-all');

  Future<List<Invoice>> invoices() async {
    final d = await _api.get('/subscription/invoices');
    final list = d is Map ? (d['items'] ?? []) : d;
    return (list as List).map((e) => Invoice.fromJson(e as Map)).toList();
  }

  /// Raises a gateway order to pay for the owner's next period. The server
  /// resolves the subscription; the client only picks the gateway (optional).
  Future<SubscriptionOrder> createSubscriptionOrder({String? gateway}) async {
    final d = await _api.post(
      '/subscription/orders',
      body: {if (gateway != null) 'gateway': gateway},
    );
    return SubscriptionOrder.fromJson(d as Map);
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

/// All three are keyed on the property id, so opening a second hotel never
/// shows the first one's inventory while its own request is in flight.
final propertyAmenitiesProvider =
    FutureProvider.autoDispose.family<PropertyAmenities, String>(
  (ref, propertyId) =>
      ref.watch(ownerRepositoryProvider).propertyAmenities(propertyId),
);

final propertyRoomTypesProvider =
    FutureProvider.autoDispose.family<List<RoomType>, String>(
  (ref, propertyId) =>
      ref.watch(ownerRepositoryProvider).propertyRoomTypes(propertyId),
);

final propertyRoomsProvider =
    FutureProvider.autoDispose.family<List<Room>, String>(
  (ref, propertyId) => ref.watch(ownerRepositoryProvider).propertyRooms(propertyId),
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

typedef OwnerInbox = ({List<OwnerNotification> items, int unread});

/// The owner's IN_APP inbox. Polls so the bell badge does not sit stale.
class OwnerNotificationsController extends AsyncNotifier<OwnerInbox> {
  @override
  Future<OwnerInbox> build() {
    final timer = Timer.periodic(
      const Duration(seconds: 120),
      (_) => _silentRefresh(),
    );
    ref.onDispose(timer.cancel);
    return ref.watch(ownerRepositoryProvider).notifications();
  }

  Future<void> _silentRefresh() async {
    final next = await AsyncValue.guard(
      () => ref.read(ownerRepositoryProvider).notifications(),
    );
    if (next.hasValue) state = next;
  }

  Future<void> refresh() async {
    state = const AsyncValue.loading();
    state = await AsyncValue.guard(
      () => ref.read(ownerRepositoryProvider).notifications(),
    );
  }

  Future<void> markRead(String id) async {
    final current = state.value;
    if (current == null) return;
    final items = [
      for (final n in current.items)
        if (n.id == id) n.copyWith(read: true) else n,
    ];
    state = AsyncValue.data((
      items: items,
      unread: items.where((n) => !n.read).length,
    ));
    await ref.read(ownerRepositoryProvider).markNotificationRead(id);
  }

  Future<void> markAllRead() async {
    final current = state.value;
    if (current == null) return;
    state = AsyncValue.data((
      items: [for (final n in current.items) n.copyWith(read: true)],
      unread: 0,
    ));
    await ref.read(ownerRepositoryProvider).markAllNotificationsRead();
  }
}

final ownerNotificationsProvider =
    AsyncNotifierProvider<OwnerNotificationsController, OwnerInbox>(
  OwnerNotificationsController.new,
);

/// Unread count for the top-bar bell badge.
final ownerUnreadCountProvider = Provider<int>((ref) {
  return ref.watch(ownerNotificationsProvider).value?.unread ?? 0;
});
