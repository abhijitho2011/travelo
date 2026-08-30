import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/networking/api_exception.dart';
import '../../../core/permissions/permission_gate.dart';
import '../../../core/permissions/permission_keys.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/theme/app_spacing.dart';
import '../../../core/theme/app_typography.dart';
import '../../../core/widgets/status_badge.dart';
import '../application/board_controllers.dart';
import '../data/task_models.dart';

/// Opens the supervisor's action sheet for a task: assign it to a housekeeping
/// staff member, and — once it is COMPLETED — pass or fail the inspection.
Future<void> showTaskActionSheet(
  BuildContext context,
  WidgetRef ref, {
  required StaffTask task,
  String? roomNumber,
}) {
  return showModalBottomSheet<void>(
    context: context,
    isScrollControlled: true,
    backgroundColor: context.colors.card,
    shape: const RoundedRectangleBorder(
      borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
    ),
    builder: (_) => _TaskActionSheet(task: task, roomNumber: roomNumber),
  );
}

class _TaskActionSheet extends ConsumerStatefulWidget {
  const _TaskActionSheet({required this.task, this.roomNumber});

  final StaffTask task;
  final String? roomNumber;

  @override
  ConsumerState<_TaskActionSheet> createState() => _TaskActionSheetState();
}

class _TaskActionSheetState extends ConsumerState<_TaskActionSheet> {
  final _notes = TextEditingController();
  bool _busy = false;

  @override
  void dispose() {
    _notes.dispose();
    super.dispose();
  }

  Future<void> _run(Future<void> Function() action, String ok) async {
    setState(() => _busy = true);
    try {
      await action();
      if (!mounted) return;
      Navigator.of(context).pop();
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(ok)));
    } on ApiException catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(e.message)));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    final task = widget.task;
    final canInspect = task.status == HkTaskStatus.completed;

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
          Row(
            children: [
              Expanded(
                child: Text(
                  widget.roomNumber != null
                      ? 'Room ${widget.roomNumber}'
                      : task.headline,
                  style: AppTypography.display(size: 20, color: c.foreground),
                ),
              ),
              StatusBadge(tone: task.status.tone, label: task.status.label),
            ],
          ),
          const SizedBox(height: 4),
          Text(
            task.typeLabel,
            style: AppTypography.body(size: 13, color: c.mutedForeground),
          ),
          if (task.guestRequest?.isNotEmpty == true) ...[
            const SizedBox(height: Sp.sm),
            Text(
              'Guest: ${task.guestRequest}',
              style: AppTypography.body(size: 13, color: c.warning),
            ),
          ],
          const SizedBox(height: Sp.lg),

          // ---- Assign ----
          PermissionGate(
            permission: P.taskAssign,
            child: _AssignSection(task: task, busy: _busy, onAssign: (staffId) {
              _run(
                () => ref.read(boardActionsProvider).assign(task.id, staffId),
                'Task assigned',
              );
            }),
          ),

          // ---- Inspect ----
          if (canInspect)
            PermissionGate(
              permission: P.taskInspect,
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  const SizedBox(height: Sp.lg),
                  Text(
                    'Inspection',
                    style: AppTypography.body(
                      size: 14,
                      weight: FontWeight.w700,
                      color: c.foreground,
                    ),
                  ),
                  const SizedBox(height: Sp.sm),
                  TextField(
                    controller: _notes,
                    maxLines: 2,
                    decoration: const InputDecoration(
                      hintText: 'Notes (required to fail)',
                    ),
                  ),
                  const SizedBox(height: Sp.sm),
                  Row(
                    children: [
                      Expanded(
                        child: OutlinedButton.icon(
                          onPressed: _busy
                              ? null
                              : () => _run(
                                    () => ref.read(boardActionsProvider).inspect(
                                          task.id,
                                          pass: false,
                                          notes: _notes.text.trim(),
                                        ),
                                    'Task rejected — a re-clean was raised',
                                  ),
                          style: OutlinedButton.styleFrom(
                            foregroundColor: c.critical,
                          ),
                          icon: const Icon(Icons.close, size: 18),
                          label: const Text('Fail'),
                        ),
                      ),
                      const SizedBox(width: Sp.sm),
                      Expanded(
                        child: FilledButton.icon(
                          onPressed: _busy
                              ? null
                              : () => _run(
                                    () => ref.read(boardActionsProvider).inspect(
                                          task.id,
                                          pass: true,
                                          notes: _notes.text.trim(),
                                        ),
                                    'Passed — room is ready',
                                  ),
                          icon: const Icon(Icons.check, size: 18),
                          label: const Text('Pass'),
                        ),
                      ),
                    ],
                  ),
                ],
              ),
            ),
        ],
      ),
    );
  }
}

class _AssignSection extends ConsumerWidget {
  const _AssignSection({
    required this.task,
    required this.busy,
    required this.onAssign,
  });

  final StaffTask task;
  final bool busy;
  final void Function(String staffId) onAssign;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final c = context.colors;
    final staff = ref.watch(assignableStaffProvider);
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Text(
          task.assigneeName != null
              ? 'Assigned to ${task.assigneeName}'
              : 'Unassigned',
          style: AppTypography.body(
            size: 14,
            weight: FontWeight.w700,
            color: c.foreground,
          ),
        ),
        const SizedBox(height: Sp.sm),
        staff.when(
          loading: () => const LinearProgressIndicator(minHeight: 2),
          error: (_, _) => Text(
            'Could not load staff',
            style: AppTypography.body(size: 12, color: c.mutedForeground),
          ),
          data: (people) => people.isEmpty
              ? Text(
                  'No assignable housekeeping staff',
                  style: AppTypography.body(size: 12, color: c.mutedForeground),
                )
              : Wrap(
                  spacing: Sp.sm,
                  runSpacing: Sp.sm,
                  children: [
                    for (final p in people)
                      ActionChip(
                        label: Text(p.name),
                        onPressed: busy ? null : () => onAssign(p.id),
                      ),
                  ],
                ),
        ),
      ],
    );
  }
}
