import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/networking/api_exception.dart';
import '../../../core/permissions/permission_gate.dart';
import '../../../core/permissions/permission_keys.dart';
import '../../../core/routing/routes.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/theme/app_spacing.dart';
import '../../../core/theme/app_typography.dart';
import '../../../core/widgets/primitives.dart';
import '../../../core/widgets/states.dart';
import '../../../core/widgets/status_badge.dart';
import '../application/inventory_controllers.dart';
import '../data/inventory_models.dart';

/// The purchase-order list, with the way into raising a new one.
class PurchaseOrdersScreen extends ConsumerWidget {
  const PurchaseOrdersScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final pos = ref.watch(purchaseOrdersProvider);
    return Scaffold(
      floatingActionButton: ref.hasPermission(P.poCreate)
          ? FloatingActionButton.extended(
              onPressed: () => _PoFormSheet.show(context, ref),
              icon: const Icon(Icons.add),
              label: const Text('New PO'),
            )
          : null,
      body: PageBody(
        onRefresh: () async => ref.invalidate(purchaseOrdersProvider),
        children: [
          const PageHeader(
            title: 'Purchase orders',
            subtitle: 'Raise, send and receive stock orders.',
          ),
          gapSection,
          pos.when(
            loading: () => const ListSkeleton(rows: 5),
            error: (e, _) => ErrorState(
              error: e,
              onRetry: () => ref.invalidate(purchaseOrdersProvider),
            ),
            data: (list) => list.isEmpty
                ? const EmptyState(
                    title: 'No purchase orders',
                    hint: 'Raise a PO to restock from a supplier.',
                    icon: Icons.receipt_long_outlined,
                  )
                : Column(
                    children: [
                      for (final p in list)
                        Padding(
                          padding: const EdgeInsets.only(bottom: Sp.md),
                          child: SoftCard(
                            onTap: () => context.go(Routes.inventoryPo(p.id)),
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Row(
                                  children: [
                                    Expanded(
                                      child: Text(
                                        p.poNumber,
                                        style: AppTypography.body(
                                          size: 14,
                                          weight: FontWeight.w700,
                                          color: context.colors.foreground,
                                        ),
                                      ),
                                    ),
                                    StatusBadge(
                                      tone: p.status.tone,
                                      label: p.status.label,
                                      dense: true,
                                    ),
                                  ],
                                ),
                                const SizedBox(height: 4),
                                Text(
                                  '${p.supplierName ?? 'No supplier'} · ${p.lines.length} line(s) · ${p.totalLabel}',
                                  style: AppTypography.body(
                                    size: 12.5,
                                    color: context.colors.mutedForeground,
                                  ),
                                ),
                              ],
                            ),
                          ),
                        ),
                    ],
                  ),
          ),
        ],
      ),
    );
  }
}

class _PoLineDraft {
  _PoLineDraft();
  InventoryItem? item;
  int qty = 1;
  double priceRupees = 0;
}

class _PoFormSheet extends ConsumerStatefulWidget {
  const _PoFormSheet();

  static Future<void> show(BuildContext context, WidgetRef ref) =>
      showModalBottomSheet<void>(
        context: context,
        isScrollControlled: true,
        showDragHandle: true,
        constraints: BoxConstraints(
          maxHeight: MediaQuery.sizeOf(context).height * 0.92,
        ),
        builder: (_) => const _PoFormSheet(),
      );

  @override
  ConsumerState<_PoFormSheet> createState() => _PoFormSheetState();
}

class _PoFormSheetState extends ConsumerState<_PoFormSheet> {
  final _supplier = TextEditingController();
  final List<_PoLineDraft> _lines = [_PoLineDraft()];
  bool _busy = false;
  String? _error;

  @override
  void dispose() {
    _supplier.dispose();
    super.dispose();
  }

  int get _totalPaise => _lines
      .where((l) => l.item != null)
      .fold(0, (s, l) => s + (l.qty * (l.priceRupees * 100).round()));

