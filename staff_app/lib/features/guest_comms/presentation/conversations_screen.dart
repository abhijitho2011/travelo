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
import '../application/guest_comms_controllers.dart';

final _when = DateFormat('d MMM HH:mm');

/// **Conversations** — every guest thread, unread first.
class ConversationsScreen extends ConsumerWidget {
  const ConversationsScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final c = context.colors;
    final list = ref.watch(conversationsProvider);
    return PageBody(
      onRefresh: () async => ref.invalidate(conversationsProvider),
      children: [
        const PageHeader(eyebrow: 'Guests', title: 'Conversations'),
        gapSection,
        list.when(
          loading: () => const ListSkeleton(rows: 4),
          error: (e, _) => ErrorState(
            error: e,
            onRetry: () => ref.invalidate(conversationsProvider),
          ),
          data: (items) => items.isEmpty
              ? const EmptyState(
                  title: 'No conversations yet',
                  hint:
                      'Write to a guest from their booking; replies and automated messages land here.',
                  icon: Icons.forum_outlined,
                )
              : SoftCard(
                  padding: EdgeInsets.zero,
                  child: Column(
                    children: [
                      for (var i = 0; i < items.length; i++) ...[
                        if (i > 0) const RowDivider(),
                        ListTile(
                          leading: CircleAvatar(
                            backgroundColor: items[i].unreadCount > 0
                                ? c.primary
                                : c.muted,
                            child: Text(
                              items[i].title.isEmpty
                                  ? '?'
                                  : items[i].title[0].toUpperCase(),
                              style: TextStyle(
                                color: items[i].unreadCount > 0
                                    ? c.primaryForeground
                                    : c.foreground,
                              ),
                            ),
                          ),
                          title: Text(
                            items[i].title,
                            style: AppTypography.body(
                              size: 13.5,
                              weight: items[i].unreadCount > 0
                                  ? FontWeight.w700
                                  : FontWeight.w500,
                              color: c.foreground,
                            ),
                          ),
                          subtitle: Text(
                            items[i].lastPreview ?? '',
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                            style: AppTypography.body(
                              size: 11.5,
                              color: c.mutedForeground,
                            ),
                          ),
                          trailing: Column(
                            mainAxisAlignment: MainAxisAlignment.center,
                            crossAxisAlignment: CrossAxisAlignment.end,
                            children: [
                              if (items[i].lastMessageAt != null)
                                Text(
                                  _when.format(
                                    items[i].lastMessageAt!.toLocal(),
                                  ),
                                  style: AppTypography.body(
                                    size: 10.5,
                                    color: c.mutedForeground,
                                  ),
                                ),
                              if (items[i].unreadCount > 0)
                                Container(
                                  margin: const EdgeInsets.only(top: 4),
                                  padding: const EdgeInsets.symmetric(
                                    horizontal: 7,
                                    vertical: 1,
                                  ),
                                  decoration: BoxDecoration(
                                    color: c.primary,
                                    borderRadius: R.rPill,
                                  ),
                                  child: Text(
                                    '${items[i].unreadCount}',
                                    style: AppTypography.body(
                                      size: 10,
                                      weight: FontWeight.w700,
                                      color: c.primaryForeground,
                                    ),
                                  ),
                                ),
                            ],
                          ),
                          onTap: () =>
                              context.go(Routes.conversation(items[i].id)),
                        ),
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

/// One thread: the messages, and a composer that picks the channel.
class ConversationThreadScreen extends ConsumerStatefulWidget {
  const ConversationThreadScreen({super.key, required this.conversationId});
  final String conversationId;
  @override
  ConsumerState<ConversationThreadScreen> createState() => _ThreadState();
}

class _ThreadState extends ConsumerState<ConversationThreadScreen> {
  final _body = TextEditingController();
  String _channel = 'SMS';
  bool _busy = false;

  @override
  void dispose() {
    _body.dispose();
    super.dispose();
  }

  Future<void> _send() async {
    final text = _body.text.trim();
    if (text.isEmpty) return;
    setState(() => _busy = true);
    final messenger = ScaffoldMessenger.of(context);
    try {
      await ref
          .read(guestCommsActionsProvider)
          .send(widget.conversationId, channel: _channel, body: text);
      _body.clear();
    } on ApiException catch (e) {
      messenger.showSnackBar(SnackBar(content: Text(e.message)));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    final thread = ref.watch(conversationThreadProvider(widget.conversationId));
    return Scaffold(
      appBar: AppBar(
        title: Text(thread.valueOrNull?.conversation.title ?? 'Conversation'),
      ),
      body: Column(
        children: [
          Expanded(
            child: thread.when(
              loading: () => const Center(child: CircularProgressIndicator()),
              error: (e, _) => ErrorState(
                error: e,
                onRetry: () => ref.invalidate(
                  conversationThreadProvider(widget.conversationId),
                ),
              ),
              data: (t) => ListView.builder(
                padding: const EdgeInsets.all(Sp.md),
                reverse: true,
                itemCount: t.messages.length,
                itemBuilder: (_, i) {
                  final m = t.messages[t.messages.length - 1 - i];
                  final mine = !m.inbound;
                  return Align(
                    alignment: mine
                        ? Alignment.centerRight
                        : Alignment.centerLeft,
                    child: Container(
                      constraints: const BoxConstraints(maxWidth: 420),
                      margin: const EdgeInsets.symmetric(vertical: 4),
                      padding: const EdgeInsets.symmetric(
                        horizontal: Sp.md,
                        vertical: Sp.sm,
                      ),
                      decoration: BoxDecoration(
                        color: m.channel == 'INTERNAL'
                            ? c.warning.withValues(alpha: 0.12)
                            : mine
                            ? c.primary.withValues(alpha: 0.12)
                            : c.muted,
                        borderRadius: R.rMd,
                      ),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            m.body,
                            style: AppTypography.body(
                              size: 13,
                              color: c.foreground,
                            ),
                          ),
                          const SizedBox(height: 2),
                          Text(
                            '${m.channel == 'INTERNAL' ? 'Internal note' : m.channel} · ${m.origin == 'AUTOMATION' ? 'auto · ' : ''}${m.status.toLowerCase()}${m.createdAt == null ? '' : ' · ${_when.format(m.createdAt!.toLocal())}'}',
                            style: AppTypography.body(
                              size: 10,
                              color: c.mutedForeground,
                            ),
                          ),
                        ],
                      ),
                    ),
                  );
                },
              ),
            ),
          ),
          PermissionGate(
            permission: P.conversationSend,
            child: SafeArea(
              top: false,
              child: Padding(
                padding: const EdgeInsets.fromLTRB(Sp.md, Sp.sm, Sp.md, Sp.md),
                child: Column(
                  children: [
                    Wrap(
                      spacing: Sp.sm,
                      children: [
                        for (final ch in const [
                          'SMS',
                          'WHATSAPP',
                          'EMAIL',
                          'INTERNAL',
                        ])
                          ChoiceChip(
                            label: Text(
                              ch == 'INTERNAL' ? 'Internal note' : ch,
                            ),
                            selected: _channel == ch,
                            onSelected: (_) => setState(() => _channel = ch),
                          ),
                      ],
                    ),
                    const SizedBox(height: Sp.sm),
                    Row(
                      children: [
                        Expanded(
                          child: TextField(
                            controller: _body,
                            minLines: 1,
                            maxLines: 4,
                            decoration: InputDecoration(
                              hintText: _channel == 'INTERNAL'
                                  ? 'A note the guest never sees'
                                  : 'Message the guest',
                            ),
                          ),
                        ),
                        const SizedBox(width: Sp.sm),
                        IconButton.filled(
                          onPressed: _busy ? null : _send,
                          icon: const Icon(Icons.send),
                        ),
                      ],
                    ),
                  ],
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }
}
