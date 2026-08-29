import 'package:flutter/material.dart';

import '../../../core/widgets/coming_soon.dart';

/// Deferred in this build — see README "What is deferred".
class RestaurantCleaningScreen extends StatelessWidget {
  const RestaurantCleaningScreen({super.key});

  @override
  Widget build(BuildContext context) => const ComingSoonScreen(
    module: 'Cleaning Tasks',
    detail:
        'Your cleaning rounds for the outlet, with start and complete actions, will live here.',
  );
}
