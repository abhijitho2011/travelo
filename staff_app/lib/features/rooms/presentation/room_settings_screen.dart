import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/routing/routes.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/widgets/primitives.dart';

/// The room-management hub: the ways to add rooms, gathered off the Rooms
/// board so the board stays a board. Rooms are added one at a time or in bulk;
/// there is no separate room-type step — a room carries its own specifications.
///
/// Each destination screen still gates its own actions server-side.
class RoomSettingsScreen extends ConsumerWidget {
  const RoomSettingsScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final c = context.colors;

    return PageBody(
      children: [
        const PageHeader(eyebrow: 'Rooms', title: 'Room settings'),
        gapSection,
        SoftCard(
          padding: EdgeInsets.zero,
          child: Column(
            children: [
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
