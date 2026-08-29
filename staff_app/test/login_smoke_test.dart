import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:tavelo_staff/core/theme/app_theme.dart';
import 'package:tavelo_staff/features/auth/presentation/login_screen.dart';

/// A rendering smoke test: proves the theme, typography and the sign-in screen
/// build without throwing, in both light and dark. The analyzer cannot catch a
/// layout or const-construction failure — this does.
void main() {
  setUpAll(() {
    // Never reach for the network in a test; the bundled fallback face is used.
    GoogleFonts.config.allowRuntimeFetching = false;
  });

  Future<void> pumpLogin(WidgetTester tester, ThemeData theme) async {
    await tester.pumpWidget(
      ProviderScope(
        child: MaterialApp(theme: theme, home: const LoginScreen()),
      ),
    );
    await tester.pump();
  }

  testWidgets('login screen renders in light theme', (tester) async {
    await pumpLogin(tester, AppTheme.light());

    expect(find.text('Sign in'), findsOneWidget);
    expect(find.text('Send OTP'), findsOneWidget);
    expect(find.text('Continue with Google'), findsOneWidget);
    expect(find.byType(TextFormField), findsOneWidget);
  });

  testWidgets('login screen renders in dark theme', (tester) async {
    await pumpLogin(tester, AppTheme.dark());
    expect(find.text('Sign in'), findsOneWidget);
  });

  testWidgets('the mobile field rejects a short number', (tester) async {
    await pumpLogin(tester, AppTheme.light());

    await tester.enterText(find.byType(TextFormField), '9876');
    await tester.tap(find.text('Send OTP'));
    await tester.pump();

    expect(find.text('Enter the 10-digit number'), findsOneWidget);
  });

  testWidgets('the mobile field rejects a non-Indian prefix', (tester) async {
    await pumpLogin(tester, AppTheme.light());

    await tester.enterText(find.byType(TextFormField), '1234567890');
    await tester.tap(find.text('Send OTP'));
    await tester.pump();

    expect(
      find.text('That does not look like an Indian mobile number'),
      findsOneWidget,
    );
  });
}
