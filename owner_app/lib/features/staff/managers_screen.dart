import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/data/owner_repository.dart';
import '../../core/theme/app_colors.dart';
import '../../core/theme/app_spacing.dart';
import '../../core/widgets/cards.dart';
import '../../core/widgets/primitives.dart';
import '../../core/widgets/states.dart';

/// Managers, by hotel.
///
/// A General Manager belongs to one property, so there is no portfolio-wide
/// manager list on the server and this screen invents none: it lists the hotels
/// already loaded for the dashboard and hands off to each one's existing
/// managers screen. No extra request is made.
class ManagersScreen extends ConsumerWidget {
  const ManagersScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final c = context.colors;
    final props = ref.watch(propertiesProvider);

    return PageBody(
      onRefresh: () async => ref.invalidate(propertiesProvider),
      children: [
        const PageHeader(
          eyebrow: 'Your team',
          title: 'Managers',
          subtitle:
              'General Managers and Assistant GMs run each hotel '
              'day to day. Pick a hotel to manage its team.',
        ),
        gapSection,
        props.when(
          loading: () => const ListSkeleton(rows: 3, height: 66),
          error: (e, _) => ErrorState(
            error: e,
            message: 'Could not load your hotels.',
            onRetry: () => ref.invalidate(propertiesProvider),
          ),
          data: (list) => list.isEmpty
              ? EmptyState(
                  icon: Icons.groups_outlined,
                  title: 'No hotels yet',
                  hint:
                      'Add a hotel first — managers are appointed per '
                      'property.',
                  action: FilledButton.icon(
                    onPressed: () => context.push('/properties/new'),
                    icon: const Icon(Icons.add, size: 16),
                    label: const Text('Add property'),
                  ),
                )
              : Panel(
                  title: 'Hotels',
                  description:
                      '${list.length} '
                      '${list.length == 1 ? 'property' : 'properties'}',
                  padBody: false,
                  child: Column(
                    children: [
                      for (var i = 0; i < list.length; i++) ...[
                        if (i > 0) const RowDivider(),
                        DataRow2(
                          title: list[i].name,
                          subtitle: [
                            list[i].city,
                            list[i].state,
                          ].where((s) => s.isNotEmpty).join(', '),
                          leading: Container(
                            width: 36,
                            height: 36,
                            decoration: BoxDecoration(
                              color: c.accent,
                              borderRadius: R.rSm,
                            ),
                            alignment: Alignment.center,
                            child: Icon(
                              Icons.groups_outlined,
                              size: 18,
                              color: c.accentForeground,
                            ),
                          ),
                          trailing: Icon(
                            Icons.chevron_right,
                            size: 18,
                            color: c.mutedForeground,
                          ),
                          onTap: () =>
                              context.push('/properties/${list[i].id}/staff'),
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
