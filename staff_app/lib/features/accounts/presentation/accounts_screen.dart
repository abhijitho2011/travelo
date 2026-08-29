import 'package:flutter/material.dart';

import '../../../core/widgets/coming_soon.dart';

/// Deferred in this build — see README "What is deferred".
class AccountsScreen extends StatelessWidget {
  const AccountsScreen({super.key});

  @override
  Widget build(BuildContext context) => const ComingSoonScreen(
    module: 'Accounts & Finance',
    detail:
        'Folios, invoices, expenses, payments and the daily revenue report will live here.',
  );
}
