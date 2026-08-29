import 'package:flutter/foundation.dart';

enum SyncStatus {
  /// Queued locally, not yet attempted.
  pending,

  /// Currently being pushed.
  syncing,

  /// Accepted by the server; kept briefly for the UI then pruned.
  synced,

  /// Rejected or failed; needs attention or a retry.
  failed;

  static SyncStatus fromWire(String? v) => SyncStatus.values.firstWhere(
    (s) => s.name == v,
    orElse: () => SyncStatus.pending,
  );
}

/// One mutation the user made that the server has not yet accepted.
///
/// The shape is fixed by the offline spec — every module's queued write uses
/// exactly these envelope fields, with module-specific data in [payload].
@immutable
class PendingOperation {
  const PendingOperation({
    required this.operationId,
    required this.entityId,
    required this.operationType,
    required this.createdAt,
    required this.userId,
    required this.deviceId,
    required this.syncStatus,
    this.payload = const <String, dynamic>{},
    this.attempts = 0,
    this.lastError,
  });

  /// Client-generated idempotency key. The server uses it to reject replays.
  final String operationId;

  /// The domain object being mutated (task id, reservation id, …).
  final String entityId;

  /// Module-qualified verb, e.g. `task.complete`, `gate.vehicleEntry`.
  final String operationType;

  final DateTime createdAt;
  final String userId;
  final String deviceId;
  final SyncStatus syncStatus;
  final Map<String, dynamic> payload;
  final int attempts;
  final String? lastError;

  PendingOperation copyWith({
    SyncStatus? syncStatus,
    int? attempts,
    String? lastError,
  }) => PendingOperation(
    operationId: operationId,
    entityId: entityId,
    operationType: operationType,
    createdAt: createdAt,
    userId: userId,
    deviceId: deviceId,
    syncStatus: syncStatus ?? this.syncStatus,
    payload: payload,
    attempts: attempts ?? this.attempts,
    lastError: lastError,
  );

  Map<String, dynamic> toJson() => {
    'operationId': operationId,
    'entityId': entityId,
    'operationType': operationType,
    'createdAt': createdAt.toIso8601String(),
    'userId': userId,
    'deviceId': deviceId,
    'syncStatus': syncStatus.name,
    'payload': payload,
    'attempts': attempts,
    if (lastError != null) 'lastError': lastError,
  };

  factory PendingOperation.fromJson(Map<String, dynamic> json) =>
      PendingOperation(
        operationId: (json['operationId'] ?? '').toString(),
        entityId: (json['entityId'] ?? '').toString(),
        operationType: (json['operationType'] ?? '').toString(),
        createdAt:
            DateTime.tryParse((json['createdAt'] ?? '').toString()) ??
            DateTime.now(),
        userId: (json['userId'] ?? '').toString(),
        deviceId: (json['deviceId'] ?? '').toString(),
        syncStatus: SyncStatus.fromWire(json['syncStatus'] as String?),
        payload: json['payload'] is Map
            ? Map<String, dynamic>.from(json['payload'] as Map)
            : const {},
        attempts: (json['attempts'] as num?)?.toInt() ?? 0,
        lastError: json['lastError'] as String?,
      );
}
