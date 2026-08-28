import 'package:firebase_core/firebase_core.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'firebase_options.dart';
import 'router.dart';
import 'theme/app_theme.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  try {
    await Firebase.initializeApp(options: DefaultFirebaseOptions.currentPlatform);
  } catch (_) {
    // Firebase is only required for Google sign-in; the OTP flow works without it.
  }
  runApp(const ProviderScope(child: TaveloOwnerApp()));
}

class TaveloOwnerApp extends StatelessWidget {
  const TaveloOwnerApp({super.key});

  @override
  Widget build(BuildContext context) {
    // While the session is unknown we show the splash inside a bare MaterialApp;
    // once known, SplashGate swaps in MaterialApp.router.
    return MaterialApp(
      title: 'Tavelo Owner',
      debugShowCheckedModeBanner: false,
      theme: AppTheme.light(),
      home: const SplashGate(),
    );
  }
}
