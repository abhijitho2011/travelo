import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/permissions/permission_keys.dart';
import '../../../core/providers.dart';
import '../../../core/routing/routes.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/widgets/primitives.dart';

/// The account hub: the settings and secondary destinations that used to sit
/// loose in the More sheet, gathered behind one nav entry.
class SettingsScreen extends ConsumerWidget {
  const SettingsScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final c = context.colors;
    final canReadRooms = ref.watch(canProvider(P.roomRead));

    return PageBody(
      children: [
        const PageHeader(eyebrow: 'Account', title: 'Settings'),
        gapSection,
        SoftCard(
          padding: EdgeInsets.zero,
          child: Column(
            children: [
              ListTile(
                leading: const Icon(Icons.person_outline, size: 20),
                title: const Text('Profile'),
                trailing: Icon(
                  Icons.chevron_right,
                  size: 18,
                  color: c.mutedForeground,
                ),
                onTap: () => context.go(Routes.profile),
              ),
              const RowDivider(),
              ListTile(
                leading: const Icon(Icons.help_outline, size: 20),
                title: const Text('Help & support'),
                trailing: Icon(
                  Icons.chevron_right,
                  size: 18,
                  color: c.mutedForeground,
                ),
                onTap: () => context.go(Routes.support),
              ),
              if (canReadRooms) ...[
                const RowDivider(),
                ListTile(
                  leading: const Icon(Icons.meeting_room_outlined, size: 20),
                  title: const Text('Room settings'),
                  trailing: Icon(
                    Icons.chevron_right,
                    size: 18,
                    color: c.mutedForeground,
                  ),
                  onTap: () => context.go(Routes.roomSettings),
                ),
              ],
            ],
          ),
        ),
      ],
    );
  }
}
