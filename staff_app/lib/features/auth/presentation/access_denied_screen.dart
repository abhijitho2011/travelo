import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/providers.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/theme/app_spacing.dart';
import '../../../core/theme/app_typography.dart';
import '../../../core/widgets/primitives.dart';

/// Where the RoleGuard and PermissionGuard send anyone who reaches a screen
/// their role or permissions do not cover.
class AccessDeniedScreen extends ConsumerWidget {
  const AccessDeniedScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final c = context.colors;
    final session = ref.watch(sessionProvider);
    final config = ref.watch(roleConfigProvider);

    return Scaffold(
      backgroundColor: c.background,
      body: SafeArea(
        child: Center(
          child: SingleChildScrollView(
            padding: const EdgeInsets.all(Sp.xxl),
            child: ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 420),
              child: SoftCard(
                padding: const EdgeInsets.all(Sp.xxl),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    Container(
                      width: 48,
                      height: 48,
                      decoration: BoxDecoration(
                        color: c.warning.withValues(alpha: 0.12),
                        borderRadius: R.rMd,
                        border: Border.all(
                          color: c.warning.withValues(alpha: 0.3),
                        ),
                      ),
                      alignment: Alignment.center,
                      child: Icon(
                        Icons.lock_outline,
                        size: 24,
                        color: c.warning,
                      ),
                    ),
                    const SizedBox(height: Sp.lg),
                    Text(
                      'You do not have access',
                      style: AppTypography.display(
                        size: 20,
                        color: c.foreground,
                      ),
                    ),
                    const SizedBox(height: 6),
                    Text(
                      'This screen is not part of the ${session?.role.label ?? 'your'} '
                      'role. If you need it, ask your General Manager to update '
                      'your permissions.',
                      style: AppTypography.body(
                        size: 14,
                        color: c.mutedForeground,
                      ),
                    ),
                    const SizedBox(height: Sp.xl),
                    FilledButton(
                      onPressed: () => context.go(config.homeRoute),
                      child: Text('Go to ${config.homeModuleLabel}'),
                    ),
                  ],
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }
}
