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

  factory StaffNotification.fromJson(Map json) => StaffNotification(
    id: (json['id'] ?? '').toString(),
    title: (json['title'] as String?) ?? 'Notification',
    body: (json['body'] as String?) ?? '',
    createdAt:
        DateTime.tryParse((json['createdAt'] ?? '').toString())?.toLocal() ??
        DateTime.now(),
    kind: NotificationKind.fromWire(json['kind'] as String?),
    read: json['read'] == true,
    route: json['route'] as String?,
  );
}
