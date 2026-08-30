import 'package:flutter/foundation.dart';

import '../../../core/widgets/status_badge.dart';

/// The work-order lifecycle, mirroring the server's `canTransition` map in
/// `src/modules/housekeeping/work-order-transitions.ts`:
///
///   OPEN → ACCEPTED → IN_PROGRESS ⇄ PAUSED → COMPLETED
///   any non-terminal → CANCELLED
///
/// Unknown wire values resolve to [open] so a newer backend never crashes the
/// queue.
enum WoStatus {
  open,
  accepted,
  inProgress,
  paused,
  completed,
  cancelled;

  static WoStatus fromWire(String? v) => switch (v?.toUpperCase()) {
    'OPEN' => WoStatus.open,
    'ACCEPTED' => WoStatus.accepted,
    'IN_PROGRESS' => WoStatus.inProgress,
    'PAUSED' => WoStatus.paused,
    'COMPLETED' => WoStatus.completed,
    'CANCELLED' => WoStatus.cancelled,
    _ => WoStatus.open,
  };

  String get label => switch (this) {
    WoStatus.open => 'Open',
    WoStatus.accepted => 'Accepted',
    WoStatus.inProgress => 'In progress',
    WoStatus.paused => 'Paused',
    WoStatus.completed => 'Completed',
    WoStatus.cancelled => 'Cancelled',
  };

  StatusTone get tone => switch (this) {
    WoStatus.open => StatusTone.dirty,
    WoStatus.accepted => StatusTone.occupied,
    WoStatus.inProgress => StatusTone.cleaning,
    WoStatus.paused => StatusTone.warning,
    WoStatus.completed => StatusTone.healthy,
    WoStatus.cancelled => StatusTone.neutral,
  };

  bool get isTerminal =>
      this == WoStatus.completed || this == WoStatus.cancelled;
}

enum WoPriority {
  low,
  normal,
  high,
  critical;

  static WoPriority fromWire(String? v) => switch (v?.toUpperCase()) {
    'CRITICAL' => WoPriority.critical,
    'HIGH' => WoPriority.high,
    'LOW' => WoPriority.low,
    _ => WoPriority.normal,
  };

  String get wire => switch (this) {
    WoPriority.low => 'LOW',
    WoPriority.normal => 'NORMAL',
    WoPriority.high => 'HIGH',
    WoPriority.critical => 'CRITICAL',
  };

  String get label => switch (this) {
    WoPriority.low => 'Low',
    WoPriority.normal => 'Normal',
    WoPriority.high => 'High',
    WoPriority.critical => 'Critical',
  };

  StatusTone get tone => switch (this) {
    WoPriority.low => StatusTone.neutral,
    WoPriority.normal => StatusTone.info,
    WoPriority.high => StatusTone.warning,
    WoPriority.critical => StatusTone.critical,
  };
}

/// One consumed part on a completed order.
@immutable
class WorkOrderPart {
  const WorkOrderPart({required this.name, this.qty});

  final String name;
  final int? qty;

  Map<String, dynamic> toJson() => {'name': name, if (qty != null) 'qty': qty};

  factory WorkOrderPart.fromJson(Map j) => WorkOrderPart(
    name: (j['name'] ?? '').toString(),
    qty: (j['qty'] as num?)?.toInt(),
  );
}

@immutable
class WorkOrder {
  const WorkOrder({
    required this.id,
    required this.number,
    required this.title,
    required this.status,
    required this.priority,
    this.description,
    this.roomId,
    this.roomNumber,
    this.reporterName,
    this.assignedStaffId,
    this.assigneeName,
    this.resolution,
    this.partsUsed = const [],
    this.takesRoomOutOfService = false,
    this.cancelReason,
    this.createdAt,
    this.pendingSync = false,
  });

