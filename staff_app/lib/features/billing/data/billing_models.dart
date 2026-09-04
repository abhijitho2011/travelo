import 'package:flutter/foundation.dart';

int _int(Object? v) => switch (v) {
  num n => n.toInt(),
  String s => int.tryParse(s) ?? 0,
  _ => 0,
};
DateTime? _date(Object? v) => v == null ? null : DateTime.tryParse('$v');

@immutable
class FolioRow {
  const FolioRow({
    required this.reservationId,
    required this.code,
    required this.guestName,
    this.roomNumber,
    required this.status,
    this.checkIn,
    this.checkOut,
    required this.totalPaise,
    required this.paidPaise,
    required this.balancePaise,
    this.updatedAt,
  });
  final String reservationId;
  final String code;
  final String guestName;
  final String? roomNumber;
  final String status;
  final DateTime? checkIn;
  final DateTime? checkOut;
  final int totalPaise;
  final int paidPaise;
  final int balancePaise;
  final DateTime? updatedAt;

  factory FolioRow.fromJson(Map j) => FolioRow(
    reservationId: '${j['reservationId']}',
    code: '${j['code'] ?? ''}',
    guestName: '${j['guestName'] ?? ''}',
    roomNumber: j['roomNumber']?.toString(),
    status: '${j['status'] ?? ''}',
    checkIn: _date(j['checkIn']),
    checkOut: _date(j['checkOut']),
    totalPaise: _int(j['totalPaise']),
    paidPaise: _int(j['paidPaise']),
    balancePaise: _int(j['balancePaise']),
    updatedAt: _date(j['updatedAt']),
  );
}

@immutable
class FoliosPage {
  const FoliosPage({
    required this.items,
    required this.count,
    required this.balancePaise,
  });
  final List<FolioRow> items;
  final int count;
  final int balancePaise;
  factory FoliosPage.fromJson(Map j) {
    final t = (j['totals'] as Map?) ?? const {};
    return FoliosPage(
      items: [
        for (final r in (j['items'] as List? ?? const []))
          FolioRow.fromJson(r as Map),
      ],
      count: _int(t['count']),
      balancePaise: _int(t['balancePaise']),
    );
  }
}
