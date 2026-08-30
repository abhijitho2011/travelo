import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import 'core/auth/auth_state.dart';
import 'core/data/owner_repository.dart';
import 'core/models/owner_models.dart';
import 'core/providers.dart';
import 'core/push/push_messaging.dart';
import 'core/theme/app_colors.dart';
import 'core/theme/app_theme.dart';
import 'core/theme/app_typography.dart';
import 'core/theme/theme_controller.dart';
import 'core/widgets/app_shell.dart';
import 'core/widgets/impersonation_banner.dart';
import 'features/account/profile_screen.dart';
import 'features/account/security_screen.dart';
import 'features/auth/invite_screen.dart';
import 'features/auth/login_screen.dart';
import 'features/dashboard/portfolio_screen.dart';
import 'features/notifications/notifications_screen.dart';
import 'features/properties/add_property_screen.dart';
import 'features/properties/properties_screen.dart';
import 'features/properties/property_amenities_screen.dart';
import 'features/properties/property_detail_screen.dart';
import 'features/staff/add_staff_screen.dart';
import 'features/staff/edit_staff_screen.dart';
import 'features/staff/managers_screen.dart';
import 'features/staff/staff_screen.dart';
import 'features/subscription/subscription_screen.dart';
import 'features/support/new_ticket_screen.dart';
import 'features/support/support_screen.dart';
import 'features/support/support_ticket_screen.dart';

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

      // ------------------------------------------------- inside the shell ---
      // The seven destinations the navigation offers. Everything else is a
      // detail or a form: those are pushed full-screen over the shell with
      // their own back button, exactly as they were before.
      ShellRoute(
        builder: (_, __, child) => AppShell(child: child),
        routes: [
          GoRoute(path: '/', builder: (_, __) => const PortfolioScreen()),
          GoRoute(
            path: '/properties',
            builder: (_, __) => const PropertiesScreen(),
          ),
          GoRoute(path: '/staff', builder: (_, __) => const ManagersScreen()),
          GoRoute(path: '/profile', builder: (_, __) => const ProfileScreen()),
          GoRoute(
            path: '/security',
            builder: (_, __) => const SecurityScreen(),
          ),
          GoRoute(
            path: '/subscription',
            builder: (_, __) => const SubscriptionScreen(),
          ),
          GoRoute(path: '/support', builder: (_, __) => const SupportScreen()),
          GoRoute(
            path: '/notifications',
            builder: (_, __) => const NotificationsScreen(),
          ),
        ],
      ),

      // Declared BEFORE '/properties/:pid', otherwise the parameterised route
      // matches 'new' as a property id and swallows it.
      GoRoute(
        path: '/properties/new',
        builder: (_, __) => const AddPropertyScreen(),
      ),
      GoRoute(
        // The property travels as `extra` from the portfolio and property
        // lists; on a cold deep link it is null and the screen looks it up.
        path: '/properties/:pid',
        builder: (_, s) => PropertyDetailScreen(
          propertyId: s.pathParameters['pid']!,
          property: s.extra is Property ? s.extra as Property : null,
        ),
      ),
      GoRoute(
        path: '/properties/:pid/amenities',
        builder: (_, s) =>
            PropertyAmenitiesScreen(propertyId: s.pathParameters['pid']!),
      ),
      GoRoute(
        path: '/properties/:pid/staff',
        builder: (_, s) => StaffScreen(propertyId: s.pathParameters['pid']!),
      ),
      GoRoute(
        path: '/properties/:pid/staff/new',
        builder: (_, s) => AddStaffScreen(propertyId: s.pathParameters['pid']!),
      ),
      GoRoute(
        // The member travels as `extra` from the staff list; on a cold deep
        // link it is null and the screen looks the record up instead.
        path: '/properties/:pid/staff/:sid/edit',
        builder: (_, s) => EditStaffScreen(
          propertyId: s.pathParameters['pid']!,
          staffId: s.pathParameters['sid']!,
          member: s.extra is StaffMember ? s.extra as StaffMember : null,
        ),
      ),
      GoRoute(
        path: '/support/new',
        builder: (_, __) => const NewTicketScreen(),
      ),
      GoRoute(
        path: '/support/:id',
        builder: (_, s) =>
            SupportTicketScreen(ticketId: s.pathParameters['id']!),
      ),
    ],
    // A deep link (or a tapped notification) to a path that no longer resolves
    // lands here instead of a raw go_router error page.
    errorBuilder: (context, state) => _RouteNotFound(location: state.uri.toString()),
  );
});

