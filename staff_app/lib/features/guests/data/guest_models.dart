import 'package:flutter/foundation.dart';

int _int(Object? v) => switch (v) {
  num n => n.toInt(),
  String s => int.tryParse(s) ?? 0,
  _ => 0,
};
DateTime? _date(Object? v) => v == null ? null : DateTime.tryParse('$v');
String? _str(Object? v) => v == null ? null : '$v';

/// A guest as they appear in the directory: one row per phone.
@immutable
class GuestSummary {
  const GuestSummary({
    required this.phone,
    required this.name,
    required this.stays,
    this.lastStay,
    required this.totalSpentPaise,
    required this.blacklisted,
  });
  final String phone;
  final String name;
  final int stays;
  final DateTime? lastStay;
  final int totalSpentPaise;
  final bool blacklisted;
  factory GuestSummary.fromJson(Map j) => GuestSummary(
    phone: '${j['phone']}',
    name: '${j['name'] ?? 'Guest'}',
    stays: _int(j['stays']),
    lastStay: _date(j['lastStay']),
    totalSpentPaise: _int(j['totalSpentPaise']),
    blacklisted: j['blacklisted'] == true,
  );
}

/// One reservation in a guest's stay history.
@immutable
class GuestStay {
  const GuestStay({
    required this.reservationId,
    required this.reservationNumber,
    this.checkIn,
    this.checkOut,
    required this.status,
    required this.totalPaise,
    required this.paidPaise,
  });
  final String reservationId;
  final String reservationNumber;
  final DateTime? checkIn;
  final DateTime? checkOut;
  final String status;
  final int totalPaise;
  final int paidPaise;
  factory GuestStay.fromJson(Map j) => GuestStay(
    reservationId: '${j['id']}',
    reservationNumber: '${j['reservationNumber'] ?? ''}',
    checkIn: _date(j['checkIn']),
    checkOut: _date(j['checkOut']),
    status: '${j['status'] ?? ''}',
    totalPaise: _int(j['totalPaise']),
    paidPaise: _int(j['paidPaise']),
  );
}

/// Everything the profile sheet shows: the overlay plus the stays.
@immutable
class GuestProfile {
  const GuestProfile({
    required this.phone,
    required this.name,
    required this.blacklisted,
    this.blacklistReason,
    this.notes,
    this.idType,
    this.idNumber,
    required this.stays,
    required this.history,
  });
  final String phone;
  final String name;
  final bool blacklisted;
  final String? blacklistReason;
  final String? notes;
  final String? idType;
  final String? idNumber;
  final int stays;
  final List<GuestStay> history;
  factory GuestProfile.fromJson(Map j) => GuestProfile(
    phone: '${j['phone']}',
    name: '${j['name'] ?? 'Guest'}',
    blacklisted: j['blacklisted'] == true,
    blacklistReason: _str(j['blacklistReason']),
    notes: _str(j['notes']),
    idType: _str(j['idType']),
    idNumber: _str(j['idNumber']),
    stays: _int(j['stays']),
    history: [
      for (final s in (j['history'] as List? ?? const []))
        GuestStay.fromJson(s as Map),
    ],
  );
}
