import '../models/owner_models.dart';
import 'impersonation.dart';

enum AuthPhase { unknown, unauthenticated, authenticated }

class AuthState {
  final AuthPhase phase;
  final OwnerProfile? owner;
  final SubscriptionInfo? subscription;

  /// Non-null only while a Tavelo Support session is serving these requests.
  final ImpersonationInfo? impersonation;

  const AuthState({
    required this.phase,
    this.owner,
    this.subscription,
    this.impersonation,
  });

  const AuthState.unknown() : this(phase: AuthPhase.unknown);
  const AuthState.signedOut() : this(phase: AuthPhase.unauthenticated);

  bool get isAuthenticated => phase == AuthPhase.authenticated;

  /// The single question every write control asks before enabling itself.
  bool get isImpersonating => impersonation != null;

  AuthState copyWith({
    AuthPhase? phase,
    OwnerProfile? owner,
    SubscriptionInfo? subscription,
    ImpersonationInfo? impersonation,
  }) {
    return AuthState(
      phase: phase ?? this.phase,
      owner: owner ?? this.owner,
      subscription: subscription ?? this.subscription,
      impersonation: impersonation ?? this.impersonation,
    );
  }
}
