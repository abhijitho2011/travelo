import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/networking/api_exception.dart';
import '../../../core/permissions/permission_gate.dart';
import '../../../core/permissions/permission_keys.dart';
import '../../../core/providers.dart';
import '../../../core/routing/routes.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/theme/app_spacing.dart';
import '../../../core/theme/app_typography.dart';
import '../../../core/widgets/cards.dart';
import '../../../core/widgets/primitives.dart';
import '../../../core/widgets/states.dart';
import '../../../core/widgets/status_badge.dart';
import '../application/rooms_controllers.dart';
import '../data/room_models.dart';
import '../data/rooms_repository.dart';
import 'room_widgets.dart';

/// The room board, floor by floor.
///
/// Four roles reach this screen and each sees a different surface, without a
/// single role comparison anywhere below. A receptionist holds `room.read` and
/// `room.status.update`: they get the board and the status sheet, and Add,
/// Bulk add, Edit and Delete simply never render. A technician holds only
/// `room.read`, so even the sheet stays shut for them.
class RoomsScreen extends ConsumerStatefulWidget {
  const RoomsScreen({super.key});

  @override
  ConsumerState<RoomsScreen> createState() => _RoomsScreenState();
}

class _RoomsScreenState extends ConsumerState<RoomsScreen> {
  final _search = TextEditingController();

  @override
  void initState() {
    super.initState();
    _search.text = ref.read(roomFilterProvider).query ?? '';
  }

  @override
  void dispose() {
    _search.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    final filter = ref.watch(roomFilterProvider);
    final floors = ref.watch(roomsByFloorProvider);
    final canWrite = ref.watch(canProvider(P.roomCreate));

    return PageBody(
      onRefresh: () async => ref.invalidate(roomsProvider),
      children: [
        PageHeader(
          eyebrow: ref.watch(sessionProvider)?.hotel?.name ?? 'Your hotel',
          title: 'Rooms',
          subtitle: 'Every room at this property and where it stands today.',
        ),
        gapSection,

        TextField(
          controller: _search,
          textInputAction: TextInputAction.search,
          decoration: InputDecoration(
            hintText: 'Search by room number',
            prefixIcon: const Icon(Icons.search, size: 20),
            suffixIcon: _search.text.isEmpty
                ? null
                : IconButton(
                    icon: const Icon(Icons.close, size: 18),
                    onPressed: () {
                      _search.clear();
                      ref.read(roomFilterProvider.notifier).state = filter
                          .copyWith(query: '');
                    },
                  ),
          ),
          onChanged: (_) => setState(() {}),
          onSubmitted: (value) => ref.read(roomFilterProvider.notifier).state =
              filter.copyWith(query: value.trim()),
        ),
        gapMd,

        _StatusFilterChips(filter: filter),
        const SizedBox(height: Sp.sm),
        _RoomTypeFilterChips(filter: filter),

        if (!filter.isEmpty)
          Align(
            alignment: Alignment.centerLeft,
            child: TextButton.icon(
              onPressed: () {
                _search.clear();
                ref.read(roomFilterProvider.notifier).state =
                    const RoomFilter();
              },
              icon: const Icon(Icons.filter_alt_off_outlined, size: 15),
              label: const Text('Clear filters'),
            ),
          ),
        gapSm,

        floors.when(
          loading: () => const ListSkeleton(rows: 2, height: 190),
          error: (error, _) => ErrorState(
            error: error,
            onRetry: () => ref.invalidate(roomsProvider),
          ),
          data: (groups) => groups.isEmpty
              ? EmptyState(
                  title: filter.isEmpty
                      ? 'No rooms yet'
                      : 'No rooms match those filters',
                  hint: filter.isEmpty
                      ? 'Add rooms from Room settings.'
                      : 'Try clearing the status or room-type filter.',
                  icon: Icons.meeting_room_outlined,
                  action: filter.isEmpty
                      ? PermissionGate(
                          permission: P.roomCreate,
                          child: FilledButton.icon(
                            onPressed: () => context.go(Routes.roomSettings),
                            icon: const Icon(Icons.settings_outlined, size: 16),
                            label: const Text('Room settings'),
                          ),
                        )
                      : null,
                )
              : Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    Align(
                      alignment: Alignment.centerLeft,
                      child: Padding(
                        padding: const EdgeInsets.only(bottom: Sp.sm),
                        child: Text(
                          '${groups.fold<int>(0, (sum, g) => sum + g.rooms.length)} '
                          'rooms across ${groups.length} '
                          '${groups.length == 1 ? 'floor' : 'floors'}',
                          style: AppTypography.labelXs(c.mutedForeground),
                        ),
                      ),
                    ),
                    for (final group in groups)
                      Padding(
                        padding: const EdgeInsets.only(bottom: Sp.md),
                        child: _FloorPanel(group: group),
                      ),
                    if (!canWrite) ...[
                      gapSm,
                      const PermissionNote(
                        text:
                            'You can see every room and, where your role allows '
                            'it, move a room’s status. Adding and removing '
                            'rooms is a manager’s job.',
                      ),
                    ],
                  ],
                ),
        ),
      ],
    );
  }
}

