import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/data/owner_repository.dart';
import '../../core/theme/app_spacing.dart';
import '../../core/widgets/primitives.dart';
import '../../core/widgets/states.dart';
import 'property_card.dart';

class PropertiesScreen extends ConsumerWidget {
  const PropertiesScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final props = ref.watch(propertiesProvider);
    return PageBody(
      onRefresh: () async => ref.invalidate(propertiesProvider),
      children: [
        PageHeader(
          eyebrow: 'Portfolio',
          title: 'Hotels',
          subtitle: 'Every property on your account.',
          actions: [
            // The add action lives in the header rather than a floating button:
            // the shell owns the bottom edge of the screen now.
            FilledButton.icon(
              onPressed: () => context.push('/properties/new'),
              icon: const Icon(Icons.add, size: 16),
              label: const Text('Add property'),
            ),
          ],
        ),
        gapSection,
        props.when(
          loading: () => const ListSkeleton(),
          error: (e, _) => ErrorState(
            error: e,
            message: 'Could not load properties.',
            onRetry: () => ref.invalidate(propertiesProvider),
          ),
          data: (list) => list.isEmpty
              ? EmptyState(
                  icon: Icons.add_business_outlined,
                  title: 'No hotels yet',
                  hint:
                      'Add your first property to start managing rooms and '
                      'operations.',
                  action: FilledButton.icon(
                    onPressed: () => context.push('/properties/new'),
                    icon: const Icon(Icons.add, size: 16),
                    label: const Text('Add property'),
                  ),
                )
              : Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    for (final p in list)
                      Padding(
                        padding: const EdgeInsets.only(bottom: Sp.md),
                        child: PropertyCard(property: p),
                      ),
                  ],
                ),
        ),
      ],
    );
  }
}
