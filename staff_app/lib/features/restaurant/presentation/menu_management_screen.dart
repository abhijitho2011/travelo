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
import 'restaurant_widgets.dart';

/// Menu management (manager only): categories, items, prices, and the 86
/// availability toggle. Uses the `all=true` menu so archived and unavailable
/// rows can be edited back.
class MenuManagementScreen extends ConsumerWidget {
  const MenuManagementScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final menu = ref.watch(menuAllProvider);

    return Scaffold(
      appBar: AppBar(
        title: const Text('Menu'),
        actions: [
          PermissionGate(
            permission: P.menuManage,
            child: IconButton(
              tooltip: 'Add category',
              onPressed: () => _addCategory(context, ref),
              icon: const Icon(Icons.create_new_folder_outlined),
            ),
          ),
        ],
      ),
      body: menu.when(
        loading: () => const ListSkeleton(rows: 3, height: 90),
        error: (e, _) =>
            ErrorState(error: e, onRetry: () => ref.invalidate(menuAllProvider)),
        data: (categories) => categories.isEmpty
            ? EmptyState(
                title: 'No menu yet',
                hint: 'Add a category, then fill it with dishes.',
                icon: Icons.menu_book_outlined,
                action: PermissionGate(
                  permission: P.menuManage,
                  child: FilledButton.icon(
                    onPressed: () => _addCategory(context, ref),
                    icon: const Icon(Icons.add, size: 16),
                    label: const Text('Add category'),
                  ),
                ),
              )
            : PageBody(
                onRefresh: () async => ref.invalidate(menuAllProvider),
                children: [
                  for (final cat in categories) _CategoryPanel(category: cat),
                ],
              ),
      ),
    );
  }

  Future<void> _addCategory(BuildContext context, WidgetRef ref) async {
    final name = await _promptText(context, title: 'New category', label: 'Name');
    if (name == null || !context.mounted) return;
    final messenger = ScaffoldMessenger.of(context);
    try {
      await ref.read(restaurantActionsProvider).createCategory(name);
    } on ApiException catch (e) {
      messenger.showSnackBar(SnackBar(content: Text(RestaurantErrors.friendly(e))));
    }
  }
}

class _CategoryPanel extends ConsumerWidget {
  const _CategoryPanel({required this.category});

  final MenuCategory category;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return Padding(
      padding: const EdgeInsets.only(bottom: Sp.md),
      child: Panel(
        title: category.name,
        description: '${category.items.length} items',
        actions: [
          PermissionGate(
            permission: P.menuManage,
            child: IconButton(
              tooltip: 'Add item',
              onPressed: () => _addItem(context, ref),
              icon: const Icon(Icons.add, size: 20),
            ),
          ),
        ],
        child: category.items.isEmpty
            ? Padding(
                padding: const EdgeInsets.all(Sp.sm),
                child: Text(
                  'No items in this category yet.',
                  style: AppTypography.body(
                    size: 12.5,
                    color: context.colors.mutedForeground,
                  ),
                ),
              )
            : Column(
                children: [
                  for (final item in category.items) _ItemRow(item: item),
                ],
              ),
      ),
    );
  }

  Future<void> _addItem(BuildContext context, WidgetRef ref) async {
    final result = await _itemDialog(context, categoryName: category.name);
    if (result == null || !context.mounted) return;
    final messenger = ScaffoldMessenger.of(context);
    try {
      await ref.read(restaurantActionsProvider).createItem({
        'categoryId': category.id,
        'name': result.name,
        'pricePaise': result.pricePaise,
        'veg': result.veg,
      });
    } on ApiException catch (e) {
      messenger.showSnackBar(SnackBar(content: Text(RestaurantErrors.friendly(e))));
    }
  }
}

class _ItemRow extends ConsumerWidget {
  const _ItemRow({required this.item});

