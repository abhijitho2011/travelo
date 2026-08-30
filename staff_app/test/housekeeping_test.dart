import 'package:flutter_test/flutter_test.dart';
import 'package:tavelo_staff/core/permissions/role_config.dart';
import 'package:tavelo_staff/core/routing/guards.dart';
import 'package:tavelo_staff/core/routing/routes.dart';
import 'package:tavelo_staff/features/housekeeping/data/board_models.dart';
import 'package:tavelo_staff/features/housekeeping/data/task_models.dart';
import 'package:tavelo_staff/features/maintenance/data/work_order_models.dart';

/// Housekeeping + maintenance: what the wire says, what the attendant/
/// technician can do next, and how the two new roles are wired.
void main() {
  group('HkTaskStatus', () {
    test('parses however the server spelt it, unknown falls back to pending', () {
      expect(HkTaskStatus.fromWire('IN_PROGRESS'), HkTaskStatus.inProgress);
      expect(HkTaskStatus.fromWire('rejected'), HkTaskStatus.rejected);
      expect(HkTaskStatus.fromWire('???'), HkTaskStatus.pending);
      expect(HkTaskStatus.fromWire(null), HkTaskStatus.pending);
    });

    test('the attendant only ever drives start then complete', () {
      expect(HkTaskStatus.pending.attendantAction, 'start');
      expect(HkTaskStatus.pending.attendantNext, HkTaskStatus.inProgress);
      expect(HkTaskStatus.inProgress.attendantAction, 'complete');
      expect(HkTaskStatus.inProgress.attendantNext, HkTaskStatus.completed);
      // Awaiting inspection / terminal: nothing left for the attendant.
      expect(HkTaskStatus.completed.attendantAction, isNull);
      expect(HkTaskStatus.inspected.attendantAction, isNull);
      expect(HkTaskStatus.rejected.attendantAction, isNull);
    });

    test('inspected and rejected are terminal', () {
      expect(HkTaskStatus.inspected.isTerminal, isTrue);
      expect(HkTaskStatus.rejected.isTerminal, isTrue);
      expect(HkTaskStatus.pending.isTerminal, isFalse);
    });
  });

  group('StaffTask.fromJson', () {
    test('reads a room task and prefers the room number as the headline', () {
      final t = StaffTask.fromJson({
        'id': 't1',
        'type': 'CHECKOUT_CLEAN',
        'status': 'PENDING',
        'priority': 'HIGH',
        'roomNumber': '304',
        'roomFloor': '3',
        'guestRequest': 'extra towels',
      });
      expect(t.headline, '304');
      expect(t.typeLabel, 'Checkout clean');
      expect(t.priority, HkPriority.high);
      expect(t.floor, '3');
      expect(t.guestRequest, 'extra towels');
    });

    test('falls back to the area name for a non-room task', () {
      final t = StaffTask.fromJson({
        'id': 't2',
        'type': 'AREA_CLEAN',
        'status': 'IN_PROGRESS',
        'area': 'Lobby',
      });
      expect(t.headline, 'Lobby');
      expect(t.roomNumber, isNull);
    });
  });

  group('WoStatus', () {
    test('offers the right technician actions for each state', () {
      WorkOrder wo(WoStatus s) => WorkOrder(
        id: 'w',
        number: 'WO-00001',
        title: 't',
        status: s,
        priority: WoPriority.normal,
      );
      expect(wo(WoStatus.open).actions, [WoAction.accept]);
      expect(wo(WoStatus.accepted).actions, [WoAction.start]);
      expect(wo(WoStatus.inProgress).actions, [WoAction.pause, WoAction.complete]);
      expect(wo(WoStatus.paused).actions, [WoAction.resume]);
      expect(wo(WoStatus.completed).actions, isEmpty);
      expect(wo(WoStatus.cancelled).actions, isEmpty);
    });

    test('completed and cancelled are terminal', () {
      expect(WoStatus.completed.isTerminal, isTrue);
      expect(WoStatus.cancelled.isTerminal, isTrue);
      expect(WoStatus.open.isTerminal, isFalse);
    });
  });

  group('WorkOrder.fromJson', () {
    test('parses number, room, priority and parts', () {
      final wo = WorkOrder.fromJson({
        'id': 'w1',
        'workOrderNumber': 'WO-00007',
        'title': 'AC not cooling',
        'status': 'IN_PROGRESS',
        'priority': 'CRITICAL',
        'roomNumber': '204',
        'takesRoomOutOfService': true,
        'partsUsed': [
          {'name': 'compressor', 'qty': 1},
        ],
      });
      expect(wo.number, 'WO-00007');
      expect(wo.priority, WoPriority.critical);
      expect(wo.headline, 'Room 204');
      expect(wo.takesRoomOutOfService, isTrue);
      expect(wo.partsUsed.single.name, 'compressor');
      expect(wo.partsUsed.single.qty, 1);
    });
  });

  group('HousekeepingBoard.fromJson', () {
    test('groups rooms by status and orders the loop first', () {
      final b = HousekeepingBoard.fromJson({
        'totalRooms': 2,
        'counts': {'DIRTY': 1, 'READY': 1},
        'groups': {
          'READY': [
            {'id': 'r2', 'number': '102', 'status': 'READY'},
          ],
          'DIRTY': [
            {
              'id': 'r1',
              'number': '101',
              'status': 'DIRTY',
              'task': {'id': 't1', 'type': 'CHECKOUT_CLEAN', 'status': 'PENDING'},
            },
          ],
        },
        'areaTasks': [
          {'id': 'a1', 'type': 'AREA_CLEAN', 'status': 'PENDING', 'area': 'Lobby'},
        ],
      });
      expect(b.totalRooms, 2);
      // DIRTY comes before READY in the housekeeping loop order.
      expect(b.orderedStatuses.first, 'DIRTY');
      expect(b.groups['DIRTY']!.single.task?.type, 'CHECKOUT_CLEAN');
      expect(b.areaTasks.single.area, 'Lobby');
    });
  });

  group('new role wiring', () {
    test('the housekeeping supervisor lands on the room board', () {
      expect(
        RoleConfig.of(StaffRole.housekeepingSupervisor).homeRoute,
        Routes.housekeeping,
      );
      expect(RoleConfig.of(StaffRole.housekeepingSupervisor).built, isTrue);
    });

    test('the technician lands on their work orders', () {
      expect(RoleConfig.of(StaffRole.technician).homeRoute, Routes.myWorkOrders);
      expect(RoleConfig.of(StaffRole.technician).built, isTrue);
    });

    test('a work-order detail canonicalises to the work-orders queue', () {
      expect(
        GuardContext.canonicalise('/work-orders/abc-123'),
        Routes.workOrders,
      );
    });
  });
}
