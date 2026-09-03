import '../models/owner_models.dart';
import 'impersonation.dart';

/// `mfaChallenge`: the first factor passed but the account has TOTP enrolled,
/// so no session exists yet — only a short-lived challenge token. Nothing
/// authenticated may render until the second factor clears it.
enum AuthPhase { unknown, unauthenticated, mfaChallenge, authenticated }

class AuthState {
  final AuthPhase phase;
  final OwnerProfile? owner;
  final SubscriptionInfo? subscription;

  /// Non-null only while a Tavelo Support session is serving these requests.
  final ImpersonationInfo? impersonation;

  /// The challenge token from first-factor sign-in, held only while the
  /// second factor is pending. It is not a session and grants nothing.
  final String? mfaToken;

  const AuthState({
    required this.phase,
    this.owner,
    this.subscription,
    this.impersonation,
    this.mfaToken,
  });

  const AuthState.unknown() : this(phase: AuthPhase.unknown);
  const AuthState.signedOut() : this(phase: AuthPhase.unauthenticated);
  const AuthState.mfaPending(String token)
    : this(phase: AuthPhase.mfaChallenge, mfaToken: token);

  bool get isAuthenticated => phase == AuthPhase.authenticated;
  bool get isMfaPending => phase == AuthPhase.mfaChallenge;

  /// The single question every write control asks before enabling itself.
  bool get isImpersonating => impersonation != null;

  AuthState copyWith({
    AuthPhase? phase,
    OwnerProfile? owner,
    SubscriptionInfo? subscription,
    ImpersonationInfo? impersonation,
    String? mfaToken,
  }) {
    return AuthState(
      phase: phase ?? this.phase,
      owner: owner ?? this.owner,
      subscription: subscription ?? this.subscription,
      impersonation: impersonation ?? this.impersonation,
      mfaToken: mfaToken ?? this.mfaToken,
    );
  }
}
