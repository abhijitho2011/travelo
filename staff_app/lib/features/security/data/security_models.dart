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
    subject: (j['subject'] as String?) ?? (j['vehicleNumber'] as String?) ?? '—',
    at:
        DateTime.tryParse((j['at'] ?? j['createdAt'] ?? '').toString())
            ?.toLocal() ??
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
    departedAt: DateTime.tryParse((j['departedAt'] ?? '').toString())?.toLocal(),
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
        DateTime.tryParse((j['foundAt'] ?? j['createdAt'] ?? '').toString())
            ?.toLocal() ??
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

@immutable
class Incident {
  const Incident({
    required this.id,
    required this.summary,
    required this.severity,
    required this.reportedAt,
    this.location,
    this.pendingSync = false,
  });

  final String id;
  final String summary;
  final IncidentSeverity severity;
  final DateTime reportedAt;
  final String? location;
  final bool pendingSync;

  factory Incident.fromJson(Map j) => Incident(
    id: (j['id'] ?? '').toString(),
    summary: (j['summary'] as String?) ?? (j['description'] as String?) ?? '—',
    severity: IncidentSeverity.fromWire(j['severity'] as String?),
    reportedAt:
        DateTime.tryParse((j['reportedAt'] ?? j['createdAt'] ?? '').toString())
            ?.toLocal() ??
        DateTime.now(),
    location: j['location'] as String?,
  );
}
