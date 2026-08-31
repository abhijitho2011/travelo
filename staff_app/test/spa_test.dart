import 'package:flutter_test/flutter_test.dart';
import 'package:tavelo_staff/core/permissions/permission_keys.dart';
import 'package:tavelo_staff/core/permissions/permission_set.dart';
import 'package:tavelo_staff/core/permissions/role_config.dart';
import 'package:tavelo_staff/core/routing/routes.dart';
import 'package:tavelo_staff/features/spa/data/spa_models.dart';

/// The spa domain on the client: the wire round-trips, the moves the UI offers,
/// and — the one that matters — that an appointment carries the price it was
/// booked at, not the live service price.
void main() {
  group('enum wire round-trips', () {
    test('appointment status survives the wire', () {
      for (final s in SpaAppointmentStatus.values) {
        expect(SpaAppointmentStatus.fromWire(s.wire), s, reason: s.wire);
      }
    });

    test('bill status and payment method survive the wire', () {
      for (final s in SpaBillStatus.values) {
        expect(SpaBillStatus.fromWire(s.wire), s, reason: s.wire);
      }
      for (final m in SpaPaymentMethod.values) {
        expect(SpaPaymentMethod.fromWire(m.wire), m, reason: m.wire);
      }
    });

    test('unknown values degrade instead of throwing', () {
      expect(
        SpaAppointmentStatus.fromWire('TELEPORTED'),
        SpaAppointmentStatus.booked,
      );
      expect(SpaBillStatus.fromWire(null), SpaBillStatus.unpaid);
      expect(SpaPaymentMethod.fromWire('CHEQUE'), isNull);
      expect(
        SpaPaymentMethod.fromWire('room-charge'),
        SpaPaymentMethod.roomCharge,
      );
    });
  });

  group('appointment moves the app will offer', () {
    test(
      'a booked appointment can be started, an in-progress one completed',
      () {
        expect(SpaAppointmentStatus.booked.canStart, isTrue);
        expect(SpaAppointmentStatus.inProgress.canComplete, isTrue);
        expect(SpaAppointmentStatus.booked.canComplete, isFalse);
      },
    );

    test('completed / cancelled / no-show are terminal', () {
      expect(SpaAppointmentStatus.completed.isTerminal, isTrue);
      expect(SpaAppointmentStatus.cancelled.isTerminal, isTrue);
      expect(SpaAppointmentStatus.noShow.isTerminal, isTrue);
      expect(SpaAppointmentStatus.booked.isTerminal, isFalse);
    });
  });

  group('price snapshot', () {
    test(
      'an appointment reads the snapshotted price, whatever key the server used',
      () {
        final a = SpaAppointment.fromJson({
          'id': 'a1',
          'guestName': 'Asha',
          'serviceNameSnapshot': 'Deep Tissue',
          'pricePaiseSnapshot': 30000,
          'status': 'BOOKED',
        });
        expect(a.pricePaise, 30000);
        expect(a.serviceName, 'Deep Tissue');
        expect(a.priceLabel, contains('300'));
      },
    );

    test('a service carries its live price and duration', () {
      final s = SpaService.fromJson({
        'id': 's1',
        'name': 'Facial',
        'durationMinutes': 45,
        'pricePaise': 150000,
        'status': 'ACTIVE',
      });
      expect(s.durationMinutes, 45);
      expect(s.pricePaise, 150000);
      expect(s.status, SpaServiceStatus.active);
    });
  });

  group('role config', () {
    PermissionSet perms(List<String> keys) => PermissionSet({...keys});

    test('all three spa roles are built', () {
      expect(RoleConfig.of(StaffRole.spaManager).built, isTrue);
      expect(RoleConfig.of(StaffRole.spaAccounts).built, isTrue);
      expect(RoleConfig.of(StaffRole.spaStaff).built, isTrue);
    });

    test('the manager reaches the dashboard, appointments and services', () {
      final cfg = RoleConfig.of(StaffRole.spaManager);
      final nav = cfg
          .visibleNav(perms([P.spaRead, P.spaBookingRead, P.spaServiceRead]))
          .map((n) => n.route)
          .toList();
      expect(nav, contains(Routes.spa));
      expect(nav, contains(Routes.spaAppointments));
      expect(nav, contains(Routes.spaServices));
    });

    test('the therapist lands on My Appointments', () {
      expect(
        RoleConfig.of(StaffRole.spaStaff).homeRoute,
        Routes.spaAppointments,
      );
    });
  });
}
