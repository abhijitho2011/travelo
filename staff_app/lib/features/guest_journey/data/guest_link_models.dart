// The guest link ("magic link"): one per reservation, sent by SMS/email, and
// where each guest has got to with it.

import '../../../core/widgets/status_badge.dart';

String? _str(Object? v) => v?.toString();
DateTime? _date(Object? v) => v == null ? null : DateTime.tryParse('$v');

/// Where a guest has got to with their link.
enum GuestLinkStage {
  notSent,
  sent,
  opened,
  checkedInOnline,
  checkoutRequested,
  expired;

  String get label => switch (this) {
    GuestLinkStage.notSent => 'Not sent',
    GuestLinkStage.sent => 'Sent',
    GuestLinkStage.opened => 'Opened',
    GuestLinkStage.checkedInOnline => 'Checked in online',
    GuestLinkStage.checkoutRequested => 'Checkout requested',
    GuestLinkStage.expired => 'Expired',
  };

  StatusTone get tone => switch (this) {
    GuestLinkStage.notSent => StatusTone.neutral,
    GuestLinkStage.sent => StatusTone.info,
    GuestLinkStage.opened => StatusTone.cleaning,
    GuestLinkStage.checkedInOnline => StatusTone.healthy,
    GuestLinkStage.checkoutRequested => StatusTone.warning,
    GuestLinkStage.expired => StatusTone.critical,
  };
}

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
}

class GuestLinkRow {
  const GuestLinkRow({
    required this.reservationId,
    required this.code,
    required this.guestName,
    required this.status,
    this.phone,
    this.email,
    this.roomNumber,
    this.checkIn,
    this.checkOut,
    this.link,
  });

  final String reservationId;
  final String code;
  final String guestName;
  final String status;
  final String? phone;
  final String? email;
  final String? roomNumber;
  final DateTime? checkIn;
  final DateTime? checkOut;
  final GuestLinkState? link;

  bool get sent => link?.sentAt != null;

  /// The furthest step the guest has reached. Expiry only matters while the
  /// guest has not yet checked in through the link.
  GuestLinkStage stage({DateTime? now}) {
    final l = link;
    if (l == null || l.sentAt == null) return GuestLinkStage.notSent;
    if (l.checkoutRequestedAt != null) return GuestLinkStage.checkoutRequested;
    if (l.checkinSubmittedAt != null) return GuestLinkStage.checkedInOnline;
    final t = now ?? DateTime.now();
    if (l.expiresAt != null && l.expiresAt!.isBefore(t)) {
      return GuestLinkStage.expired;
    }
    if (l.openedAt != null) return GuestLinkStage.opened;
    return GuestLinkStage.sent;
  }

  factory GuestLinkRow.fromJson(Map j) => GuestLinkRow(
    reservationId: '${j['reservationId']}',
    code: _str(j['code']) ?? '',
    guestName: _str(j['guestName']) ?? 'Guest',
    status: _str(j['status']) ?? '',
    phone: _str(j['phone']),
    email: _str(j['email']),
    roomNumber: _str(j['roomNumber']),
    checkIn: _date(j['checkIn']),
    checkOut: _date(j['checkOut']),
    link: j['link'] is Map ? GuestLinkState.fromJson(j['link'] as Map) : null,
  );
}
