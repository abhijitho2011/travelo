import '../../../core/networking/api_client.dart';
import 'guest_link_models.dart';

class GuestJourneyRepository {
  GuestJourneyRepository(this._api);
  final ApiClient _api;

  /// [window] is `today`, `week` or `all` — which arrivals/in-house stays.
  Future<List<GuestLinkRow>> guestLinks(String window) async {
    final d = await _api.get('/guest-links', query: {'window': window});
    final raw = d is Map && d['items'] is List ? d['items'] : d;
    return (raw as List? ?? const [])
        .whereType<Map>()
        .map(GuestLinkRow.fromJson)
        .toList();
  }
}
