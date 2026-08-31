import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/networking/api_exception.dart';
import '../../../core/permissions/permission_gate.dart';
import '../../../core/permissions/permission_keys.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/theme/app_spacing.dart';
import '../../../core/theme/app_typography.dart';
import '../../../core/utils/formatting.dart';
import '../../../core/widgets/primitives.dart';
import '../../../core/widgets/states.dart';
import '../../../core/widgets/status_badge.dart';
import '../application/accounts_controllers.dart';
import '../data/accounts_models.dart';

/// The expense register — list, filter, create, walk the DRAFT → APPROVED →
/// PAID lifecycle.
class ExpensesScreen extends ConsumerWidget {
  const ExpensesScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final expenses = ref.watch(expensesProvider);
    final filter = ref.watch(expenseStatusFilterProvider);

    return Scaffold(
      floatingActionButton: ref.hasPermission(P.expenseCreate)
          ? FloatingActionButton.extended(
              onPressed: () => _ExpenseFormSheet.show(context, ref),
              icon: const Icon(Icons.add),
              label: const Text('New expense'),
            )
          : null,
      body: PageBody(
        onRefresh: () async => ref.invalidate(expensesProvider),
        children: [
          const PageHeader(
            title: 'Expenses',
            subtitle: 'The property expense register.',
          ),
          gapMd,
          SectionHeader(
            title: 'Register',
            trailing: DropdownButton<ExpenseStatus?>(
              value: filter,
              hint: const Text('All', style: TextStyle(fontSize: 13)),
              underline: const SizedBox.shrink(),
              isDense: true,
              items: [
                const DropdownMenuItem(value: null, child: Text('All')),
                for (final s in ExpenseStatus.values)
                  DropdownMenuItem(value: s, child: Text(s.label)),
              ],
              onChanged: (v) =>
                  ref.read(expenseStatusFilterProvider.notifier).state = v,
            ),
          ),
          expenses.when(
            loading: () => const ListSkeleton(rows: 5),
            error: (e, _) => ErrorState(
              error: e,
              onRetry: () => ref.invalidate(expensesProvider),
            ),
            data: (list) => list.isEmpty
                ? const EmptyState(
                    title: 'No expenses recorded',
                    hint:
                        'Log utilities, supplies, salaries and the rest here.',
                    icon: Icons.receipt_long_outlined,
                  )
                : Column(
                    children: [for (final e in list) _ExpenseRow(expense: e)],
                  ),
          ),
        ],
      ),
    );
  }
}

class _ExpenseRow extends ConsumerWidget {
  const _ExpenseRow({required this.expense});
  final Expense expense;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final c = context.colors;
    final e = expense;
    return Padding(
      padding: const EdgeInsets.only(bottom: Sp.md),
      child: SoftCard(
        onTap: ref.hasPermission(P.expenseUpdate)
            ? () => _openActions(context, ref, e)
            : null,
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Expanded(
                  child: Text(
                    e.category.label,
                    style: AppTypography.body(
                      size: 14,
                      weight: FontWeight.w700,
                      color: c.foreground,
                    ),
                  ),
                ),
                Text(
                  e.amountLabel,
                  style: AppTypography.numeric(
                    size: 14,
                    weight: FontWeight.w700,
                    color: c.foreground,
                  ),
                ),
              ],
            ),
            const SizedBox(height: 4),
            Row(
              children: [
                StatusBadge(
                  tone: e.status.tone,
                  label: e.status.label,
                  dense: true,
                ),
                const SizedBox(width: 8),
                Text(
                  [
                    e.vendor,
                    Fmt.dayMonth(e.incurredOn),
                  ].where((s) => s != null && s != Fmt.dash).join(' · '),
                  style: AppTypography.body(size: 12, color: c.mutedForeground),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }

  void _openActions(BuildContext context, WidgetRef ref, Expense e) {
    final next = e.status.next;
    showModalBottomSheet<void>(
      context: context,
      showDragHandle: true,
      builder: (sheetCtx) => SafeArea(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            ListTile(
              leading: const Icon(Icons.edit_outlined),
              title: const Text('Edit expense'),
              onTap: () {
                Navigator.of(sheetCtx).pop();
                _ExpenseFormSheet.show(context, ref, existing: e);
              },
            ),
            if (next != null)
              ListTile(
                leading: const Icon(Icons.arrow_forward),
                title: Text('Mark ${next.label}'),
                onTap: () async {
                  Navigator.of(sheetCtx).pop();
                  final messenger = ScaffoldMessenger.of(context);
                  try {
                    await ref
                        .read(accountsActionsProvider)
                        .setStatus(e.id, next);
                  } on ApiException catch (err) {
                    messenger.showSnackBar(
                      SnackBar(content: Text(err.message)),
                    );
                  }
                },
              ),
          ],
        ),
      ),
    );
  }
}

