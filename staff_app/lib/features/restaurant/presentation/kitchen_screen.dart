import 'dart:async';

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
import '../application/restaurant_controllers.dart';
import '../data/restaurant_models.dart';
import '../data/restaurant_repository.dart';

/// The kitchen display. Tickets grouped into NEW / PREPARING / READY, oldest
/// first, with the elapsed time on each and a red flag past 15 minutes.
///
/// Polls every ~15 seconds — there are no websockets yet, so the board pulls
/// rather than being pushed to. The stage switch keeps it usable on a phone;
/// on a wide screen the three lanes sit side by side.
class KitchenScreen extends ConsumerStatefulWidget {
  const KitchenScreen({super.key});

  @override
  ConsumerState<KitchenScreen> createState() => _KitchenScreenState();
}

class _KitchenScreenState extends ConsumerState<KitchenScreen> {
  Timer? _poll;
  KotStatus _stage = KotStatus.newTicket;

  static const _stages = [KotStatus.newTicket, KotStatus.preparing, KotStatus.ready];

  @override
  void initState() {
    super.initState();
    // No websockets yet: pull the board every 15s so tickets and their timers
    // stay honest without anyone reaching for pull-to-refresh.
    _poll = Timer.periodic(
      const Duration(seconds: 15),
      (_) => ref.invalidate(kitchenProvider),
    );
  }

  @override
  void dispose() {
    _poll?.cancel();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final tickets = ref.watch(kitchenProvider);
    final wide = MediaQuery.sizeOf(context).width >= 900;

    return PageBody(
      onRefresh: () async => ref.invalidate(kitchenProvider),
      children: [
        PageHeader(
          eyebrow: 'Kitchen',
          title: 'Kitchen display',
          subtitle: 'Live tickets, oldest first. Refreshes on its own every 15s.',
        ),
        gapSection,

        tickets.when(
          loading: () => const ListSkeleton(rows: 3, height: 120),
          error: (e, _) =>
              ErrorState(error: e, onRetry: () => ref.invalidate(kitchenProvider)),
          data: (list) {
            if (list.isEmpty) {
              return const EmptyState(
                title: 'Nothing on the pass',
                hint: 'New tickets appear here the moment a waiter sends them.',
                icon: Icons.soup_kitchen_outlined,
              );
            }
            if (wide) return _Lanes(tickets: list);
            return Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Center(
                  child: Segmented<KotStatus>(
                    options: _stages,
                    labelOf: (s) => '${s.label} (${_countIn(list, s)})',
                    value: _stage,
                    onChanged: (s) => setState(() => _stage = s),
                  ),
                ),
                gapMd,
                ..._ticketsFor(list, _stage),
              ],
            );
          },
        ),
      ],
    );
  }

  static int _countIn(List<KitchenTicket> tickets, KotStatus stage) => tickets
      .expand((t) => t.items)
      .where((i) => i.kotStatus == stage)
      .length;

  List<Widget> _ticketsFor(List<KitchenTicket> tickets, KotStatus stage) {
    final cards = <Widget>[];
    for (final t in tickets) {
      final items = t.items.where((i) => i.kotStatus == stage).toList();
      if (items.isEmpty) continue;
      cards.add(
        Padding(
          padding: const EdgeInsets.only(bottom: Sp.sm),
          child: _TicketCard(ticket: t, stage: stage, items: items),
        ),
      );
    }
    if (cards.isEmpty) {
      cards.add(
        EmptyState(
          title: 'Nothing ${stage.label.toLowerCase()}',
          hint: 'Tickets move here as the kitchen works.',
          icon: Icons.done_all_outlined,
        ),
      );
    }
    return cards;
  }
}

/// Wide layout — the three lanes side by side.
class _Lanes extends StatelessWidget {
  const _Lanes({required this.tickets});

  final List<KitchenTicket> tickets;

  static const _stages = [KotStatus.newTicket, KotStatus.preparing, KotStatus.ready];

