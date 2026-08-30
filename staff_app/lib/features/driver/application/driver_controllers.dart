import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../travel_desk/data/transport_models.dart';
import '../data/driver_repository.dart';

final myTripsProvider = FutureProvider.autoDispose<List<TransportRequest>>(
  (ref) => ref.watch(driverRepositoryProvider).myTrips(),
);

final myTripProvider = FutureProvider.autoDispose.family<TransportRequest?, String>(
  (ref, id) => ref.watch(driverRepositoryProvider).trip(id),
);

class DriverActions {
  const DriverActions(this._ref);
  final Ref _ref;

  Future<TransportRequest> step(String id, DriverStep step) async {
    final r = await _ref.read(driverRepositoryProvider).step(id, step);
    _ref.invalidate(myTripsProvider);
    _ref.invalidate(myTripProvider(id));
    return r;
  }
}

final driverActionsProvider = Provider.autoDispose<DriverActions>(
  (ref) => DriverActions(ref),
);
