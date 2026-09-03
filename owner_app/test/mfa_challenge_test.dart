import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:google_fonts/google_fonts.dart';

import 'package:tavelo_owner/core/api/api_client.dart';
import 'package:tavelo_owner/core/api/token_store.dart';
import 'package:tavelo_owner/core/auth/auth_controller.dart';
import 'package:tavelo_owner/core/auth/auth_state.dart';
import 'package:tavelo_owner/core/auth/google_auth_service.dart';
import 'package:tavelo_owner/core/providers.dart';
import 'package:tavelo_owner/core/theme/app_theme.dart';
import 'package:tavelo_owner/features/auth/mfa_screen.dart';

/// A controller pinned to a fixed state; nothing here reaches the network.
class _FakeAuth extends AuthController {
  _FakeAuth(AuthState fixed)
    : super(
        api: ApiClient(_tokens),
        tokens: _tokens,
        google: GoogleAuthService(),
      ) {
    state = fixed;
  }

  static final TokenStore _tokens = TokenStore(const FlutterSecureStorage());
}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  GoogleFonts.config.allowRuntimeFetching = false;

  group('AuthState during a second-factor challenge', () {
    test('a pending challenge is neither signed in nor signed out', () {
      const s = AuthState.mfaPending('challenge-token');
      expect(s.isMfaPending, isTrue);
      // The whole point: a challenge token is NOT a session. Anything that
      // gates on isAuthenticated must stay shut until the code clears it.
      expect(s.isAuthenticated, isFalse);
      expect(s.phase, AuthPhase.mfaChallenge);
      expect(s.mfaToken, 'challenge-token');
    });

    test('signed-out and unknown states carry no challenge', () {
      expect(const AuthState.signedOut().isMfaPending, isFalse);
      expect(const AuthState.unknown().isMfaPending, isFalse);
      expect(const AuthState.signedOut().mfaToken, isNull);
    });
  });

  group('MfaScreen', () {
    Widget harness(AuthController auth) => ProviderScope(
      overrides: [authControllerProvider.overrideWith((_) => auth)],
      child: MaterialApp(theme: AppTheme.light(), home: const MfaScreen()),
    );

    testWidgets('asks for the authenticator code and offers a recovery path', (
      tester,
    ) async {
      await tester.pumpWidget(
        harness(_FakeAuth(const AuthState.mfaPending('t'))),
      );
      await tester.pumpAndSettle();
      expect(find.text('Two-step verification'), findsOneWidget);
      expect(find.text('Lost your phone? Use a recovery code'), findsOneWidget);
      expect(find.text('Verify'), findsOneWidget);

      await tester.tap(find.text('Lost your phone? Use a recovery code'));
      await tester.pumpAndSettle();
      expect(find.text('Recovery code'), findsOneWidget);
      expect(find.text('Use my authenticator app instead'), findsOneWidget);
    });

    testWidgets(
      'Back to sign in abandons the challenge — no session is left behind',
      (tester) async {
        final auth = _FakeAuth(const AuthState.mfaPending('t'));
        await tester.pumpWidget(harness(auth));
        await tester.pumpAndSettle();
        await tester.tap(find.text('Back to sign in'));
        await tester.pump();
        expect(auth.state.phase, AuthPhase.unauthenticated);
        expect(auth.state.mfaToken, isNull);
      },
    );

    testWidgets(
      'an empty submit explains what is needed instead of calling out',
      (tester) async {
        await tester.pumpWidget(
          harness(_FakeAuth(const AuthState.mfaPending('t'))),
        );
        await tester.pumpAndSettle();
        await tester.tap(find.text('Verify'));
        await tester.pump();
        expect(
          find.text('Enter the 6-digit code from your authenticator.'),
          findsOneWidget,
        );
      },
    );
  });
}
