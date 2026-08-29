import 'package:flutter/material.dart';

import '../../../core/widgets/coming_soon.dart';

/// Deferred in this build — see README "What is deferred".
class SecurityManagerScreen extends StatelessWidget {
  const SecurityManagerScreen({super.key});

  @override
  Widget build(BuildContext context) => const ComingSoonScreen(
    module: 'Security Dashboard',
    detail:
        'Patrol rosters, CCTV notes, the full incident history and gate '
        'analytics will live here. The gate log itself is already live.',
  );
}
