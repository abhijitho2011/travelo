import '../authentication/auth_state.dart';
import '../permissions/permission_set.dart';
import '../permissions/role_config.dart';
import 'routes.dart';

/// Everything a guard needs to decide. Assembled once per navigation.
class GuardContext {
  const GuardContext({
    required this.location,
    required this.auth,
    required this.config,
    required this.permissions,
  });

  final String location;
  final AuthState auth;
  final RoleConfig config;
  final PermissionSet permissions;

  /// The nav route this location belongs to. `/reception/reservations/R-12`
  /// canonicalises to `/reception/reservations`, so a detail screen inherits
  /// its parent's role and permission requirements instead of being unguarded.
  String get canonicalRoute => canonicalise(location);

  static String canonicalise(String location) {
    final path = location.split('?').first;
    String best = path;
    var bestLength = -1;
    for (final route in _navRoutes) {
      if (route.length <= bestLength) continue;
      if (path == route ||
          (path.startsWith(route) &&
              (route == '/' || path[route.length] == '/'))) {
        best = route;
        bestLength = route.length;
      }
    }
    return best;
  }

  /// Every route referenced by any role's config, plus the always-available
  /// ones. Built once; used for longest-prefix canonicalisation.
  static final Set<String> _navRoutes = {
    for (final role in StaffRole.values) ...RoleConfig.of(role).allowedRoutes,
    Routes.profile,
    Routes.notifications,
    Routes.accessDenied,
    Routes.welcome,
  };
}

/// One link in the guard chain. Returning a path redirects; returning null
/// passes control to the next guard.
abstract class RouteGuard {
  const RouteGuard();

  String? call(GuardContext ctx);
}

/// Routes reachable without a session.
const _publicRoutes = <String>{
  Routes.splash,
  Routes.login,
  Routes.otp,
  Routes.accountStatus,
  Routes.sessionExpired,
};

/// 1. Is there a session at all?
class AuthGuard extends RouteGuard {
  const AuthGuard();

  @override
  String? call(GuardContext ctx) {
    final status = ctx.auth.status;
    final path = ctx.location.split('?').first;
    final isPublic = _publicRoutes.contains(path);

    if (status == AuthStatus.unknown) {
      return path == Routes.splash ? null : Routes.splash;
    }

    if (status == AuthStatus.sessionExpired) {
      return path == Routes.sessionExpired ? null : Routes.sessionExpired;
    }

    if (status == AuthStatus.signedOut) {
      // The OTP screen is only reachable once a code has actually been sent.
      if (path == Routes.otp) return Routes.login;
      return isPublic && path != Routes.splash ? null : Routes.login;
    }

    if (status == AuthStatus.otpPending) {
      return path == Routes.otp ? null : Routes.otp;
    }

    // Authenticated (or blocked) users never sit on a public screen.
    if (isPublic && status == AuthStatus.authenticated) {
      return ctx.config.homeRoute;
    }
    return null;
  }
}

/// 2. Is the account allowed to use the app at all?
class AccountStatusGuard extends RouteGuard {
  const AccountStatusGuard();

  @override
  String? call(GuardContext ctx) {
    if (ctx.auth.status != AuthStatus.accountBlocked) return null;
    final path = ctx.location.split('?').first;
    return path == Routes.accountStatus ? null : Routes.accountStatus;
  }
}

/// 3. Does this role's config include the destination?
class RoleGuard extends RouteGuard {
  const RoleGuard();

  @override
  String? call(GuardContext ctx) {
    if (ctx.auth.status != AuthStatus.authenticated) return null;
    final route = ctx.canonicalRoute;
    if (route == Routes.accessDenied || route == Routes.welcome) return null;
    if (ctx.config.allowedRoutes.contains(route)) return null;
    return Routes.accessDenied;
  }
}

/// 4. Does the user hold the permissions the destination declares?
class PermissionGuard extends RouteGuard {
  const PermissionGuard();

  @override
  String? call(GuardContext ctx) {
    if (ctx.auth.status != AuthStatus.authenticated) return null;
    final required = ctx.config.requirementsFor(ctx.canonicalRoute);
    if (required == null || required.isEmpty) return null;
    return ctx.permissions.hasAll(required) ? null : Routes.accessDenied;
  }
}

/// 5. Show the welcome card once, immediately after a first sign-in.
class FirstLoginGuard extends RouteGuard {
  const FirstLoginGuard();

  @override
  String? call(GuardContext ctx) {
    if (ctx.auth.status != AuthStatus.authenticated) return null;
    if (!ctx.auth.isFirstLogin) {
      // Nothing to show — bounce off the welcome screen if we somehow land there.
      return ctx.location == Routes.welcome ? ctx.config.homeRoute : null;
    }
    return ctx.location == Routes.welcome ? null : Routes.welcome;
  }
}

/// The chain, in the order the brief specifies. Composed once, applied to
/// every navigation — no screen repeats any of this.
const List<RouteGuard> kGuardChain = [
  AuthGuard(),
  AccountStatusGuard(),
  FirstLoginGuard(),
  RoleGuard(),
  PermissionGuard(),
];

/// Runs the chain and returns the first redirect, or null to allow.
String? applyGuards(GuardContext ctx) {
  for (final guard in kGuardChain) {
    final redirect = guard(ctx);
    if (redirect != null && redirect != ctx.location) return redirect;
  }
  return null;
}
