import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../data/restaurant_models.dart';
import '../data/restaurant_repository.dart';

// -------------------------------------------------------------- the boards --

/// The floor: every table and where it stands. Waiters and the manager watch it.
final tablesProvider = FutureProvider.autoDispose<List<RestaurantTable>>(
  (ref) => ref.watch(restaurantRepositoryProvider).tables(),
);

/// The menu, grouped. `all=false` for ordering; the manager screen requests the
/// full view separately via [menuAllProvider].
final menuProvider = FutureProvider.autoDispose<List<MenuCategory>>(
  (ref) => ref.watch(restaurantRepositoryProvider).menu(),
);

final menuAllProvider = FutureProvider.autoDispose<List<MenuCategory>>(
  (ref) => ref.watch(restaurantRepositoryProvider).menu(all: true),
);

/// Orders list, filtered. The waiter passes `mine: true`; the cashier watches
/// OPEN and BILLED.
final ordersFilterProvider = StateProvider.autoDispose<OrdersFilter>(
  (_) => const OrdersFilter(),
);

final ordersProvider = FutureProvider.autoDispose<List<RestaurantOrder>>((ref) {
  final f = ref.watch(ordersFilterProvider);
  return ref
      .watch(restaurantRepositoryProvider)
      .orders(status: f.status, tableId: f.tableId, mine: f.mine);
});

/// A single order, live. The order screen and the bill screen both watch it.
final orderProvider = FutureProvider.autoDispose
    .family<RestaurantOrder?, String>(
      (ref, id) => ref.watch(restaurantRepositoryProvider).order(id),
    );

/// The kitchen display. Polled every ~15s (no websockets yet — see KitchenScreen).
final kitchenProvider = FutureProvider.autoDispose<List<KitchenTicket>>(
  (ref) => ref.watch(restaurantRepositoryProvider).kitchen(),
);

/// The outlet summary for the manager/cashier dashboard.
final summaryProvider = FutureProvider.autoDispose<RestaurantSummary?>(
  (ref) => ref.watch(restaurantRepositoryProvider).summary(),
);

/// Checked-in guests for the ROOM_CHARGE picker, keyed on the search query.
final inHouseGuestsProvider = FutureProvider.autoDispose
    .family<List<InHouseGuest>, String>(
      (ref, query) =>
          ref.watch(restaurantRepositoryProvider).inHouseGuests(query: query),
    );

@immutable
class OrdersFilter {
  const OrdersFilter({this.status, this.tableId, this.mine = false});

  final OrderStatus? status;
  final String? tableId;
  final bool mine;

  OrdersFilter copyWith({
    OrderStatus? status,
    bool clearStatus = false,
    String? tableId,
    bool clearTable = false,
    bool? mine,
  }) => OrdersFilter(
    status: clearStatus ? null : (status ?? this.status),
    tableId: clearTable ? null : (tableId ?? this.tableId),
    mine: mine ?? this.mine,
  );
}

// ------------------------------------------------------------------ actions --

/// Every write against the outlet. Each throws on failure — the caller shows
/// the message rather than pretending the change stuck — and invalidates the
/// reads it touched so the boards refresh.
class RestaurantActions {
  const RestaurantActions(this._ref);

  final Ref _ref;

  RestaurantRepository get _repo => _ref.read(restaurantRepositoryProvider);

  void _invalidateBoards() {
    _ref.invalidate(tablesProvider);
    _ref.invalidate(ordersProvider);
    _ref.invalidate(summaryProvider);
  }

  void _invalidateMenu() {
    _ref.invalidate(menuProvider);
    _ref.invalidate(menuAllProvider);
  }

  // --- tables ---

  Future<RestaurantTable> createTable(String name, int seats) async {
    final t = await _repo.createTable(name, seats);
    _ref.invalidate(tablesProvider);
    return t;
  }

  Future<RestaurantTable> updateTable(
    String id,
    Map<String, dynamic> changes,
  ) async {
    final t = await _repo.updateTable(id, changes);
    _invalidateBoards();
    return t;
  }

  Future<void> deleteTable(String id) async {
    await _repo.deleteTable(id);
    _ref.invalidate(tablesProvider);
  }

  // --- menu ---

  Future<void> createCategory(String name, {int? sortOrder}) async {
    await _repo.createCategory(name, sortOrder: sortOrder);
    _invalidateMenu();
  }

  Future<void> updateCategory(String id, Map<String, dynamic> changes) async {
    await _repo.updateCategory(id, changes);
    _invalidateMenu();
  }

  Future<void> deleteCategory(String id) async {
    await _repo.deleteCategory(id);
    _invalidateMenu();
  }

  Future<void> createItem(Map<String, dynamic> body) async {
    await _repo.createItem(body);
    _invalidateMenu();
  }

  Future<void> updateItem(String id, Map<String, dynamic> changes) async {
    await _repo.updateItem(id, changes);
    _invalidateMenu();
  }

  Future<void> deleteItem(String id) async {
    await _repo.deleteItem(id);
    _invalidateMenu();
  }

  Future<void> setItemAvailability(String id, bool available) async {
    await _repo.setItemAvailability(id, available);
    _invalidateMenu();
  }

  // --- orders ---

  Future<RestaurantOrder> createOrder({
    String? tableId,
    required int guestCount,
  }) async {
    final o = await _repo.createOrder(tableId: tableId, guestCount: guestCount);
    _invalidateBoards();
    return o;
  }

  Future<RestaurantOrder> addItems(String orderId, List<CartLine> lines) async {
    final o = await _repo.addItems(orderId, lines);
    _refreshOrder(orderId);
    return o;
  }

  Future<RestaurantOrder> setKot(
    String orderId,
    String itemId,
    KotStatus status,
  ) async {
    final o = await _repo.setKot(orderId, itemId, status);
    _refreshOrder(orderId);
    _ref.invalidate(kitchenProvider);
    return o;
  }

  Future<RestaurantOrder> cancelItem(String orderId, String itemId) async {
    final o = await _repo.cancelItem(orderId, itemId);
    _refreshOrder(orderId);
    _ref.invalidate(kitchenProvider);
    return o;
  }

  Future<RestaurantOrder> bill(String orderId) async {
    final o = await _repo.bill(orderId);
    _refreshOrder(orderId);
    _invalidateBoards();
    return o;
  }

  Future<RestaurantOrder> discount(
    String orderId, {
    required int amountPaise,
    required String reason,
  }) async {
    final result = await _repo.discount(
      orderId,
      amountPaise: amountPaise,
      reason: reason,
    );
    _refreshOrder(orderId);
    return result;
  }

  Future<RestaurantOrder> settle(
    String orderId,
    PaymentMethod method, {
    String? reservationId,
    String? corporateAccountId,
    int? amountPaise,
    String? remarks,
  }) async {
    final result = await _repo.settle(
      orderId,
      method,
      reservationId: reservationId,
      corporateAccountId: corporateAccountId,
      amountPaise: amountPaise,
      remarks: remarks,
    );
    _refreshOrder(orderId);
    _invalidateBoards();
    return result;
  }

  Future<RestaurantOrder> cancelOrder(String orderId, String reason) async {
    final o = await _repo.cancelOrder(orderId, reason);
    _refreshOrder(orderId);
    _invalidateBoards();
    _ref.invalidate(kitchenProvider);
    return o;
  }

  void _refreshOrder(String orderId) {
    _ref.invalidate(orderProvider(orderId));
    _ref.invalidate(ordersProvider);
  }
}

final restaurantActionsProvider = Provider<RestaurantActions>(
  (ref) => RestaurantActions(ref),
);
