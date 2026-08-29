import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/theme/app_colors.dart';
import '../../../core/theme/app_spacing.dart';
import '../../../core/theme/app_typography.dart';
import '../../../core/widgets/states.dart';
import '../../../core/widgets/status_badge.dart';
import '../../rooms/data/room_models.dart';
import '../application/reception_controllers.dart';

/// Pick the physical room a guest is going into.
///
/// It offers ONLY rooms of the type the booking was sold as, and only those a
/// guest can walk into today. Both narrowings are the point: a picker showing
/// every room in the hotel invites putting a Deluxe guest in a Standard, and
/// one showing dirty rooms invites handing over a key to an unmade bed.
///
/// Returns the chosen room's id, or null if the sheet was dismissed.
class RoomPickerSheet extends ConsumerWidget {
  const RoomPickerSheet({
    super.key,
    required this.roomTypeId,
    this.roomTypeName,
  });

  final String roomTypeId;
  final String? roomTypeName;

  static Future<String?> show(
    BuildContext context, {
    required String roomTypeId,
    String? roomTypeName,
  }) => showModalBottomSheet<String>(
    context: context,
    showDragHandle: true,
    isScrollControlled: true,
    constraints: BoxConstraints(
      maxHeight: MediaQuery.sizeOf(context).height * 0.8,
    ),
    builder: (_) =>
        RoomPickerSheet(roomTypeId: roomTypeId, roomTypeName: roomTypeName),
  );

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final c = context.colors;
    final rooms = ref.watch(assignableRoomsProvider(roomTypeId));

    return SafeArea(
      child: Padding(
        padding: const EdgeInsets.fromLTRB(Sp.lg, 0, Sp.lg, Sp.lg),
        child: SingleChildScrollView(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Text(
                'Pick a room',
                style: AppTypography.display(size: 19, color: c.foreground),
              ),
              Text(
                roomTypeName == null
                    ? 'Clean and ready rooms only.'
                    : 'Clean and ready ${roomTypeName!} rooms only.',
                style: AppTypography.body(
                  size: 12.5,
                  color: c.mutedForeground,
                ),
              ),
              const SizedBox(height: Sp.lg),

              rooms.when(
                loading: () => const ListSkeleton(rows: 3, height: 60),
                error: (error, _) => ErrorState(
                  error: error,
                  onRetry: () =>
                      ref.invalidate(assignableRoomsProvider(roomTypeId)),
                ),
                data: (list) => list.isEmpty
                    ? const EmptyState(
                        title: 'Nothing ready of that type',
                        hint:
                            'Every room of this type is occupied, dirty or off '
                            'the board. Housekeeping has to release one, or a '
                            'manager can move the booking to another type.',
                        icon: Icons.meeting_room_outlined,
                      )
                    : Column(
                        crossAxisAlignment: CrossAxisAlignment.stretch,
                        children: [
                          for (final room in list)
                            _RoomOption(
                              room: room,
                              onTap: () =>
                                  Navigator.of(context).pop(room.id),
                            ),
                        ],
                      ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _RoomOption extends StatelessWidget {
  const _RoomOption({required this.room, required this.onTap});

  final Room room;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    return Padding(
      padding: const EdgeInsets.only(bottom: 6),
      child: Material(
        color: Colors.transparent,
        child: InkWell(
          onTap: onTap,
          borderRadius: R.rMd,
          child: Container(
            constraints: const BoxConstraints(minHeight: kTouchTarget),
            padding: const EdgeInsets.symmetric(
              horizontal: Sp.md,
              vertical: Sp.sm,
            ),
            decoration: BoxDecoration(
              color: c.card,
              borderRadius: R.rMd,
              border: Border.all(color: c.border),
            ),
            child: Row(
              children: [
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        'Room ${room.number}',
                        style: AppTypography.body(
                          size: 13.5,
                          weight: FontWeight.w600,
                          color: c.foreground,
                        ),
                      ),
                      Text(
                        room.floorLabel,
                        style: AppTypography.body(
                          size: 11.5,
                          color: c.mutedForeground,
                        ),
                      ),
                    ],
                  ),
                ),
                StatusBadge(tone: room.tone, label: room.status.label),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
