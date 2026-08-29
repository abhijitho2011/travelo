import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:tavelo_staff/core/notifications/notifications_controller.dart';
import 'package:tavelo_staff/core/offline/offline_providers.dart';
import 'package:tavelo_staff/core/permissions/permission_set.dart';
import 'package:tavelo_staff/core/permissions/role_config.dart';
import 'package:tavelo_staff/core/providers.dart';
import 'package:tavelo_staff/core/routing/routes.dart';
import 'package:tavelo_staff/core/theme/app_theme.dart';
import 'package:tavelo_staff/core/widgets/app_shell.dart';

/// The shell's navigation, on both form factors.
///
/// The tablet rail and the phone bottom bar are built from ONE destination
/// list, so "More" cannot exist on one and be missing from the other. These
/// tests pin that down, because a dropped More entry strands every module that
/// is not a primary tab.
void main() {
  setUpAll(() {
    GoogleFonts.config.allowRuntimeFetching = false;
    SharedPreferences.setMockInitialValues(<String, Object>{});
  });

  /// Every destination any tested role can reach, served by a bare page. The
  /// shell only needs the routes to exist — what they render is irrelevant.
  final routes = <String>{
    Routes.management,
    Routes.approvals,
    Routes.team,
    Routes.teamPending,
    Routes.reception,
    Routes.reservations,
    Routes.housekeeping,
    Routes.maintenance,
    Routes.restaurant,
    Routes.inventory,
    Routes.accounts,
    Routes.spa,
    Routes.events,
    Routes.securityManager,
    Routes.profile,
    Routes.notifications,
    Routes.support,
  };

  Future<void> pumpShell(
    WidgetTester tester, {
    required RoleConfig config,
    required PermissionSet permissions,
    required Size surface,
    String? at,
  }) async {
    tester.view.physicalSize = surface;
    tester.view.devicePixelRatio = 1.0;
    addTearDown(tester.view.reset);

    final router = GoRouter(
      initialLocation: at ?? config.homeRoute,
      routes: [
        ShellRoute(
          builder: (_, _, child) => AppShell(child: child),
          routes: [
            for (final path in routes)
              GoRoute(
                path: path,
                builder: (_, _) => Center(child: Text('page $path')),
              ),
          ],
        ),
      ],
    );
    addTearDown(router.dispose);

    await tester.pumpWidget(
      ProviderScope(
        overrides: [
          roleConfigProvider.overrideWithValue(config),
          permissionsProvider.overrideWithValue(permissions),
          sessionProvider.overrideWithValue(null),
          unreadNotificationCountProvider.overrideWithValue(0),
          pendingSyncCountProvider.overrideWithValue(0),
          isOnlineProvider.overrideWith((_) => Stream.value(true)),
        ],
        child: MaterialApp.router(
          theme: AppTheme.light(),
          routerConfig: router,
        ),
      ),
    );
    await tester.pumpAndSettle();
  }

  // A wide, SHORT tablet — the shape that makes a non-scrolling rail drop its
  // last destination, which is exactly where More lives.
  const shortTablet = Size(1280, 620);
  const phone = Size(400, 800);

  final gm = RoleConfig.of(StaffRole.generalManager);
  final hr = RoleConfig.of(StaffRole.hr);
  const gmPermissions = PermissionSet({
    'dashboard.read',
    'approval.read',
    'staff.read',
    'reservation.read',
    'housekeeping.read',
    'maintenance.read',
    'restaurant.read',
    'inventory.read',
    'finance.read',
    'spa.read',
    'event.read',
    'incident.read',
  });
  const hrPermissions = PermissionSet({'staff.read'});

  testWidgets('the tablet rail lists every destination, with no More entry', (
    tester,
  ) async {
    await pumpShell(
      tester,
      config: gm,
      permissions: gmPermissions,
      surface: shortTablet,
    );

    expect(find.byType(NavigationRail), findsOneWidget);
    expect(find.byType(NavigationBar), findsNothing);
    // The rail has room for everything, so More is never rendered on a tablet.
    expect(find.text('More'), findsNothing);
  });

  testWidgets('rail destinations that used to live under More navigate', (
    tester,
  ) async {
    await pumpShell(
      tester,
      config: hr,
      permissions: hrPermissions,
      surface: shortTablet,
    );

    // 'Help & support' is a moreMenu entry — on a tablet it is a rail
    // destination reachable in one tap rather than two.
    await tester.scrollUntilVisible(find.text('Help & support'), 200,
        scrollable: find.byType(Scrollable).first);
    await tester.tap(find.text('Help & support'));
    await tester.pumpAndSettle();

    expect(find.text('page ${Routes.support}'), findsOneWidget);
  });

  testWidgets('the rail scrolls, so a long list stays reachable', (
    tester,
  ) async {
    await pumpShell(
      tester,
      config: gm,
      permissions: gmPermissions,
      surface: shortTablet,
    );

    expect(
      find.ancestor(
        of: find.byType(NavigationRail),
        matching: find.byType(SingleChildScrollView),
      ),
      findsOneWidget,
    );
  });

  testWidgets('the phone bottom bar carries the same More entry', (
    tester,
  ) async {
    await pumpShell(
      tester,
      config: gm,
      permissions: gmPermissions,
      surface: phone,
    );

    expect(find.byType(NavigationBar), findsOneWidget);
    expect(find.byType(NavigationRail), findsNothing);

    await tester.tap(find.text('More'));
    await tester.pumpAndSettle();
    expect(find.text(gm.moreMenu.first.label), findsOneWidget);
  });

  testWidgets('HR gets Team, Submitted, Profile and a More sheet on a phone', (
    tester,
  ) async {
    await pumpShell(
      tester,
      config: hr,
      permissions: hrPermissions,
      surface: phone,
    );

    expect(find.text('Team'), findsWidgets);
    expect(find.text('Submitted'), findsWidgets);
    expect(find.text('More'), findsOneWidget);

    await tester.tap(find.text('More'));
    await tester.pumpAndSettle();
    expect(find.text('Alerts'), findsOneWidget);
    expect(find.text('Help & support'), findsOneWidget);
  });

  testWidgets('sitting on a More destination lights More, not the first tab', (
    tester,
  ) async {
    await pumpShell(
      tester,
      config: hr,
      permissions: hrPermissions,
      surface: shortTablet,
      at: Routes.support,
    );

    final rail = tester.widget<NavigationRail>(find.byType(NavigationRail));
    expect(rail.selectedIndex, rail.destinations.length - 1);
  });
}
