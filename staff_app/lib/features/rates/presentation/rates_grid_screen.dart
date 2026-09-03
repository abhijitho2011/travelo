import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart';

import '../../../core/networking/api_exception.dart';
import '../../../core/permissions/permission_keys.dart';
import '../../../core/providers.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/theme/app_spacing.dart';
import '../../../core/theme/app_typography.dart';
import '../../../core/widgets/primitives.dart';
import '../../../core/widgets/states.dart';
import '../application/rates_controllers.dart';
import '../data/rates_models.dart';

/// **Rates & inventory** — the grid. Room types down, nights across; each
/// cell shows the sell price and how many rooms are left, with a mark when a
/// restriction is on. Tap a cell to edit that day; Bulk update edits many.
class RatesGridScreen extends ConsumerWidget {
  const RatesGridScreen({super.key});

  static final _day = DateFormat('EEE');
  static final _dom = DateFormat('d');
  static final _range = DateFormat('d MMM');

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final c = context.colors;
    final start = ref.watch(ratesWindowStartProvider);
    final end = start.add(const Duration(days: kRatesWindowDays - 1));
    final grid = ref.watch(rateGridProvider);
    final canEdit = ref.watch(permissionsProvider).has(P.ratesUpdate);

    void shift(int days) => ref.read(ratesWindowStartProvider.notifier).state =
        start.add(Duration(days: days));

    return PageBody(
      children: [
        PageHeader(
          eyebrow: 'Revenue',
          title: 'Rates & inventory',
          actions: [
            OutlinedButton.icon(
              onPressed: () => _ChangesSheet.show(context),
              icon: const Icon(Icons.history, size: 16),
              label: const Text('History'),
            ),
            if (canEdit)
              FilledButton.icon(
                onPressed: () =>
                    _BulkSheet.show(context, ref, grid.valueOrNull),
                icon: const Icon(Icons.edit_calendar_outlined, size: 16),
                label: const Text('Bulk update'),
              ),
          ],
        ),
        Row(
          children: [
            IconButton(
              onPressed: () => shift(-kRatesWindowDays),
              icon: const Icon(Icons.chevron_left),
            ),
            Text(
              '${_range.format(start)} – ${_range.format(end)}',
              style: AppTypography.body(
                size: 12.5,
                weight: FontWeight.w600,
                color: c.foreground,
              ),
            ),
            IconButton(
              onPressed: () => shift(kRatesWindowDays),
              icon: const Icon(Icons.chevron_right),
            ),
            const Spacer(),
            TextButton(
              onPressed: () {
                final n = DateTime.now();
                ref.read(ratesWindowStartProvider.notifier).state = DateTime(
                  n.year,
                  n.month,
                  n.day,
                );
              },
              child: const Text('Today'),
            ),
          ],
        ),
        gapMd,
        grid.when(
          loading: () => const ListSkeleton(rows: 4),
          error: (e, _) => ErrorState(
            error: e,
            onRetry: () => ref.invalidate(rateGridProvider),
          ),
          data: (g) => g.rows.isEmpty
              ? const EmptyState(
                  title: 'No room types yet',
                  hint:
                      'Add a room first; its prices appear here by the night.',
                  icon: Icons.grid_on_outlined,
                )
              : _Grid(grid: g, canEdit: canEdit),
        ),
        gapMd,
        _Legend(c: c),
        gapSection,
      ],
    );
  }
}

class _Legend extends StatelessWidget {
  const _Legend({required this.c});
  final AppColors c;
  @override
  Widget build(BuildContext context) => Wrap(
    spacing: Sp.md,
    runSpacing: Sp.xs,
    children: [
      _key(c.primary, 'Set for the day'),
      _key(c.mutedForeground, 'Base / seasonal'),
      _key(c.destructive, 'Stop sell'),
      _key(c.warning, 'Restricted (min/max stay, CTA/CTD)'),
    ],
  );
  Widget _key(Color color, String label) => Row(
    mainAxisSize: MainAxisSize.min,
    children: [
      Container(
        width: 10,
        height: 10,
        decoration: BoxDecoration(color: color, borderRadius: R.rPill),
      ),
      const SizedBox(width: 6),
      Text(
        label,
        style: AppTypography.body(size: 11, color: c.mutedForeground),
      ),
    ],
  );
}

class _Grid extends ConsumerWidget {
  const _Grid({required this.grid, required this.canEdit});
  final RateGrid grid;
  final bool canEdit;

