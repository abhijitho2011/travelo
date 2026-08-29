import 'package:flutter/foundation.dart';

import '../../../core/authentication/session.dart';
import '../../../core/permissions/role_config.dart';
import '../../../core/widgets/status_badge.dart';

/// A row from `GET /staff/team` — one colleague at my property.
@immutable
class TeamMember {
  const TeamMember({
    required this.id,
    required this.firstName,
    required this.lastName,
    required this.fullName,
    required this.role,
    required this.status,
    this.department,
    this.employeeId,
    this.mobile,
    this.email,
    this.lastLoginAt,
  });

  final String id;
  final String firstName;
  final String lastName;
  final String fullName;
  final StaffRole role;
  final AccountStatus status;
  final String? department;
  final String? employeeId;
  final String? mobile;
  final String? email;
  final DateTime? lastLoginAt;

  bool get awaitingApproval =>
      status == AccountStatus.pendingApproval ||
      status == AccountStatus.invited;

  String get initials {
    final parts = fullName.trim().split(RegExp(r'\s+')).where((p) => p.isNotEmpty);
    if (parts.isEmpty) return '?';
    return parts.take(2).map((p) => p[0].toUpperCase()).join();
  }

  StatusTone get tone => switch (status) {
    AccountStatus.active => StatusTone.healthy,
    AccountStatus.pendingApproval => StatusTone.warning,
    AccountStatus.approved => StatusTone.cleaning,
    AccountStatus.invited => StatusTone.occupied,
    AccountStatus.blocked => StatusTone.critical,
    AccountStatus.suspended => StatusTone.dirty,
    AccountStatus.deactivated => StatusTone.outOfOrder,
    AccountStatus.unknown => StatusTone.neutral,
  };

  factory TeamMember.fromJson(Map json) {
    final first = (json['firstName'] as String?) ?? '';
    final last = (json['lastName'] as String?) ?? '';
    return TeamMember(
      id: (json['id'] ?? '').toString(),
      firstName: first,
      lastName: last,
      fullName: (json['fullName'] as String?)?.trim().isNotEmpty == true
          ? json['fullName'] as String
          : '$first $last'.trim(),
      role: StaffRole.fromWire(json['role'] as String?),
      status: AccountStatus.fromWire(json['status'] as String?),
      department: json['department'] as String?,
      employeeId: json['employeeId'] as String?,
      mobile: json['mobile'] as String?,
      email: json['email'] as String?,
      lastLoginAt: DateTime.tryParse(
        (json['lastLoginAt'] ?? '').toString(),
      )?.toLocal(),
    );
  }
}

/// The filter state of the team directory.
@immutable
class TeamFilter {
  const TeamFilter({this.role, this.status, this.query, this.department});

  final StaffRole? role;
  final AccountStatus? status;
  final String? query;
  final String? department;

  bool get isEmpty =>
      role == null &&
      status == null &&
      (query == null || query!.isEmpty) &&
      (department == null || department!.isEmpty);

  TeamFilter copyWith({
    StaffRole? role,
    AccountStatus? status,
    String? query,
    String? department,
    bool clearRole = false,
    bool clearStatus = false,
  }) => TeamFilter(
    role: clearRole ? null : (role ?? this.role),
    status: clearStatus ? null : (status ?? this.status),
    query: query ?? this.query,
    department: department ?? this.department,
  );

  Map<String, dynamic> toQuery() => {
    if (role != null) 'role': role!.wire,
    if (status != null) 'status': status!.wire,
    if (query != null && query!.isNotEmpty) 'q': query,
    if (department != null && department!.isNotEmpty) 'department': department,
  };
}

/// Payload for `POST /staff/team`.
@immutable
class NewTeamMember {
  const NewTeamMember({
    required this.role,
    required this.firstName,
    required this.lastName,
    required this.mobile,
    required this.email,
    this.department,
    this.employeeId,
    this.activate = false,
  });

  final StaffRole role;
  final String firstName;
  final String lastName;
  final String mobile;
  final String email;
  final String? department;
  final String? employeeId;

  /// Honoured only when the creator holds `staff.approve`; the server ignores
  /// it otherwise, so the client never over-promises.
  final bool activate;

  Map<String, dynamic> toJson() => {
    'role': role.wire,
    'firstName': firstName,
    'lastName': lastName,
    'mobile': mobile,
    'email': email,
    if (department != null && department!.isNotEmpty) 'department': department,
    if (employeeId != null && employeeId!.isNotEmpty) 'employeeId': employeeId,
    if (activate) 'activate': true,
  };
}
