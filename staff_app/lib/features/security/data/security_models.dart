import 'package:flutter/material.dart';

import '../../../core/widgets/status_badge.dart';

/// What kind of movement a gate log row records.
enum GateMovement {
  vehicleIn('VEHICLE_IN', 'Vehicle in', Icons.login),
  vehicleOut('VEHICLE_OUT', 'Vehicle out', Icons.logout),
  staffIn('STAFF_IN', 'Staff in', Icons.badge_outlined),
  staffOut('STAFF_OUT', 'Staff out', Icons.badge_outlined);

  const GateMovement(this.wire, this.label, this.icon);

  final String wire;
  final String label;
  final IconData icon;

  bool get isVehicle =>
      this == GateMovement.vehicleIn || this == GateMovement.vehicleOut;

  bool get isEntry =>
      this == GateMovement.vehicleIn || this == GateMovement.staffIn;

  StatusTone get tone => isEntry ? StatusTone.available : StatusTone.neutral;

  static GateMovement fromWire(String? v) => GateMovement.values.firstWhere(
    (m) => m.wire == v?.toUpperCase(),
    orElse: () => GateMovement.vehicleIn,
  );
}

@immutable
class GateLogEntry {
  const GateLogEntry({
    required this.id,
    required this.movement,
    required this.subject,
    required this.at,
    this.detail,
    this.pendingSync = false,
  });

  final String id;
  final GateMovement movement;

  /// Registration number, or the staff member's name / employee id.
  final String subject;
  final DateTime at;
  final String? detail;
  final bool pendingSync;

  factory GateLogEntry.fromJson(Map j) => GateLogEntry(
    id: (j['id'] ?? '').toString(),
    movement: GateMovement.fromWire(j['movement'] as String?),
    subject:
        (j['subject'] as String?) ?? (j['vehicleNumber'] as String?) ?? '—',
    at:
        DateTime.tryParse(
          (j['at'] ?? j['createdAt'] ?? '').toString(),
        )?.toLocal() ??
        DateTime.now(),
    detail: j['detail'] as String?,
  );
}

@immutable
class Visitor {
  const Visitor({
    required this.id,
    required this.name,
    required this.arrivedAt,
    this.visiting,
    this.purpose,
    this.passNumber,
    this.departedAt,
    this.pendingSync = false,
  });

  final String id;
  final String name;
  final DateTime arrivedAt;
  final String? visiting;
  final String? purpose;
  final String? passNumber;
  final DateTime? departedAt;
  final bool pendingSync;

  bool get onSite => departedAt == null;

  factory Visitor.fromJson(Map j) => Visitor(
    id: (j['id'] ?? '').toString(),
    name: (j['name'] as String?) ?? 'Visitor',
    arrivedAt:
        DateTime.tryParse((j['arrivedAt'] ?? '').toString())?.toLocal() ??
        DateTime.now(),
    visiting: j['visiting'] as String?,
    purpose: j['purpose'] as String?,
    passNumber: j['passNumber'] as String?,
    departedAt: DateTime.tryParse(
      (j['departedAt'] ?? '').toString(),
    )?.toLocal(),
  );
}

@immutable
class LostFoundItem {
  const LostFoundItem({
    required this.id,
    required this.description,
    required this.foundAt,
    this.location,
    this.status,
    this.pendingSync = false,
  });

  final String id;
  final String description;
  final DateTime foundAt;
  final String? location;
  final String? status;
  final bool pendingSync;

  factory LostFoundItem.fromJson(Map j) => LostFoundItem(
    id: (j['id'] ?? '').toString(),
    description: (j['description'] as String?) ?? 'Item',
    foundAt:
        DateTime.tryParse(
          (j['foundAt'] ?? j['createdAt'] ?? '').toString(),
        )?.toLocal() ??
        DateTime.now(),
    location: j['location'] as String?,
    status: j['status'] as String?,
  );
}

enum IncidentSeverity {
  low('LOW', 'Low', StatusTone.neutral),
  medium('MEDIUM', 'Medium', StatusTone.warning),
  high('HIGH', 'High', StatusTone.critical);

  const IncidentSeverity(this.wire, this.label, this.tone);

  final String wire;
  final String label;
  final StatusTone tone;

  static IncidentSeverity fromWire(String? v) =>
      IncidentSeverity.values.firstWhere(
        (s) => s.wire == v?.toUpperCase(),
        orElse: () => IncidentSeverity.medium,
      );
}

/// The lifecycle the manager drives: reported → assigned → resolved.
enum IncidentStatus {
  open('OPEN', 'Open', StatusTone.warning),
  assigned('ASSIGNED', 'Assigned', StatusTone.occupied),
  resolved('RESOLVED', 'Resolved', StatusTone.healthy);

