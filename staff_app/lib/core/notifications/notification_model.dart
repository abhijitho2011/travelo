import 'package:flutter/foundation.dart';

import '../widgets/status_badge.dart';

enum NotificationKind {
  task,
  approval,
  reservation,
  maintenance,
  security,
  system;

  static NotificationKind fromWire(String? v) => NotificationKind.values
      .firstWhere((k) => k.name == v?.toLowerCase(), orElse: () => NotificationKind.system);

  /// The server sends a dotted notification `type` (e.g. `staff.approved`,
  /// `work_order.assigned`), not one of our coarse kinds. Map it by its leading
  /// segment so the icon and tone are right; unknown types read as `system`.
  static NotificationKind fromType(String? type) {
    final head = (type ?? '').toLowerCase().split('.').first;
    return switch (head) {
      'task' || 'housekeeping' || 'kot' => NotificationKind.task,
      'approval' || 'staff' || 'expense' || 'purchase' => NotificationKind.approval,
      'reservation' || 'booking' || 'checkin' || 'checkout' => NotificationKind.reservation,
      'maintenance' || 'work_order' || 'workorder' => NotificationKind.maintenance,
      'security' || 'incident' || 'visitor' || 'patrol' => NotificationKind.security,
      _ => NotificationKind.system,
    };
  }
}

@immutable
class StaffNotification {
  const StaffNotification({
    required this.id,
    required this.title,
    required this.body,
    required this.createdAt,
    required this.kind,
    this.read = false,
    this.route,
  });

  final String id;
  final String title;
  final String body;
  final DateTime createdAt;
  final NotificationKind kind;
  final bool read;

  /// Optional deep link. The router still applies its guards, so a
  /// notification can never be used to reach a screen the role may not see.
  final String? route;

  StatusTone get tone => switch (kind) {
    NotificationKind.task => StatusTone.cleaning,
    NotificationKind.approval => StatusTone.warning,
    NotificationKind.reservation => StatusTone.occupied,
    NotificationKind.maintenance => StatusTone.maintenance,
    NotificationKind.security => StatusTone.critical,
    NotificationKind.system => StatusTone.neutral,
  };

  StaffNotification copyWith({bool? read}) => StaffNotification(
    id: id,
    title: title,
    body: body,
    createdAt: createdAt,
    kind: kind,
    read: read ?? this.read,
    route: route,
  );

  factory StaffNotification.fromJson(Map json) {
    // The server row carries `type` (a dotted key), `readAt` (a timestamp, null
    // when unread) and `meta` (json). The app previously read `kind`/`read`/
    // `route`, so every notification rendered unread, as `system`, with no deep
    // link. Read the real fields, keeping the old names as fallbacks.
    final meta = json['meta'];
    final route = (json['route'] ??
        (meta is Map ? (meta['route'] ?? meta['relatedType']) : null)) as String?;
    return StaffNotification(
      id: (json['id'] ?? '').toString(),
      title: (json['title'] as String?) ?? 'Notification',
      body: (json['body'] as String?) ?? '',
      createdAt:
          DateTime.tryParse((json['createdAt'] ?? '').toString())?.toLocal() ??
          DateTime.now(),
      kind: NotificationKind.fromType(
        (json['type'] ?? json['kind']) as String?,
      ),
      read: json['readAt'] != null || json['read'] == true,
      route: route,
    );
  }
}
