import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/networking/api_exception.dart';
import '../../../core/permissions/permission_gate.dart';
import '../../../core/permissions/permission_keys.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/theme/app_spacing.dart';
import '../../../core/theme/app_typography.dart';
import '../../../core/widgets/primitives.dart';
import '../../../core/widgets/states.dart';
import '../../../core/widgets/status_badge.dart';
import '../application/work_orders_controllers.dart';
import '../data/work_order_models.dart';

/// One work order, with the technician's lifecycle buttons (each gated on its
/// own permission), a completion form (resolution + parts), and — for a
/// supervisor — cancel.
class WorkOrderDetailScreen extends ConsumerStatefulWidget {
  const WorkOrderDetailScreen({super.key, required this.id});

  final String id;

  @override
  ConsumerState<WorkOrderDetailScreen> createState() =>
      _WorkOrderDetailScreenState();
}

class _WorkOrderDetailScreenState extends ConsumerState<WorkOrderDetailScreen> {
  bool _busy = false;

  String _permFor(WoAction a) => switch (a) {
    WoAction.accept => P.workOrderAccept,
    WoAction.start => P.workOrderStart,
    WoAction.pause => P.workOrderPause,
    WoAction.resume => P.workOrderResume,
    WoAction.complete => P.workOrderComplete,
  };

  Future<void> _run(Future<void> Function() action, String ok) async {
    setState(() => _busy = true);
    try {
      await action();
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(ok)));
    } on ApiException catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(e.message)));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _act(WoAction a) => _run(
    () => ref.read(workOrderActionsProvider).act(widget.id, a),
    '${a.label} done',
  );

  Future<void> _complete() async {
    final result = await showModalBottomSheet<_CompletePayload>(
      context: context,
      isScrollControlled: true,
      backgroundColor: context.colors.card,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
      ),
      builder: (_) => const _CompleteSheet(),
    );
    if (result == null) return;
    await _run(
      () => ref.read(workOrderActionsProvider).act(
            widget.id,
            WoAction.complete,
            resolution: result.resolution,
            partsUsed: result.parts,
          ),
      'Work order completed',
    );
  }

  Future<void> _cancel() async {
    final controller = TextEditingController();
    final reason = await showDialog<String>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Cancel work order'),
        content: TextField(
          controller: controller,
          autofocus: true,
          decoration: const InputDecoration(hintText: 'Reason'),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(ctx).pop(),
            child: const Text('Keep'),
          ),
          FilledButton(
            onPressed: () => Navigator.of(ctx).pop(controller.text.trim()),
            child: const Text('Cancel order'),
          ),
        ],
      ),
    );
    if (reason == null || reason.isEmpty) return;
    await _run(
      () => ref.read(workOrderActionsProvider).cancel(widget.id, reason),
      'Work order cancelled',
    );
  }

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    final order = ref.watch(workOrderProvider(widget.id));

    return PageBody(
      children: [
        Align(
          alignment: Alignment.centerLeft,
          child: TextButton.icon(
            onPressed: () => context.pop(),
            icon: const Icon(Icons.arrow_back, size: 16),
            label: const Text('Back'),
          ),
        ),
        order.when(
          loading: () => const ListSkeleton(rows: 3, height: 110),
          error: (e, _) => ErrorState(
            error: e,
            onRetry: () => ref.invalidate(workOrderProvider(widget.id)),
          ),
          data: (wo) => wo == null
              ? const EmptyState(
                  title: 'Work order not found',
                  hint: 'It may have been cancelled or belongs to another hotel.',
                  icon: Icons.search_off_outlined,
                )
              : Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    SoftCard(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Row(
                            children: [
                              Expanded(
                                child: Text(
                                  wo.title,
                                  style: AppTypography.display(
                                    size: 20,
                                    color: c.foreground,
                                  ),
                                ),
                              ),
                              StatusBadge(
                                tone: wo.status.tone,
                                label: wo.status.label,
                              ),
                            ],
                          ),
                          const SizedBox(height: 4),
                          Text(
                            [
                              wo.number,
                              if (wo.roomNumber != null) 'Room ${wo.roomNumber}',
                            ].join(' · '),
                            style: AppTypography.numeric(
                              size: 12.5,
                              color: c.mutedForeground,
                            ),
                          ),
                          const SizedBox(height: Sp.sm),
                          Wrap(
                            spacing: Sp.sm,
                            runSpacing: Sp.sm,
                            children: [
                              StatusBadge(
                                tone: wo.priority.tone,
                                label: '${wo.priority.label} priority',
                                dense: true,
                              ),
                              if (wo.takesRoomOutOfService)
                                const StatusBadge(
                                  tone: StatusTone.maintenance,
                                  label: 'Takes room off-board',
                                  dense: true,
                                ),
                            ],
                          ),
                          if (wo.description?.isNotEmpty == true) ...[
                            const SizedBox(height: Sp.md),
                            Text(
                              wo.description!,
                              style: AppTypography.body(
                                size: 13.5,
                                color: c.foreground,
                              ),
                            ),
                          ],
                          if (wo.reporterName != null) ...[
                            const SizedBox(height: Sp.sm),
                            Text(
                              'Reported by ${wo.reporterName}',
                              style: AppTypography.body(
                                size: 12,
                                color: c.mutedForeground,
                              ),
                            ),
                          ],
                          if (wo.resolution?.isNotEmpty == true) ...[
                            const SizedBox(height: Sp.md),
                            const RowDivider(),
                            const SizedBox(height: Sp.md),
                            const LabelXs('Resolution'),
                            Text(
                              wo.resolution!,
                              style: AppTypography.body(
                                size: 13.5,
                                color: c.foreground,
                              ),
                            ),
                            if (wo.partsUsed.isNotEmpty)
                              Padding(
                                padding: const EdgeInsets.only(top: Sp.sm),
                                child: Text(
                                  'Parts: ${wo.partsUsed.map((p) => p.qty != null ? '${p.name} ×${p.qty}' : p.name).join(', ')}',
                                  style: AppTypography.body(
                                    size: 12.5,
                                    color: c.mutedForeground,
                                  ),
                                ),
                              ),
                          ],
                          if (wo.cancelReason?.isNotEmpty == true) ...[
                            const SizedBox(height: Sp.md),
                            Text(
                              'Cancelled: ${wo.cancelReason}',
                              style: AppTypography.body(
                                size: 12.5,
                                color: c.critical,
                              ),
                            ),
                          ],
                        ],
                      ),
                    ),
                    gapSection,
                    // Lifecycle buttons, each gated per permission.
                    for (final action in wo.actions)
                      Padding(
                        padding: const EdgeInsets.only(bottom: Sp.sm),
                        child: PermissionGate(
                          permission: _permFor(action),
                          mode: GateMode.hide,
                          child: SizedBox(
                            height: 50,
                            child: action == WoAction.complete
                                ? FilledButton.icon(
                                    onPressed: _busy ? null : _complete,
                                    icon: const Icon(Icons.task_alt, size: 19),
                                    label: const Text('Complete'),
                                  )
                                : FilledButton.tonalIcon(
                                    onPressed: _busy ? null : () => _act(action),
                                    icon: Icon(_iconFor(action), size: 19),
                                    label: Text(action.label),
                                  ),
                          ),
                        ),
                      ),
                    if (!wo.status.isTerminal)
                      PermissionGate(
                        permission: P.workOrderCancel,
                        mode: GateMode.hide,
                        child: SizedBox(
                          height: 50,
                          child: OutlinedButton.icon(
                            onPressed: _busy ? null : _cancel,
                            style: OutlinedButton.styleFrom(
                              foregroundColor: c.critical,
                            ),
                            icon: const Icon(Icons.cancel_outlined, size: 19),
                            label: const Text('Cancel work order'),
                          ),
                        ),
                      ),
                  ],
                ),
        ),
      ],
    );
  }

  IconData _iconFor(WoAction a) => switch (a) {
    WoAction.accept => Icons.how_to_reg_outlined,
    WoAction.start => Icons.play_arrow,
    WoAction.pause => Icons.pause,
    WoAction.resume => Icons.play_arrow,
    WoAction.complete => Icons.task_alt,
  };
}

