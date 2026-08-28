import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'router.dart';
import 'theme/app_theme.dart';

void main() {
  runApp(const ProviderScope(child: TraveloOwnerApp()));
}

class TraveloOwnerApp extends StatelessWidget {
  const TraveloOwnerApp({super.key});

  @override
  Widget build(BuildContext context) {
    // While the session is unknown we show the splash inside a bare MaterialApp;
    // once known, SplashGate swaps in MaterialApp.router.
    return MaterialApp(
      title: 'Travelo Owner',
      debugShowCheckedModeBanner: false,
      theme: AppTheme.light(),
      home: const SplashGate(),
    );
  }
}
