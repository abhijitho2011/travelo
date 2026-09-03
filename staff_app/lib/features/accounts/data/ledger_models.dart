// Direct billing (company accounts + ledger) and the cash tracker / shifts.

import '../../rooms/data/room_models.dart' show formatPaise;

String? _str(Object? v) => v?.toString();
int _int(Object? v) => v is int ? v : int.tryParse('$v') ?? 0;
int? _intOrNull(Object? v) =>
    v == null ? null : (v is int ? v : int.tryParse('$v'));
bool _bool(Object? v) => v == true || v == 'true';
DateTime? _date(Object? v) => v == null ? null : DateTime.tryParse('$v');

class CorporateAccount {
  const CorporateAccount({
    required this.id,
    required this.name,
    this.gstin,
    this.contactName,
    this.contactPhone,
    this.contactEmail,
    this.address,
    this.creditLimitPaise,
    this.isActive = true,
    this.balancePaise = 0,
  });
  final String id;
  final String name;
  final String? gstin;
  final String? contactName;
  final String? contactPhone;
  final String? contactEmail;
  final String? address;
  final int? creditLimitPaise;
  final bool isActive;
  final int balancePaise;
  String get balanceLabel => formatPaise(balancePaise);
  bool get overLimit =>
      creditLimitPaise != null && balancePaise > creditLimitPaise!;
  factory CorporateAccount.fromJson(Map j) => CorporateAccount(
    id: '${j['id']}',
    name: _str(j['name']) ?? '',
    gstin: _str(j['gstin']),
    contactName: _str(j['contactName']),
    contactPhone: _str(j['contactPhone']),
    contactEmail: _str(j['contactEmail']),
    address: _str(j['address']),
    creditLimitPaise: _intOrNull(j['creditLimitPaise']),
    isActive: j['isActive'] == null ? true : _bool(j['isActive']),
    balancePaise: _int(j['balancePaise']),
  );
}

class LedgerEntry {
  const LedgerEntry({
    required this.id,
    required this.kind,
    required this.amountPaise,
    required this.runningBalancePaise,
    this.reference,
    this.note,
    this.reservationId,
    this.orderId,
    this.createdAt,
  });
  final String id;
  final String kind;
  final int amountPaise;
  final int runningBalancePaise;
  final String? reference;
  final String? note;
  final String? reservationId;
  final String? orderId;
  final DateTime? createdAt;
  bool get isCharge => kind == 'CHARGE';
  factory LedgerEntry.fromJson(Map j) => LedgerEntry(
    id: '${j['id']}',
    kind: _str(j['kind']) ?? 'CHARGE',
    amountPaise: _int(j['amountPaise']),
    runningBalancePaise: _int(j['runningBalancePaise']),
    reference: _str(j['reference']),
    note: _str(j['note']),
    reservationId: _str(j['reservationId']),
    orderId: _str(j['orderId']),
    createdAt: _date(j['createdAt']),
  );
}

class CorporateStatement {
  const CorporateStatement({
    required this.account,
    required this.balancePaise,
    required this.entries,
    required this.stays,
  });
  final CorporateAccount account;
  final int balancePaise;
  final List<LedgerEntry> entries;
  final List<Map> stays;
  factory CorporateStatement.fromJson(Map j) => CorporateStatement(
    account: CorporateAccount.fromJson(j['account'] as Map),
    balancePaise: _int(j['balancePaise']),
    entries: (j['entries'] as List? ?? const [])
        .whereType<Map>()
        .map(LedgerEntry.fromJson)
        .toList(),
    stays: (j['stays'] as List? ?? const []).whereType<Map>().toList(),
  );
}

class CashEntry {
  const CashEntry({
    required this.id,
    required this.kind,
    required this.amountPaise,
    required this.signedPaise,
    this.note,
    this.createdAt,
  });
  final String id;
  final String kind;
  final int amountPaise;
  final int signedPaise;
  final String? note;
  final DateTime? createdAt;
  String get kindLabel => switch (kind) {
    'FOLIO_CASH' => 'Folio cash',
    'POS_CASH' => 'Till cash',
    'CASH_IN' => 'Cash in',
    'WITHDRAWAL' => 'Withdrawal',
    'TOP_UP' => 'Top-up',
    'EXPENSE' => 'Cash expense',
    _ => kind,
  };
  factory CashEntry.fromJson(Map j) => CashEntry(
    id: '${j['id']}',
    kind: _str(j['kind']) ?? '',
    amountPaise: _int(j['amountPaise']),
    signedPaise: _int(j['signedPaise']),
    note: _str(j['note']),
    createdAt: _date(j['createdAt']),
  );
}

class CashBook {
  const CashBook({required this.balancePaise, required this.items});
  final int balancePaise;
  final List<CashEntry> items;
  factory CashBook.fromJson(Map j) => CashBook(
    balancePaise: _int(j['balancePaise']),
    items: (j['items'] as List? ?? const [])
        .whereType<Map>()
        .map(CashEntry.fromJson)
        .toList(),
  );
}

class Shift {
  const Shift({
    required this.id,
    required this.openedAt,
    this.closedAt,
    this.openingCashPaise = 0,
    this.declaredCashPaise,
    this.expectedCashPaise,
    this.note,
  });
  final String id;
  final DateTime openedAt;
  final DateTime? closedAt;
  final int openingCashPaise;
  final int? declaredCashPaise;
  final int? expectedCashPaise;
  final String? note;
  bool get isOpen => closedAt == null;
  int? get differencePaise =>
      declaredCashPaise == null || expectedCashPaise == null
      ? null
      : declaredCashPaise! - expectedCashPaise!;
  factory Shift.fromJson(Map j) => Shift(
    id: '${j['id']}',
    openedAt: _date(j['openedAt']) ?? DateTime.now(),
    closedAt: _date(j['closedAt']),
    openingCashPaise: _int(j['openingCashPaise']),
    declaredCashPaise: _intOrNull(j['declaredCashPaise']),
    expectedCashPaise: _intOrNull(j['expectedCashPaise']),
    note: _str(j['note']),
  );
}
