import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/networking/api_exception.dart';
import '../../../core/permissions/permission_gate.dart';
import '../../../core/permissions/permission_keys.dart';
import '../../../core/routing/routes.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/theme/app_spacing.dart';
import '../../../core/theme/app_typography.dart';
import '../../../core/utils/formatting.dart';
import '../../../core/widgets/primitives.dart';
import '../../../core/widgets/states.dart';
import '../../../core/widgets/status_badge.dart';
import '../application/task_controller.dart';
import '../data/task_models.dart';

/// One task, with the big buttons an attendant needs, a guest-request callout,
/// and a note field used on completion or when reporting an issue.
class TaskDetailScreen extends ConsumerStatefulWidget {
  const TaskDetailScreen({super.key, required this.taskId});

  final String taskId;

  @override
  ConsumerState<TaskDetailScreen> createState() => _TaskDetailScreenState();
}

class _TaskDetailScreenState extends ConsumerState<TaskDetailScreen> {
  final _note = TextEditingController();
  bool _busy = false;

  @override
  void dispose() {
    _note.dispose();
    super.dispose();
  }

  Future<void> _advance(StaffTask task) async {
    setState(() => _busy = true);
    try {
      final synced = await ref
          .read(myTasksProvider.notifier)
          .advance(
            task,
            notes: _note.text.trim().isEmpty ? null : _note.text.trim(),
          );
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(
            synced
                ? 'Task updated'
                : 'Saved on this device — it will sync when you are back online',
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

  Future<void> _reportIssue(StaffTask task) async {
    final description = _note.text.trim();
    if (description.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('Add a short note describing the problem first'),
        ),
      );
      return;
    }
    setState(() => _busy = true);
    try {
      final synced = await ref
          .read(myTasksProvider.notifier)
          .reportIssue(task, description: description);
      if (!mounted) return;
      _note.clear();
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(
            synced
                ? 'Work order raised for maintenance'
                : 'Saved on this device — it will be sent when you are online',
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
    final c = context.colors;
    final tasks = ref.watch(myTasksProvider);
    final task = tasks.value == null
        ? null
        : ref.read(myTasksProvider.notifier).byId(widget.taskId);

    return PageBody(
      children: [
        Align(
          alignment: Alignment.centerLeft,
          child: TextButton.icon(
            onPressed: () => context.go(Routes.myTasks),
            icon: const Icon(Icons.arrow_back, size: 16),
            label: const Text('My tasks'),
          ),
        ),
        if (tasks.isLoading)
          const ListSkeleton(rows: 2, height: 110)
        else if (task == null)
          const EmptyState(
            title: 'Task not found',
            hint: 'It may already be finished, or reassigned to someone else.',
            icon: Icons.search_off_outlined,
          )
        else ...[
          SoftCard(
            accent: task.priority == HkPriority.high ? c.critical : null,
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            task.headline,
                            style: AppTypography.kpi(
                              size: 40,
                              color: c.foreground,
                            ),
                          ),
                          const SizedBox(height: 8),
                          Text(
                            task.typeLabel,
                            style: AppTypography.body(
                              size: 15,
                              weight: FontWeight.w600,
                              color: c.foreground,
                            ),
                          ),
                        ],
                      ),
                    ),
                    Column(
                      crossAxisAlignment: CrossAxisAlignment.end,
                      children: [
                        StatusBadge(
                          tone: task.pendingSync
                              ? StatusTone.warning
                              : task.status.tone,
                          label: task.pendingSync
                              ? 'Waiting to sync'
                              : task.status.label,
                        ),
                        if (task.priority == HkPriority.high)
                          const Padding(
                            padding: EdgeInsets.only(top: 6),
                            child: StatusBadge(
                              tone: StatusTone.critical,
                              label: 'High priority',
                              dense: true,
                            ),
                          ),
                      ],
                    ),
                  ],
                ),
                const SizedBox(height: Sp.md),
                const RowDivider(),
                const SizedBox(height: Sp.md),
                _Meta(
                  icon: Icons.stairs_outlined,
                  label: 'Floor',
                  value: task.floor?.isNotEmpty == true
                      ? task.floor!
                      : Fmt.dash,
                ),
                _Meta(
                  icon: Icons.schedule,
                  label: 'Due',
                  value: Fmt.time(task.dueAt),
                ),
                _Meta(
                  icon: Icons.person_outline,
                  label: 'Assigned to',
                  value: task.assigneeName ?? 'You',
                ),
                if (task.guestRequest != null &&
                    task.guestRequest!.isNotEmpty) ...[
                  const SizedBox(height: Sp.sm),
                  Container(
                    padding: const EdgeInsets.all(Sp.md),
                    decoration: BoxDecoration(
                      color: c.warning.withValues(alpha: 0.1),
                      borderRadius: R.rMd,
                      border: Border.all(
                        color: c.warning.withValues(alpha: 0.3),
                      ),
                    ),
                    child: Row(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Icon(
                          Icons.record_voice_over_outlined,
                          size: 17,
                          color: c.warning,
                        ),
                        const SizedBox(width: Sp.sm),
                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              const LabelXs('Guest request'),
                              Text(
                                task.guestRequest!,
                                style: AppTypography.body(
                                  size: 13.5,
                                  color: c.foreground,
                                ),
                              ),
                            ],
                          ),
                        ),
                      ],
                    ),
                  ),
                ],
              ],
            ),
          ),
          gapMd,

          Panel(
            title: 'Add a note',
            description: 'Recorded on completion, or as the issue you report.',
            child: TextField(
              controller: _note,
              maxLines: 3,
              textCapitalization: TextCapitalization.sentences,
              decoration: const InputDecoration(
                hintText: 'What did you find? What did you do?',
              ),
            ),
          ),

          gapSection,
          if (task.status.attendantAction != null)
            PermissionGate.all(
              permissions: const [P.taskStart, P.taskComplete],
              mode: GateMode.disable,
              child: SizedBox(
                height: 52,
                child: FilledButton.icon(
                  onPressed: _busy ? null : () => _advance(task),
                  icon: Icon(
                    task.status == HkTaskStatus.inProgress
                        ? Icons.check_circle_outline
                        : Icons.play_arrow,
                    size: 20,
                  ),
                  label: Text(
                    task.status.actionLabel,
                    style: AppTypography.body(size: 15, weight: FontWeight.w700),
                  ),
                ),
              ),
            ),
          gapSm,
          PermissionGate(
            permission: P.maintenanceReport,
            child: SizedBox(
              height: 52,
              child: OutlinedButton.icon(
                onPressed: _busy ? null : () => _reportIssue(task),
                style: OutlinedButton.styleFrom(foregroundColor: c.warning),
                icon: const Icon(Icons.report_gmailerrorred_outlined, size: 20),
                label: Text(
                  'Report an issue',
                  style: AppTypography.body(size: 15, weight: FontWeight.w700),
                ),
              ),
            ),
          ),
        ],
      ],
    );
  }
}

class _Meta extends StatelessWidget {
  const _Meta({required this.icon, required this.label, required this.value});

  final IconData icon;
  final String label;
  final String value;

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    return Padding(
      padding: const EdgeInsets.only(bottom: Sp.sm),
      child: Row(
        children: [
          Icon(icon, size: 16, color: c.mutedForeground),
          const SizedBox(width: Sp.sm),
          Expanded(
            child: Text(
              label,
              style: AppTypography.body(size: 13, color: c.mutedForeground),
            ),
          ),
          Text(
            value,
            style: AppTypography.numeric(
              size: 13.5,
              weight: FontWeight.w600,
              color: c.foreground,
            ),
          ),
        ],
      ),
    );
  }
}
