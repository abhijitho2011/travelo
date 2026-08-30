import 'package:flutter/foundation.dart';

import '../../../core/widgets/status_badge.dart';
import '../../rooms/data/room_models.dart' show formatPaise;

export '../../rooms/data/room_models.dart' show formatPaise;

// ---------------------------------------------------------------- parsing --
// Same tolerant contract as the rooms/restaurant features: take what the server
// sends, fall back to something honest, never throw on a missing key.

dynamic _pick(Map json, List<String> keys) {
  for (final key in keys) {
    final value = json[key];
    if (value != null) return value;
  }
  return null;
}

int? _intOrNull(dynamic value) {
  if (value is int) return value;
  if (value is num) return value.round();
  final t = value?.toString();
  return t == null ? null : int.tryParse(t);
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

// ------------------------------------------------------------------ enums --

enum TransportType {
  pickup('PICKUP', 'Pickup'),
  drop('DROP', 'Drop'),
  tour('TOUR', 'Tour'),
  rental('RENTAL', 'Rental');

  const TransportType(this.wire, this.label);
  final String wire;
  final String label;

  static TransportType fromWire(String? value) {
    final w = _wire(value);
    for (final t in values) {
      if (t.wire == w) return t;
    }
    return TransportType.pickup;
  }
}

enum TransportStatus {
  requested('REQUESTED', 'Requested'),
  assigned('ASSIGNED', 'Assigned'),
  inProgress('IN_PROGRESS', 'In progress'),
  completed('COMPLETED', 'Completed'),
  cancelled('CANCELLED', 'Cancelled');

  const TransportStatus(this.wire, this.label);
  final String wire;
  final String label;

  static TransportStatus fromWire(String? value) {
    final w = _wire(value);
    for (final s in values) {
      if (s.wire == w) return s;
    }
    return TransportStatus.requested;
  }

  StatusTone get tone => switch (this) {
    TransportStatus.requested => StatusTone.warning,
    TransportStatus.assigned => StatusTone.info,
    TransportStatus.inProgress => StatusTone.cleaning,
    TransportStatus.completed => StatusTone.healthy,
    TransportStatus.cancelled => StatusTone.critical,
  };

  bool get isActive =>
      this == TransportStatus.assigned || this == TransportStatus.inProgress;
}

enum DriverStage {
  accepted('ACCEPTED', 'Accepted'),
  enRoute('EN_ROUTE', 'On the way'),
  arrived('ARRIVED', 'Arrived'),
  pickedUp('PICKED_UP', 'Picked up');

  const DriverStage(this.wire, this.label);
  final String wire;
  final String label;

  static DriverStage? fromWire(String? value) {
    final w = _wire(value);
    if (w == null) return null;
    for (final s in values) {
      if (s.wire == w) return s;
    }
    return null;
  }
}

enum VehicleStatus {
  available('AVAILABLE', 'Available'),
  inUse('IN_USE', 'In use'),
  maintenance('MAINTENANCE', 'Maintenance'),
  inactive('INACTIVE', 'Inactive');

  const VehicleStatus(this.wire, this.label);
  final String wire;
  final String label;

  static VehicleStatus fromWire(String? value) {
    final w = _wire(value);
    for (final s in values) {
      if (s.wire == w) return s;
    }
    return VehicleStatus.available;
  }

  StatusTone get tone => switch (this) {
    VehicleStatus.available => StatusTone.available,
    VehicleStatus.inUse => StatusTone.occupied,
    VehicleStatus.maintenance => StatusTone.maintenance,
    VehicleStatus.inactive => StatusTone.neutral,
  };
}

/// The driver's five steps, mapped to the backend `step` values.
enum DriverStep {
  accept('accept', 'Accept trip'),
  onTheWay('onTheWay', 'On the way'),
  arrived('arrived', 'Arrived'),
  pickedUp('pickedUp', 'Picked up'),
  complete('complete', 'Complete');

  const DriverStep(this.wire, this.label);
  final String wire;
  final String label;
}

// ------------------------------------------------------------------ models --

@immutable
class TransportRequest {
  const TransportRequest({
    required this.id,
    required this.guestName,
    required this.type,
    required this.status,
    this.reservationId,
    this.pickupAt,
    this.fromLocation,
    this.toLocation,
    this.vehicleId,
    this.vehicleName,
    this.driverStaffId,
    this.driverName,
    this.driverStage,
    this.farePaise,
    this.note,
  });

  final String id;
  final String guestName;
  final TransportType type;
  final TransportStatus status;
  final String? reservationId;
  final DateTime? pickupAt;
  final String? fromLocation;
  final String? toLocation;
  final String? vehicleId;
  final String? vehicleName;
  final String? driverStaffId;
  final String? driverName;
  final DriverStage? driverStage;
  final int? farePaise;
  final String? note;

  String get fareLabel => farePaise == null ? '—' : formatPaise(farePaise!);

  /// The next step this driver may take, given where the trip stands.
  DriverStep? get nextDriverStep {
    if (status == TransportStatus.assigned) return DriverStep.accept;
    if (status != TransportStatus.inProgress) return null;
    return switch (driverStage) {
      DriverStage.accepted => DriverStep.onTheWay,
      DriverStage.enRoute => DriverStep.arrived,
      DriverStage.arrived => DriverStep.pickedUp,
      DriverStage.pickedUp => DriverStep.complete,
      null => DriverStep.onTheWay,
    };
  }

  static TransportRequest fromJson(Map json) => TransportRequest(
    id: (_pick(json, ['id']) ?? '').toString(),
    guestName: _str(_pick(json, ['guestName'])) ?? 'Guest',
    type: TransportType.fromWire(_pick(json, ['type'])?.toString()),
    status: TransportStatus.fromWire(_pick(json, ['status'])?.toString()),
    reservationId: _str(_pick(json, ['reservationId'])),
    pickupAt: _date(_pick(json, ['pickupAt'])),
    fromLocation: _str(_pick(json, ['fromLocation'])),
    toLocation: _str(_pick(json, ['toLocation'])),
    vehicleId: _str(_pick(json, ['vehicleId'])),
    vehicleName: _str(_pick(json, ['vehicleName'])),
    driverStaffId: _str(_pick(json, ['driverStaffId'])),
    driverName: _str(_pick(json, ['driverName'])),
    driverStage: DriverStage.fromWire(_pick(json, ['driverStage'])?.toString()),
    farePaise: _intOrNull(_pick(json, ['farePaise'])),
    note: _str(_pick(json, ['note'])),
  );
}

@immutable
class Vehicle {
  const Vehicle({
    required this.id,
    required this.name,
    required this.plate,
    required this.seats,
    required this.status,
  });

  final String id;
  final String name;
  final String plate;
  final int seats;
  final VehicleStatus status;

  static Vehicle fromJson(Map json) => Vehicle(
    id: (_pick(json, ['id']) ?? '').toString(),
    name: _str(_pick(json, ['name'])) ?? 'Vehicle',
    plate: _str(_pick(json, ['plate'])) ?? '—',
    seats: _intOrNull(_pick(json, ['seats'])) ?? 4,
    status: VehicleStatus.fromWire(_pick(json, ['status'])?.toString()),
  );
}

@immutable
class TransportSummary {
  const TransportSummary({
    required this.todayCount,
    required this.pendingCount,
    required this.inProgressCount,
  });

  final int todayCount;
  final int pendingCount;
  final int inProgressCount;

  static TransportSummary fromJson(Map json) => TransportSummary(
    todayCount: _intOrNull(_pick(json, ['todayCount'])) ?? 0,
    pendingCount: _intOrNull(_pick(json, ['pendingCount'])) ?? 0,
    inProgressCount: _intOrNull(_pick(json, ['inProgressCount'])) ?? 0,
  );
}
