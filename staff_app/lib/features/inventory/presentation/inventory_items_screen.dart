import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/networking/api_exception.dart';
import '../../../core/permissions/permission_gate.dart';
import '../../../core/permissions/permission_keys.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/theme/app_spacing.dart';
import '../../../core/theme/app_typography.dart';
import '../../../core/widgets/primitives.dart';
import '../../../core/widgets/states.dart';
import '../../../core/widgets/status_badge.dart';
import '../application/inventory_controllers.dart';
import '../data/inventory_models.dart';

/// The item list — create / edit an item, and record a stock movement against it.
class InventoryItemsScreen extends ConsumerWidget {
  const InventoryItemsScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final items = ref.watch(itemsProvider);
    final lowOnly = ref.watch(itemsLowStockFilterProvider);

    return Scaffold(
      floatingActionButton: ref.hasPermission(P.inventoryCreate)
          ? FloatingActionButton.extended(
              onPressed: () => ItemFormSheet.show(context, ref),
              icon: const Icon(Icons.add),
              label: const Text('New item'),
            )
          : null,
      body: PageBody(
        onRefresh: () async => ref.invalidate(itemsProvider),
        children: [
          const PageHeader(
            title: 'Items',
            subtitle: 'Everything the store holds.',
          ),
          gapMd,
          SectionHeader(
            title: 'Stock',
            trailing: Row(
              children: [
                const Text('Low only', style: TextStyle(fontSize: 12.5)),
                Switch(
                  value: lowOnly,
                  onChanged: (v) =>
                      ref.read(itemsLowStockFilterProvider.notifier).state = v,
                ),
              ],
            ),
          ),
          items.when(
            loading: () => const ListSkeleton(rows: 6),
            error: (e, _) => ErrorState(
              error: e,
              onRetry: () => ref.invalidate(itemsProvider),
            ),
            data: (list) => list.isEmpty
                ? const EmptyState(
                    title: 'No items yet',
                    hint: 'Add the stock this property keeps.',
                    icon: Icons.inventory_2_outlined,
                  )
                : Column(children: [for (final i in list) _ItemRow(item: i)]),
          ),
        ],
      ),
    );
  }
}

class _ItemRow extends ConsumerWidget {
  const _ItemRow({required this.item});
  final InventoryItem item;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final c = context.colors;
    final i = item;
    return Padding(
      padding: const EdgeInsets.only(bottom: Sp.md),
      child: SoftCard(
        onTap: () => _openActions(context, ref, i),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Expanded(
                  child: Text(
                    i.name,
                    style: AppTypography.body(
                      size: 14,
                      weight: FontWeight.w700,
                      color: c.foreground,
                    ),
                  ),
                ),
                StatusBadge(
                  tone: i.tone,
                  label: '${i.currentQty} ${i.unit}',
                  dense: true,
                ),
              ],
            ),
            const SizedBox(height: 4),
            Text(
              '${i.sku} · reorder at ${i.reorderLevel} · ${formatPaise(i.stockValuePaise)}',
              style: AppTypography.body(size: 12, color: c.mutedForeground),
            ),
          ],
        ),
      ),
    );
  }

  void _openActions(BuildContext context, WidgetRef ref, InventoryItem i) {
    showModalBottomSheet<void>(
      context: context,
      showDragHandle: true,
      builder: (sheetCtx) => SafeArea(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            if (ref.hasPermission(P.stockAdjust))
              ListTile(
                leading: const Icon(Icons.swap_vert),
                title: const Text('Record movement'),
                onTap: () {
                  Navigator.of(sheetCtx).pop();
                  StockMovementSheet.show(context, ref, i);
                },
              ),
            if (ref.hasPermission(P.inventoryUpdate))
              ListTile(
                leading: const Icon(Icons.edit_outlined),
                title: const Text('Edit item'),
                onTap: () {
                  Navigator.of(sheetCtx).pop();
                  ItemFormSheet.show(context, ref, existing: i);
                },
              ),
          ],
        ),
      ),
    );
  }
}

class ItemFormSheet extends ConsumerStatefulWidget {
  const ItemFormSheet({super.key, this.existing});
  final InventoryItem? existing;

  static Future<void> show(
    BuildContext context,
    WidgetRef ref, {
    InventoryItem? existing,
  }) => showModalBottomSheet<void>(
    context: context,
    isScrollControlled: true,
    showDragHandle: true,
    constraints: BoxConstraints(
      maxHeight: MediaQuery.sizeOf(context).height * 0.9,
    ),
    builder: (_) => ItemFormSheet(existing: existing),
  );

