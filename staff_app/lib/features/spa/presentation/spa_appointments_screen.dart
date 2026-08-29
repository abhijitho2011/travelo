import 'package:flutter/material.dart';

import '../../../core/widgets/coming_soon.dart';

/// Deferred in this build — see README "What is deferred".
class SpaAppointmentsScreen extends StatelessWidget {
  const SpaAppointmentsScreen({super.key});

  @override
  Widget build(BuildContext context) => const ComingSoonScreen(
    module: 'My Appointments',
    detail:
        'Your appointment list for the day, with start and complete actions, will live here.',
  );
}
