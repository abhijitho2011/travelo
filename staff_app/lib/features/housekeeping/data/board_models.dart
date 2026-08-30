import 'package:flutter/foundation.dart';

import '../../../core/widgets/status_badge.dart';
import 'task_models.dart';

/// Maps a room's wire status to the shared operational tone palette.
StatusTone roomStatusTone(String? status) => switch (status?.toUpperCase()) {
  'AVAILABLE' => StatusTone.available,
  'OCCUPIED' => StatusTone.occupied,
  'DIRTY' => StatusTone.dirty,
  'CLEANING' => StatusTone.cleaning,
  'INSPECTED' => StatusTone.inspected,
  'READY' => StatusTone.available,
  'MAINTENANCE' => StatusTone.maintenance,
  'OUT_OF_ORDER' => StatusTone.outOfOrder,
  _ => StatusTone.neutral,
};

String roomStatusLabel(String? status) => switch (status?.toUpperCase()) {
  'OUT_OF_ORDER' => 'Out of order',
  final s? => '${s[0]}${s.substring(1).toLowerCase()}'.replaceAll('_', ' '),
  _ => '—',
};

/// A staff member the supervisor may assign a task to.
@immutable
class HkAssignee {
  const HkAssignee({required this.id, required this.name, this.role});

  final String id;
  final String name;
  final String? role;

  factory HkAssignee.fromJson(Map j) => HkAssignee(
    id: (j['id'] ?? '').toString(),
    name: (j['name'] ?? '').toString(),
    role: j['role'] as String?,
  );
}

/// One room on the board, with its open task (if any) attached.
@immutable
class BoardRoom {
  const BoardRoom({
    required this.id,
    required this.number,
    required this.status,
    this.floor,
    this.task,
  });

  final String id;
  final String number;
  final String status;
  final String? floor;
  final StaffTask? task;

  StatusTone get tone => roomStatusTone(status);
  String get statusLabel => roomStatusLabel(status);

  factory BoardRoom.fromJson(Map j) => BoardRoom(
    id: (j['id'] ?? '').toString(),
    number: (j['number'] ?? '').toString(),
    status: (j['status'] ?? '').toString(),
    floor: j['floor']?.toString(),
    task: j['task'] is Map ? StaffTask.fromJson(j['task'] as Map) : null,
  );
}

/// The whole board in one object: rooms grouped by status, per-status counts,
/// and any non-room area tasks that would otherwise be invisible.
@immutable
class HousekeepingBoard {
  const HousekeepingBoard({
    required this.groups,
    required this.counts,
    required this.totalRooms,
    required this.areaTasks,
  });

  /// Wire room status → the rooms in it, in a stable display order.
  final Map<String, List<BoardRoom>> groups;
  final Map<String, int> counts;
  final int totalRooms;
  final List<StaffTask> areaTasks;

  /// The status columns to show, in the order the housekeeping loop runs.
  static const statusOrder = <String>[
    'DIRTY',
    'CLEANING',
    'INSPECTED',
    'READY',
    'AVAILABLE',
    'OCCUPIED',
    'MAINTENANCE',
    'OUT_OF_ORDER',
  ];

  List<String> get orderedStatuses {
    final present = groups.keys.toList()
      ..sort((a, b) {
        final ia = statusOrder.indexOf(a);
        final ib = statusOrder.indexOf(b);
        return (ia == -1 ? 99 : ia).compareTo(ib == -1 ? 99 : ib);
      });
    return present;
  }

  factory HousekeepingBoard.fromJson(Map j) {
    final rawGroups = (j['groups'] as Map?) ?? const {};
    final groups = <String, List<BoardRoom>>{};
    rawGroups.forEach((k, v) {
      if (v is List) {
        groups[k.toString()] =
            v.whereType<Map>().map(BoardRoom.fromJson).toList();
      }
    });
    final rawCounts = (j['counts'] as Map?) ?? const {};
    final counts = <String, int>{};
    rawCounts.forEach((k, v) {
      counts[k.toString()] = (v as num?)?.toInt() ?? 0;
    });
    final areas = (j['areaTasks'] as List?) ?? const [];
    return HousekeepingBoard(
      groups: groups,
      counts: counts,
      totalRooms: (j['totalRooms'] as num?)?.toInt() ?? 0,
      areaTasks: areas.whereType<Map>().map(StaffTask.fromJson).toList(),
    );
  }
}
