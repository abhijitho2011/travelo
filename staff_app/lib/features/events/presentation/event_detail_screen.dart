import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/networking/api_exception.dart';
import '../../../core/permissions/permission_gate.dart';
import '../../../core/permissions/permission_keys.dart';
import '../../../core/utils/formatting.dart';
import '../../../core/widgets/primitives.dart';
import '../../../core/widgets/states.dart';
import '../../../core/widgets/status_badge.dart';
import '../application/events_controllers.dart';
import '../data/events_models.dart';
import '../data/events_repository.dart';

/// One event: its details, the status machine, and the task checklist.
class EventDetailScreen extends ConsumerWidget {
  const EventDetailScreen({super.key, required this.eventId});

  final String eventId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final async = ref.watch(eventProvider(eventId));
    return Scaffold(
      appBar: AppBar(title: const Text('Event')),
      body: async.when(
        loading: () =>
            const Padding(padding: EdgeInsets.all(16), child: ListSkeleton()),
        error: (e, _) => Padding(
          padding: const EdgeInsets.all(16),
          child: ErrorState(
            error: e,
            onRetry: () => ref.invalidate(eventProvider(eventId)),
          ),
        ),
        data: (event) {
          if (event == null) {
            return const Padding(
              padding: EdgeInsets.all(16),
              child: EmptyState(title: 'Event not found'),
            );
          }
          return _EventBody(event: event);
        },
      ),
    );
  }
}

class _EventBody extends ConsumerWidget {
  const _EventBody({required this.event});

  final EventItem event;

  Future<void> _refresh(WidgetRef ref) async {
    ref.invalidate(eventProvider(event.id));
    ref.invalidate(eventsProvider);
    ref.invalidate(eventsDashboardProvider);
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final e = event;
    final repo = ref.read(eventsRepositoryProvider);
    return PageBody(
      onRefresh: () => _refresh(ref),
      children: [
        Row(
          children: [
            Expanded(
              child: Text(
                e.name,
                style: Theme.of(context).textTheme.titleLarge,
              ),
            ),
            StatusBadge(
              tone: e.status.tone,
              label: e.status.label,
              dense: true,
            ),
          ],
        ),
        gapSm,
        Panel(
          title: 'Details',
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              _detail('Client', e.clientName),
              if (e.type != null) _detail('Type', e.type!),
              if (e.venue != null) _detail('Venue', e.venue!),
              if (e.startAt != null) _detail('Starts', Fmt.dateTime(e.startAt)),
              _detail('Guests', e.guestCount.toString()),
              _detail('Revenue', e.revenueLabel),
              if (e.roomBlock != null)
                _detail('Room block', e.roomBlock.toString()),
              if (e.package != null) _detail('Package', e.package!),
            ],
          ),
        ),
        gapMd,
        _StatusActions(event: e, onChanged: () => _refresh(ref)),
        gapMd,
        Panel(
          title: 'Checklist',
          description:
              '${e.tasks.where((t) => t.done).length}/${e.tasks.length} done',
          actions: [
            PermissionGate(
              permission: P.eventUpdate,
              child: IconButton(
                icon: const Icon(Icons.add, size: 20),
                onPressed: () => _addTask(context, ref, e.id),
              ),
            ),
          ],
          padBody: false,
          child: e.tasks.isEmpty
              ? const Padding(
                  padding: EdgeInsets.all(16),
                  child: Text('No tasks yet.'),
                )
              : Column(
                  children: [
                    for (var i = 0; i < e.tasks.length; i++) ...[
                      if (i > 0) const RowDivider(),
                      _TaskRow(
                        task: e.tasks[i],
                        onToggle: (done) async {
                          try {
                            await repo.updateTask(e.tasks[i].id, {
                              'done': done,
                            });
                            await _refresh(ref);
                          } on ApiException catch (err) {
                            if (context.mounted) {
                              ScaffoldMessenger.of(context).showSnackBar(
                                SnackBar(content: Text(err.message)),
                              );
                            }
                          }
                        },
                        onDelete: () async {
                          try {
                            await repo.deleteTask(e.tasks[i].id);
                            await _refresh(ref);
                          } on ApiException catch (err) {
                            if (context.mounted) {
                              ScaffoldMessenger.of(context).showSnackBar(
                                SnackBar(content: Text(err.message)),
                              );
                            }
                          }
                        },
                      ),
                    ],
                  ],
                ),
        ),
      ],
    );
  }

  Widget _detail(String label, String value) => Padding(
    padding: const EdgeInsets.symmetric(vertical: 4),
    child: Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        SizedBox(width: 110, child: LabelXs(label)),
        Expanded(child: Text(value)),
      ],
    ),
  );

  Future<void> _addTask(
    BuildContext context,
    WidgetRef ref,
    String eventId,
  ) async {
    final controller = TextEditingController();
    final title = await showDialog<String>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Add task'),
        content: TextField(
          controller: controller,
          decoration: const InputDecoration(labelText: 'Task title'),
          textCapitalization: TextCapitalization.sentences,
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx),
            child: const Text('Cancel'),
          ),
          FilledButton(
            onPressed: () => Navigator.pop(ctx, controller.text.trim()),
            child: const Text('Add'),
          ),
        ],
      ),
    );
    if (title != null && title.isNotEmpty) {
      try {
        await ref.read(eventsRepositoryProvider).addTask(eventId, {
          'title': title,
        });
        await _refresh(ref);
      } on ApiException catch (e) {
        if (context.mounted) {
          ScaffoldMessenger.of(
            context,
          ).showSnackBar(SnackBar(content: Text(e.message)));
        }
      }
    }
  }
}

