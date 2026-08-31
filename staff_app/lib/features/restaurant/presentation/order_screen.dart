import 'package:flutter/material.dart';
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
import 'settle_sheet.dart';

/// One order, end to end: the running lines with their KOT status, the "add
/// items → send to kitchen" flow, marking a plated line served, and running
/// (then settling) the bill. Each action gates itself; a waiter sees Send and
/// Serve, a cashier sees Settle, a manager sees Void.
class OrderScreen extends ConsumerWidget {
  const OrderScreen({super.key, required this.orderId});

  final String orderId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final order = ref.watch(orderProvider(orderId));

    return Scaffold(
      appBar: AppBar(title: Text(order.value?.orderNumber ?? 'Order')),
      body: order.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (e, _) => ErrorState(
          error: e,
          onRetry: () => ref.invalidate(orderProvider(orderId)),
        ),
        data: (o) => o == null
            ? const EmptyState(
                title: 'Order not found',
                hint: 'It may have been settled or removed.',
                icon: Icons.receipt_long_outlined,
              )
            : _OrderBody(order: o),
      ),
    );
  }
}

class _OrderBody extends ConsumerWidget {
  const _OrderBody({required this.order});

  final RestaurantOrder order;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final c = context.colors;
    final canAddItems =
        order.status.isOpen && ref.watch(canProvider(P.orderUpdate));

    return Stack(
      children: [
        PageBody(
          onRefresh: () async => ref.invalidate(orderProvider(order.id)),
          children: [
            Row(
              children: [
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        order.where,
                        style: AppTypography.display(
                          size: 20,
                          color: c.foreground,
                        ),
                      ),
                      Text(
                        '${order.guestCount} guests · ${order.orderNumber}',
                        style: AppTypography.body(
                          size: 12.5,
                          color: c.mutedForeground,
                        ),
                      ),
                    ],
                  ),
                ),
                StatusBadge(tone: order.status.tone, label: order.status.label),
              ],
            ),
            gapSection,

            if (order.items.isEmpty)
              const EmptyState(
                title: 'Nothing ordered yet',
                hint: 'Add items and send them to the kitchen.',
                icon: Icons.restaurant_menu_outlined,
              )
            else
              Panel(
                title: 'Items',
                description: '${order.activeItemCount} on this order',
                child: Column(
                  children: [
                    for (final line in order.items)
                      _OrderLineRow(order: order, line: line),
                  ],
                ),
              ),
            gapMd,

            // Running total while the order is still open; the frozen bill once run.
            Panel(
              title: order.status.isOpen ? 'Running total' : 'Bill',
              child: order.status.isOpen
                  ? MoneyRow(
                      label: 'Subtotal (so far)',
                      value: order.runningSubtotalLabel,
                    )
                  : Column(
                      children: [
                        MoneyRow(label: 'Subtotal', value: order.subtotalLabel),
                        MoneyRow(label: 'Tax', value: order.taxLabel),
                        const SizedBox(height: 4),
                        MoneyRow(
                          label: 'Total',
                          value: order.totalLabel,
                          strong: true,
                        ),
                        if (order.paymentMethod != null) ...[
                          const SizedBox(height: 6),
                          Align(
                            alignment: Alignment.centerLeft,
                            child: StatusBadge(
                              tone: StatusTone.healthy,
                              label: 'Paid · ${order.paymentMethod!.label}',
                              dense: true,
                            ),
                          ),
                        ],
                      ],
                    ),
            ),
            const SizedBox(height: 96),
          ],
        ),

        if (canAddItems)
          Positioned(
            right: Sp.lg,
            bottom: Sp.lg,
            child: FloatingActionButton.extended(
              onPressed: () => _openMenu(context, ref, order),
              icon: const Icon(Icons.add),
              label: const Text('Add items'),
            ),
          ),

        Positioned(
          left: Sp.lg,
          right: canAddItems ? 92 : Sp.lg,
          bottom: Sp.lg,
          child: _OrderActions(order: order),
        ),
      ],
    );
  }

  Future<void> _openMenu(
    BuildContext context,
    WidgetRef ref,
    RestaurantOrder order,
  ) async {
    await showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      showDragHandle: true,
      constraints: BoxConstraints(
        maxHeight: MediaQuery.sizeOf(context).height * 0.92,
      ),
      builder: (_) => _MenuCartSheet(orderId: order.id),
    );
  }
}

