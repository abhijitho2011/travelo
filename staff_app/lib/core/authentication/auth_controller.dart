import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../config/app_config.dart';
import '../networking/api_client.dart';
import '../networking/api_exception.dart';
import '../storage/local_store.dart';
import '../storage/token_store.dart';
import 'auth_state.dart';
import 'google_auth_service.dart';
import 'session.dart';

/// Owns the entire authentication lifecycle: OTP request/verify, Google
/// sign-in, session bootstrap, refresh failure and sign-out.
///
/// Screens never call the auth endpoints directly — they drive this controller
/// and render [AuthState].
class AuthController extends StateNotifier<AuthState> {
  AuthController({
    required ApiClient api,
    required TokenStore tokens,
    required GoogleAuthService google,
    required LocalStore store,
  }) : _api = api,
       _tokens = tokens,
       _google = google,
       _store = store,
       super(const AuthState());

  final ApiClient _api;
  final TokenStore _tokens;
  final GoogleAuthService _google;
  final LocalStore _store;

  /// Decide, once at launch, whether we already hold a usable session.
  Future<void> bootstrap() async {
    if (!await _tokens.hasSession()) {
      state = state.copyWith(status: AuthStatus.signedOut);
      return;
    }
    try {
      final session = await _fetchMe();
      state = state.copyWith(
        status: session.user.status.canUseApp
            ? AuthStatus.authenticated
            : AuthStatus.accountBlocked,
        session: session,
        clearError: true,
      );
    } on ApiException catch (e) {
      if (e.isNetwork) {
        // Offline at launch with a stored token: stay signed out rather than
        // guessing at a role. The user retries from the login screen.
        state = state.copyWith(status: AuthStatus.signedOut, error: e);
        return;
      }
      await _tokens.clear();
      state = state.copyWith(status: AuthStatus.signedOut, error: e);
    }
  }

  // ---------------------------------------------------------------- OTP ---

  /// `POST /auth/otp/request`. The response is deliberately generic — it never
  /// discloses whether the number belongs to an account.
  Future<void> requestOtp(String mobile) async {
    state = state.copyWith(busy: true, clearError: true);
    try {
      final data = await _api.post(
        '/auth/otp/request',
        body: {'mobile': mobile},
      );
      final expiresAt = _parseDate(
        data is Map ? data['expiresAt'] : null,
      ) ?? DateTime.now().add(
        const Duration(seconds: AppConfig.otpValiditySeconds),
      );
      state = state.copyWith(
        status: AuthStatus.otpPending,
        mobile: mobile,
        otpExpiresAt: expiresAt,
        resendAvailableAt: DateTime.now().add(
          const Duration(seconds: AppConfig.otpResendCooldownSeconds),
        ),
        busy: false,
        clearError: true,
      );
    } on ApiException catch (e) {
      state = state.copyWith(busy: false, error: e);
    }
  }

  /// `POST /auth/otp/verify`.
  Future<void> verifyOtp(String otp) async {
    final mobile = state.mobile;
    if (mobile == null) return;
    state = state.copyWith(busy: true, clearError: true);
    try {
      final data = await _api.post(
        '/auth/otp/verify',
        body: {'mobile': mobile, 'otp': otp},
      );
      await _persistTokens(data);
      await _completeSignIn();
    } on ApiException catch (e) {
      _handleSignInFailure(e);
    }
  }

  // ------------------------------------------------------------- Google ---

  Future<void> signInWithGoogle() async {
    state = state.copyWith(busy: true, clearError: true);
    try {
      final idToken = await _google.signInAndGetIdToken();
      final data = await _api.post('/auth/google', body: {'idToken': idToken});
      await _persistTokens(data);
      await _completeSignIn();
    } on ApiException catch (e) {
      if (e.code == ApiErrorCodes.cancelled) {
        state = state.copyWith(busy: false, clearError: true);
        return;
      }
      _handleSignInFailure(e);
    }
  }

  // -------------------------------------------------------------- misc ----

  /// Called by [ApiClient] when a refresh fails mid-session.
  void onSessionExpired() {
    if (state.status == AuthStatus.sessionExpired) return;
    state = const AuthState(status: AuthStatus.sessionExpired);
  }

