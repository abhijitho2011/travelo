import 'package:flutter/foundation.dart';

import '../../../core/widgets/status_badge.dart';
import '../../rooms/data/room_models.dart' show formatPaise;

export '../../rooms/data/room_models.dart' show formatPaise;

// ---------------------------------------------------------------- parsing --
// Same contract as the restaurant feature: the server owns the shape, but a
// client that throws on one missing key strands the whole outlet. Every reader
// takes what it can and falls back to something honest.

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

enum SpaServiceStatus {
  active('ACTIVE', 'Active'),
  archived('ARCHIVED', 'Archived');

  const SpaServiceStatus(this.wire, this.label);

  final String wire;
  final String label;

  static SpaServiceStatus fromWire(String? value) {
    final w = _wire(value);
    for (final s in values) {
      if (s.wire == w) return s;
    }
    return SpaServiceStatus.active;
  }
}

enum SpaAppointmentStatus {
  booked('BOOKED', 'Booked'),
  inProgress('IN_PROGRESS', 'In progress'),
  completed('COMPLETED', 'Completed'),
  cancelled('CANCELLED', 'Cancelled'),
  noShow('NO_SHOW', 'No-show');

  const SpaAppointmentStatus(this.wire, this.label);

  final String wire;
  final String label;

  StatusTone get tone => switch (this) {
    SpaAppointmentStatus.booked => StatusTone.info,
    SpaAppointmentStatus.inProgress => StatusTone.occupied,
    SpaAppointmentStatus.completed => StatusTone.healthy,
    SpaAppointmentStatus.cancelled => StatusTone.critical,
    SpaAppointmentStatus.noShow => StatusTone.warning,
  };

  bool get canStart => this == SpaAppointmentStatus.booked;
  bool get canComplete => this == SpaAppointmentStatus.inProgress;
  bool get isTerminal =>
      this == SpaAppointmentStatus.completed ||
      this == SpaAppointmentStatus.cancelled ||
      this == SpaAppointmentStatus.noShow;

  static SpaAppointmentStatus fromWire(String? value) {
    final w = _wire(value);
    for (final s in values) {
      if (s.wire == w) return s;
    }
    return SpaAppointmentStatus.booked;
  }
}

enum SpaBillStatus {
  unpaid('UNPAID', 'Unpaid'),
  paid('PAID', 'Paid'),
  refunded('REFUNDED', 'Refunded');

  const SpaBillStatus(this.wire, this.label);

  final String wire;
  final String label;

  StatusTone get tone => switch (this) {
    SpaBillStatus.unpaid => StatusTone.warning,
    SpaBillStatus.paid => StatusTone.healthy,
    SpaBillStatus.refunded => StatusTone.neutral,
  };

  static SpaBillStatus fromWire(String? value) {
    final w = _wire(value);
    for (final s in values) {
      if (s.wire == w) return s;
    }
    return SpaBillStatus.unpaid;
  }
}

enum SpaPaymentMethod {
  cash('CASH', 'Cash'),
  card('CARD', 'Card'),
  upi('UPI', 'UPI'),
  roomCharge('ROOM_CHARGE', 'Room charge');

  const SpaPaymentMethod(this.wire, this.label);

  final String wire;
  final String label;

  static SpaPaymentMethod? fromWire(String? value) {
    final w = _wire(value);
    for (final m in values) {
      if (m.wire == w) return m;
    }
    return null;
  }
}

// ----------------------------------------------------------------- models --

@immutable
class SpaService {
  const SpaService({
    required this.id,
    required this.name,
    required this.durationMinutes,
    required this.pricePaise,
    required this.status,
    this.description,
  });

  final String id;
  final String name;
  final int durationMinutes;
  final int pricePaise;
  final SpaServiceStatus status;
  final String? description;

  String get priceLabel => formatPaise(pricePaise);

  factory SpaService.fromJson(Map json) => SpaService(
    id: (json['id'] ?? '').toString(),
    name: _str(json['name']) ?? 'Service',
    durationMinutes: _int(_pick(json, ['durationMinutes', 'duration']), 60),
    pricePaise: _int(_pick(json, ['pricePaise', 'price'])),
    status: SpaServiceStatus.fromWire(json['status'] as String?),
    description: _str(json['description']),
  );
}

