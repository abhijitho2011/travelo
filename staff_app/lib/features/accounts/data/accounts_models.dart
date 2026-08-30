import 'package:flutter/foundation.dart';

import '../../../core/widgets/status_badge.dart';
import '../../rooms/data/room_models.dart' show formatPaise;

export '../../rooms/data/room_models.dart' show formatPaise;

// ---------------------------------------------------------------- parsing --

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

enum ExpenseCategory {
  utilities('UTILITIES', 'Utilities'),
  supplies('SUPPLIES', 'Supplies'),
  maintenance('MAINTENANCE', 'Maintenance'),
  salary('SALARY', 'Salary'),
  marketing('MARKETING', 'Marketing'),
  travel('TRAVEL', 'Travel'),
  foodBeverage('FOOD_BEVERAGE', 'Food & Beverage'),
  rent('RENT', 'Rent'),
  other('OTHER', 'Other');

  const ExpenseCategory(this.wire, this.label);
  final String wire;
  final String label;

  static ExpenseCategory fromWire(String? value) {
    final w = _wire(value);
    for (final c in values) {
      if (c.wire == w) return c;
    }
    return ExpenseCategory.other;
  }
}

enum ExpenseStatus {
  draft('DRAFT', 'Draft'),
  approved('APPROVED', 'Approved'),
  paid('PAID', 'Paid');

  const ExpenseStatus(this.wire, this.label);
  final String wire;
  final String label;

  static ExpenseStatus fromWire(String? value) {
    final w = _wire(value);
    for (final s in values) {
      if (s.wire == w) return s;
    }
    return ExpenseStatus.draft;
  }

  StatusTone get tone => switch (this) {
    ExpenseStatus.draft => StatusTone.neutral,
    ExpenseStatus.approved => StatusTone.info,
    ExpenseStatus.paid => StatusTone.healthy,
  };

  /// The next status this expense may move to, or null when terminal.
  ExpenseStatus? get next => switch (this) {
    ExpenseStatus.draft => ExpenseStatus.approved,
    ExpenseStatus.approved => ExpenseStatus.paid,
    ExpenseStatus.paid => null,
  };
}

// ------------------------------------------------------------------ models --

@immutable
class Expense {
  const Expense({
    required this.id,
    required this.category,
    required this.amountPaise,
    required this.status,
    this.vendor,
    this.incurredOn,
    this.note,
  });

  final String id;
  final ExpenseCategory category;
  final int amountPaise;
  final ExpenseStatus status;
  final String? vendor;
  final DateTime? incurredOn;
  final String? note;

  String get amountLabel => formatPaise(amountPaise);

  static Expense fromJson(Map json) => Expense(
    id: (_pick(json, ['id']) ?? '').toString(),
    category: ExpenseCategory.fromWire(_pick(json, ['category'])?.toString()),
    amountPaise: _int(_pick(json, ['amountPaise'])),
    status: ExpenseStatus.fromWire(_pick(json, ['status'])?.toString()),
    vendor: _str(_pick(json, ['vendor'])),
    incurredOn: _date(_pick(json, ['incurredOn'])),
    note: _str(_pick(json, ['note'])),
  );
}

@immutable
class AccountsSummary {
  const AccountsSummary({
    required this.roomsPaise,
    required this.fnbPaise,
    required this.totalRevenuePaise,
    required this.expensesTodayPaise,
    required this.receivablesCount,
    required this.payablesCount,
    this.date,
  });

  final int roomsPaise;
  final int fnbPaise;
  final int totalRevenuePaise;
  final int expensesTodayPaise;
  final int receivablesCount;
  final int payablesCount;
  final DateTime? date;

  static AccountsSummary fromJson(Map json) {
    final revenue = _pick(json, ['revenue']);
    final rev = revenue is Map ? revenue : const {};
    return AccountsSummary(
      roomsPaise: _int(_pick(rev, ['roomsPaise'])),
      fnbPaise: _int(_pick(rev, ['fnbPaise'])),
      totalRevenuePaise: _int(_pick(rev, ['totalPaise'])),
      expensesTodayPaise: _int(_pick(json, ['expensesTodayPaise'])),
      receivablesCount: _int(_pick(json, ['receivablesCount'])),
      payablesCount: _int(_pick(json, ['payablesCount'])),
      date: _date(_pick(json, ['date'])),
    );
  }
}