  Future<void> signOut() async {
    try {
      await _api.post('/auth/logout');
    } catch (_) {
      // Best effort — the local session is dropped either way.
    }
    await _google.signOut();
    await _tokens.clear();
    await _store.onSignOut();
    state = const AuthState(status: AuthStatus.signedOut);
  }

  /// Return to the login screen from OTP / status / expired screens.
  void reset() {
    state = AuthState(status: AuthStatus.signedOut, mobile: state.mobile);
  }

  /// Clears the inline failure as soon as the user edits the field again.
  void clearError() {
    if (state.error == null) return;
    state = state.copyWith(clearError: true);
  }

  void changeNumber() {
    state = const AuthState(status: AuthStatus.signedOut);
  }

  Future<void> dismissFirstLogin() async {
    if (!state.isFirstLogin) return;
    final userId = state.session?.user.id;
    if (userId != null) await _store.markWelcomeSeen(userId);
    state = state.copyWith(isFirstLogin: false);
  }

  /// Re-fetch `/auth/me` — used after the account status may have changed
  /// (e.g. the GM has just approved the user) and by pull-to-refresh.
  Future<void> refreshSession() async {
    try {
      final session = await _fetchMe();
      state = state.copyWith(
        status: session.user.status.canUseApp
            ? AuthStatus.authenticated
            : AuthStatus.accountBlocked,
        session: session,
        clearError: true,
      );
    } on ApiException catch (e) {
      state = state.copyWith(error: e);
    }
  }

  // ----------------------------------------------------------- internals --

  Future<void> _completeSignIn() async {
    try {
      final session = await _fetchMe();
      if (!session.user.status.canUseApp) {
        state = state.copyWith(
          status: AuthStatus.accountBlocked,
          session: session,
          busy: false,
          error: ApiException(
            code: _statusCodeFor(session.user.status),
            message: session.user.status.label,
          ),
        );
        return;
      }
      // The welcome card is shown once per user per device — a genuinely new
      // joiner sees it, a returning user does not.
      final firstLogin = !await _store.hasSeenWelcome(session.user.id);
      state = state.copyWith(
        status: AuthStatus.authenticated,
        session: session,
        busy: false,
        isFirstLogin: firstLogin,
        clearError: true,
      );
    } on ApiException catch (e) {
      _handleSignInFailure(e);
    }
  }

  String _statusCodeFor(AccountStatus s) => switch (s) {
    AccountStatus.pendingApproval => ApiErrorCodes.accountPendingApproval,
    AccountStatus.invited => ApiErrorCodes.accountInvited,
    AccountStatus.blocked => ApiErrorCodes.accountBlocked,
    AccountStatus.suspended => ApiErrorCodes.accountSuspended,
    AccountStatus.deactivated => ApiErrorCodes.accountDeactivated,
    _ => 'ERROR',
  };

  void _handleSignInFailure(ApiException e) {
    if (e.isAccountStatus) {
      state = state.copyWith(
        status: AuthStatus.accountBlocked,
        busy: false,
        error: e,
      );
      return;
    }
    state = state.copyWith(busy: false, error: e);
  }

  Future<void> _persistTokens(dynamic data) async {
    if (data is! Map) {
      throw const ApiException(
        code: 'ERROR',
        message: 'Unexpected response from the server.',
      );
    }
    final access = data['accessToken'] as String?;
    final refresh = data['refreshToken'] as String?;
    if (access == null || refresh == null) {
      throw const ApiException(
        code: 'ERROR',
        message: 'Sign-in did not return a session.',
      );
    }
    await _tokens.save(access: access, refresh: refresh);
  }

  Future<Session> _fetchMe() async {
    final data = await _api.get('/auth/me');
    if (data is! Map) {
      throw const ApiException(
        code: 'ERROR',
        message: 'Could not load your profile.',
      );
    }
    return Session.fromJson(data);
  }

  static DateTime? _parseDate(Object? raw) {
    if (raw is String) return DateTime.tryParse(raw)?.toLocal();
    return null;
  }
}
