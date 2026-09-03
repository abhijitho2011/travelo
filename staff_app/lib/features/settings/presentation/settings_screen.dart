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
    final canAddRooms = ref.watch(canProvider(P.roomCreate));
    final canConfigure = ref.watch(canProvider(P.propertySettingsRead));
    final canSeeRates = ref.watch(canProvider(P.ratesRead));

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
              if (canConfigure) ...[
                const RowDivider(),
                ListTile(
                  leading: const Icon(Icons.tune_outlined, size: 20),
                  title: const Text('Property settings'),
                  subtitle: const Text(
                    'Tax, invoice, policies, add-ons, sources',
                  ),
                  trailing: Icon(
                    Icons.chevron_right,
                    size: 18,
                    color: c.mutedForeground,
                  ),
                  onTap: () => context.go(Routes.propertySettings),
                ),
              ],
              if (canSeeRates) ...[
                const RowDivider(),
                ListTile(
                  leading: const Icon(Icons.grid_on_outlined, size: 20),
                  title: const Text('Rates & inventory'),
                  subtitle: const Text(
                    'Price, availability and restrictions by day',
                  ),
                  trailing: Icon(
                    Icons.chevron_right,
                    size: 18,
                    color: c.mutedForeground,
                  ),
                  onTap: () => context.go(Routes.rates),
                ),
              ],
              if (canAddRooms) ...[
                const RowDivider(),
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
              ],
            ],
          ),
        ),
      ],
    );
  }
}