  final String id;
  final String number;
  final String title;
  final WoStatus status;
  final WoPriority priority;
  final String? description;
  final String? roomId;
  final String? roomNumber;
  final String? reporterName;
  final String? assignedStaffId;
  final String? assigneeName;
  final String? resolution;
  final List<WorkOrderPart> partsUsed;
  final bool takesRoomOutOfService;
  final String? cancelReason;
  final DateTime? createdAt;
  final bool pendingSync;

  String get headline =>
      roomNumber?.isNotEmpty == true ? 'Room $roomNumber' : number;

  /// The technician verbs available from the current state, in button order.
  List<WoAction> get actions => switch (status) {
    WoStatus.open => const [WoAction.accept],
    WoStatus.accepted => const [WoAction.start],
    WoStatus.inProgress => const [WoAction.pause, WoAction.complete],
    WoStatus.paused => const [WoAction.resume],
    _ => const [],
  };

  WorkOrder copyWith({WoStatus? status, bool? pendingSync}) => WorkOrder(
    id: id,
    number: number,
    title: title,
    status: status ?? this.status,
    priority: priority,
    description: description,
    roomId: roomId,
    roomNumber: roomNumber,
    reporterName: reporterName,
    assignedStaffId: assignedStaffId,
    assigneeName: assigneeName,
    resolution: resolution,
    partsUsed: partsUsed,
    takesRoomOutOfService: takesRoomOutOfService,
    cancelReason: cancelReason,
    createdAt: createdAt,
    pendingSync: pendingSync ?? this.pendingSync,
  );

  factory WorkOrder.fromJson(Map j) => WorkOrder(
    id: (j['id'] ?? '').toString(),
    number: (j['workOrderNumber'] ?? '').toString(),
    title: (j['title'] ?? '').toString(),
    status: WoStatus.fromWire(j['status'] as String?),
    priority: WoPriority.fromWire(j['priority'] as String?),
    description: j['description'] as String?,
    roomId: j['roomId'] as String?,
    roomNumber: j['roomNumber'] as String?,
    reporterName: j['reporterName'] as String?,
    assignedStaffId: j['assignedStaffId'] as String?,
    assigneeName: j['assigneeName'] as String?,
    resolution: j['resolution'] as String?,
    partsUsed: (j['partsUsed'] is List)
        ? (j['partsUsed'] as List)
              .whereType<Map>()
              .map(WorkOrderPart.fromJson)
              .toList()
        : const [],
    takesRoomOutOfService: j['takesRoomOutOfService'] == true,
    cancelReason: j['cancelReason'] as String?,
    createdAt: DateTime.tryParse((j['createdAt'] ?? '').toString())?.toLocal(),
  );
}

/// A technician action, its wire verb and the permission that gates it.
enum WoAction {
  accept,
  start,
  pause,
  resume,
  complete;

  String get verb => switch (this) {
    WoAction.accept => 'accept',
    WoAction.start => 'start',
    WoAction.pause => 'pause',
    WoAction.resume => 'resume',
    WoAction.complete => 'complete',
  };

  String get label => switch (this) {
    WoAction.accept => 'Accept',
    WoAction.start => 'Start',
    WoAction.pause => 'Pause',
    WoAction.resume => 'Resume',
    WoAction.complete => 'Complete',
  };
}

/// The payload for raising a work order — used by Report Issue and the
/// technician's own "new order" flow.
@immutable
class NewWorkOrder {
  const NewWorkOrder({
    required this.title,
    this.description,
    this.roomId,
    this.priority = WoPriority.normal,
    this.takesRoomOutOfService = false,
  });

  final String title;
  final String? description;
  final String? roomId;
  final WoPriority priority;
  final bool takesRoomOutOfService;

  Map<String, dynamic> toJson() => {
    'title': title,
    if (description != null && description!.isNotEmpty)
      'description': description,
    if (roomId != null) 'roomId': roomId,
    'priority': priority.wire,
    'takesRoomOutOfService': takesRoomOutOfService,
  };
}
