import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/permissions/permission_gate.dart';
import '../../../core/permissions/permission_keys.dart';
import '../../../core/providers.dart';
import '../../../core/routing/routes.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/theme/app_typography.dart';
import '../../../core/widgets/primitives.dart';
import '../../../core/widgets/states.dart';
import '../application/accounts_controllers.dart';
import '../data/accounts_models.dart';

/// The accounts dashboard: today's revenue by source, expenses and the
/// receivables / payables counts, with the way into the expense register.
class AccountsScreen extends ConsumerWidget {
  const AccountsScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final summary = ref.watch(accountsSummaryProvider);
    final session = ref.watch(sessionProvider);

    return PageBody(
      onRefresh: () async => ref.invalidate(accountsSummaryProvider),
      children: [
        PageHeader(
          eyebrow: [
            'Accounts',
            session?.hotel?.name,
          ].where((s) => s != null && s.isNotEmpty).join(' · '),
          title: 'Accounts',
          subtitle: "Today's money — revenue in, expenses out.",
          actions: [
            PermissionGate(
              permission: P.paymentRead,
              child: OutlinedButton.icon(
                onPressed: () => context.go(Routes.accountsCash),
                icon: const Icon(Icons.point_of_sale_outlined, size: 16),
                label: const Text('Cash'),
              ),
            ),
            PermissionGate(
              permission: P.folioRead,
              child: OutlinedButton.icon(
                onPressed: () => context.go(Routes.accountsCorporate),
                icon: const Icon(Icons.business_outlined, size: 16),
                label: const Text('Companies'),
              ),
            ),
            PermissionGate(
              permission: P.expenseRead,
              child: FilledButton.icon(
                onPressed: () => context.go(Routes.accountsExpenses),
                icon: const Icon(Icons.receipt_long_outlined, size: 16),
                label: const Text('Expenses'),
              ),
            ),
          ],
        ),
        gapSection,
        summary.when(
          loading: () => const KpiSkeleton(count: 4),
          error: (e, _) => ErrorState(
            error: e,
            onRetry: () => ref.invalidate(accountsSummaryProvider),
          ),
          data: (s) => s == null
              ? const EmptyState(
                  title: 'No figures yet',
                  hint:
                      'Revenue appears as guests check in and outlets settle.',
                  icon: Icons.query_stats_outlined,
                )
              : _Dashboard(summary: s),
        ),
      ],
    );
  }
}

class _Dashboard extends StatelessWidget {
  const _Dashboard({required this.summary});
  final AccountsSummary summary;

  @override
  Widget build(BuildContext context) {
    final s = summary;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        KpiGrid(
          children: [
            KpiCard(
              label: "Today's revenue",
              value: formatPaise(s.totalRevenuePaise),
            ),
            KpiCard(
              label: 'Expenses today',
              value: formatPaise(s.expensesTodayPaise),
            ),
            KpiCard(
              label: 'Receivables',
              value: '${s.receivablesCount}',
              hint: 'Bookings with a balance due',
            ),
            KpiCard(
              label: 'Payables',
              value: '${s.payablesCount}',
              hint: 'Expenses not yet paid',
              tone: s.payablesCount > 0 ? context.colors.warning : null,
            ),
          ],
        ),
        gapMd,
        Panel(
          title: 'Revenue by source',
          child: Column(
            children: [
              _sourceRow(context, 'Rooms', s.roomsPaise),
              const SizedBox(height: 4),
              _sourceRow(context, 'Food & Beverage', s.fnbPaise),
              const Divider(height: 20),
              _sourceRow(context, 'Total', s.totalRevenuePaise, bold: true),
            ],
          ),
        ),
      ],
    );
  }

  Widget _sourceRow(
    BuildContext context,
    String label,
    int paise, {
    bool bold = false,
  }) {
    final c = context.colors;
    return Row(
      mainAxisAlignment: MainAxisAlignment.spaceBetween,
      children: [
        Text(
          label,
          style: AppTypography.body(
            size: 13,
            weight: bold ? FontWeight.w700 : FontWeight.w400,
            color: c.foreground,
          ),
        ),
        Text(
          formatPaise(paise),
          style: AppTypography.numeric(
            size: 13,
            weight: bold ? FontWeight.w700 : FontWeight.w600,
            color: c.foreground,
          ),
        ),
      ],
    );
  }
}
