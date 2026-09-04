import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../rates/application/rates_controllers.dart';
import '../../rooms/application/units_controllers.dart';
import '../../rooms/data/unit_models.dart';
import '../data/revenue_models.dart';

/// The room type the revenue manager is looking at. Null until the catalogue
/// has loaded, when the screen falls back to the first active type.
final revenueRoomTypeProvider = StateProvider<String?>((_) => null);

/// How far ahead a run reaches. Mirrors the server's `RULE_HORIZON_DAYS`; the
/// engine's own hourly pass uses the same window.
const kRevenueHorizonDays = 90;

/// A read of the selected type's rules summarised for the KPI strip: how many
/// are switched on, and the most recent time the engine applied any of them.
class RuleSummary {
  const RuleSummary({
    required this.total,
    required this.active,
    required this.lastRunAt,
  });

  final int total;
  final int active;
  final DateTime? lastRunAt;

  static RuleSummary of(List<PricingRule> rules) {
    DateTime? last;
    for (final r in rules) {
      final t = r.lastRunAt;
      if (t != null && (last == null || t.isAfter(last))) last = t;
    }
    return RuleSummary(
      total: rules.length,
      active: rules.where((r) => r.enabled).length,
      lastRunAt: last,
    );
  }
}

/// Runs the engine for one room type — as a preview or for real — through
/// the same repository the room workspace uses, then refreshes what changed:
/// the rules (their `lastRunAt`) and the rates grid the run wrote to.
class RevenueActions {
  const RevenueActions(this._ref);

  final Ref _ref;

  Future<RuleRunResult> run(String roomTypeId, {required bool dryRun}) async {
    final raw = await _ref
        .read(unitsActionsProvider)
        .runRules(roomTypeId, dryRun: dryRun);
    final result = RuleRunResult.fromJson(raw);
    if (!dryRun) {
      _ref.invalidate(pricingRulesProvider(roomTypeId));
      _ref.invalidate(rateGridProvider);
    }
    return result;
  }
}

final revenueActionsProvider = Provider<RevenueActions>(RevenueActions.new);
