import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/networking/api_exception.dart';
import '../data/work_order_models.dart';
import '../data/work_orders_repository.dart';

/// The technician's home feed: work orders assigned to them and still open.
class MyWorkOrdersController extends AsyncNotifier<List<WorkOrder>> {
  @override
  Future<List<WorkOrder>> build() =>
      ref.watch(workOrdersRepositoryProvider).mine();

  Future<void> refresh() async {
    state = await AsyncValue.guard(
      () => ref.read(workOrdersRepositoryProvider).mine(),
    );
  }
}

final myWorkOrdersProvider =
    AsyncNotifierProvider<MyWorkOrdersController, List<WorkOrder>>(
      MyWorkOrdersController.new,
    );

/// The full queue, with an optional status filter for the technician/supervisor
/// list screen.
class WorkOrderQueueController
    extends FamilyAsyncNotifier<List<WorkOrder>, WoStatus?> {
  @override
  Future<List<WorkOrder>> build(WoStatus? filter) => ref
      .watch(workOrdersRepositoryProvider)
      .list(status: filter?.name.toUpperCase() == 'INPROGRESS'
          ? 'IN_PROGRESS'
          : filter?.name.toUpperCase());

  Future<void> refresh() async {
    state = await AsyncValue.guard(() => build(arg));
  }
}

final workOrderQueueProvider = AsyncNotifierProvider.family<
  WorkOrderQueueController,
  List<WorkOrder>,
  WoStatus?
>(WorkOrderQueueController.new);

/// One work order, for the detail screen.
final workOrderProvider = FutureProvider.family<WorkOrder?, String>(
  (ref, id) => ref.watch(workOrdersRepositoryProvider).get(id),
);

/// Drives lifecycle actions on a single order, refreshing the feeds after.
class WorkOrderActions {
  WorkOrderActions(this.ref);

  final Ref ref;

  Future<void> act(
    String id,
    WoAction action, {
    String? resolution,
    List<WorkOrderPart>? partsUsed,
  }) async {
    await ref
        .read(workOrdersRepositoryProvider)
        .act(id, action, resolution: resolution, partsUsed: partsUsed);
    _invalidate(id);
  }

  Future<void> cancel(String id, String reason) async {
    await ref.read(workOrdersRepositoryProvider).cancel(id, reason);
    _invalidate(id);
  }

  Future<WorkOrder> create(NewWorkOrder input) async {
    final wo = await ref.read(workOrdersRepositoryProvider).create(input);
    ref.invalidate(myWorkOrdersProvider);
    return wo;
  }

  void _invalidate(String id) {
    ref.invalidate(workOrderProvider(id));
    ref.invalidate(myWorkOrdersProvider);
  }
}

final workOrderActionsProvider = Provider<WorkOrderActions>(
  WorkOrderActions.new,
);

/// True when a lifecycle write failed only because we are offline — the caller
/// shows a "will retry" message rather than an error.
bool isOfflineFailure(Object e) =>
    e is ApiException && (e.isNetwork || e.isMissingEndpoint);
