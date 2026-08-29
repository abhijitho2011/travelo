import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/networking/api_exception.dart';
import '../../../core/offline/offline_providers.dart';
import '../data/task_models.dart';
import '../data/task_repository.dart';

/// The attendant's task list, with optimistic stage changes.
///
/// When the write fails because the device is offline, the change is written
/// to the durable sync queue and the card is marked "waiting to sync" — it is
/// never silently dropped, and it is never shown as saved when it is not.
class MyTasksController extends AsyncNotifier<List<StaffTask>> {
  @override
  Future<List<StaffTask>> build() => ref.watch(taskRepositoryProvider).myTasks();

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

  /// Moves the task to its next stage. Returns true when the server accepted
  /// it, false when it was queued locally instead.
  Future<bool> advance(StaffTask task, {String? note}) async {
    final next = task.stage.next;
    if (next == null) return true;

    _patch(task.id, (t) => t.copyWith(stage: next));

    try {
      await ref.read(taskRepositoryProvider).setStage(task.id, next, note: note);
      _patch(task.id, (t) => t.copyWith(pendingSync: false));
      return true;
    } on ApiException catch (e) {
      if (!e.isNetwork && !e.isMissingEndpoint) {
        // A real rejection — put the task back where it was.
        _patch(task.id, (t) => t.copyWith(stage: task.stage));
        rethrow;
      }
      await ref.read(enqueueMutationProvider)(
        entityId: task.id,
        operationType: task.stage.operationType ?? 'task.update',
        payload: {'stage': next.name.toUpperCase(), if (note != null) 'note': note},
      );
      _patch(task.id, (t) => t.copyWith(pendingSync: true));
      return false;
    }
  }

  /// Reports a problem found in the room. Same offline behaviour.
  Future<bool> reportIssue(
    StaffTask task, {
    required String description,
    String? photoPath,
  }) async {
    try {
      await ref
          .read(taskRepositoryProvider)
          .reportIssue(task.id, description: description, photoPath: photoPath);
      return true;
    } on ApiException catch (e) {
      if (!e.isNetwork && !e.isMissingEndpoint) rethrow;
      await ref.read(enqueueMutationProvider)(
        entityId: task.id,
        operationType: 'task.issue',
        payload: {
          'description': description,
          if (photoPath != null) 'photoPath': photoPath,
        },
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
