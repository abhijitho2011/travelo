import 'package:flutter/foundation.dart';

import '../../../core/widgets/status_badge.dart';

/// The KPI block on the management dashboard.
///
/// Every field is nullable: the backend fills in what it has, and the UI shows
/// an em dash for anything missing rather than inventing a number.
@immutable
class HotelSnapshot {
  const HotelSnapshot({
    this.occupancyPct,
    this.occupancyDelta,
    this.arrivals,
    this.departures,
    this.inHouse,
    this.revenueToday,
    this.revenueDelta,
    this.adr,
    this.availableRooms,
    this.asOf,
  });

  final num? occupancyPct;
  final num? occupancyDelta;
  final int? arrivals;
  final int? departures;
  final int? inHouse;
  final num? revenueToday;
  final num? revenueDelta;
  final num? adr;
  final int? availableRooms;
  final DateTime? asOf;

  static int? _int(Object? v) => (v as num?)?.toInt();

  factory HotelSnapshot.fromJson(Map json) => HotelSnapshot(
    occupancyPct: json['occupancyPct'] as num? ?? json['occupancy'] as num?,
    occupancyDelta: json['occupancyDelta'] as num?,
    arrivals: _int(json['arrivals']),
    departures: _int(json['departures']),
    inHouse: _int(json['inHouse']),
    revenueToday: json['revenueToday'] as num? ?? json['revenue'] as num?,
    revenueDelta: json['revenueDelta'] as num?,
    adr: json['adr'] as num?,
    availableRooms: _int(json['availableRooms']),
    asOf: DateTime.tryParse((json['asOf'] ?? '').toString())?.toLocal(),
  );
}

/// One operational alert card — dirty rooms, open maintenance, pending
/// approvals, security incidents.
@immutable
class OperationalAlert {
  const OperationalAlert({
    required this.id,
    required this.title,
    required this.count,
    required this.severity,
    this.detail,
    this.route,
  });

  final String id;
  final String title;
  final int count;
  final StatusTone severity;
  final String? detail;
  final String? route;

  factory OperationalAlert.fromJson(Map json) => OperationalAlert(
    id: (json['id'] ?? json['key'] ?? '').toString(),
    title: (json['title'] as String?) ?? 'Alert',
    count: (json['count'] as num?)?.toInt() ?? 0,
    severity: switch ((json['severity'] as String?)?.toLowerCase()) {
      'critical' => StatusTone.critical,
      'warning' => StatusTone.warning,
      'healthy' => StatusTone.healthy,
      _ => StatusTone.neutral,
    },
    detail: json['detail'] as String?,
    route: json['route'] as String?,
  );
}

enum ApprovalKind {
  staff,
  discount,
  refund,
  purchase,
  expense,
  leave,
  other;

  static ApprovalKind fromWire(String? v) => switch (v?.toLowerCase()) {
    'staff' || 'staff_approval' => ApprovalKind.staff,
    'discount' => ApprovalKind.discount,
    'refund' => ApprovalKind.refund,
    'purchase' || 'purchase_order' => ApprovalKind.purchase,
    'expense' => ApprovalKind.expense,
    'leave' => ApprovalKind.leave,
    _ => ApprovalKind.other,
  };

  String get label => switch (this) {
    ApprovalKind.staff => 'New team member',
    ApprovalKind.discount => 'Discount',
    ApprovalKind.refund => 'Refund',
    ApprovalKind.purchase => 'Purchase',
    ApprovalKind.expense => 'Expense',
    ApprovalKind.leave => 'Leave',
    ApprovalKind.other => 'Approval',
  };
}

/// An item in the approval centre. Staff waiting for approval are folded into
/// the same list as every other approval type, so a GM has one queue.
@immutable
class ApprovalItem {
  const ApprovalItem({
    required this.id,
    required this.kind,
    required this.title,
    this.subtitle,
    this.requestedBy,
    this.requestedAt,
    this.amount,
  });

  final String id;
  final ApprovalKind kind;
  final String title;
  final String? subtitle;
  final String? requestedBy;
  final DateTime? requestedAt;
  final num? amount;

  factory ApprovalItem.fromJson(Map json) => ApprovalItem(
    id: (json['id'] ?? '').toString(),
    kind: ApprovalKind.fromWire(
      json['type'] as String? ?? json['kind'] as String?,
    ),
    title: (json['title'] as String?) ?? 'Approval request',
    subtitle: json['subtitle'] as String?,
    requestedBy: json['requestedBy'] as String?,
    requestedAt: DateTime.tryParse(
      (json['requestedAt'] ?? json['createdAt'] ?? '').toString(),
    )?.toLocal(),
    amount: json['amount'] as num?,
  );
}
