import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/networking/api_exception.dart';
import '../../../core/permissions/permission_gate.dart';
import '../../../core/permissions/permission_keys.dart';
import '../../../core/providers.dart';
import '../../../core/routing/routes.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/theme/app_spacing.dart';
import '../../../core/theme/app_typography.dart';
import '../../../core/utils/formatting.dart';
import '../../../core/widgets/cards.dart';
import '../../../core/widgets/primitives.dart';
import '../../../core/widgets/states.dart';
import '../../../core/widgets/status_badge.dart';
import '../application/task_controller.dart';
import '../data/task_models.dart';

/// The room attendant / cleaner's entire app: a greeting, a progress bar, and a
/// stack of large tap targets. Fed by `/housekeeping/my-tasks`.
class MyTasksScreen extends ConsumerWidget {
  const MyTasksScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final c = context.colors;
    final session = ref.watch(sessionProvider);
    final tasks = ref.watch(myTasksProvider);
    final (done, total) = ref.watch(taskProgressProvider);

    return PageBody(
      onRefresh: () => ref.read(myTasksProvider.notifier).refresh(),
      children: [
        SoftCard(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              LabelXs(
                [
                  session?.user.department ?? session?.role.department,
                  session?.hotel?.name,
                ].where((s) => s != null && s.isNotEmpty).join(' · '),
              ),
              const SizedBox(height: 2),
              Text(
                '${_greeting()}, ${session?.user.firstName.isNotEmpty == true ? session!.user.firstName : 'there'}',
                style: AppTypography.display(size: 21, color: c.foreground),
              ),
              const SizedBox(height: 4),
              Text(
                Fmt.fullDate(DateTime.now()),
                style: AppTypography.body(size: 13, color: c.mutedForeground),
              ),
              if (total > 0) ...[
                const SizedBox(height: Sp.md),
                Row(
                  children: [
                    Expanded(
                      child: ClipRRect(
                        borderRadius: R.rPill,
                        child: LinearProgressIndicator(
                          value: total == 0 ? 0 : done / total,
                          minHeight: 8,
                          backgroundColor: c.muted,
                        ),
                      ),
                    ),
                    const SizedBox(width: Sp.md),
                    Text(
                      '$done/$total',
                      style: AppTypography.numeric(
                        size: 13.5,
                        weight: FontWeight.w700,
                        color: c.foreground,
                      ),
                    ),
                  ],
                ),
              ],
            ],
          ),
        ),
        gapSection,

        const SectionHeader(title: 'My tasks', icon: Icons.checklist_outlined),
        tasks.when(
          loading: () => const ListSkeleton(rows: 3, height: 120),
          error: (e, _) => ErrorState(
            error: e,
            onRetry: () => ref.read(myTasksProvider.notifier).refresh(),
          ),
          data: (items) => items.isEmpty
              ? const EmptyState(
                  title: 'Nothing assigned right now',
                  hint:
                      'When your supervisor assigns you a room it appears here '
                      'straight away.',
                  icon: Icons.task_alt_outlined,
                )
              : Column(
                  children: [
                    for (final task in items)
                      Padding(
                        padding: const EdgeInsets.only(bottom: Sp.md),
                        child: _TaskRow(task: task),
                      ),
                  ],
                ),
        ),
      ],
    );
  }

  static String _greeting() {
    final h = DateTime.now().hour;
    if (h < 12) return 'Good morning';
    if (h < 17) return 'Good afternoon';
    return 'Good evening';
  }
}

class _TaskRow extends ConsumerStatefulWidget {
  const _TaskRow({required this.task});

  final StaffTask task;

  @override
  ConsumerState<_TaskRow> createState() => _TaskRowState();
}

class _TaskRowState extends ConsumerState<_TaskRow> {
  bool _busy = false;

  Future<void> _advance() async {
    setState(() => _busy = true);
    try {
      final synced = await ref
          .read(myTasksProvider.notifier)
          .advance(widget.task);
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(
            synced
                ? '${widget.task.headline} · ${widget.task.status.attendantNext?.label ?? 'updated'}'
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

  @override
  Widget build(BuildContext context) {
    final t = widget.task;
    final c = context.colors;
    final canAct = t.status.attendantAction != null;

    return TaskCard(
      headline: t.headline,
      type: t.typeLabel,
      note: t.guestRequest,
      meta: [
        if (t.floor != null && t.floor!.isNotEmpty) 'Floor ${t.floor}',
        if (t.area != null && t.roomNumber == null) t.area!,
        'Priority ${t.priority.label}',
        if (t.dueAt != null) 'due ${Fmt.time(t.dueAt)}',
        if (t.pendingSync) 'waiting to sync',
      ].join(' · '),
      statusLabel: t.pendingSync ? 'Waiting to sync' : t.status.label,
      statusTone: t.pendingSync ? StatusTone.warning : t.status.tone,
      highPriority: t.priority == HkPriority.high,
      dimmed: t.isDone,
      onTap: () => context.go(Routes.task(t.id)),
      actions: Row(
        children: [
          Expanded(
            child: PermissionGate.all(
              permissions: const [P.taskStart, P.taskComplete],
              mode: GateMode.disable,
              deniedTooltip: 'Only the assigned attendant can update this task',
              child: FilledButton(
                onPressed: _busy || !canAct ? null : _advance,
                child: _busy
                    ? const SizedBox(
                        width: 18,
                        height: 18,
                        child: CircularProgressIndicator(strokeWidth: 2),
                      )
                    : Text(t.status.actionLabel),
              ),
            ),
          ),
          const SizedBox(width: Sp.sm),
          PermissionGate(
            permission: P.maintenanceReport,
            child: SizedBox(
              width: kTouchTarget,
              height: kTouchTarget,
              child: OutlinedButton(
                onPressed: () => context.go(Routes.task(t.id)),
                style: OutlinedButton.styleFrom(
                  padding: EdgeInsets.zero,
                  foregroundColor: c.warning,
                ),
                child: const Icon(
                  Icons.report_gmailerrorred_outlined,
                  size: 19,
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }
}
