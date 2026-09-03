import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/providers.dart';
import '../data/rates_models.dart';
import '../data/rates_repository.dart';

final ratesRepositoryProvider = Provider<RatesRepository>(
  (ref) => RatesRepository(ref.watch(apiClientProvider)),
);

/// The first day of the grid window. 14 days at a time, like the calendar.
final ratesWindowStartProvider = StateProvider<DateTime>((_) {
  final n = DateTime.now();
  return DateTime(n.year, n.month, n.day);
});
const kRatesWindowDays = 14;

final rateGridProvider = FutureProvider.autoDispose<RateGrid>((ref) {
  final start = ref.watch(ratesWindowStartProvider);
  return ref
      .watch(ratesRepositoryProvider)
      .grid(start, start.add(const Duration(days: kRatesWindowDays)));
});

final rateChangesProvider = FutureProvider.autoDispose<List<RateChange>>(
  (ref) => ref.watch(ratesRepositoryProvider).changes(),
);

class RatesActions {
  RatesActions(this._ref);
  final Ref _ref;

  Future<Map> bulk({
    required List<String> roomTypeIds,
    required List<({DateTime from, DateTime to})> ranges,
    List<int>? daysOfWeek,
    required Map<String, dynamic> set,
  }) async {
    final res = await _ref
        .read(ratesRepositoryProvider)
        .bulk(
          roomTypeIds: roomTypeIds,
          ranges: ranges,
          daysOfWeek: daysOfWeek,
          set: set,
        );
    _ref.invalidate(rateGridProvider);
    _ref.invalidate(rateChangesProvider);
    return res;
  }
}

final ratesActionsProvider = Provider<RatesActions>(RatesActions.new);
