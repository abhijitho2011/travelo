import 'package:flutter/foundation.dart';

import '../../../core/widgets/status_badge.dart';

/// The front-desk KPI strip.
@immutable
class DeskSnapshot {
  const DeskSnapshot({
    this.arrivals,
    this.arrivalsUnassigned,
    this.departures,
    this.lateCheckouts,
    this.inHouse,
    this.available,
    this.dirty,
    this.ready,
    this.walkIns,
    this.pendingPayment,
  });

  final int? arrivals;
  final int? arrivalsUnassigned;
  final int? departures;
  final int? lateCheckouts;
  final int? inHouse;
  final int? available;
  final int? dirty;
  final int? ready;
  final int? walkIns;
  final num? pendingPayment;

  static int? _i(Object? v) => (v as num?)?.toInt();

  factory DeskSnapshot.fromJson(Map j) => DeskSnapshot(
    arrivals: _i(j['arrivals']),
    arrivalsUnassigned: _i(j['arrivalsUnassigned']),
    departures: _i(j['departures']),
    lateCheckouts: _i(j['lateCheckouts']),
    inHouse: _i(j['inHouse']),
    available: _i(j['available']),
    dirty: _i(j['dirty']),
    ready: _i(j['ready']),
    walkIns: _i(j['walkIns']),
    pendingPayment: j['pendingPayment'] as num?,
  );
}

enum ReservationStatus {
  confirmed,
  arriving,
  inHouse,
  departing,
  checkedOut,
  cancelled,
  noShow,
  unknown;

  static ReservationStatus fromWire(String? v) => switch (v
      ?.toUpperCase()
      .replaceAll(' ', '_')) {
    'CONFIRMED' || 'BOOKED' => ReservationStatus.confirmed,
    'ARRIVING' || 'DUE_IN' => ReservationStatus.arriving,
    'IN_HOUSE' || 'CHECKED_IN' => ReservationStatus.inHouse,
    'DEPARTING' || 'DUE_OUT' => ReservationStatus.departing,
    'CHECKED_OUT' => ReservationStatus.checkedOut,
    'CANCELLED' => ReservationStatus.cancelled,
    'NO_SHOW' => ReservationStatus.noShow,
    _ => ReservationStatus.unknown,
  };

  String get label => switch (this) {
    ReservationStatus.confirmed => 'Confirmed',
    ReservationStatus.arriving => 'Arriving',
    ReservationStatus.inHouse => 'In house',
    ReservationStatus.departing => 'Departing',
    ReservationStatus.checkedOut => 'Checked out',
    ReservationStatus.cancelled => 'Cancelled',
    ReservationStatus.noShow => 'No show',
    ReservationStatus.unknown => 'Unknown',
  };

  StatusTone get tone => switch (this) {
    ReservationStatus.confirmed => StatusTone.info,
    ReservationStatus.arriving => StatusTone.available,
    ReservationStatus.inHouse => StatusTone.occupied,
    ReservationStatus.departing => StatusTone.dirty,
    ReservationStatus.checkedOut => StatusTone.neutral,
    ReservationStatus.cancelled => StatusTone.critical,
    ReservationStatus.noShow => StatusTone.critical,
    ReservationStatus.unknown => StatusTone.neutral,
  };

  bool get canCheckIn =>
      this == ReservationStatus.confirmed || this == ReservationStatus.arriving;

  bool get canCheckOut =>
      this == ReservationStatus.inHouse || this == ReservationStatus.departing;

  bool get isOpen =>
      this != ReservationStatus.cancelled &&
      this != ReservationStatus.checkedOut &&
      this != ReservationStatus.noShow;
}

@immutable
class Reservation {
  const Reservation({
    required this.id,
    required this.guestName,
    required this.status,
    this.reference,
    this.roomNumber,
    this.roomType,
    this.checkIn,
    this.checkOut,
    this.nights,
    this.adults,
    this.children,
    this.balance,
    this.source,
    this.eta,
    this.vip = false,
    this.notes,
    this.guestMobile,
  });

  final String id;
  final String guestName;
  final ReservationStatus status;
  final String? reference;
  final String? roomNumber;
  final String? roomType;
  final DateTime? checkIn;
  final DateTime? checkOut;
  final int? nights;
  final int? adults;
  final int? children;
  final num? balance;
  final String? source;
  final String? eta;
  final bool vip;
  final String? notes;
  final String? guestMobile;

  bool get roomAssigned => roomNumber != null && roomNumber!.isNotEmpty;

  int get guestCount => (adults ?? 0) + (children ?? 0);

  static int? _i(Object? v) => (v as num?)?.toInt();

  factory Reservation.fromJson(Map j) => Reservation(
    id: (j['id'] ?? '').toString(),
    guestName: (j['guestName'] as String?) ?? (j['guest'] as String?) ?? 'Guest',
    status: ReservationStatus.fromWire(j['status'] as String?),
    reference: j['reference'] as String? ?? j['code'] as String?,
    roomNumber: j['roomNumber'] as String? ?? j['room'] as String?,
    roomType: j['roomType'] as String? ?? j['type'] as String?,
    checkIn: DateTime.tryParse((j['checkIn'] ?? '').toString())?.toLocal(),
    checkOut: DateTime.tryParse((j['checkOut'] ?? '').toString())?.toLocal(),
    nights: _i(j['nights']),
    adults: _i(j['adults']),
    children: _i(j['children']),
    balance: j['balance'] as num?,
    source: j['source'] as String?,
    eta: j['eta'] as String?,
    vip: j['vip'] == true,
    notes: j['notes'] as String?,
    guestMobile: j['guestMobile'] as String? ?? j['mobile'] as String?,
  );
}

/// One step of the digital check-in, modelled on HF's `front-desk.tsx` dialog.
enum CheckInStep {
  verification(
    'Verify guest',
    'Confirm the booking and the guest standing in front of you.',
    'ID and booking checked',
  ),
  details(
    'Guest details',
    'Confirm contact details and anyone travelling with them.',
    'Details confirmed',
  ),
  identity(
    'Identity document',
    'Scan or photograph the passport or government ID.',
    'Document captured',
  ),
  registration(
    'Registration & signature',
    'Guest reads and signs the registration card.',
    'Signed',
  ),
  payment(
    'Payment / deposit',
    'Take the balance or authorise a card for the deposit.',
    'Payment settled',
  ),
  room('Assign room', 'Pick a clean, inspected room of the booked type.', 'Room assigned'),
  keyCard('Issue key card', 'Encode and hand over the key.', 'Key issued'),
  complete('Complete', 'Confirm and welcome the guest.', 'Checked in');

  const CheckInStep(this.title, this.detail, this.doneLabel);

  final String title;
  final String detail;
  final String doneLabel;

  static List<CheckInStep> get ordered => CheckInStep.values;
}
