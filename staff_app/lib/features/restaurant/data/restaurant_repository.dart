import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/networking/api_client.dart';
import '../../../core/networking/api_exception.dart';
import '../../../core/providers.dart';
import 'restaurant_models.dart';

/// Every restaurant read and write.
///
/// Same split as the rooms and reception features: reads translate a missing
/// endpoint into "nothing there" so a screen degrades to an honest empty state;
/// writes let the exception through, because a silently swallowed order would
/// leave a table believing food is coming.
class RestaurantRepository {
  RestaurantRepository(this._api);

  final ApiClient _api;

  // ----------------------------------------------------------------- tables --

  Future<List<RestaurantTable>> tables({RestaurantTableStatus? status}) async {
    try {
      final data = await _api.get(
        '/restaurant/tables',
        query: {if (status != null) 'status': status.wire},
      );
      return _listOf(data, RestaurantTable.fromJson);
    } on ApiException catch (e) {
      if (e.isMissingEndpoint) return const [];
      rethrow;
    }
  }

  Future<RestaurantTable> createTable(String name, int seats) async {
    final data = await _api.post(
      '/restaurant/tables',
      body: {'name': name, 'seats': seats},
    );
    return _one(data, RestaurantTable.fromJson, 'table');
  }

  Future<RestaurantTable> updateTable(
    String id,
    Map<String, dynamic> changes,
  ) async {
    final data = await _api.patch('/restaurant/tables/$id', body: changes);
    return _one(data, RestaurantTable.fromJson, 'table');
  }

  Future<void> deleteTable(String id) => _api.delete('/restaurant/tables/$id');

  // ------------------------------------------------------------------- menu --

  /// The whole menu, grouped by category, in one call. `all: true` is the
  /// manager view (UNAVAILABLE and ARCHIVED included).
  Future<List<MenuCategory>> menu({bool all = false}) async {
    try {
      final data = await _api.get(
        '/restaurant/menu',
        query: {if (all) 'all': 'true'},
      );
      return _listOf(data, MenuCategory.fromJson);
    } on ApiException catch (e) {
      if (e.isMissingEndpoint) return const [];
      rethrow;
    }
  }

  Future<void> createCategory(String name, {int? sortOrder}) => _api.post(
    '/restaurant/menu/categories',
    body: {'name': name, if (sortOrder != null) 'sortOrder': sortOrder},
  );

  Future<void> updateCategory(String id, Map<String, dynamic> changes) =>
      _api.patch('/restaurant/menu/categories/$id', body: changes);

  Future<void> deleteCategory(String id) =>
      _api.delete('/restaurant/menu/categories/$id');

  Future<MenuItem> createItem(Map<String, dynamic> body) async {
    final data = await _api.post('/restaurant/menu/items', body: body);
    return _one(data, MenuItem.fromJson, 'menu item');
  }

  Future<MenuItem> updateItem(String id, Map<String, dynamic> changes) async {
    final data = await _api.patch('/restaurant/menu/items/$id', body: changes);
    return _one(data, MenuItem.fromJson, 'menu item');
  }

  Future<void> deleteItem(String id) =>
      _api.delete('/restaurant/menu/items/$id');

  /// The 86 flow.
  Future<MenuItem> setItemAvailability(String id, bool available) async {
    final data = await _api.post(
      '/restaurant/menu/items/$id/availability',
      body: {'available': available},
    );
    return _one(data, MenuItem.fromJson, 'menu item');
  }

  // ----------------------------------------------------------------- orders --

  Future<List<RestaurantOrder>> orders({
    OrderStatus? status,
    String? tableId,
    bool mine = false,
  }) async {
    try {
      final data = await _api.get(
        '/restaurant/orders',
        query: {
          if (status != null) 'status': status.wire,
          if (tableId != null) 'tableId': tableId,
          if (mine) 'mine': 'true',
        },
      );
      return _listOf(data, RestaurantOrder.fromJson);
    } on ApiException catch (e) {
      if (e.isMissingEndpoint) return const [];
      rethrow;
    }
  }

