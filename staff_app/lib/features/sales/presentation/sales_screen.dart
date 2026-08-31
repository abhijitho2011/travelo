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
import '../application/sales_controllers.dart';
import '../data/sales_models.dart';

/// The Sales CRM home: pipeline health at a glance, then the pipeline board —
/// one column per stage, tap a lead to open it.
class SalesScreen extends ConsumerWidget {
  const SalesScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final summary = ref.watch(salesSummaryProvider);
    final pipeline = ref.watch(pipelineProvider);
    final session = ref.watch(sessionProvider);

    return Scaffold(
      floatingActionButton: ref.hasPermission(P.leadCreate)
          ? FloatingActionButton.extended(
              onPressed: () => _LeadFormSheet.show(context, ref),
              icon: const Icon(Icons.add),
              label: const Text('New lead'),
            )
          : null,
      body: PageBody(
        onRefresh: () async {
          ref.invalidate(salesSummaryProvider);
          ref.invalidate(pipelineProvider);
        },
        children: [
          PageHeader(
            eyebrow: [
              'Sales',
              session?.hotel?.name,
            ].where((s) => s != null && s.isNotEmpty).join(' · '),
            title: 'Sales Pipeline',
            subtitle: 'Leads, stages and the value in play.',
          ),
          gapSection,
          summary.when(
            loading: () => const KpiSkeleton(count: 4),
            error: (e, _) => ErrorState(
              error: e,
              onRetry: () => ref.invalidate(salesSummaryProvider),
            ),
            data: (s) => KpiGrid(
              children: [
                KpiCard(label: 'Open leads', value: '${s?.openLeads ?? 0}'),
                KpiCard(label: 'Won', value: '${s?.wonLeads ?? 0}'),
                KpiCard(
                  label: 'Conversion',
                  value: '${s?.conversionPercent ?? 0}%',
                ),
                KpiCard(
                  label: 'Open value',
                  value: formatPaise(s?.openValuePaise ?? 0),
                ),
              ],
            ),
          ),
          gapSection,
          SectionHeader(title: 'Pipeline'),
          pipeline.when(
            loading: () => const ListSkeleton(rows: 3, height: 120),
            error: (e, _) => ErrorState(
              error: e,
              onRetry: () => ref.invalidate(pipelineProvider),
            ),
            data: (columns) {
              final anyLeads = columns.any((c) => c.leads.isNotEmpty);
              if (!anyLeads) {
                return const EmptyState(
                  title: 'No leads yet',
                  hint: 'Add your first lead to start the pipeline.',
                  icon: Icons.trending_up_outlined,
                );
              }
              return SizedBox(
                height: 420,
                child: ListView(
                  scrollDirection: Axis.horizontal,
                  children: [
                    for (final col in columns) _StageColumn(column: col),
                  ],
                ),
              );
            },
          ),
        ],
      ),
    );
  }
}

class _StageColumn extends StatelessWidget {
  const _StageColumn({required this.column});
  final PipelineColumn column;

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    return Container(
      width: 260,
      margin: const EdgeInsets.only(right: Sp.md),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(
            children: [
              StatusBadge(
                tone: column.stage.tone,
                label: column.stage.label,
                dense: true,
              ),
              const Spacer(),
              Text(
                '${column.leads.length}',
                style: AppTypography.numeric(
                  size: 12,
                  weight: FontWeight.w700,
                  color: c.mutedForeground,
                ),
              ),
            ],
          ),
          const SizedBox(height: 2),
          Text(
            formatPaise(column.valuePaise),
            style: AppTypography.body(size: 11.5, color: c.mutedForeground),
          ),
          const SizedBox(height: Sp.sm),
          Expanded(
            child: column.leads.isEmpty
                ? Container(
                    decoration: BoxDecoration(
                      border: Border.all(
                        color: c.border,
                        style: BorderStyle.solid,
                      ),
                      borderRadius: BorderRadius.circular(8),
                    ),
                    alignment: Alignment.center,
                    child: Text(
                      'Empty',
                      style: AppTypography.body(
                        size: 12,
                        color: c.mutedForeground,
                      ),
                    ),
                  )
                : ListView(
                    children: [
                      for (final l in column.leads) _LeadCard(lead: l),
                    ],
                  ),
          ),
        ],
      ),
    );
  }
}

