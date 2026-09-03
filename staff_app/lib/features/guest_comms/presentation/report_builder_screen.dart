import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart';

import '../../../core/networking/api_exception.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/theme/app_spacing.dart';
import '../../../core/theme/app_typography.dart';
import '../../../core/widgets/primitives.dart';
import '../../../core/widgets/states.dart';
import '../../rooms/data/room_models.dart' show formatPaise;
import '../application/guest_comms_controllers.dart';
import '../data/guest_comms_models.dart';

const _entities =
    <String, ({String label, List<String> dims, List<String> measures})>{
      'reservations': (
        label: 'Bookings',
        dims: [
          'source',
          'status',
          'segment',
          'roomType',
          'month',
          'week',
          'day',
        ],
        measures: [
          'count',
          'nights',
          'revenuePaise',
          'paidPaise',
          'avgRatePaise',
          'adults',
        ],
      ),
      'payments': (
        label: 'Payments',
        dims: ['method', 'direction', 'month', 'day'],
        measures: ['count', 'amountPaise'],
      ),
      'orders': (
        label: 'Restaurant orders',
        dims: ['status', 'paymentMethod', 'month', 'day'],
        measures: ['count', 'totalPaise', 'discountPaise', 'taxPaise'],
      ),
      'expenses': (
        label: 'Expenses',
        dims: ['category', 'status', 'vendor', 'month'],
        measures: ['count', 'amountPaise'],
      ),
      'nightAudit': (
        label: 'Night audit',
        dims: ['month', 'day'],
        measures: [
          'days',
          'revenuePaise',
          'roomsSold',
          'roomsAvailable',
          'noShows',
        ],
      ),
    };

/// **Custom report** — pick what, over when, grouped how, measuring what.
class ReportBuilderScreen extends ConsumerStatefulWidget {
  const ReportBuilderScreen({super.key});
  @override
  ConsumerState<ReportBuilderScreen> createState() => _ReportBuilderState();
}

class _ReportBuilderState extends ConsumerState<ReportBuilderScreen> {
  String _entity = 'reservations';
  String? _groupBy = 'source';
  final Set<String> _measures = {'count', 'revenuePaise'};
  DateTime _from = DateTime.now().subtract(const Duration(days: 30));
  DateTime _to = DateTime.now();
  CustomReportResult? _result;
  bool _busy = false;

  String _iso(DateTime d) => DateFormat('yyyy-MM-dd').format(d);

  Future<void> _run() async {
    setState(() => _busy = true);
    final messenger = ScaffoldMessenger.of(context);
    try {
      final r = await ref.read(guestCommsActionsProvider).customReport({
        'entity': _entity,
        'from': _iso(_from),
        'to': _iso(_to),
        if (_groupBy != null) 'groupBy': _groupBy,
        'measures': _measures.toList(),
      });
      setState(() => _result = r);
    } on ApiException catch (e) {
      messenger.showSnackBar(SnackBar(content: Text(e.message)));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  String _fmt(String measure, Object? v) {
    if (v == null) return '—';
    if (measure.endsWith('Paise')) return formatPaise(int.tryParse('$v') ?? 0);
    return '$v';
  }

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    final spec = _entities[_entity]!;
    return PageBody(
      children: [
        const PageHeader(eyebrow: 'Reports', title: 'Custom report'),
        gapSection,
        SoftCard(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              DropdownButtonFormField<String>(
                initialValue: _entity,
                decoration: const InputDecoration(labelText: 'Report on'),
                items: [
                  for (final e in _entities.entries)
                    DropdownMenuItem(value: e.key, child: Text(e.value.label)),
                ],
                onChanged: (v) => setState(() {
                  _entity = v ?? _entity;
                  _groupBy = _entities[_entity]!.dims.first;
                  _measures
                    ..clear()
                    ..add(_entities[_entity]!.measures.first);
                }),
              ),
              gapMd,
              Row(
                children: [
                  Expanded(
                    child: OutlinedButton(
                      onPressed: () async {
                        final d = await showDatePicker(
                          context: context,
                          initialDate: _from,
                          firstDate: DateTime(2020),
                          lastDate: DateTime(2035),
                        );
                        if (d != null) setState(() => _from = d);
                      },
                      child: Text(
                        'From ${DateFormat('d MMM yyyy').format(_from)}',
                      ),
                    ),
                  ),
                  const SizedBox(width: Sp.sm),
                  Expanded(
                    child: OutlinedButton(
                      onPressed: () async {
                        final d = await showDatePicker(
                          context: context,
                          initialDate: _to,
                          firstDate: DateTime(2020),
                          lastDate: DateTime(2035),
                        );
                        if (d != null) setState(() => _to = d);
                      },
                      child: Text('To ${DateFormat('d MMM yyyy').format(_to)}'),
                    ),
                  ),
                ],
              ),
              gapMd,
              DropdownButtonFormField<String?>(
                initialValue: spec.dims.contains(_groupBy) ? _groupBy : null,
                decoration: const InputDecoration(labelText: 'Group by'),
                items: [
                  const DropdownMenuItem(
                    value: null,
                    child: Text('Totals only'),
                  ),
                  for (final d in spec.dims)
                    DropdownMenuItem(value: d, child: Text(d)),
                ],
                onChanged: (v) => setState(() => _groupBy = v),
              ),
              gapMd,
              Text('Measures', style: AppTypography.labelXs(c.mutedForeground)),
              Wrap(
                spacing: Sp.sm,
                children: [
                  for (final m in spec.measures)
                    FilterChip(
                      label: Text(m),
                      selected: _measures.contains(m),
                      onSelected: (v) => setState(
                        () => v ? _measures.add(m) : _measures.remove(m),
                      ),
                    ),
                ],
              ),
              gapMd,
              FilledButton.icon(
                onPressed: _busy || _measures.isEmpty ? null : _run,
                icon: const Icon(Icons.play_arrow_outlined, size: 16),
                label: Text(_busy ? 'Running…' : 'Run report'),
              ),
            ],
          ),
        ),
        gapSection,
        if (_result != null)
          _result!.rows.isEmpty
              ? const EmptyState(
                  title: 'No rows for that window',
                  icon: Icons.table_chart_outlined,
                )
              : SoftCard(
                  padding: EdgeInsets.zero,
                  child: SingleChildScrollView(
                    scrollDirection: Axis.horizontal,
                    child: DataTable(
                      columns: [
                        DataColumn(label: Text(_result!.groupBy ?? 'Total')),
                        for (final m in _result!.measures)
                          DataColumn(label: Text(m), numeric: true),
                      ],
                      rows: [
                        for (final r in _result!.rows)
                          DataRow(
                            cells: [
                              DataCell(Text('${r['group'] ?? 'All'}')),
                              for (final m in _result!.measures)
                                DataCell(Text(_fmt(m, r[m]))),
                            ],
                          ),
                      ],
                    ),
                  ),
                ),
        if (_result != null) ...[
          gapMd,
          Text(
            'Ran: ${_result!.query}',
            style: AppTypography.body(size: 10.5, color: c.mutedForeground),
          ),
        ],
        gapSection,
      ],
    );
  }
}