  @override
  ConsumerState<ItemFormSheet> createState() => _ItemFormSheetState();
}

class _ItemFormSheetState extends ConsumerState<ItemFormSheet> {
  final _form = GlobalKey<FormState>();
  late final TextEditingController _name;
  late final TextEditingController _sku;
  late final TextEditingController _unit;
  late final TextEditingController _category;
  late final TextEditingController _reorder;
  late final TextEditingController _opening;
  late final TextEditingController _cost;
  bool _busy = false;
  String? _error;

  bool get _isEdit => widget.existing != null;

  @override
  void initState() {
    super.initState();
    final e = widget.existing;
    _name = TextEditingController(text: e?.name ?? '');
    _sku = TextEditingController(text: e?.sku ?? '');
    _unit = TextEditingController(text: e?.unit ?? 'pcs');
    _category = TextEditingController(text: e?.category ?? '');
    _reorder = TextEditingController(text: (e?.reorderLevel ?? 0).toString());
    _opening = TextEditingController(text: '0');
    _cost = TextEditingController(
      text: e == null ? '' : (e.unitCostPaise / 100).toStringAsFixed(0),
    );
  }

  @override
  void dispose() {
    _name.dispose();
    _sku.dispose();
    _unit.dispose();
    _category.dispose();
    _reorder.dispose();
    _opening.dispose();
    _cost.dispose();
    super.dispose();
  }

