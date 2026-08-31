import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/networking/api_client.dart';
import '../../../core/networking/api_exception.dart';
import '../../../core/providers.dart';
import 'transport_models.dart';

/// Every travel-desk read and write. Reads translate a missing endpoint into an
/// honest empty state; writes let the exception through.
class TravelDeskRepository {
  TravelDeskRepository(this._api);

  final ApiClient _api;

  Future<TransportSummary?> summary() async {
    try {
      final data = await _api.get('/travel-desk/summary');
      return data is Map ? TransportSummary.fromJson(data) : null;
    } on ApiException catch (e) {
      if (e.isMissingEndpoint) return null;
      rethrow;
    }
  }

  Future<List<TransportRequest>> requests({
    TransportStatus? status,
    TransportType? type,
    String? date,
  }) async {
    try {
      final data = await _api.get(
        '/travel-desk/requests',
        query: {
          if (status != null) 'status': status.wire,
          if (type != null) 'type': type.wire,
          if (date != null) 'date': date,
        },
      );
      return _listOf(data, TransportRequest.fromJson);
    } on ApiException catch (e) {
      if (e.isMissingEndpoint) return const [];
      rethrow;
    }
  }

  Future<TransportRequest?> request(String id) async {
    try {
      final data = await _api.get('/travel-desk/requests/$id');
      return data is Map ? TransportRequest.fromJson(data) : null;
    } on ApiException catch (e) {
      if (e.isMissingEndpoint) return null;
      rethrow;
    }
  }

  Future<TransportRequest> create(Map<String, dynamic> body) async {
    final data = await _api.post('/travel-desk/requests', body: body);
    return _one(data, TransportRequest.fromJson, 'transport request');
  }

  Future<TransportRequest> update(
    String id,
    Map<String, dynamic> changes,
  ) async {
    final data = await _api.patch('/travel-desk/requests/$id', body: changes);
    return _one(data, TransportRequest.fromJson, 'transport request');
  }

  Future<TransportRequest> assign(
    String id, {
    required String driverStaffId,
    String? vehicleId,
  }) async {
    final data = await _api.post(
      '/travel-desk/requests/$id/assign',
      body: {
        'driverStaffId': driverStaffId,
        if (vehicleId != null) 'vehicleId': vehicleId,
      },
    );
    return _one(data, TransportRequest.fromJson, 'transport request');
  }

  Future<TransportRequest> setStatus(String id, TransportStatus status) async {
    final data = await _api.patch(
      '/travel-desk/requests/$id/status',
      body: {'status': status.wire},
    );
    return _one(data, TransportRequest.fromJson, 'transport request');
  }

  Future<void> deleteRequest(String id) =>
      _api.delete('/travel-desk/requests/$id');

  // ---------------------------------------------------------------- vehicles --

  Future<List<Vehicle>> vehicles() async {
    try {
      final data = await _api.get('/travel-desk/vehicles');
      return _listOf(data, Vehicle.fromJson);
    } on ApiException catch (e) {
      if (e.isMissingEndpoint) return const [];
      rethrow;
    }
  }

  Future<Vehicle> createVehicle(Map<String, dynamic> body) async {
    final data = await _api.post('/travel-desk/vehicles', body: body);
    return _one(data, Vehicle.fromJson, 'vehicle');
  }

  Future<Vehicle> updateVehicle(String id, Map<String, dynamic> changes) async {
    final data = await _api.patch('/travel-desk/vehicles/$id', body: changes);
    return _one(data, Vehicle.fromJson, 'vehicle');
  }

  Future<void> deleteVehicle(String id) =>
      _api.delete('/travel-desk/vehicles/$id');

  // ------------------------------------------------------------------ staff --

  /// Drivers at this property, for the assign sheet. Reuses the team surface;
  /// degrades to empty when the desk cannot read it.
  Future<List<TeamMemberLite>> drivers() async {
    try {
      final data = await _api.get('/team', query: {'role': 'DRIVER'});
      return _listOf(data, TeamMemberLite.fromJson);
    } on ApiException catch (e) {
      if (e.isMissingEndpoint ||
          e.code == ApiErrorCodes.forbidden ||
          e.code == 'STAFF_FORBIDDEN') {
        return const [];
      }
      rethrow;
    }
  }

  static List<T> _listOf<T>(dynamic data, T Function(Map) parse) {
    if (data is List) return data.whereType<Map>().map(parse).toList();
    if (data is Map && data['items'] is List) {
      return (data['items'] as List).whereType<Map>().map(parse).toList();
    }
    return const [];
  }

  static T _one<T>(dynamic data, T Function(Map) parse, String what) {
    if (data is Map) return parse(data);
    throw ApiException(
      code: 'ERROR',
      message: 'The server did not send back the $what it saved.',
    );
  }
}

/// A minimal staff record for the driver picker.
class TeamMemberLite {
  const TeamMemberLite({required this.id, required this.name});
  final String id;
  final String name;

  static TeamMemberLite fromJson(Map json) {
    final first = (json['firstName'] ?? '').toString().trim();
    final last = (json['lastName'] ?? '').toString().trim();
    final full = [first, last].where((s) => s.isNotEmpty).join(' ');
    return TeamMemberLite(
      id: (json['id'] ?? '').toString(),
      name: full.isEmpty ? (json['name'] ?? 'Driver').toString() : full,
    );
  }
}

final travelDeskRepositoryProvider = Provider<TravelDeskRepository>(
  (ref) => TravelDeskRepository(ref.watch(apiClientProvider)),
);
