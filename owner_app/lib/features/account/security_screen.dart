import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart';

import '../../core/api/api_exception.dart';
import '../../core/data/owner_repository.dart';
import '../../core/models/owner_models.dart';
import '../../core/providers.dart';
import '../../core/theme/app_colors.dart';
import '../../core/theme/app_spacing.dart';
import '../../core/theme/app_typography.dart';
import '../../core/widgets/cards.dart';
import '../../core/widgets/primitives.dart';
import '../../core/widgets/states.dart';
import '../../core/widgets/status_badge.dart';
import '../../core/widgets/impersonation_banner.dart';

/// Every device holding a live session, with a way to end any of them.
class SecurityScreen extends ConsumerWidget {
  const SecurityScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final c = context.colors;
    final sessions = ref.watch(sessionsProvider);

    return PageBody(
      onRefresh: () async => ref.invalidate(sessionsProvider),
      children: [
        const PageHeader(
          eyebrow: 'Account',
          title: 'Security',
          subtitle: 'Where your Tavelo account is signed in.',
        ),
        gapSection,
        const NoticeBanner(
          text:
              'These are the devices signed in to your Tavelo account. '
              'If you do not recognise one, sign it out.',
          icon: Icons.shield_outlined,
        ),
        gapSection,
        sessions.when(
          loading: () => const ListSkeleton(rows: 3, height: 74),
          error: (e, _) => ErrorState(
            error: e,
            message: 'Could not load your devices.',
            onRetry: () => ref.invalidate(sessionsProvider),
          ),
          data: (list) => Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              SectionHeader(
                title: 'Signed-in devices (${list.length})',
                icon: Icons.devices_other,
              ),
              if (list.isEmpty)
                const EmptyState(
                  icon: Icons.devices_other,
                  title: 'No active devices.',
                )
              else
                for (final s in list)
                  Padding(
                    padding: const EdgeInsets.only(bottom: Sp.md),
                    child: _SessionCard(session: s),
                  ),
              if (list.where((s) => !s.current).isNotEmpty) ...[
                gapSm,
                OutlinedButton.icon(
                  onPressed: () => _revokeOthers(context, ref),
                  style: OutlinedButton.styleFrom(
                    foregroundColor: c.destructive,
                    side: BorderSide(
                      color: c.destructive.withValues(alpha: 0.5),
                    ),
                  ),
                  icon: const Icon(Icons.logout, size: 16),
                  label: const Text('Sign out of all other devices'),
                ),
              ],
            ],
          ),
        ),
      ],
    );
  }

  Future<void> _revokeOthers(BuildContext context, WidgetRef ref) async {
    // Captured before the dialog await, so no BuildContext crosses it.
    final messenger = ScaffoldMessenger.of(context);
    final ok = await showDialog<bool>(
      context: context,
      builder: (dialogContext) => AlertDialog(
        title: const Text('Sign out everywhere else?'),
        content: const Text(
          'Every other device will be signed out immediately. This device stays '
          'signed in.',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(dialogContext, false),
            child: const Text('Cancel'),
          ),
          ReadOnlyWhenImpersonating(
            child: FilledButton(
              style: FilledButton.styleFrom(
                backgroundColor: dialogContext.colors.destructive,
                foregroundColor: dialogContext.colors.destructiveForeground,
              ),
              onPressed: () => Navigator.pop(dialogContext, true),
              child: const Text('Sign out others'),
            ),
          ),
        ],
      ),
    );
    if (ok != true) return;

    try {
      final n = await ref.read(ownerRepositoryProvider).revokeOtherSessions();
      ref.invalidate(sessionsProvider);
      messenger.showSnackBar(
        SnackBar(
          content: Text(
            n == 0
                ? 'No other devices were signed in.'
                : 'Signed out of $n other device${n == 1 ? '' : 's'}.',
          ),
        ),
      );
    } on ApiException catch (e) {
      messenger.showSnackBar(SnackBar(content: Text(e.message)));
    }
  }
}

class _SessionCard extends ConsumerWidget {
  const _SessionCard({required this.session});
  final OwnerSession session;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final c = context.colors;
    final started = session.createdAt;
    return SoftCard(
      accent: session.current ? c.healthy : null,
      child: Row(
        children: [
          Container(
            width: 40,
            height: 40,
            decoration: BoxDecoration(color: c.accent, borderRadius: R.rSm),
            alignment: Alignment.center,
            child: Icon(
              Icons.devices_other,
              color: c.accentForeground,
              size: 19,
            ),
          ),
          const SizedBox(width: Sp.md),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    Flexible(
                      child: Text(
                        session.deviceLabel,
                        overflow: TextOverflow.ellipsis,
                        style: AppTypography.body(
                          size: 14,
                          weight: FontWeight.w700,
                          color: c.foreground,
                        ),
                      ),
                    ),
                    if (session.current) ...[
                      const SizedBox(width: Sp.sm),
                      // Both halves may shrink: a long device name and the badge
                      // together outrun a narrow phone otherwise.
                      const Flexible(
                        child: StatusBadge(
                          tone: StatusTone.healthy,
                          label: 'This device',
                          dense: true,
                        ),
                      ),
                    ],
                  ],
                ),
                const SizedBox(height: 3),
                Text(
                  [
                    if (session.ip.isNotEmpty) session.ip,
                    if (started != null)
                      'Signed in ${DateFormat.yMMMd().add_jm().format(started)}',
                  ].join(' · '),
                  style: AppTypography.numeric(
                    size: 12,
                    color: c.mutedForeground,
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(width: Sp.sm),
          TextButton(
            onPressed: () => _revoke(context, ref),
            style: TextButton.styleFrom(foregroundColor: c.destructive),
            child: const Text('Revoke'),
          ),
        ],
      ),
    );
  }

  Future<void> _revoke(BuildContext context, WidgetRef ref) async {
    final messenger = ScaffoldMessenger.of(context);
    final ok = await showDialog<bool>(
      context: context,
      builder: (dialogContext) => AlertDialog(
        title: Text(
          session.current ? 'Sign out of this device?' : 'Revoke this device?',
        ),
        content: Text(
          session.current
              ? 'You are using this device — you will be signed out and have to sign in again.'
              : '${session.deviceLabel} will be signed out immediately.',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(dialogContext, false),
            child: const Text('Cancel'),
          ),
          ReadOnlyWhenImpersonating(
            child: FilledButton(
              style: FilledButton.styleFrom(
                backgroundColor: dialogContext.colors.destructive,
                foregroundColor: dialogContext.colors.destructiveForeground,
              ),
              onPressed: () => Navigator.pop(dialogContext, true),
              child: const Text('Revoke'),
            ),
          ),
        ],
      ),
    );
    if (ok != true) return;

    try {
      final wasCurrent = await ref
          .read(ownerRepositoryProvider)
          .revokeSession(session.id);
      if (wasCurrent) {
        // The token behind this app is now dead; drop the local session too so
        // the router sends us to the sign-in screen rather than a 401 loop.
        await ref.read(authControllerProvider.notifier).signOut();
        return;
      }
      ref.invalidate(sessionsProvider);
      messenger.showSnackBar(
        const SnackBar(content: Text('Device signed out.')),
      );
    } on ApiException catch (e) {
      messenger.showSnackBar(SnackBar(content: Text(e.message)));
    }
  }
}
