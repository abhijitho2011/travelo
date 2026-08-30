import 'package:firebase_core/firebase_core.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'core/config/app_config.dart';
import 'core/offline/offline_providers.dart';
import 'core/providers.dart';
import 'core/routing/app_router.dart';
import 'core/theme/app_theme.dart';
import 'core/theme/theme_controller.dart';
import 'firebase_options.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  try {
    await Firebase.initializeApp(options: DefaultFirebaseOptions.currentPlatform);
  } catch (_) {
    // Firebase is only needed for Google sign-in; the OTP flow works without it.
  }
  runApp(const ProviderScope(child: TaveloStaffApp()));
}

class TaveloStaffApp extends ConsumerStatefulWidget {
  const TaveloStaffApp({super.key});

  @override
  ConsumerState<TaveloStaffApp> createState() => _TaveloStaffAppState();
}

class _TaveloStaffAppState extends ConsumerState<TaveloStaffApp> {
  @override
  void initState() {
    super.initState();
    // Resolve the stored session, then load anything queued offline. Both are
    // safe to run before the first frame settles.
    WidgetsBinding.instance.addPostFrameCallback((_) {
      ref.read(authControllerProvider.notifier).bootstrap();
      ref.read(syncQueueProvider).load();
    });
  }

  @override
  Widget build(BuildContext context) {
    final router = ref.watch(routerProvider);
    final themeMode = ref.watch(themeControllerProvider);

    // Whenever the device comes back online, drain the queue. The push handler
    // is registered in syncQueueProvider, so queued housekeeping, work-order and
    // security ops are replayed here rather than stranded.
    ref.listen(isOnlineProvider, (previous, next) {
      if (next.value == true && previous?.value != true) {
        ref.read(syncQueueProvider).drain();
      }
    });

    return MaterialApp.router(
      title: '${AppConfig.appName} Staff',
      debugShowCheckedModeBanner: false,
      routerConfig: router,
      theme: AppTheme.light(),
      darkTheme: AppTheme.dark(),
      themeMode: themeMode,
    );
  }
}
