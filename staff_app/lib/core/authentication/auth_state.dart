import 'package:flutter/foundation.dart';

import '../networking/api_exception.dart';
import 'session.dart';

enum AuthStatus {
  /// Bootstrapping — we have not yet decided whether a session exists.
  unknown,

  /// No session. The login screen is shown.
  signedOut,

  /// An OTP has been requested; the code screen is shown.
  otpPending,

  /// Signed in and the account is usable.
  authenticated,

  /// Credentials were accepted but the account may not be used
  /// (pending approval / blocked / suspended / deactivated / invited).
  accountBlocked,

  /// A refresh failed mid-session — distinct from a plain sign-out so we can
  /// tell the user what happened instead of silently dumping them on login.
  sessionExpired,
}

@immutable
class AuthState {
  const AuthState({
    this.status = AuthStatus.unknown,
    this.session,
    this.mobile,
    this.otpExpiresAt,
    this.error,
    this.busy = false,
    this.resendAvailableAt,
    this.isFirstLogin = false,
  });

  final AuthStatus status;
  final Session? session;

  /// The number the current OTP was sent to, kept so "Resend" and "Change
  /// number" work without re-asking.
  final String? mobile;
  final DateTime? otpExpiresAt;
  final DateTime? resendAvailableAt;

  /// Last failure, surfaced inline on the login/OTP screens.
  final ApiException? error;

  final bool busy;

  /// True immediately after the first successful sign-in of a newly approved
  /// account, so the welcome card is shown once.
  final bool isFirstLogin;

  bool get isAuthenticated =>
      status == AuthStatus.authenticated && session != null;

  AuthState copyWith({
    AuthStatus? status,
    Session? session,
    String? mobile,
    DateTime? otpExpiresAt,
    DateTime? resendAvailableAt,
    ApiException? error,
    bool? busy,
    bool? isFirstLogin,
    bool clearError = false,
    bool clearSession = false,
  }) => AuthState(
    status: status ?? this.status,
    session: clearSession ? null : (session ?? this.session),
    mobile: mobile ?? this.mobile,
    otpExpiresAt: otpExpiresAt ?? this.otpExpiresAt,
    resendAvailableAt: resendAvailableAt ?? this.resendAvailableAt,
    error: clearError ? null : (error ?? this.error),
    busy: busy ?? this.busy,
    isFirstLogin: isFirstLogin ?? this.isFirstLogin,
  );
}
