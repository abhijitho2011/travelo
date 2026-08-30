import 'package:flutter/foundation.dart';

import '../../../core/widgets/status_badge.dart';

/// The housekeeping task lifecycle, mirroring the server's `canTransition` map
/// in `src/modules/housekeeping/task-transitions.ts`:
///
///   PENDING → IN_PROGRESS → COMPLETED → INSPECTED   (pass)
///                              COMPLETED → REJECTED  (fail)
///
/// An attendant only ever drives the first two edges (start, complete); the
/// supervisor inspects. Unknown wire values resolve to [pending] so a newer
/// backend never crashes the list.
enum HkTaskStatus {
  pending,
  inProgress,
  completed,
  inspected,
  rejected;

  static HkTaskStatus fromWire(String? v) => switch (v?.toUpperCase()) {
    'PENDING' => HkTaskStatus.pending,
    'IN_PROGRESS' => HkTaskStatus.inProgress,
    'COMPLETED' => HkTaskStatus.completed,
    'INSPECTED' => HkTaskStatus.inspected,
    'REJECTED' => HkTaskStatus.rejected,
    _ => HkTaskStatus.pending,
  };

  String get label => switch (this) {
    HkTaskStatus.pending => 'To do',
    HkTaskStatus.inProgress => 'In progress',
    HkTaskStatus.completed => 'Awaiting inspection',
    HkTaskStatus.inspected => 'Inspected',
    HkTaskStatus.rejected => 'Rejected',
  };

  StatusTone get tone => switch (this) {
    HkTaskStatus.pending => StatusTone.dirty,
    HkTaskStatus.inProgress => StatusTone.cleaning,
    HkTaskStatus.completed => StatusTone.inspected,
    HkTaskStatus.inspected => StatusTone.healthy,
    HkTaskStatus.rejected => StatusTone.critical,
  };

  /// The status the attendant's primary button moves the task to, or null when
  /// the attendant has nothing left to do (waiting on the supervisor, or done).
  HkTaskStatus? get attendantNext => switch (this) {
    HkTaskStatus.pending => HkTaskStatus.inProgress,
    HkTaskStatus.inProgress => HkTaskStatus.completed,
    _ => null,
  };

  /// The `/housekeeping/tasks/:id/<action>` verb for [attendantNext].
  String? get attendantAction => switch (this) {
    HkTaskStatus.pending => 'start',
    HkTaskStatus.inProgress => 'complete',
    _ => null,
  };

  String get actionLabel => switch (this) {
    HkTaskStatus.pending => 'Start',
    HkTaskStatus.inProgress => 'Mark complete',
    HkTaskStatus.completed => 'Awaiting inspection',
    HkTaskStatus.inspected => 'Inspected',
    HkTaskStatus.rejected => 'Rejected',
  };

  bool get isTerminal =>
      this == HkTaskStatus.inspected || this == HkTaskStatus.rejected;
}

enum HkPriority {
  low,
  normal,
  high;

  static HkPriority fromWire(String? v) => switch (v?.toUpperCase()) {
    'HIGH' => HkPriority.high,
    'LOW' => HkPriority.low,
    _ => HkPriority.normal,
  };

  String get label => switch (this) {
    HkPriority.low => 'Low',
    HkPriority.normal => 'Normal',
    HkPriority.high => 'High',
  };
}

/// Turns a `CHECKOUT_CLEAN` / `AREA_CLEAN` wire type into a human label.
String hkTaskTypeLabel(String? wire) => switch (wire?.toUpperCase()) {
  'CHECKOUT_CLEAN' => 'Checkout clean',
  'STAYOVER' => 'Stayover service',
  'DEEP_CLEAN' => 'Deep clean',
  'AREA_CLEAN' => 'Area clean',
  'CUSTOM' => 'Task',
  _ => 'Task',
};

@immutable
class StaffTask {
  const StaffTask({
    required this.id,
    required this.type,
    required this.status,
    required this.priority,
    this.roomId,
    this.roomNumber,
    this.floor,
    this.area,
    this.guestRequest,
    this.notes,
    this.assignedStaffId,
    this.assigneeName,
    this.dueAt,
    this.pendingSync = false,
  });

  final String id;
  final String type;
  final HkTaskStatus status;
  final HkPriority priority;
  final String? roomId;
  final String? roomNumber;
  final String? floor;
  final String? area;
  final String? guestRequest;
  final String? notes;
  final String? assignedStaffId;
  final String? assigneeName;
  final DateTime? dueAt;

  /// True when a status change is queued locally and has not reached the
  /// server. The card says so rather than pretending it is saved.
  final bool pendingSync;

  String get typeLabel => hkTaskTypeLabel(type);

  bool get isDone => status.isTerminal;

  /// The big Sora numeral on the card: a room number, else the area name.
  String get headline =>
      roomNumber?.isNotEmpty == true ? roomNumber! : (area ?? typeLabel);

  StaffTask copyWith({
    HkTaskStatus? status,
    bool? pendingSync,
    String? notes,
  }) => StaffTask(
    id: id,
    type: type,
    status: status ?? this.status,
    priority: priority,
    roomId: roomId,
    roomNumber: roomNumber,
    floor: floor,
    area: area,
    guestRequest: guestRequest,
    notes: notes ?? this.notes,
    assignedStaffId: assignedStaffId,
    assigneeName: assigneeName,
    dueAt: dueAt,
    pendingSync: pendingSync ?? this.pendingSync,
  );

  factory StaffTask.fromJson(Map j) => StaffTask(
    id: (j['id'] ?? '').toString(),
    type: (j['type'] as String?) ?? 'CUSTOM',
    status: HkTaskStatus.fromWire(j['status'] as String?),
    priority: HkPriority.fromWire(j['priority'] as String?),
    roomId: j['roomId'] as String?,
    roomNumber: j['roomNumber'] as String?,
    floor: j['roomFloor']?.toString() ?? j['floor']?.toString(),
    area: j['area'] as String?,
    guestRequest: j['guestRequest'] as String?,
    notes: j['notes'] as String?,
    assignedStaffId: j['assignedStaffId'] as String?,
    assigneeName: j['assigneeName'] as String?,
    dueAt: DateTime.tryParse((j['dueAt'] ?? '').toString())?.toLocal(),
  );
}