/// One floor of the board.
class _FloorPanel extends ConsumerWidget {
  const _FloorPanel({required this.group});

  final FloorGroup group;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    // The sheet is the only way to act on a room, so it opens only for someone
    // who can actually do something once it is open.
    final canAct =
        ref.watch(canProvider(P.roomStatusUpdate)) ||
        ref.watch(canProvider(P.roomUpdate)) ||
        ref.watch(canProvider(P.roomDelete));

    return Panel(
      title: group.headline,
      child: LayoutBuilder(
        builder: (context, constraints) {
          const spacing = Sp.sm;
          final columns = (constraints.maxWidth / 136).floor().clamp(2, 8);
          final width =
              (constraints.maxWidth - spacing * (columns - 1)) / columns;
          return Wrap(
            spacing: spacing,
            runSpacing: spacing,
            children: [
              for (final room in group.rooms)
                SizedBox(
                  width: width,
                  child: RoomCard(
                    photoUrl: room.primaryPhotoUrl,
                    number: room.number,
                    type: room.roomTypeName,
                    statusLabel: room.status.label,
                    tone: room.tone,
                    // RoomCard's fourth line is a free caption. With no guest
                    // on this endpoint, whether the room is air-conditioned is
                    // the most useful thing a housekeeper or a desk can read
                    // at a glance.
                    occupant: room.airConditioned ? 'AC' : 'Non-AC',
                    onTap: canAct
                        ? () => RoomStatusSheet.show(context, room)
                        : null,
                  ),
                ),
            ],
          );
        },
      ),
    );
  }
}

/// Status filters. `All` clears rather than being a status of its own.
class _StatusFilterChips extends ConsumerWidget {
  const _StatusFilterChips({required this.filter});

  final RoomFilter filter;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final c = context.colors;
    return SingleChildScrollView(
      scrollDirection: Axis.horizontal,
      child: Row(
        children: [
          FilterChip(
            label: const Text('All'),
            selected: filter.status == null,
            onSelected: (_) => ref.read(roomFilterProvider.notifier).state =
                filter.copyWith(clearStatus: true),
          ),
          for (final status in RoomStatus.values)
            Padding(
              padding: const EdgeInsets.only(left: 6),
              child: FilterChip(
                avatar: Icon(
                  status.tone.icon,
                  size: 15,
                  color: status.tone.color(c),
                ),
                label: Text(status.label),
                selected: filter.status == status,
                onSelected: (on) =>
                    ref.read(roomFilterProvider.notifier).state = on
                    ? filter.copyWith(status: status)
                    : filter.copyWith(clearStatus: true),
              ),
            ),
        ],
      ),
    );
  }
}

/// Room-type filters, from the active catalogue.
///
/// Hidden entirely when the catalogue is empty or unreadable — a receptionist
/// is not granted `roomtype.read`, and an empty filter row would read as a
/// broken screen rather than as a permission boundary.
class _RoomTypeFilterChips extends ConsumerWidget {
  const _RoomTypeFilterChips({required this.filter});

  final RoomFilter filter;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final types =
        ref.watch(roomTypeOptionsProvider).value ?? const <RoomType>[];
    if (types.isEmpty) return const SizedBox.shrink();

