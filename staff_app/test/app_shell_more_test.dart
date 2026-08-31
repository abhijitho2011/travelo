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
import 'package:tavelo_staff/core/widgets/tavelo_sidebar.dart';

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
    Routes.settings,
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

  testWidgets('the tablet sidebar lists every destination, with no More entry', (
    tester,
  ) async {
    await pumpShell(
      tester,
      config: gm,
      permissions: gmPermissions,
      surface: shortTablet,
    );

    // The tablet now renders the Tavelo sidebar in place of a NavigationRail,
    // and the phone-only bottom bar / More entry never appear beside it.
    expect(find.byType(TaveloSidebar), findsOneWidget);
    expect(find.byType(NavigationRail), findsNothing);
    expect(find.byType(NavigationBar), findsNothing);
    expect(find.text('More'), findsNothing);
  });

  testWidgets('sidebar destinations that live under More navigate', (
    tester,
  ) async {
    await pumpShell(
      tester,
      config: hr,
      permissions: hrPermissions,
      surface: shortTablet,
    );

    // 'Settings' is a moreMenu entry — on a tablet it is a sidebar destination
    // reachable in one tap rather than through the More sheet.
    await tester.scrollUntilVisible(find.text('Settings'), 200,
        scrollable: find.byType(Scrollable).first);
    await tester.tap(find.text('Settings'));
    await tester.pumpAndSettle();

    expect(find.text('page ${Routes.settings}'), findsOneWidget);
  });

  testWidgets('the sidebar scrolls, so a long list stays reachable', (
    tester,
  ) async {
    await pumpShell(
      tester,
      config: gm,
      permissions: gmPermissions,
      surface: shortTablet,
    );

    expect(
      find.descendant(
        of: find.byType(TaveloSidebar),
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
    expect(find.text(gm.visibleMore(gmPermissions).first.label), findsOneWidget);
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
    // Alerts is no longer a nav destination (it is the top-bar bell), and
    // Profile + Help & support now sit behind a single Settings entry.
    expect(find.text('Alerts'), findsNothing);
    expect(find.text('Settings'), findsOneWidget);
  });

  testWidgets('the sidebar reflects the active destination', (
    tester,
  ) async {
    await pumpShell(
      tester,
      config: hr,
      permissions: hrPermissions,
      surface: shortTablet,
      at: Routes.settings,
    );

    // Sitting on Settings, the sidebar computes that row as the active route.
    final sidebar = tester.widget<TaveloSidebar>(find.byType(TaveloSidebar));
    expect(sidebar.currentLocation, Routes.settings);
    expect(sidebar.isActive(Routes.settings), isTrue);
    expect(sidebar.isActive(Routes.team), isFalse);
  });
}
