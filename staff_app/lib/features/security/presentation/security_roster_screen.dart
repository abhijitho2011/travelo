import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/networking/api_exception.dart';
import '../../../core/permissions/permission_gate.dart';
import '../../../core/permissions/permission_keys.dart';
import '../../../core/utils/formatting.dart';
import '../../../core/widgets/cards.dart';
import '../../../core/widgets/primitives.dart';
import '../../../core/widgets/states.dart';
import '../../../core/widgets/status_badge.dart';
import '../data/security_models.dart';
import '../data/security_repository.dart';

/// The Security Manager's roster: who is scheduled, who is on duty, and the
/// security team directory to assign shifts from.
class SecurityRosterScreen extends ConsumerWidget {
  const SecurityRosterScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final shifts = ref.watch(securityShiftsProvider);
    final roster = ref.watch(securityRosterProvider);

    return PageBody(
      onRefresh: () async {
        ref.invalidate(securityShiftsProvider);
        ref.invalidate(securityRosterProvider);
      },
      children: [
        PageHeader(
          eyebrow: 'Security',
          title: 'Roster',
          subtitle: 'Shifts and the security team.',
          actions: [
            PermissionGate(
              permission: P.shiftAssign,
              child: FilledButton.icon(
                onPressed: () => _addShift(context, ref),
                icon: const Icon(Icons.add, size: 17),
                label: const Text('Assign shift'),
              ),
            ),
          ],
        ),
        gapSection,
        shifts.when(
          loading: () => const ListSkeleton(rows: 3, height: 68),
          error: (e, _) => ErrorState(
            error: e,
            onRetry: () => ref.invalidate(securityShiftsProvider),
          ),
          data: (list) => list.isEmpty
              ? const EmptyState(
                  title: 'No shifts scheduled',
                  hint: 'Assign a shift to build the roster.',
                  icon: Icons.schedule_outlined,
                )
              : Panel(
                  title: 'Shifts',
                  padBody: false,
                  child: Column(
                    children: [
                      for (var i = 0; i < list.length; i++) ...[
                        if (i > 0) const RowDivider(),
                        _ShiftRow(shift: list[i]),
                      ],
                    ],
                  ),
                ),
        ),
        gapSection,
        roster.when(
          loading: () => const SizedBox.shrink(),
          error: (_, _) => const SizedBox.shrink(),
          data: (members) => members.isEmpty
              ? const SizedBox.shrink()
              : Panel(
                  title: 'Security team',
                  description: '${members.length} members',
                  padBody: false,
                  child: Column(
                    children: [
                      for (var i = 0; i < members.length; i++) ...[
                        if (i > 0) const RowDivider(),
                        DataRow2(
                          title: members[i].name,
                          subtitle: Fmt.humanise(members[i].role),
                        ),
                      ],
                    ],
                  ),
                ),
        ),
      ],
    );
  }
}

class _ShiftRow extends ConsumerStatefulWidget {
  const _ShiftRow({required this.shift});

  final SecurityShift shift;

  @override
  ConsumerState<_ShiftRow> createState() => _ShiftRowState();
}

class _ShiftRowState extends ConsumerState<_ShiftRow> {
  bool _busy = false;

  Future<void> _set(SecurityShiftStatus status) async {
    setState(() => _busy = true);
    final messenger = ScaffoldMessenger.of(context);
    try {
      await ref
          .read(securityRepositoryProvider)
          .setShiftStatus(widget.shift.id, status);
      ref.invalidate(securityShiftsProvider);
      ref.invalidate(securityDashboardProvider);
    } on ApiException catch (e) {
      messenger.showSnackBar(SnackBar(content: Text(e.message)));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final s = widget.shift;
    return DataRow2(
      title: s.area,
      subtitle: [
        if (s.startAt != null) 'From ${Fmt.time(s.startAt)}',
      ].join(' · '),
      badge: StatusBadge(
        tone: s.status.tone,
        label: s.status.label,
        dense: true,
      ),
      trailing: _busy
          ? const SizedBox(
              height: 18,
              width: 18,
              child: CircularProgressIndicator(strokeWidth: 2),
            )
          : PermissionGate(
              permission: P.shiftAssign,
              child: switch (s.status) {
                SecurityShiftStatus.scheduled => TextButton(
                  onPressed: () => _set(SecurityShiftStatus.active),
                  child: const Text('Start'),
                ),
                SecurityShiftStatus.active => TextButton(
                  onPressed: () => _set(SecurityShiftStatus.ended),
                  child: const Text('End'),
                ),
                SecurityShiftStatus.ended => const SizedBox.shrink(),
              },
            ),
    );
  }
}

Future<void> _addShift(BuildContext context, WidgetRef ref) async {
  final messenger = ScaffoldMessenger.of(context);
  final staffId = TextEditingController();
  final area = TextEditingController();
  final saved = await showDialog<bool>(
    context: context,
    builder: (ctx) => AlertDialog(
      title: const Text('Assign shift'),
      content: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          TextField(
            controller: staffId,
            decoration: const InputDecoration(labelText: 'Guard staff id'),
          ),
          TextField(
            controller: area,
            decoration: const InputDecoration(labelText: 'Area / post'),
          ),
        ],
      ),
      actions: [
        TextButton(
          onPressed: () => Navigator.pop(ctx, false),
          child: const Text('Cancel'),
        ),
        FilledButton(
          onPressed: () => Navigator.pop(ctx, true),
          child: const Text('Assign'),
        ),
      ],
    ),
  );
  if (saved != true) return;
  if (staffId.text.trim().isEmpty || area.text.trim().isEmpty) return;
  try {
    await ref
        .read(securityRepositoryProvider)
        .createShift(
          staffId: staffId.text.trim(),
          area: area.text.trim(),
          startAt: DateTime.now(),
        );
    ref.invalidate(securityShiftsProvider);
  } on ApiException catch (e) {
    messenger.showSnackBar(SnackBar(content: Text(e.message)));
  }
}
