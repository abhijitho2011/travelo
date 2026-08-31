import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/networking/api_exception.dart';
import '../../../core/permissions/permission_gate.dart';
import '../../../core/permissions/permission_keys.dart';
import '../../../core/providers.dart';
import '../../../core/routing/routes.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/theme/app_spacing.dart';
import '../../../core/theme/app_typography.dart';
import '../../../core/widgets/primitives.dart';
import '../../../core/widgets/states.dart';
import '../../../core/widgets/status_badge.dart';
import '../application/restaurant_controllers.dart';
import '../data/restaurant_models.dart';
import '../data/restaurant_repository.dart';

/// The waiter's home: the floor as a grid of tables, colour-coded by status.
///
/// Tap an OPEN table to seat guests and start an order; tap a busy table to
/// jump straight into its running order. No role check anywhere below — the
/// "Send to kitchen", "Serve" and "Request bill" controls each gate themselves
/// on the order screen.
class MyTablesScreen extends ConsumerWidget {
  const MyTablesScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final tables = ref.watch(tablesProvider);
    final session = ref.watch(sessionProvider);

    return PageBody(
      onRefresh: () async {
        ref.invalidate(tablesProvider);
        ref.invalidate(ordersProvider);
      },
      children: [
        PageHeader(
          eyebrow: [
            'Restaurant',
            session?.hotel?.name,
          ].where((s) => s != null && s.isNotEmpty).join(' · '),
          title: 'My tables',
          subtitle: 'Tap a table to seat guests or open its running order.',
          actions: [
            PermissionGate(
              permission: P.orderCreate,
              child: OutlinedButton.icon(
                onPressed: () => _startTakeaway(context, ref),
                icon: const Icon(Icons.takeout_dining_outlined, size: 16),
                label: const Text('Takeaway'),
              ),
            ),
          ],
        ),
        gapSection,

        tables.when(
          loading: () => const ListSkeleton(rows: 2, height: 120),
          error: (e, _) => ErrorState(
            error: e,
            onRetry: () => ref.invalidate(tablesProvider),
          ),
          data: (list) => list.isEmpty
              ? const EmptyState(
                  title: 'No tables yet',
                  hint:
                      'A manager sets up the floor. Once tables exist they show '
                      'up here for you to work.',
                  icon: Icons.table_restaurant_outlined,
                )
              : _TableGrid(tables: list),
        ),
      ],
    );
  }

  Future<void> _startTakeaway(BuildContext context, WidgetRef ref) async {
    final guests = await _askGuestCount(context, isTakeaway: true);
    if (guests == null || !context.mounted) return;
    await _createAndOpen(context, ref, tableId: null, guestCount: guests);
  }
}

class _TableGrid extends StatelessWidget {
  const _TableGrid({required this.tables});

  final List<RestaurantTable> tables;

  @override
  Widget build(BuildContext context) {
    return LayoutBuilder(
      builder: (context, constraints) {
        const spacing = Sp.sm;
        final columns = (constraints.maxWidth / 150).floor().clamp(2, 6);
        final width =
            (constraints.maxWidth - spacing * (columns - 1)) / columns;
        return Wrap(
          spacing: spacing,
          runSpacing: spacing,
          children: [
            for (final t in tables)
              SizedBox(
                width: width,
                child: _TableCard(table: t),
              ),
          ],
        );
      },
    );
  }
}

class _TableCard extends ConsumerWidget {
  const _TableCard({required this.table});

  final RestaurantTable table;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final c = context.colors;
    final tint = table.status.tone.color(c);
    final busy = table.status != RestaurantTableStatus.open;

