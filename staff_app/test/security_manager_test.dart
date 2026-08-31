import 'package:flutter_test/flutter_test.dart';
import 'package:tavelo_staff/core/permissions/role_config.dart';
import 'package:tavelo_staff/core/routing/routes.dart';
import 'package:tavelo_staff/features/security/data/security_models.dart';

/// The security manager oversight the app layers on top of the existing gate /
/// visitor / incident staff screens.
void main() {
  group('incident status', () {
    test('survives the wire and degrades safely', () {
      for (final s in IncidentStatus.values) {
        expect(IncidentStatus.fromWire(s.wire), s, reason: s.wire);
      }
      expect(IncidentStatus.fromWire(null), IncidentStatus.open);
      expect(IncidentStatus.resolved.isResolved, isTrue);
    });

    test(
      'an incident carries status, assignee and resolution when present',
      () {
        final inc = Incident.fromJson({
          'id': 'i1',
          'summary': 'Broken window',
          'severity': 'HIGH',
          'status': 'ASSIGNED',
          'assignedTo': 'guard-2',
        });
        expect(inc.status, IncidentStatus.assigned);
        expect(inc.assignedTo, 'guard-2');
        expect(inc.severity, IncidentSeverity.high);
      },
    );
  });

  group('shift status', () {
    test('survives the wire', () {
      for (final s in SecurityShiftStatus.values) {
        expect(SecurityShiftStatus.fromWire(s.wire), s, reason: s.wire);
      }
      expect(
        SecurityShiftStatus.fromWire('active'),
        SecurityShiftStatus.active,
      );
    });
  });

  group('dashboard model', () {
    test('parses the oversight counts', () {
      final d = SecurityDashboard.fromJson({
        'activeStaff': 3,
        'visitorsOnSite': 5,
        'openIncidents': 2,
        'openBySeverity': {'HIGH': 1, 'LOW': 1},
      });
      expect(d.activeStaff, 3);
      expect(d.visitorsOnSite, 5);
      expect(d.openIncidents, 2);
      expect(d.openBySeverity['HIGH'], 1);
    });
  });

  test('the security manager module is built with a roster route', () {
    final cfg = RoleConfig.of(StaffRole.securityManager);
    expect(cfg.built, isTrue);
    expect(cfg.homeRoute, Routes.securityManager);
    expect(cfg.allowedRoutes, contains(Routes.securityRoster));
  });
}
