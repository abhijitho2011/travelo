import 'package:flutter/foundation.dart';

import '../../../core/widgets/status_badge.dart';
import '../../rooms/data/room_models.dart' show formatPaise;

export '../../rooms/data/room_models.dart' show formatPaise;

int _int(dynamic value, [int fallback = 0]) {
  if (value is int) return value;
  if (value is num) return value.round();
  return int.tryParse((value ?? '').toString()) ?? fallback;
}

bool _bool(dynamic value, [bool fallback = false]) {
  if (value is bool) return value;
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

enum EventStatus {
  enquiry('ENQUIRY', 'Enquiry'),
  confirmed('CONFIRMED', 'Confirmed'),
  inProgress('IN_PROGRESS', 'In progress'),
  completed('COMPLETED', 'Completed'),
  cancelled('CANCELLED', 'Cancelled');

  const EventStatus(this.wire, this.label);

  final String wire;
  final String label;

  StatusTone get tone => switch (this) {
    EventStatus.enquiry => StatusTone.neutral,
    EventStatus.confirmed => StatusTone.info,
    EventStatus.inProgress => StatusTone.occupied,
    EventStatus.completed => StatusTone.healthy,
    EventStatus.cancelled => StatusTone.critical,
  };

  /// The next non-cancel status this event may move to, or null if terminal.
  EventStatus? get next => switch (this) {
    EventStatus.enquiry => EventStatus.confirmed,
    EventStatus.confirmed => EventStatus.inProgress,
    EventStatus.inProgress => EventStatus.completed,
    _ => null,
  };

  bool get isTerminal =>
      this == EventStatus.completed || this == EventStatus.cancelled;

  static EventStatus fromWire(String? value) {
    final w = _wire(value);
    for (final s in values) {
      if (s.wire == w) return s;
    }
    return EventStatus.enquiry;
  }
}

@immutable
class EventTask {
  const EventTask({
    required this.id,
    required this.title,
    required this.done,
    this.assigneeStaffId,
    this.dueAt,
  });

  final String id;
  final String title;
  final bool done;
  final String? assigneeStaffId;
  final DateTime? dueAt;

  factory EventTask.fromJson(Map json) => EventTask(
    id: (json['id'] ?? '').toString(),
    title: _str(json['title']) ?? 'Task',
    done: _bool(json['done']),
    assigneeStaffId: _str(json['assigneeStaffId']),
    dueAt: _date(json['dueAt']),
  );
}

@immutable
class EventItem {
  const EventItem({
    required this.id,
    required this.name,
    required this.clientName,
    required this.status,
    required this.guestCount,
    required this.revenuePaise,
    this.type,
    this.venue,
    this.startAt,
    this.endAt,
    this.package,
    this.roomBlock,
    this.notes,
    this.tasks = const [],
  });

  final String id;
  final String name;
  final String clientName;
  final EventStatus status;
  final int guestCount;
  final int revenuePaise;
  final String? type;
  final String? venue;
  final DateTime? startAt;
  final DateTime? endAt;
  final String? package;
  final int? roomBlock;
  final String? notes;
  final List<EventTask> tasks;

  String get revenueLabel => formatPaise(revenuePaise);

  factory EventItem.fromJson(Map json) => EventItem(
    id: (json['id'] ?? '').toString(),
    name: _str(json['name']) ?? 'Event',
    clientName: _str(json['clientName']) ?? '—',
    status: EventStatus.fromWire(json['status'] as String?),
    guestCount: _int(json['guestCount']),
    revenuePaise: _int(json['revenuePaise']),
    type: _str(json['type']),
    venue: _str(json['venue']),
    startAt: _date(json['startAt']),
    endAt: _date(json['endAt']),
    package: _str(json['package']),
    roomBlock: json['roomBlock'] == null ? null : _int(json['roomBlock']),
    notes: _str(json['notes']),
    tasks: (json['tasks'] as List? ?? [])
        .whereType<Map>()
        .map(EventTask.fromJson)
        .toList(),
  );
}

@immutable
class EventsDashboard {
  const EventsDashboard({
    required this.todayCount,
    required this.upcomingCount,
    required this.upcomingRevenuePaise,
    required this.pendingTasks,
  });

  final int todayCount;
  final int upcomingCount;
  final int upcomingRevenuePaise;
  final int pendingTasks;

  String get upcomingRevenueLabel => formatPaise(upcomingRevenuePaise);

  factory EventsDashboard.fromJson(Map json) => EventsDashboard(
    todayCount: _int(json['todayCount']),
    upcomingCount: _int(json['upcomingCount']),
    upcomingRevenuePaise: _int(json['upcomingRevenuePaise']),
    pendingTasks: _int(json['pendingTasks']),
  );
}