  final MenuItem item;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final c = context.colors;
    final canManage = ref.watch(canProvider(P.menuManage));
    final archived = item.status == MenuItemStatus.archived;

    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 6),
      child: Row(
        children: [
          VegBadge(veg: item.veg),
          const SizedBox(width: Sp.sm),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  item.name,
                  style: AppTypography.body(
                    size: 13.5,
                    weight: FontWeight.w600,
                    color: archived ? c.mutedForeground : c.foreground,
                  ),
                ),
                Row(
                  children: [
                    Text(
                      item.priceLabel,
                      style: AppTypography.numeric(size: 12, color: c.mutedForeground),
                    ),
                    if (item.status != MenuItemStatus.active) ...[
                      const SizedBox(width: 6),
                      StatusBadge(
                        tone: archived ? StatusTone.neutral : StatusTone.warning,
                        label: item.status.label,
                        dense: true,
                      ),
                    ],
                  ],
                ),
              ],
            ),
          ),
          if (canManage && !archived)
            // The 86 toggle: ACTIVE ↔ UNAVAILABLE.
            Switch(
              value: item.status == MenuItemStatus.active,
              onChanged: (on) => _availability(context, ref, on),
            ),
          if (canManage)
            PopupMenuButton<String>(
              onSelected: (v) {
                if (v == 'edit') _edit(context, ref);
                if (v == 'delete') _delete(context, ref);
              },
              itemBuilder: (_) => const [
                PopupMenuItem(value: 'edit', child: Text('Edit')),
                PopupMenuItem(value: 'delete', child: Text('Delete')),
              ],
            ),
        ],
      ),
    );
  }

  Future<void> _availability(BuildContext context, WidgetRef ref, bool on) async {
    final messenger = ScaffoldMessenger.of(context);
    try {
      await ref.read(restaurantActionsProvider).setItemAvailability(item.id, on);
    } on ApiException catch (e) {
      messenger.showSnackBar(SnackBar(content: Text(RestaurantErrors.friendly(e))));
    }
  }

  Future<void> _edit(BuildContext context, WidgetRef ref) async {
    final result = await _itemDialog(context, existing: item);
    if (result == null || !context.mounted) return;
    final messenger = ScaffoldMessenger.of(context);
    try {
      await ref.read(restaurantActionsProvider).updateItem(item.id, {
        'name': result.name,
        'pricePaise': result.pricePaise,
        'veg': result.veg,
      });
    } on ApiException catch (e) {
      messenger.showSnackBar(SnackBar(content: Text(RestaurantErrors.friendly(e))));
    }
  }

  Future<void> _delete(BuildContext context, WidgetRef ref) async {
    final ok = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: Text('Remove ${item.name}?'),
        content: const Text(
          'It disappears from the menu. Bills that already contain it keep the '
          'name and price they were rung up at.',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(context).pop(false),
            child: const Text('Cancel'),
          ),
          FilledButton(
            onPressed: () => Navigator.of(context).pop(true),
            style: FilledButton.styleFrom(backgroundColor: context.colors.destructive),
            child: const Text('Remove'),
          ),
        ],
      ),
    );
    if (ok != true || !context.mounted) return;
    final messenger = ScaffoldMessenger.of(context);
    try {
      await ref.read(restaurantActionsProvider).deleteItem(item.id);
    } on ApiException catch (e) {
      messenger.showSnackBar(SnackBar(content: Text(RestaurantErrors.friendly(e))));
    }
  }
}

// --------------------------------------------------------------- dialogs --

class _ItemResult {
  const _ItemResult(this.name, this.pricePaise, this.veg);
  final String name;
  final int pricePaise;
  final bool veg;
}

Future<_ItemResult?> _itemDialog(
  BuildContext context, {
  MenuItem? existing,
  String? categoryName,
}) {
  final nameCtrl = TextEditingController(text: existing?.name ?? '');
  final priceCtrl = TextEditingController(
    text: existing != null ? (existing.pricePaise / 100).toStringAsFixed(0) : '',
  );
  bool veg = existing?.veg ?? true;

  return showDialog<_ItemResult>(
    context: context,
    builder: (context) => StatefulBuilder(
      builder: (context, setState) => AlertDialog(
        title: Text(existing == null ? 'New item' : 'Edit ${existing.name}'),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            TextField(
              controller: nameCtrl,
              autofocus: existing == null,
              textCapitalization: TextCapitalization.words,
              decoration: InputDecoration(
                labelText: 'Name',
                hintText: categoryName == null ? null : 'in $categoryName',
              ),
            ),
            const SizedBox(height: Sp.sm),
            TextField(
              controller: priceCtrl,
              keyboardType: TextInputType.number,
              inputFormatters: [FilteringTextInputFormatter.digitsOnly],
              decoration: const InputDecoration(
                labelText: 'Price (₹)',
                prefixText: '₹ ',
              ),
            ),
            const SizedBox(height: Sp.sm),
            SwitchListTile(
              contentPadding: EdgeInsets.zero,
              title: const Text('Vegetarian'),
              value: veg,
              onChanged: (v) => setState(() => veg = v),
            ),
          ],
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(context).pop(),
            child: const Text('Cancel'),
          ),
          FilledButton(
            onPressed: () {
              final name = nameCtrl.text.trim();
              final rupees = int.tryParse(priceCtrl.text.trim()) ?? -1;
              if (name.isEmpty || rupees < 0) return;
              Navigator.of(context).pop(_ItemResult(name, rupees * 100, veg));
            },
            child: const Text('Save'),
          ),
        ],
      ),
    ),
  );
}

Future<String?> _promptText(
  BuildContext context, {
  required String title,
  required String label,
}) {
  final ctrl = TextEditingController();
  return showDialog<String>(
    context: context,
    builder: (context) => AlertDialog(
      title: Text(title),
      content: TextField(
        controller: ctrl,
        autofocus: true,
        textCapitalization: TextCapitalization.words,
        decoration: InputDecoration(labelText: label),
      ),
      actions: [
        TextButton(
          onPressed: () => Navigator.of(context).pop(),
          child: const Text('Cancel'),
        ),
        FilledButton(
          onPressed: () {
            final text = ctrl.text.trim();
            if (text.isNotEmpty) Navigator.of(context).pop(text);
          },
          child: const Text('Add'),
        ),
      ],
    ),
  );
}
