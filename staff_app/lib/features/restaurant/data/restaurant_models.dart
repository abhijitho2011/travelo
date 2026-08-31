import 'package:flutter/foundation.dart';

import '../../../core/widgets/status_badge.dart';
import '../../rooms/data/room_models.dart' show formatPaise;

export '../../rooms/data/room_models.dart' show formatPaise;

// ---------------------------------------------------------------- parsing --
//
// Same contract as the rooms and reception features: the server owns the shape,
// but a client that throws on one missing key strands the whole outlet. Every
// reader below takes what it can and falls back to something honest, so a field
// the backend adds or renames costs a value, never the screen.

dynamic _pick(Map json, List<String> keys) {
  for (final key in keys) {
    final value = json[key];
    if (value != null) return value;
  }
  return null;
}

int _int(dynamic value, [int fallback = 0]) {
  if (value is int) return value;
  if (value is num) return value.round();
  return int.tryParse((value ?? '').toString()) ?? fallback;
}

bool _bool(dynamic value, [bool fallback = false]) {
  if (value is bool) return value;
  if (value is num) return value != 0;
  final t = value?.toString().toLowerCase();
  if (t == 'true') return true;
  if (t == 'false') return false;
  return fallback;
}

String? _str(dynamic value) {
  final text = value?.toString().trim();
  return (text == null || text.isEmpty) ? null : text;
}

DateTime? _date(dynamic value) =>
    DateTime.tryParse((value ?? '').toString())?.toLocal();

/// SCREAMING_SNAKE, however the caller typed it.
String? _wire(dynamic value) {
  final text = _str(value);
  return text?.toUpperCase().replaceAll(RegExp(r'[\s-]+'), '_');
}

List<Map> _mapList(dynamic value) =>
    value is List ? value.whereType<Map>().toList() : const <Map>[];

// ------------------------------------------------------------------ enums --

enum RestaurantTableStatus {
  open('OPEN', 'Open'),
  occupied('OCCUPIED', 'Occupied'),
  billed('BILLED', 'Billed'),
  blocked('BLOCKED', 'Blocked');

  const RestaurantTableStatus(this.wire, this.label);

  final String wire;
  final String label;

  StatusTone get tone => switch (this) {
    RestaurantTableStatus.open => StatusTone.available,
    RestaurantTableStatus.occupied => StatusTone.occupied,
    RestaurantTableStatus.billed => StatusTone.info,
    RestaurantTableStatus.blocked => StatusTone.outOfOrder,
  };

  /// Falls back to OPEN — the least committal state, so an unknown value never
  /// makes a table look taken.
  static RestaurantTableStatus fromWire(String? value) {
    final w = _wire(value);
    for (final s in values) {
      if (s.wire == w) return s;
    }
    return RestaurantTableStatus.open;
  }
}

enum MenuItemStatus {
  active('ACTIVE', 'Available'),
  unavailable('UNAVAILABLE', 'Unavailable'),
  archived('ARCHIVED', 'Archived');

  const MenuItemStatus(this.wire, this.label);

  final String wire;
  final String label;

  bool get isOrderable => this == MenuItemStatus.active;

  static MenuItemStatus fromWire(String? value) {
    final w = _wire(value);
    for (final s in values) {
      if (s.wire == w) return s;
    }
    return MenuItemStatus.active;
  }
}

enum OrderStatus {
  open('OPEN', 'Open'),
  billed('BILLED', 'Billed'),
  paid('PAID', 'Paid'),
  cancelled('CANCELLED', 'Cancelled');

  const OrderStatus(this.wire, this.label);

  final String wire;
  final String label;

  StatusTone get tone => switch (this) {
    OrderStatus.open => StatusTone.occupied,
    OrderStatus.billed => StatusTone.warning,
    OrderStatus.paid => StatusTone.healthy,
    OrderStatus.cancelled => StatusTone.neutral,
  };

  bool get isOpen => this == OrderStatus.open;
  bool get isBilled => this == OrderStatus.billed;

  static OrderStatus fromWire(String? value) {
    final w = _wire(value);
    for (final s in values) {
      if (s.wire == w) return s;
    }
    return OrderStatus.open;
  }
}

/// The KOT line lifecycle, mirroring the server's state machine so the app only
/// ever offers a move the API would accept.
enum KotStatus {
  newTicket('NEW', 'New'),
  preparing('PREPARING', 'Preparing'),
  ready('READY', 'Ready'),
  served('SERVED', 'Served'),
  cancelled('CANCELLED', 'Cancelled');

