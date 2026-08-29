import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/intl.dart';

import '../../core/data/owner_repository.dart';
import '../../core/models/owner_models.dart';
import '../../core/theme/app_colors.dart';
import '../../core/theme/app_spacing.dart';
import '../../core/theme/app_typography.dart';
import '../../core/widgets/primitives.dart';
import '../../core/widgets/states.dart';
import '../../core/widgets/status_badge.dart';

/// Status filters offered above the ticket list. '' is "everything".
const _filters = <(String, String)>[
  ('', 'All'),
  ('OPEN', 'Open'),
  ('IN_PROGRESS', 'In progress'),
  ('WAITING_FOR_OWNER', 'Needs you'),
  ('RESOLVED', 'Resolved'),
];

class SupportScreen extends ConsumerStatefulWidget {
  const SupportScreen({super.key});
  @override
  ConsumerState<SupportScreen> createState() => _SupportScreenState();
}

class _SupportScreenState extends ConsumerState<SupportScreen> {
  String _status = '';

  Future<void> _newTicket() async {
    await context.push('/support/new');
    ref.invalidate(ticketsProvider(_status));
  }

  @override
  Widget build(BuildContext context) {
    final tickets = ref.watch(ticketsProvider(_status));

    return PageBody(
      onRefresh: () async => ref.invalidate(ticketsProvider(_status)),
      children: [
        PageHeader(
          eyebrow: 'Help',
          title: 'Support',
          subtitle: 'Ask Tavelo anything about your hotels or your account.',
          actions: [
            FilledButton.icon(
              onPressed: _newTicket,
              icon: const Icon(Icons.add_comment_outlined, size: 16),
              label: const Text('New ticket'),
            ),
          ],
        ),
        gapSection,
        // A Wrap rather than a horizontal strip: five filters fit on two lines
        // on the narrowest phone, and none of them scrolls out of sight.
        Wrap(
          spacing: Sp.sm,
          runSpacing: Sp.sm,
          children: [
            for (final (value, label) in _filters)
              ChoiceChip(
                label: Text(label),
                selected: _status == value,
                onSelected: (_) => setState(() => _status = value),
                visualDensity: VisualDensity.compact,
                materialTapTargetSize: MaterialTapTargetSize.shrinkWrap,
              ),
          ],
        ),
        gapMd,
        tickets.when(
          loading: () => const ListSkeleton(rows: 3, height: 96),
          error: (e, _) => ErrorState(
            error: e,
            message: 'Could not load your tickets.',
            onRetry: () => ref.invalidate(ticketsProvider(_status)),
          ),
          data: (list) => list.isEmpty
              ? EmptyState(
                  icon: Icons.forum_outlined,
                  title: 'No tickets here',
                  hint: 'Open a ticket and the Tavelo team will pick it up.',
                  action: FilledButton.icon(
                    onPressed: _newTicket,
                    icon: const Icon(Icons.add_comment_outlined, size: 16),
                    label: const Text('New ticket'),
                  ),
                )
              : Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    for (final t in list)
                      Padding(
                        padding: const EdgeInsets.only(bottom: Sp.md),
                        child: _TicketCard(
                          ticket: t,
                          onOpen: () async {
                            await context.push('/support/${t.id}');
                            ref.invalidate(ticketsProvider(_status));
                          },
                        ),
                      ),
                  ],
                ),
        ),
      ],
    );
  }
}

/// Shared chip mapping so the list and the thread agree on tone and wording.
(String, StatusTone) ticketStatusChip(String raw) =>
    switch (raw.toUpperCase()) {
      'OPEN' => ('Open', StatusTone.info),
      'IN_PROGRESS' => ('In progress', StatusTone.cleaning),
      'WAITING_FOR_OWNER' => ('Needs your reply', StatusTone.warning),
      'RESOLVED' => ('Resolved', StatusTone.healthy),
      'CLOSED' => ('Closed', StatusTone.neutral),
      _ => (raw.isEmpty ? '—' : raw, StatusTone.neutral),
    };

(String, StatusTone) ticketPriorityChip(String raw) =>
    switch (raw.toUpperCase()) {
      'CRITICAL' => ('Critical', StatusTone.critical),
      'HIGH' => ('High', StatusTone.warning),
      'NORMAL' => ('Normal', StatusTone.neutral),
      'LOW' => ('Low', StatusTone.neutral),
      _ => (raw.isEmpty ? 'Normal' : raw, StatusTone.neutral),
    };

class _TicketCard extends StatelessWidget {
  const _TicketCard({required this.ticket, required this.onOpen});
  final SupportTicket ticket;
  final VoidCallback onOpen;

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    final (statusLabel, statusTone) = ticketStatusChip(ticket.status);
    final (priorityLabel, priorityTone) = ticketPriorityChip(ticket.priority);
    final when = ticket.updatedAt ?? ticket.createdAt;

    return SoftCard(
      onTap: onOpen,
      // A ticket waiting on the owner is the one thing on this screen that
      // needs doing, so it carries the left rule.
      accent: statusTone == StatusTone.warning ? c.warning : null,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Expanded(
                child: Text(
                  ticket.subject,
                  style: AppTypography.body(
                    size: 14.5,
                    weight: FontWeight.w700,
                    color: c.foreground,
                  ),
                ),
              ),
              const SizedBox(width: Sp.sm),
              Icon(Icons.chevron_right, size: 18, color: c.mutedForeground),
            ],
          ),
          const SizedBox(height: Sp.sm),
          Wrap(
            spacing: Sp.sm,
            runSpacing: 6,
            crossAxisAlignment: WrapCrossAlignment.center,
            children: [
              StatusBadge(tone: statusTone, label: statusLabel, dense: true),
              StatusBadge(
                tone: priorityTone,
                label: priorityLabel,
                icon: Icons.flag_outlined,
                dense: true,
              ),
              if (ticket.propertyName.isNotEmpty)
                Text(
                  ticket.propertyName,
                  style: AppTypography.body(size: 12, color: c.mutedForeground),
                ),
            ],
          ),
          if (when != null) ...[
            const SizedBox(height: Sp.sm),
            Text(
              'Updated ${DateFormat.yMMMd().add_jm().format(when)}',
              style: AppTypography.numeric(
                size: 11.5,
                color: c.mutedForeground,
              ),
            ),
          ],
        ],
      ),
    );
  }
}
