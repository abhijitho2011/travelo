import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart';

import '../../core/api/api_exception.dart';
import '../../core/data/owner_repository.dart';
import '../../core/models/owner_models.dart';
import '../../core/providers.dart';
import '../../theme/app_theme.dart';
import '../../widgets/ui.dart';

/// Every device holding a live session, with a way to end any of them.
class SecurityScreen extends ConsumerWidget {
  const SecurityScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final sessions = ref.watch(sessionsProvider);
    return Scaffold(
      appBar: AppBar(title: const Text('Security')),
      body: sessions.when(
        loading: () => const LoadingView(),
        error: (_, __) => ErrorView(
          message: 'Could not load your devices.',
          onRetry: () => ref.invalidate(sessionsProvider),
        ),
        data: (list) => RefreshIndicator(
          onRefresh: () async => ref.invalidate(sessionsProvider),
          child: ListView(
            padding: const EdgeInsets.fromLTRB(20, 20, 20, 40),
            children: [
              const Banner2(
                text:
                    'These are the devices signed in to your Tavelo account. '
                    'If you do not recognise one, sign it out.',
                icon: Icons.shield_outlined,
              ),
              const SizedBox(height: 20),
              SectionTitle('Signed-in devices (${list.length})'),
              const SizedBox(height: 12),
              if (list.isEmpty)
                const Text(
                  'No active devices.',
                  style: TextStyle(color: AppColors.inkMuted),
                )
              else
                ...list.map(
                  (s) => Padding(
                    padding: const EdgeInsets.only(bottom: 12),
                    child: _SessionCard(session: s),
                  ),
                ),
              const SizedBox(height: 12),
              if (list.where((s) => !s.current).isNotEmpty)
                OutlinedButton.icon(
                  onPressed: () => _revokeOthers(context, ref),
                  style: OutlinedButton.styleFrom(
                    foregroundColor: AppColors.danger,
                    side: const BorderSide(color: AppColors.danger),
                  ),
                  icon: const Icon(Icons.logout, size: 18),
                  label: const Text('Sign out of all other devices'),
                ),
            ],
          ),
        ),
      ),
    );
  }

  Future<void> _revokeOthers(BuildContext context, WidgetRef ref) async {
    // Captured before the dialog await, so no BuildContext crosses it.
    final messenger = ScaffoldMessenger.of(context);
    final ok = await showDialog<bool>(
      context: context,
      builder: (_) => AlertDialog(
        title: const Text('Sign out everywhere else?'),
        content: const Text(
          'Every other device will be signed out immediately. This device stays '
          'signed in.',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context, false),
            child: const Text('Cancel'),
          ),
          FilledButton(
            style: FilledButton.styleFrom(backgroundColor: AppColors.danger),
            onPressed: () => Navigator.pop(context, true),
            child: const Text('Sign out others'),
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
    final started = session.createdAt;
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Row(
          children: [
            Container(
              width: 42,
              height: 42,
              decoration: BoxDecoration(
                color: AppColors.primarySoft,
                borderRadius: BorderRadius.circular(AppRadius.md),
              ),
              child: const Icon(Icons.devices_other, color: AppColors.primaryDark, size: 20),
            ),
            const SizedBox(width: 14),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(children: [
                    Flexible(
                      child: Text(
                        session.deviceLabel,
                        style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 15),
                      ),
                    ),
                    if (session.current) ...[
                      const SizedBox(width: 8),
                      const StatusChip(label: 'This device', color: AppColors.success),
                    ],
                  ]),
                  const SizedBox(height: 3),
                  Text(
                    [
                      if (session.ip.isNotEmpty) session.ip,
                      if (started != null)
                        'Signed in ${DateFormat.yMMMd().add_jm().format(started)}',
                    ].join(' · '),
                    style: const TextStyle(color: AppColors.inkMuted, fontSize: 12.5),
                  ),
                ],
              ),
            ),
            TextButton(
              onPressed: () => _revoke(context, ref),
              style: TextButton.styleFrom(foregroundColor: AppColors.danger),
              child: const Text('Revoke'),
            ),
          ],
        ),
      ),
    );
  }

  Future<void> _revoke(BuildContext context, WidgetRef ref) async {
    final messenger = ScaffoldMessenger.of(context);
    final ok = await showDialog<bool>(
      context: context,
      builder: (_) => AlertDialog(
        title: Text(session.current ? 'Sign out of this device?' : 'Revoke this device?'),
        content: Text(
          session.current
              ? 'You are using this device — you will be signed out and have to sign in again.'
              : '${session.deviceLabel} will be signed out immediately.',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context, false),
            child: const Text('Cancel'),
          ),
          FilledButton(
            style: FilledButton.styleFrom(backgroundColor: AppColors.danger),
            onPressed: () => Navigator.pop(context, true),
            child: const Text('Revoke'),
          ),
        ],
      ),
    );
    if (ok != true) return;

    try {
      final wasCurrent = await ref.read(ownerRepositoryProvider).revokeSession(session.id);
      if (wasCurrent) {
        // The token behind this app is now dead; drop the local session too so
        // the router sends us to the sign-in screen rather than a 401 loop.
        await ref.read(authControllerProvider.notifier).signOut();
        return;
      }
      ref.invalidate(sessionsProvider);
      messenger.showSnackBar(const SnackBar(content: Text('Device signed out.')));
    } on ApiException catch (e) {
      messenger.showSnackBar(SnackBar(content: Text(e.message)));
    }
  }
}
