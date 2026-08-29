import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/providers.dart';
import '../../../core/theme/app_colors.dart';
import 'auth_scaffold.dart';

/// Distinct from a plain sign-out: the user did nothing wrong, and anything
/// they had queued offline is still on the device.
class SessionExpiredScreen extends ConsumerWidget {
  const SessionExpiredScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final c = context.colors;
    return AuthScaffold(
      children: [
        AuthStatusView(
          icon: Icons.lock_clock_outlined,
          tone: c.warning,
          title: 'Session expired',
          body:
              'You were signed out because your session expired. Sign in again '
              'to pick up where you left off.',
          detail:
              'Anything you saved while offline is still on this device and '
              'will be sent once you are back in.',
          primaryLabel: 'Sign in again',
          onPrimary: () => ref.read(authControllerProvider.notifier).reset(),
        ),
      ],
    );
  }
}
