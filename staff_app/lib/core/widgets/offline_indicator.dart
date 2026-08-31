import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../offline/offline_providers.dart';
import '../theme/app_colors.dart';
import '../theme/app_spacing.dart';
import '../theme/app_typography.dart';

/// The shell's connectivity chip.
///
/// Online with nothing queued: renders nothing — a quiet app is a working app.
/// Otherwise it states the truth: offline, and/or how many changes are waiting
/// to reach the server.
class OfflineIndicator extends ConsumerWidget {
  const OfflineIndicator({super.key, this.onTap});

  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final c = context.colors;
    final online = ref.watch(isOnlineProvider).value ?? true;
    final pending = ref.watch(pendingSyncCountProvider);

    if (online && pending == 0) return const SizedBox.shrink();

    final tone = online ? c.warning : c.critical;
    final label = switch ((online, pending)) {
      (false, 0) => 'Offline',
      (false, final n) => 'Offline · $n waiting',
      (true, final n) => '$n waiting to sync',
    };

    return Semantics(
      liveRegion: true,
      label: online
          ? '$pending changes waiting to sync'
          : 'You are offline. $pending changes waiting to sync.',
      child: InkWell(
        onTap: onTap,
        borderRadius: R.rPill,
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 9, vertical: 4),
          decoration: BoxDecoration(
            color: tone.withValues(alpha: 0.12),
            borderRadius: R.rPill,
            border: Border.all(color: tone.withValues(alpha: 0.35)),
          ),
          child: Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              Icon(
                online ? Icons.cloud_sync_outlined : Icons.cloud_off_outlined,
                size: 13,
                color: tone,
              ),
              const SizedBox(width: 5),
              Text(
                label,
                style: AppTypography.body(
                  size: 11.5,
                  weight: FontWeight.w700,
                  color: tone,
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

/// Detail sheet behind the chip — lists what is queued and is honest that
/// per-module sync is not wired up yet.
class PendingSyncSheet extends ConsumerWidget {
  const PendingSyncSheet({super.key});

  static Future<void> show(BuildContext context) => showModalBottomSheet(
    context: context,
    isScrollControlled: true,
    builder: (_) => const PendingSyncSheet(),
  );

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final c = context.colors;
    final queue = ref.watch(syncQueueProvider);
    final online = ref.watch(isOnlineProvider).value ?? true;

    return SafeArea(
      child: Padding(
        padding: const EdgeInsets.fromLTRB(Sp.lg, 0, Sp.lg, Sp.lg),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              online ? 'Waiting to sync' : "You're offline",
              style: AppTypography.display(size: 18, color: c.foreground),
            ),
            const SizedBox(height: 4),
            Text(
              online
                  ? 'These changes are saved on this device and will be sent to Tavelo.'
                  : 'Your work is saved on this device. It will be sent when you are back online.',
              style: AppTypography.body(size: 13, color: c.mutedForeground),
            ),
            const SizedBox(height: Sp.lg),
            if (queue.operations.isEmpty)
              Text(
                'Nothing is waiting.',
                style: AppTypography.body(size: 13.5, color: c.mutedForeground),
              )
            else
              ConstrainedBox(
                constraints: const BoxConstraints(maxHeight: 280),
                child: ListView.separated(
                  shrinkWrap: true,
                  itemCount: queue.operations.length,
                  separatorBuilder: (_, _) =>
                      Divider(height: 1, color: c.border),
                  itemBuilder: (context, i) {
                    final op = queue.operations[i];
                    return ListTile(
                      contentPadding: EdgeInsets.zero,
                      dense: true,
                      leading: Icon(
                        Icons.pending_actions_outlined,
                        size: 18,
                        color: c.mutedForeground,
                      ),
                      title: Text(op.operationType),
                      subtitle: Text('${op.entityId} · ${op.syncStatus.name}'),
                    );
                  },
                ),
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
                  Icon(Icons.info_outline, size: 16, color: c.mutedForeground),
                  const SizedBox(width: Sp.sm),
                  Expanded(
                    child: Text(
                      queue.hasHandlers
                          ? 'Sync runs automatically once you are back online.'
                          : 'Automatic sending is not switched on yet in this build. '
                                'Your changes are stored safely and nothing is lost.',
                      style: AppTypography.body(
                        size: 12,
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
    );
  }
}