  const IncidentStatus(this.wire, this.label, this.tone);

  final String wire;
  final String label;
  final StatusTone tone;

  bool get isResolved => this == IncidentStatus.resolved;

  static IncidentStatus fromWire(String? v) => IncidentStatus.values.firstWhere(
    (s) => s.wire == v?.toUpperCase(),
    orElse: () => IncidentStatus.open,
  );
}

@immutable
class Incident {
  const Incident({
    required this.id,
    required this.summary,
    required this.severity,
    required this.status,
    required this.reportedAt,
    this.location,
    this.assignedTo,
    this.resolution,
    this.pendingSync = false,
  });

  final String id;
  final String summary;
  final IncidentSeverity severity;
  final IncidentStatus status;
  final DateTime reportedAt;
  final String? location;
  final String? assignedTo;
  final String? resolution;
  final bool pendingSync;

  factory Incident.fromJson(Map j) => Incident(
    id: (j['id'] ?? '').toString(),
    summary: (j['summary'] as String?) ?? (j['description'] as String?) ?? '—',
    severity: IncidentSeverity.fromWire(j['severity'] as String?),
    status: IncidentStatus.fromWire(j['status'] as String?),
    reportedAt:
        DateTime.tryParse(
          (j['reportedAt'] ?? j['createdAt'] ?? '').toString(),
        )?.toLocal() ??
        DateTime.now(),
    location: j['location'] as String?,
    assignedTo: j['assignedTo'] as String?,
    resolution: j['resolution'] as String?,
  );
}

/// A guard's shift on the manager's roster.
enum SecurityShiftStatus {
  scheduled('SCHEDULED', 'Scheduled', StatusTone.info),
  active('ACTIVE', 'On duty', StatusTone.available),
  ended('ENDED', 'Ended', StatusTone.neutral);

  const SecurityShiftStatus(this.wire, this.label, this.tone);

  final String wire;
  final String label;
  final StatusTone tone;

  static SecurityShiftStatus fromWire(String? v) =>
      SecurityShiftStatus.values.firstWhere(
        (s) => s.wire == v?.toUpperCase(),
        orElse: () => SecurityShiftStatus.scheduled,
      );
}

@immutable
class SecurityShift {
  const SecurityShift({
    required this.id,
    required this.staffId,
    required this.area,
    required this.status,
    this.startAt,
    this.endAt,
  });

  final String id;
  final String staffId;
  final String area;
  final SecurityShiftStatus status;
  final DateTime? startAt;
  final DateTime? endAt;

  factory SecurityShift.fromJson(Map j) => SecurityShift(
    id: (j['id'] ?? '').toString(),
    staffId: (j['staffId'] ?? '').toString(),
    area: (j['area'] as String?) ?? '—',
    status: SecurityShiftStatus.fromWire(j['status'] as String?),
    startAt: DateTime.tryParse((j['startAt'] ?? '').toString())?.toLocal(),
    endAt: DateTime.tryParse((j['endAt'] ?? '').toString())?.toLocal(),
  );
}

@immutable
class RosterMember {
  const RosterMember({
    required this.id,
    required this.name,
    required this.role,
  });

  final String id;
  final String name;
  final String role;

  factory RosterMember.fromJson(Map j) => RosterMember(
    id: (j['id'] ?? '').toString(),
    name:
        [j['firstName'], j['lastName']]
            .where((p) => p != null && p.toString().trim().isNotEmpty)
            .join(' ')
            .trim()
            .isEmpty
        ? 'Staff'
        : [
            j['firstName'],
            j['lastName'],
          ].where((p) => p != null && p.toString().trim().isNotEmpty).join(' '),
    role: (j['role'] as String?) ?? '',
  );
}

@immutable
class SecurityDashboard {
  const SecurityDashboard({
    required this.activeStaff,
    required this.visitorsOnSite,
    required this.openIncidents,
    required this.openBySeverity,
  });

  final int activeStaff;
  final int visitorsOnSite;
  final int openIncidents;
  final Map<String, int> openBySeverity;

  factory SecurityDashboard.fromJson(Map j) => SecurityDashboard(
    activeStaff: (j['activeStaff'] as num?)?.toInt() ?? 0,
    visitorsOnSite: (j['visitorsOnSite'] as num?)?.toInt() ?? 0,
    openIncidents: (j['openIncidents'] as num?)?.toInt() ?? 0,
    openBySeverity: {
      for (final e in (j['openBySeverity'] as Map? ?? {}).entries)
        e.key.toString(): (e.value as num?)?.toInt() ?? 0,
    },
  );
}
