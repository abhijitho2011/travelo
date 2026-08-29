import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/authentication/session.dart';
import '../data/management_models.dart';
import '../data/management_repository.dart';
import '../data/team_models.dart';

/// Dashboard payload: the KPI snapshot plus the operational alert cards.
class ManagementOverview {
  const ManagementOverview({required this.snapshot, required this.alerts});

  final HotelSnapshot? snapshot;
  final List<OperationalAlert> alerts;

  /// True when the server gave us nothing at all — the dashboard then says so
  /// plainly instead of rendering a wall of dashes.
  bool get isEmpty => snapshot == null && alerts.isEmpty;
}

final managementOverviewProvider = FutureProvider.autoDispose<ManagementOverview>(
  (ref) async {
    final repo = ref.watch(managementRepositoryProvider);
    final results = await Future.wait([repo.snapshot(), repo.alerts()]);
    return ManagementOverview(
      snapshot: results[0] as HotelSnapshot?,
      alerts: results[1] as List<OperationalAlert>,
    );
  },
);

// ---------------------------------------------------------------- approvals

final approvalsProvider =
    AsyncNotifierProvider<ApprovalsController, List<ApprovalItem>>(
      ApprovalsController.new,
    );

class ApprovalsController extends AsyncNotifier<List<ApprovalItem>> {
  @override
  Future<List<ApprovalItem>> build() =>
      ref.watch(managementRepositoryProvider).approvals();

  Future<void> refresh() async {
    state = const AsyncValue.loading();
    state = await AsyncValue.guard(
      () => ref.read(managementRepositoryProvider).approvals(),
    );
  }

  /// Applies the decision, then re-reads. Throws on failure so the screen can
  /// tell the user the decision did not land.
  Future<void> decide(
    ApprovalItem item, {
    required bool approve,
    String? reason,
  }) async {
    await ref
        .read(managementRepositoryProvider)
        .decideApproval(item, approve: approve, reason: reason);
    // Optimistically drop the row, then reconcile with the server.
    final current = state.value ?? const [];
    state = AsyncValue.data(
      current.where((a) => a.id != item.id).toList(),
    );
    ref.invalidate(teamProvider);
    await refresh();
  }
}

/// Count for the dashboard's "Approvals" alert card and the nav badge.
final pendingApprovalCountProvider = Provider<int>(
  (ref) => ref.watch(approvalsProvider).value?.length ?? 0,
);

// --------------------------------------------------------------------- team

final teamFilterProvider = StateProvider<TeamFilter>(
  (_) => const TeamFilter(),
);

final teamProvider = FutureProvider.autoDispose<List<TeamMember>>((ref) {
  final filter = ref.watch(teamFilterProvider);
  return ref.watch(managementRepositoryProvider).team(filter);
});

/// Actions on a single team member. Each throws on failure — the caller
/// surfaces the message rather than pretending the change stuck.
class TeamActions {
  const TeamActions(this._ref);

  final Ref _ref;

  ManagementRepository get _repo => _ref.read(managementRepositoryProvider);

  Future<void> approve(String id) async {
    await _repo.approveMember(id);
    _invalidate();
  }

  Future<void> setStatus(String id, AccountStatus status) async {
    await _repo.setMemberStatus(id, status);
    _invalidate();
  }

  Future<void> remove(String id) async {
    await _repo.removeMember(id);
    _invalidate();
  }

  Future<void> create(NewTeamMember member) async {
    await _repo.createMember(member);
    _invalidate();
  }

  void _invalidate() {
    _ref.invalidate(teamProvider);
    _ref.invalidate(approvalsProvider);
  }
}

final teamActionsProvider = Provider<TeamActions>(TeamActions.new);
