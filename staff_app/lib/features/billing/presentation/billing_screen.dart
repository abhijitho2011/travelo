import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/intl.dart';

import '../../../core/routing/routes.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/theme/app_spacing.dart';
import '../../../core/theme/app_typography.dart';
import '../../../core/widgets/primitives.dart';
import '../../../core/widgets/states.dart';
import '../../rooms/data/room_models.dart' show formatPaise;
import '../application/billing_controllers.dart';
import '../data/billing_models.dart';

final _d = DateFormat('d MMM');

/// **Billing** — every open folio, so nobody leaves without settling.
class BillingScreen extends ConsumerStatefulWidget {
  const BillingScreen({super.key});
  @override
  ConsumerState<BillingScreen> createState() => _BillingState();
}

class _BillingState extends ConsumerState<BillingScreen> {
  final _search = TextEditingController();
  Timer? _t;

  @override
  void dispose() {
    _t?.cancel();
    _search.dispose();
    super.dispose();
  }

  void _onChanged(String v) {
    _t?.cancel();
    _t = Timer(const Duration(milliseconds: 250), () {
      if (mounted) ref.read(billingQueryProvider.notifier).state = v;
    });
  }

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    final scope = ref.watch(billingScopeProvider);
    final page = ref.watch(foliosProvider);
    return PageBody(
      onRefresh: () async => ref.invalidate(foliosProvider),
      children: [
        const PageHeader(eyebrow: 'Finance', title: 'Billing'),
        gapMd,
        page.maybeWhen(
          data: (p) => KpiGrid(
            children: [
              KpiCard(label: 'Open folios', value: '${p.count}'),
              KpiCard(
                label: 'Outstanding',
                value: formatPaise(p.balancePaise),
                tone: p.balancePaise > 0 ? c.warning : null,
              ),
            ],
          ),
          orElse: () => KpiGrid(
            children: const [
              KpiCard(label: 'Open folios', value: '—'),
              KpiCard(label: 'Outstanding', value: '—'),
            ],
          ),
        ),
        gapMd,
        Wrap(
          spacing: Sp.sm,
          children: [
            for (final s in const [
              ('open', 'Open'),
              ('inhouse', 'In-house'),
              ('all', 'All'),
            ])
              ChoiceChip(
                label: Text(s.$2),
                selected: scope == s.$1,
                onSelected: (_) =>
                    ref.read(billingScopeProvider.notifier).state = s.$1,
              ),
          ],
        ),
        gapMd,
        TextField(
          controller: _search,
          decoration: const InputDecoration(
            hintText: 'Search by guest, booking # or room',
            prefixIcon: Icon(Icons.search),
          ),
          onChanged: _onChanged,
        ),
        gapSection,
        page.when(
          loading: () => const ListSkeleton(rows: 4),
          error: (e, _) => ErrorState(
            error: e,
            onRetry: () => ref.invalidate(foliosProvider),
          ),
          data: (p) => p.items.isEmpty
              ? const EmptyState(
                  title: 'Nothing to settle',
                  hint: 'Every folio in this view has been paid in full.',
                  icon: Icons.receipt_long_outlined,
                )
              : SoftCard(
                  padding: EdgeInsets.zero,
                  child: Column(
                    children: [
                      for (var i = 0; i < p.items.length; i++) ...[
                        if (i > 0) const RowDivider(),
                        _FolioRow(row: p.items[i]),
                      ],
                    ],
                  ),
                ),
        ),
        gapSection,
      ],
    );
  }
}

class _FolioRow extends StatelessWidget {
  const _FolioRow({required this.row});
  final FolioRow row;

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    final due = row.balancePaise;
    return ListTile(
      leading: CircleAvatar(
        backgroundColor: due > 0 ? c.warning : c.primary,
        child: Icon(
          due > 0 ? Icons.priority_high : Icons.check,
          color: c.primaryForeground,
          size: 18,
        ),
      ),
      title: Text(
        row.guestName,
        style: AppTypography.body(
          size: 13.5,
          weight: FontWeight.w600,
          color: c.foreground,
        ),
      ),
      subtitle: Text(
        [
          '#${row.code}',
          if (row.roomNumber != null) 'Room ${row.roomNumber}',
          row.status.toLowerCase().replaceAll('_', ' '),
          if (row.checkIn != null && row.checkOut != null)
            '${_d.format(row.checkIn!.toLocal())} → ${_d.format(row.checkOut!.toLocal())}',
        ].join(' · '),
        style: AppTypography.body(size: 11.5, color: c.mutedForeground),
      ),
      trailing: Column(
        crossAxisAlignment: CrossAxisAlignment.end,
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Text(
            due > 0 ? '${formatPaise(due)} due' : formatPaise(row.totalPaise),
            style: AppTypography.body(
              size: 12.5,
              weight: FontWeight.w700,
              color: due > 0 ? c.warning : c.foreground,
            ),
          ),
          Text(
            '${formatPaise(row.paidPaise)} paid',
            style: AppTypography.body(size: 10.5, color: c.mutedForeground),
          ),
        ],
      ),
      onTap: () => context.go(Routes.reservation(row.reservationId)),
    );
  }
}
