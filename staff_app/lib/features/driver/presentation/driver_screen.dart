import 'package:flutter/material.dart';

import '../../../core/widgets/coming_soon.dart';

/// Deferred in this build — see README "What is deferred".
class DriverScreen extends StatelessWidget {
  const DriverScreen({super.key});

  @override
  Widget build(BuildContext context) => const ComingSoonScreen(
    module: 'My Trips',
    detail:
        'Your assigned trips, pickup details and the vehicle log will live here.',
  );
}
