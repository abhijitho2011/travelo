import 'package:flutter_test/flutter_test.dart';
import 'package:tavelo_staff/core/notifications/notification_model.dart';

void main() {
  group('StaffNotification.fromJson — server contract', () {
    test('reads readAt (not read) so a delivered notification is not unread forever', () {
      final unread = StaffNotification.fromJson({
        'id': 'n1',
        'title': 'Account approved',
        'body': 'Welcome',
        'type': 'staff.approved',
        'createdAt': '2026-08-30T10:00:00Z',
        'readAt': null,
      });
      expect(unread.read, isFalse);

      final read = StaffNotification.fromJson({
        'id': 'n2',
        'type': 'staff.approved',
        'readAt': '2026-08-30T11:00:00Z',
      });
      expect(read.read, isTrue);
    });

    test('maps the dotted server type to a coarse kind', () {
      expect(
        StaffNotification.fromJson({'id': 'a', 'type': 'staff.pending_approval'}).kind,
        NotificationKind.approval,
      );
      expect(
        StaffNotification.fromJson({'id': 'b', 'type': 'work_order.assigned'}).kind,
        NotificationKind.maintenance,
      );
      expect(
        StaffNotification.fromJson({'id': 'c', 'type': 'housekeeping.task'}).kind,
        NotificationKind.task,
      );
      expect(
        StaffNotification.fromJson({'id': 'd', 'type': 'something.unknown'}).kind,
        NotificationKind.system,
      );
    });

    test('pulls a route from meta when present', () {
      final n = StaffNotification.fromJson({
        'id': 'n3',
        'type': 'reservation.created',
        'meta': {'route': '/reservations/abc'},
      });
      expect(n.route, '/reservations/abc');
    });
  });
}
