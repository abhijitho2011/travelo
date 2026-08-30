import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/networking/api_client.dart';
import '../../../core/networking/api_exception.dart';
import '../../../core/providers.dart';
import 'security_models.dart';

/// Gate, visitor, lost-and-found and incident data.
///
/// Note what is absent: there is no method here that can fetch a folio, a
/// rate, revenue or an owner record. The security surface cannot reach that
/// data even if a screen asked for it.
class SecurityRepository {
  SecurityRepository(this._api);

  final ApiClient _api;

  Future<List<GateLogEntry>> gateLog({bool vehiclesOnly = false}) =>
      _read('/security/gate-log', GateLogEntry.fromJson, query: {
        if (vehiclesOnly) 'kind': 'vehicle',
      });

  Future<void> recordMovement({
    required GateMovement movement,
    required String subject,
    String? detail,
  }) => _api.post(
    '/security/gate-log',
    body: {
      'movement': movement.wire,
      'subject': subject,
      if (detail != null && detail.isNotEmpty) 'detail': detail,
    },
  );

  Future<List<Visitor>> visitors() =>
      _read('/security/visitors', Visitor.fromJson);

  Future<void> recordVisitor({
    required String name,
    String? visiting,
    String? purpose,
    String? passNumber,
  }) => _api.post(
    '/security/visitors',
    body: {
      'name': name,
      if (visiting != null && visiting.isNotEmpty) 'visiting': visiting,
      if (purpose != null && purpose.isNotEmpty) 'purpose': purpose,
      if (passNumber != null && passNumber.isNotEmpty) 'passNumber': passNumber,
    },
  );

  Future<void> checkOutVisitor(String id) =>
      _api.post('/security/visitors/$id/depart');

  Future<List<LostFoundItem>> lostAndFound() =>
      _read('/security/lost-found', LostFoundItem.fromJson);

  /// Move a held item to CLAIMED or DISPOSED (or back to STORED).
  Future<void> updateLostFound(String id, String status) =>
      _api.patch('/security/lost-found/\$id', body: {'status': status});

  Future<void> logFoundItem({
    required String description,
    String? location,
  }) => _api.post(
    '/security/lost-found',
    body: {
      'description': description,
      if (location != null && location.isNotEmpty) 'location': location,
    },
  );

  Future<List<Incident>> incidents() =>
      _read('/security/incidents', Incident.fromJson);

  Future<void> reportIncident({
    required String summary,
    required IncidentSeverity severity,
    String? location,
  }) => _api.post(
    '/security/incidents',
    body: {
      'summary': summary,
      'severity': severity.wire,
      if (location != null && location.isNotEmpty) 'location': location,
    },
  );

  // ---- Manager oversight (assign / resolve, roster, dashboard) ----

  Future<void> assignIncident(String id, String staffId) =>
      _api.post('/security/incidents/$id/assign', body: {'staffId': staffId});

  Future<void> resolveIncident(String id, String resolution) =>
      _api.post('/security/incidents/$id/resolve', body: {'resolution': resolution});

  Future<SecurityDashboard?> dashboard() async {
    try {
      final data = await _api.get('/security/dashboard');
      return data is Map ? SecurityDashboard.fromJson(data) : null;
    } on ApiException catch (e) {
      if (e.isMissingEndpoint || e.code == ApiErrorCodes.forbidden) return null;
      rethrow;
    }
  }

  Future<List<SecurityShift>> shifts() =>
      _read('/security/shifts', SecurityShift.fromJson);

  Future<List<RosterMember>> roster() =>
      _read('/security/roster', RosterMember.fromJson);

  Future<void> createShift({
    required String staffId,
    required String area,
    required DateTime startAt,
  }) => _api.post('/security/shifts', body: {
        'staffId': staffId,
        'area': area,
        'startAt': startAt.toUtc().toIso8601String(),
      });

  Future<void> setShiftStatus(String id, SecurityShiftStatus status) =>
      _api.patch('/security/shifts/$id', body: {'status': status.wire});

  Future<List<T>> _read<T>(
    String path,
    T Function(Map) parse, {
    Map<String, dynamic>? query,
  }) async {
    try {
      final data = await _api.get(path, query: query);
      if (data is List) return data.whereType<Map>().map(parse).toList();
      if (data is Map && data['items'] is List) {
        return (data['items'] as List).whereType<Map>().map(parse).toList();
      }
      return <T>[];
    } on ApiException catch (e) {
      // A 403 here means the role holds the write permission but not the read
      // one (security staff can create an incident, not browse them). Treat it
      // the same as "nothing to show" — the screen explains why.
      if (e.isMissingEndpoint || e.code == ApiErrorCodes.forbidden) {
        return <T>[];
      }
      rethrow;
    }
  }
}

final securityRepositoryProvider = Provider<SecurityRepository>(
  (ref) => SecurityRepository(ref.watch(apiClientProvider)),
);

final gateLogProvider = FutureProvider.autoDispose
    .family<List<GateLogEntry>, bool>(
      (ref, vehiclesOnly) => ref
          .watch(securityRepositoryProvider)
          .gateLog(vehiclesOnly: vehiclesOnly),
    );

final visitorsProvider = FutureProvider.autoDispose<List<Visitor>>(
  (ref) => ref.watch(securityRepositoryProvider).visitors(),
);

final lostFoundProvider = FutureProvider.autoDispose<List<LostFoundItem>>(
  (ref) => ref.watch(securityRepositoryProvider).lostAndFound(),
);

final incidentsProvider = FutureProvider.autoDispose<List<Incident>>(
  (ref) => ref.watch(securityRepositoryProvider).incidents(),
);

final securityDashboardProvider = FutureProvider.autoDispose<SecurityDashboard?>(
  (ref) => ref.watch(securityRepositoryProvider).dashboard(),
);

final securityShiftsProvider = FutureProvider.autoDispose<List<SecurityShift>>(
  (ref) => ref.watch(securityRepositoryProvider).shifts(),
);

final securityRosterProvider = FutureProvider.autoDispose<List<RosterMember>>(
  (ref) => ref.watch(securityRepositoryProvider).roster(),
);
