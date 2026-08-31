import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/permissions/permission_gate.dart';
import '../../../core/permissions/permission_keys.dart';
import '../../../core/providers.dart';
import '../../../core/routing/routes.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/theme/app_spacing.dart';
import '../../../core/theme/app_typography.dart';
import '../../../core/widgets/primitives.dart';
import '../../../core/widgets/states.dart';
import '../application/inventory_controllers.dart';
import '../data/inventory_models.dart';

/// The store dashboard: stock value, low-stock and pending POs, with the way
/// into items, movements and purchase orders.
class InventoryScreen extends ConsumerWidget {
  const InventoryScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final summary = ref.watch(inventorySummaryProvider);
    final lowStock = ref.watch(itemsProvider);
    final session = ref.watch(sessionProvider);

    return PageBody(
      onRefresh: () async {
        ref.invalidate(inventorySummaryProvider);
        ref.invalidate(itemsProvider);
      },
      children: [
        PageHeader(
          eyebrow: [
            'Inventory',
            session?.hotel?.name,
          ].where((s) => s != null && s.isNotEmpty).join(' · '),
          title: 'Inventory & Store',
          subtitle: 'Stock on hand, reorders and purchasing.',
          actions: [
            OutlinedButton.icon(
              onPressed: () => context.go(Routes.inventoryItems),
              icon: const Icon(Icons.inventory_2_outlined, size: 16),
              label: const Text('Items'),
            ),
            PermissionGate(
              permission: P.poRead,
              child: OutlinedButton.icon(
                onPressed: () => context.go(Routes.inventoryPurchaseOrders),
                icon: const Icon(Icons.receipt_long_outlined, size: 16),
                label: const Text('Purchase orders'),
              ),
            ),
            PermissionGate(
              permission: P.stockRead,
              child: OutlinedButton.icon(
                onPressed: () => context.go(Routes.inventoryMovements),
                icon: const Icon(Icons.swap_vert, size: 16),
                label: const Text('Movements'),
              ),
            ),
            PermissionGate(
              permission: P.supplierRead,
              child: OutlinedButton.icon(
                onPressed: () => context.go(Routes.inventorySuppliers),
                icon: const Icon(Icons.local_shipping_outlined, size: 16),
                label: const Text('Suppliers'),
              ),
            ),
          ],
        ),
        gapSection,
        summary.when(
          loading: () => const KpiSkeleton(count: 4),
          error: (e, _) => ErrorState(
            error: e,
            onRetry: () => ref.invalidate(inventorySummaryProvider),
          ),
          data: (s) => KpiGrid(
            children: [
              KpiCard(
                label: 'Stock value',
                value: formatPaise(s?.stockValuePaise ?? 0),
              ),
              KpiCard(label: 'Items', value: '${s?.itemCount ?? 0}'),
              KpiCard(
                label: 'Low stock',
                value: '${s?.lowStockCount ?? 0}',
                tone: (s?.lowStockCount ?? 0) > 0
                    ? context.colors.warning
                    : null,
              ),
              KpiCard(label: 'Pending POs', value: '${s?.pendingPoCount ?? 0}'),
            ],
          ),
        ),
        gapSection,
        SectionHeader(title: 'Low stock', icon: Icons.warning_amber_outlined),
        lowStock.when(
          loading: () => const ListSkeleton(rows: 3),
          error: (_, _) => const SizedBox.shrink(),
          data: (list) {
            final low = list.where((i) => i.lowStock).toList();
            if (low.isEmpty) {
              return const EmptyState(
                title: 'Everything is stocked',
                hint: 'No item is at or below its reorder level.',
                icon: Icons.check_circle_outline,
              );
            }
            return Column(
              children: [
                for (final i in low)
                  Padding(
                    padding: const EdgeInsets.only(bottom: Sp.sm),
                    child: SoftCard(
                      onTap: () => context.go(Routes.inventoryItems),
                      padding: const EdgeInsets.all(12),
                      child: Row(
                        children: [
                          Expanded(
                            child: Text(
                              i.name,
                              style: AppTypography.body(
                                size: 13.5,
                                weight: FontWeight.w600,
                                color: context.colors.foreground,
                              ),
                            ),
                          ),
                          Text(
                            '${i.currentQty} / ${i.reorderLevel} ${i.unit}',
                            style: AppTypography.numeric(
                              size: 12.5,
                              weight: FontWeight.w700,
                              color: context.colors.warning,
                            ),
                          ),
                        ],
                      ),
                    ),
                  ),
              ],
            );
          },
        ),
      ],
    );
  }
}
