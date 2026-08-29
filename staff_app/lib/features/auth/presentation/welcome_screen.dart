import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/providers.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/theme/app_spacing.dart';
import '../../../core/theme/app_typography.dart';
import 'auth_scaffold.dart';

/// First-time welcome. Shown once, right after a newly approved staff member
/// signs in — they were created by their GM and have just been let in, so this
/// is the moment to confirm exactly which hotel, role and department they
/// landed in.
class WelcomeScreen extends ConsumerWidget {
  const WelcomeScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final c = context.colors;
    final session = ref.watch(sessionProvider);
    final config = ref.watch(roleConfigProvider);

    if (session == null) return const SizedBox.shrink();

    return AuthScaffold(
      children: [
        Container(
          padding: const EdgeInsets.all(Sp.xxl),
          decoration: BoxDecoration(
            color: c.card,
            borderRadius: R.rLg,
            border: Border.all(color: c.border),
            boxShadow: c.elevation1,
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Container(
                width: 48,
                height: 48,
                decoration: BoxDecoration(
                  color: c.primary.withValues(alpha: 0.12),
                  borderRadius: R.rMd,
                  border: Border.all(color: c.primary.withValues(alpha: 0.3)),
                ),
                alignment: Alignment.center,
                child: Icon(
                  Icons.celebration_outlined,
                  size: 24,
                  color: c.primary,
                ),
              ),
              const SizedBox(height: Sp.lg),
              Text(
                'Welcome, ${session.user.firstName.isEmpty ? session.user.fullName : session.user.firstName}',
                style: AppTypography.display(size: 22, color: c.foreground),
              ),
              const SizedBox(height: 6),
              Text(
                'Your account is approved and ready. Here is what Tavelo has '
                'you set up as.',
                style: AppTypography.body(size: 14, color: c.mutedForeground),
              ),
              const SizedBox(height: Sp.xl),

              _Fact(
                icon: Icons.apartment_outlined,
                label: 'Hotel',
                value: session.hotel?.name ?? '—',
                hint: session.hotel?.location,
              ),
              _Fact(
                icon: Icons.badge_outlined,
                label: 'Role',
                value: session.role.label,
              ),
              _Fact(
                icon: Icons.workspaces_outline,
                label: 'Department',
                value: session.user.department?.isNotEmpty == true
                    ? session.user.department!
                    : session.role.department,
              ),
              if (session.user.employeeId?.isNotEmpty == true)
                _Fact(
                  icon: Icons.tag,
                  label: 'Employee ID',
                  value: session.user.employeeId!,
                ),

              const SizedBox(height: Sp.lg),
              Container(
                padding: const EdgeInsets.all(Sp.md),
                decoration: BoxDecoration(
                  color: c.muted,
                  borderRadius: R.rMd,
                  border: Border.all(color: c.border),
                ),
                child: Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Icon(
                      Icons.info_outline,
                      size: 16,
                      color: c.mutedForeground,
                    ),
                    const SizedBox(width: Sp.sm),
                    Expanded(
                      child: Text(
                        'Your hotel and role are set by your manager and cannot '
                        'be changed here. If something looks wrong, tell your '
                        'General Manager.',
                        style: AppTypography.body(
                          size: 12.5,
                          color: c.mutedForeground,
                        ),
                      ),
                    ),
                  ],
                ),
              ),

              const SizedBox(height: Sp.xl),
              FilledButton(
                onPressed: () async {
                  await ref
                      .read(authControllerProvider.notifier)
                      .dismissFirstLogin();
                  if (context.mounted) context.go(config.homeRoute);
                },
                child: const Text('Continue'),
              ),
            ],
          ),
        ),
      ],
    );
  }
}

class _Fact extends StatelessWidget {
  const _Fact({
    required this.icon,
    required this.label,
    required this.value,
    this.hint,
  });

  final IconData icon;
  final String label;
  final String value;
  final String? hint;

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    return Padding(
      padding: const EdgeInsets.only(bottom: Sp.md),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(icon, size: 18, color: c.mutedForeground),
          const SizedBox(width: Sp.md),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(label, style: AppTypography.labelXs(c.mutedForeground)),
                Text(
                  value,
                  style: AppTypography.body(
                    size: 14,
                    weight: FontWeight.w600,
                    color: c.foreground,
                  ),
                ),
                if (hint != null && hint!.isNotEmpty)
                  Text(
                    hint!,
                    style: AppTypography.body(
                      size: 12,
                      color: c.mutedForeground,
                    ),
                  ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}