class _LeadCard extends StatelessWidget {
  const _LeadCard({required this.lead});
  final Lead lead;

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    return Padding(
      padding: const EdgeInsets.only(bottom: Sp.sm),
      child: SoftCard(
        onTap: () => context.go(Routes.salesLead(lead.id)),
        padding: const EdgeInsets.all(12),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              lead.name,
              style: AppTypography.body(
                size: 13.5,
                weight: FontWeight.w700,
                color: c.foreground,
              ),
            ),
            if (lead.company != null) ...[
              const SizedBox(height: 2),
              Text(
                lead.company!,
                style: AppTypography.body(size: 12, color: c.mutedForeground),
              ),
            ],
            const SizedBox(height: 6),
            Text(
              lead.valueLabel,
              style: AppTypography.numeric(
                size: 12.5,
                weight: FontWeight.w700,
                color: c.primary,
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _LeadFormSheet extends ConsumerStatefulWidget {
  const _LeadFormSheet();

  static Future<void> show(BuildContext context, WidgetRef ref) =>
      showModalBottomSheet<void>(
        context: context,
        isScrollControlled: true,
        showDragHandle: true,
        constraints: BoxConstraints(
          maxHeight: MediaQuery.sizeOf(context).height * 0.9,
        ),
        builder: (_) => const _LeadFormSheet(),
      );

  @override
  ConsumerState<_LeadFormSheet> createState() => _LeadFormSheetState();
}

class _LeadFormSheetState extends ConsumerState<_LeadFormSheet> {
  final _form = GlobalKey<FormState>();
  final _name = TextEditingController();
  final _company = TextEditingController();
  final _contact = TextEditingController();
  final _source = TextEditingController();
  final _value = TextEditingController();
  bool _busy = false;
  String? _error;

  @override
  void dispose() {
    _name.dispose();
    _company.dispose();
    _contact.dispose();
    _source.dispose();
    _value.dispose();
    super.dispose();
  }

  Future<void> _save() async {
    if (!_form.currentState!.validate()) return;
    setState(() {
      _busy = true;
      _error = null;
    });
    final valuePaise = ((double.tryParse(_value.text.trim()) ?? 0) * 100)
        .round();
    final body = <String, dynamic>{
      'name': _name.text.trim(),
      if (_company.text.trim().isNotEmpty) 'company': _company.text.trim(),
      if (_contact.text.trim().isNotEmpty) 'contact': _contact.text.trim(),
      if (_source.text.trim().isNotEmpty) 'source': _source.text.trim(),
      if (valuePaise > 0) 'valuePaise': valuePaise,
    };
    final navigator = Navigator.of(context);
    try {
      await ref.read(salesActionsProvider).create(body);
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
              Text('New lead', style: Theme.of(context).textTheme.titleMedium),
              const SizedBox(height: Sp.md),
              TextFormField(
                controller: _name,
                decoration: const InputDecoration(labelText: 'Name'),
                textCapitalization: TextCapitalization.words,
                validator: (v) =>
                    (v == null || v.trim().isEmpty) ? 'Required' : null,
              ),
              const SizedBox(height: Sp.md),
              TextFormField(
                controller: _company,
                decoration: const InputDecoration(
                  labelText: 'Company (optional)',
                ),
              ),
              const SizedBox(height: Sp.md),
              TextFormField(
                controller: _contact,
                decoration: const InputDecoration(
                  labelText: 'Contact (optional)',
                ),
              ),
              const SizedBox(height: Sp.md),
              TextFormField(
                controller: _source,
                decoration: const InputDecoration(
                  labelText: 'Source (optional)',
                ),
              ),
              const SizedBox(height: Sp.md),
              TextFormField(
                controller: _value,
                decoration: const InputDecoration(
                  labelText: 'Est. value (₹, optional)',
                  prefixText: '₹ ',
                ),
                keyboardType: TextInputType.number,
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
                    : const Text('Create lead'),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
