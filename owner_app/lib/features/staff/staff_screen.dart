import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/data/owner_repository.dart';
import '../../core/models/owner_models.dart';
import '../../theme/app_theme.dart';
import '../../widgets/ui.dart';

class StaffScreen extends ConsumerWidget {
  const StaffScreen({super.key, required this.propertyId});
  final String propertyId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final staff = ref.watch(staffProvider(propertyId));
    return Scaffold(
      appBar: AppBar(title: const Text('Managers')),
      floatingActionButton: FloatingActionButton.extended(
        backgroundColor: AppColors.primary,
        foregroundColor: Colors.white,
        onPressed: () async {
          await context.push('/properties/$propertyId/staff/new');
          ref.invalidate(staffProvider(propertyId));
        },
        icon: const Icon(Icons.person_add_alt),
        label: const Text('Add manager'),
      ),
      body: staff.when(
        loading: () => const LoadingView(),
        error: (_, __) => ErrorView(
          message: 'Could not load managers.',
          onRetry: () => ref.invalidate(staffProvider(propertyId)),
        ),
        data: (list) {
          if (list.isEmpty) {
            return const _EmptyStaff();
          }
          return ListView.separated(
            padding: const EdgeInsets.all(20),
            itemCount: list.length,
            separatorBuilder: (_, __) => const SizedBox(height: 12),
            itemBuilder: (_, i) => _StaffCard(
              propertyId: propertyId,
              member: list[i],
            ),
          );
        },
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
    final blocked = member.status.toUpperCase() == 'BLOCKED';
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Row(
          children: [
            CircleAvatar(
              radius: 22,
              backgroundColor: AppColors.primarySoft,
              child: Text(
                _initials(member.fullName),
                style: const TextStyle(color: AppColors.primaryDark, fontWeight: FontWeight.w700),
              ),
            ),
            const SizedBox(width: 14),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(children: [
                    Flexible(
                      child: Text(member.fullName,
                          style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 15)),
                    ),
                    const SizedBox(width: 8),
                    StatusChip(
                      label: member.role.label,
                      color: AppColors.info,
                    ),
                  ]),
                  const SizedBox(height: 2),
                  Text('${member.mobile} · ${member.district}, ${member.state}',
                      style: const TextStyle(color: AppColors.inkMuted, fontSize: 13)),
                  if (blocked) ...[
                    const SizedBox(height: 6),
                    const StatusChip(label: 'Blocked', color: AppColors.danger),
                  ],
                ],
              ),
            ),
            PopupMenuButton<String>(
              onSelected: (v) => _action(context, ref, v),
              itemBuilder: (_) => [
                const PopupMenuItem(value: 'edit', child: Text('Edit')),
                PopupMenuItem(value: 'toggle', child: Text(blocked ? 'Unblock' : 'Block')),
                const PopupMenuItem(value: 'delete', child: Text('Delete')),
              ],
            ),
          ],
        ),
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
        final next = member.status.toUpperCase() == 'BLOCKED' ? 'ACTIVE' : 'BLOCKED';
        await repo.setStaffStatus(propertyId, member.id, next);
      } else if (v == 'delete') {
        final ok = await showDialog<bool>(
          context: context,
          builder: (_) => AlertDialog(
            title: const Text('Delete manager?'),
            content: Text('${member.fullName} will lose access to this hotel.'),
            actions: [
              TextButton(onPressed: () => Navigator.pop(context, false), child: const Text('Cancel')),
              FilledButton(
                style: FilledButton.styleFrom(backgroundColor: AppColors.danger),
                onPressed: () => Navigator.pop(context, true),
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
        ScaffoldMessenger.of(context)
            .showSnackBar(const SnackBar(content: Text('Action failed. Try again.')));
      }
    }
  }

  static String _initials(String name) {
    final p = name.trim().split(RegExp(r'\s+'));
    return p.length == 1
        ? p.first.substring(0, 1).toUpperCase()
        : (p.first[0] + p.last[0]).toUpperCase();
  }
}

class _EmptyStaff extends StatelessWidget {
  const _EmptyStaff();
  @override
  Widget build(BuildContext context) {
    return const Center(
      child: Padding(
        padding: EdgeInsets.all(32),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(Icons.groups_outlined, size: 44, color: AppColors.inkFaint),
            SizedBox(height: 12),
            Text('No managers yet',
                style: TextStyle(fontWeight: FontWeight.w700, color: AppColors.ink)),
            SizedBox(height: 6),
            Text('Add a General Manager or Assistant GM to run this hotel.',
                textAlign: TextAlign.center, style: TextStyle(color: AppColors.inkMuted)),
          ],
        ),
      ),
    );
  }
}
