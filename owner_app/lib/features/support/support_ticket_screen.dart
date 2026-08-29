import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart';

import '../../core/api/api_exception.dart';
import '../../core/data/owner_repository.dart';
import '../../core/models/owner_models.dart';
import '../../theme/app_theme.dart';
import '../../widgets/ui.dart';
import 'support_screen.dart' show ticketPriorityChip, ticketStatusChip;

/// One ticket thread. The backend never sends Tavelo's internal notes, so
/// everything rendered here is customer-facing by construction.
class SupportTicketScreen extends ConsumerStatefulWidget {
  const SupportTicketScreen({super.key, required this.ticketId});
  final String ticketId;

  @override
  ConsumerState<SupportTicketScreen> createState() => _SupportTicketScreenState();
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
      await ref.read(ownerRepositoryProvider).replyToTicket(widget.ticketId, body);
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
    final ticket = ref.watch(ticketProvider(widget.ticketId));
    return Scaffold(
      appBar: AppBar(title: const Text('Ticket')),
      body: ticket.when(
        loading: () => const LoadingView(),
        error: (_, __) => ErrorView(
          message: 'Could not load this ticket.',
          onRetry: () => ref.invalidate(ticketProvider(widget.ticketId)),
        ),
        data: (t) => Column(
          children: [
            _TicketHeader(ticket: t),
            const Divider(height: 1),
            Expanded(
              child: t.messages.isEmpty
                  ? const Center(
                      child: Text('No messages yet.',
                          style: TextStyle(color: AppColors.inkMuted)),
                    )
                  : ListView.builder(
                      padding: const EdgeInsets.fromLTRB(20, 20, 20, 20),
                      itemCount: t.messages.length,
                      itemBuilder: (_, i) => _Bubble(message: t.messages[i]),
                    ),
            ),
            if (t.isClosed)
              const _ClosedNotice()
            else
              _ReplyBox(
                controller: _reply,
                sending: _sending,
                onSend: _send,
              ),
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
    final (statusLabel, statusColor) = ticketStatusChip(ticket.status);
    final (priorityLabel, priorityColor) = ticketPriorityChip(ticket.priority);
    final opened = ticket.createdAt;

    return Container(
      width: double.infinity,
      color: AppColors.surface,
      padding: const EdgeInsets.fromLTRB(20, 16, 20, 16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            ticket.subject,
            style: const TextStyle(
                fontSize: 17, fontWeight: FontWeight.w700, color: AppColors.ink),
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
                Text(ticket.propertyName,
                    style: const TextStyle(color: AppColors.inkMuted, fontSize: 12.5)),
              if (opened != null)
                Text(
                  'Opened ${DateFormat.yMMMd().format(opened)}',
                  style: const TextStyle(color: AppColors.inkFaint, fontSize: 12.5),
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
    final mine = message.mine;
    final when = message.createdAt;
    return Padding(
      padding: const EdgeInsets.only(bottom: 14),
      child: Column(
        crossAxisAlignment: mine ? CrossAxisAlignment.end : CrossAxisAlignment.start,
        children: [
          Container(
            constraints: BoxConstraints(maxWidth: MediaQuery.sizeOf(context).width * 0.82),
            padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
            decoration: BoxDecoration(
              color: mine ? AppColors.primarySoft : AppColors.surface,
              borderRadius: BorderRadius.circular(AppRadius.lg),
              border: Border.all(color: mine ? AppColors.primarySoft : AppColors.line),
            ),
            child: Text(
              message.body,
              style: const TextStyle(color: AppColors.ink, fontSize: 14, height: 1.45),
            ),
          ),
          const SizedBox(height: 4),
          Text(
            when == null
                ? message.authorLabel
                : '${message.authorLabel} · ${DateFormat.MMMd().add_jm().format(when)}',
            style: const TextStyle(color: AppColors.inkFaint, fontSize: 11.5),
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
    return SafeArea(
      top: false,
      child: Container(
        padding: const EdgeInsets.fromLTRB(16, 12, 16, 12),
        decoration: const BoxDecoration(
          color: AppColors.surface,
          border: Border(top: BorderSide(color: AppColors.line)),
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
                decoration: const InputDecoration(
                  hintText: 'Write a reply…',
                  contentPadding: EdgeInsets.symmetric(horizontal: 16, vertical: 12),
                ),
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
                    ? const SizedBox(
                        width: 18,
                        height: 18,
                        child: CircularProgressIndicator(strokeWidth: 2.2, color: Colors.white),
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
        padding: EdgeInsets.all(16),
        child: Banner2(
          icon: Icons.check_circle_outline,
          tone: BannerTone.success,
          text: 'This ticket is closed. Open a new one if you need more help.',
        ),
      ),
    );
  }
}
