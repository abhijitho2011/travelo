import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/networking/api_exception.dart';
import '../../../core/permissions/permission_gate.dart';
import '../../../core/permissions/permission_keys.dart';
import '../../../core/utils/formatting.dart';
import '../../../core/widgets/cards.dart';
import '../../../core/widgets/primitives.dart';
import '../../../core/widgets/states.dart';
import '../../../core/widgets/status_badge.dart';
import '../application/spa_controllers.dart';
import '../data/spa_models.dart';
import '../data/spa_repository.dart';

/// The Spa Accounts desk: the day's revenue, the bills, and the settle / refund
/// actions that close them.
class SpaBookingsScreen extends ConsumerWidget {
  const SpaBookingsScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final bills = ref.watch(spaBillsProvider);
    final revenue = ref.watch(spaRevenueProvider);

    return PageBody(
      onRefresh: () async {
        ref.invalidate(spaBillsProvider);
        ref.invalidate(spaRevenueProvider);
      },
      children: [
        const PageHeader(
          eyebrow: 'Spa',
          title: 'Spa billing',
          subtitle: 'Settle completed treatments and record refunds.',
        ),
        gapSection,
        revenue.when(
          loading: () => const KpiSkeleton(count: 2),
          error: (_, _) => const SizedBox.shrink(),
          data: (r) => r == null
              ? const SizedBox.shrink()
              : Padding(
                  padding: const EdgeInsets.only(bottom: 20),
                  child: KpiGrid(
                    children: [
                      KpiCard(label: "Today's revenue", value: r.revenueLabel),
                      KpiCard(label: 'Bills settled', value: Fmt.count(r.paidCount)),
                    ],
                  ),
                ),
        ),
        bills.when(
          loading: () => const ListSkeleton(rows: 4, height: 76),
          error: (e, _) => ErrorState(error: e, onRetry: () => ref.invalidate(spaBillsProvider)),
          data: (list) {
            if (list.isEmpty) {
              return const EmptyState(
                title: 'No bills yet',
                hint: 'A bill appears once a treatment is completed and raised.',
                icon: Icons.receipt_long_outlined,
              );
            }
            return Panel(
              title: 'Bills',
              description: '${list.length} total',
              padBody: false,
              child: Column(
                children: [
                  for (var i = 0; i < list.length; i++) ...[
                    if (i > 0) const RowDivider(),
                    _BillRow(bill: list[i]),
                  ],
                ],
              ),
            );
          },
        ),
      ],
    );
  }
}

class _BillRow extends ConsumerStatefulWidget {
  const _BillRow({required this.bill});

  final SpaBill bill;

  @override
  ConsumerState<_BillRow> createState() => _BillRowState();
}

class _BillRowState extends ConsumerState<_BillRow> {
  bool _busy = false;

  Future<void> _run(Future<void> Function() action) async {
    setState(() => _busy = true);
    final messenger = ScaffoldMessenger.of(context);
    try {
      await action();
      ref.invalidate(spaBillsProvider);
      ref.invalidate(spaRevenueProvider);
    } on ApiException catch (e) {
      messenger.showSnackBar(SnackBar(content: Text(e.message)));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final b = widget.bill;
    return DataRow2(
      title: b.totalLabel,
      subtitle: [
        if (b.paymentMethod != null) b.paymentMethod!.label,
        if (b.refundReason != null) 'Refund: ${b.refundReason}',
      ].join(' · '),
      badge: StatusBadge(tone: b.status.tone, label: b.status.label, dense: true),
      trailing: _busy
          ? const SizedBox(height: 18, width: 18, child: CircularProgressIndicator(strokeWidth: 2))
          : Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                if (b.status == SpaBillStatus.unpaid)
                  PermissionGate(
                    permission: P.spaBillSettle,
                    child: FilledButton(
                      onPressed: () => _settle(b),
                      child: const Text('Settle'),
                    ),
                  ),
                if (b.status == SpaBillStatus.paid)
                  PermissionGate(
                    permission: P.spaBillRefund,
                    child: TextButton(
                      onPressed: () => _refund(b),
                      child: const Text('Refund'),
                    ),
                  ),
              ],
            ),
    );
  }

  Future<void> _settle(SpaBill b) async {
    final method = await showModalBottomSheet<SpaPaymentMethod>(
      context: context,
      builder: (ctx) => SafeArea(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const Padding(
              padding: EdgeInsets.all(16),
              child: Text('Payment method'),
            ),
            for (final m in SpaPaymentMethod.values)
              ListTile(
                title: Text(m.label),
                onTap: () => Navigator.pop(ctx, m),
              ),
          ],
        ),
      ),
    );
    if (method == null) return;
    String? reservationId;
    if (method == SpaPaymentMethod.roomCharge) {
      reservationId = await _promptReservation();
      if (reservationId == null || reservationId.isEmpty) return;
    }
    await _run(() =>
        ref.read(spaRepositoryProvider).settleBill(b.id, method, reservationId: reservationId));
  }

  Future<void> _refund(SpaBill b) async {
    final controller = TextEditingController();
    final reason = await showDialog<String>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Record refund'),
        content: TextField(
          controller: controller,
          decoration: const InputDecoration(labelText: 'Reason'),
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx), child: const Text('Cancel')),
          FilledButton(
            onPressed: () => Navigator.pop(ctx, controller.text.trim()),
            child: const Text('Refund'),
          ),
        ],
      ),
    );
    if (reason != null && reason.isNotEmpty) {
      await _run(() => ref.read(spaRepositoryProvider).refundBill(b.id, reason));
    }
  }

  Future<String?> _promptReservation() {
    final controller = TextEditingController();
    return showDialog<String>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Room charge'),
        content: TextField(
          controller: controller,
          decoration: const InputDecoration(
            labelText: 'In-house reservation id',
            helperText: 'Must be a checked-in guest at this property',
          ),
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx), child: const Text('Cancel')),
          FilledButton(
            onPressed: () => Navigator.pop(ctx, controller.text.trim()),
            child: const Text('Charge room'),
          ),
        ],
      ),
    );
  }
}
