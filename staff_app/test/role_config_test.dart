import 'package:flutter_test/flutter_test.dart';
import 'package:tavelo_staff/core/permissions/permission_keys.dart';
import 'package:tavelo_staff/core/permissions/permission_set.dart';
import 'package:tavelo_staff/core/permissions/role_config.dart';
import 'package:tavelo_staff/core/routing/routes.dart';

void main() {
  group('PermissionSet', () {
    test('a literal key grants only itself', () {
      const set = PermissionSet({'reservation.read'});
      expect(set.has('reservation.read'), isTrue);
      expect(set.has('reservation.cancel'), isFalse);
    });

    test('a group wildcard grants the whole group', () {
      const set = PermissionSet({'reservation.*'});
      expect(set.has('reservation.cancel'), isTrue);
      expect(set.has('staff.delete'), isFalse);
    });

    test('the global wildcard grants everything', () {
      const set = PermissionSet({'*'});
      expect(set.has('anything.at.all'), isTrue);
    });

    test('hasAll of an empty list is true', () {
      expect(const PermissionSet.empty().hasAll(const []), isTrue);
    });
  });

  group('RoleConfig', () {
    test('every role resolves to a config with a home route', () {
      for (final role in StaffRole.values) {
        final config = RoleConfig.of(role);
        expect(config.homeRoute, isNotEmpty, reason: role.wire);
        expect(config.homeModuleLabel, isNotEmpty, reason: role.wire);
      }
    });

    test('a home route is always inside the role\'s allowed routes', () {
      for (final role in StaffRole.values) {
        final config = RoleConfig.of(role);
        expect(
          config.allowedRoutes,
          contains(config.homeRoute),
          reason: role.wire,
        );
      }
    });

    test('the roles named in the brief land on the right home', () {
      expect(
        RoleConfig.of(StaffRole.generalManager).homeRoute,
        Routes.management,
      );
      expect(
        RoleConfig.of(StaffRole.assistantGeneralManager).homeRoute,
        Routes.management,
      );
      expect(RoleConfig.of(StaffRole.receptionist).homeRoute, Routes.reception);
      expect(RoleConfig.of(StaffRole.roomAttendant).homeRoute, Routes.myTasks);
      expect(RoleConfig.of(StaffRole.waiter).homeRoute, Routes.myTables);
      expect(RoleConfig.of(StaffRole.chef).homeRoute, Routes.kitchen);
      expect(
        RoleConfig.of(StaffRole.securityStaff).homeRoute,
        Routes.securityGate,
      );
      expect(RoleConfig.of(StaffRole.driver).homeRoute, Routes.driver);
    });

    test('the security surface exposes nothing financial or guest-facing', () {
      final routes = RoleConfig.of(StaffRole.securityStaff).allowedRoutes;
      const forbidden = [
        Routes.management,
        Routes.approvals,
        Routes.reception,
        Routes.reservations,
        Routes.checkIn,
        Routes.accounts,
        Routes.sales,
        Routes.team,
      ];
      for (final route in forbidden) {
        expect(routes, isNot(contains(route)), reason: route);
      }
    });

    test('management cannot create a GM or an AGM', () {
      expect(
        StaffRole.creatableByManagement,
        isNot(contains(StaffRole.generalManager)),
      );
      expect(
        StaffRole.creatableByManagement,
        isNot(contains(StaffRole.assistantGeneralManager)),
      );
    });

    test('there are 23 real roles', () {
      expect(StaffRole.all.length, 23);
    });

    test('an unknown wire value degrades instead of throwing', () {
      expect(StaffRole.fromWire('SOMETHING_NEW'), StaffRole.unknown);
      expect(StaffRole.fromWire(null), StaffRole.unknown);
      expect(RoleConfig.of(StaffRole.unknown).homeRoute, isNotEmpty);
    });
  });

  group('nav visibility', () {
    test('a nav item hides when its permission is missing', () {
      final gm = RoleConfig.of(StaffRole.generalManager);
      const withoutTeam = PermissionSet({'dashboard.read'});
      final visible = gm.visibleNav(withoutTeam).map((i) => i.route);
      expect(visible, contains(Routes.management));
      expect(visible, isNot(contains(Routes.team)));
    });

    test('requirementsFor returns the keys the guard must check', () {
      final gm = RoleConfig.of(StaffRole.generalManager);
      expect(gm.requirementsFor(Routes.team), contains(P.staffRead));
      expect(gm.requirementsFor('/nowhere'), isNull);
    });
  });
}
