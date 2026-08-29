import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../auth/impersonation.dart';
import '../providers.dart';
import '../theme/app_colors.dart';
import '../theme/app_spacing.dart';
import '../theme/app_typography.dart';

/// The palette has no `warningForeground`; the warning amber is mid-tone in
/// both themes, so one near-black reads correctly on either.
const Color _onWarning = Color(0xFF1B1608);

/// True while a Tavelo Support session is serving this app.
final isImpersonatingProvider = Provider<bool>(
  (ref) => ref.watch(authControllerProvider).isImpersonating,
);

final impersonationProvider = Provider<ImpersonationInfo?>(
  (ref) => ref.watch(authControllerProvider).impersonation,
);

/// A permanent, unmissable bar above every screen while support is looking.
///
/// Deliberately not dismissible and not scrolled away: an owner who picks up
/// their phone mid-session must be able to tell at a glance that someone else
/// is in the account, and a support agent must never forget whose data they are
/// reading.
class ImpersonationBanner extends ConsumerWidget {
  const ImpersonationBanner({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final info = ref.watch(impersonationProvider);
    if (info == null) return const SizedBox.shrink();

    final auth = ref.watch(authControllerProvider);
    final ownerName = auth.owner?.name.trim().isNotEmpty == true
        ? auth.owner!.name.trim()
        : 'this account';
    final c = context.colors;

    return Material(
      color: c.warning,
      child: SafeArea(
        bottom: false,
        child: Padding(
          padding: const EdgeInsets.fromLTRB(Sp.md, Sp.sm, Sp.sm, Sp.sm),
          child: Row(
            children: [
              Icon(Icons.visibility_outlined, size: 18, color: _onWarning),
              const SizedBox(width: Sp.sm),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Text(
                      'Viewing as $ownerName — Tavelo Support session. Read-only.',
                      style: AppTypography.body(
                        size: 12,
                        weight: FontWeight.w700,
                        color: _onWarning,
                      ),
                    ),
                    Text(
                      'Started by ${info.byAdmin}. Nothing can be changed from here.',
                      style: AppTypography.body(size: 11, color: _onWarning),
                    ),
                  ],
                ),
              ),
              TextButton(
                onPressed: () => confirmEndImpersonation(context, ref),
                style: TextButton.styleFrom(foregroundColor: _onWarning),
                child: const Text('End session'),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

/// Explains honestly what "End session" can and cannot do before doing it.
Future<void> confirmEndImpersonation(
  BuildContext context,
  WidgetRef ref,
) async {
  final ok = await showDialog<bool>(
    context: context,
    builder: (dialogContext) => AlertDialog(
      title: const Text('Leave this support session?'),
      content: const Text(
        'This signs the support session out of this device and returns to the '
        'sign-in screen.\n\n'
        'The session itself is ended by Tavelo Support from the admin console, '
        'and lapses on its own within the hour.',
      ),
      actions: [
        TextButton(
          onPressed: () => Navigator.pop(dialogContext, false),
          child: const Text('Stay'),
        ),
        FilledButton(
          onPressed: () => Navigator.pop(dialogContext, true),
          child: const Text('Leave'),
        ),
      ],
    ),
  );
  if (ok != true) return;
  await ref.read(authControllerProvider.notifier).endImpersonation();
}

/// Wraps a control that would write, so it reads as unavailable rather than
/// failing with a 403 after the owner has filled a whole form in.
///
/// Wrapping (rather than threading an `enabled` flag through every screen)
/// keeps the rule in one place: if it is inside a [ReadOnlyWhenImpersonating],
/// it cannot be pressed during a support session.
class ReadOnlyWhenImpersonating extends ConsumerWidget {
  const ReadOnlyWhenImpersonating({
    super.key,
    required this.child,
    this.message,
  });

  final Widget child;
  final String? message;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    if (!ref.watch(isImpersonatingProvider)) return child;
    return Tooltip(
      message: message ?? 'Read-only during a Tavelo Support session',
      child: Opacity(opacity: 0.45, child: AbsorbPointer(child: child)),
    );
  }
}
