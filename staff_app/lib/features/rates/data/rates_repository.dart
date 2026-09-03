import '../../../core/networking/api_client.dart';
import 'rates_models.dart';

String _iso(DateTime d) =>
    '${d.year.toString().padLeft(4, '0')}-${d.month.toString().padLeft(2, '0')}-${d.day.toString().padLeft(2, '0')}';

class RatesRepository {
  RatesRepository(this._api);
  final ApiClient _api;

  Future<RateGrid> grid(DateTime from, DateTime to) async => RateGrid.fromJson(
    await _api.get('/rates/grid', query: {'from': _iso(from), 'to': _iso(to)})
        as Map,
  );

  /// One bulk write: any cell edit is a one-cell bulk update on the server.
  Future<Map> bulk({
    required List<String> roomTypeIds,
    required List<({DateTime from, DateTime to})> ranges,
    List<int>? daysOfWeek,
    required Map<String, dynamic> set,
  }) async =>
      await _api.post(
            '/rates/bulk',
            body: {
              'roomTypeIds': roomTypeIds,
              'ranges': [
                for (final r in ranges)
                  {'from': _iso(r.from), 'to': _iso(r.to)},
              ],
              if (daysOfWeek != null && daysOfWeek.isNotEmpty)
                'daysOfWeek': daysOfWeek,
              'set': set,
            },
          )
          as Map;

  Future<List<RateChange>> changes({
    String? roomTypeId,
    int limit = 100,
  }) async {
    final data = await _api.get(
      '/rates/changes',
      query: {
        if (roomTypeId != null) 'roomTypeId': roomTypeId,
        'limit': '$limit',
      },
    );
    final items = data is Map ? data['items'] : data;
    return (items as List? ?? const [])
        .whereType<Map>()
        .map(RateChange.fromJson)
        .toList();
  }
}
