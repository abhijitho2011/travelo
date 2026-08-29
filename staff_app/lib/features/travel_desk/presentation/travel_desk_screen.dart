import 'package:flutter/material.dart';

import '../../../core/widgets/coming_soon.dart';

/// Deferred in this build — see README "What is deferred".
class TravelDeskScreen extends StatelessWidget {
  const TravelDeskScreen({super.key});

  @override
  Widget build(BuildContext context) => const ComingSoonScreen(
    module: 'Travel Desk',
    detail:
        'Trips, tours, transport bookings and vendor coordination will live here.',
  );
}