    return Padding(
      padding: const EdgeInsets.only(bottom: Sp.sm),
      child: SingleChildScrollView(
        scrollDirection: Axis.horizontal,
        child: Row(
          children: [
            FilterChip(
              label: const Text('Any type'),
              selected: filter.roomTypeId == null,
              onSelected: (_) => ref.read(roomFilterProvider.notifier).state =
                  filter.copyWith(clearRoomType: true),
            ),
            for (final type in types)
              Padding(
                padding: const EdgeInsets.only(left: 6),
                child: FilterChip(
                  label: Text(type.name),
                  selected: filter.roomTypeId == type.id,
                  onSelected: (on) =>
                      ref.read(roomFilterProvider.notifier).state = on
                      ? filter.copyWith(roomTypeId: type.id)
                      : filter.copyWith(clearRoomType: true),
                ),
              ),
          ],
        ),
      ),
    );
  }
}

/// Everything you may do to one room, in one sheet.
///
/// Each section carries its own gate, so the sheet a receptionist opens holds
/// the status list and nothing else, while a manager's holds all three.
class RoomStatusSheet extends ConsumerStatefulWidget {
  const RoomStatusSheet({super.key, required this.room});

  final Room room;

  static Future<void> show(BuildContext context, Room room) =>
      showModalBottomSheet<void>(
        context: context,
        showDragHandle: true,
        isScrollControlled: true,
        constraints: BoxConstraints(
          maxHeight: MediaQuery.sizeOf(context).height * 0.85,
        ),
        builder: (_) => RoomStatusSheet(room: room),
      );

  @override
  ConsumerState<RoomStatusSheet> createState() => _RoomStatusSheetState();
}

class _RoomStatusSheetState extends ConsumerState<RoomStatusSheet> {
  final _note = TextEditingController();
  bool _busy = false;
  String? _error;

  @override
  void dispose() {
    _note.dispose();
    super.dispose();
  }

  Future<void> _apply(RoomStatus next) async {
    final room = widget.room;
    if (next == room.status) {
      Navigator.of(context).pop();
      return;
    }
    setState(() {
      _busy = true;
      _error = null;
    });
    final messenger = ScaffoldMessenger.of(context);
    final navigator = Navigator.of(context);
    final note = _note.text.trim();
    try {
      await ref
          .read(roomActionsProvider)
          .setStatus(room.id, next, note: note.isEmpty ? null : note);
      navigator.pop();
      messenger.showSnackBar(
        SnackBar(
          content: Text(
            'Room ${room.number}: ${room.status.label.toLowerCase()} → '
            '${next.label.toLowerCase()}',
          ),
        ),
      );
    } on ApiException catch (e) {
      if (!mounted) return;
      setState(() {
        _busy = false;
        _error = RoomErrors.friendly(e);
      });
    }
  }

