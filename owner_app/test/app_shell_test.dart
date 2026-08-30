import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'package:tavelo_owner/core/theme/app_colors.dart';
import 'package:tavelo_owner/core/widgets/app_shell.dart';
import 'package:tavelo_owner/core/widgets/tavelo_sidebar.dart';
import 'package:tavelo_owner/core/widgets/primitives.dart';

/// The shell is the one piece of chrome every signed-in screen depends on, and
/// its two layouts are the point of the redesign: a rail with every destination
/// on a tablet, a four-tab bar plus More on a phone.
void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  GoogleFonts.config.allowRuntimeFetching = false;
  SharedPreferences.setMockInitialValues({});

  Widget harness() {
    final router = GoRouter(
      initialLocation: '/',
      routes: [
        ShellRoute(
          builder: (_, _, child) => AppShell(child: child),
          routes: [
            for (final path in const [
              '/',
              '/properties',
              '/staff',
              '/support',
              '/subscription',
              '/security',
              '/profile',
            ])
              GoRoute(
                path: path,
                builder: (_, _) => PageBody(children: [Text('screen $path')]),
              ),
          ],
        ),
      ],
    );
    return ProviderScope(
      child: MaterialApp.router(
        // The palette is supplied directly so the shell resolves `context.colors`
        // without building the full theme, which would pull fonts over a network
        // that does not exist under test.
        theme: ThemeData(extensions: const [AppColors.light]),
        routerConfig: router,
      ),
    );
  }

  /// google_fonts reports a missing font as an unhandled async error; the
  /// widgets under test still lay out correctly, so it is absorbed here.
  Future<void> pumpShell(WidgetTester tester, Size size) async {
    tester.view.physicalSize = size;
    tester.view.devicePixelRatio = 1.0;
    addTearDown(tester.view.reset);
    await runZonedGuarded(() async {
      await tester.pumpWidget(harness());
      await tester.pumpAndSettle();
    }, (_, _) {});
  }

  testWidgets('a phone gets a bottom bar of four tabs plus More', (
    tester,
  ) async {
    await pumpShell(tester, const Size(390, 844));

    expect(find.byType(NavigationBar), findsOneWidget);
    expect(find.byType(NavigationRail), findsNothing);

    final bar = tester.widget<NavigationBar>(find.byType(NavigationBar));
    expect(bar.destinations.length, 5);
    expect(bar.selectedIndex, 0);
    // Everything the bar cannot hold is reachable through More, not dropped.
    expect(find.text('More'), findsOneWidget);
    expect(find.text('Subscription'), findsNothing);
  });

  testWidgets('a tablet gets the sidebar carrying every destination directly', (
    tester,
  ) async {
    await pumpShell(tester, const Size(1024, 768));

    // The design's light left sidebar replaces the Material rail on a tablet.
    expect(find.byType(TaveloSidebar), findsOneWidget);
    expect(find.byType(NavigationBar), findsNothing);

    // Every destination is listed directly — no More to tap through.
    expect(find.text('More'), findsNothing);
    expect(find.text('Subscription'), findsOneWidget);
    expect(find.text('Dashboard'), findsOneWidget);
    expect(find.text('Profile'), findsOneWidget);
  });

  testWidgets('the top bar carries sign-out and profile, and no bell', (
    tester,
  ) async {
    await pumpShell(tester, const Size(390, 844));

    expect(find.byTooltip('Sign out'), findsOneWidget);
    expect(find.byTooltip('Profile'), findsOneWidget);
    // The owner portal has no notification feed, so there is nothing to ring.
    expect(find.byIcon(Icons.notifications_none), findsNothing);
  });

  testWidgets('signing out asks first', (tester) async {
    await pumpShell(tester, const Size(390, 844));

    await runZonedGuarded(() async {
      await tester.tap(find.byTooltip('Sign out'));
      await tester.pumpAndSettle();
    }, (_, _) {});

    expect(find.text('Sign out?'), findsOneWidget);
    expect(find.text('Cancel'), findsOneWidget);
  });
}
