import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';

import 'authentication/auth_controller.dart';
import 'authentication/auth_state.dart';
import 'authentication/google_auth_service.dart';
import 'authentication/session.dart';
import 'networking/api_client.dart';
import 'push/push_messaging.dart';
import 'permissions/permission_set.dart';
import 'permissions/role_config.dart';
import 'storage/local_store.dart';
import 'storage/token_store.dart';

final secureStorageProvider = Provider<FlutterSecureStorage>(
  (_) => const FlutterSecureStorage(),
);

final tokenStoreProvider = Provider<TokenStore>(
  (ref) => TokenStore(ref.watch(secureStorageProvider)),
);

final localStoreProvider = Provider<LocalStore>((_) => LocalStore());

final googleAuthServiceProvider = Provider<GoogleAuthService>(
  (_) => GoogleAuthService(),
);

/// The API client tells the auth controller when a refresh has failed, so the
/// router can show "session expired" instead of silently bouncing to login.
final Provider<ApiClient> apiClientProvider = Provider<ApiClient>((ref) {
  return ApiClient(
    ref.watch(tokenStoreProvider),
    onSessionExpired: () =>
        ref.read(authControllerProvider.notifier).onSessionExpired(),
  );
});

final StateNotifierProvider<AuthController, AuthState> authControllerProvider =
    StateNotifierProvider<AuthController, AuthState>((ref) {
      return AuthController(
        api: ref.watch(apiClientProvider),
        tokens: ref.watch(tokenStoreProvider),
        google: ref.watch(googleAuthServiceProvider),
        store: ref.watch(localStoreProvider),
        push: ref.watch(pushMessagingProvider),
      );
    });

// ---------------------------------------------------------------------------
// Derived session selectors. Screens watch these narrow providers rather than
// the whole auth state, so a busy-flag change does not rebuild a dashboard.
// ---------------------------------------------------------------------------

final sessionProvider = Provider<Session?>(
  (ref) => ref.watch(authControllerProvider).session,
);

final roleProvider = Provider<StaffRole>(
  (ref) => ref.watch(sessionProvider)?.role ?? StaffRole.unknown,
);

final roleConfigProvider = Provider<RoleConfig>(
  (ref) => RoleConfig.of(ref.watch(roleProvider)),
);

final permissionsProvider = Provider<PermissionSet>(
  (ref) =>
      ref.watch(sessionProvider)?.permissions ?? const PermissionSet.empty(),
);

/// `ref.watch(canProvider('reservation.cancel'))` — the single question every
/// gated button asks.
final canProvider = Provider.family<bool, String>(
  (ref, permission) => ref.watch(permissionsProvider).has(permission),
);
