import 'package:flutter_test/flutter_test.dart';
import 'package:tavelo_staff/core/offline/pending_operation.dart';
import 'package:tavelo_staff/core/offline/staff_sync_handler.dart';

PendingOperation op(
  String type, {
  String entityId = 'e1',
  Map<String, dynamic> payload = const {},
}) => PendingOperation(
  operationId: 'op1',
  entityId: entityId,
  operationType: type,
  createdAt: DateTime(2026, 1, 1),
  userId: 'u1',
  deviceId: 'd1',
  syncStatus: SyncStatus.pending,
  payload: payload,
);

void main() {
  group('StaffSyncHandler.resolve', () {
    test('replays a housekeeping action to the task verb path', () {
      final r = StaffSyncHandler.resolve(
        op(
          'housekeeping.task.complete',
          entityId: 'task-9',
          payload: {'notes': 'done'},
        ),
      );
      expect(r.path, '/housekeeping/tasks/task-9/complete');
      expect(r.body, {'notes': 'done'});
    });

    test('replays a work-order create with its payload', () {
      final r = StaffSyncHandler.resolve(
        op(
          'workorder.create',
          payload: {'title': 'Leak', 'description': 'Tap'},
        ),
      );
      expect(r.path, '/work-orders');
      expect(r.body, {'title': 'Leak', 'description': 'Tap'});
    });

    test('reconstructs the gate movement from the operation type suffix', () {
      final r = StaffSyncHandler.resolve(
        op(
          'gate.vehicle_in',
          payload: {'subject': 'KL 15 AB 1234', 'detail': ''},
        ),
      );
      expect(r.path, '/security/gate-log');
      expect(r.body['movement'], 'VEHICLE_IN');
      expect(r.body['subject'], 'KL 15 AB 1234');
      expect(r.body.containsKey('detail'), isFalse); // empty dropped
    });

    test('routes visitor, lost-found and incident to their endpoints', () {
      expect(
        StaffSyncHandler.resolve(
          op('gate.visitor', payload: {'name': 'Anu'}),
        ).path,
        '/security/visitors',
      );
      expect(
        StaffSyncHandler.resolve(
          op('gate.lostfound', payload: {'description': 'Wallet'}),
        ).path,
        '/security/lost-found',
      );
      expect(
        StaffSyncHandler.resolve(
          op('security.incident', payload: {'summary': 'x'}),
        ).path,
        '/security/incidents',
      );
    });

    test('every claimed operation type resolves without throwing', () {
      const types = {
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
      for (final t in types) {
        expect(
          () => StaffSyncHandler.resolve(
            op(
              t,
              payload: {
                'subject': 's',
                'name': 'n',
                'summary': 'x',
                'description': 'd',
              },
            ),
          ),
          returnsNormally,
        );
      }
    });
  });
}
