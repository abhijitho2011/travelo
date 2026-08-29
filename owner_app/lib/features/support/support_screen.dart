import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/intl.dart';

import '../../core/data/owner_repository.dart';
import '../../core/models/owner_models.dart';
import '../../theme/app_theme.dart';
import '../../widgets/ui.dart';

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

  @override
  Widget build(BuildContext context) {
    final tickets = ref.watch(ticketsProvider(_status));
    return Scaffold(
      appBar: AppBar(title: const Text('Support')),
      floatingActionButton: FloatingActionButton.extended(
        backgroundColor: AppColors.primary,
        foregroundColor: Colors.white,
        onPressed: () async {
          await context.push('/support/new');
          ref.invalidate(ticketsProvider(_status));
        },
        icon: const Icon(Icons.add_comment_outlined),
        label: const Text('New ticket'),
      ),
      body: Column(
        children: [
          SizedBox(
            height: 56,
            child: ListView(
              scrollDirection: Axis.horizontal,
              padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 10),
              children: [
                for (final (value, label) in _filters)
                  Padding(
                    padding: const EdgeInsets.only(right: 8),
                    child: ChoiceChip(
                      label: Text(label),
                      selected: _status == value,
                      onSelected: (_) => setState(() => _status = value),
                    ),
                  ),
              ],
            ),
          ),
          const Divider(height: 1),
          Expanded(
            child: tickets.when(
              loading: () => const LoadingView(),
              error: (_, __) => ErrorView(
                message: 'Could not load your tickets.',
                onRetry: () => ref.invalidate(ticketsProvider(_status)),
              ),
              data: (list) {
                if (list.isEmpty) return const _EmptyTickets();
                return RefreshIndicator(
                  onRefresh: () async => ref.invalidate(ticketsProvider(_status)),
                  child: ListView.separated(
                    padding: const EdgeInsets.fromLTRB(20, 20, 20, 96),
                    itemCount: list.length,
                    separatorBuilder: (_, __) => const SizedBox(height: 12),
                    itemBuilder: (_, i) => _TicketCard(
                      ticket: list[i],
                      onOpen: () async {
                        await context.push('/support/${list[i].id}');
                        ref.invalidate(ticketsProvider(_status));
                      },
                    ),
                  ),
                );
              },
            ),
          ),
        ],
      ),
    );
  }
}

/// Shared chip mapping so the list and the thread agree on colour and wording.
(String, Color) ticketStatusChip(String raw) => switch (raw.toUpperCase()) {
      'OPEN' => ('Open', AppColors.info),
      'IN_PROGRESS' => ('In progress', AppColors.primary),
      'WAITING_FOR_OWNER' => ('Needs your reply', AppColors.warning),
      'RESOLVED' => ('Resolved', AppColors.success),
      'CLOSED' => ('Closed', AppColors.inkMuted),
      _ => (raw.isEmpty ? '—' : raw, AppColors.inkMuted),
    };

(String, Color) ticketPriorityChip(String raw) => switch (raw.toUpperCase()) {
      'CRITICAL' => ('Critical', AppColors.danger),
      'HIGH' => ('High', AppColors.warning),
      'NORMAL' => ('Normal', AppColors.inkMuted),
      'LOW' => ('Low', AppColors.inkFaint),
      _ => (raw.isEmpty ? 'Normal' : raw, AppColors.inkMuted),
    };

class _TicketCard extends StatelessWidget {
  const _TicketCard({required this.ticket, required this.onOpen});
  final SupportTicket ticket;
  final VoidCallback onOpen;

  @override
  Widget build(BuildContext context) {
    final (statusLabel, statusColor) = ticketStatusChip(ticket.status);
    final (priorityLabel, priorityColor) = ticketPriorityChip(ticket.priority);
    final when = ticket.updatedAt ?? ticket.createdAt;

    return InkWell(
      borderRadius: BorderRadius.circular(AppRadius.lg),
      onTap: onOpen,
      child: Container(
        padding: const EdgeInsets.all(16),
        decoration: BoxDecoration(
          color: AppColors.surface,
          borderRadius: BorderRadius.circular(AppRadius.lg),
          border: Border.all(color: AppColors.line),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Expanded(
                  child: Text(
                    ticket.subject,
                    style: const TextStyle(
                        fontWeight: FontWeight.w700, fontSize: 15, color: AppColors.ink),
                  ),
                ),
                const SizedBox(width: 8),
                const Icon(Icons.chevron_right, color: AppColors.inkFaint),
              ],
            ),
            const SizedBox(height: 10),
            Wrap(
              spacing: 8,
              runSpacing: 6,
              crossAxisAlignment: WrapCrossAlignment.center,
              children: [
                StatusChip(label: statusLabel, color: statusColor),
                StatusChip(label: priorityLabel, color: priorityColor),
                if (ticket.propertyName.isNotEmpty)
                  Text(
                    ticket.propertyName,
                    style: const TextStyle(color: AppColors.inkMuted, fontSize: 12.5),
                  ),
              ],
            ),
            if (when != null) ...[
              const SizedBox(height: 8),
              Text(
                'Updated ${DateFormat.yMMMd().add_jm().format(when)}',
                style: const TextStyle(color: AppColors.inkFaint, fontSize: 12),
              ),
            ],
          ],
        ),
      ),
    );
  }
}

class _EmptyTickets extends StatelessWidget {
  const _EmptyTickets();
  @override
  Widget build(BuildContext context) {
    return const Center(
      child: Padding(
        padding: EdgeInsets.all(32),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(Icons.forum_outlined, size: 44, color: AppColors.inkFaint),
            SizedBox(height: 12),
            Text('No tickets here',
                style: TextStyle(fontWeight: FontWeight.w700, color: AppColors.ink)),
            SizedBox(height: 6),
            Text(
              'Open a ticket and the Tavelo team will pick it up.',
              textAlign: TextAlign.center,
              style: TextStyle(color: AppColors.inkMuted),
            ),
          ],
        ),
      ),
    );
  }
}
