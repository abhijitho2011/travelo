import '../../../core/networking/api_client.dart';
import 'guest_comms_models.dart';

class GuestCommsRepository {
  GuestCommsRepository(this._api);
  final ApiClient _api;

  List<T> _list<T>(Object? d, T Function(Map) parse) {
    final raw = d is Map && d['items'] is List ? d['items'] : d;
    return (raw as List? ?? const []).whereType<Map>().map(parse).toList();
  }

  Future<List<Conversation>> conversations() async =>
      _list(await _api.get('/conversations'), Conversation.fromJson);
  Future<ConversationThread> thread(String id) async =>
      ConversationThread.fromJson(await _api.get('/conversations/$id') as Map);
  Future<void> send(
    String id, {
    required String channel,
    required String body,
  }) => _api.post(
    '/conversations/$id/messages',
    body: {'channel': channel, 'body': body},
  );
  Future<Map> start({
    required String reservationId,
    required String channel,
    required String body,
  }) async =>
      await _api.post(
            '/conversations',
            body: {
              'reservationId': reservationId,
              'channel': channel,
              'body': body,
            },
          )
          as Map;

  Future<ReviewsPage> reviews() async =>
      ReviewsPage.fromJson(await _api.get('/reviews') as Map);
  Future<void> addReview(Map<String, dynamic> b) =>
      _api.post('/reviews', body: b);
  Future<String> draftReply(String id, {String tone = 'warm'}) async =>
      ((await _api.post('/reviews/$id/draft', body: {'tone': tone})
                  as Map)['draft'] ??
              '')
          .toString();
  Future<void> respond(String id, String response) =>
      _api.post('/reviews/$id/respond', body: {'response': response});

  Future<GuestLinkStatus> guestLink(String reservationId) async =>
      GuestLinkStatus.fromJson(
        await _api.get('/reservations/$reservationId/guest-link') as Map,
      );
  Future<Map> sendGuestLink(String reservationId) async =>
      await _api.post('/reservations/$reservationId/guest-link', body: {})
          as Map;

  Future<CustomReportResult> customReport(Map<String, dynamic> q) async =>
      CustomReportResult.fromJson(
        await _api.post('/reports/custom', body: q) as Map,
      );
}
