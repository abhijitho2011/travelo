import 'package:flutter/foundation.dart';

DateTime? _date(Object? v) => v == null ? null : DateTime.tryParse('$v');

@immutable
class GuestLinkState {
  const GuestLinkState({
    this.sentAt,
    this.openedAt,
    this.checkinSubmittedAt,
    this.checkoutRequestedAt,
    this.expiresAt,
  });
  final DateTime? sentAt;
  final DateTime? openedAt;
  final DateTime? checkinSubmittedAt;
  final DateTime? checkoutRequestedAt;
  final DateTime? expiresAt;
  factory GuestLinkState.fromJson(Map j) => GuestLinkState(
    sentAt: _date(j['sentAt']),
    openedAt: _date(j['openedAt']),
    checkinSubmittedAt: _date(j['checkinSubmittedAt']),
    checkoutRequestedAt: _date(j['checkoutRequestedAt']),
    expiresAt: _date(j['expiresAt']),
  );

  /// The one-liner the row and any chip show.
  String label() {
    if (checkoutRequestedAt != null) return 'Checkout requested';
    if (checkinSubmittedAt != null) return 'Checked in online';
    if (openedAt != null) return 'Opened, not submitted';
    if (sentAt != null) return 'Sent, not opened';
    return 'Not sent';
  }
}

@immutable
class GuestLinkRow {
  const GuestLinkRow({
    required this.reservationId,
    required this.code,
    required this.guestName,
    this.phone,
    this.email,
    this.roomNumber,
    this.checkIn,
    this.checkOut,
    required this.status,
    this.link,
  });
  final String reservationId;
  final String code;
  final String guestName;
  final String? phone;
  final String? email;
  final String? roomNumber;
  final DateTime? checkIn;
  final DateTime? checkOut;
  final String status;
  final GuestLinkState? link;

  factory GuestLinkRow.fromJson(Map j) => GuestLinkRow(
    reservationId: '${j['reservationId']}',
    code: '${j['code'] ?? ''}',
    guestName: '${j['guestName'] ?? ''}',
    phone: j['phone']?.toString(),
    email: j['email']?.toString(),
    roomNumber: j['roomNumber']?.toString(),
    checkIn: _date(j['checkIn']),
    checkOut: _date(j['checkOut']),
    status: '${j['status'] ?? ''}',
    link: j['link'] is Map ? GuestLinkState.fromJson(j['link'] as Map) : null,
  );
}