    return SoftCard(
      onTap: () => _tap(context, ref),
      accent: busy ? tint : null,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Icon(Icons.table_restaurant_outlined, size: 18, color: tint),
              const Spacer(),
              StatusDot(tone: table.status.tone),
            ],
          ),
          const SizedBox(height: Sp.sm),
          Text(
            table.name,
            style: AppTypography.display(size: 18, color: c.foreground),
          ),
          Text(
            '${table.seats} seats',
            style: AppTypography.body(size: 11.5, color: c.mutedForeground),
          ),
          const SizedBox(height: Sp.sm),
          StatusBadge(
            tone: table.status.tone,
            label: table.status.label,
            dense: true,
          ),
        ],
      ),
    );
  }

  Future<void> _tap(BuildContext context, WidgetRef ref) async {
    if (!ref.read(permissionsProvider).has(P.orderCreate) &&
        !ref.read(permissionsProvider).has(P.orderRead)) {
      return;
    }
    if (table.status == RestaurantTableStatus.blocked) {
      ScaffoldMessenger.of(
        context,
      ).showSnackBar(SnackBar(content: Text('${table.name} is blocked.')));
      return;
    }
    if (table.status == RestaurantTableStatus.open) {
      final guests = await _askGuestCount(context);
      if (guests == null || !context.mounted) return;
      await _createAndOpen(context, ref, tableId: table.id, guestCount: guests);
      return;
    }
    // Busy table — jump into its live order.
    final messenger = ScaffoldMessenger.of(context);
    final router = GoRouter.of(context);
    try {
      final orders = await ref
          .read(restaurantRepositoryProvider)
          .orders(tableId: table.id);
      final live = orders
          .where((o) => o.status.isOpen || o.status.isBilled)
          .toList();
      if (live.isEmpty) {
        messenger.showSnackBar(
          SnackBar(content: Text('No open order on ${table.name}.')),
        );
        return;
      }
      router.go(Routes.restaurantOrder(live.first.id));
    } on ApiException catch (e) {
      messenger.showSnackBar(
        SnackBar(content: Text(RestaurantErrors.friendly(e))),
      );
    }
  }
}

/// Ask how many are being seated. Returns null on cancel.
Future<int?> _askGuestCount(BuildContext context, {bool isTakeaway = false}) {
  return showModalBottomSheet<int>(
    context: context,
    showDragHandle: true,
    builder: (context) => _GuestCountSheet(isTakeaway: isTakeaway),
  );
}

class _GuestCountSheet extends StatefulWidget {
  const _GuestCountSheet({required this.isTakeaway});

  final bool isTakeaway;

  @override
  State<_GuestCountSheet> createState() => _GuestCountSheetState();
}

class _GuestCountSheetState extends State<_GuestCountSheet> {
  int _count = 2;

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    return SafeArea(
      child: Padding(
        padding: const EdgeInsets.fromLTRB(Sp.lg, 0, Sp.lg, Sp.lg),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Text(
              widget.isTakeaway ? 'Takeaway order' : 'How many guests?',
              style: AppTypography.display(size: 18, color: c.foreground),
            ),
            const SizedBox(height: Sp.lg),
            Row(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                IconButton.filledTonal(
                  onPressed: _count > 1 ? () => setState(() => _count--) : null,
                  icon: const Icon(Icons.remove),
                ),
                Padding(
                  padding: const EdgeInsets.symmetric(horizontal: Sp.xl),
                  child: Text(
                    '$_count',
                    style: AppTypography.kpi(size: 32, color: c.foreground),
                  ),
                ),
                IconButton.filledTonal(
                  onPressed: _count < 50
                      ? () => setState(() => _count++)
                      : null,
                  icon: const Icon(Icons.add),
                ),
              ],
            ),
            const SizedBox(height: Sp.lg),
            FilledButton(
              onPressed: () => Navigator.of(context).pop(_count),
              child: Text(
                widget.isTakeaway ? 'Start order' : 'Seat & start order',
              ),
            ),
          ],
        ),
      ),
    );
  }
}

Future<void> _createAndOpen(
  BuildContext context,
  WidgetRef ref, {
  required String? tableId,
  required int guestCount,
}) async {
  final messenger = ScaffoldMessenger.of(context);
  final router = GoRouter.of(context);
  try {
    final order = await ref
        .read(restaurantActionsProvider)
        .createOrder(tableId: tableId, guestCount: guestCount);
    router.go(Routes.restaurantOrder(order.id));
  } on ApiException catch (e) {
    messenger.showSnackBar(
      SnackBar(content: Text(RestaurantErrors.friendly(e))),
    );
  }
}
