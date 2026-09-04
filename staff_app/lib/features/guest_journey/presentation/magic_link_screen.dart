import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/intl.dart';

import '../../../core/networking/api_exception.dart';
import '../../../core/permissions/permission_gate.dart';
import '../../../core/permissions/permission_keys.dart';
import '../../../core/routing/routes.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/theme/app_spacing.dart';
import '../../../core/theme/app_typography.dart';
import '../../../core/widgets/primitives.dart';
import '../../../core/widgets/states.dart';
import '../../guest_comms/application/guest_comms_controllers.dart';
import '../application/magic_link_controllers.dart';
import '../data/magic_link_models.dart';

final _d = DateFormat('d MMM');

/// **Magic link** — the guest's contactless stay page: online check-in, ID
/// upload, service requests, and a checkout request.
class MagicLinkScreen extends ConsumerWidget {
  const MagicLinkScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final c = context.colors;
    final window = ref.watch(magicLinkWindowProvider);
    final list = ref.watch(magicLinksProvider);
    return PageBody(
      onRefresh: () async => ref.invalidate(magicLinksProvider),
      children: [
        const PageHeader(eyebrow: 'Guest experience', title: 'Magic link'),
        gapMd,
        SoftCard(
          child: Row(
            children: [
              Icon(Icons.info_outline, color: c.mutedForeground, size: 18),
              const SizedBox(width: Sp.sm),
              Expanded(
                child: Text(
                  'The guest\'s stay link lets them check in online, upload an '
                  'ID and a photo, ask for anything (early breakfast, an extra '
                  'towel) and request checkout without waiting at the desk.',
                  style: AppTypography.body(size: 12, color: c.mutedForeground),
                ),
              ),
            ],
          ),
        ),
        gapMd,
        Wrap(
          spacing: Sp.sm,
          children: [
            for (final w in const [
              ('today', 'Today'),
              ('week', 'This week'),
              ('all', 'All arriving'),
            ])
              ChoiceChip(
                label: Text(w.$2),
                selected: window == w.$1,
                onSelected: (_) =>
                    ref.read(magicLinkWindowProvider.notifier).state = w.$1,
              ),
          ],
        ),
        gapMd,
        list.maybeWhen(
          data: (rows) {
            final counts = <String, int>{
              'Not sent': 0,
              'Sent': 0,
              'Checked in online': 0,
              'Checkout requested': 0,
            };
            for (final r in rows) {
              if (r.link?.checkoutRequestedAt != null) {
                counts['Checkout requested'] =
                    counts['Checkout requested']! + 1;
              } else if (r.link?.checkinSubmittedAt != null) {
                counts['Checked in online'] = counts['Checked in online']! + 1;
              } else if (r.link?.sentAt != null) {
                counts['Sent'] = counts['Sent']! + 1;
              } else {
                counts['Not sent'] = counts['Not sent']! + 1;
              }
            }
            return KpiGrid(
              children: [
                for (final e in counts.entries)
                  KpiCard(label: e.key, value: '${e.value}'),
              ],
            );
          },
          orElse: () => const SizedBox.shrink(),
        ),
        gapSection,
        list.when(
          loading: () => const ListSkeleton(rows: 4),
          error: (e, _) => ErrorState(
            error: e,
            onRetry: () => ref.invalidate(magicLinksProvider),
          ),
          data: (rows) => rows.isEmpty
              ? const EmptyState(
                  title: 'No arrivals in this window',
                  icon: Icons.link_outlined,
                )
              : SoftCard(
                  padding: EdgeInsets.zero,
                  child: Column(
                    children: [
                      for (var i = 0; i < rows.length; i++) ...[
                        if (i > 0) const RowDivider(),
                        _LinkRow(row: rows[i]),
                      ],
                    ],
                  ),
                ),
        ),
        gapSection,
      ],
    );
  }
}

class _LinkRow extends ConsumerWidget {
  const _LinkRow({required this.row});
  final GuestLinkRow row;

  Color _tone(BuildContext c) {
    if (row.link?.checkoutRequestedAt != null) return c.colors.warning;
    if (row.link?.checkinSubmittedAt != null) return c.colors.primary;
    if (row.link?.sentAt != null) return c.colors.foreground;
    return c.colors.mutedForeground;
  }

  Future<void> _send(BuildContext context, WidgetRef ref) async {
    final messenger = ScaffoldMessenger.of(context);
    try {
      final r = await ref
          .read(guestCommsActionsProvider)
          .sendGuestLink(row.reservationId);
      final to = r['sentTo'] is Map ? r['sentTo'] as Map : const {};
      final where = [
        to['phone'],
        to['email'],
      ].where((e) => e != null && '$e'.isNotEmpty).join(' and ');
      messenger.showSnackBar(
        SnackBar(
          content: Text(where.isEmpty ? 'Link sent' : 'Link sent to $where'),
        ),
      );
      ref.invalidate(magicLinksProvider);
    } on ApiException catch (e) {
      messenger.showSnackBar(SnackBar(content: Text(e.message)));
    }
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final c = context.colors;
    final sent = row.link?.sentAt != null;
    final tone = _tone(context);
    return ListTile(
      leading: CircleAvatar(
        backgroundColor: tone.withValues(alpha: 0.16),
        child: Icon(
          row.link?.checkoutRequestedAt != null
              ? Icons.logout
              : (sent ? Icons.mark_email_read_outlined : Icons.link_off),
          color: tone,
          size: 18,
        ),
      ),
      title: Text(
        row.guestName,
        style: AppTypography.body(
          size: 13.5,
          weight: FontWeight.w600,
          color: c.foreground,
        ),
      ),
      subtitle: Text(
        [
          '#${row.code}',
          if (row.roomNumber != null) 'Room ${row.roomNumber}',
          if (row.checkIn != null && row.checkOut != null)
            '${_d.format(row.checkIn!.toLocal())} → ${_d.format(row.checkOut!.toLocal())}',
          row.link?.label() ?? 'Not sent',
        ].join(' · '),
        style: AppTypography.body(size: 11.5, color: c.mutedForeground),
      ),
      trailing: PermissionGate(
        permission: P.reservationUpdate,
        child: TextButton(
          onPressed: () => _send(context, ref),
          child: Text(sent ? 'Re-send' : 'Send'),
        ),
      ),
      onTap: () => context.go(Routes.reservation(row.reservationId)),
    );
  }
}
