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
      for (final actor in StaffRole.values) {
        final creatable = StaffRole.creatableRolesFor(actor);
        expect(
          creatable,
          isNot(contains(StaffRole.generalManager)),
          reason: actor.wire,
        );
        expect(
          creatable,
          isNot(contains(StaffRole.assistantGeneralManager)),
          reason: actor.wire,
        );
        expect(creatable, isNot(contains(StaffRole.unknown)), reason: actor.wire);
      }
    });

    // Mirrors `creatableRolesFor` in src/modules/staff-auth/role-creation.ts.
    // If these two ever drift, the app offers a role the API refuses.
    test('HR cannot create a GM, an AGM or another HR', () {
      final creatable = StaffRole.creatableRolesFor(StaffRole.hr);
      expect(creatable, isNot(contains(StaffRole.generalManager)));
      expect(creatable, isNot(contains(StaffRole.assistantGeneralManager)));
      expect(creatable, isNot(contains(StaffRole.hr)));
      expect(creatable, contains(StaffRole.receptionist));
      expect(
        creatable.length,
        StaffRole.creatableRolesFor(StaffRole.generalManager).length - 1,
      );
    });

    test('a GM and an AGM may create HR, and share one creatable set', () {
      final gm = StaffRole.creatableRolesFor(StaffRole.generalManager);
      expect(gm, contains(StaffRole.hr));
      expect(StaffRole.creatableRolesFor(StaffRole.assistantGeneralManager), gm);
    });

    test('every other role may create nothing at all', () {
      for (final actor in StaffRole.values) {
        if (actor == StaffRole.generalManager ||
            actor == StaffRole.assistantGeneralManager ||
            actor == StaffRole.hr) {
          continue;
        }
        expect(
          StaffRole.creatableRolesFor(actor),
          isEmpty,
          reason: actor.wire,
        );
      }
    });

    test('there are 24 real roles', () {
      expect(StaffRole.all.length, 24);
      expect(StaffRole.fromWire('HR'), StaffRole.hr);
    });

    test('HR lands on the team directory with a read-only submitted queue', () {
      final hr = RoleConfig.of(StaffRole.hr);
      expect(hr.homeRoute, Routes.team);
      final navRoutes = hr.bottomNav.map((i) => i.route);
      expect(navRoutes, contains(Routes.team));
      expect(navRoutes, contains(Routes.teamPending));
      expect(navRoutes, contains(Routes.profile));
      // Nothing in HR's map reaches the management dashboard or the approvals
      // centre — approving is not HR's to do.
      expect(hr.allowedRoutes, isNot(contains(Routes.management)));
      expect(hr.allowedRoutes, isNot(contains(Routes.approvals)));
      // Team is permission-gated on staff.read, which HR holds.
      expect(hr.requirementsFor(Routes.team), contains(P.staffRead));
    });

    test('the Add-staff screen is reachable for HR via the team route', () {
      // `/management/team/new` canonicalises to `/management/team`, so HR needs
      // no separate entry — but it must not fall outside the role's map.
      expect(
        RoleConfig.of(StaffRole.hr).allowedRoutes,
        contains(Routes.team),
      );
    });

    test('an unknown wire value degrades instead of throwing', () {
      expect(StaffRole.fromWire('SOMETHING_NEW'), StaffRole.unknown);
      expect(StaffRole.fromWire(null), StaffRole.unknown);
      expect(RoleConfig.of(StaffRole.unknown).homeRoute, isNotEmpty);
    });
  });

  group('the More menu', () {
    // The shell hides the More destination when the list is empty, so an empty
    // sheet is impossible — but a role with nothing extra to offer is a sign
    // its map was never finished. Every role gets a real More set.
    test('every role has a non-empty More list', () {
      for (final role in StaffRole.values) {
        expect(
          RoleConfig.of(role).moreMenu,
          isNotEmpty,
          reason: '${role.wire} would show a More entry with nothing in it',
        );
      }
    });

    test('every More item has a label, an icon and a routed destination', () {
      for (final role in StaffRole.values) {
        for (final item in RoleConfig.of(role).moreMenu) {
          expect(item.label.trim(), isNotEmpty, reason: role.wire);
          expect(item.route.startsWith('/'), isTrue, reason: item.label);
          expect(
            RoleConfig.of(role).allowedRoutes,
            contains(item.route),
            reason: '${role.wire} → ${item.label}',
          );
        }
      }
    });

    test('no role repeats a destination inside its own More list', () {
      for (final role in StaffRole.values) {
        final routes = RoleConfig.of(role).moreMenu.map((i) => i.route).toList();
        expect(routes.toSet().length, routes.length, reason: role.wire);
      }
    });

    test('every role reaches Settings, which reaches profile and support', () {
      for (final role in StaffRole.values) {
        final config = RoleConfig.of(role);
        final reachable = {
          ...config.bottomNav.map((i) => i.route),
          ...config.moreMenu.map((i) => i.route),
        };
        // Settings is the one nav/more destination every role now carries; it
        // is the hub that in turn links to Profile and Help & support.
        expect(
          reachable,
          contains(Routes.settings),
          reason: '${role.wire} → ${Routes.settings}',
        );
        // Settings, Profile and Help & support all stay inside the role's
        // allowed routes so the hub can always link to them.
        for (final route in [
          Routes.settings,
          Routes.profile,
          Routes.support,
        ]) {
          expect(config.allowedRoutes, contains(route), reason: role.wire);
        }
      }
    });

    test('a More item hides when its permission is missing', () {
      final gm = RoleConfig.of(StaffRole.generalManager);
      const housekeepingOnly = PermissionSet({'housekeeping.read'});
      final visible = gm.visibleMore(housekeepingOnly).map((i) => i.route);
      expect(visible, contains(Routes.housekeeping));
      expect(visible, isNot(contains(Routes.accounts)));
      // The ungated common tail (Settings) survives any permission set.
      expect(visible, contains(Routes.settings));
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
