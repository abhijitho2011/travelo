import 'package:flutter/material.dart';

import '../../../core/widgets/coming_soon.dart';

/// Deferred in this build — see README "What is deferred".
class SalesScreen extends StatelessWidget {
  const SalesScreen({super.key});

  @override
  Widget build(BuildContext context) => const ComingSoonScreen(
    module: 'Sales CRM',
    detail:
        'Leads, corporate accounts, targets and the sales pipeline will live here.',
  );
}
