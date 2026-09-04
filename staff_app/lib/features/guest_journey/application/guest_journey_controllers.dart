import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/providers.dart';
import '../../guest_comms/application/guest_comms_controllers.dart';
import '../data/guest_journey_repository.dart';
import '../data/guest_link_models.dart';

final guestJourneyRepositoryProvider = Provider<GuestJourneyRepository>(
  (ref) => GuestJourneyRepository(ref.watch(apiClientProvider)),
);

const guestLinkWindows = ['today', 'week', 'all'];

final guestLinkWindowProvider = StateProvider<String>((_) => 'today');

final guestLinksProvider = FutureProvider.autoDispose<List<GuestLinkRow>>(
  (ref) => ref
      .watch(guestJourneyRepositoryProvider)
      .guestLinks(ref.watch(guestLinkWindowProvider)),
);

class GuestJourneyActions {
  GuestJourneyActions(this._ref);
  final Ref _ref;

  /// Sends (or re-sends) the link through the existing reservation endpoint,
  /// then refreshes this list so the row's pill moves on.
  Future<void> sendLink(String reservationId) async {
    await _ref.read(guestCommsActionsProvider).sendGuestLink(reservationId);
    _ref.invalidate(guestLinksProvider);
  }
}

final guestJourneyActionsProvider = Provider<GuestJourneyActions>(
  GuestJourneyActions.new,
);
