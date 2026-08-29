import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart';

import '../../core/api/api_exception.dart';
import '../../core/data/owner_repository.dart';
import '../../core/models/owner_models.dart';
import '../../core/theme/app_colors.dart';
import '../../core/theme/app_spacing.dart';
import '../../core/theme/app_typography.dart';
import '../../core/widgets/cards.dart';
import '../../core/widgets/primitives.dart';
import '../../core/widgets/states.dart';
import '../../core/widgets/status_badge.dart';
import 'support_screen.dart' show ticketPriorityChip, ticketStatusChip;

/// One ticket thread. The backend never sends Tavelo's internal notes, so
/// everything rendered here is customer-facing by construction.
class SupportTicketScreen extends ConsumerStatefulWidget {
  const SupportTicketScreen({super.key, required this.ticketId});
  final String ticketId;

  @override
  ConsumerState<SupportTicketScreen> createState() =>
      _SupportTicketScreenState();
}

class _SupportTicketScreenState extends ConsumerState<SupportTicketScreen> {
  final _reply = TextEditingController();
  bool _sending = false;

  @override
  void dispose() {
    _reply.dispose();
    super.dispose();
  }

  Future<void> _send() async {
    final body = _reply.text.trim();
    if (body.isEmpty) return;
    final messenger = ScaffoldMessenger.of(context);
    setState(() => _sending = true);
    try {
      await ref
          .read(ownerRepositoryProvider)
          .replyToTicket(widget.ticketId, body);
      _reply.clear();
      ref.invalidate(ticketProvider(widget.ticketId));
    } on ApiException catch (e) {
      messenger.showSnackBar(SnackBar(content: Text(e.message)));
    } finally {
      if (mounted) setState(() => _sending = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    final ticket = ref.watch(ticketProvider(widget.ticketId));
    return Scaffold(
      backgroundColor: c.background,
      appBar: AppBar(title: const Text('Ticket')),
      body: ticket.when(
        loading: () => const PageBody(children: [ListSkeleton(rows: 3)]),
        error: (e, __) => PageBody(
          children: [
            ErrorState(
              error: e,
              message: 'Could not load this ticket.',
              onRetry: () => ref.invalidate(ticketProvider(widget.ticketId)),
            ),
          ],
        ),
        data: (t) => Column(
          children: [
            _TicketHeader(ticket: t),
            Container(height: 1, color: c.border),
            Expanded(
              child: t.messages.isEmpty
                  ? const PageBody(
                      children: [
                        EmptyState(
                          icon: Icons.forum_outlined,
                          title: 'No messages yet.',
                        ),
                      ],
                    )
                  : ListView.builder(
                      padding: const EdgeInsets.fromLTRB(
                        Sp.xl,
                        Sp.xl,
                        Sp.xl,
                        Sp.xl,
                      ),
                      itemCount: t.messages.length,
                      itemBuilder: (_, i) => _Bubble(message: t.messages[i]),
                    ),
            ),
            if (t.isClosed)
              const _ClosedNotice()
            else
              _ReplyBox(controller: _reply, sending: _sending, onSend: _send),
          ],
        ),
      ),
    );
  }
}

class _TicketHeader extends StatelessWidget {
  const _TicketHeader({required this.ticket});
  final SupportTicket ticket;

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    final (statusLabel, statusTone) = ticketStatusChip(ticket.status);
    final (priorityLabel, priorityTone) = ticketPriorityChip(ticket.priority);
    final opened = ticket.createdAt;

    return Container(
      width: double.infinity,
      color: c.card,
      padding: const EdgeInsets.fromLTRB(Sp.xl, Sp.lg, Sp.xl, Sp.lg),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            ticket.subject,
            style: AppTypography.display(size: 17, color: c.foreground),
          ),
          const SizedBox(height: 10),
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
              if (opened != null)
                Text(
                  'Opened ${DateFormat.yMMMd().format(opened)}',
                  style: AppTypography.numeric(
                    size: 11.5,
                    color: c.mutedForeground,
                  ),
                ),
            ],
          ),
        ],
      ),
    );
  }
}

class _Bubble extends StatelessWidget {
  const _Bubble({required this.message});
  final TicketMessage message;

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    final mine = message.mine;
    final when = message.createdAt;
    return Padding(
      padding: const EdgeInsets.only(bottom: 14),
      child: Column(
        crossAxisAlignment: mine
            ? CrossAxisAlignment.end
            : CrossAxisAlignment.start,
        children: [
          Container(
            constraints: BoxConstraints(
              maxWidth: MediaQuery.sizeOf(context).width * 0.82,
            ),
            padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
            decoration: BoxDecoration(
              // The owner's own messages carry a tint of the primary rather
              // than a solid pastel, so they stay readable on both themes.
              color: mine ? c.primary.withValues(alpha: 0.12) : c.card,
              borderRadius: R.rLg,
              border: Border.all(
                color: mine ? c.primary.withValues(alpha: 0.3) : c.border,
              ),
            ),
            child: Text(
              message.body,
              style: AppTypography.body(size: 13.5, color: c.foreground),
            ),
          ),
          const SizedBox(height: 4),
          Text(
            when == null
                ? message.authorLabel
                : '${message.authorLabel} · ${DateFormat.MMMd().add_jm().format(when)}',
            style: AppTypography.body(size: 11, color: c.mutedForeground),
          ),
        ],
      ),
    );
  }
}

class _ReplyBox extends StatelessWidget {
  const _ReplyBox({
    required this.controller,
    required this.sending,
    required this.onSend,
  });
  final TextEditingController controller;
  final bool sending;
  final VoidCallback onSend;

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    return SafeArea(
      top: false,
      child: Container(
        padding: const EdgeInsets.fromLTRB(Sp.lg, Sp.md, Sp.lg, Sp.md),
        decoration: BoxDecoration(
          color: c.card,
          border: Border(top: BorderSide(color: c.border)),
        ),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.end,
          children: [
            Expanded(
              child: TextField(
                controller: controller,
                minLines: 1,
                maxLines: 5,
                textInputAction: TextInputAction.newline,
                decoration: const InputDecoration(hintText: 'Write a reply…'),
              ),
            ),
            const SizedBox(width: 10),
            SizedBox(
              width: 48,
              height: 48,
              child: FilledButton(
                onPressed: sending ? null : onSend,
                style: FilledButton.styleFrom(
                  padding: EdgeInsets.zero,
                  minimumSize: const Size(48, 48),
                  shape: const CircleBorder(),
                ),
                child: sending
                    ? SizedBox(
                        width: 18,
                        height: 18,
                        child: CircularProgressIndicator(
                          strokeWidth: 2.2,
                          valueColor: AlwaysStoppedAnimation(
                            c.primaryForeground,
                          ),
                        ),
                      )
                    : const Icon(Icons.send_rounded, size: 20),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _ClosedNotice extends StatelessWidget {
  const _ClosedNotice();
  @override
  Widget build(BuildContext context) {
    return const SafeArea(
      top: false,
      child: Padding(
        padding: EdgeInsets.all(Sp.lg),
        child: NoticeBanner(
          icon: Icons.check_circle_outline,
          tone: NoticeTone.success,
          text: 'This ticket is closed. Open a new one if you need more help.',
        ),
      ),
    );
  }
}