class _OrderLineRow extends ConsumerWidget {
  const _OrderLineRow({required this.order, required this.line});

  final RestaurantOrder order;
  final OrderLine line;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final c = context.colors;
    final canKot = order.status.isOpen && ref.watch(canProvider(P.kotUpdate));
    final canCancel =
        order.status.isOpen && ref.watch(canProvider(P.orderUpdate));

    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 6),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            '${line.qty}×',
            style: AppTypography.numeric(
              size: 14,
              weight: FontWeight.w700,
              color: c.foreground,
            ),
          ),
          const SizedBox(width: Sp.sm),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  line.name,
                  style: AppTypography.body(
                    size: 13.5,
                    weight: FontWeight.w600,
                    color: line.kotStatus == KotStatus.cancelled
                        ? c.mutedForeground
                        : c.foreground,
                  ),
                ),
                if (line.notes != null)
                  Text(
                    line.notes!,
                    style: AppTypography.body(
                      size: 11.5,
                      color: c.mutedForeground,
                    ),
                  ),
                const SizedBox(height: 4),
                Row(
                  children: [
                    StatusBadge(
                      tone: line.kotStatus.tone,
                      label: line.kotStatus.label,
                      dense: true,
                    ),
                    const SizedBox(width: 8),
                    Text(
                      line.lineTotalLabel,
                      style: AppTypography.numeric(
                        size: 12,
                        color: c.mutedForeground,
                      ),
                    ),
                  ],
                ),
              ],
            ),
          ),
          // Waiter marks a plated line served.
          if (canKot && line.kotStatus.waiterCanServe)
            TextButton(
              onPressed: () => _move(context, ref, KotStatus.served),
              child: const Text('Serve'),
            ),
          // Cancel is allowed only while NEW.
          if (canCancel && line.kotStatus.canCancel)
            IconButton(
              tooltip: 'Cancel item',
              onPressed: () => _cancel(context, ref),
              icon: Icon(Icons.close, size: 18, color: c.mutedForeground),
            ),
        ],
      ),
    );
  }

  Future<void> _move(BuildContext context, WidgetRef ref, KotStatus to) async {
    final messenger = ScaffoldMessenger.of(context);
    try {
      await ref.read(restaurantActionsProvider).setKot(order.id, line.id, to);
    } on ApiException catch (e) {
      messenger.showSnackBar(
        SnackBar(content: Text(RestaurantErrors.friendly(e))),
      );
    }
  }

  Future<void> _cancel(BuildContext context, WidgetRef ref) async {
    final messenger = ScaffoldMessenger.of(context);
    try {
      await ref.read(restaurantActionsProvider).cancelItem(order.id, line.id);
    } on ApiException catch (e) {
      messenger.showSnackBar(
        SnackBar(content: Text(RestaurantErrors.friendly(e))),
      );
    }
  }
}

/// The bar of primary actions at the foot of the order — request bill, settle,
/// void — each behind its own gate.
class _OrderActions extends ConsumerWidget {
  const _OrderActions({required this.order});

  final RestaurantOrder order;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final children = <Widget>[];

    if (order.status.isOpen) {
      children.add(
        PermissionGate(
          permission: P.billGenerate,
          child: FilledButton.icon(
            onPressed: order.activeItems.isEmpty
                ? null
                : () => _bill(context, ref),
            icon: const Icon(Icons.receipt_long_outlined, size: 16),
            label: const Text('Request bill'),
          ),
        ),
      );
    }

    if (order.status.isBilled) {
      children.add(
        PermissionGate(
          permission: P.billSettle,
          child: FilledButton.icon(
            onPressed: () => SettleSheet.show(context, order),
            icon: const Icon(Icons.payments_outlined, size: 16),
            label: const Text('Settle'),
          ),
        ),
      );
    }