class _StatusActions extends ConsumerWidget {
  const _StatusActions({required this.event, required this.onChanged});

  final EventItem event;
  final VoidCallback onChanged;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final repo = ref.read(eventsRepositoryProvider);
    final next = event.status.next;
    if (event.status.isTerminal) return const SizedBox.shrink();
    return Wrap(
      spacing: 8,
      children: [
        if (next != null)
          PermissionGate(
            permission: P.eventUpdate,
            child: FilledButton(
              onPressed: () async {
                try {
                  await repo.setStatus(event.id, next);
                  onChanged();
                } on ApiException catch (e) {
                  if (context.mounted) {
                    ScaffoldMessenger.of(
                      context,
                    ).showSnackBar(SnackBar(content: Text(e.message)));
                  }
                }
              },
              child: Text('Mark ${next.label}'),
            ),
          ),
        PermissionGate(
          permission: P.eventCancel,
          child: OutlinedButton(
            onPressed: () async {
              try {
                await repo.cancel(event.id);
                onChanged();
              } on ApiException catch (e) {
                if (context.mounted) {
                  ScaffoldMessenger.of(
                    context,
                  ).showSnackBar(SnackBar(content: Text(e.message)));
                }
              }
            },
            child: const Text('Cancel event'),
          ),
        ),
      ],
    );
  }
}

class _TaskRow extends StatelessWidget {
  const _TaskRow({
    required this.task,
    required this.onToggle,
    required this.onDelete,
  });

  final EventTask task;
  final ValueChanged<bool> onToggle;
  final VoidCallback onDelete;

  @override
  Widget build(BuildContext context) {
    return CheckboxListTile(
      value: task.done,
      onChanged: (v) => onToggle(v ?? false),
      title: Text(
        task.title,
        style: task.done
            ? const TextStyle(decoration: TextDecoration.lineThrough)
            : null,
      ),
      subtitle: task.dueAt != null
          ? Text('Due ${Fmt.dayMonth(task.dueAt)}')
          : null,
      secondary: PermissionGate(
        permission: P.eventUpdate,
        child: IconButton(
          icon: const Icon(Icons.delete_outline, size: 18),
          onPressed: onDelete,
        ),
      ),
      controlAffinity: ListTileControlAffinity.leading,
    );
  }
}