/// Shown when a route cannot be resolved — a stale deep link, a mistyped path,
/// or a notification pointing at something since removed. Offers the way home.
class _RouteNotFound extends StatelessWidget {
  const _RouteNotFound({required this.location});

  final String location;

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    return Scaffold(
      backgroundColor: c.background,
      appBar: AppBar(title: const Text('Not found')),
      body: Center(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Icon(Icons.explore_off_outlined, size: 48, color: c.mutedForeground),
              const SizedBox(height: 16),
              Text(
                'This page could not be opened',
                style: AppTypography.body(color: c.foreground, weight: FontWeight.w600),
                textAlign: TextAlign.center,
              ),
              const SizedBox(height: 8),
              Text(
                location,
                style: AppTypography.body(color: c.mutedForeground, size: 13),
                textAlign: TextAlign.center,
              ),
              const SizedBox(height: 20),
              FilledButton(
                onPressed: () => context.go('/'),
                child: const Text('Go to dashboard'),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

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
      _attachPushHandlers();
    });
  }

  /// Foreground pushes refresh the inbox; a tapped push (background or cold
  /// start) deep-links to the related screen. Guarded — an FCM-less host is a
  /// no-op.
  void _attachPushHandlers() {
    try {
      FirebaseMessaging.onMessage.listen((_) {
        ref.read(ownerNotificationsProvider.notifier).refresh();
      });
      FirebaseMessaging.onMessageOpenedApp.listen(_openFromMessage);
      FirebaseMessaging.instance.getInitialMessage().then((message) {
        if (message != null) _openFromMessage(message);
      });
    } catch (error) {
      debugPrint('Push handlers not attached: $error');
    }
  }

  void _openFromMessage(RemoteMessage message) {
    if (message.data.isEmpty) return;
    ref.read(routerProvider).go(PushMessaging.routeForData(message.data));
  }

  @override
  Widget build(BuildContext context) {
    final phase = ref.watch(authControllerProvider).phase;
    if (phase != AuthPhase.unknown) {
      // Hand off to the real router shell.
      return const _RouterHost();
    }
    final c = context.colors;
    return Scaffold(
      backgroundColor: c.background,
      body: Center(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Container(
              width: 56,
              height: 56,
              decoration: BoxDecoration(
                color: c.primary,
                borderRadius: BorderRadius.circular(16),
              ),
              alignment: Alignment.center,
              child: Icon(
                Icons.apartment_rounded,
                color: c.primaryForeground,
                size: 30,
              ),
            ),
            const SizedBox(height: 20),
            Text(
              'Tavelo',
              style: AppTypography.display(size: 20, color: c.foreground),
            ),
            const SizedBox(height: 20),
            SizedBox(
              width: 22,
              height: 22,
              child: CircularProgressIndicator(
                color: c.primary,
                strokeWidth: 2.4,
              ),
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
      title: 'Tavelo Owner',
      debugShowCheckedModeBanner: false,
      theme: AppTheme.light(),
      darkTheme: AppTheme.dark(),
      themeMode: ref.watch(themeControllerProvider),
      routerConfig: router,
      // Above EVERY route, not just the ones inside AppShell: the property
      // and staff forms are pushed full-screen over the shell, and those are
      // exactly the screens where "am I looking at someone else's account?"
      // matters most. Collapses to nothing when there is no session.
      builder: (context, child) => Column(
        children: [
          const ImpersonationBanner(),
          Expanded(child: child ?? const SizedBox.shrink()),
        ],
      ),
    );
  }
}
