import 'package:flutter_test/flutter_test.dart';
import 'package:tavelo_staff/core/permissions/role_config.dart';
import 'package:tavelo_staff/core/routing/routes.dart';
import 'package:tavelo_staff/features/events/data/events_models.dart';

void main() {
  group('event status', () {
    test('survives the wire', () {
      for (final s in EventStatus.values) {
        expect(EventStatus.fromWire(s.wire), s, reason: s.wire);
      }
    });

    test('unknown degrades to enquiry', () {
      expect(EventStatus.fromWire('WHATEVER'), EventStatus.enquiry);
      expect(EventStatus.fromWire('in-progress'), EventStatus.inProgress);
    });

    test('the next non-cancel move follows the pipeline', () {
      expect(EventStatus.enquiry.next, EventStatus.confirmed);
      expect(EventStatus.confirmed.next, EventStatus.inProgress);
      expect(EventStatus.inProgress.next, EventStatus.completed);
      expect(EventStatus.completed.next, isNull);
      expect(EventStatus.cancelled.next, isNull);
    });

    test('completed and cancelled are terminal', () {
      expect(EventStatus.completed.isTerminal, isTrue);
      expect(EventStatus.cancelled.isTerminal, isTrue);
      expect(EventStatus.enquiry.isTerminal, isFalse);
    });
  });

  group('event model', () {
    test('parses revenue in paise and its task checklist', () {
      final e = EventItem.fromJson({
        'id': 'e1',
        'name': 'Sharma Wedding',
        'clientName': 'Mr Sharma',
        'status': 'CONFIRMED',
        'guestCount': 300,
        'revenuePaise': 50000000,
        'roomBlock': 20,
        'tasks': [
          {'id': 't1', 'title': 'Florist', 'done': true},
          {'id': 't2', 'title': 'Catering', 'done': false},
        ],
      });
      expect(e.revenuePaise, 50000000);
      expect(e.roomBlock, 20);
      expect(e.tasks.length, 2);
      expect(e.tasks.first.done, isTrue);
    });

    test('a null room block stays null, not zero', () {
      final e = EventItem.fromJson({
        'id': 'e2',
        'name': 'Conf',
        'clientName': 'ACME',
        'status': 'ENQUIRY',
      });
      expect(e.roomBlock, isNull);
    });
  });

  test('the event manager module is built and lands on the events list', () {
    final cfg = RoleConfig.of(StaffRole.eventManager);
    expect(cfg.built, isTrue);
    expect(cfg.homeRoute, Routes.events);
    expect(cfg.allowedRoutes, contains(Routes.eventPattern));
  });
}
