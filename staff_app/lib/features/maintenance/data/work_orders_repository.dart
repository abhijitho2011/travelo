import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/networking/api_client.dart';
import '../../../core/networking/api_exception.dart';
import '../../../core/providers.dart';
import 'work_order_models.dart';

/// The maintenance queue: reading it, raising an order, and driving one through
/// its lifecycle. Reads degrade a missing endpoint to empty; writes surface the
/// exception so the caller can queue offline or show a rejection.
class WorkOrdersRepository {
  WorkOrdersRepository(this._api);

  final ApiClient _api;

  Future<List<WorkOrder>> list({String? status, String? priority}) async {
    try {
      final data = await _api.get(
        '/work-orders',
        query: {
          if (status != null) 'status': status,
          if (priority != null) 'priority': priority,
        },
      );
      return _listOf(data);
    } on ApiException catch (e) {
      if (e.isMissingEndpoint) return const [];
      rethrow;
    }
  }

  Future<List<WorkOrder>> mine() async {
    try {
      return _listOf(await _api.get('/work-orders/mine'));
    } on ApiException catch (e) {
      if (e.isMissingEndpoint) return const [];
      rethrow;
    }
  }

  Future<WorkOrder?> get(String id) async {
    try {
      final data = await _api.get('/work-orders/$id');
      return data is Map ? WorkOrder.fromJson(data) : null;
    } on ApiException catch (e) {
      if (e.isMissingEndpoint) return null;
      rethrow;
    }
  }

  Future<WorkOrder> create(NewWorkOrder input) async {
    final data = await _api.post('/work-orders', body: input.toJson());
    if (data is Map) return WorkOrder.fromJson(data);
    throw const ApiException(
      code: 'WORK_ORDER_CREATE_FAILED',
      message: 'Could not raise the work order.',
    );
  }

  /// Drive a lifecycle action. `complete` carries the resolution and parts.
  Future<void> act(
    String id,
    WoAction action, {
    String? resolution,
    List<WorkOrderPart>? partsUsed,
  }) => _api.post(
    '/work-orders/$id/${action.verb}',
    body: action == WoAction.complete
        ? {
            'resolution': resolution ?? '',
            if (partsUsed != null && partsUsed.isNotEmpty)
              'partsUsed': partsUsed.map((p) => p.toJson()).toList(),
          }
        : const <String, dynamic>{},
  );

  Future<void> cancel(String id, String reason) =>
      _api.post('/work-orders/$id/cancel', body: {'reason': reason});

  List<WorkOrder> _listOf(dynamic data) {
    if (data is List) {
      return data.whereType<Map>().map(WorkOrder.fromJson).toList();
    }
    if (data is Map && data['items'] is List) {
      return (data['items'] as List)
          .whereType<Map>()
          .map(WorkOrder.fromJson)
          .toList();
    }
    return const [];
  }
}

final workOrdersRepositoryProvider = Provider<WorkOrdersRepository>(
  (ref) => WorkOrdersRepository(ref.watch(apiClientProvider)),
);
