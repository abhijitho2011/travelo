import 'dart:math';

import 'package:flutter/foundation.dart';

import '../storage/local_store.dart';
import 'pending_operation.dart';

/// What a module supplies so its queued mutations can be pushed.
///
/// NOT YET IMPLEMENTED for any module in this build. The queue, its
/// persistence and the pending-count indicator are real; the push itself is
/// deliberately absent until each module's write endpoints exist. Registering
/// a handler is the only change needed to make a module sync for real.
abstract class SyncHandler {
  /// Operation types this handler claims, e.g. `{'task.start', 'task.complete'}`.
  Set<String> get operationTypes;

  /// Push one operation. Throw to mark it failed.
  Future<void> push(PendingOperation op);
}

/// Durable queue of mutations made while offline (or optimistically while
/// online). Cached server data lives in `LocalStore`'s `cache.*` namespace and
/// is never mixed with this.
class SyncQueue extends ChangeNotifier {
  SyncQueue(this._store);

  final LocalStore _store;
  final Map<String, SyncHandler> _handlers = {};

  List<PendingOperation> _ops = const [];
  bool _loaded = false;
  bool _draining = false;

  List<PendingOperation> get operations => List.unmodifiable(_ops);

  /// What the shell's offline chip counts.
  int get pendingCount => _ops
      .where(
        (o) =>
            o.syncStatus == SyncStatus.pending ||
            o.syncStatus == SyncStatus.failed,
      )
      .length;

  int get failedCount =>
      _ops.where((o) => o.syncStatus == SyncStatus.failed).length;

  bool get hasHandlers => _handlers.isNotEmpty;

  Future<void> load() async {
    if (_loaded) return;
    final raw = await _store.readPending();
    _ops = raw.map(PendingOperation.fromJson).toList();
    _loaded = true;
    notifyListeners();
  }

  void registerHandler(SyncHandler handler) {
    for (final t in handler.operationTypes) {
      _handlers[t] = handler;
    }
  }

  /// Queue a mutation. Returns the operation so a caller can render it
  /// optimistically with a "pending" marker.
  Future<PendingOperation> enqueue({
    required String entityId,
    required String operationType,
    required String userId,
    required String deviceId,
    Map<String, dynamic> payload = const {},
  }) async {
    await load();
    final op = PendingOperation(
      operationId: newOperationId(),
      entityId: entityId,
      operationType: operationType,
      createdAt: DateTime.now(),
      userId: userId,
      deviceId: deviceId,
      syncStatus: SyncStatus.pending,
      payload: payload,
    );
    _ops = [..._ops, op];
    await _persist();
    notifyListeners();
    return op;
  }

  Future<void> remove(String operationId) async {
    _ops = _ops.where((o) => o.operationId != operationId).toList();
    await _persist();
    notifyListeners();
  }

  Future<void> clearSynced() async {
    _ops = _ops.where((o) => o.syncStatus != SyncStatus.synced).toList();
    await _persist();
    notifyListeners();
  }

  /// Attempt to push everything queued. A type with no registered handler is
  /// left `pending` — it is never silently discarded, and never reported as
  /// synced.
  Future<void> drain() async {
    if (_draining) return;
    await load();
    _draining = true;
    try {
      for (final op in [..._ops]) {
        if (op.syncStatus == SyncStatus.synced) continue;
        final handler = _handlers[op.operationType];
        if (handler == null) continue; // no module handler yet — stays queued
        _replace(op.copyWith(syncStatus: SyncStatus.syncing));
        notifyListeners();
        try {
          await handler.push(op);
          _replace(op.copyWith(syncStatus: SyncStatus.synced));
        } catch (e) {
          _replace(
            op.copyWith(
              syncStatus: SyncStatus.failed,
              attempts: op.attempts + 1,
              lastError: e.toString(),
            ),
          );
        }
      }
      await _persist();
      notifyListeners();
    } finally {
      _draining = false;
    }
  }

  void _replace(PendingOperation updated) {
    _ops = [
      for (final o in _ops)
        if (o.operationId == updated.operationId) updated else o,
    ];
  }

  Future<void> _persist() =>
      _store.writePending(_ops.map((o) => o.toJson()).toList());

  static final _rand = Random();

  static String newOperationId() {
    final ts = DateTime.now().microsecondsSinceEpoch.toRadixString(36);
    final salt = _rand.nextInt(1 << 32).toRadixString(36);
    return 'op_${ts}_$salt';
  }
}
