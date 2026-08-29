import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/authentication/session.dart';
import '../../../core/networking/api_exception.dart';
import '../../../core/permissions/permission_gate.dart';
import '../../../core/permissions/permission_keys.dart';
import '../../../core/permissions/role_config.dart';
import '../../../core/providers.dart';
import '../../../core/routing/routes.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/theme/app_spacing.dart';
import '../../../core/theme/app_typography.dart';
import '../../../core/utils/formatting.dart';
import '../../../core/widgets/primitives.dart';
import '../../../core/widgets/states.dart';
import '../../../core/widgets/status_badge.dart';
import '../application/management_controllers.dart';
import '../data/team_models.dart';

/// The staff directory for this property.
///
/// Row actions are the clearest demonstration of button-level gating: a GM
/// sees Approve / Block / Suspend / Remove; an AGM — who the server does not
/// grant `staff.delete` — never sees Remove at all. Nothing here inspects the
/// role; each button asks only for its own permission.
class TeamScreen extends ConsumerStatefulWidget {
  const TeamScreen({super.key});

  @override
  ConsumerState<TeamScreen> createState() => _TeamScreenState();
}

class _TeamScreenState extends ConsumerState<TeamScreen> {
  final _search = TextEditingController();

  @override
  void initState() {
    super.initState();
    _search.text = ref.read(teamFilterProvider).query ?? '';
  }

  @override
  void dispose() {
    _search.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    final filter = ref.watch(teamFilterProvider);
    final team = ref.watch(teamProvider);

    return PageBody(
      onRefresh: () async => ref.invalidate(teamProvider),
      children: [
        PageHeader(
          eyebrow: ref.watch(sessionProvider)?.hotel?.name ?? 'Your hotel',
          title: 'Team',
          subtitle: 'Everyone who works at this property.',
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

        TextField(
          controller: _search,
          textInputAction: TextInputAction.search,
          decoration: InputDecoration(
            hintText: 'Search by name or email',
            prefixIcon: const Icon(Icons.search, size: 20),
            suffixIcon: _search.text.isEmpty
                ? null
                : IconButton(
                    icon: const Icon(Icons.close, size: 18),
                    onPressed: () {
                      _search.clear();
                      ref.read(teamFilterProvider.notifier).state = filter
                          .copyWith(query: '');
                    },
                  ),
          ),
          onChanged: (v) => setState(() {}),
          onSubmitted: (v) => ref.read(teamFilterProvider.notifier).state =
              filter.copyWith(query: v.trim()),
        ),
        gapMd,

        SingleChildScrollView(
          scrollDirection: Axis.horizontal,
          child: Row(
            children: [
              _RoleFilterChip(filter: filter),
              const SizedBox(width: Sp.sm),
              _StatusFilterChip(filter: filter),
              if (!filter.isEmpty) ...[
                const SizedBox(width: Sp.sm),
                TextButton.icon(
                  onPressed: () {
                    _search.clear();
                    ref.read(teamFilterProvider.notifier).state =
                        const TeamFilter();
                  },
                  icon: const Icon(Icons.filter_alt_off_outlined, size: 15),
                  label: const Text('Clear'),
                ),
              ],
            ],
          ),
        ),
        gapMd,

        team.when(
          loading: () => const ListSkeleton(rows: 4),
          error: (e, _) =>
              ErrorState(error: e, onRetry: () => ref.invalidate(teamProvider)),
          data: (members) => members.isEmpty
              ? EmptyState(
                  title: filter.isEmpty
                      ? 'No team members yet'
                      : 'No one matches those filters',
                  hint: filter.isEmpty
                      ? 'Add your first team member and they will appear here '
                            'once approved.'
                      : 'Try widening the role or status filter.',
                  icon: Icons.groups_outlined,
                  action: filter.isEmpty
                      ? PermissionGate(
                          permission: P.staffCreate,
                          child: FilledButton.icon(
                            onPressed: () => context.go(Routes.teamNew),
                            icon: const Icon(Icons.person_add_alt, size: 16),
                            label: const Text('Add staff'),
                          ),
                        )
                      : null,
                )
              : Column(
                  children: [
                    Align(
                      alignment: Alignment.centerLeft,
                      child: Padding(
                        padding: const EdgeInsets.only(bottom: Sp.sm),
                        child: Text(
                          '${members.length} ${members.length == 1 ? 'person' : 'people'}',
                          style: AppTypography.labelXs(c.mutedForeground),
                        ),
                      ),
                    ),
                    for (final m in members)
                      Padding(
                        padding: const EdgeInsets.only(bottom: Sp.md),
                        child: TeamMemberCard(member: m),
                      ),
                  ],
                ),
        ),
      ],
    );
  }
}

class _RoleFilterChip extends ConsumerWidget {
  const _RoleFilterChip({required this.filter});

