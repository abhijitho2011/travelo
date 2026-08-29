import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/networking/api_client.dart';
import '../../../core/networking/api_exception.dart';
import '../../../core/providers.dart';
import 'reception_models.dart';

/// Front-office reads and writes. Reads degrade to empty on a missing
/// endpoint; writes surface their failure.
class ReceptionRepository {
  ReceptionRepository(this._api);

  final ApiClient _api;

  Future<DeskSnapshot?> summary() async {
    try {
      final data = await _api.get('/reception/summary');
      return data is Map ? DeskSnapshot.fromJson(data) : null;
    } on ApiException catch (e) {
      if (e.isMissingEndpoint) return null;
      rethrow;
    }
  }

  Future<List<Reservation>> reservations({String? filter}) async {
    try {
      final data = await _api.get(
        '/reservations',
        query: filter == null ? null : {'filter': filter},
      );
      if (data is List) {
        return data.whereType<Map>().map(Reservation.fromJson).toList();
      }
      if (data is Map && data['items'] is List) {
        return (data['items'] as List)
            .whereType<Map>()
            .map(Reservation.fromJson)
            .toList();
      }
      return const [];
    } on ApiException catch (e) {
      if (e.isMissingEndpoint) return const [];
      rethrow;
    }
  }

  Future<Reservation?> reservation(String id) async {
    try {
      final data = await _api.get('/reservations/$id');
      return data is Map ? Reservation.fromJson(data) : null;
    } on ApiException catch (e) {
      if (e.isMissingEndpoint) return null;
      rethrow;
    }
  }

  Future<void> checkIn(String reservationId, {String? roomNumber}) => _api.post(
    '/reservations/$reservationId/check-in',
    body: roomNumber == null ? null : {'roomNumber': roomNumber},
  );

  Future<void> checkOut(String reservationId) =>
      _api.post('/reservations/$reservationId/check-out');

  Future<void> cancel(String reservationId, {required String reason}) =>
      _api.post('/reservations/$reservationId/cancel', body: {'reason': reason});
}

final receptionRepositoryProvider = Provider<ReceptionRepository>(
  (ref) => ReceptionRepository(ref.watch(apiClientProvider)),
);

final deskSummaryProvider = FutureProvider.autoDispose<DeskSnapshot?>(
  (ref) => ref.watch(receptionRepositoryProvider).summary(),
);

/// Which slice of the book the list is showing.
enum ReservationFilter {
  arrivals('Arrivals', 'arrivals'),
  departures('Departures', 'departures'),
  inHouse('In house', 'in-house'),
  all('All', null);

  const ReservationFilter(this.label, this.wire);

  final String label;
  final String? wire;
}

final reservationFilterProvider = StateProvider<ReservationFilter>(
  (_) => ReservationFilter.arrivals,
);

final reservationsProvider = FutureProvider.autoDispose<List<Reservation>>((
  ref,
) {
  final filter = ref.watch(reservationFilterProvider);
  return ref.watch(receptionRepositoryProvider).reservations(
    filter: filter.wire,
  );
});

final reservationProvider = FutureProvider.autoDispose
    .family<Reservation?, String>(
      (ref, id) => ref.watch(receptionRepositoryProvider).reservation(id),
    );
