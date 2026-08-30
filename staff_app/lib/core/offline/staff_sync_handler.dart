import '../networking/api_client.dart';
import 'pending_operation.dart';
import 'sync_queue.dart';

/// The reconstructed request for a queued operation: the same authenticated
/// POST the online path made, ready to replay.
typedef ReplayRequest = ({String path, Map<String, dynamic> body});

/// Pushes the mutations the field apps queue while offline.
///
/// Every queued op was originally a single authenticated POST that failed on a
/// dead network; replaying it is that same POST, reconstructed from the stored
/// operationType, entityId and payload. Registering this is what finally makes
/// the queue drain — before it, ops were persisted forever and never synced.
class StaffSyncHandler implements SyncHandler {
  StaffSyncHandler(this._api);

  final ApiClient _api;

  static const _types = {
    'housekeeping.task.start',
    'housekeeping.task.complete',
    'workorder.create',
    'security.incident',
    'gate.vehicle_in',
    'gate.vehicle_out',
    'gate.staff_in',
    'gate.staff_out',
    'gate.visitor',
    'gate.lostfound',
  };

  @override
  Set<String> get operationTypes => _types;

  @override
  Future<void> push(PendingOperation op) async {
    final req = resolve(op);
    await _api.post(req.path, body: req.body);
  }

  /// Pure request-building — no network — so the routing is unit-tested.
  static ReplayRequest resolve(PendingOperation op) {
    final type = op.operationType;
    final payload = _nonEmpty(Map<String, dynamic>.from(op.payload));

    if (type.startsWith('housekeeping.task.')) {
      final action = type.split('.').last; // start | complete
      return (
        path: '/housekeeping/tasks/${op.entityId}/$action',
        body: {if (op.payload['notes'] != null) 'notes': op.payload['notes']},
      );
    }

    switch (type) {
      case 'workorder.create':
        return (path: '/work-orders', body: payload);
      case 'security.incident':
        return (path: '/security/incidents', body: payload);
      case 'gate.visitor':
        return (path: '/security/visitors', body: payload);
      case 'gate.lostfound':
        return (path: '/security/lost-found', body: payload);
      case 'gate.vehicle_in':
      case 'gate.vehicle_out':
      case 'gate.staff_in':
      case 'gate.staff_out':
        // The movement kind is the operationType suffix uppercased — the same
        // GateMovement.wire the online path sends.
        return (
          path: '/security/gate-log',
          body: {'movement': type.split('.').last.toUpperCase(), ...payload},
        );
      default:
        throw StateError('No replay for operation type "$type"');
    }
  }

  /// Drops empty-string fields so a replay body matches what the online path
  /// (which omits empties) sends.
  static Map<String, dynamic> _nonEmpty(Map<String, dynamic> m) => {
    for (final e in m.entries)
      if (!(e.value is String && (e.value as String).isEmpty)) e.key: e.value,
  };
}
