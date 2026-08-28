import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../api/api_client.dart';
import '../api/token_store.dart';
import '../models/owner_models.dart';
import 'auth_state.dart';
import 'google_auth_service.dart';

/// Owner authentication controller.
///
/// Login is passwordless: mobile number + OTP. The Super Admin creates the
/// owner account; only an existing owner account can authenticate. The backend
/// never reveals whether a number is registered — OTP request always returns OK.
class AuthController extends StateNotifier<AuthState> {
  AuthController({
    required ApiClient api,
    required TokenStore tokens,
    required GoogleAuthService google,
  })  : _api = api,
        _tokens = tokens,
        _google = google,
        super(const AuthState.unknown());

  final ApiClient _api;
  final TokenStore _tokens;
  final GoogleAuthService _google;

  /// Restore session on cold start.
  Future<void> bootstrap() async {
    final token = await _tokens.access();
    if (token == null) {
      state = const AuthState.signedOut();
      return;
    }
    try {
      await _loadMe();
    } catch (_) {
      await _tokens.clear();
      state = const AuthState.signedOut();
    }
  }

  /// Request an OTP for a mobile number. Always resolves OK on success —
  /// the response does not disclose account existence.
  Future<void> requestOtp(String mobile) async {
    await _api.post('/auth/otp/request', body: {'mobile': mobile});
  }

  /// Verify OTP → receive JWT pair → load profile.
  Future<void> verifyOtp({required String mobile, required String otp}) async {
    final data = await _api.post(
      '/auth/otp/verify',
      body: {'mobile': mobile, 'otp': otp},
    ) as Map;
    await _tokens.save(
      access: data['accessToken'] as String,
      refresh: data['refreshToken'] as String,
    );
    await _loadMe();
  }

  /// Google sign-in → Firebase ID token → backend exchange for a Travelo
  /// session. The backend only issues tokens for an existing owner account.
  Future<void> signInWithGoogle() async {
    final idToken = await _google.signInAndGetIdToken();
    final data = await _api.post(
      '/auth/google',
      body: {'idToken': idToken},
    ) as Map;
    await _tokens.save(
      access: data['accessToken'] as String,
      refresh: data['refreshToken'] as String,
    );
    await _loadMe();
  }

  Future<void> _loadMe() async {
    final me = await _api.get('/auth/me') as Map;
    final owner = OwnerProfile.fromJson(
      (me['owner'] ?? me) as Map,
    );
    final subJson = me['subscription'];
    state = AuthState(
      phase: AuthPhase.authenticated,
      owner: owner,
      subscription: subJson is Map ? SubscriptionInfo.fromJson(subJson) : null,
    );
  }

  Future<void> refreshMe() async {
    if (!state.isAuthenticated) return;
    try {
      await _loadMe();
    } catch (_) {/* keep last known state */}
  }

  Future<void> signOut() async {
    try {
      await _api.post('/auth/logout');
    } catch (_) {}
    await _google.signOut();
    await _tokens.clear();
    state = const AuthState.signedOut();
  }
}
