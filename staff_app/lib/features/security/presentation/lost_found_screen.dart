import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/permissions/permission_gate.dart';
import '../../../core/permissions/permission_keys.dart';
import '../../../core/utils/formatting.dart';
import '../../../core/widgets/cards.dart';
import '../../../core/widgets/primitives.dart';
import '../../../core/widgets/states.dart';
import '../../../core/widgets/status_badge.dart';
import '../../../core/networking/api_exception.dart';
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
                          onTap: ref.hasPermission(P.lostFoundUpdate)
                              ? () => _changeStatus(context, ref, items[i].id,
                                  items[i].status ?? 'STORED')
                              : null,
                          badge: items[i].status == null
                              ? null
                              : StatusBadge(
                                  tone: switch (items[i].status) {
                                    'CLAIMED' => StatusTone.healthy,
                                    'DISPOSED' => StatusTone.neutral,
                                    _ => StatusTone.warning,
                                  },
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

/// Bottom sheet to move a held item between STORED / CLAIMED / DISPOSED.
Future<void> _changeStatus(
  BuildContext context,
  WidgetRef ref,
  String id,
  String current,
) async {
  final messenger = ScaffoldMessenger.of(context);
  const options = {
    'STORED': 'Back to stored',
    'CLAIMED': 'Mark claimed',
    'DISPOSED': 'Mark disposed',
  };
  final choice = await showModalBottomSheet<String>(
    context: context,
    builder: (ctx) => SafeArea(
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          for (final e in options.entries)
            if (e.key != current)
              ListTile(
                title: Text(e.value),
                onTap: () => Navigator.pop(ctx, e.key),
              ),
        ],
      ),
    ),
  );
  if (choice == null) return;
  try {
    await ref.read(securityRepositoryProvider).updateLostFound(id, choice);
    ref.invalidate(lostFoundProvider);
  } on ApiException catch (e) {
    messenger.showSnackBar(
      SnackBar(content: Text(e.message.isEmpty ? 'Could not update.' : e.message)),
    );
  }
}
