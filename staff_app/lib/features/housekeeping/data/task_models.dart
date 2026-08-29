import 'package:flutter/foundation.dart';

import '../../../core/widgets/status_badge.dart';

enum TaskStage {
  assigned,
  accepted,
  started,
  completed,
  blocked;

  static TaskStage fromWire(String? v) => switch (v?.toUpperCase()) {
    'ASSIGNED' || 'PENDING' => TaskStage.assigned,
    'ACCEPTED' => TaskStage.accepted,
    'STARTED' || 'IN_PROGRESS' => TaskStage.started,
    'COMPLETED' || 'DONE' => TaskStage.completed,
    'BLOCKED' => TaskStage.blocked,
    _ => TaskStage.assigned,
  };

  String get label => switch (this) {
    TaskStage.assigned => 'Assigned',
    TaskStage.accepted => 'Accepted',
    TaskStage.started => 'In progress',
    TaskStage.completed => 'Completed',
    TaskStage.blocked => 'Blocked',
  };

  StatusTone get tone => switch (this) {
    TaskStage.assigned => StatusTone.dirty,
    TaskStage.accepted => StatusTone.occupied,
    TaskStage.started => StatusTone.cleaning,
    TaskStage.completed => StatusTone.healthy,
    TaskStage.blocked => StatusTone.critical,
  };

  /// The next stage, or null when the task is finished.
  TaskStage? get next => switch (this) {
    TaskStage.assigned => TaskStage.accepted,
    TaskStage.accepted => TaskStage.started,
    TaskStage.started => TaskStage.completed,
    TaskStage.completed => null,
    TaskStage.blocked => TaskStage.started,
  };

  /// The label on the big primary button.
  String get actionLabel => switch (this) {
    TaskStage.assigned => 'Accept task',
    TaskStage.accepted => 'Start',
    TaskStage.started => 'Mark complete',
    TaskStage.completed => 'Completed',
    TaskStage.blocked => 'Resume',
  };

  /// The operation type recorded on the offline queue.
  String? get operationType => switch (this) {
    TaskStage.assigned => 'task.accept',
    TaskStage.accepted => 'task.start',
    TaskStage.started => 'task.complete',
    TaskStage.completed => null,
    TaskStage.blocked => 'task.start',
  };
}

enum TaskPriority {
  low,
  normal,
  high;

  static TaskPriority fromWire(String? v) => switch (v?.toUpperCase()) {
    'HIGH' || 'URGENT' => TaskPriority.high,
    'LOW' => TaskPriority.low,
    _ => TaskPriority.normal,
  };

  String get label => switch (this) {
    TaskPriority.low => 'Low',
    TaskPriority.normal => 'Normal',
    TaskPriority.high => 'High',
  };
}

@immutable
class StaffTask {
  const StaffTask({
    required this.id,
    required this.title,
    required this.stage,
    required this.priority,
    this.roomNumber,
    this.floor,
    this.taskType,
    this.guestRequest,
    this.note,
    this.dueAt,
    this.estimatedMinutes,
    this.pendingSync = false,
  });

  final String id;
  final String title;
  final TaskStage stage;
  final TaskPriority priority;
  final String? roomNumber;
  final String? floor;
  final String? taskType;
  final String? guestRequest;
  final String? note;
  final DateTime? dueAt;
  final int? estimatedMinutes;

  /// True when a stage change is queued locally and has not reached the
  /// server. The card says so rather than pretending it is saved.
  final bool pendingSync;

  bool get isDone => stage == TaskStage.completed;

  /// The big Sora numeral on the card.
  String get headline =>
      roomNumber?.isNotEmpty == true ? roomNumber! : title;

  StaffTask copyWith({TaskStage? stage, bool? pendingSync, String? note}) =>
      StaffTask(
        id: id,
        title: title,
        stage: stage ?? this.stage,
        priority: priority,
        roomNumber: roomNumber,
        floor: floor,
        taskType: taskType,
        guestRequest: guestRequest,
        note: note ?? this.note,
        dueAt: dueAt,
        estimatedMinutes: estimatedMinutes,
        pendingSync: pendingSync ?? this.pendingSync,
      );

  factory StaffTask.fromJson(Map j) => StaffTask(
    id: (j['id'] ?? '').toString(),
    title: (j['title'] as String?) ?? (j['taskType'] as String?) ?? 'Task',
    stage: TaskStage.fromWire(j['stage'] as String? ?? j['status'] as String?),
    priority: TaskPriority.fromWire(j['priority'] as String?),
    roomNumber: j['roomNumber'] as String? ?? j['room'] as String?,
    floor: j['floor']?.toString(),
    taskType: j['taskType'] as String?,
    guestRequest: j['guestRequest'] as String?,
    note: j['note'] as String?,
    dueAt: DateTime.tryParse((j['dueAt'] ?? '').toString())?.toLocal(),
    estimatedMinutes: (j['estimatedMinutes'] as num?)?.toInt(),
  );
}
