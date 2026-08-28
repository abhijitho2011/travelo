import '../models/owner_models.dart';

enum AuthPhase { unknown, unauthenticated, authenticated }

class AuthState {
  final AuthPhase phase;
  final OwnerProfile? owner;
  final SubscriptionInfo? subscription;

  const AuthState({
    required this.phase,
    this.owner,
    this.subscription,
  });

  const AuthState.unknown() : this(phase: AuthPhase.unknown);
  const AuthState.signedOut() : this(phase: AuthPhase.unauthenticated);

  bool get isAuthenticated => phase == AuthPhase.authenticated;

  AuthState copyWith({
    AuthPhase? phase,
    OwnerProfile? owner,
    SubscriptionInfo? subscription,
  }) {
    return AuthState(
      phase: phase ?? this.phase,
      owner: owner ?? this.owner,
      subscription: subscription ?? this.subscription,
    );
  }
}
