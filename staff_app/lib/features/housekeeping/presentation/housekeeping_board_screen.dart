import 'package:flutter/material.dart';
import '../data/board_repository.dart';
import '../../../core/providers.dart';
import '../../../core/permissions/permission_keys.dart';
import '../../../core/networking/api_exception.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/theme/app_colors.dart';
import '../../../core/theme/app_spacing.dart';
import '../../../core/theme/app_typography.dart';
import '../../../core/widgets/primitives.dart';
import '../../../core/widgets/states.dart';
import '../../../core/widgets/status_badge.dart';
import '../application/board_controllers.dart';
import '../data/board_models.dart';
import 'task_action_sheet.dart';

/// The housekeeping supervisor's home: every room grouped by status with its
/// open task, plus a counts header. Tapping a room opens the assign/inspect
/// sheet. Modelled on the reception room-board idiom.
class HousekeepingBoardScreen extends ConsumerWidget {
  const HousekeepingBoardScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final board = ref.watch(boardProvider);

    return PageBody(
      onRefresh: () => ref.read(boardProvider.notifier).refresh(),
      children: [
        const SectionHeader(
          title: 'Room board',
          icon: Icons.dashboard_customize_outlined,
        ),
        const _BoardActionsRow(),
        board.when(
          loading: () => const ListSkeleton(rows: 4, height: 88),
          error: (e, _) => ErrorState(
            error: e,
            onRetry: () => ref.read(boardProvider.notifier).refresh(),
          ),
          data: (b) => b.totalRooms == 0 && b.areaTasks.isEmpty
              ? const EmptyState(
                  title: 'No rooms yet',
                  hint:
                      'Rooms added to this property will appear on the board.',
                  icon: Icons.meeting_room_outlined,
                )
              : _Board(board: b),
        ),
      ],
    );
  }
}

class _Board extends StatelessWidget {
  const _Board({required this.board});

  final HousekeepingBoard board;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        _CountsHeader(board: board),
        for (final status in board.orderedStatuses) ...[
          gapSection,
          _StatusGroup(status: status, rooms: board.groups[status] ?? const []),
        ],
        if (board.areaTasks.isNotEmpty) ...[
          gapSection,
          const SectionHeader(
            title: 'Area tasks',
            icon: Icons.cleaning_services_outlined,
          ),
          for (final t in board.areaTasks)
            Padding(
              padding: const EdgeInsets.only(bottom: Sp.sm),
              child: _AreaTaskTile(
                taskId: t.id,
                area: t.area ?? t.typeLabel,
                statusLabel: t.status.label,
                tone: t.status.tone,
              ),
            ),
        ],
      ],
    );
  }
}

class _CountsHeader extends StatelessWidget {
  const _CountsHeader({required this.board});

  final HousekeepingBoard board;

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    return SoftCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          LabelXs('${board.totalRooms} rooms'),
          const SizedBox(height: Sp.sm),
          Wrap(
            spacing: Sp.sm,
            runSpacing: Sp.sm,
            children: [
              for (final status in board.orderedStatuses)
                StatusBadge(
                  tone: roomStatusTone(status),
                  label:
                      '${roomStatusLabel(status)} ${board.counts[status] ?? 0}',
                  dense: true,
                ),
            ],
          ),
          if (board.orderedStatuses.isEmpty)
            Text(
              'No rooms to show',
              style: AppTypography.body(size: 13, color: c.mutedForeground),
            ),
        ],
      ),
    );
  }
}

class _StatusGroup extends StatelessWidget {
  const _StatusGroup({required this.status, required this.rooms});

  final String status;
  final List<BoardRoom> rooms;

  @override
  Widget build(BuildContext context) {
    if (rooms.isEmpty) return const SizedBox.shrink();
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          children: [
            StatusDot(tone: roomStatusTone(status)),
            const SizedBox(width: Sp.sm),
            Text(
              '${roomStatusLabel(status)} · ${rooms.length}',
              style: AppTypography.body(
                size: 13,
                weight: FontWeight.w700,
                color: context.colors.foreground,
              ),
            ),
          ],
        ),
        const SizedBox(height: Sp.sm),
        Wrap(
          spacing: Sp.sm,
          runSpacing: Sp.sm,
          children: [for (final r in rooms) _RoomChip(room: r)],
        ),
      ],
    );
  }
}

class _RoomChip extends ConsumerWidget {
  const _RoomChip({required this.room});

