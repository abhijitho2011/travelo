import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/permissions/permission_keys.dart';
import '../../../core/providers.dart';
import '../../../core/routing/routes.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/widgets/primitives.dart';

/// The room-management hub: the catalogue and the two ways to add rooms,
/// gathered off the Rooms board so the board stays a board.
///
/// Each destination screen still gates its own actions server-side, so the
/// hub links to all three unconditionally.
class RoomSettingsScreen extends ConsumerWidget {
  const RoomSettingsScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final c = context.colors;
    // Only GM/AGM hold roomtype.read and can reach the catalogue, so the tile
    // is shown to them alone rather than dead-ending everyone else at the
    // role guard.
    final canReadRoomTypes = ref.watch(canProvider(P.roomTypeRead));

    return PageBody(
      children: [
        const PageHeader(eyebrow: 'Rooms', title: 'Room settings'),
        gapSection,
        SoftCard(
          padding: EdgeInsets.zero,
          child: Column(
            children: [
              if (canReadRoomTypes) ...[
                ListTile(
                  leading: const Icon(Icons.bed_outlined, size: 20),
                  title: const Text('Room types'),
                  trailing: Icon(
                    Icons.chevron_right,
                    size: 18,
                    color: c.mutedForeground,
                  ),
                  onTap: () => context.go(Routes.roomTypes),
                ),
                const RowDivider(),
              ],
              ListTile(
                leading: const Icon(Icons.add, size: 20),
                title: const Text('Add room'),
                trailing: Icon(
                  Icons.chevron_right,
                  size: 18,
                  color: c.mutedForeground,
                ),
                onTap: () => context.go(Routes.roomNew),
              ),
              const RowDivider(),
              ListTile(
                leading: const Icon(Icons.library_add_outlined, size: 20),
                title: const Text('Bulk add rooms'),
                trailing: Icon(
                  Icons.chevron_right,
                  size: 18,
                  color: c.mutedForeground,
                ),
                onTap: () => context.go(Routes.roomBulk),
              ),
            ],
          ),
        ),
      ],
    );
  }
}