  static const _labelW = 132.0;
  static const _cellW = 78.0;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final c = context.colors;
    final days = grid.rows.first.days.map((d) => d.date).toList();
    return SoftCard(
      padding: EdgeInsets.zero,
      child: SingleChildScrollView(
        scrollDirection: Axis.horizontal,
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                SizedBox(
                  width: _labelW,
                  child: Padding(
                    padding: const EdgeInsets.all(Sp.sm),
                    child: Text(
                      'Room',
                      style: AppTypography.labelXs(c.mutedForeground),
                    ),
                  ),
                ),
                for (final d in days)
                  SizedBox(
                    width: _cellW,
                    child: Column(
                      children: [
                        Text(
                          RatesGridScreen._day.format(d),
                          style: AppTypography.body(
                            size: 10.5,
                            color: d.weekday >= 6
                                ? c.primary
                                : c.mutedForeground,
                          ),
                        ),
                        Text(
                          RatesGridScreen._dom.format(d),
                          style: AppTypography.numeric(
                            size: 13,
                            weight: FontWeight.w700,
                            color: c.foreground,
                          ),
                        ),
                      ],
                    ),
                  ),
              ],
            ),
            const RowDivider(),
            for (final row in grid.rows) ...[
              Row(
                children: [
                  SizedBox(
                    width: _labelW,
                    child: Padding(
                      padding: const EdgeInsets.all(Sp.sm),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            row.name,
                            maxLines: 2,
                            overflow: TextOverflow.ellipsis,
                            style: AppTypography.body(
                              size: 12.5,
                              weight: FontWeight.w600,
                              color: c.foreground,
                            ),
                          ),
                          Text(
                            '${row.physical} ${row.physical == 1 ? 'room' : 'rooms'}',
                            style: AppTypography.body(
                              size: 10.5,
                              color: c.mutedForeground,
                            ),
                          ),
                        ],
                      ),
                    ),
                  ),
                  for (final cell in row.days)
                    _Cell(
                      cell: cell,
                      row: row,
                      canEdit: canEdit,
                      width: _cellW,
                    ),
                ],
              ),
              const RowDivider(),
            ],
          ],
        ),
      ),
    );
  }
}

class _Cell extends ConsumerWidget {
  const _Cell({
    required this.cell,
    required this.row,
    required this.canEdit,
    required this.width,
  });
  final RateDayCell cell;
  final RateGridRow row;
  final bool canEdit;
  final double width;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final c = context.colors;
    final priceColor = cell.stopSell
        ? c.destructive
        : cell.priceSource == 'day'
        ? c.primary
        : c.foreground;
    final soldOut = cell.available <= 0;
    return InkWell(
      onTap: canEdit ? () => _CellSheet.show(context, ref, row, cell) : null,
      child: Container(
        width: width,
        padding: const EdgeInsets.symmetric(vertical: Sp.sm, horizontal: 4),
        decoration: BoxDecoration(
          color: cell.stopSell
              ? c.destructive.withValues(alpha: 0.06)
              : cell.restricted
              ? c.warning.withValues(alpha: 0.08)
              : null,
          border: Border(
            left: BorderSide(color: c.border.withValues(alpha: 0.5)),
          ),
        ),
        child: Column(
          children: [
            Text(
              cell.stopSell ? 'Closed' : cell.priceLabel,
              style: AppTypography.numeric(
                size: 12.5,
                weight: FontWeight.w700,
                color: priceColor,
              ),
            ),
            Text(
              soldOut ? 'Sold out' : '${cell.available} left',
              style: AppTypography.body(
                size: 10.5,
                color: soldOut ? c.destructive : c.mutedForeground,
              ),
            ),
            if (cell.restricted && !cell.stopSell)
              Text(
                [
                  if (cell.minLos != null) 'min ${cell.minLos}',
                  if (cell.maxLos != null) 'max ${cell.maxLos}',
                  if (cell.closedToArrival) 'CTA',
                  if (cell.closedToDeparture) 'CTD',
                ].join(' · '),
                style: AppTypography.body(size: 9.5, color: c.warning),
                overflow: TextOverflow.ellipsis,
              ),
          ],
        ),
      ),
    );
  }
}

// ------------------------------------------------------------------ sheets ---

int? _rupees(String s) =>
    s.trim().isEmpty ? null : ((double.tryParse(s.trim()) ?? 0) * 100).round();
