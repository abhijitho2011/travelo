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

/// A purchase order with its lines, and the actions its status allows: send a
/// draft, cancel, or receive a sent order into stock.
class PurchaseOrderDetailScreen extends ConsumerWidget {
  const PurchaseOrderDetailScreen({super.key, required this.poId});

  final String poId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final po = ref.watch(purchaseOrderProvider(poId));
    return Scaffold(
      appBar: AppBar(title: const Text('Purchase order')),
      body: po.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (e, _) => ErrorState(error: e, onRetry: () => ref.invalidate(purchaseOrderProvider(poId))),
        data: (p) => p == null
            ? const EmptyState(title: 'Purchase order not found', icon: Icons.help_outline)
            : _PoDetail(po: p),
      ),
    );
  }
}

class _PoDetail extends ConsumerStatefulWidget {
  const _PoDetail({required this.po});
  final PurchaseOrder po;

  @override
  ConsumerState<_PoDetail> createState() => _PoDetailState();
}

class _PoDetailState extends ConsumerState<_PoDetail> {
  bool _busy = false;

  Future<void> _run(Future<void> Function() op) async {
    setState(() => _busy = true);
    final messenger = ScaffoldMessenger.of(context);
    try {
      await op();
    } on ApiException catch (e) {
      messenger.showSnackBar(SnackBar(content: Text(e.message)));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    final p = widget.po;
    final actions = ref.read(inventoryActionsProvider);
    return PageBody(
      children: [
        Row(
          children: [
            Expanded(
              child: Text(p.poNumber, style: AppTypography.display(size: 22, color: c.foreground)),
            ),
            StatusBadge(tone: p.status.tone, label: p.status.label),
          ],
        ),
        if (p.supplierName != null) ...[
          const SizedBox(height: 4),
          Text(p.supplierName!, style: AppTypography.body(size: 13.5, color: c.mutedForeground)),
        ],
        gapMd,
        Panel(
          title: 'Lines',
          child: Column(
            children: [
              for (final line in p.lines)
                Padding(
                  padding: const EdgeInsets.symmetric(vertical: 5),
                  child: Row(
                    children: [
                      Expanded(
                        child: Text(
                          '${line.nameSnapshot} · ${line.qty} ${line.unitSnapshot}',
                          style: AppTypography.body(size: 13, color: c.foreground),
                        ),
                      ),
                      Text(
                        formatPaise(line.lineTotalPaise),
                        style: AppTypography.numeric(size: 13, weight: FontWeight.w600, color: c.foreground),
                      ),
                    ],
                  ),
                ),
              const Divider(height: 18),
              Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  Text('Total', style: AppTypography.body(size: 14, weight: FontWeight.w700, color: c.foreground)),
                  Text(p.totalLabel, style: AppTypography.numeric(size: 14, weight: FontWeight.w700, color: c.foreground)),
                ],
              ),
            ],
          ),
        ),
        gapSection,
        if (_busy) const Center(child: CircularProgressIndicator()) else ...[
          if (p.status == PurchaseOrderStatus.draft && ref.hasPermission(P.poUpdate))
            FilledButton.icon(
              onPressed: () => _run(() => actions.setPoStatus(p.id, PurchaseOrderStatus.sent)),
              icon: const Icon(Icons.send_outlined),
              label: const Text('Send to supplier'),
            ),
          if (p.status.canReceive && ref.hasPermission(P.poReceive)) ...[
            const SizedBox(height: Sp.sm),
            FilledButton.icon(
              onPressed: () => _run(() => actions.receivePo(p.id)),
              icon: const Icon(Icons.inventory_outlined),
              label: const Text('Receive into stock'),
            ),
          ],
          if ((p.status == PurchaseOrderStatus.draft || p.status == PurchaseOrderStatus.sent) &&
              ref.hasPermission(P.poUpdate)) ...[
            const SizedBox(height: Sp.sm),
            OutlinedButton.icon(
              onPressed: () => _run(() => actions.setPoStatus(p.id, PurchaseOrderStatus.cancelled)),
              icon: Icon(Icons.cancel_outlined, color: c.critical),
              label: const Text('Cancel PO'),
            ),
          ],
          if (p.status == PurchaseOrderStatus.received)
            const EmptyState(
              title: 'Received',
              hint: 'This order has been received into stock.',
              icon: Icons.check_circle_outline,
            ),
        ],
      ],
    );
  }
}
