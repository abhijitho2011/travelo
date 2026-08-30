import 'dart:async';

import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../networking/api_client.dart';
import '../networking/api_exception.dart';
import '../providers.dart';
import 'notification_model.dart';

/// Reads `GET /notifications`. The endpoint may not exist yet — a 404 resolves
/// to an empty list rather than an error, so the bell is simply quiet instead
/// of showing a scary failure.
class NotificationsRepository {
  NotificationsRepository(this._api);

  final ApiClient _api;

  Future<List<StaffNotification>> list() async {
    try {
      final data = await _api.get('/notifications');
      if (data is List) {
        return data
            .whereType<Map>()
            .map(StaffNotification.fromJson)
            .toList();
      }
      if (data is Map && data['items'] is List) {
        return (data['items'] as List)
            .whereType<Map>()
            .map(StaffNotification.fromJson)
            .toList();
      }
      return const [];
    } on ApiException catch (e) {
      if (e.isMissingEndpoint) return const [];
      rethrow;
    }
  }

  Future<void> markRead(String id) async {
    try {
      await _api.post('/notifications/$id/read');
    } on ApiException catch (e) {
      if (!e.isMissingEndpoint) rethrow;
    }
  }

  /// One call to clear the inbox, instead of a POST per unread row.
  Future<void> markAllRead() async {
    try {
      await _api.post('/notifications/read-all');
    } on ApiException catch (e) {
      if (!e.isMissingEndpoint) rethrow;
    }
  }
}

final notificationsRepositoryProvider = Provider<NotificationsRepository>(
  (ref) => NotificationsRepository(ref.watch(apiClientProvider)),
);

final notificationsProvider =
    AsyncNotifierProvider<NotificationsController, List<StaffNotification>>(
      NotificationsController.new,
    );

class NotificationsController extends AsyncNotifier<List<StaffNotification>> {
  @override
  Future<List<StaffNotification>> build() {
    // Poll so the bell badge does not sit stale for a whole shift. The inbox is
    // small and the call is cheap; the timer is cancelled when the provider is
    // disposed so it never outlives the session.
    final timer = Timer.periodic(
      const Duration(seconds: 90),
      (_) => _silentRefresh(),
    );
    ref.onDispose(timer.cancel);
    return ref.watch(notificationsRepositoryProvider).list();
  }

  /// Refreshes without flipping the UI to a loading spinner — for the poll.
  Future<void> _silentRefresh() async {
    final next = await AsyncValue.guard(
      () => ref.read(notificationsRepositoryProvider).list(),
    );
    if (next.hasValue) state = next;
  }

  Future<void> refresh() async {
    state = const AsyncValue.loading();
    state = await AsyncValue.guard(
      () => ref.read(notificationsRepositoryProvider).list(),
    );
  }

  Future<void> markRead(String id) async {
    final current = state.value;
    if (current == null) return;
    state = AsyncValue.data([
      for (final n in current)
        if (n.id == id) n.copyWith(read: true) else n,
    ]);
    await ref.read(notificationsRepositoryProvider).markRead(id);
  }

  Future<void> markAllRead() async {
    final current = state.value;
    if (current == null) return;
    state = AsyncValue.data([
      for (final n in current) n.copyWith(read: true),
    ]);
    // One server call, not one per unread row.
    await ref.read(notificationsRepositoryProvider).markAllRead();
  }
}

/// Unread count for the top bar's bell badge.
final unreadNotificationCountProvider = Provider<int>((ref) {
  final value = ref.watch(notificationsProvider).value;
  if (value == null) return 0;
  return value.where((n) => !n.read).length;
});