  final TeamFilter filter;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return PopupMenuButton<StaffRole?>(
      tooltip: 'Filter by role',
      onSelected: (role) =>
          ref.read(teamFilterProvider.notifier).state = role == null
          ? filter.copyWith(clearRole: true)
          : filter.copyWith(role: role),
      itemBuilder: (context) => [
        const PopupMenuItem(value: null, child: Text('All roles')),
        const PopupMenuDivider(),
        for (final role in StaffRole.all)
          PopupMenuItem(value: role, child: Text(role.label)),
      ],
      child: _FilterPill(
        icon: Icons.badge_outlined,
        label: filter.role?.label ?? 'All roles',
        active: filter.role != null,
      ),
    );
  }
}

class _StatusFilterChip extends ConsumerWidget {
  const _StatusFilterChip({required this.filter});

  final TeamFilter filter;

  static const _statuses = [
    AccountStatus.active,
    AccountStatus.pendingApproval,
    AccountStatus.approved,
    AccountStatus.invited,
    AccountStatus.blocked,
    AccountStatus.suspended,
    AccountStatus.deactivated,
  ];

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return PopupMenuButton<AccountStatus?>(
      tooltip: 'Filter by status',
      onSelected: (status) =>
          ref.read(teamFilterProvider.notifier).state = status == null
          ? filter.copyWith(clearStatus: true)
          : filter.copyWith(status: status),
      itemBuilder: (context) => [
        const PopupMenuItem(value: null, child: Text('Any status')),
        const PopupMenuDivider(),
        for (final s in _statuses)
          PopupMenuItem(value: s, child: Text(s.label)),
      ],
      child: _FilterPill(
        icon: Icons.filter_alt_outlined,
        label: filter.status?.label ?? 'Any status',
        active: filter.status != null,
      ),
    );
  }
}

class _FilterPill extends StatelessWidget {
  const _FilterPill({
    required this.icon,
    required this.label,
    required this.active,
  });

  final IconData icon;
  final String label;
  final bool active;

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 9),
      decoration: BoxDecoration(
        color: active ? c.primary.withValues(alpha: 0.1) : c.card,
        borderRadius: R.rMd,
        border: Border.all(color: active ? c.primary : c.border),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(icon, size: 15, color: active ? c.primary : c.mutedForeground),
          const SizedBox(width: 6),
          Text(
            label,
            style: AppTypography.body(
              size: 12.5,
              weight: FontWeight.w600,
              color: active ? c.primary : c.foreground,
            ),
          ),
          Icon(
            Icons.arrow_drop_down,
            size: 18,
            color: active ? c.primary : c.mutedForeground,
          ),
        ],
      ),
    );
  }
}

/// One directory row plus its permission-gated actions.
class TeamMemberCard extends ConsumerStatefulWidget {
  const TeamMemberCard({super.key, required this.member});

  final TeamMember member;

  @override
  ConsumerState<TeamMemberCard> createState() => _TeamMemberCardState();
}

class _TeamMemberCardState extends ConsumerState<TeamMemberCard> {
  bool _busy = false;

