import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/networking/api_client.dart';
import '../../../core/networking/api_exception.dart';
import '../../../core/providers.dart';
import 'spa_models.dart';

/// Every spa read and write. Reads translate a missing endpoint into an empty
/// state; writes let the exception through so a failed settlement is never
/// silently swallowed.
class SpaRepository {
  SpaRepository(this._api);

  final ApiClient _api;

  List<T> _listOf<T>(dynamic data, T Function(Map) parse) {
    final items = data is Map ? data['items'] : data;
    if (items is List) return items.whereType<Map>().map(parse).toList();
    return <T>[];
  }

  // --------------------------------------------------------------- services --

  Future<List<SpaService>> services({bool all = false}) async {
    try {
      final data = await _api.get('/spa/services', query: {if (all) 'all': 'true'});
      return _listOf(data, SpaService.fromJson);
    } on ApiException catch (e) {
      if (e.isMissingEndpoint) return const [];
      rethrow;
    }
  }

  Future<void> createService(Map<String, dynamic> body) =>
      _api.post('/spa/services', body: body);

  Future<void> updateService(String id, Map<String, dynamic> changes) =>
      _api.patch('/spa/services/$id', body: changes);

  Future<void> deleteService(String id) => _api.delete('/spa/services/$id');

  // ----------------------------------------------------------- appointments --

  Future<List<SpaAppointment>> appointments({
    SpaAppointmentStatus? status,
    bool mine = false,
  }) async {
    try {
      final data = await _api.get('/spa/appointments', query: {
        if (status != null) 'status': status.wire,
        if (mine) 'mine': 'true',
      });
      return _listOf(data, SpaAppointment.fromJson);
    } on ApiException catch (e) {
      if (e.isMissingEndpoint) return const [];
      rethrow;
    }
  }

  Future<void> createAppointment(Map<String, dynamic> body) =>
      _api.post('/spa/appointments', body: body);

  Future<void> assignTherapist(String id, String staffId) =>
      _api.post('/spa/appointments/$id/assign', body: {'staffId': staffId});

  Future<void> setStatus(String id, SpaAppointmentStatus status) =>
      _api.post('/spa/appointments/$id/status', body: {'status': status.wire});

  Future<void> addNotes(String id, String notes) =>
      _api.post('/spa/appointments/$id/notes', body: {'notes': notes});

  // ------------------------------------------------------------------ bills --

  Future<List<SpaBill>> bills({SpaBillStatus? status}) async {
    try {
      final data = await _api.get('/spa/bills', query: {
        if (status != null) 'status': status.wire,
      });
      return _listOf(data, SpaBill.fromJson);
    } on ApiException catch (e) {
      if (e.isMissingEndpoint) return const [];
      rethrow;
    }
  }

  Future<void> createBill(String appointmentId) =>
      _api.post('/spa/bills', body: {'appointmentId': appointmentId});

  Future<void> settleBill(String id, SpaPaymentMethod method, {String? reservationId}) =>
      _api.post('/spa/bills/$id/settle', body: {
        'method': method.wire,
        if (reservationId != null) 'reservationId': reservationId,
      });

  Future<void> refundBill(String id, String reason) =>
      _api.post('/spa/bills/$id/refund', body: {'reason': reason});

  // -------------------------------------------------------- dashboards / rev --

  Future<SpaDashboard?> dashboard() async {
    try {
      final data = await _api.get('/spa/dashboard');
      return data is Map ? SpaDashboard.fromJson(data) : null;
    } on ApiException catch (e) {
      if (e.isMissingEndpoint) return null;
      rethrow;
    }
  }

  Future<SpaRevenue?> revenue() async {
    try {
      final data = await _api.get('/spa/revenue');
      return data is Map ? SpaRevenue.fromJson(data) : null;
    } on ApiException catch (e) {
      if (e.isMissingEndpoint) return null;
      rethrow;
    }
  }
}

final spaRepositoryProvider = Provider<SpaRepository>(
  (ref) => SpaRepository(ref.watch(apiClientProvider)),
);