int? _intOf(String s) => s.trim().isEmpty ? null : int.tryParse(s.trim());

Widget _tf(TextEditingController c, String label, {String? hint}) => Padding(
  padding: const EdgeInsets.only(bottom: Sp.md),
  child: TextField(
    controller: c,
    keyboardType: TextInputType.number,
    inputFormatters: [FilteringTextInputFormatter.allow(RegExp(r'[0-9.\-]'))],
    decoration: InputDecoration(labelText: label, hintText: hint),
  ),
);

/// Edit one day for one room type.
class _CellSheet {
  static Future<void> show(
    BuildContext context,
    WidgetRef ref,
    RateGridRow row,
    RateDayCell cell,
  ) async {
    final price = TextEditingController(
      text: (cell.pricePaise / 100).round().toString(),
    );
    final avail = TextEditingController(text: cell.cap?.toString() ?? '');
    final minLos = TextEditingController(text: cell.minLos?.toString() ?? '');
    final maxLos = TextEditingController(text: cell.maxLos?.toString() ?? '');
    var stop = cell.stopSell,
        cta = cell.closedToArrival,
        ctd = cell.closedToDeparture;
    final messenger = ScaffoldMessenger.of(context);
    var busy = false;
    await showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      useSafeArea: true,
      builder: (sheet) => StatefulBuilder(
        builder: (context, setState) {
          final c = context.colors;
          return Padding(
            padding: EdgeInsets.fromLTRB(
              Sp.lg,
              Sp.lg,
              Sp.lg,
              MediaQuery.of(context).viewInsets.bottom + Sp.lg,
            ),
            child: SingleChildScrollView(
              child: Column(
                mainAxisSize: MainAxisSize.min,
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  Text(
                    row.name,
                    style: AppTypography.display(size: 17, color: c.foreground),
                  ),
                  Text(
                    '${DateFormat('EEEE, d MMMM').format(cell.date)} · ${cell.sold} sold of ${cell.physical}',
                    style: AppTypography.body(
                      size: 12,
                      color: c.mutedForeground,
                    ),
                  ),
                  const SizedBox(height: Sp.lg),
                  _tf(price, 'Price per night (₹)'),
                  _tf(
                    avail,
                    'Rooms to sell',
                    hint: 'Blank = all ${cell.physical}',
                  ),
                  Row(
                    children: [
                      Expanded(child: _tf(minLos, 'Min stay')),
                      const SizedBox(width: Sp.md),
                      Expanded(child: _tf(maxLos, 'Max stay')),
                    ],
                  ),
                  SwitchListTile.adaptive(
                    contentPadding: EdgeInsets.zero,
                    value: stop,
                    onChanged: (v) => setState(() => stop = v),
                    title: const Text('Stop sell'),
                    subtitle: const Text(
                      'Nothing sells for this night, on any channel',
                    ),
                  ),
                  SwitchListTile.adaptive(
                    contentPadding: EdgeInsets.zero,
                    value: cta,
                    onChanged: (v) => setState(() => cta = v),
                    title: const Text('Closed to arrival'),
                  ),
                  SwitchListTile.adaptive(
                    contentPadding: EdgeInsets.zero,
                    value: ctd,
                    onChanged: (v) => setState(() => ctd = v),
                    title: const Text('Closed to departure'),
                  ),
                  const SizedBox(height: Sp.lg),
                  FilledButton(
                    onPressed: busy
                        ? null
                        : () async {
                            setState(() => busy = true);
                            try {
                              await ref
                                  .read(ratesActionsProvider)
                                  .bulk(
                                    roomTypeIds: [row.id],
                                    ranges: [(from: cell.date, to: cell.date)],
                                    set: {
                                      'pricePaise': _rupees(price.text),
                                      'available': _intOf(avail.text),
                                      'minLos': _intOf(minLos.text),
                                      'maxLos': _intOf(maxLos.text),
                                      'stopSell': stop,
                                      'closedToArrival': cta,
                                      'closedToDeparture': ctd,
                                    },
                                  );
                              if (context.mounted) Navigator.pop(context);
                              messenger.showSnackBar(
                                const SnackBar(content: Text('Day updated')),
                              );
                            } on ApiException catch (e) {
                              messenger.showSnackBar(
                                SnackBar(content: Text(e.message)),
                              );
                            } finally {
                              if (context.mounted) setState(() => busy = false);
                            }
                          },
                    child: const Text('Save day'),
                  ),
                ],
              ),
            ),
          );
        },
      ),
    );
  }
}