  Future<void> _run(Future<void> Function() action, String success) async {
    setState(() => _busy = true);
    try {
      await action();
      if (!mounted) return;
      ScaffoldMessenger.of(
        context,
      ).showSnackBar(SnackBar(content: Text(success)));
    } on ApiException catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(
        context,
      ).showSnackBar(SnackBar(content: Text(e.message)));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    final m = widget.member;
    final actions = ref.read(teamActionsProvider);
    final isSelf = ref.watch(sessionProvider)?.user.id == m.id;

    return SoftCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
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
                    Row(
                      children: [
                        Flexible(
                          child: Text(
                            m.fullName,
                            overflow: TextOverflow.ellipsis,
                            style: AppTypography.body(
                              size: 14.5,
                              weight: FontWeight.w700,
                              color: c.foreground,
                            ),
                          ),
                        ),
                        if (isSelf) ...[
                          const SizedBox(width: 6),
                          Text(
                            '(you)',
                            style: AppTypography.body(
                              size: 12,
                              color: c.mutedForeground,
                            ),
                          ),
                        ],
                      ],
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
                    const SizedBox(height: 4),
                    Text(
                      m.lastLoginAt == null
                          ? 'Never signed in'
                          : 'Last signed in ${Fmt.ago(m.lastLoginAt)}',
                      style: AppTypography.numeric(
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

          // Nobody may action their own row — the server rejects it too.
          if (!isSelf) ...[
            const SizedBox(height: Sp.md),
            Wrap(
              spacing: Sp.sm,
              runSpacing: Sp.sm,
              children: [
                if (m.awaitingApproval)
                  PermissionGate(
                    permission: P.staffApprove,
                    child: FilledButton.icon(
                      onPressed: _busy
                          ? null
                          : () => _run(
                              () => actions.approve(m.id),
                              '${m.firstName} approved',
                            ),
                      icon: const Icon(Icons.check, size: 16),
                      label: const Text('Approve'),
                    ),
                  ),
                if (m.status == AccountStatus.active) ...[
                  PermissionGate(
                    permission: P.staffUpdate,
                    child: OutlinedButton(
                      onPressed: _busy
                          ? null
                          : () => _run(
                              () => actions.setStatus(
                                m.id,
                                AccountStatus.suspended,
                              ),
                              '${m.firstName} suspended',
                            ),
                      child: const Text('Suspend'),
                    ),
                  ),
                  PermissionGate(
                    permission: P.staffUpdate,
                    child: OutlinedButton(
                      onPressed: _busy
                          ? null
                          : () => _run(
                              () =>
                                  actions.setStatus(m.id, AccountStatus.blocked),
                              '${m.firstName} blocked',
                            ),
                      child: const Text('Block'),
                    ),
                  ),
                ],
                if (m.status == AccountStatus.blocked ||
                    m.status == AccountStatus.suspended ||
                    m.status == AccountStatus.deactivated)
                  PermissionGate(
                    permission: P.staffUpdate,
                    child: OutlinedButton(
                      onPressed: _busy
                          ? null
                          : () => _run(
                              () =>
                                  actions.setStatus(m.id, AccountStatus.active),
                              '${m.firstName} reactivated',
                            ),
                      child: const Text('Reactivate'),
                    ),
                  ),

                // `staff.delete` is granted to the GM only. An AGM never sees
                // this button — it is not disabled, it is absent.
                PermissionGate(
                  permission: P.staffDelete,
                  child: OutlinedButton.icon(
                    onPressed: _busy ? null : () => _confirmRemove(m),
                    style: OutlinedButton.styleFrom(
                      foregroundColor: c.destructive,
                      side: BorderSide(
                        color: c.destructive.withValues(alpha: 0.4),
                      ),
                    ),
                    icon: const Icon(Icons.person_remove_outlined, size: 16),
                    label: const Text('Remove'),
                  ),
                ),
              ],
            ),
          ],
        ],
      ),
    );
  }

  Future<void> _confirmRemove(TeamMember m) async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: Text('Remove ${m.fullName}?'),
        content: Text(
          '${m.firstName} will lose access to Tavelo immediately and will '
          'disappear from this directory. Their past work and records are '
          'kept. This cannot be undone from the app — a new account would '
          'have to be created.',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(context).pop(false),
            child: const Text('Cancel'),
          ),
          FilledButton(
            onPressed: () => Navigator.of(context).pop(true),
            style: FilledButton.styleFrom(
              backgroundColor: context.colors.destructive,
            ),
            child: const Text('Remove'),
          ),
        ],
      ),
    );
    if (confirmed != true) return;
    await _run(
      () => ref.read(teamActionsProvider).remove(m.id),
      '${m.fullName} removed',
    );
  }
}
