import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/providers.dart';
import '../data/guest_comms_models.dart';
import '../data/guest_comms_repository.dart';

final guestCommsRepositoryProvider = Provider<GuestCommsRepository>(
  (ref) => GuestCommsRepository(ref.watch(apiClientProvider)),
);

final conversationsProvider = FutureProvider.autoDispose<List<Conversation>>(
  (ref) => ref.watch(guestCommsRepositoryProvider).conversations(),
);
final conversationThreadProvider = FutureProvider.autoDispose
    .family<ConversationThread, String>(
      (ref, id) => ref.watch(guestCommsRepositoryProvider).thread(id),
    );
final reviewsProvider = FutureProvider.autoDispose<ReviewsPage>(
  (ref) => ref.watch(guestCommsRepositoryProvider).reviews(),
);
final guestLinkProvider = FutureProvider.autoDispose
    .family<GuestLinkStatus, String>(
      (ref, id) => ref.watch(guestCommsRepositoryProvider).guestLink(id),
    );

class GuestCommsActions {
  GuestCommsActions(this._ref);
  final Ref _ref;
  GuestCommsRepository get _repo => _ref.read(guestCommsRepositoryProvider);

  Future<void> send(
    String conversationId, {
    required String channel,
    required String body,
  }) async {
    await _repo.send(conversationId, channel: channel, body: body);
    _ref.invalidate(conversationThreadProvider(conversationId));
    _ref.invalidate(conversationsProvider);
  }

  Future<String> start({
    required String reservationId,
    required String channel,
    required String body,
  }) async {
    final m = await _repo.start(
      reservationId: reservationId,
      channel: channel,
      body: body,
    );
    _ref.invalidate(conversationsProvider);
    return '${m['conversationId']}';
  }

  Future<void> addReview(Map<String, dynamic> b) async {
    await _repo.addReview(b);
    _ref.invalidate(reviewsProvider);
  }

  Future<String> draft(String id, {String tone = 'warm'}) =>
      _repo.draftReply(id, tone: tone);
  Future<void> respond(String id, String response) async {
    await _repo.respond(id, response);
    _ref.invalidate(reviewsProvider);
  }

  Future<Map> sendGuestLink(String reservationId) async {
    final r = await _repo.sendGuestLink(reservationId);
    _ref.invalidate(guestLinkProvider(reservationId));
    return r;
  }

  Future<CustomReportResult> customReport(Map<String, dynamic> q) =>
      _repo.customReport(q);
}

final guestCommsActionsProvider = Provider<GuestCommsActions>(
  GuestCommsActions.new,
);
