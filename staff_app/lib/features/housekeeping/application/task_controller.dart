import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/networking/api_exception.dart';
import '../../../core/offline/offline_providers.dart';
import '../../maintenance/data/work_order_models.dart';
import '../../maintenance/data/work_orders_repository.dart';
import '../data/task_models.dart';
import '../data/task_repository.dart';

/// The attendant's task list, with optimistic status changes.
///
/// When the write fails because the device is offline, the change is written to
/// the durable sync queue and the card is marked "waiting to sync" — it is
/// never silently dropped, and never shown as saved when it is not.
class MyTasksController extends AsyncNotifier<List<StaffTask>> {
  @override
  Future<List<StaffTask>> build() =>
      ref.watch(taskRepositoryProvider).myTasks();

  Future<void> refresh() async {
    state = await AsyncValue.guard(
      () => ref.read(taskRepositoryProvider).myTasks(),
    );
  }

  StaffTask? byId(String id) {
    for (final t in state.value ?? const <StaffTask>[]) {
      if (t.id == id) return t;
    }
    return null;
  }

  /// Moves the task to its next attendant stage (start, then complete). Returns
  /// true when the server accepted it, false when it was queued locally.
  Future<bool> advance(StaffTask task, {String? notes}) async {
    final next = task.status.attendantNext;
    final action = task.status.attendantAction;
    if (next == null || action == null) return true;

    _patch(task.id, (t) => t.copyWith(status: next, pendingSync: false));

    try {
      await ref.read(taskRepositoryProvider).act(task.id, action, notes: notes);
      _patch(task.id, (t) => t.copyWith(pendingSync: false));
      // A completed task leaves the attendant feed; a started one stays.
      if (next.isTerminal || next == HkTaskStatus.completed) await refresh();
      return true;
    } on ApiException catch (e) {
      if (!e.isNetwork && !e.isMissingEndpoint) {
        _patch(task.id, (t) => t.copyWith(status: task.status));
        rethrow;
      }
      await ref.read(enqueueMutationProvider)(
        entityId: task.id,
        operationType: 'housekeeping.task.$action',
        payload: {if (notes != null) 'notes': notes},
      );
      _patch(task.id, (t) => t.copyWith(pendingSync: true));
      return false;
    }
  }

  /// Reports a problem found in the room as a maintenance work order. Same
  /// offline behaviour as a status change.
  Future<bool> reportIssue(
    StaffTask task, {
    required String description,
  }) async {
    final input = NewWorkOrder(
      title: task.roomNumber?.isNotEmpty == true
          ? 'Issue in room ${task.roomNumber}'
          : 'Issue: ${task.area ?? task.typeLabel}',
      description: description,
      roomId: task.roomId,
    );
    try {
      await ref.read(workOrdersRepositoryProvider).create(input);
      return true;
    } on ApiException catch (e) {
      if (!e.isNetwork && !e.isMissingEndpoint) rethrow;
      await ref.read(enqueueMutationProvider)(
        entityId: task.id,
        operationType: 'workorder.create',
        payload: input.toJson(),
      );
      return false;
    }
  }

  void _patch(String id, StaffTask Function(StaffTask) update) {
    final current = state.value;
    if (current == null) return;
    state = AsyncValue.data([
      for (final t in current)
        if (t.id == id) update(t) else t,
    ]);
  }
}

final myTasksProvider =
    AsyncNotifierProvider<MyTasksController, List<StaffTask>>(
      MyTasksController.new,
    );

/// Progress for the header bar: completed / total.
final taskProgressProvider = Provider<(int done, int total)>((ref) {
  final tasks = ref.watch(myTasksProvider).value ?? const <StaffTask>[];
  return (tasks.where((t) => t.isDone).length, tasks.length);
});
