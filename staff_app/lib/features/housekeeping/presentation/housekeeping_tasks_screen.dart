import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/theme/app_colors.dart';
import '../../../core/theme/app_spacing.dart';
import '../../../core/widgets/cards.dart';
import '../../../core/widgets/primitives.dart';
import '../../../core/widgets/states.dart';
import '../application/board_controllers.dart';
import '../data/task_models.dart';
import 'task_action_sheet.dart';

/// The supervisor's task list, filterable by status. Tapping a task opens the
/// assign/inspect sheet — the same one the board uses.
class HousekeepingTasksScreen extends ConsumerStatefulWidget {
  const HousekeepingTasksScreen({super.key});

  @override
  ConsumerState<HousekeepingTasksScreen> createState() =>
      _HousekeepingTasksScreenState();
}

class _HousekeepingTasksScreenState
    extends ConsumerState<HousekeepingTasksScreen> {
  HkTaskStatus? _filter;

  @override
  Widget build(BuildContext context) {
    final tasks = ref.watch(hkTaskListProvider(_filter));

    return PageBody(
      onRefresh: () => ref.read(hkTaskListProvider(_filter).notifier).refresh(),
      children: [
        const SectionHeader(title: 'Tasks', icon: Icons.checklist_outlined),
        SingleChildScrollView(
          scrollDirection: Axis.horizontal,
          child: Row(
            children: [
              _FilterChip(
                label: 'All',
                selected: _filter == null,
                onTap: () => setState(() => _filter = null),
              ),
              for (final s in HkTaskStatus.values)
                _FilterChip(
                  label: s.label,
                  selected: _filter == s,
                  onTap: () => setState(() => _filter = s),
                ),
            ],
          ),
        ),
        gapMd,
        tasks.when(
          loading: () => const ListSkeleton(rows: 4, height: 110),
          error: (e, _) => ErrorState(
            error: e,
            onRetry: () => ref.read(hkTaskListProvider(_filter).notifier).refresh(),
          ),
          data: (items) => items.isEmpty
              ? const EmptyState(
                  title: 'No tasks here',
                  hint: 'Nothing matches this filter right now.',
                  icon: Icons.task_alt_outlined,
                )
              : Column(
                  children: [
                    for (final t in items)
                      Padding(
                        padding: const EdgeInsets.only(bottom: Sp.md),
                        child: TaskCard(
                          headline: t.headline,
                          type: t.typeLabel,
                          note: t.guestRequest,
                          meta: [
                            if (t.assigneeName != null) t.assigneeName!
                            else 'Unassigned',
                            'Priority ${t.priority.label}',
                          ].join(' · '),
                          statusLabel: t.status.label,
                          statusTone: t.status.tone,
                          highPriority: t.priority == HkPriority.high,
                          onTap: () =>
                              showTaskActionSheet(context, ref, task: t,
                                  roomNumber: t.roomNumber),
                        ),
                      ),
                  ],
                ),
        ),
      ],
    );
  }
}

class _FilterChip extends StatelessWidget {
  const _FilterChip({
    required this.label,
    required this.selected,
    required this.onTap,
  });

  final String label;
  final bool selected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    return Padding(
      padding: const EdgeInsets.only(right: Sp.sm),
      child: ChoiceChip(
        label: Text(label),
        selected: selected,
        onSelected: (_) => onTap(),
        selectedColor: c.primary.withValues(alpha: 0.16),
      ),
    );
  }
}
