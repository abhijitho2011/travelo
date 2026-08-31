import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../data/board_models.dart';
import '../data/board_repository.dart';
import '../data/task_models.dart';

/// The supervisor's room board.
class BoardController extends AsyncNotifier<HousekeepingBoard> {
  @override
  Future<HousekeepingBoard> build() =>
      ref.watch(boardRepositoryProvider).board();

  Future<void> refresh() async {
    state = await AsyncValue.guard(
      () => ref.read(boardRepositoryProvider).board(),
    );
  }
}

final boardProvider = AsyncNotifierProvider<BoardController, HousekeepingBoard>(
  BoardController.new,
);

/// The filtered housekeeping task list. The family arg is the status filter, or
/// null for all.
class HkTaskListController
    extends FamilyAsyncNotifier<List<StaffTask>, HkTaskStatus?> {
  @override
  Future<List<StaffTask>> build(HkTaskStatus? filter) =>
      ref.watch(boardRepositoryProvider).tasks(status: _wire(filter));

  Future<void> refresh() async {
    state = await AsyncValue.guard(() => build(arg));
  }

  static String? _wire(HkTaskStatus? s) => switch (s) {
    null => null,
    HkTaskStatus.pending => 'PENDING',
    HkTaskStatus.inProgress => 'IN_PROGRESS',
    HkTaskStatus.completed => 'COMPLETED',
    HkTaskStatus.inspected => 'INSPECTED',
    HkTaskStatus.rejected => 'REJECTED',
  };
}

final hkTaskListProvider =
    AsyncNotifierProvider.family<
      HkTaskListController,
      List<StaffTask>,
      HkTaskStatus?
    >(HkTaskListController.new);

/// The assignee picker options.
final assignableStaffProvider = FutureProvider<List<HkAssignee>>(
  (ref) => ref.watch(boardRepositoryProvider).assignableStaff(),
);

/// Assign and inspect actions, refreshing the board afterwards.
class BoardActions {
  BoardActions(this.ref);

  final Ref ref;

  Future<void> assign(String taskId, String staffId) async {
    await ref.read(boardRepositoryProvider).assign(taskId, staffId);
    _refresh();
  }

  Future<void> inspect(
    String taskId, {
    required bool pass,
    String? notes,
  }) async {
    await ref
        .read(boardRepositoryProvider)
        .inspect(taskId, pass: pass, notes: notes);
    _refresh();
  }

  void _refresh() {
    ref.invalidate(boardProvider);
    ref.invalidate(hkTaskListProvider);
  }
}

final boardActionsProvider = Provider<BoardActions>(BoardActions.new);
