import 'package:flutter/foundation.dart';

import '../../../core/widgets/status_badge.dart';
import '../../rooms/data/room_models.dart' show formatPaise;

export '../../rooms/data/room_models.dart' show formatPaise;

// ---------------------------------------------------------------- parsing --

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

String? _wire(dynamic value) {
  final text = _str(value);
  return text?.toUpperCase().replaceAll(RegExp(r'[\s-]+'), '_');
}

List<Map> _mapList(dynamic value) =>
    value is List ? value.whereType<Map>().toList() : const <Map>[];

// ------------------------------------------------------------------ enums --

enum StockMovementType {
  incoming('IN', 'Stock in'),
  outgoing('OUT', 'Issue'),
  adjust('ADJUST', 'Adjust'),
  wastage('WASTAGE', 'Wastage');

  const StockMovementType(this.wire, this.label);
  final String wire;
  final String label;

  static StockMovementType fromWire(String? value) {
    final w = _wire(value);
    for (final t in values) {
      if (t.wire == w) return t;
    }
    return StockMovementType.adjust;
  }

  StatusTone get tone => switch (this) {
    StockMovementType.incoming => StatusTone.healthy,
    StockMovementType.outgoing => StatusTone.info,
    StockMovementType.adjust => StatusTone.neutral,
    StockMovementType.wastage => StatusTone.critical,
  };
}

enum PurchaseOrderStatus {
  draft('DRAFT', 'Draft'),
  sent('SENT', 'Sent'),
  received('RECEIVED', 'Received'),
  cancelled('CANCELLED', 'Cancelled');

  const PurchaseOrderStatus(this.wire, this.label);
  final String wire;
  final String label;

  static PurchaseOrderStatus fromWire(String? value) {
    final w = _wire(value);
    for (final s in values) {
      if (s.wire == w) return s;
    }
    return PurchaseOrderStatus.draft;
  }

  StatusTone get tone => switch (this) {
    PurchaseOrderStatus.draft => StatusTone.neutral,
    PurchaseOrderStatus.sent => StatusTone.info,
    PurchaseOrderStatus.received => StatusTone.healthy,
    PurchaseOrderStatus.cancelled => StatusTone.critical,
  };

  bool get isEditable => this == PurchaseOrderStatus.draft;
  bool get canReceive => this == PurchaseOrderStatus.sent;
}

// ------------------------------------------------------------------ models --

@immutable
class InventoryItem {
  const InventoryItem({
    required this.id,
    required this.name,
    required this.sku,
    required this.unit,
    required this.reorderLevel,
    required this.currentQty,
    required this.unitCostPaise,
    required this.stockValuePaise,
    required this.lowStock,
    this.category,
  });

  final String id;
  final String name;
  final String sku;
  final String unit;
  final int reorderLevel;
  final int currentQty;
  final int unitCostPaise;
  final int stockValuePaise;
  final bool lowStock;
  final String? category;

  StatusTone get tone => lowStock ? StatusTone.warning : StatusTone.available;

  static InventoryItem fromJson(Map json) => InventoryItem(
    id: (_pick(json, ['id']) ?? '').toString(),
    name: _str(_pick(json, ['name'])) ?? 'Item',
    sku: _str(_pick(json, ['sku'])) ?? '—',
    unit: _str(_pick(json, ['unit'])) ?? 'pcs',
    reorderLevel: _int(_pick(json, ['reorderLevel'])),
    currentQty: _int(_pick(json, ['currentQty'])),
    unitCostPaise: _int(_pick(json, ['unitCostPaise'])),
    stockValuePaise: _int(_pick(json, ['stockValuePaise'])),
    lowStock: _bool(_pick(json, ['lowStock'])),
    category: _str(_pick(json, ['category'])),
  );
}

@immutable
class StockMovement {
  const StockMovement({
    required this.id,
    required this.itemId,
    required this.type,
    required this.qty,
    required this.qtyDelta,
    required this.balanceAfter,
    this.reason,
    this.createdAt,
  });

  final String id;
  final String itemId;
  final StockMovementType type;
  final int qty;
  final int qtyDelta;
  final int balanceAfter;
  final String? reason;
  final DateTime? createdAt;