class _CompletePayload {
  const _CompletePayload(this.resolution, this.parts);
  final String resolution;
  final List<WorkOrderPart> parts;
}

/// The completion form: a required resolution and an optional free-text parts
/// list (one "name xqty" per line).
class _CompleteSheet extends StatefulWidget {
  const _CompleteSheet();

  @override
  State<_CompleteSheet> createState() => _CompleteSheetState();
}

class _CompleteSheetState extends State<_CompleteSheet> {
  final _resolution = TextEditingController();
  final _parts = TextEditingController();
  String? _error;

  @override
  void dispose() {
    _resolution.dispose();
    _parts.dispose();
    super.dispose();
  }

  List<WorkOrderPart> _parseParts() {
    final out = <WorkOrderPart>[];
    for (final line in _parts.text.split('\n')) {
      final trimmed = line.trim();
      if (trimmed.isEmpty) continue;
      final m = RegExp(r'^(.*?)(?:\s*[x×]\s*(\d+))?$').firstMatch(trimmed);
      final name = (m?.group(1) ?? trimmed).trim();
      final qty = int.tryParse(m?.group(2) ?? '');
      if (name.isNotEmpty) out.add(WorkOrderPart(name: name, qty: qty));
    }
    return out;
  }

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    return Padding(
      padding: EdgeInsets.only(
        left: Sp.lg,
        right: Sp.lg,
        top: Sp.lg,
        bottom: MediaQuery.viewInsetsOf(context).bottom + Sp.lg,
      ),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Text(
            'Complete work order',
            style: AppTypography.display(size: 19, color: c.foreground),
          ),
          const SizedBox(height: Sp.md),
          TextField(
            controller: _resolution,
            maxLines: 3,
            textCapitalization: TextCapitalization.sentences,
            decoration: InputDecoration(
              labelText: 'Resolution (required)',
              errorText: _error,
              hintText: 'What was done to fix it?',
            ),
          ),
          const SizedBox(height: Sp.md),
          TextField(
            controller: _parts,
            maxLines: 3,
            decoration: const InputDecoration(
              labelText: 'Parts used (optional)',
              hintText: 'One per line, e.g. "tap washer x2"',
            ),
          ),
          const SizedBox(height: Sp.lg),
          SizedBox(
            height: 50,
            child: FilledButton(
              onPressed: () {
                final res = _resolution.text.trim();
                if (res.isEmpty) {
                  setState(() => _error = 'A resolution is required');
                  return;
                }
                Navigator.of(context).pop(_CompletePayload(res, _parseParts()));
              },
              child: const Text('Complete'),
            ),
          ),
        ],
      ),
    );
  }
}