    if (order.status.isOpen || order.status.isBilled) {
      children.add(
        PermissionGate(
          permission: P.orderVoid,
          child: OutlinedButton.icon(
            onPressed: () => _void(context, ref),
            style: OutlinedButton.styleFrom(
              foregroundColor: context.colors.destructive,
            ),
            icon: const Icon(Icons.block_outlined, size: 16),
            label: const Text('Void'),
          ),
        ),
      );
    }

    if (children.isEmpty) return const SizedBox.shrink();
    return Wrap(spacing: Sp.sm, runSpacing: Sp.sm, children: children);
  }

  Future<void> _bill(BuildContext context, WidgetRef ref) async {
    final messenger = ScaffoldMessenger.of(context);
    try {
      await ref.read(restaurantActionsProvider).bill(order.id);
      messenger.showSnackBar(
        const SnackBar(content: Text('Bill ready to settle.')),
      );
    } on ApiException catch (e) {
      messenger.showSnackBar(
        SnackBar(content: Text(RestaurantErrors.friendly(e))),
      );
    }
  }

  Future<void> _void(BuildContext context, WidgetRef ref) async {
    final reason = await _askReason(context);
    if (reason == null || !context.mounted) return;
    final messenger = ScaffoldMessenger.of(context);
    try {
      await ref.read(restaurantActionsProvider).cancelOrder(order.id, reason);
      messenger.showSnackBar(const SnackBar(content: Text('Order voided.')));
    } on ApiException catch (e) {
      messenger.showSnackBar(
        SnackBar(content: Text(RestaurantErrors.friendly(e))),
      );
    }
  }
}

Future<String?> _askReason(BuildContext context) {
  final controller = TextEditingController();
  return showDialog<String>(
    context: context,
    builder: (context) => AlertDialog(
      title: const Text('Void this order?'),
      content: TextField(
        controller: controller,
        autofocus: true,
        textCapitalization: TextCapitalization.sentences,
        decoration: const InputDecoration(
          labelText: 'Reason',
          hintText: 'Why the order is being voided.',
        ),
      ),
      actions: [
        TextButton(
          onPressed: () => Navigator.of(context).pop(),
          child: const Text('Keep order'),
        ),
        FilledButton(
          onPressed: () {
            final text = controller.text.trim();
            if (text.length >= 2) Navigator.of(context).pop(text);
          },
          style: FilledButton.styleFrom(
            backgroundColor: context.colors.destructive,
          ),
          child: const Text('Void'),
        ),
      ],
    ),
  );
}

/// The menu picker with a staged cart. Category tabs, veg badge and price; tap
/// to stage a line, adjust qty and notes, then "Send to kitchen" in one batch.
class _MenuCartSheet extends ConsumerStatefulWidget {
  const _MenuCartSheet({required this.orderId});

  final String orderId;

  @override
  ConsumerState<_MenuCartSheet> createState() => _MenuCartSheetState();
}

class _MenuCartSheetState extends ConsumerState<_MenuCartSheet> {
  final Map<String, CartLine> _cart = {};
  bool _busy = false;
  String? _error;

  int get _cartCount => _cart.values.fold(0, (sum, l) => sum + l.qty);
  int get _cartTotal =>
      _cart.values.fold(0, (sum, l) => sum + l.lineTotalPaise);

  void _add(MenuItem item) {
    setState(() {
      final existing = _cart[item.id];
      _cart[item.id] = existing == null
          ? CartLine(item: item, qty: 1)
          : existing.copyWith(qty: existing.qty + 1);
    });
  }

  void _remove(MenuItem item) {
    setState(() {
      final existing = _cart[item.id];
      if (existing == null) return;
      if (existing.qty <= 1) {
        _cart.remove(item.id);
      } else {
        _cart[item.id] = existing.copyWith(qty: existing.qty - 1);
      }
    });
  }