class _ExpenseFormSheet extends ConsumerStatefulWidget {
  const _ExpenseFormSheet({this.existing});
  final Expense? existing;

  static Future<void> show(
    BuildContext context,
    WidgetRef ref, {
    Expense? existing,
  }) => showModalBottomSheet<void>(
    context: context,
    isScrollControlled: true,
    showDragHandle: true,
    constraints: BoxConstraints(
      maxHeight: MediaQuery.sizeOf(context).height * 0.9,
    ),
    builder: (_) => _ExpenseFormSheet(existing: existing),
  );

  @override
  ConsumerState<_ExpenseFormSheet> createState() => _ExpenseFormSheetState();
}

class _ExpenseFormSheetState extends ConsumerState<_ExpenseFormSheet> {
  final _form = GlobalKey<FormState>();
  late final TextEditingController _amount;
  late final TextEditingController _vendor;
  late final TextEditingController _note;
  late ExpenseCategory _category;
  late DateTime _incurredOn;
  bool _busy = false;
  String? _error;

  @override
  void initState() {
    super.initState();
    final e = widget.existing;
    _amount = TextEditingController(
      text: e == null ? '' : (e.amountPaise / 100).toStringAsFixed(0),
    );
    _vendor = TextEditingController(text: e?.vendor ?? '');
    _note = TextEditingController(text: e?.note ?? '');
    _category = e?.category ?? ExpenseCategory.supplies;
    _incurredOn = e?.incurredOn ?? DateTime.now();
  }

  @override
  void dispose() {
    _amount.dispose();
    _vendor.dispose();
    _note.dispose();
    super.dispose();
  }

  Future<void> _save() async {
    if (!_form.currentState!.validate()) return;
    setState(() {
      _busy = true;
      _error = null;
    });
    final paise = ((double.tryParse(_amount.text.trim()) ?? 0) * 100).round();
    final body = <String, dynamic>{
      'category': _category.wire,
      'amountPaise': paise,
      'incurredOn': _incurredOn.toUtc().toIso8601String(),
      if (_vendor.text.trim().isNotEmpty) 'vendor': _vendor.text.trim(),
      if (_note.text.trim().isNotEmpty) 'note': _note.text.trim(),
    };
    final navigator = Navigator.of(context);
    try {
      final actions = ref.read(accountsActionsProvider);
      if (widget.existing == null) {
        await actions.create(body);
      } else {
        await actions.update(widget.existing!.id, body);
      }
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
              Text(
                widget.existing == null ? 'New expense' : 'Edit expense',
                style: Theme.of(context).textTheme.titleMedium,
              ),
              const SizedBox(height: Sp.md),
              DropdownButtonFormField<ExpenseCategory>(
                initialValue: _category,
                decoration: const InputDecoration(labelText: 'Category'),
                items: [
                  for (final c in ExpenseCategory.values)
                    DropdownMenuItem(value: c, child: Text(c.label)),
                ],
                onChanged: (v) => setState(() => _category = v ?? _category),
              ),
              const SizedBox(height: Sp.md),
              TextFormField(
                controller: _amount,
                decoration: const InputDecoration(
                  labelText: 'Amount (₹)',
                  prefixText: '₹ ',
                ),
                keyboardType: TextInputType.number,
                validator: (v) {
                  final n = double.tryParse((v ?? '').trim());
                  if (n == null || n < 0) return 'Enter an amount';
                  return null;
                },
              ),
              const SizedBox(height: Sp.md),
              TextFormField(
                controller: _vendor,
                decoration: const InputDecoration(
                  labelText: 'Vendor (optional)',
                ),
              ),
              const SizedBox(height: Sp.md),
              InkWell(
                onTap: () async {
                  final date = await showDatePicker(
                    context: context,
                    initialDate: _incurredOn,
                    firstDate: DateTime(2020),
                    lastDate: DateTime.now().add(const Duration(days: 1)),
                  );
                  if (date != null) setState(() => _incurredOn = date);
                },
                child: InputDecorator(
                  decoration: const InputDecoration(labelText: 'Date'),
                  child: Text(Fmt.fullDate(_incurredOn)),
                ),
              ),
              const SizedBox(height: Sp.md),
              TextFormField(
                controller: _note,
                decoration: const InputDecoration(labelText: 'Note (optional)'),
                maxLines: 2,
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
                    : Text(
                        widget.existing == null
                            ? 'Save expense'
                            : 'Save changes',
                      ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