  const KotStatus(this.wire, this.label);

  final String wire;
  final String label;

  StatusTone get tone => switch (this) {
    KotStatus.newTicket => StatusTone.info,
    KotStatus.preparing => StatusTone.warning,
    KotStatus.ready => StatusTone.healthy,
    KotStatus.served => StatusTone.neutral,
    KotStatus.cancelled => StatusTone.critical,
  };

  /// A line still on the pass — the kitchen display cares about these.
  bool get isActiveInKitchen =>
      this == KotStatus.newTicket ||
      this == KotStatus.preparing ||
      this == KotStatus.ready;

  /// The chef advances NEW → PREPARING → READY.
  bool get chefCanStart => this == KotStatus.newTicket;
  bool get chefCanReady =>
      this == KotStatus.newTicket || this == KotStatus.preparing;

  /// The waiter marks a plated line SERVED.
  bool get waiterCanServe =>
      this == KotStatus.preparing || this == KotStatus.ready;

  /// A line can be cancelled by the waiter only while still NEW.
  bool get canCancel => this == KotStatus.newTicket;

  static KotStatus fromWire(String? value) {
    final w = _wire(value);
    for (final s in values) {
      if (s.wire == w) return s;
    }
    return KotStatus.newTicket;
  }
}

enum PaymentMethod {
  cash('CASH', 'Cash'),
  card('CARD', 'Card'),
  upi('UPI', 'UPI'),
  roomCharge('ROOM_CHARGE', 'Room charge');

  const PaymentMethod(this.wire, this.label);

  final String wire;
  final String label;

  bool get isRoomCharge => this == PaymentMethod.roomCharge;

  static PaymentMethod? fromWire(String? value) {
    final w = _wire(value);
    for (final m in values) {
      if (m.wire == w) return m;
    }
    return null;
  }
}

// ------------------------------------------------------------------ models --

@immutable
class RestaurantTable {
  const RestaurantTable({
    required this.id,
    required this.name,
    required this.seats,
    required this.status,
  });

  final String id;
  final String name;
  final int seats;
  final RestaurantTableStatus status;

  factory RestaurantTable.fromJson(Map json) => RestaurantTable(
    id: _str(_pick(json, ['id'])) ?? '',
    name: _str(_pick(json, ['name'])) ?? '—',
    seats: _int(_pick(json, ['seats']), 2),
    status: RestaurantTableStatus.fromWire(_str(_pick(json, ['status']))),
  );
}

@immutable
class MenuItem {
  const MenuItem({
    required this.id,
    required this.categoryId,
    required this.name,
    required this.pricePaise,
    required this.veg,
    required this.status,
    this.description,
  });

  final String id;
  final String categoryId;
  final String name;
  final int pricePaise;
  final bool veg;
  final MenuItemStatus status;
  final String? description;

  String get priceLabel => formatPaise(pricePaise);

  factory MenuItem.fromJson(Map json) => MenuItem(
    id: _str(_pick(json, ['id'])) ?? '',
    categoryId: _str(_pick(json, ['categoryId', 'category_id'])) ?? '',
    name: _str(_pick(json, ['name'])) ?? '—',
    pricePaise: _int(_pick(json, ['pricePaise', 'price_paise'])),
    veg: _bool(_pick(json, ['veg']), true),
    status: MenuItemStatus.fromWire(_str(_pick(json, ['status']))),
    description: _str(_pick(json, ['description'])),
  );
}

@immutable
class MenuCategory {
  const MenuCategory({
    required this.id,
    required this.name,
    required this.sortOrder,
    required this.items,
  });

  final String id;
  final String name;
  final int sortOrder;
  final List<MenuItem> items;

  factory MenuCategory.fromJson(Map json) => MenuCategory(
    id: _str(_pick(json, ['id'])) ?? '',
    name: _str(_pick(json, ['name'])) ?? '—',
    sortOrder: _int(_pick(json, ['sortOrder', 'sort_order'])),
    items: _mapList(_pick(json, ['items'])).map(MenuItem.fromJson).toList(),
  );
}

@immutable
class OrderLine {
  const OrderLine({
    required this.id,
    required this.name,
    required this.pricePaise,
    required this.qty,
    required this.lineTotalPaise,
    required this.kotStatus,
    this.notes,
    this.menuItemId,
  });

  final String id;
  final String name;
  final int pricePaise;
  final int qty;
  final int lineTotalPaise;
  final KotStatus kotStatus;
  final String? notes;
  final String? menuItemId;