@immutable
class SpaAppointment {
  const SpaAppointment({
    required this.id,
    required this.guestName,
    required this.serviceName,
    required this.pricePaise,
    required this.status,
    required this.startAt,
    this.serviceId,
    this.staffId,
    this.reservationId,
    this.notes,
  });

  final String id;
  final String guestName;
  final String serviceName;
  final int pricePaise;
  final SpaAppointmentStatus status;
  final DateTime? startAt;
  final String? serviceId;
  final String? staffId;
  final String? reservationId;
  final String? notes;

  String get priceLabel => formatPaise(pricePaise);
  bool get hasTherapist => staffId != null;

  factory SpaAppointment.fromJson(Map json) => SpaAppointment(
    id: (json['id'] ?? '').toString(),
    guestName: _str(json['guestName']) ?? 'Guest',
    serviceName: _str(_pick(json, ['serviceName', 'serviceNameSnapshot'])) ?? 'Service',
    pricePaise: _int(_pick(json, ['pricePaise', 'pricePaiseSnapshot'])),
    status: SpaAppointmentStatus.fromWire(json['status'] as String?),
    startAt: _date(json['startAt']),
    serviceId: _str(json['serviceId']),
    staffId: _str(json['staffId']),
    reservationId: _str(json['reservationId']),
    notes: _str(json['notes']),
  );
}

@immutable
class SpaBill {
  const SpaBill({
    required this.id,
    required this.appointmentId,
    required this.subtotalPaise,
    required this.taxPaise,
    required this.totalPaise,
    required this.status,
    this.paymentMethod,
    this.refundReason,
  });

  final String id;
  final String appointmentId;
  final int subtotalPaise;
  final int taxPaise;
  final int totalPaise;
  final SpaBillStatus status;
  final SpaPaymentMethod? paymentMethod;
  final String? refundReason;

  String get totalLabel => formatPaise(totalPaise);

  factory SpaBill.fromJson(Map json) => SpaBill(
    id: (json['id'] ?? '').toString(),
    appointmentId: (json['appointmentId'] ?? '').toString(),
    subtotalPaise: _int(json['subtotalPaise']),
    taxPaise: _int(json['taxPaise']),
    totalPaise: _int(json['totalPaise']),
    status: SpaBillStatus.fromWire(json['status'] as String?),
    paymentMethod: SpaPaymentMethod.fromWire(json['paymentMethod'] as String?),
    refundReason: _str(json['refundReason']),
  );
}

@immutable
class SpaDashboard {
  const SpaDashboard({
    required this.todayCount,
    required this.completedCount,
    required this.byStatus,
    required this.appointments,
  });

  final int todayCount;
  final int completedCount;
  final Map<String, int> byStatus;
  final List<SpaAppointment> appointments;

  factory SpaDashboard.fromJson(Map json) => SpaDashboard(
    todayCount: _int(json['todayCount']),
    completedCount: _int(json['completedCount']),
    byStatus: {
      for (final e in (json['byStatus'] as Map? ?? {}).entries)
        e.key.toString(): _int(e.value),
    },
    appointments: (json['appointments'] as List? ?? [])
        .whereType<Map>()
        .map(SpaAppointment.fromJson)
        .toList(),
  );
}

@immutable
class SpaRevenue {
  const SpaRevenue({
    required this.revenuePaise,
    required this.paidCount,
    required this.refundedPaise,
    required this.methodBreakdown,
  });

  final int revenuePaise;
  final int paidCount;
  final int refundedPaise;
  final Map<String, int> methodBreakdown;

  String get revenueLabel => formatPaise(revenuePaise);

  factory SpaRevenue.fromJson(Map json) => SpaRevenue(
    revenuePaise: _int(json['revenuePaise']),
    paidCount: _int(json['paidCount']),
    refundedPaise: _int(json['refundedPaise']),
    methodBreakdown: {
      for (final e in (json['methodBreakdown'] as Map? ?? {}).entries)
        e.key.toString(): _int((e.value as Map?)?['revenuePaise']),
    },
  );
}