  Future<RestaurantOrder?> order(String id) async {
    try {
      final data = await _api.get('/restaurant/orders/$id');
      return data is Map ? RestaurantOrder.fromJson(data) : null;
    } on ApiException catch (e) {
      if (e.isMissingEndpoint) return null;
      rethrow;
    }
  }

  Future<RestaurantOrder> createOrder({
    String? tableId,
    required int guestCount,
  }) async {
    final data = await _api.post(
      '/restaurant/orders',
      body: {if (tableId != null) 'tableId': tableId, 'guestCount': guestCount},
    );
    return _one(data, RestaurantOrder.fromJson, 'order');
  }

  Future<RestaurantOrder> addItems(String orderId, List<CartLine> lines) async {
    final data = await _api.post(
      '/restaurant/orders/$orderId/items',
      body: {'items': lines.map((l) => l.toJson()).toList()},
    );
    return _one(data, RestaurantOrder.fromJson, 'order');
  }

  Future<RestaurantOrder> setKot(
    String orderId,
    String itemId,
    KotStatus status,
  ) async {
    final data = await _api.post(
      '/restaurant/orders/$orderId/items/$itemId/kot',
      body: {'status': status.wire},
    );
    return _one(data, RestaurantOrder.fromJson, 'order');
  }

  Future<RestaurantOrder> cancelItem(String orderId, String itemId) async {
    final data = await _api.post(
      '/restaurant/orders/$orderId/items/$itemId/cancel',
    );
    return _one(data, RestaurantOrder.fromJson, 'order');
  }

  Future<RestaurantOrder> bill(String orderId) async {
    final data = await _api.post('/restaurant/orders/$orderId/bill');
    return _one(data, RestaurantOrder.fromJson, 'order');
  }

  Future<RestaurantOrder> settle(
    String orderId,
    PaymentMethod method, {
    String? reservationId,
    String? corporateAccountId,
    int? amountPaise,
    String? remarks,
  }) async {
    final data = await _api.post(
      '/restaurant/orders/$orderId/settle',
      body: {
        'method': method.wire,
        if (reservationId != null) 'reservationId': reservationId,
        if (corporateAccountId != null)
          'corporateAccountId': corporateAccountId,
        if (amountPaise != null) 'amountPaise': amountPaise,
        if (remarks != null && remarks.isNotEmpty) 'remarks': remarks,
      },
    );
    return _one(data, RestaurantOrder.fromJson, 'order');
  }

  Future<RestaurantOrder> discount(
    String orderId, {
    required int amountPaise,
    required String reason,
  }) async {
    final data = await _api.post(
      '/restaurant/orders/$orderId/discount',
      body: {'amountPaise': amountPaise, 'reason': reason},
    );
    return _one(data, RestaurantOrder.fromJson, 'order');
  }

  Future<int> bulkCreateItems(List<Map<String, dynamic>> items) async {
    final data = await _api.post(
      '/restaurant/menu/items/bulk',
      body: {'items': items},
    );
    return data is Map ? (data['created'] as int? ?? 0) : 0;
  }

  Future<RestaurantOrder> cancelOrder(String orderId, String reason) async {
    final data = await _api.post(
      '/restaurant/orders/$orderId/cancel',
      body: {'reason': reason},
    );
    return _one(data, RestaurantOrder.fromJson, 'order');
  }

  // ------------------------------------------------------- kitchen & summary --

  Future<List<KitchenTicket>> kitchen() async {
    try {
      final data = await _api.get('/restaurant/kitchen');
      final list = data is Map ? data['orders'] : data;
      if (list is List) {
        return list.whereType<Map>().map(KitchenTicket.fromJson).toList();
      }
      return const [];
    } on ApiException catch (e) {
      if (e.isMissingEndpoint) return const [];
      rethrow;
    }
  }

