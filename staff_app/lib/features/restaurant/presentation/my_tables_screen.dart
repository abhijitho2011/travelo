import 'package:flutter/material.dart';

import '../../../core/widgets/coming_soon.dart';

/// Deferred in this build — see README "What is deferred".
class MyTablesScreen extends StatelessWidget {
  const MyTablesScreen({super.key});

  @override
  Widget build(BuildContext context) => const ComingSoonScreen(
    module: 'My Tables',
    detail:
        'Your section, its open orders and the KOT you send to the kitchen will live here.',
  );
}
