import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart';

import '../../core/data/owner_repository.dart';
import '../../core/models/owner_models.dart';
import '../../core/theme/app_colors.dart';
import '../../core/theme/app_spacing.dart';
import '../../core/theme/app_typography.dart';
import '../../core/widgets/primitives.dart';
import '../../core/widgets/states.dart';

/// The owner's IN_APP inbox: subscription reminders, payment receipts and
/// support replies. Backed by /owner/notifications.
class NotificationsScreen extends ConsumerWidget {
  const NotificationsScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final async = ref.watch(ownerNotificationsProvider);
    final controller = ref.read(ownerNotificationsProvider.notifier);

    return async.when(
      loading: () =>
          const PageBody(children: [ListSkeleton(rows: 4, height: 76)]),
      error: (e, __) => PageBody(
        children: [
          const PageHeader(eyebrow: 'Updates', title: 'Notifications'),
          gapSection,
          ErrorState(
            error: e,
            message: 'Could not load your notifications.',
            onRetry: controller.refresh,
          ),
        ],
      ),
      data: (inbox) => PageBody(
        onRefresh: controller.refresh,
        children: [
          Row(
            children: [
              const Expanded(
                child: PageHeader(eyebrow: 'Updates', title: 'Notifications'),
              ),
              if (inbox.unread > 0)
                TextButton(
                  onPressed: controller.markAllRead,
                  child: const Text('Mark all read'),
                ),
            ],
          ),
          gapSection,
          if (inbox.items.isEmpty)
            const EmptyState(
              icon: Icons.notifications_none_outlined,
              title: 'Nothing new',
              hint:
                  'Subscription reminders and support replies will appear here.',
            )
          else
            for (final n in inbox.items) ...[
              _NotificationRow(
                n: n,
                onTap: n.read ? null : () => controller.markRead(n.id),
              ),
              const SizedBox(height: Sp.sm),
            ],
        ],
      ),
    );
  }
}

class _NotificationRow extends StatelessWidget {
  const _NotificationRow({required this.n, this.onTap});
  final OwnerNotification n;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    return SoftCard(
      onTap: onTap,
      padding: const EdgeInsets.all(Sp.lg),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Container(
            width: 8,
            height: 8,
            margin: const EdgeInsets.only(top: 6, right: Sp.md),
            decoration: BoxDecoration(
              color: n.read ? Colors.transparent : c.primary,
              shape: BoxShape.circle,
            ),
          ),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  n.title,
                  style: AppTypography.display(size: 14, color: c.foreground),
                ),
                if (n.body.isNotEmpty) ...[
                  const SizedBox(height: 3),
                  Text(
                    n.body,
                    style: AppTypography.body(
                      size: 13,
                      color: c.mutedForeground,
                    ),
                  ),
                ],
                if (n.createdAt != null) ...[
                  const SizedBox(height: 6),
                  Text(
                    DateFormat('d MMM, HH:mm').format(n.createdAt!),
                    style: AppTypography.body(
                      size: 11,
                      color: c.mutedForeground,
                    ),
                  ),
                ],
              ],
            ),
          ),
        ],
      ),
    );
  }
}
