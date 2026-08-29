import 'package:flutter/material.dart';

import '../../../core/widgets/coming_soon.dart';

/// Deferred in this build — see README "What is deferred".
class MyWorkOrdersScreen extends StatelessWidget {
  const MyWorkOrdersScreen({super.key});

  @override
  Widget build(BuildContext context) => const ComingSoonScreen(
    module: 'My Work Orders',
    detail:
        'The jobs assigned to you, with start, complete and parts-request actions, will live here.',
  );
}
