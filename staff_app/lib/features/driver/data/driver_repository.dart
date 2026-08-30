import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/networking/api_client.dart';
import '../../../core/networking/api_exception.dart';
import '../../../core/providers.dart';
import '../../travel_desk/data/transport_models.dart';

/// The driver's own trips. Reuses the transport model; the endpoints are scoped
/// server-side to the signed-in driver, so there is no id to pass.
class DriverRepository {
  DriverRepository(this._api);

  final ApiClient _api;

  Future<List<TransportRequest>> myTrips() async {
    try {
      final data = await _api.get('/driver/trips');
      if (data is List) return data.whereType<Map>().map(TransportRequest.fromJson).toList();
      if (data is Map && data['items'] is List) {
        return (data['items'] as List).whereType<Map>().map(TransportRequest.fromJson).toList();
      }
      return const [];
    } on ApiException catch (e) {
      if (e.isMissingEndpoint) return const [];
      rethrow;
    }
  }

  Future<TransportRequest?> trip(String id) async {
    try {
      final data = await _api.get('/driver/trips/$id');
      return data is Map ? TransportRequest.fromJson(data) : null;
    } on ApiException catch (e) {
      if (e.isMissingEndpoint) return null;
      rethrow;
    }
  }

  Future<TransportRequest> step(String id, DriverStep step) async {
    final data = await _api.post('/driver/trips/$id/step', body: {'step': step.wire});
    if (data is Map) return TransportRequest.fromJson(data);
    throw const ApiException(code: 'ERROR', message: 'The trip did not come back updated.');
  }
}

final driverRepositoryProvider = Provider<DriverRepository>(
  (ref) => DriverRepository(ref.watch(apiClientProvider)),
);
