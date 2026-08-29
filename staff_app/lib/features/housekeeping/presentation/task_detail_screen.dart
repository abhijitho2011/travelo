import 'dart:io';

import 'package:flutter/foundation.dart' show kIsWeb;
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:image_picker/image_picker.dart';

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

/// One task, with the big buttons an attendant actually needs and the evidence
/// capture (photo + note) that goes with a completion or an issue report.
class TaskDetailScreen extends ConsumerStatefulWidget {
  const TaskDetailScreen({super.key, required this.taskId});

  final String taskId;

  @override
  ConsumerState<TaskDetailScreen> createState() => _TaskDetailScreenState();
}

class _TaskDetailScreenState extends ConsumerState<TaskDetailScreen> {
  final _note = TextEditingController();
  XFile? _photo;
  bool _busy = false;

  @override
  void dispose() {
    _note.dispose();
    super.dispose();
  }

  Future<void> _pickPhoto({required bool fromCamera}) async {
    try {
      final picked = await ImagePicker().pickImage(
        source: fromCamera ? ImageSource.camera : ImageSource.gallery,
        maxWidth: 1600,
        imageQuality: 80,
      );
      if (picked != null) setState(() => _photo = picked);
    } catch (_) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Could not open the camera on this device')),
      );
    }
  }

  Future<void> _advance(StaffTask task) async {
    setState(() => _busy = true);
    try {
      final synced = await ref
          .read(myTasksProvider.notifier)
          .advance(
            task,
            note: _note.text.trim().isEmpty ? null : _note.text.trim(),
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
          .reportIssue(
            task,
            description: description,
            photoPath: _photo?.path,
          );
      if (!mounted) return;
      _note.clear();
      setState(() => _photo = null);
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(
            synced
                ? 'Issue reported to your supervisor'
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
            accent: task.priority == TaskPriority.high ? c.critical : null,
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
                            task.taskType ?? task.title,
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
                              : task.stage.tone,
                          label: task.pendingSync
                              ? 'Waiting to sync'
                              : task.stage.label,
                        ),
                        if (task.priority == TaskPriority.high)
                          Padding(
                            padding: const EdgeInsets.only(top: 6),
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
                  value: task.floor ?? Fmt.dash,
                ),
                _Meta(
                  icon: Icons.schedule,
                  label: 'Due',
                  value: Fmt.time(task.dueAt),
                ),
                _Meta(
                  icon: Icons.timelapse_outlined,
                  label: 'Estimated',
                  value: Fmt.duration(task.estimatedMinutes),
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
            title: 'Add a note or photo',
            description: 'Attach evidence before you complete or report.',
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                TextField(
                  controller: _note,
                  maxLines: 3,
                  textCapitalization: TextCapitalization.sentences,
                  decoration: const InputDecoration(
                    hintText: 'What did you find? What did you do?',
                  ),
                ),
                gapMd,
                if (_photo != null) ...[
                  ClipRRect(
                    borderRadius: R.rMd,
                    child: kIsWeb
                        ? Image.network(
                            _photo!.path,
                            height: 160,
                            width: double.infinity,
                            fit: BoxFit.cover,
                          )
                        : Image.file(
                            File(_photo!.path),
                            height: 160,
                            width: double.infinity,
                            fit: BoxFit.cover,
                          ),
                  ),
                  const SizedBox(height: Sp.sm),
                  Align(
                    alignment: Alignment.centerLeft,
                    child: TextButton.icon(
                      onPressed: () => setState(() => _photo = null),
                      icon: const Icon(Icons.close, size: 16),
                      label: const Text('Remove photo'),
                    ),
                  ),
                ],
                Row(
                  children: [
                    Expanded(
                      child: OutlinedButton.icon(
                        onPressed: () => _pickPhoto(fromCamera: true),
                        icon: const Icon(Icons.photo_camera_outlined, size: 17),
                        label: const Text('Camera'),
                      ),
                    ),
                    const SizedBox(width: Sp.sm),
                    Expanded(
                      child: OutlinedButton.icon(
                        onPressed: () => _pickPhoto(fromCamera: false),
                        icon: const Icon(Icons.photo_library_outlined, size: 17),
                        label: const Text('Gallery'),
                      ),
                    ),
                  ],
                ),
              ],
            ),
          ),

          gapSection,
          PermissionGate.all(
            permissions: const [P.taskStart, P.taskComplete],
            mode: GateMode.disable,
            child: SizedBox(
              height: 52,
              child: FilledButton.icon(
                onPressed: _busy || task.isDone ? null : () => _advance(task),
                icon: Icon(
                  task.isDone ? Icons.check_circle_outline : Icons.play_arrow,
                  size: 20,
                ),
                label: Text(
                  task.stage.actionLabel,
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