  String get priceLabel => formatPaise(pricePaise);
  String get lineTotalLabel => formatPaise(lineTotalPaise);

  factory OrderLine.fromJson(Map json) {
    final price = _int(
      _pick(json, ['pricePaise', 'price_paise_snapshot', 'pricePaiseSnapshot']),
    );
    final qty = _int(_pick(json, ['qty']), 1);
    return OrderLine(
      id: _str(_pick(json, ['id'])) ?? '',
      name: _str(_pick(json, ['name', 'nameSnapshot', 'name_snapshot'])) ?? '—',
      pricePaise: price,
      qty: qty,
      lineTotalPaise: _int(_pick(json, ['lineTotalPaise']), price * qty),
      kotStatus: KotStatus.fromWire(
        _str(_pick(json, ['kotStatus', 'kot_status'])),
      ),
      notes: _str(_pick(json, ['notes'])),
      menuItemId: _str(_pick(json, ['menuItemId', 'menu_item_id'])),
    );
  }
}

@immutable
class RestaurantOrder {
  const RestaurantOrder({
    required this.id,
    required this.orderNumber,
    required this.status,
    required this.guestCount,
    required this.subtotalPaise,
    required this.taxPaise,
    required this.totalPaise,
    required this.items,
    this.tableId,
    this.tableName,
    this.paymentMethod,
    this.reservationId,
    this.createdAt,
    this.billedAt,
    this.paidAt,
  });

  final String id;
  final String orderNumber;
  final OrderStatus status;
  final int guestCount;
  final int subtotalPaise;
  final int taxPaise;
  final int totalPaise;
  final List<OrderLine> items;
  final String? tableId;
  final String? tableName;
  final PaymentMethod? paymentMethod;
  final String? reservationId;
  final DateTime? createdAt;
  final DateTime? billedAt;
  final DateTime? paidAt;

  bool get isTakeaway => tableId == null;
  String get where => tableName ?? (isTakeaway ? 'Takeaway' : '—');

  String get subtotalLabel => formatPaise(subtotalPaise);
  String get taxLabel => formatPaise(taxPaise);
  String get totalLabel => formatPaise(totalPaise);

  /// Lines that count towards the bill (everything not cancelled).
  List<OrderLine> get activeItems =>
      items.where((i) => i.kotStatus != KotStatus.cancelled).toList();

  int get activeItemCount => activeItems.fold(0, (sum, i) => sum + i.qty);

  /// The subtotal from the live lines, for showing a running total before the
  /// bill is actually run on the server.
  int get runningSubtotalPaise =>
      activeItems.fold(0, (sum, i) => sum + i.lineTotalPaise);

  String get runningSubtotalLabel => formatPaise(runningSubtotalPaise);

  factory RestaurantOrder.fromJson(Map json) => RestaurantOrder(
    id: _str(_pick(json, ['id'])) ?? '',
    orderNumber: _str(_pick(json, ['orderNumber', 'order_number'])) ?? '—',
    status: OrderStatus.fromWire(_str(_pick(json, ['status']))),
    guestCount: _int(_pick(json, ['guestCount', 'guest_count']), 1),
    subtotalPaise: _int(_pick(json, ['subtotalPaise', 'subtotal_paise'])),
    taxPaise: _int(_pick(json, ['taxPaise', 'tax_paise'])),
    totalPaise: _int(_pick(json, ['totalPaise', 'total_paise'])),
    items: _mapList(_pick(json, ['items'])).map(OrderLine.fromJson).toList(),
    tableId: _str(_pick(json, ['tableId', 'table_id'])),
    tableName: _str(_pick(json, ['tableName', 'table_name'])),
    paymentMethod: PaymentMethod.fromWire(
      _str(_pick(json, ['paymentMethod', 'payment_method'])),
    ),
    reservationId: _str(_pick(json, ['reservationId', 'reservation_id'])),
    createdAt: _date(_pick(json, ['createdAt', 'created_at'])),
    billedAt: _date(_pick(json, ['billedAt', 'billed_at'])),
    paidAt: _date(_pick(json, ['paidAt', 'paid_at'])),
  );
}

/// One order's worth of tickets on the kitchen display.
@immutable
class KitchenTicket {
  const KitchenTicket({
    required this.orderId,
    required this.orderNumber,
    required this.where,
    required this.guestCount,
    required this.elapsedSeconds,
    required this.items,
  });

  final String orderId;
  final String orderNumber;
  final String where;
  final int guestCount;
  final int elapsedSeconds;
  final List<OrderLine> items;

