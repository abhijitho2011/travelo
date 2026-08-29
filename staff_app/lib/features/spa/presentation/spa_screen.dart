import 'package:flutter/material.dart';

import '../../../core/widgets/coming_soon.dart';

/// Deferred in this build — see README "What is deferred".
class SpaScreen extends StatelessWidget {
  const SpaScreen({super.key});

  @override
  Widget build(BuildContext context) => const ComingSoonScreen(
    module: 'Spa Dashboard',
    detail:
        'Bookings, therapists, services and the spa day-sheet will live here.',
  );
}