  Future<void> _save() async {
    if (!_form.currentState!.validate()) return;
    setState(() {
      _busy = true;
      _error = null;
    });
    final costPaise = _cost.text.trim().isEmpty
        ? null
        : ((double.tryParse(_cost.text.trim()) ?? 0) * 100).round();
    final body = <String, dynamic>{
      'name': _name.text.trim(),
      'sku': _sku.text.trim(),
      'unit': _unit.text.trim().isEmpty ? 'pcs' : _unit.text.trim(),
      if (_category.text.trim().isNotEmpty) 'category': _category.text.trim(),
      'reorderLevel': int.tryParse(_reorder.text.trim()) ?? 0,
      if (costPaise != null) 'unitCostPaise': costPaise,
    };
    if (!_isEdit) {
      final opening = int.tryParse(_opening.text.trim()) ?? 0;
      if (opening > 0) body['openingQty'] = opening;
    }
    final navigator = Navigator.of(context);
    try {
      final actions = ref.read(inventoryActionsProvider);
      if (_isEdit) {
        await actions.updateItem(widget.existing!.id, body);
      } else {
        await actions.createItem(body);
      }
      navigator.pop();
    } on ApiException catch (e) {
      setState(() {
        _busy = false;
        _error = e.message;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: EdgeInsets.only(
        left: Sp.lg,
        right: Sp.lg,
        top: Sp.md,
        bottom: MediaQuery.viewInsetsOf(context).bottom + Sp.lg,
      ),
      child: Form(
        key: _form,
        child: SingleChildScrollView(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Text(
                _isEdit ? 'Edit item' : 'New item',
                style: Theme.of(context).textTheme.titleMedium,
              ),
              const SizedBox(height: Sp.md),
              TextFormField(
                controller: _name,
                decoration: const InputDecoration(labelText: 'Name'),
                validator: (v) =>
                    (v == null || v.trim().isEmpty) ? 'Required' : null,
              ),
              const SizedBox(height: Sp.md),
              TextFormField(
                controller: _sku,
                decoration: const InputDecoration(labelText: 'SKU'),
                validator: (v) =>
                    (v == null || v.trim().isEmpty) ? 'Required' : null,
              ),
              const SizedBox(height: Sp.md),
              Row(
                children: [
                  Expanded(
                    child: TextFormField(
                      controller: _unit,
                      decoration: const InputDecoration(labelText: 'Unit'),
                    ),
                  ),
                  const SizedBox(width: Sp.md),
                  Expanded(
                    child: TextFormField(
                      controller: _reorder,
                      decoration: const InputDecoration(
                        labelText: 'Reorder level',
                      ),
                      keyboardType: TextInputType.number,
                    ),
                  ),
                ],
              ),
              const SizedBox(height: Sp.md),
              TextFormField(
                controller: _category,
                decoration: const InputDecoration(
                  labelText: 'Category (optional)',
                ),
              ),
              const SizedBox(height: Sp.md),
              TextFormField(
                controller: _cost,
                decoration: const InputDecoration(
                  labelText: 'Unit cost (₹, optional)',
                  prefixText: '₹ ',
                ),
                keyboardType: TextInputType.number,
              ),
              if (!_isEdit) ...[
                const SizedBox(height: Sp.md),
                TextFormField(
                  controller: _opening,
                  decoration: const InputDecoration(
                    labelText: 'Opening quantity',
                  ),
                  keyboardType: TextInputType.number,
                ),
              ],
              if (_error != null) ...[
                const SizedBox(height: Sp.md),
                Text(
                  _error!,
                  style: TextStyle(color: Theme.of(context).colorScheme.error),
                ),
              ],
              const SizedBox(height: Sp.lg),
              FilledButton(
                onPressed: _busy ? null : _save,
                child: _busy
                    ? const SizedBox(
                        height: 18,
                        width: 18,
                        child: CircularProgressIndicator(strokeWidth: 2),
                      )
                    : Text(_isEdit ? 'Save changes' : 'Create item'),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

/// Record a stock movement against an item.
class StockMovementSheet extends ConsumerStatefulWidget {
  const StockMovementSheet({super.key, required this.item});
  final InventoryItem item;

  static Future<void> show(
    BuildContext context,
    WidgetRef ref,
    InventoryItem item,
  ) => showModalBottomSheet<void>(
    context: context,
    isScrollControlled: true,
    showDragHandle: true,
    builder: (_) => StockMovementSheet(item: item),
  );

  @override
  ConsumerState<StockMovementSheet> createState() => _StockMovementSheetState();
}

class _StockMovementSheetState extends ConsumerState<StockMovementSheet> {
  StockMovementType _type = StockMovementType.incoming;
  final _qty = TextEditingController(text: '1');
  final _reason = TextEditingController();
  bool _busy = false;
  String? _error;

  @override
  void dispose() {
    _qty.dispose();
    _reason.dispose();
    super.dispose();
  }

  Future<void> _save() async {
    final qty = int.tryParse(_qty.text.trim());
    if (qty == null || qty == 0) {
      setState(() => _error = 'Enter a non-zero quantity.');
      return;
    }
    setState(() {
      _busy = true;
      _error = null;
    });
    final navigator = Navigator.of(context);
    try {
      await ref.read(inventoryActionsProvider).recordMovement(widget.item.id, {
        'type': _type.wire,
        'qty': qty,
        if (_reason.text.trim().isNotEmpty) 'reason': _reason.text.trim(),
      });
      navigator.pop();
    } on ApiException catch (e) {
      setState(() {
        _busy = false;
        _error = e.message;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: EdgeInsets.only(
        left: Sp.lg,
        right: Sp.lg,
        top: Sp.md,
        bottom: MediaQuery.viewInsetsOf(context).bottom + Sp.lg,
      ),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Text(
            'Move stock — ${widget.item.name}',
            style: Theme.of(context).textTheme.titleMedium,
          ),
          const SizedBox(height: 4),
          Text(
            'On hand: ${widget.item.currentQty} ${widget.item.unit}',
            style: AppTypography.body(
              size: 12.5,
              color: context.colors.mutedForeground,
            ),
          ),
          const SizedBox(height: Sp.md),
          DropdownButtonFormField<StockMovementType>(
            initialValue: _type,
            decoration: const InputDecoration(labelText: 'Type'),
            items: [
              for (final t in StockMovementType.values)
                DropdownMenuItem(value: t, child: Text(t.label)),
            ],
            onChanged: (v) => setState(() => _type = v ?? _type),
          ),
          const SizedBox(height: Sp.md),
          TextField(
            controller: _qty,
            decoration: InputDecoration(
              labelText: 'Quantity',
              helperText: _type == StockMovementType.adjust
                  ? 'A signed correction — use a minus for a reduction.'
                  : null,
            ),
            keyboardType: const TextInputType.numberWithOptions(signed: true),
          ),
          const SizedBox(height: Sp.md),
          TextField(
            controller: _reason,
            decoration: const InputDecoration(labelText: 'Reason (optional)'),
          ),
          if (_error != null) ...[
            const SizedBox(height: Sp.md),
            Text(
              _error!,
              style: TextStyle(color: Theme.of(context).colorScheme.error),
            ),
          ],
          const SizedBox(height: Sp.lg),
          FilledButton(
            onPressed: _busy ? null : _save,
            child: _busy
                ? const SizedBox(
                    height: 18,
                    width: 18,
                    child: CircularProgressIndicator(strokeWidth: 2),
                  )
                : const Text('Record movement'),
          ),
        ],
      ),
    );
  }
}
