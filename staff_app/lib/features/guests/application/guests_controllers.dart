import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../data/guest_models.dart';
import '../data/guests_repository.dart';

final guestQueryProvider = StateProvider<String>((_) => '');

final guestsProvider = FutureProvider.autoDispose<List<GuestSummary>>((ref) {
  final q = ref.watch(guestQueryProvider).trim();
  return ref.watch(guestsRepositoryProvider).search(q: q.isEmpty ? null : q);
});

final guestProfileProvider = FutureProvider.autoDispose
    .family<GuestProfile, String>((ref, phone) {
      return ref.watch(guestsRepositoryProvider).profile(phone);
    });

class GuestsActions {
  GuestsActions(this._ref);
  final Ref _ref;

  Future<void> flag(
    String phone, {
    bool? blacklisted,
    String? blacklistReason,
    String? notes,
  }) async {
    await _ref
        .read(guestsRepositoryProvider)
        .flag(
          phone,
          blacklisted: blacklisted,
          blacklistReason: blacklistReason,
          notes: notes,
        );
    _ref.invalidate(guestsProvider);
    _ref.invalidate(guestProfileProvider(phone));
  }
}

final guestsActionsProvider = Provider<GuestsActions>(GuestsActions.new);