  Future<void> _confirmDelete() async {
    final room = widget.room;
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: Text('Delete room ${room.number}?'),
        content: const Text(
          'The room disappears from the board and from everything sold against '
          'it from now on. Past stays are kept. This cannot be undone from the '
          'app.',
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
            child: const Text('Delete'),
          ),
        ],
      ),
    );
    if (confirmed != true || !mounted) return;

    setState(() {
      _busy = true;
      _error = null;
    });
    final messenger = ScaffoldMessenger.of(context);
    final navigator = Navigator.of(context);
    try {
      await ref.read(roomActionsProvider).remove(room.id);
      navigator.pop();
      messenger.showSnackBar(
        SnackBar(content: Text('Room ${room.number} deleted')),
      );
    } on ApiException catch (e) {
      if (!mounted) return;
      setState(() {
        _busy = false;
        _error = RoomErrors.friendly(e);
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    final room = widget.room;

    return SafeArea(
      child: Padding(
        padding: const EdgeInsets.fromLTRB(Sp.lg, 0, Sp.lg, Sp.lg),
        child: SingleChildScrollView(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          'Room ${room.number}',
                          style: AppTypography.display(
                            size: 19,
                            color: c.foreground,
                          ),
                        ),
                        Text(
                          '${room.roomTypeName} · ${room.floorLabel}',
                          style: AppTypography.body(
                            size: 12.5,
                            color: c.mutedForeground,
                          ),
                        ),
                      ],
                    ),
                  ),
                  StatusBadge(tone: room.tone, label: room.status.label),
                ],
              ),
              if (room.notes != null) ...[
                const SizedBox(height: Sp.sm),
                FieldNote(
                  text: room.notes!,
                  icon: Icons.sticky_note_2_outlined,
                ),
              ],
              const SizedBox(height: Sp.lg),

              PermissionGate(
                permission: P.roomStatusUpdate,
                fallback: const PermissionNote(
                  text:
                      'Your role can see this room but not move its status. '
                      'Housekeeping and the front desk do that.',
                ),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    const LabelXs('Move to'),
                    const SizedBox(height: Sp.sm),
                    for (final status in RoomStatus.values)
                      _StatusOption(
                        status: status,
                        current: status == room.status,
                        enabled: !_busy,
                        onTap: () => _apply(status),
                      ),
                    const SizedBox(height: Sp.md),
                    TextField(
                      controller: _note,
                      textCapitalization: TextCapitalization.sentences,
                      decoration: const InputDecoration(
                        labelText: 'Note (optional)',
                        hintText: 'Why the room is moving, if it needs saying.',
                      ),
                    ),
                  ],
                ),
              ),

              if (_error != null) ...[
                const SizedBox(height: Sp.md),
                FormErrorNote(message: _error!),
              ],

              PermissionGate(
                permission: P.roomUpdate,
                child: Padding(
                  padding: const EdgeInsets.only(top: Sp.md),
                  child: OutlinedButton.icon(
                    onPressed: _busy
                        ? null
                        : () {
                            final router = GoRouter.of(context);
                            Navigator.of(context).pop();
                            router.go(Routes.room(room.id));
                          },
                    icon: const Icon(Icons.edit_outlined, size: 16),
                    label: const Text('Edit room'),
                  ),
                ),
              ),
              PermissionGate(
                permission: P.roomDelete,
                child: Padding(
                  padding: const EdgeInsets.only(top: Sp.sm),
                  child: OutlinedButton.icon(
                    onPressed: _busy ? null : _confirmDelete,
                    style: OutlinedButton.styleFrom(
                      foregroundColor: c.destructive,
                      side: BorderSide(
                        color: c.destructive.withValues(alpha: 0.4),
                      ),
                    ),
                    icon: const Icon(Icons.delete_outline, size: 16),
                    label: const Text('Delete room'),
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

/// One status in the sheet, in its own tone so the list can be read by colour
/// and by glyph, not by position.
class _StatusOption extends StatelessWidget {
  const _StatusOption({
    required this.status,
    required this.current,
    required this.enabled,
    required this.onTap,
  });

  final RoomStatus status;
  final bool current;
  final bool enabled;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    final tint = status.tone.color(c);
    return Padding(
      padding: const EdgeInsets.only(bottom: 6),
      child: Material(
        color: Colors.transparent,
        child: InkWell(
          onTap: enabled ? onTap : null,
          borderRadius: R.rMd,
          child: Container(
            constraints: const BoxConstraints(minHeight: kTouchTarget),
            padding: const EdgeInsets.symmetric(
              horizontal: Sp.md,
              vertical: Sp.sm,
            ),
            decoration: BoxDecoration(
              color: current ? tint.withValues(alpha: 0.1) : c.card,
              borderRadius: R.rMd,
              border: Border.all(
                color: current ? tint.withValues(alpha: 0.5) : c.border,
              ),
            ),
            child: Row(
              children: [
                Icon(status.tone.icon, size: 17, color: tint),
                const SizedBox(width: Sp.md),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        status.label,
                        style: AppTypography.body(
                          size: 13.5,
                          weight: FontWeight.w600,
                          color: c.foreground,
                        ),
                      ),
                      Text(
                        status.hint,
                        style: AppTypography.body(
                          size: 11.5,
                          color: c.mutedForeground,
                        ),
                      ),
                    ],
                  ),
                ),
                if (current)
                  Text(
                    'Now',
                    style: AppTypography.body(
                      size: 11.5,
                      weight: FontWeight.w700,
                      color: tint,
                    ),
                  ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
