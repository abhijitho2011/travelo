import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import 'core/auth/auth_state.dart';
import 'core/providers.dart';
import 'features/auth/invite_screen.dart';
import 'features/auth/login_screen.dart';
import 'features/dashboard/portfolio_screen.dart';
import 'features/properties/add_property_screen.dart';
import 'features/properties/properties_screen.dart';
import 'features/staff/add_staff_screen.dart';
import 'features/staff/staff_screen.dart';
import 'theme/app_theme.dart';

/// Bridges Riverpod auth state into go_router's refresh mechanism.
class _AuthListenable extends ChangeNotifier {
  _AuthListenable(this._ref) {
    _ref.listen(authControllerProvider, (_, __) => notifyListeners());
  }
  final Ref _ref;
}

final routerProvider = Provider<GoRouter>((ref) {
  final listenable = _AuthListenable(ref);
  return GoRouter(
    initialLocation: '/',
    refreshListenable: listenable,
    redirect: (context, state) {
      final auth = ref.read(authControllerProvider);
      final loc = state.matchedLocation;
      final onAuthPage = loc == '/login' || loc == '/invite';

      if (auth.phase == AuthPhase.unknown) return null; // splash handles it
      if (!auth.isAuthenticated) {
        return onAuthPage ? null : '/login';
      }
      if (onAuthPage) return '/';
      return null;
    },
    routes: [
      GoRoute(path: '/login', builder: (_, __) => const LoginScreen()),
      GoRoute(path: '/invite', builder: (_, __) => const InviteScreen()),
      GoRoute(path: '/', builder: (_, __) => const PortfolioScreen()),
      GoRoute(path: '/properties', builder: (_, __) => const PropertiesScreen()),
      GoRoute(path: '/properties/new', builder: (_, __) => const AddPropertyScreen()),
      GoRoute(
        path: '/properties/:pid/staff',
        builder: (_, s) => StaffScreen(propertyId: s.pathParameters['pid']!),
      ),
      GoRoute(
        path: '/properties/:pid/staff/new',
        builder: (_, s) => AddStaffScreen(propertyId: s.pathParameters['pid']!),
      ),
    ],
  );
});

/// Splash that bootstraps the session, then lets the router take over.
class SplashGate extends ConsumerStatefulWidget {
  const SplashGate({super.key});
  @override
  ConsumerState<SplashGate> createState() => _SplashGateState();
}

class _SplashGateState extends ConsumerState<SplashGate> {
  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      ref.read(authControllerProvider.notifier).bootstrap();
    });
  }

  @override
  Widget build(BuildContext context) {
    final phase = ref.watch(authControllerProvider).phase;
    if (phase != AuthPhase.unknown) {
      // Hand off to the real router shell.
      return const _RouterHost();
    }
    return const Scaffold(
      backgroundColor: AppColors.primary,
      body: Center(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(Icons.apartment_rounded, color: Colors.white, size: 48),
            SizedBox(height: 20),
            SizedBox(
              width: 26,
              height: 26,
              child: CircularProgressIndicator(color: Colors.white, strokeWidth: 2.6),
            ),
          ],
        ),
      ),
    );
  }
}

class _RouterHost extends ConsumerWidget {
  const _RouterHost();
  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final router = ref.watch(routerProvider);
    return MaterialApp.router(
      title: 'Travelo Owner',
      debugShowCheckedModeBanner: false,
      theme: AppTheme.light(),
      routerConfig: router,
    );
  }
}