  Future<RestaurantSummary?> summary() async {
    try {
      final data = await _api.get('/restaurant/summary');
      return data is Map ? RestaurantSummary.fromJson(data) : null;
    } on ApiException catch (e) {
      if (e.isMissingEndpoint) return null;
      rethrow;
    }
  }

  /// Checked-in guests, for the ROOM_CHARGE picker. Reuses the reservations
  /// surface (CHECKED_IN filter). Degrades to empty when the cashier cannot
  /// read reservations or the endpoint is not live.
  Future<List<InHouseGuest>> inHouseGuests({String? query}) async {
    try {
      final data = await _api.get(
        '/reservations',
        query: {
          'status': 'CHECKED_IN',
          if (query != null && query.isNotEmpty) 'q': query,
        },
      );
      return _listOf(data, InHouseGuest.fromJson);
    } on ApiException catch (e) {
      if (e.isMissingEndpoint ||
          e.code == ApiErrorCodes.forbidden ||
          e.code == RestaurantErrors.staffForbidden) {
        return const [];
      }
      rethrow;
    }
  }

  // ---------------------------------------------------------------- helpers --

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

final restaurantRepositoryProvider = Provider<RestaurantRepository>(
  (ref) => RestaurantRepository(ref.watch(apiClientProvider)),
);

/// The codes these endpoints return, mapped to copy someone can act on.
/// Anything unlisted keeps the server's own message — it is written for staff.
class RestaurantErrors {
  RestaurantErrors._();

  static const tableNotFound = 'TABLE_NOT_FOUND';
  static const tableOccupied = 'TABLE_OCCUPIED';
  static const tableUnavailable = 'TABLE_UNAVAILABLE';
  static const menuItemNotFound = 'MENU_ITEM_NOT_FOUND';
  static const menuItemUnavailable = 'MENU_ITEM_UNAVAILABLE';
  static const orderNotFound = 'ORDER_NOT_FOUND';
  static const orderNotOpen = 'ORDER_NOT_OPEN';
  static const orderNotBilled = 'ORDER_NOT_BILLED';
  static const emptyBill = 'EMPTY_BILL';
  static const orderHasServedItems = 'ORDER_HAS_SERVED_ITEMS';
  static const itemCancelTooLate = 'ITEM_CANCEL_TOO_LATE';
  static const invalidKotTransition = 'INVALID_KOT_TRANSITION';
  static const kotNotPermittedForRole = 'KOT_NOT_PERMITTED_FOR_ROLE';
  static const reservationRequired = 'RESERVATION_REQUIRED';
  static const reservationNotInHouse = 'RESERVATION_NOT_IN_HOUSE';
  static const duplicateName = 'DUPLICATE_NAME';
  static const staffForbidden = 'STAFF_FORBIDDEN';

  static String friendly(ApiException error) => switch (error.code) {
    tableOccupied =>
      'That table already has an open order. Open it from the table instead.',
    tableUnavailable =>
      'That table is blocked and cannot take an order right now.',
    menuItemUnavailable =>
      'That dish is off the menu right now. The kitchen has 86’d it.',
    orderNotOpen => 'This order has moved on and can no longer be changed.',
    orderNotBilled => 'Run the bill before settling it.',
    emptyBill => 'There is nothing to bill — every line was cancelled.',
    orderHasServedItems =>
      'Food has already gone out on this order. Bill it rather than cancelling.',
    itemCancelTooLate =>
      'The kitchen has started this dish. A manager must void it now.',
    reservationRequired => 'Pick the in-house guest to charge the room.',
    reservationNotInHouse =>
      'That guest is not checked in here. A room charge needs a current in-house stay.',
    duplicateName => 'That name is already in use at this property.',
    staffForbidden ||
    ApiErrorCodes.forbidden => "Your role doesn't allow this action.",
    _ => error.message,
  };
}
