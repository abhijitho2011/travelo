import 'package:flutter/material.dart';

import '../../../core/widgets/coming_soon.dart';

/// Deferred in this build — see README "What is deferred".
class HousekeepingBoardScreen extends StatelessWidget {
  const HousekeepingBoardScreen({super.key});

  @override
  Widget build(BuildContext context) => const ComingSoonScreen(
    module: 'Housekeeping Board',
    detail:
        'The floor-by-floor room board, task assignment and laundry tracking '
        'will live here. The attendant task list is already live.',
  );
}
