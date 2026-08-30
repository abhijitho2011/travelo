import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/networking/api_client.dart';
import '../../../core/networking/api_exception.dart';
import '../../../core/providers.dart';
import 'inventory_models.dart';

/// Every inventory read and write.
class InventoryRepository {
  InventoryRepository(this._api);

  final ApiClient _api;

  Future<InventorySummary?> summary() async {
    try {
      final data = await _api.get('/inventory/summary');
      return data is Map ? InventorySummary.fromJson(data) : null;
    } on ApiException catch (e) {
      if (e.isMissingEndpoint) return null;
      rethrow;
    }
  }

  // -------------------------------------------------------------------- items --

  Future<List<InventoryItem>> items({bool lowStock = false, String? category}) async {
    try {
      final data = await _api.get(
        '/inventory/items',
        query: {
          if (lowStock) 'lowStock': 'true',
          if (category != null) 'category': category,
        },
      );
      return _listOf(data, InventoryItem.fromJson);
    } on ApiException catch (e) {
      if (e.isMissingEndpoint) return const [];
      rethrow;
    }
  }

  Future<InventoryItem> createItem(Map<String, dynamic> body) async {
    final data = await _api.post('/inventory/items', body: body);
    return _one(data, InventoryItem.fromJson, 'item');
  }

  Future<InventoryItem> updateItem(String id, Map<String, dynamic> changes) async {
    final data = await _api.patch('/inventory/items/$id', body: changes);
    return _one(data, InventoryItem.fromJson, 'item');
  }

  Future<void> deleteItem(String id) => _api.delete('/inventory/items/$id');

  Future<void> recordMovement(String itemId, Map<String, dynamic> body) =>
      _api.post('/inventory/items/$itemId/movements', body: body);

  Future<List<StockMovement>> movements({String? itemId}) async {
    try {
      final data = await _api.get(
        '/inventory/movements',
        query: {if (itemId != null) 'itemId': itemId},
      );
      return _listOf(data, StockMovement.fromJson);
    } on ApiException catch (e) {
      if (e.isMissingEndpoint) return const [];
      rethrow;
    }
  }

  // ---------------------------------------------------------------- suppliers --

  Future<List<Supplier>> suppliers() async {
    try {
      final data = await _api.get('/inventory/suppliers');
      return _listOf(data, Supplier.fromJson);
    } on ApiException catch (e) {
      if (e.isMissingEndpoint) return const [];
      rethrow;
    }
  }

  Future<Supplier> createSupplier(Map<String, dynamic> body) async {
    final data = await _api.post('/inventory/suppliers', body: body);
    return _one(data, Supplier.fromJson, 'supplier');
  }

  Future<Supplier> updateSupplier(String id, Map<String, dynamic> body) async {
    final data = await _api.patch('/inventory/suppliers/$id', body: body);
    return _one(data, Supplier.fromJson, 'supplier');
  }

  Future<void> deleteSupplier(String id) =>
      _api.delete('/inventory/suppliers/$id');

  // ----------------------------------------------------------- purchase orders --

  Future<List<PurchaseOrder>> purchaseOrders({PurchaseOrderStatus? status}) async {
    try {
      final data = await _api.get(
        '/inventory/purchase-orders',
        query: {if (status != null) 'status': status.wire},
      );
      return _listOf(data, PurchaseOrder.fromJson);
    } on ApiException catch (e) {
      if (e.isMissingEndpoint) return const [];
      rethrow;
    }
  }

  Future<PurchaseOrder?> purchaseOrder(String id) async {
    try {
      final data = await _api.get('/inventory/purchase-orders/$id');
      return data is Map ? PurchaseOrder.fromJson(data) : null;
    } on ApiException catch (e) {
      if (e.isMissingEndpoint) return null;
      rethrow;
    }
  }

  Future<PurchaseOrder> createPo(Map<String, dynamic> body) async {
    final data = await _api.post('/inventory/purchase-orders', body: body);
    return _one(data, PurchaseOrder.fromJson, 'purchase order');
  }

  Future<PurchaseOrder> setPoStatus(String id, PurchaseOrderStatus status) async {
    final data = await _api.patch(
      '/inventory/purchase-orders/$id/status',
      body: {'status': status.wire},
    );
    return _one(data, PurchaseOrder.fromJson, 'purchase order');
  }

  Future<PurchaseOrder> receivePo(String id) async {
    final data = await _api.post('/inventory/purchase-orders/$id/receive');
    return _one(data, PurchaseOrder.fromJson, 'purchase order');
  }

  static List<T> _listOf<T>(dynamic data, T Function(Map) parse) {
    if (data is List) return data.whereType<Map>().map(parse).toList();
    if (data is Map && data['items'] is List) {
      return (data['items'] as List).whereType<Map>().map(parse).toList();
    }
    return const [];
  }

  static T _one<T>(dynamic data, T Function(Map) parse, String what) {
    if (data is Map) return parse(data);
    throw ApiException(
      code: 'ERROR',
      message: 'The server did not send back the $what it saved.',
    );
  }
}

final inventoryRepositoryProvider = Provider<InventoryRepository>(
  (ref) => InventoryRepository(ref.watch(apiClientProvider)),
);

final suppliersProvider = FutureProvider.autoDispose<List<Supplier>>(
  (ref) => ref.watch(inventoryRepositoryProvider).suppliers(),
);
