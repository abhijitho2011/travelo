import 'package:flutter/material.dart';

import '../../../core/widgets/coming_soon.dart';

/// Deferred in this build — see README "What is deferred".
class SpaBookingsScreen extends StatelessWidget {
  const SpaBookingsScreen({super.key});

  @override
  Widget build(BuildContext context) => const ComingSoonScreen(
    module: 'Spa Bookings',
    detail:
        'Taking bookings, issuing spa invoices and collecting payment will live here.',
  );
}
