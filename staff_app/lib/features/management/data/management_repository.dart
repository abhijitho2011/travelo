import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/authentication/session.dart';
import '../../../core/networking/api_client.dart';
import '../../../core/networking/api_exception.dart';
import '../../../core/providers.dart';
import 'management_models.dart';
import 'team_models.dart';

/// All management-side reads and writes.
///
/// Endpoints that are not deployed yet return 404. Reads translate that into
/// "nothing available" so the dashboard degrades to honest empty states;
/// writes let the exception through, because silently swallowing a failed
/// approval would be a lie.
class ManagementRepository {
  ManagementRepository(this._api);

  final ApiClient _api;

  // ------------------------------------------------------------ dashboard --

  Future<HotelSnapshot?> snapshot() async {
    try {
      final data = await _api.get('/dashboard');
      if (data is Map) return HotelSnapshot.fromJson(data);
      return null;
    } on ApiException catch (e) {
      if (e.isMissingEndpoint) return null;
      rethrow;
    }
  }

  Future<List<OperationalAlert>> alerts() async {
    try {
      final data = await _api.get('/dashboard/alerts');
      return _listOf(data, OperationalAlert.fromJson);
    } on ApiException catch (e) {
      if (e.isMissingEndpoint) return const [];
      rethrow;
    }
  }

  // ------------------------------------------------------------ approvals --

  /// The approval queue. Staff waiting for approval are pulled from
  /// `/team?status=PENDING_APPROVAL` and folded into the same list, so a GM has
  /// one queue rather than two.
  Future<List<ApprovalItem>> approvals() async {
    final results = await Future.wait([
      _generalApprovals(),
      _pendingStaffAsApprovals(),
    ]);
    return [...results[1], ...results[0]];
  }

  Future<List<ApprovalItem>> _generalApprovals() async {
    try {
      final data = await _api.get('/approvals');
      return _listOf(data, ApprovalItem.fromJson);
    } on ApiException catch (e) {
      if (e.isMissingEndpoint || e.code == ApiErrorCodes.forbidden) {
        return const [];
      }
      rethrow;
    }
  }

  Future<List<ApprovalItem>> _pendingStaffAsApprovals() async {
    try {
      final members = await team(
        const TeamFilter(status: AccountStatus.pendingApproval),
      );
      return members
          .map(
            (m) => ApprovalItem(
              id: m.id,
              kind: ApprovalKind.staff,
              title: m.fullName,
              subtitle: [
                m.role.label,
                if (m.department?.isNotEmpty == true) m.department!,
              ].join(' · '),
              requestedBy: m.mobile,
            ),
          )
          .toList();
    } on ApiException catch (e) {
      if (e.isMissingEndpoint || e.code == ApiErrorCodes.forbidden) {
        return const [];
      }
      rethrow;
    }
  }

  Future<void> decideApproval(
    ApprovalItem item, {
    required bool approve,
    String? reason,
  }) async {
    if (item.kind == ApprovalKind.staff) {
      // Staff approvals route to the team endpoints: approve flips
      // PENDING_APPROVAL → ACTIVE; rejecting deactivates the row rather than
      // deleting it, so the record and its reason survive.
      if (approve) {
        await _api.post('/team/${item.id}/approve');
      } else {
        await _api.post(
          '/team/${item.id}/status',
          body: {'status': 'DEACTIVATED', if (reason != null) 'reason': reason},
        );
      }
      return;
    }
    await _api.post(
      '/approvals/${item.id}/${approve ? 'approve' : 'reject'}',
      body: reason == null ? null : {'reason': reason},
    );
  }

  // ----------------------------------------------------------------- team --

  Future<List<TeamMember>> team(TeamFilter filter) async {
    try {
      final data = await _api.get('/team', query: filter.toQuery());
      return _listOf(data, TeamMember.fromJson);
    } on ApiException catch (e) {
      if (e.isMissingEndpoint) return const [];
      rethrow;
    }
  }

  Future<void> createMember(NewTeamMember member) =>
      _api.post('/team', body: member.toJson());

  Future<void> approveMember(String id) => _api.post('/team/$id/approve');

  Future<void> setMemberStatus(String id, AccountStatus status) =>
      _api.post('/team/$id/status', body: {'status': status.wire});

  Future<void> removeMember(String id) => _api.delete('/team/$id');

  // ------------------------------------------------------------- helpers --

  static List<T> _listOf<T>(dynamic data, T Function(Map) parse) {
    if (data is List) return data.whereType<Map>().map(parse).toList();
    if (data is Map && data['items'] is List) {
      return (data['items'] as List).whereType<Map>().map(parse).toList();
    }
    return const [];
  }
}

final managementRepositoryProvider = Provider<ManagementRepository>(
  (ref) => ManagementRepository(ref.watch(apiClientProvider)),
);