  /// A ticket that has been on the pass too long is flagged. 15 minutes.
  bool get isLate => elapsedSeconds >= 15 * 60;

  String get elapsedLabel {
    final m = elapsedSeconds ~/ 60;
    if (m < 1) return 'just now';
    if (m < 60) return '${m}m';
    final h = m ~/ 60;
    return '${h}h ${m % 60}m';
  }

  factory KitchenTicket.fromJson(Map json) => KitchenTicket(
    orderId: _str(_pick(json, ['orderId', 'order_id'])) ?? '',
    orderNumber: _str(_pick(json, ['orderNumber', 'order_number'])) ?? '—',
    where: _str(_pick(json, ['tableName', 'table_name'])) ?? 'Takeaway',
    guestCount: _int(_pick(json, ['guestCount', 'guest_count']), 1),
    elapsedSeconds: _int(_pick(json, ['elapsedSeconds', 'elapsed_seconds'])),
    items: _mapList(_pick(json, ['items'])).map(OrderLine.fromJson).toList(),
  );
}

/// The manager/cashier outlet summary — one call.
@immutable
class RestaurantSummary {
  const RestaurantSummary({
    required this.revenuePaise,
    required this.paidOrders,
    required this.openOrders,
    required this.tablesByStatus,
    required this.methodBreakdown,
  });

  final int revenuePaise;
  final int paidOrders;
  final int openOrders;
  final Map<RestaurantTableStatus, int> tablesByStatus;
  final Map<PaymentMethod, int> methodBreakdown;

  String get revenueLabel => formatPaise(revenuePaise);

  int get totalTables => tablesByStatus.values.fold(0, (sum, n) => sum + n);

  factory RestaurantSummary.fromJson(Map json) {
    final tables = <RestaurantTableStatus, int>{};
    final rawTables = _pick(json, ['tablesByStatus', 'tables_by_status']);
    if (rawTables is Map) {
      rawTables.forEach((k, v) {
        tables[RestaurantTableStatus.fromWire(k.toString())] = _int(v);
      });
    }
    final methods = <PaymentMethod, int>{};
    final rawMethods = _pick(json, ['methodBreakdown', 'method_breakdown']);
    if (rawMethods is Map) {
      rawMethods.forEach((k, v) {
        final m = PaymentMethod.fromWire(k.toString());
        if (m != null) {
          final revenue = v is Map
              ? _int(_pick(v, ['revenuePaise', 'revenue_paise']))
              : _int(v);
          methods[m] = revenue;
        }
      });
    }
    return RestaurantSummary(
      revenuePaise: _int(_pick(json, ['revenuePaise', 'revenue_paise'])),
      paidOrders: _int(_pick(json, ['paidOrders', 'paid_orders'])),
      openOrders: _int(_pick(json, ['openOrders', 'open_orders'])),
      tablesByStatus: tables,
      methodBreakdown: methods,
    );
  }
}

/// A checked-in guest, for the ROOM_CHARGE reservation picker.
@immutable
class InHouseGuest {
  const InHouseGuest({
    required this.id,
    required this.guestName,
    this.roomNumber,
    this.reservationNumber,
  });

  final String id;
  final String guestName;
  final String? roomNumber;
  final String? reservationNumber;

  String get subtitle => [
    if (roomNumber != null) 'Room $roomNumber',
    if (reservationNumber != null) reservationNumber,
  ].join(' · ');

  factory InHouseGuest.fromJson(Map json) => InHouseGuest(
    id: _str(_pick(json, ['id'])) ?? '',
    guestName: _str(_pick(json, ['guestName', 'guest_name'])) ?? '—',
    roomNumber: _str(_pick(json, ['roomNumber', 'room_number'])),
    reservationNumber: _str(
      _pick(json, ['reservationNumber', 'reservation_number']),
    ),
  );
}

/// A line the waiter has staged but not yet sent to the kitchen.
@immutable
class CartLine {
  const CartLine({required this.item, required this.qty, this.notes});

  final MenuItem item;
  final int qty;
  final String? notes;

  int get lineTotalPaise => item.pricePaise * qty;

  CartLine copyWith({int? qty, String? notes}) =>
      CartLine(item: item, qty: qty ?? this.qty, notes: notes ?? this.notes);

  Map<String, dynamic> toJson() => {
    'menuItemId': item.id,
    'qty': qty,
    if (notes != null && notes!.isNotEmpty) 'notes': notes,
  };
}