  Future<void> _save() async {
    final ready = _lines.where((l) => l.item != null && l.qty > 0).toList();
    if (ready.isEmpty) {
      setState(() => _error = 'Add at least one line with an item.');
      return;
    }
    setState(() {
      _busy = true;
      _error = null;
    });
    final body = <String, dynamic>{
      if (_supplier.text.trim().isNotEmpty)
        'supplierName': _supplier.text.trim(),
      'lines': [
        for (final l in ready)
          {
            'itemId': l.item!.id,
            'qty': l.qty,
            'unitPricePaise': (l.priceRupees * 100).round(),
          },
      ],
    };
    final navigator = Navigator.of(context);
    try {
      await ref.read(inventoryActionsProvider).createPo(body);
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
    final items = ref.watch(itemsProvider);
    return Padding(
      padding: EdgeInsets.only(
        left: Sp.lg,
        right: Sp.lg,
        top: Sp.md,
        bottom: MediaQuery.viewInsetsOf(context).bottom + Sp.lg,
      ),
      child: SingleChildScrollView(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Text(
              'New purchase order',
              style: Theme.of(context).textTheme.titleMedium,
            ),
            const SizedBox(height: Sp.md),
            TextField(
              controller: _supplier,
              decoration: const InputDecoration(
                labelText: 'Supplier (optional)',
              ),
            ),
            const SizedBox(height: Sp.md),
            items.when(
              loading: () => const ListSkeleton(rows: 1, height: 48),
              error: (e, _) => Text(
                'Could not load items: ${e is ApiException ? e.message : e}',
              ),
              data: (available) {
                if (available.isEmpty) {
                  return const EmptyState(
                    title: 'No items to order',
                    hint: 'Add inventory items first.',
                    icon: Icons.inventory_2_outlined,
                  );
                }
                return Column(
                  children: [
                    for (var i = 0; i < _lines.length; i++)
                      _lineRow(context, i, available),
                    Align(
                      alignment: Alignment.centerLeft,
                      child: TextButton.icon(
                        onPressed: () =>
                            setState(() => _lines.add(_PoLineDraft())),
                        icon: const Icon(Icons.add, size: 16),
                        label: const Text('Add line'),
                      ),
                    ),
                  ],
                );
              },
            ),
            const Divider(),
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Text(
                  'Total',
                  style: AppTypography.body(
                    size: 14,
                    weight: FontWeight.w700,
                    color: context.colors.foreground,
                  ),
                ),
                Text(
                  formatPaise(_totalPaise),
                  style: AppTypography.numeric(
                    size: 14,
                    weight: FontWeight.w700,
                    color: context.colors.foreground,
                  ),
                ),
              ],
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
                  : const Text('Create as draft'),
            ),
          ],
        ),
      ),
    );
  }

  Widget _lineRow(
    BuildContext context,
    int index,
    List<InventoryItem> available,
  ) {
    final l = _lines[index];
    return Padding(
      padding: const EdgeInsets.only(bottom: Sp.sm),
      child: Column(
        children: [
          DropdownButtonFormField<InventoryItem>(
            initialValue: l.item,
            isExpanded: true,
            decoration: const InputDecoration(labelText: 'Item'),
            items: [
              for (final it in available)
                DropdownMenuItem(
                  value: it,
                  child: Text(
                    '${it.name} (${it.sku})',
                    overflow: TextOverflow.ellipsis,
                  ),
                ),
            ],
            onChanged: (v) => setState(() {
              l.item = v;
              if (v != null && l.priceRupees == 0)
                l.priceRupees = v.unitCostPaise / 100;
            }),
          ),
          const SizedBox(height: Sp.sm),
          Row(
            children: [
              Expanded(
                child: TextFormField(
                  initialValue: l.qty.toString(),
                  decoration: const InputDecoration(labelText: 'Qty'),
                  keyboardType: TextInputType.number,
                  onChanged: (v) =>
                      setState(() => l.qty = int.tryParse(v) ?? 0),
                ),
              ),
              const SizedBox(width: Sp.md),
              Expanded(
                child: TextFormField(
                  initialValue: l.priceRupees == 0
                      ? ''
                      : l.priceRupees.toStringAsFixed(0),
                  decoration: const InputDecoration(
                    labelText: 'Unit ₹',
                    prefixText: '₹ ',
                  ),
                  keyboardType: TextInputType.number,
                  onChanged: (v) =>
                      setState(() => l.priceRupees = double.tryParse(v) ?? 0),
                ),
              ),
              if (_lines.length > 1)
                IconButton(
                  onPressed: () => setState(() => _lines.removeAt(index)),
                  icon: const Icon(Icons.remove_circle_outline),
                ),
            ],
          ),
        ],
      ),
    );
  }
}
