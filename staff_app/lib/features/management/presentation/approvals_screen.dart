import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/networking/api_exception.dart';
import '../../../core/permissions/permission_gate.dart';
import '../../../core/permissions/permission_keys.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/theme/app_spacing.dart';
import '../../../core/utils/formatting.dart';
import '../../../core/widgets/cards.dart';
import '../../../core/widgets/primitives.dart';
import '../../../core/widgets/states.dart';
import '../application/management_controllers.dart';
import '../data/management_models.dart';

/// The approval centre. Pending staff created by this GM sit alongside every
/// other approval type, so there is one queue rather than several.
class ApprovalsScreen extends ConsumerWidget {
  const ApprovalsScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final approvals = ref.watch(approvalsProvider);

    return PageBody(
      onRefresh: () => ref.read(approvalsProvider.notifier).refresh(),
      children: [
        const PageHeader(
          eyebrow: 'Management',
          title: 'Approvals',
          subtitle:
              'Everything waiting on your decision — new team members, '
              'discounts, refunds and purchases.',
        ),
        gapSection,
        approvals.when(
          loading: () => const ListSkeleton(rows: 3),
          error: (e, _) => ErrorState(
            error: e,
            onRetry: () => ref.read(approvalsProvider.notifier).refresh(),
          ),
          data: (items) => items.isEmpty
              ? const EmptyState(
                  title: 'The queue is clear',
                  hint: 'New requests will land here as your team raises them.',
                  icon: Icons.task_alt_outlined,
                )
              : Column(
                  children: [
                    for (final item in items)
                      Padding(
                        padding: const EdgeInsets.only(bottom: Sp.md),
                        child: _ApprovalRow(item: item),
                      ),
                  ],
                ),
        ),
      ],
    );
  }
}

class _ApprovalRow extends ConsumerStatefulWidget {
  const _ApprovalRow({required this.item});

  final ApprovalItem item;

  @override
  ConsumerState<_ApprovalRow> createState() => _ApprovalRowState();
}

class _ApprovalRowState extends ConsumerState<_ApprovalRow> {
  bool _busy = false;

  Future<void> _decide({required bool approve}) async {
    String? reason;
    if (!approve) {
      reason = await RejectReasonSheet.show(context, widget.item.title);
      if (reason == null) return; // cancelled
    }
    setState(() => _busy = true);
    try {
      await ref
          .read(approvalsProvider.notifier)
          .decide(widget.item, approve: approve, reason: reason);
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(
            approve
                ? '${widget.item.title} approved'
                : '${widget.item.title} rejected',
          ),
        ),
      );
    } on ApiException catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(
        context,
      ).showSnackBar(SnackBar(content: Text(e.message)));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final item = widget.item;
    return ApprovalCard(
      kindLabel: item.kind.label,
      title: item.title,
      subtitle: item.subtitle,
      meta: [
        if (item.requestedBy != null) item.requestedBy!,
        if (item.requestedAt != null) Fmt.ago(item.requestedAt),
      ].join(' · '),
      amountLabel: item.amount == null ? null : Fmt.money(item.amount),
      icon: switch (item.kind) {
        ApprovalKind.staff => Icons.person_add_alt_outlined,
        ApprovalKind.discount => Icons.percent_outlined,
        ApprovalKind.refund => Icons.undo_outlined,
        ApprovalKind.purchase => Icons.shopping_cart_outlined,
        ApprovalKind.expense => Icons.receipt_long_outlined,
        ApprovalKind.leave => Icons.event_busy_outlined,
        ApprovalKind.other => Icons.fact_check_outlined,
      },
      // A staff approval needs `staff.approve`; anything else needs
      // `approval.act`. Without the right key the buttons are not rendered at
      // all — the row stays informational.
      actions: PermissionGate(
        permission: item.kind == ApprovalKind.staff
            ? P.staffApprove
            : P.approvalAct,
        fallback: const PermissionNote(
          text: 'Only a manager with approval rights can action this.',
        ),
        child: Row(
          children: [
            Expanded(
              child: OutlinedButton(
                onPressed: _busy ? null : () => _decide(approve: false),
                child: const Text('Reject'),
              ),
            ),
            const SizedBox(width: Sp.sm),
            Expanded(
              child: FilledButton(
                onPressed: _busy ? null : () => _decide(approve: true),
                child: _busy
                    ? const SizedBox(
                        width: 16,
                        height: 16,
                        child: CircularProgressIndicator(strokeWidth: 2),
                      )
                    : const Text('Approve'),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

/// Rejecting always asks why — the reason travels with the decision so the
/// person on the other end is not left guessing.
class RejectReasonSheet extends StatefulWidget {
  const RejectReasonSheet({super.key, required this.subject});

  final String subject;

  static Future<String?> show(BuildContext context, String subject) =>
      showModalBottomSheet<String>(
        context: context,
        isScrollControlled: true,
        builder: (_) => Padding(
          padding: EdgeInsets.only(
            bottom: MediaQuery.viewInsetsOf(context).bottom,
          ),
          child: RejectReasonSheet(subject: subject),
        ),
      );

  @override
  State<RejectReasonSheet> createState() => _RejectReasonSheetState();
}

class _RejectReasonSheetState extends State<RejectReasonSheet> {
  final _controller = TextEditingController();
  String? _error;

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  void _submit() {
    final text = _controller.text.trim();
    if (text.isEmpty) {
      setState(() => _error = 'Please give a short reason');
      return;
    }
    Navigator.of(context).pop(text);
  }

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    return SafeArea(
      child: Padding(
        padding: const EdgeInsets.fromLTRB(Sp.lg, 0, Sp.lg, Sp.lg),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Text(
              'Reject ${widget.subject}',
              style: Theme.of(context).textTheme.headlineSmall,
            ),
            const SizedBox(height: 4),
            Text(
              'Say why. The reason is recorded and shared with whoever raised '
              'the request.',
              style: Theme.of(
                context,
              ).textTheme.bodySmall?.copyWith(color: c.mutedForeground),
            ),
            const SizedBox(height: Sp.lg),
            TextField(
              controller: _controller,
              autofocus: true,
              maxLines: 3,
              textCapitalization: TextCapitalization.sentences,
              decoration: InputDecoration(
                hintText: 'Reason for rejecting',
                errorText: _error,
              ),
              onChanged: (_) {
                if (_error != null) setState(() => _error = null);
              },
            ),
            const SizedBox(height: Sp.lg),
            Row(
              children: [
                Expanded(
                  child: OutlinedButton(
                    onPressed: () => Navigator.of(context).pop(),
                    child: const Text('Cancel'),
                  ),
                ),
                const SizedBox(width: Sp.sm),
                Expanded(
                  child: FilledButton(
                    onPressed: _submit,
                    child: const Text('Reject'),
                  ),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }
}