/// Many room types × a date range at once.
class _BulkSheet {
  static Future<void> show(
    BuildContext context,
    WidgetRef ref,
    RateGrid? grid,
  ) async {
    if (grid == null || grid.rows.isEmpty) return;
    final selected = <String>{for (final r in grid.rows) r.id};
    var from = grid.from;
    var to = grid.to.subtract(const Duration(days: 1));
    final price = TextEditingController();
    final delta = TextEditingController();
    final avail = TextEditingController();
    final minLos = TextEditingController();
    final maxLos = TextEditingController();
    bool? stop, cta, ctd;
    final weekdays = <int>{};
    final messenger = ScaffoldMessenger.of(context);
    var busy = false;
    await showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      useSafeArea: true,
      builder: (sheet) => StatefulBuilder(
        builder: (context, setState) {
          final c = context.colors;
          Future<void> pick(bool isFrom) async {
            final d = await showDatePicker(
              context: context,
              initialDate: isFrom ? from : to,
              firstDate: DateTime(2020),
              lastDate: DateTime(2035),
            );
            if (d != null) setState(() => isFrom ? from = d : to = d);
          }

          Widget tri(String label, bool? v, void Function(bool?) set) => Row(
            children: [
              Expanded(
                child: Text(
                  label,
                  style: AppTypography.body(size: 13, color: c.foreground),
                ),
              ),
              SegmentedButton<int>(
                showSelectedIcon: false,
                segments: const [
                  ButtonSegment(value: 0, label: Text('Leave')),
                  ButtonSegment(value: 1, label: Text('On')),
                  ButtonSegment(value: 2, label: Text('Off')),
                ],
                selected: {
                  v == null
                      ? 0
                      : v
                      ? 1
                      : 2,
                },
                onSelectionChanged: (s) =>
                    set(s.first == 0 ? null : s.first == 1),
              ),
            ],
          );
          return Padding(
            padding: EdgeInsets.fromLTRB(
              Sp.lg,
              Sp.lg,
              Sp.lg,
              MediaQuery.of(context).viewInsets.bottom + Sp.lg,
            ),
            child: SingleChildScrollView(
              child: Column(
                mainAxisSize: MainAxisSize.min,
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  Text(
                    'Bulk update',
                    style: AppTypography.display(size: 17, color: c.foreground),
                  ),
                  Text(
                    'Blank fields are left as they are.',
                    style: AppTypography.body(
                      size: 12,
                      color: c.mutedForeground,
                    ),
                  ),
                  const SizedBox(height: Sp.lg),
                  Text(
                    'Room types',
                    style: AppTypography.labelXs(c.mutedForeground),
                  ),
                  Wrap(
                    spacing: Sp.sm,
                    children: [
                      for (final r in grid.rows)
                        FilterChip(
                          label: Text(r.name),
                          selected: selected.contains(r.id),
                          onSelected: (v) => setState(
                            () =>
                                v ? selected.add(r.id) : selected.remove(r.id),
                          ),
                        ),
                    ],
                  ),
                  const SizedBox(height: Sp.md),
                  Row(
                    children: [
                      Expanded(
                        child: OutlinedButton(
                          onPressed: () => pick(true),
                          child: Text(
                            'From ${DateFormat('d MMM').format(from)}',
                          ),
                        ),
                      ),
                      const SizedBox(width: Sp.sm),
                      Expanded(
                        child: OutlinedButton(
                          onPressed: () => pick(false),
                          child: Text('To ${DateFormat('d MMM').format(to)}'),
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: Sp.sm),
                  Wrap(
                    spacing: 4,
                    children: [
                      for (var i = 0; i < 7; i++)
                        FilterChip(
                          label: Text(
                            const [
                              'Sun',
                              'Mon',
                              'Tue',
                              'Wed',
                              'Thu',
                              'Fri',
                              'Sat',
                            ][i],
                          ),
                          selected: weekdays.contains(i),
                          onSelected: (v) => setState(
                            () => v ? weekdays.add(i) : weekdays.remove(i),
                          ),
                        ),
                    ],
                  ),
                  const SizedBox(height: Sp.lg),
                  Row(
                    children: [
                      Expanded(child: _tf(price, 'Set price (₹)')),
                      const SizedBox(width: Sp.md),
                      Expanded(
                        child: _tf(delta, 'or change by %', hint: '+10 or -15'),
                      ),
                    ],
                  ),
                  _tf(avail, 'Rooms to sell', hint: 'Blank = leave'),
                  Row(
                    children: [
                      Expanded(child: _tf(minLos, 'Min stay')),
                      const SizedBox(width: Sp.md),
                      Expanded(child: _tf(maxLos, 'Max stay')),
                    ],
                  ),
                  tri('Stop sell', stop, (v) => setState(() => stop = v)),
                  tri('Closed to arrival', cta, (v) => setState(() => cta = v)),
                  tri(
                    'Closed to departure',
                    ctd,
                    (v) => setState(() => ctd = v),
                  ),
                  const SizedBox(height: Sp.lg),
                  FilledButton(
                    onPressed: busy || selected.isEmpty
                        ? null
                        : () async {
                            setState(() => busy = true);
                            try {
                              final set = <String, dynamic>{
                                if (price.text.trim().isNotEmpty)
                                  'pricePaise': _rupees(price.text),
                                if (delta.text.trim().isNotEmpty)
                                  'priceDeltaBp':
                                      ((double.tryParse(delta.text.trim()) ??
                                                  0) *
                                              100)
                                          .round(),
                                if (avail.text.trim().isNotEmpty)
                                  'available': _intOf(avail.text),
                                if (minLos.text.trim().isNotEmpty)
                                  'minLos': _intOf(minLos.text),
                                if (maxLos.text.trim().isNotEmpty)
                                  'maxLos': _intOf(maxLos.text),
                                if (stop != null) 'stopSell': stop,
                                if (cta != null) 'closedToArrival': cta,
                                if (ctd != null) 'closedToDeparture': ctd,
                              };
                              final res = await ref
                                  .read(ratesActionsProvider)
                                  .bulk(
                                    roomTypeIds: selected.toList(),
                                    ranges: [(from: from, to: to)],
                                    daysOfWeek: weekdays.isEmpty
                                        ? null
                                        : (weekdays.toList()..sort()),
                                    set: set,
                                  );
                              if (context.mounted) Navigator.pop(context);
                              messenger.showSnackBar(
                                SnackBar(
                                  content: Text(
                                    '${res['changed']} of ${res['cells']} days updated',
                                  ),
                                ),
                              );
                            } on ApiException catch (e) {
                              messenger.showSnackBar(
                                SnackBar(content: Text(e.message)),
                              );
                            } finally {
                              if (context.mounted) setState(() => busy = false);
                            }
                          },
                    child: const Text('Apply'),
                  ),
                ],
              ),
            ),
          );
        },
      ),
    );
  }
}

class _ChangesSheet {
  static Future<void> show(BuildContext context) => showModalBottomSheet<void>(
    context: context,
    isScrollControlled: true,
    useSafeArea: true,
    builder: (_) => Consumer(
      builder: (context, ref, _) {
        final c = context.colors;
        final changes = ref.watch(rateChangesProvider);
        return Padding(
          padding: const EdgeInsets.all(Sp.lg),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Text(
                'Change history',
                style: AppTypography.display(size: 17, color: c.foreground),
              ),
              const SizedBox(height: Sp.md),
              Flexible(
                child: changes.when(
                  loading: () => const ListSkeleton(rows: 4),
                  error: (e, _) => ErrorState(
                    error: e,
                    onRetry: () => ref.invalidate(rateChangesProvider),
                  ),
                  data: (list) => list.isEmpty
                      ? const EmptyState(
                          title: 'No changes yet',
                          icon: Icons.history,
                        )
                      : ListView.separated(
                          shrinkWrap: true,
                          itemCount: list.length,
                          separatorBuilder: (_, _) => const RowDivider(),
                          itemBuilder: (_, i) {
                            final ch = list[i];
                            return ListTile(
                              dense: true,
                              title: Text(
                                '${ch.fieldLabel} · ${DateFormat('d MMM').format(ch.date)}',
                              ),
                              subtitle: Text(
                                '${ch.beforeLabel} → ${ch.afterLabel} · ${ch.actorKind.toLowerCase()} · ${DateFormat('d MMM HH:mm').format(ch.createdAt.toLocal())}',
                                style: AppTypography.body(
                                  size: 11.5,
                                  color: c.mutedForeground,
                                ),
                              ),
                            );
                          },
                        ),
                ),
              ),
            ],
          ),
        );
      },
    ),
  );
}
