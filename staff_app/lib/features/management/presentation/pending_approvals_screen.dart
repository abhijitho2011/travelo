import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/authentication/session.dart';
import '../../../core/permissions/permission_gate.dart';
import '../../../core/permissions/permission_keys.dart';
import '../../../core/routing/routes.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/theme/app_spacing.dart';
import '../../../core/theme/app_typography.dart';
import '../../../core/widgets/primitives.dart';
import '../../../core/widgets/states.dart';
import '../../../core/widgets/status_badge.dart';
import '../application/management_controllers.dart';
import '../data/team_models.dart';

/// Everyone at this property still waiting on a manager's decision.
///
/// This is HR's second tab and it is deliberately READ-ONLY: HR holds
/// `staff.create` but not `staff.approve`, so there is no Approve button here
/// to gate away — the screen never renders one for anybody. A GM or AGM acts on
/// the same rows from the Approvals centre, which is where the decision lives.
class PendingApprovalsScreen extends ConsumerWidget {
  const PendingApprovalsScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final c = context.colors;
    final waiting = ref.watch(teamAwaitingApprovalProvider);

    return PageBody(
      onRefresh: () async => ref.invalidate(teamAwaitingApprovalProvider),
      children: [
        PageHeader(
          eyebrow: 'Team',
          title: 'Submitted',
          subtitle:
              'Accounts raised at this property that a General Manager or '
              'Assistant General Manager has not signed off yet.',
          actions: [
            PermissionGate(
              permission: P.staffCreate,
              child: FilledButton.icon(
                onPressed: () => context.go(Routes.teamNew),
                icon: const Icon(Icons.person_add_alt, size: 16),
                label: const Text('Add staff'),
              ),
            ),
          ],
        ),
        gapSection,

        Container(
          padding: const EdgeInsets.all(Sp.md),
          decoration: BoxDecoration(
            color: c.warning.withValues(alpha: 0.09),
            borderRadius: R.rMd,
            border: Border.all(color: c.warning.withValues(alpha: 0.3)),
          ),
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Icon(Icons.hourglass_top_outlined, size: 17, color: c.warning),
              const SizedBox(width: Sp.sm),
              Expanded(
                child: Text(
                  'Nobody on this list can sign in yet. Approval is a manager’s '
                  'decision — this page only shows you where each account has '
                  'got to.',
                  style: AppTypography.body(size: 12.5, color: c.foreground),
                ),
              ),
            ],
          ),
        ),
        gapMd,

        waiting.when(
          loading: () => const ListSkeleton(rows: 3),
          error: (e, _) => ErrorState(
            error: e,
            onRetry: () => ref.invalidate(teamAwaitingApprovalProvider),
          ),
          data: (members) => members.isEmpty
              ? const EmptyState(
                  title: 'Nothing waiting',
                  hint:
                      'Every account raised at this property has been decided. '
                      'New ones appear here the moment they are submitted.',
                  icon: Icons.task_alt_outlined,
                )
              : Column(
                  children: [
                    Align(
                      alignment: Alignment.centerLeft,
                      child: Padding(
                        padding: const EdgeInsets.only(bottom: Sp.sm),
                        child: Text(
                          '${members.length} '
                          '${members.length == 1 ? 'account' : 'accounts'} waiting',
                          style: AppTypography.labelXs(c.mutedForeground),
                        ),
                      ),
                    ),
                    for (final m in members)
                      Padding(
                        padding: const EdgeInsets.only(bottom: Sp.md),
                        child: _WaitingRow(member: m),
                      ),
                  ],
                ),
        ),
      ],
    );
  }
}

/// One waiting account. Information only — no action anywhere on the card.
class _WaitingRow extends StatelessWidget {
  const _WaitingRow({required this.member});

  final TeamMember member;

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    final m = member;
    return SoftCard(
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          CircleAvatar(
            radius: 19,
            backgroundColor: c.accent,
            child: Text(
              m.initials,
              style: AppTypography.body(
                size: 13,
                weight: FontWeight.w700,
                color: c.accentForeground,
              ),
            ),
          ),
          const SizedBox(width: Sp.md),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  m.fullName,
                  overflow: TextOverflow.ellipsis,
                  style: AppTypography.body(
                    size: 14.5,
                    weight: FontWeight.w700,
                    color: c.foreground,
                  ),
                ),
                Text(
                  [
                    m.role.label,
                    if (m.department?.isNotEmpty == true) m.department!,
                  ].join(' · '),
                  style: AppTypography.body(
                    size: 12.5,
                    color: c.mutedForeground,
                  ),
                ),
                if (m.mobile?.isNotEmpty == true) ...[
                  const SizedBox(height: 4),
                  Text(
                    m.mobile!,
                    style: AppTypography.numeric(
                      size: 11.5,
                      color: c.mutedForeground,
                    ),
                  ),
                ],
                const SizedBox(height: 4),
                Text(
                  switch (m.status) {
                    AccountStatus.approved => 'Approved — activation pending',
                    AccountStatus.invited => 'Invited, not yet completed',
                    _ => 'Waiting for a manager to approve',
                  },
                  style: AppTypography.body(
                    size: 11.5,
                    color: c.mutedForeground,
                  ),
                ),
              ],
            ),
          ),
          StatusBadge(tone: m.tone, label: m.status.label, dense: true),
        ],
      ),
    );
  }
}