  static StockMovement fromJson(Map json) => StockMovement(
    id: (_pick(json, ['id']) ?? '').toString(),
    itemId: (_pick(json, ['itemId']) ?? '').toString(),
    type: StockMovementType.fromWire(_pick(json, ['type'])?.toString()),
    qty: _int(_pick(json, ['qty'])),
    qtyDelta: _int(_pick(json, ['qtyDelta'])),
    balanceAfter: _int(_pick(json, ['balanceAfter'])),
    reason: _str(_pick(json, ['reason'])),
    createdAt: _date(_pick(json, ['createdAt'])),
  );
}

@immutable
class Supplier {
  const Supplier({
    required this.id,
    required this.name,
    this.contact,
    this.phone,
    this.email,
  });

  final String id;
  final String name;
  final String? contact;
  final String? phone;
  final String? email;

  static Supplier fromJson(Map json) => Supplier(
    id: (_pick(json, ['id']) ?? '').toString(),
    name: _str(_pick(json, ['name'])) ?? 'Supplier',
    contact: _str(_pick(json, ['contact'])),
    phone: _str(_pick(json, ['phone'])),
    email: _str(_pick(json, ['email'])),
  );
}

@immutable
class PurchaseOrderLine {
  const PurchaseOrderLine({
    required this.itemId,
    required this.nameSnapshot,
    required this.unitSnapshot,
    required this.qty,
    required this.unitPricePaise,
    required this.lineTotalPaise,
  });

  final String itemId;
  final String nameSnapshot;
  final String unitSnapshot;
  final int qty;
  final int unitPricePaise;
  final int lineTotalPaise;

  static PurchaseOrderLine fromJson(Map json) => PurchaseOrderLine(
    itemId: (_pick(json, ['itemId']) ?? '').toString(),
    nameSnapshot: _str(_pick(json, ['nameSnapshot'])) ?? 'Item',
    unitSnapshot: _str(_pick(json, ['unitSnapshot'])) ?? 'pcs',
    qty: _int(_pick(json, ['qty'])),
    unitPricePaise: _int(_pick(json, ['unitPricePaise'])),
    lineTotalPaise: _int(_pick(json, ['lineTotalPaise'])),
  );
}

@immutable
class PurchaseOrder {
  const PurchaseOrder({
    required this.id,
    required this.poNumber,
    required this.status,
    required this.lines,
    required this.totalPaise,
    this.supplierId,
    this.supplierName,
    this.note,
    this.receivedAt,
  });

  final String id;
  final String poNumber;
  final PurchaseOrderStatus status;
  final List<PurchaseOrderLine> lines;
  final int totalPaise;
  final String? supplierId;
  final String? supplierName;
  final String? note;
  final DateTime? receivedAt;

  String get totalLabel => formatPaise(totalPaise);

  static PurchaseOrder fromJson(Map json) => PurchaseOrder(
    id: (_pick(json, ['id']) ?? '').toString(),
    poNumber: _str(_pick(json, ['poNumber'])) ?? '—',
    status: PurchaseOrderStatus.fromWire(_pick(json, ['status'])?.toString()),
    lines: _mapList(
      _pick(json, ['lines']),
    ).map(PurchaseOrderLine.fromJson).toList(),
    totalPaise: _int(_pick(json, ['totalPaise'])),
    supplierId: _str(_pick(json, ['supplierId'])),
    supplierName: _str(_pick(json, ['supplierName'])),
    note: _str(_pick(json, ['note'])),
    receivedAt: _date(_pick(json, ['receivedAt'])),
  );
}

@immutable
class InventorySummary {
  const InventorySummary({
    required this.itemCount,
    required this.unitsOnHand,
    required this.stockValuePaise,
    required this.lowStockCount,
    required this.pendingPoCount,
  });

  final int itemCount;
  final int unitsOnHand;
  final int stockValuePaise;
  final int lowStockCount;
  final int pendingPoCount;

  static InventorySummary fromJson(Map json) => InventorySummary(
    itemCount: _int(_pick(json, ['itemCount'])),
    unitsOnHand: _int(_pick(json, ['unitsOnHand'])),
    stockValuePaise: _int(_pick(json, ['stockValuePaise'])),
    lowStockCount: _int(_pick(json, ['lowStockCount'])),
    pendingPoCount: _int(_pick(json, ['pendingPoCount'])),
  );
}