  final BoardRoom room;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final c = context.colors;
    final tone = room.tone.color(c);
    final task = room.task;
    return InkWell(
      borderRadius: R.rMd,
      onTap: task == null
          ? null
          : () => showTaskActionSheet(
              context,
              ref,
              task: task,
              roomNumber: room.number,
            ),
      child: Container(
        width: 96,
        padding: const EdgeInsets.all(Sp.sm),
        decoration: BoxDecoration(
          color: c.card,
          borderRadius: R.rMd,
          border: Border(
            top: BorderSide(color: tone, width: 3),
            left: BorderSide(color: c.border),
            right: BorderSide(color: c.border),
            bottom: BorderSide(color: c.border),
          ),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              room.number,
              style: AppTypography.kpi(size: 20, color: c.foreground),
            ),
            const SizedBox(height: 2),
            Text(
              room.statusLabel,
              style: AppTypography.body(size: 11, color: c.mutedForeground),
              overflow: TextOverflow.ellipsis,
            ),
            if (task != null) ...[
              const SizedBox(height: 4),
              Text(
                task.assigneeName ?? 'Unassigned',
                style: AppTypography.body(
                  size: 10.5,
                  weight: FontWeight.w600,
                  color: task.assigneeName == null ? c.warning : c.foreground,
                ),
                overflow: TextOverflow.ellipsis,
              ),
            ],
          ],
        ),
      ),
    );
  }
}

class _AreaTaskTile extends ConsumerWidget {
  const _AreaTaskTile({
    required this.taskId,
    required this.area,
    required this.statusLabel,
    required this.tone,
  });

  final String taskId;
  final String area;
  final String statusLabel;
  final StatusTone tone;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return SoftCard(
      child: Row(
        children: [
          Expanded(
            child: Text(
              area,
              style: AppTypography.body(
                size: 14,
                weight: FontWeight.w600,
                color: context.colors.foreground,
              ),
            ),
          ),
          StatusBadge(tone: tone, label: statusLabel, dense: true),
        ],
      ),
    );
  }
}

/// Mark-all-clean and the charter export. Both gated: the first changes
/// every room's state in one tap, the second is the supervisor's print-out.
class _BoardActionsRow extends ConsumerWidget {
  const _BoardActionsRow();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final canStatus = ref.watch(permissionsProvider).has(P.roomStatusUpdate);
    return Padding(
      padding: const EdgeInsets.only(bottom: Sp.md),
      child: Wrap(
        spacing: Sp.sm,
        runSpacing: Sp.sm,
        children: [
          if (canStatus)
            FilledButton.tonalIcon(
              onPressed: () async {
                final messenger = ScaffoldMessenger.of(context);
                final ok = await showDialog<bool>(
                  context: context,
                  builder: (d) => AlertDialog(
                    title: const Text('Mark every room clean?'),
                    content: const Text(
                      'Every dirty, cleaning or inspected room becomes ready. Occupied and out-of-order rooms are left alone.',
                    ),
                    actions: [
                      TextButton(
                        onPressed: () => Navigator.pop(d, false),
                        child: const Text('Cancel'),
                      ),
                      FilledButton(
                        onPressed: () => Navigator.pop(d, true),
                        child: const Text('Mark all clean'),
                      ),
                    ],
                  ),
                );
                if (ok != true) return;
                try {
                  final n = await ref.read(boardActionsProvider).markAllClean();
                  messenger.showSnackBar(
                    SnackBar(content: Text('$n room(s) marked ready')),
                  );
                } on ApiException catch (e) {
                  messenger.showSnackBar(SnackBar(content: Text(e.message)));
                }
              },
              icon: const Icon(Icons.cleaning_services_outlined, size: 16),
              label: const Text('Mark all clean'),
            ),
          OutlinedButton.icon(
            onPressed: () async {
              final messenger = ScaffoldMessenger.of(context);
              try {
                final csv = await ref
                    .read(boardRepositoryProvider)
                    .charterCsv();
                await Clipboard.setData(ClipboardData(text: csv));
                messenger.showSnackBar(
                  const SnackBar(
                    content: Text(
                      'Housekeeping charter copied as CSV — paste it into a sheet to print.',
                    ),
                  ),
                );
              } on ApiException catch (e) {
                messenger.showSnackBar(SnackBar(content: Text(e.message)));
              }
            },
            icon: const Icon(Icons.print_outlined, size: 16),
            label: const Text('Export charter'),
          ),
        ],
      ),
    );
  }
}
