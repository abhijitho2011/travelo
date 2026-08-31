import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../providers.dart';
import '../theme/app_colors.dart';
import '../theme/app_spacing.dart';
import '../theme/app_typography.dart';
import 'primitives.dart';

/// The honest placeholder for a module that is not built yet.
///
/// It names the role and the module the user is entitled to, and says plainly
/// that it is not ready. It never renders invented data, and it never pretends
/// a feature exists.
class ComingSoonScreen extends ConsumerWidget {
  const ComingSoonScreen({super.key, required this.module, this.detail});

  /// The module's real name, e.g. "Kitchen Display".
  final String module;

  /// Optional extra sentence about what will live here.
  final String? detail;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final c = context.colors;
    final session = ref.watch(sessionProvider);
    final roleLabel = session?.role.label ?? 'Staff';

    return PageBody(
      children: [
        PageHeader(
          eyebrow: session?.hotel?.name ?? 'Tavelo',
          title: module,
          subtitle: 'Signed in as $roleLabel',
        ),
        gapSection,
        SoftCard(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Container(
                width: 42,
                height: 42,
                decoration: BoxDecoration(color: c.accent, borderRadius: R.rMd),
                alignment: Alignment.center,
                child: Icon(
                  Icons.construction_outlined,
                  size: 21,
                  color: c.accentForeground,
                ),
              ),
              const SizedBox(height: Sp.md),
              Text(
                '$module is not built yet',
                style: AppTypography.display(size: 17, color: c.foreground),
              ),
              const SizedBox(height: 6),
              Text(
                detail ??
                    'This is the home screen for the $roleLabel role. The module is '
                        'planned but has not shipped in this build, so there is '
                        'nothing real to show here yet — rather than filling the '
                        'screen with sample data, we are telling you straight.',
                style: AppTypography.body(size: 13.5, color: c.mutedForeground),
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
                      Icons.verified_user_outlined,
                      size: 16,
                      color: c.mutedForeground,
                    ),
                    const SizedBox(width: Sp.sm),
                    Expanded(
                      child: Text(
                        'Your account, role and permissions are already set up. '
                        'When this module ships it will appear here automatically — '
                        'no reinstall needed.',
                        style: AppTypography.body(
                          size: 12.5,
                          color: c.mutedForeground,
                        ),
                      ),
                    ),
                  ],
                ),
              ),
            ],
          ),
        ),
      ],
    );
  }
}
