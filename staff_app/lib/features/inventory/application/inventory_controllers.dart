import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../data/inventory_models.dart';
import '../data/inventory_repository.dart';

final inventorySummaryProvider = FutureProvider.autoDispose<InventorySummary?>(
  (ref) => ref.watch(inventoryRepositoryProvider).summary(),
);

final itemsLowStockFilterProvider = StateProvider.autoDispose<bool>((_) => false);

final itemsProvider = FutureProvider.autoDispose<List<InventoryItem>>((ref) {
  final lowStock = ref.watch(itemsLowStockFilterProvider);
  return ref.watch(inventoryRepositoryProvider).items(lowStock: lowStock);
});

final movementsProvider =
    FutureProvider.autoDispose.family<List<StockMovement>, String?>(
      (ref, itemId) => ref.watch(inventoryRepositoryProvider).movements(itemId: itemId),
    );

final suppliersProvider = FutureProvider.autoDispose<List<Supplier>>(
  (ref) => ref.watch(inventoryRepositoryProvider).suppliers(),
);

final poStatusFilterProvider = StateProvider.autoDispose<PurchaseOrderStatus?>((_) => null);

final purchaseOrdersProvider = FutureProvider.autoDispose<List<PurchaseOrder>>((ref) {
  final status = ref.watch(poStatusFilterProvider);
  return ref.watch(inventoryRepositoryProvider).purchaseOrders(status: status);
});

final purchaseOrderProvider = FutureProvider.autoDispose.family<PurchaseOrder?, String>(
  (ref, id) => ref.watch(inventoryRepositoryProvider).purchaseOrder(id),
);

class InventoryActions {
  const InventoryActions(this._ref);
  final Ref _ref;

  InventoryRepository get _repo => _ref.read(inventoryRepositoryProvider);

  void _invalidateAll() {
    _ref.invalidate(itemsProvider);
    _ref.invalidate(inventorySummaryProvider);
  }

  Future<InventoryItem> createItem(Map<String, dynamic> body) async {
    final i = await _repo.createItem(body);
    _invalidateAll();
    return i;
  }

  Future<InventoryItem> updateItem(String id, Map<String, dynamic> changes) async {
    final i = await _repo.updateItem(id, changes);
    _invalidateAll();
    return i;
  }

  Future<void> deleteItem(String id) async {
    await _repo.deleteItem(id);
    _invalidateAll();
  }

  Future<void> recordMovement(String itemId, Map<String, dynamic> body) async {
    await _repo.recordMovement(itemId, body);
    _invalidateAll();
    _ref.invalidate(movementsProvider(itemId));
    _ref.invalidate(movementsProvider(null));
  }

  Future<Supplier> createSupplier(Map<String, dynamic> body) async {
    final s = await _repo.createSupplier(body);
    _ref.invalidate(suppliersProvider);
    return s;
  }

  Future<PurchaseOrder> createPo(Map<String, dynamic> body) async {
    final p = await _repo.createPo(body);
    _ref.invalidate(purchaseOrdersProvider);
    _ref.invalidate(inventorySummaryProvider);
    return p;
  }

  Future<PurchaseOrder> setPoStatus(String id, PurchaseOrderStatus status) async {
    final p = await _repo.setPoStatus(id, status);
    _ref.invalidate(purchaseOrdersProvider);
    _ref.invalidate(purchaseOrderProvider(id));
    _ref.invalidate(inventorySummaryProvider);
    return p;
  }

  Future<PurchaseOrder> receivePo(String id) async {
    final p = await _repo.receivePo(id);
    _ref.invalidate(purchaseOrdersProvider);
    _ref.invalidate(purchaseOrderProvider(id));
    _invalidateAll();
    return p;
  }
}

final inventoryActionsProvider = Provider.autoDispose<InventoryActions>(
  (ref) => InventoryActions(ref),
);
