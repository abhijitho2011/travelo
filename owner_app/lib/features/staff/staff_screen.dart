import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/data/owner_repository.dart';
import '../../core/models/owner_models.dart';
import '../../core/theme/app_colors.dart';
import '../../core/theme/app_spacing.dart';
import '../../core/theme/app_typography.dart';
import '../../core/utils/formatting.dart';
import '../../core/widgets/cards.dart';
import '../../core/widgets/primitives.dart';
import '../../core/widgets/states.dart';
import '../../core/widgets/status_badge.dart';

class StaffScreen extends ConsumerWidget {
  const StaffScreen({super.key, required this.propertyId});
  final String propertyId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final staff = ref.watch(staffProvider(propertyId));

    Future<void> add() async {
      await context.push('/properties/$propertyId/staff/new');
      ref.invalidate(staffProvider(propertyId));
    }

    return Scaffold(
      backgroundColor: context.colors.background,
      appBar: AppBar(title: const Text('Managers')),
      body: PageBody(
        onRefresh: () async => ref.invalidate(staffProvider(propertyId)),
        children: [
          PageHeader(
            eyebrow: 'This hotel',
            title: 'Managers',
            subtitle: 'General Managers and Assistant GMs who run this hotel.',
            actions: [
              FilledButton.icon(
                onPressed: add,
                icon: const Icon(Icons.person_add_alt, size: 16),
                label: const Text('Add manager'),
              ),
            ],
          ),
          gapSection,
          staff.when(
            loading: () => const ListSkeleton(rows: 3),
            error: (e, _) => ErrorState(
              error: e,
              message: 'Could not load managers.',
              onRetry: () => ref.invalidate(staffProvider(propertyId)),
            ),
            data: (list) => list.isEmpty
                ? EmptyState(
                    icon: Icons.groups_outlined,
                    title: 'No managers yet',
                    hint:
                        'Add a General Manager or Assistant GM to run this '
                        'hotel.',
                    action: FilledButton.icon(
                      onPressed: add,
                      icon: const Icon(Icons.person_add_alt, size: 16),
                      label: const Text('Add manager'),
                    ),
                  )
                : Column(
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: [
                      for (final m in list)
                        Padding(
                          padding: const EdgeInsets.only(bottom: Sp.md),
                          child: _StaffCard(propertyId: propertyId, member: m),
                        ),
                    ],
                  ),
          ),
        ],
      ),
    );
  }
}

class _StaffCard extends ConsumerWidget {
  const _StaffCard({required this.propertyId, required this.member});
  final String propertyId;
  final StaffMember member;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final c = context.colors;
    final blocked = member.status.toUpperCase() == 'BLOCKED';
    return SoftCard(
      // A blocked manager is flagged by the left rule as well as the badge, so
      // the state is visible before you read anything.
      accent: blocked ? c.critical : null,
      child: Row(
        children: [
          Monogram(initials: initialsOf(member.fullName)),
          const SizedBox(width: Sp.md),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  member.fullName,
                  overflow: TextOverflow.ellipsis,
                  style: AppTypography.body(
                    size: 14.5,
                    weight: FontWeight.w700,
                    color: c.foreground,
                  ),
                ),
                const SizedBox(height: 2),
                Text(
                  '${member.mobile} · ${member.district}, ${member.state}',
                  overflow: TextOverflow.ellipsis,
                  style: AppTypography.body(
                    size: 12.5,
                    color: c.mutedForeground,
                  ),
                ),
                const SizedBox(height: 6),
                // The badges get their own line: "Assistant General Manager" is
                // wider than the name it would otherwise sit beside.
                Wrap(
                  spacing: Sp.sm,
                  runSpacing: 4,
                  children: [
                    StatusBadge(
                      tone: StatusTone.info,
                      label: member.role.label,
                      icon: Icons.badge_outlined,
                      dense: true,
                    ),
                    if (blocked)
                      const StatusBadge(
                        tone: StatusTone.critical,
                        label: 'Blocked',
                        dense: true,
                      ),
                  ],
                ),
              ],
            ),
          ),
          PopupMenuButton<String>(
            tooltip: 'Manager actions',
            onSelected: (v) => _action(context, ref, v),
            itemBuilder: (_) => [
              const PopupMenuItem(value: 'edit', child: Text('Edit')),
              PopupMenuItem(
                value: 'toggle',
                child: Text(blocked ? 'Unblock' : 'Block'),
              ),
              const PopupMenuItem(value: 'delete', child: Text('Delete')),
            ],
          ),
        ],
      ),
    );
  }

  Future<void> _action(BuildContext context, WidgetRef ref, String v) async {
    final repo = ref.read(ownerRepositoryProvider);
    if (v == 'edit') {
      // The record travels with the navigation so the form opens pre-filled
      // without a second fetch.
      await context.push(
        '/properties/$propertyId/staff/${member.id}/edit',
        extra: member,
      );
      ref.invalidate(staffProvider(propertyId));
      return;
    }
    try {
      if (v == 'toggle') {
        final next = member.status.toUpperCase() == 'BLOCKED'
            ? 'ACTIVE'
            : 'BLOCKED';
        await repo.setStaffStatus(propertyId, member.id, next);
      } else if (v == 'delete') {
        final ok = await showDialog<bool>(
          context: context,
          builder: (dialogContext) => AlertDialog(
            title: const Text('Delete manager?'),
            content: Text('${member.fullName} will lose access to this hotel.'),
            actions: [
              TextButton(
                onPressed: () => Navigator.pop(dialogContext, false),
                child: const Text('Cancel'),
              ),
              FilledButton(
                style: FilledButton.styleFrom(
                  backgroundColor: dialogContext.colors.destructive,
                  foregroundColor: dialogContext.colors.destructiveForeground,
                ),
                onPressed: () => Navigator.pop(dialogContext, true),
                child: const Text('Delete'),
              ),
            ],
          ),
        );
        if (ok != true) return;
        await repo.deleteStaff(propertyId, member.id);
      }
      ref.invalidate(staffProvider(propertyId));
    } catch (_) {
      if (context.mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Action failed. Try again.')),
        );
      }
    }
  }
}
