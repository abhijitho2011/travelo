import 'package:flutter/foundation.dart';

int _int(Object? v) =>
    v is int ? v : (v is num ? v.toInt() : int.tryParse('$v') ?? 0);
int? _intOrNull(Object? v) => v == null
    ? null
    : (v is int ? v : (v is num ? v.toInt() : int.tryParse('$v')));
String? _str(Object? v) {
  final t = v?.toString().trim();
  return (t == null || t.isEmpty) ? null : t;
}

/// One night the engine would (or did) touch: `toPaise` null means the rule
/// that priced it no longer matches and the day reverts to its base price.
@immutable
class RulePlanEntry {
  const RulePlanEntry({
    required this.roomTypeId,
    required this.date,
    required this.fromPaise,
    this.toPaise,
    this.ruleId,
    this.ruleName,
  });

  final String roomTypeId;

  /// ISO date, as the server sends it.
  final String date;
  final int fromPaise;
  final int? toPaise;
  final String? ruleId;
  final String? ruleName;

  bool get isRevert => toPaise == null;

  factory RulePlanEntry.fromJson(Map j) => RulePlanEntry(
    roomTypeId: (j['roomTypeId'] ?? '').toString(),
    date: (j['date'] ?? '').toString(),
    fromPaise: _int(j['fromPaise']),
    toPaise: _intOrNull(j['toPaise']),
    ruleId: _str(j['ruleId']),
    ruleName: _str(j['ruleName']),
  );
}

/// What `POST room-types/:id/pricing-rules/run` answers, for a preview
/// (`dryRun: true`) or a real run. Shape: `RuleRunResult` in
/// `src/modules/rate-plans/revenue-engine.service.ts`.
@immutable
class RuleRunResult {
  const RuleRunResult({
    required this.roomTypes,
    required this.rulesEvaluated,
    required this.daysPriced,
    required this.daysReverted,
    required this.dryRun,
    this.plan = const [],
  });

  final int roomTypes;
  final int rulesEvaluated;
  final int daysPriced;
  final int daysReverted;
  final bool dryRun;
  final List<RulePlanEntry> plan;

  bool get isNoop => plan.isEmpty;

  factory RuleRunResult.fromJson(Map j) => RuleRunResult(
    roomTypes: _int(j['roomTypes']),
    rulesEvaluated: _int(j['rulesEvaluated']),
    daysPriced: _int(j['daysPriced']),
    daysReverted: _int(j['daysReverted']),
    dryRun: j['dryRun'] == true,
    plan: (j['plan'] as List? ?? const [])
        .whereType<Map>()
        .map(RulePlanEntry.fromJson)
        .toList(),
  );
}
