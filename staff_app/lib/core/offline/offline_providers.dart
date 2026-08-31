import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../providers.dart';
import 'connectivity_service.dart';
import 'staff_sync_handler.dart';
import 'sync_queue.dart';

final connectivityServiceProvider = Provider<ConnectivityService>(
  (_) => ConnectivityService(),
);

/// True while the platform reports a usable network path. Starts optimistic so
/// the shell does not flash "Offline" on a cold start.
final isOnlineProvider = StreamProvider<bool>((ref) async* {
  final service = ref.watch(connectivityServiceProvider);
  yield await service.isOnline();
  yield* service.onlineChanges;
});

final syncQueueProvider = ChangeNotifierProvider<SyncQueue>((ref) {
  final queue = SyncQueue(ref.watch(localStoreProvider));
  // Register the push handler so queued offline mutations actually drain. This
  // is the one wiring that was missing: without it every op stayed pending
  // forever. Reconnect triggers drain() from main.dart.
  queue.registerHandler(StaffSyncHandler(ref.watch(apiClientProvider)));
  // Fire and forget — the queue notifies once the disk read completes.
  queue.load();
  return queue;
});

/// The number rendered beside the offline chip.
final pendingSyncCountProvider = Provider<int>(
  (ref) => ref.watch(syncQueueProvider).pendingCount,
);

/// Enqueue helper that stamps the current user and device automatically, so no
/// caller has to remember the envelope fields.
final enqueueMutationProvider =
    Provider<
      Future<void> Function({
        required String entityId,
        required String operationType,
        Map<String, dynamic> payload,
      })
    >((ref) {
      return ({
        required String entityId,
        required String operationType,
        Map<String, dynamic> payload = const {},
      }) async {
        final session = ref.read(sessionProvider);
        final deviceId = await ref.read(tokenStoreProvider).deviceId();
        await ref
            .read(syncQueueProvider)
            .enqueue(
              entityId: entityId,
              operationType: operationType,
              userId: session?.user.id ?? 'unknown',
              deviceId: deviceId,
              payload: payload,
            );
      };
    });
