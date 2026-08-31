import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/networking/api_exception.dart';
import '../../../core/permissions/permission_gate.dart';
import '../../../core/permissions/permission_keys.dart';
import '../../../core/providers.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/theme/app_spacing.dart';
import '../../../core/theme/app_typography.dart';
import '../../../core/widgets/primitives.dart';
import '../../../core/widgets/states.dart';
import '../../../core/widgets/status_badge.dart';
import '../application/restaurant_controllers.dart';
import '../data/restaurant_models.dart';
import '../data/restaurant_repository.dart';

/// Table management (manager only): create, rename, re-seat, block/unblock and
/// remove tables. Blocking takes a table off the floor without deleting it.
class TablesManagementScreen extends ConsumerWidget {
  const TablesManagementScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final tables = ref.watch(tablesProvider);

    return Scaffold(
      appBar: AppBar(
        title: const Text('Tables'),
        actions: [
          PermissionGate(
            permission: P.tableManage,
            child: IconButton(
              tooltip: 'Add table',
              onPressed: () => _editTable(context, ref),
              icon: const Icon(Icons.add),
            ),
          ),
        ],
      ),
      body: tables.when(
        loading: () => const ListSkeleton(rows: 4, height: 68),
        error: (e, _) =>
            ErrorState(error: e, onRetry: () => ref.invalidate(tablesProvider)),
        data: (list) => list.isEmpty
            ? EmptyState(
                title: 'No tables yet',
                hint: 'Add your first table to set up the floor.',
                icon: Icons.table_restaurant_outlined,
                action: PermissionGate(
                  permission: P.tableManage,
                  child: FilledButton.icon(
                    onPressed: () => _editTable(context, ref),
                    icon: const Icon(Icons.add, size: 16),
                    label: const Text('Add table'),
                  ),
                ),
              )
            : PageBody(
                onRefresh: () async => ref.invalidate(tablesProvider),
                children: [
                  for (final t in list)
                    Padding(
                      padding: const EdgeInsets.only(bottom: Sp.sm),
                      child: _TableRow(table: t),
                    ),
                ],
              ),
      ),
    );
  }
}

class _TableRow extends ConsumerWidget {
  const _TableRow({required this.table});

  final RestaurantTable table;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final c = context.colors;
    final canManage = ref.watch(canProvider(P.tableManage));
    final isBlocked = table.status == RestaurantTableStatus.blocked;
    // Blocking is only safe when the table is not mid-service.
    final canToggleBlock =
        isBlocked || table.status == RestaurantTableStatus.open;

    return SoftCard(
      child: Row(
        children: [
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  table.name,
                  style: AppTypography.body(
                    size: 14,
                    weight: FontWeight.w700,
                    color: c.foreground,
                  ),
                ),
                const SizedBox(height: 2),
                Row(
                  children: [
                    Text(
                      '${table.seats} seats',
                      style: AppTypography.body(
                        size: 12,
                        color: c.mutedForeground,
                      ),
                    ),
                    const SizedBox(width: 8),
                    StatusBadge(
                      tone: table.status.tone,
                      label: table.status.label,
                      dense: true,
                    ),
                  ],
                ),
              ],
            ),
          ),
          if (canManage)
            PopupMenuButton<String>(
              onSelected: (v) {
                if (v == 'edit') _editTable(context, ref, table);
                if (v == 'block') _toggleBlock(context, ref);
                if (v == 'delete') _delete(context, ref);
              },
              itemBuilder: (_) => [
                const PopupMenuItem(value: 'edit', child: Text('Edit')),
                if (canToggleBlock)
                  PopupMenuItem(
                    value: 'block',
                    child: Text(isBlocked ? 'Unblock' : 'Block'),
                  ),
                const PopupMenuItem(value: 'delete', child: Text('Delete')),
              ],
            ),
        ],
      ),
    );
  }

  Future<void> _toggleBlock(BuildContext context, WidgetRef ref) async {
    final next = table.status == RestaurantTableStatus.blocked
        ? RestaurantTableStatus.open
        : RestaurantTableStatus.blocked;
    final messenger = ScaffoldMessenger.of(context);
    try {
      await ref.read(restaurantActionsProvider).updateTable(table.id, {
        'status': next.wire,
      });
    } on ApiException catch (e) {
      messenger.showSnackBar(
        SnackBar(content: Text(RestaurantErrors.friendly(e))),
      );
    }
  }

  Future<void> _delete(BuildContext context, WidgetRef ref) async {
    final ok = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: Text('Delete ${table.name}?'),
        content: const Text(
          'It disappears from the floor. This cannot be undone from the app.',
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
    if (ok != true || !context.mounted) return;
    final messenger = ScaffoldMessenger.of(context);
    try {
      await ref.read(restaurantActionsProvider).deleteTable(table.id);
    } on ApiException catch (e) {
      messenger.showSnackBar(
        SnackBar(content: Text(RestaurantErrors.friendly(e))),
      );
    }
  }
}

Future<void> _editTable(
  BuildContext context,
  WidgetRef ref, [
  RestaurantTable? existing,
]) async {
  final nameCtrl = TextEditingController(text: existing?.name ?? '');
  final seatsCtrl = TextEditingController(text: '${existing?.seats ?? 4}');

  final saved = await showDialog<bool>(
    context: context,
    builder: (context) => AlertDialog(
      title: Text(existing == null ? 'New table' : 'Edit ${existing.name}'),
      content: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          TextField(
            controller: nameCtrl,
            autofocus: existing == null,
            textCapitalization: TextCapitalization.characters,
            decoration: const InputDecoration(
              labelText: 'Name',
              hintText: 'T1',
            ),
          ),
          const SizedBox(height: Sp.sm),
          TextField(
            controller: seatsCtrl,
            keyboardType: TextInputType.number,
            inputFormatters: [FilteringTextInputFormatter.digitsOnly],
            decoration: const InputDecoration(labelText: 'Seats'),
          ),
        ],
      ),
      actions: [
        TextButton(
          onPressed: () => Navigator.of(context).pop(false),
          child: const Text('Cancel'),
        ),
        FilledButton(
          onPressed: () {
            if (nameCtrl.text.trim().isEmpty) return;
            Navigator.of(context).pop(true);
          },
          child: const Text('Save'),
        ),
      ],
    ),
  );
  if (saved != true || !context.mounted) return;

  final name = nameCtrl.text.trim();
  final seats = int.tryParse(seatsCtrl.text.trim()) ?? 2;
  final messenger = ScaffoldMessenger.of(context);
  final actions = ref.read(restaurantActionsProvider);
  try {
    if (existing == null) {
      await actions.createTable(name, seats);
    } else {
      await actions.updateTable(existing.id, {'name': name, 'seats': seats});
    }
  } on ApiException catch (e) {
    messenger.showSnackBar(
      SnackBar(content: Text(RestaurantErrors.friendly(e))),
    );
  }
}
