import '../../../core/networking/api_client.dart';
import 'reports_models.dart';

class ReportsRepository {
  ReportsRepository(this._api);
  final ApiClient _api;

  Future<List<NightAuditDay>> nightAudit({int days = 30}) async {
    final data = await _api.get('/night-audit', query: {'days': '$days'});
    final items = data is Map ? data['items'] : data;
    return (items as List? ?? const [])
        .whereType<Map>()
        .map(NightAuditDay.fromJson)
        .toList();
  }

  /// Close the day by hand — for a missed scheduled run. Idempotent server-side.
  Future<Map> runNightAudit() async =>
      await _api.post('/night-audit/run', body: {}) as Map;
}
