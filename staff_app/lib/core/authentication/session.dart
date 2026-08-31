import 'package:flutter/foundation.dart';

import '../permissions/permission_set.dart';
import '../permissions/role_config.dart';

/// Account lifecycle as reported by `GET /auth/me → user.status`.
enum AccountStatus {
  active('ACTIVE'),
  pendingApproval('PENDING_APPROVAL'),
  approved('APPROVED'),
  invited('INVITED'),
  blocked('BLOCKED'),
  suspended('SUSPENDED'),
  deactivated('DEACTIVATED'),
  unknown('UNKNOWN');

  const AccountStatus(this.wire);

  final String wire;

  static AccountStatus fromWire(String? value) {
    if (value == null) return AccountStatus.unknown;
    final n = value.trim().toUpperCase().replaceAll(' ', '_');
    for (final s in AccountStatus.values) {
      if (s.wire == n) return s;
    }
    return AccountStatus.unknown;
  }

  /// Only an ACTIVE account may use the app. Anything else is routed to a
  /// dedicated status screen by the AccountStatusGuard.
  bool get canUseApp => this == AccountStatus.active;

  String get label => switch (this) {
    AccountStatus.active => 'Active',
    AccountStatus.pendingApproval => 'Pending approval',
    AccountStatus.approved => 'Approved, not yet active',
    AccountStatus.invited => 'Invited',
    AccountStatus.blocked => 'Blocked',
    AccountStatus.suspended => 'Suspended',
    AccountStatus.deactivated => 'Deactivated',
    AccountStatus.unknown => 'Unknown',
  };
}

@immutable
class StaffUser {
  const StaffUser({
    required this.id,
    required this.firstName,
    required this.lastName,
    required this.fullName,
    required this.status,
    this.email,
    this.mobile,
    this.employeeId,
    this.department,
  });

  final String id;
  final String firstName;
  final String lastName;
  final String fullName;
  final String? email;
  final String? mobile;
  final String? employeeId;
  final String? department;
  final AccountStatus status;

  String get initials {
    final parts = fullName
        .trim()
        .split(RegExp(r'\s+'))
        .where((p) => p.isNotEmpty);
    if (parts.isEmpty) return '?';
    return parts.take(2).map((p) => p[0].toUpperCase()).join();
  }

  factory StaffUser.fromJson(Map json) {
    final first = (json['firstName'] as String?) ?? '';
    final last = (json['lastName'] as String?) ?? '';
    return StaffUser(
      id: (json['id'] ?? '').toString(),
      firstName: first,
      lastName: last,
      fullName: (json['fullName'] as String?)?.trim().isNotEmpty == true
          ? json['fullName'] as String
          : '$first $last'.trim(),
      email: json['email'] as String?,
      mobile: json['mobile'] as String?,
      employeeId: json['employeeId'] as String?,
      department: json['department'] as String?,
      status: AccountStatus.fromWire(json['status'] as String?),
    );
  }
}

@immutable
class Hotel {
  const Hotel({required this.id, required this.name, this.city, this.state});

  final String id;
  final String name;
  final String? city;
  final String? state;

  String get location =>
      [city, state].where((s) => s != null && s.isNotEmpty).join(', ');

  factory Hotel.fromJson(Map json) => Hotel(
    id: (json['id'] ?? '').toString(),
    name: (json['name'] as String?) ?? 'Your hotel',
    city: json['city'] as String?,
    state: json['state'] as String?,
  );
}

@immutable
class Organization {
  const Organization({required this.id, required this.name});

  final String id;
  final String name;

  factory Organization.fromJson(Map json) => Organization(
    id: (json['id'] ?? '').toString(),
    name: (json['name'] as String?) ?? '',
  );
}

/// Everything `GET /auth/me` tells us, plus the resolved [RoleConfig].
@immutable
class Session {
  const Session({
    required this.user,
    required this.role,
    required this.permissions,
    this.hotel,
    this.organization,
  });

  final StaffUser user;
  final StaffRole role;
  final PermissionSet permissions;
  final Hotel? hotel;
  final Organization? organization;

  RoleConfig get config => RoleConfig.of(role);

  bool can(String permission) => permissions.has(permission);

  factory Session.fromJson(Map json) => Session(
    user: StaffUser.fromJson((json['user'] as Map?) ?? const {}),
    role: StaffRole.fromWire(json['role'] as String?),
    permissions: PermissionSet.fromJson(json['permissions']),
    hotel: json['hotel'] is Map ? Hotel.fromJson(json['hotel'] as Map) : null,
    organization: json['organization'] is Map
        ? Organization.fromJson(json['organization'] as Map)
        : null,
  );
}
