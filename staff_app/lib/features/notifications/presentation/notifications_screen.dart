import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/notifications/notification_model.dart';
import '../../../core/notifications/notifications_controller.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/theme/app_spacing.dart';
import '../../../core/theme/app_typography.dart';
import '../../../core/utils/formatting.dart';
import '../../../core/widgets/primitives.dart';
import '../../../core/widgets/states.dart';
import '../../../core/widgets/status_badge.dart';

class NotificationsScreen extends ConsumerWidget {
  const NotificationsScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final async = ref.watch(notificationsProvider);
    final unread = ref.watch(unreadNotificationCountProvider);

    return PageBody(
      onRefresh: () => ref.read(notificationsProvider.notifier).refresh(),
      children: [
        PageHeader(
          eyebrow: 'Account',
          title: 'Notifications',
          subtitle: unread == 0
              ? 'You are up to date.'
              : '$unread unread',
          actions: [
            if (unread > 0)
              OutlinedButton.icon(
                onPressed: () =>
                    ref.read(notificationsProvider.notifier).markAllRead(),
                icon: const Icon(Icons.done_all, size: 16),
                label: const Text('Mark all read'),
              ),
          ],
        ),
        gapSection,
        async.when(
          loading: () => const ListSkeleton(rows: 4, height: 72),
          error: (e, _) => ErrorState(
            error: e,
            onRetry: () => ref.read(notificationsProvider.notifier).refresh(),
          ),
          data: (items) => items.isEmpty
              ? const EmptyState(
                  title: 'Nothing to catch up on',
                  hint:
                      'Task assignments, approvals and alerts for your role '
                      'land here.',
                  icon: Icons.notifications_none,
                )
              : Column(
                  children: [
                    for (final n in items)
                      Padding(
                        padding: const EdgeInsets.only(bottom: Sp.md),
                        child: _NotificationTile(notification: n),
                      ),
                  ],
                ),
        ),
      ],
    );
  }
}

class _NotificationTile extends ConsumerWidget {
  const _NotificationTile({required this.notification});

  final StaffNotification notification;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final c = context.colors;
    final n = notification;
    final tone = n.tone.color(c);

    return SoftCard(
      accent: n.read ? null : tone,
      onTap: () {
        ref.read(notificationsProvider.notifier).markRead(n.id);
        // Deep links still pass through the router's guards, so a notification
        // can never open a screen this role may not see.
        if (n.route != null) context.go(n.route!);
      },
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Container(
            width: 32,
            height: 32,
            decoration: BoxDecoration(
              color: tone.withValues(alpha: 0.12),
              borderRadius: R.rSm,
            ),
            alignment: Alignment.center,
            child: Icon(n.tone.icon, size: 16, color: tone),
          ),
          const SizedBox(width: Sp.md),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  n.title,
                  style: AppTypography.body(
                    size: 14,
                    weight: n.read ? FontWeight.w500 : FontWeight.w700,
                    color: c.foreground,
                  ),
                ),
                if (n.body.isNotEmpty)
                  Padding(
                    padding: const EdgeInsets.only(top: 2),
                    child: Text(
                      n.body,
                      style: AppTypography.body(
                        size: 12.5,
                        color: c.mutedForeground,
                      ),
                    ),
                  ),
                const SizedBox(height: 4),
                Text(
                  Fmt.ago(n.createdAt),
                  style: AppTypography.numeric(
                    size: 11.5,
                    color: c.mutedForeground,
                  ),
                ),
              ],
            ),
          ),
          if (!n.read)
            Padding(
              padding: const EdgeInsets.only(top: 6),
              child: StatusDot(tone: n.tone, size: 7),
            ),
        ],
      ),
    );
  }
}
