import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:google_fonts/google_fonts.dart';

import 'package:flutter_secure_storage/flutter_secure_storage.dart';

import 'package:tavelo_owner/core/api/api_client.dart';
import 'package:tavelo_owner/core/api/token_store.dart';
import 'package:tavelo_owner/core/auth/auth_controller.dart';
import 'package:tavelo_owner/core/auth/auth_state.dart';
import 'package:tavelo_owner/core/auth/google_auth_service.dart';
import 'package:tavelo_owner/core/auth/impersonation.dart';
import 'package:tavelo_owner/core/models/owner_models.dart';
import 'package:tavelo_owner/core/providers.dart';
import 'package:tavelo_owner/core/theme/app_theme.dart';
import 'package:tavelo_owner/core/widgets/impersonation_banner.dart';

/// A controller pinned to a fixed state, so the widgets can be driven without
/// a network. The collaborators are never reached — nothing here calls out.
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

/// The framework itself plants a pass-through AbsorbPointer, so only the
/// absorbing ones say anything about our read-only wrapper.
List<AbsorbPointer> _absorbing(WidgetTester tester) => tester
    .widgetList<AbsorbPointer>(find.byType(AbsorbPointer))
    .where((a) => a.absorbing)
    .toList();

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  GoogleFonts.config.allowRuntimeFetching = false;

  final owner = OwnerProfile.fromJson(const {
    'id': 'own-1',
    'name': 'Nandini Rao',
    'company': 'Backwater Stays',
    'email': 'nandini@hotel.test',
    'status': 'ACTIVE',
  });

  const info = ImpersonationInfo(
    byAdmin: 'Riya Support',
    byAdminEmail: 'riya@tavelo.test',
    sessionId: 'imp-1',
  );

  Widget harness(AuthState state, {Widget? child}) {
    return ProviderScope(
      overrides: [
        authControllerProvider.overrideWith((ref) => _FakeAuth(state)),
      ],
      child: MaterialApp(
        theme: AppTheme.light(),
        home: Scaffold(
          body: Column(
            children: [const ImpersonationBanner(), if (child != null) child],
          ),
        ),
      ),
    );
  }

  group('ImpersonationInfo.fromJson', () {
    test('reads a live session', () {
      final parsed = ImpersonationInfo.fromJson(const {
        'active': true,
        'byAdmin': 'Riya Support',
        'byAdminEmail': 'riya@tavelo.test',
        'sessionId': 'imp-1',
        'startedAt': '2026-02-01T09:00:00.000Z',
      });
      expect(parsed, isNotNull);
      expect(parsed!.byAdmin, 'Riya Support');
      expect(parsed.sessionId, 'imp-1');
      expect(parsed.startedAt?.toUtc().hour, 9);
    });

    test('never half-flags the app on a missing or malformed block', () {
      expect(ImpersonationInfo.fromJson(null), isNull);
      expect(ImpersonationInfo.fromJson('nope'), isNull);
      expect(ImpersonationInfo.fromJson(const {'active': false}), isNull);
      // active, but with nothing identifying the session.
      expect(ImpersonationInfo.fromJson(const {'active': true}), isNull);
    });

    test('falls back to a generic name rather than showing a blank', () {
      final parsed = ImpersonationInfo.fromJson(const {
        'active': true,
        'sessionId': 'imp-1',
        'byAdmin': '   ',
      });
      expect(parsed!.byAdmin, 'Tavelo Support');
    });
  });

  group('the banner', () {
    testWidgets('is invisible for an ordinary signed-in owner', (tester) async {
      await tester.pumpWidget(
        harness(AuthState(phase: AuthPhase.authenticated, owner: owner)),
      );
      expect(find.textContaining('Tavelo Support session'), findsNothing);
      expect(find.text('End session'), findsNothing);
    });

    testWidgets('names the owner and says read-only during a session', (
      tester,
    ) async {
      await tester.pumpWidget(
        harness(
          AuthState(
            phase: AuthPhase.authenticated,
            owner: owner,
            impersonation: info,
          ),
        ),
      );
      expect(
        find.text(
          'Viewing as Nandini Rao — Tavelo Support session. Read-only.',
        ),
        findsOneWidget,
      );
      expect(find.textContaining('Riya Support'), findsOneWidget);
      expect(find.text('End session'), findsOneWidget);
    });

    testWidgets(
      'End session explains that it cannot terminate the session itself',
      (tester) async {
        await tester.pumpWidget(
          harness(
            AuthState(
              phase: AuthPhase.authenticated,
              owner: owner,
              impersonation: info,
            ),
          ),
        );
        await tester.tap(find.text('End session'));
        await tester.pumpAndSettle();
        expect(find.text('Leave this support session?'), findsOneWidget);
        expect(find.textContaining('ended by Tavelo Support'), findsOneWidget);
      },
    );
  });

  group('write controls', () {
    Widget button() =>
        FilledButton(onPressed: () {}, child: const Text('Save'));

    testWidgets('stay live for a real owner', (tester) async {
      await tester.pumpWidget(
        harness(
          AuthState(phase: AuthPhase.authenticated, owner: owner),
          child: ReadOnlyWhenImpersonating(child: button()),
        ),
      );
      expect(
        tester.widget<FilledButton>(find.byType(FilledButton)).enabled,
        isTrue,
      );
      expect(_absorbing(tester), isEmpty);
    });

    testWidgets('are visibly dead during a support session', (tester) async {
      await tester.pumpWidget(
        harness(
          AuthState(
            phase: AuthPhase.authenticated,
            owner: owner,
            impersonation: info,
          ),
          child: ReadOnlyWhenImpersonating(child: button()),
        ),
      );
      // Not just refused on submit — the control cannot be pressed at all, and
      // it is dimmed so that reads as intentional.
      expect(_absorbing(tester), hasLength(1));
      final opacity = tester.widget<Opacity>(find.byType(Opacity));
      expect(opacity.opacity, lessThan(1.0));
    });
  });
}