  Future<void> _send() async {
    if (_cart.isEmpty) return;
    setState(() {
      _busy = true;
      _error = null;
    });
    final navigator = Navigator.of(context);
    final messenger = ScaffoldMessenger.of(context);
    try {
      await ref
          .read(restaurantActionsProvider)
          .addItems(widget.orderId, _cart.values.toList());
      navigator.pop();
      messenger.showSnackBar(
        SnackBar(content: Text('Sent $_cartCount items to the kitchen.')),
      );
    } on ApiException catch (e) {
      if (!mounted) return;
      setState(() {
        _busy = false;
        _error = RestaurantErrors.friendly(e);
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    final menu = ref.watch(menuProvider);

    return SafeArea(
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: Sp.lg),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Text(
              'Add to order',
              style: AppTypography.display(size: 18, color: c.foreground),
            ),
            const SizedBox(height: Sp.sm),
            Flexible(
              child: menu.when(
                loading: () => const ListSkeleton(rows: 3, height: 60),
                error: (e, _) => ErrorState(error: e),
                data: (categories) {
                  final active = categories
                      .map(
                        (cat) => MenuCategory(
                          id: cat.id,
                          name: cat.name,
                          sortOrder: cat.sortOrder,
                          items: cat.items
                              .where((i) => i.status.isOrderable)
                              .toList(),
                        ),
                      )
                      .where((cat) => cat.items.isNotEmpty)
                      .toList();
                  if (active.isEmpty) {
                    return const EmptyState(
                      title: 'No dishes available',
                      hint: 'The menu is empty or everything is 86’d.',
                      icon: Icons.restaurant_menu_outlined,
                    );
                  }
                  return ListView(
                    shrinkWrap: true,
                    children: [
                      for (final cat in active) ...[
                        Padding(
                          padding: const EdgeInsets.only(top: Sp.md, bottom: 4),
                          child: LabelXs(cat.name),
                        ),
                        for (final item in cat.items)
                          _MenuPickRow(
                            item: item,
                            qty: _cart[item.id]?.qty ?? 0,
                            onAdd: () => _add(item),
                            onRemove: () => _remove(item),
                          ),
                      ],
                      const SizedBox(height: Sp.md),
                    ],
                  );
                },
              ),
            ),
            if (_error != null) ...[
              const SizedBox(height: Sp.sm),
              RestaurantErrorNote(message: _error!),
            ],
            const SizedBox(height: Sp.sm),
            SizedBox(
              width: double.infinity,
              child: FilledButton(
                onPressed: _cart.isEmpty || _busy ? null : _send,
                child: Text(
                  _cart.isEmpty
                      ? 'Send to kitchen'
                      : 'Send $_cartCount to kitchen · ${formatPaise(_cartTotal)}',
                ),
              ),
            ),
            const SizedBox(height: Sp.md),
          ],
        ),
      ),
    );
  }
}

class _MenuPickRow extends StatelessWidget {
  const _MenuPickRow({
    required this.item,
    required this.qty,
    required this.onAdd,
    required this.onRemove,
  });

  final MenuItem item;
  final int qty;
  final VoidCallback onAdd;
  final VoidCallback onRemove;

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
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
                    color: c.foreground,
                  ),
                ),
                Text(
                  item.priceLabel,
                  style: AppTypography.numeric(
                    size: 12,
                    color: c.mutedForeground,
                  ),
                ),
              ],
            ),
          ),
          if (qty == 0)
            OutlinedButton(onPressed: onAdd, child: const Text('Add'))
          else
            Row(
              children: [
                IconButton(
                  onPressed: onRemove,
                  icon: const Icon(Icons.remove_circle_outline, size: 22),
                ),
                Text(
                  '$qty',
                  style: AppTypography.numeric(
                    size: 15,
                    weight: FontWeight.w700,
                    color: c.foreground,
                  ),
                ),
                IconButton(
                  onPressed: onAdd,
                  icon: const Icon(Icons.add_circle_outline, size: 22),
                ),
              ],
            ),
        ],
      ),
    );
  }
}
