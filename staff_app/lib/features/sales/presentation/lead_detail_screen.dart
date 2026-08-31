import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/networking/api_exception.dart';
import '../../../core/permissions/permission_gate.dart';
import '../../../core/permissions/permission_keys.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/theme/app_spacing.dart';
import '../../../core/theme/app_typography.dart';
import '../../../core/utils/formatting.dart';
import '../../../core/widgets/primitives.dart';
import '../../../core/widgets/states.dart';
import '../../../core/widgets/status_badge.dart';
import '../application/sales_controllers.dart';
import '../data/sales_models.dart';

/// A lead with its activity timeline; move stage and log activities here.
class LeadDetailScreen extends ConsumerWidget {
  const LeadDetailScreen({super.key, required this.leadId});

  final String leadId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final lead = ref.watch(leadProvider(leadId));
    return Scaffold(
      appBar: AppBar(title: const Text('Lead')),
      floatingActionButton: ref.hasPermission(P.activityCreate)
          ? FloatingActionButton.extended(
              onPressed: () => _ActivitySheet.show(context, ref, leadId),
              icon: const Icon(Icons.add_comment_outlined),
              label: const Text('Log activity'),
            )
          : null,
      body: lead.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (e, _) => ErrorState(
          error: e,
          onRetry: () => ref.invalidate(leadProvider(leadId)),
        ),
        data: (l) => l == null
            ? const EmptyState(
                title: 'Lead not found',
                icon: Icons.help_outline,
              )
            : _LeadDetail(lead: l),
      ),
    );
  }
}

class _LeadDetail extends ConsumerWidget {
  const _LeadDetail({required this.lead});
  final Lead lead;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final c = context.colors;
    final l = lead;
    return PageBody(
      children: [
        Row(
          children: [
            Expanded(
              child: Text(
                l.name,
                style: AppTypography.display(size: 22, color: c.foreground),
              ),
            ),
            StatusBadge(tone: l.stage.tone, label: l.stage.label),
          ],
        ),
        if (l.company != null) ...[
          const SizedBox(height: 4),
          Text(
            l.company!,
            style: AppTypography.body(size: 13.5, color: c.mutedForeground),
          ),
        ],
        gapMd,
        Panel(
          title: 'Details',
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              _row(context, 'Value', l.valueLabel),
              if (l.contact != null) _row(context, 'Contact', l.contact!),
              if (l.source != null) _row(context, 'Source', l.source!),
              if (l.notes != null) _row(context, 'Notes', l.notes!),
            ],
          ),
        ),
        gapMd,
        if (l.stage.nextStages.isNotEmpty && ref.hasPermission(P.leadUpdate))
          Panel(
            title: 'Move stage',
            child: Wrap(
              spacing: Sp.sm,
              runSpacing: Sp.sm,
              children: [
                for (final stage in l.stage.nextStages)
                  OutlinedButton(
                    onPressed: () async {
                      final messenger = ScaffoldMessenger.of(context);
                      try {
                        await ref
                            .read(salesActionsProvider)
                            .moveStage(l.id, stage);
                      } on ApiException catch (e) {
                        messenger.showSnackBar(
                          SnackBar(content: Text(e.message)),
                        );
                      }
                    },
                    child: Text(stage.label),
                  ),
              ],
            ),
          ),
        gapSection,
        SectionHeader(title: 'Activity'),
        if (l.activities.isEmpty)
          const EmptyState(
            title: 'No activity yet',
            hint: 'Log a call, email, meeting or note.',
            icon: Icons.forum_outlined,
          )
        else
          Column(
            children: [
              for (final a in l.activities)
                Padding(
                  padding: const EdgeInsets.only(bottom: Sp.sm),
                  child: SoftCard(
                    padding: const EdgeInsets.all(12),
                    child: Row(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Icon(a.type.icon, size: 18, color: c.mutedForeground),
                        const SizedBox(width: 10),
                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(
                                '${a.type.label} · ${Fmt.ago(a.at)}',
                                style: AppTypography.body(
                                  size: 12.5,
                                  weight: FontWeight.w600,
                                  color: c.foreground,
                                ),
                              ),
                              if (a.note != null) ...[
                                const SizedBox(height: 2),
                                Text(
                                  a.note!,
                                  style: AppTypography.body(
                                    size: 12.5,
                                    color: c.mutedForeground,
                                  ),
                                ),
                              ],
                            ],
                          ),
                        ),
                      ],
                    ),
                  ),
                ),
            ],
          ),
      ],
    );
  }

  Widget _row(BuildContext context, String label, String value) {
    final c = context.colors;
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 5),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          SizedBox(
            width: 72,
            child: Text(
              label,
              style: AppTypography.body(size: 12.5, color: c.mutedForeground),
            ),
          ),
          Expanded(
            child: Text(
              value,
              style: AppTypography.body(size: 13.5, color: c.foreground),
            ),
          ),
        ],
      ),
    );
  }
}

class _ActivitySheet extends ConsumerStatefulWidget {
  const _ActivitySheet({required this.leadId});
  final String leadId;

  static Future<void> show(
    BuildContext context,
    WidgetRef ref,
    String leadId,
  ) => showModalBottomSheet<void>(
    context: context,
    isScrollControlled: true,
    showDragHandle: true,
    builder: (_) => _ActivitySheet(leadId: leadId),
  );

  @override
  ConsumerState<_ActivitySheet> createState() => _ActivitySheetState();
}

class _ActivitySheetState extends ConsumerState<_ActivitySheet> {
  SalesActivityType _type = SalesActivityType.call;
  final _note = TextEditingController();
  bool _busy = false;
  String? _error;

  @override
  void dispose() {
    _note.dispose();
    super.dispose();
  }

  Future<void> _save() async {
    setState(() {
      _busy = true;
      _error = null;
    });
    final navigator = Navigator.of(context);
    try {
      await ref.read(salesActionsProvider).logActivity(widget.leadId, {
        'type': _type.wire,
        if (_note.text.trim().isNotEmpty) 'note': _note.text.trim(),
      });
      navigator.pop();
    } on ApiException catch (e) {
      setState(() {
        _busy = false;
        _error = e.message;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: EdgeInsets.only(
        left: Sp.lg,
        right: Sp.lg,
        top: Sp.md,
        bottom: MediaQuery.viewInsetsOf(context).bottom + Sp.lg,
      ),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Text('Log activity', style: Theme.of(context).textTheme.titleMedium),
          const SizedBox(height: Sp.md),
          DropdownButtonFormField<SalesActivityType>(
            initialValue: _type,
            decoration: const InputDecoration(labelText: 'Type'),
            items: [
              for (final t in SalesActivityType.values)
                DropdownMenuItem(value: t, child: Text(t.label)),
            ],
            onChanged: (v) => setState(() => _type = v ?? _type),
          ),
          const SizedBox(height: Sp.md),
          TextField(
            controller: _note,
            decoration: const InputDecoration(labelText: 'Note (optional)'),
            maxLines: 3,
          ),
          if (_error != null) ...[
            const SizedBox(height: Sp.md),
            Text(
              _error!,
              style: TextStyle(color: Theme.of(context).colorScheme.error),
            ),
          ],
          const SizedBox(height: Sp.lg),
          FilledButton(
            onPressed: _busy ? null : _save,
            child: _busy
                ? const SizedBox(
                    height: 18,
                    width: 18,
                    child: CircularProgressIndicator(strokeWidth: 2),
                  )
                : const Text('Log'),
          ),
        ],
      ),
    );
  }
}
