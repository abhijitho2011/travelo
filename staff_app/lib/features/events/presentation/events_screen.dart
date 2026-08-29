import 'package:flutter/material.dart';

import '../../../core/widgets/coming_soon.dart';

/// Deferred in this build — see README "What is deferred".
class EventsScreen extends StatelessWidget {
  const EventsScreen({super.key});

  @override
  Widget build(BuildContext context) => const ComingSoonScreen(
    module: 'Events & Banquets',
    detail:
        'Enquiries, banquet bookings, function sheets and event billing will live here.',
  );
}