  @override
  Widget build(BuildContext context) {
    return IntrinsicHeight(
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          for (final stage in _stages)
            Expanded(
              child: Padding(
                padding: const EdgeInsets.only(right: Sp.sm),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    SectionHeader(title: stage.label),
                    for (final t in tickets)
                      if (t.items.any((i) => i.kotStatus == stage))
                        Padding(
                          padding: const EdgeInsets.only(bottom: Sp.sm),
                          child: _TicketCard(
                            ticket: t,
                            stage: stage,
                            items: t.items.where((i) => i.kotStatus == stage).toList(),
                          ),
                        ),
                  ],
                ),
              ),
            ),
        ],
      ),
    );
  }
}

class _TicketCard extends ConsumerWidget {
  const _TicketCard({
    required this.ticket,
    required this.stage,
    required this.items,
  });

  final KitchenTicket ticket;
  final KotStatus stage;
  final List<OrderLine> items;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final c = context.colors;
    final late = ticket.isLate;

    return SoftCard(
      accent: late ? c.critical : null,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Expanded(
                child: Text(
                  ticket.where,
                  style: AppTypography.body(
                    size: 14,
                    weight: FontWeight.w700,
                    color: c.foreground,
                  ),
                ),
              ),
              Icon(
                Icons.schedule,
                size: 13,
                color: late ? c.critical : c.mutedForeground,
              ),
              const SizedBox(width: 4),
              Text(
                ticket.elapsedLabel,
                style: AppTypography.numeric(
                  size: 12,
                  weight: FontWeight.w700,
                  color: late ? c.critical : c.mutedForeground,
                ),
              ),
            ],
          ),
          Text(
            '${ticket.orderNumber} · ${ticket.guestCount} guests',
            style: AppTypography.body(size: 11.5, color: c.mutedForeground),
          ),
          const SizedBox(height: Sp.sm),
          for (final line in items)
            Padding(
              padding: const EdgeInsets.symmetric(vertical: 3),
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
                          style: AppTypography.body(size: 13, color: c.foreground),
                        ),
                        if (line.notes != null)
                          Text(
                            line.notes!,
                            style: AppTypography.body(
                              size: 11.5,
                              weight: FontWeight.w600,
                              color: c.warning,
                            ),
                          ),
                      ],
                    ),
                  ),
                ],
              ),
            ),
          const SizedBox(height: Sp.sm),
          _StageActions(ticket: ticket, stage: stage, items: items),
        ],
      ),
    );
  }
}

/// The big Start / Ready buttons. NEW → Start (and Ready); PREPARING → Ready;
/// READY waits for the waiter to serve.
class _StageActions extends ConsumerWidget {
  const _StageActions({
    required this.ticket,
    required this.stage,
    required this.items,
  });

  final KitchenTicket ticket;
  final KotStatus stage;
  final List<OrderLine> items;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    if (stage == KotStatus.ready) {
      return Align(
        alignment: Alignment.centerLeft,
        child: StatusBadge(
          tone: StatusTone.healthy,
          label: 'Ready — waiter to serve',
          dense: true,
        ),
      );
    }

    return PermissionGate(
      permission: P.kotUpdate,
      fallback: const SizedBox.shrink(),
      child: Row(
        children: [
          if (stage == KotStatus.newTicket)
            Expanded(
              child: FilledButton.icon(
                onPressed: () => _advanceAll(context, ref, KotStatus.preparing),
                icon: const Icon(Icons.play_arrow, size: 18),
                label: const Text('Start'),
              ),
            ),
          if (stage == KotStatus.newTicket) const SizedBox(width: Sp.sm),
          Expanded(
            child: FilledButton.icon(
              onPressed: () => _advanceAll(context, ref, KotStatus.ready),
              icon: const Icon(Icons.check, size: 18),
              label: const Text('Ready'),
            ),
          ),
        ],
      ),
    );
  }

  Future<void> _advanceAll(BuildContext context, WidgetRef ref, KotStatus to) async {
    final messenger = ScaffoldMessenger.of(context);
    final actions = ref.read(restaurantActionsProvider);
    try {
      for (final line in items) {
        await actions.setKot(ticket.orderId, line.id, to);
      }
    } on ApiException catch (e) {
      messenger.showSnackBar(SnackBar(content: Text(RestaurantErrors.friendly(e))));
    }
  }
}
