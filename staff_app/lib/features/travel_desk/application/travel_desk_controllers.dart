import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../data/transport_models.dart';
import '../data/travel_desk_repository.dart';

// ------------------------------------------------------------------ reads --

final transportSummaryProvider =
    FutureProvider.autoDispose<TransportSummary?>(
      (ref) => ref.watch(travelDeskRepositoryProvider).summary(),
    );

final transportFilterProvider =
    StateProvider.autoDispose<TransportFilter>((_) => const TransportFilter());

final transportRequestsProvider =
    FutureProvider.autoDispose<List<TransportRequest>>((ref) {
      final f = ref.watch(transportFilterProvider);
      return ref
          .watch(travelDeskRepositoryProvider)
          .requests(status: f.status, type: f.type, date: f.date);
    });

final transportRequestProvider = FutureProvider.autoDispose
    .family<TransportRequest?, String>(
      (ref, id) => ref.watch(travelDeskRepositoryProvider).request(id),
    );

final vehiclesProvider = FutureProvider.autoDispose<List<Vehicle>>(
  (ref) => ref.watch(travelDeskRepositoryProvider).vehicles(),
);

final driversProvider = FutureProvider.autoDispose<List<TeamMemberLite>>(
  (ref) => ref.watch(travelDeskRepositoryProvider).drivers(),
);

@immutable
class TransportFilter {
  const TransportFilter({this.status, this.type, this.date});
  final TransportStatus? status;
  final TransportType? type;
  final String? date;

  TransportFilter copyWith({
    TransportStatus? status,
    bool clearStatus = false,
    TransportType? type,
    bool clearType = false,
    String? date,
    bool clearDate = false,
  }) => TransportFilter(
    status: clearStatus ? null : (status ?? this.status),
    type: clearType ? null : (type ?? this.type),
    date: clearDate ? null : (date ?? this.date),
  );
}

// ---------------------------------------------------------------- actions --

class TravelDeskActions {
  const TravelDeskActions(this._ref);
  final Ref _ref;

  TravelDeskRepository get _repo => _ref.read(travelDeskRepositoryProvider);

  void _invalidate() {
    _ref.invalidate(transportRequestsProvider);
    _ref.invalidate(transportSummaryProvider);
  }

  Future<TransportRequest> create(Map<String, dynamic> body) async {
    final r = await _repo.create(body);
    _invalidate();
    return r;
  }

  Future<TransportRequest> update(String id, Map<String, dynamic> changes) async {
    final r = await _repo.update(id, changes);
    _invalidate();
    _ref.invalidate(transportRequestProvider(id));
    return r;
  }

  Future<TransportRequest> assign(
    String id, {
    required String driverStaffId,
    String? vehicleId,
  }) async {
    final r = await _repo.assign(id, driverStaffId: driverStaffId, vehicleId: vehicleId);
    _invalidate();
    _ref.invalidate(transportRequestProvider(id));
    return r;
  }

  Future<TransportRequest> setStatus(String id, TransportStatus status) async {
    final r = await _repo.setStatus(id, status);
    _invalidate();
    _ref.invalidate(transportRequestProvider(id));
    return r;
  }

  Future<void> deleteRequest(String id) async {
    await _repo.deleteRequest(id);
    _invalidate();
  }

  Future<Vehicle> createVehicle(Map<String, dynamic> body) async {
    final v = await _repo.createVehicle(body);
    _ref.invalidate(vehiclesProvider);
    return v;
  }

  Future<Vehicle> updateVehicle(String id, Map<String, dynamic> changes) async {
    final v = await _repo.updateVehicle(id, changes);
    _ref.invalidate(vehiclesProvider);
    return v;
  }

  Future<void> deleteVehicle(String id) async {
    await _repo.deleteVehicle(id);
    _ref.invalidate(vehiclesProvider);
  }
}

final travelDeskActionsProvider = Provider.autoDispose<TravelDeskActions>(
  (ref) => TravelDeskActions(ref),
);
