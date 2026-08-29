import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/permissions/permission_gate.dart';
import '../../../core/permissions/permission_keys.dart';
import '../../../core/utils/formatting.dart';
import '../../../core/widgets/cards.dart';
import '../../../core/widgets/primitives.dart';
import '../../../core/widgets/states.dart';
import '../../../core/widgets/status_badge.dart';
import '../data/security_repository.dart';
import 'record_sheets.dart';

class LostFoundScreen extends ConsumerWidget {
  const LostFoundScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final async = ref.watch(lostFoundProvider);

    return PageBody(
      onRefresh: () async => ref.invalidate(lostFoundProvider),
      children: [
        PageHeader(
          eyebrow: 'Security',
          title: 'Lost & found',
          subtitle: 'Items handed in at the gate or found on the property.',
          actions: [
            PermissionGate(
              permission: P.lostFoundCreate,
              child: FilledButton.icon(
                onPressed: () async {
                  final saved = await SecuritySheets.foundItem(context, ref);
                  if (saved == true) ref.invalidate(lostFoundProvider);
                },
                icon: const Icon(Icons.add, size: 17),
                label: const Text('Log an item'),
              ),
            ),
          ],
        ),
        gapSection,
        async.when(
          loading: () => const ListSkeleton(rows: 3, height: 68),
          error: (e, _) => ErrorState(
            error: e,
            onRetry: () => ref.invalidate(lostFoundProvider),
          ),
          data: (items) => items.isEmpty
              ? const EmptyState(
                  title: 'Nothing logged',
                  hint:
                      'When something is handed in, log it here so it can be '
                      'matched to a claim later.',
                  icon: Icons.travel_explore_outlined,
                )
              : Panel(
                  title: 'Items held',
                  description: '${items.length} in the cupboard',
                  padBody: false,
                  child: Column(
                    children: [
                      for (var i = 0; i < items.length; i++) ...[
                        if (i > 0) const RowDivider(),
                        DataRow2(
                          leading: const Icon(Icons.inventory_2_outlined, size: 18),
                          title: items[i].description,
                          subtitle: [
                            if (items[i].location != null) items[i].location!,
                            Fmt.dateTime(items[i].foundAt),
                          ].join(' · '),
                          badge: items[i].status == null
                              ? null
                              : StatusBadge(
                                  tone: StatusTone.neutral,
                                  label: Fmt.humanise(items[i].status!),
                                  dense: true,
                                ),
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
