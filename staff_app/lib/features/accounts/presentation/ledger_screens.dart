import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/intl.dart';

import '../../../core/networking/api_exception.dart';
import '../../../core/permissions/permission_gate.dart';
import '../../../core/permissions/permission_keys.dart';
import '../../../core/routing/routes.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/theme/app_spacing.dart';
import '../../../core/theme/app_typography.dart';
import '../../../core/widgets/primitives.dart';
import '../../../core/widgets/states.dart';
import '../../rooms/data/room_models.dart' show formatPaise;
import '../application/accounts_controllers.dart';
import '../data/ledger_models.dart';

final _dt = DateFormat('d MMM HH:mm');

Widget _money(TextEditingController c, String label, {String? hint}) => Padding(
  padding: const EdgeInsets.only(bottom: Sp.md),
  child: TextField(
    controller: c,
    keyboardType: TextInputType.number,
    inputFormatters: [FilteringTextInputFormatter.digitsOnly],
    decoration: InputDecoration(labelText: label, hintText: hint),
  ),
);
Widget _text(
  TextEditingController c,
  String label, {
  String? hint,
  int lines = 1,
}) => Padding(
  padding: const EdgeInsets.only(bottom: Sp.md),
  child: TextField(
    controller: c,
    maxLines: lines,
    decoration: InputDecoration(labelText: label, hintText: hint),
  ),
);
int _paise(String s) => (int.tryParse(s.trim()) ?? 0) * 100;

Future<void> _sheet(
  BuildContext context, {
  required String title,
  required List<Widget> Function(void Function(VoidCallback)) fields,
  required Future<void> Function() onSave,
  String saveLabel = 'Save',
}) {
  final messenger = ScaffoldMessenger.of(context);
  var busy = false;
  return showModalBottomSheet<void>(
    context: context,
    isScrollControlled: true,
    useSafeArea: true,
    builder: (_) => StatefulBuilder(
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
                  title,
                  style: AppTypography.display(size: 17, color: c.foreground),
                ),
                const SizedBox(height: Sp.lg),
                ...fields(setState),
                FilledButton(
                  onPressed: busy
                      ? null
                      : () async {
                          setState(() => busy = true);
                          try {
                            await onSave();
                            if (context.mounted) Navigator.pop(context);
                          } on ApiException catch (e) {
                            messenger.showSnackBar(
                              SnackBar(content: Text(e.message)),
                            );
                          } finally {
                            if (context.mounted) setState(() => busy = false);
                          }
                        },
                  child: Text(saveLabel),
                ),
              ],
            ),
          ),
        );
      },
    ),
  );
}

// ------------------------------------------------------------ cash ---

/// **Cash tracker** — cash-in-hand, every movement, and the cashier's shift.
class CashTrackerScreen extends ConsumerWidget {
  const CashTrackerScreen({super.key});

  Future<void> _entry(BuildContext context, WidgetRef ref) {
    final amount = TextEditingController();
    final note = TextEditingController();
    var kind = 'CASH_IN';
    return _sheet(
      context,
      title: 'Record cash movement',
      fields: (setState) => [
        DropdownButtonFormField<String>(
          initialValue: kind,
          decoration: const InputDecoration(labelText: 'Kind'),
          items: const [
            DropdownMenuItem(value: 'CASH_IN', child: Text('Cash in')),
            DropdownMenuItem(value: 'TOP_UP', child: Text('Top-up the float')),
            DropdownMenuItem(
              value: 'WITHDRAWAL',
              child: Text('Owner / manager withdrawal'),
            ),
            DropdownMenuItem(value: 'EXPENSE', child: Text('Cash expense')),
          ],
          onChanged: (v) => setState(() => kind = v ?? kind),
        ),
        const SizedBox(height: Sp.md),
        _money(amount, 'Amount (₹)'),
        _text(note, 'Note', hint: 'Who, what for'),
      ],
      onSave: () => ref
          .read(ledgerActionsProvider)
          .cashEntry(
            kind: kind,
            amountPaise: _paise(amount.text),
            note: note.text.trim(),
          ),
      saveLabel: 'Record',
    );
  }

  Future<void> _openShift(BuildContext context, WidgetRef ref) {
    final float = TextEditingController();
    return _sheet(
      context,
      title: 'Open shift',
      fields: (_) => [_money(float, 'Opening float (₹)')],
      onSave: () =>
          ref.read(ledgerActionsProvider).openShift(_paise(float.text)),
      saveLabel: 'Open shift',
    );
  }

  Future<void> _closeShift(BuildContext context, WidgetRef ref) {
    final declared = TextEditingController();
    final messenger = ScaffoldMessenger.of(context);
    return _sheet(
      context,
      title: 'Close shift',
      fields: (_) => [_money(declared, 'Cash counted (₹)')],
      onSave: () async {
        final s = await ref
            .read(ledgerActionsProvider)
            .closeShift(_paise(declared.text));
        final diff = s.differencePaise ?? 0;
        messenger.showSnackBar(
          SnackBar(
            content: Text(
              diff == 0
                  ? 'Shift closed — cash matches.'
                  : 'Shift closed — ${diff > 0 ? 'over' : 'short'} by ${formatPaise(diff.abs())}.',
            ),
          ),
        );
      },
      saveLabel: 'Close shift',
    );
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final c = context.colors;
    final book = ref.watch(cashBookProvider);
    final shift = ref.watch(currentShiftProvider).valueOrNull;
    return PageBody(
      onRefresh: () async {
        ref.invalidate(cashBookProvider);
        ref.invalidate(currentShiftProvider);
      },
      children: [
        PageHeader(
          eyebrow: 'Accounts',
          title: 'Cash tracker',
          actions: [
            PermissionGate(
              permission: P.paymentCollect,
              child: FilledButton.icon(
                onPressed: () => _entry(context, ref),
                icon: const Icon(Icons.add, size: 16),
                label: const Text('Record'),
              ),
            ),
          ],
        ),
        gapSection,
        SoftCard(
          child: Row(
            children: [
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      'Cash in hand',
                      style: AppTypography.labelXs(c.mutedForeground),
                    ),
                    Text(
                      book.valueOrNull == null
                          ? '—'
                          : formatPaise(book.valueOrNull!.balancePaise),
                      style: AppTypography.numeric(
                        size: 22,
                        weight: FontWeight.w700,
                        color: c.foreground,
                      ),
                    ),
                    Text(
                      shift == null
                          ? 'No shift open'
                          : 'Shift open since ${_dt.format(shift.openedAt.toLocal())} · float ${formatPaise(shift.openingCashPaise)}',
                      style: AppTypography.body(
                        size: 11.5,
                        color: c.mutedForeground,
                      ),
                    ),
                  ],
                ),
              ),
              PermissionGate(
                permission: P.paymentCollect,
                child: shift == null
                    ? OutlinedButton(
                        onPressed: () => _openShift(context, ref),
                        child: const Text('Open shift'),
                      )
                    : FilledButton.tonal(
                        onPressed: () => _closeShift(context, ref),
                        child: const Text('Close shift'),
                      ),
              ),
            ],
          ),
        ),
        gapSection,
        const SectionHeader(
          title: 'Last 7 days',
          icon: Icons.point_of_sale_outlined,
        ),
        book.when(
          loading: () => const ListSkeleton(rows: 4),
          error: (e, _) => ErrorState(
            error: e,
            onRetry: () => ref.invalidate(cashBookProvider),
          ),
          data: (b) => b.items.isEmpty
              ? const EmptyState(
                  title: 'No cash movements yet',
                  hint:
                      'Folio and till cash land here automatically; record the rest.',
                  icon: Icons.point_of_sale_outlined,
                )
              : SoftCard(
                  padding: EdgeInsets.zero,
                  child: Column(
                    children: [
                      for (var i = 0; i < b.items.length; i++) ...[
                        if (i > 0) const RowDivider(),
                        ListTile(
                          dense: true,
                          title: Text(b.items[i].kindLabel),
                          subtitle: Text(
                            '${b.items[i].note ?? ''}${b.items[i].createdAt == null ? '' : ' · ${_dt.format(b.items[i].createdAt!.toLocal())}'}',
                            style: AppTypography.body(
                              size: 11,
                              color: c.mutedForeground,
                            ),
                          ),
                          trailing: Text(
                            '${b.items[i].signedPaise < 0 ? '−' : '+'}${formatPaise(b.items[i].amountPaise)}',
                            style: AppTypography.numeric(
                              size: 13,
                              weight: FontWeight.w600,
                              color: b.items[i].signedPaise < 0
                                  ? c.destructive
                                  : c.primary,
                            ),
                          ),
                        ),
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

// ------------------------------------------------------- corporate ---

/// **Company accounts** — who may be billed later, and what they owe.
class CorporateAccountsScreen extends ConsumerWidget {
  const CorporateAccountsScreen({super.key});

  static Future<void> edit(
    BuildContext context,
    WidgetRef ref,
    CorporateAccount? a,
  ) {
    final name = TextEditingController(text: a?.name ?? '');
    final gstin = TextEditingController(text: a?.gstin ?? '');
    final contact = TextEditingController(text: a?.contactName ?? '');
    final phone = TextEditingController(text: a?.contactPhone ?? '');
    final email = TextEditingController(text: a?.contactEmail ?? '');
    final address = TextEditingController(text: a?.address ?? '');
    final limit = TextEditingController(
      text: a?.creditLimitPaise == null
          ? ''
          : (a!.creditLimitPaise! ~/ 100).toString(),
    );
    var active = a?.isActive ?? true;
    return _sheet(
      context,
      title: a == null ? 'Add company account' : 'Edit ${a.name}',
      fields: (setState) => [
        _text(name, 'Company'),
        _text(gstin, 'GSTIN (optional)'),
        _text(contact, 'Contact person'),
        _text(phone, 'Phone'),
        _text(email, 'Email'),
        _text(address, 'Billing address', lines: 2),
        _money(limit, 'Credit limit (₹, optional)'),
        SwitchListTile.adaptive(
          contentPadding: EdgeInsets.zero,
          value: active,
          onChanged: (v) => setState(() => active = v),
          title: const Text('Active'),
        ),
        const SizedBox(height: Sp.md),
      ],
      onSave: () => ref.read(ledgerActionsProvider).saveCorporate(a?.id, {
        'name': name.text.trim(),
        if (gstin.text.trim().isNotEmpty)
          'gstin': gstin.text.trim().toUpperCase(),
        'contactName': contact.text.trim(),
        'contactPhone': phone.text.trim(),
        if (email.text.trim().isNotEmpty) 'contactEmail': email.text.trim(),
        'address': address.text.trim(),
        'creditLimitPaise': limit.text.trim().isEmpty
            ? null
            : _paise(limit.text),
        'isActive': active,
      }),
    );
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final c = context.colors;
    final accounts = ref.watch(corporateAccountsProvider);
    return PageBody(
      onRefresh: () async => ref.invalidate(corporateAccountsProvider),
      children: [
        PageHeader(
          eyebrow: 'Accounts',
          title: 'Company accounts',
          actions: [
            PermissionGate(
              permission: P.folioAdjust,
              child: FilledButton.icon(
                onPressed: () => edit(context, ref, null),
                icon: const Icon(Icons.add, size: 16),
                label: const Text('Add'),
              ),
            ),
          ],
        ),
        gapSection,
        accounts.when(
          loading: () => const ListSkeleton(rows: 3),
          error: (e, _) => ErrorState(
            error: e,
            onRetry: () => ref.invalidate(corporateAccountsProvider),
          ),
          data: (list) => list.isEmpty
              ? const EmptyState(
                  title: 'No company accounts',
                  hint:
                      'Add a company to bill its stays and bills to an account settled later.',
                  icon: Icons.business_outlined,
                )
              : SoftCard(
                  padding: EdgeInsets.zero,
                  child: Column(
                    children: [
                      for (var i = 0; i < list.length; i++) ...[
                        if (i > 0) const RowDivider(),
                        ListTile(
                          title: Text(list[i].name),
                          subtitle: Text(
                            '${list[i].contactName ?? ''}${list[i].gstin == null ? '' : ' · ${list[i].gstin}'}',
                            style: AppTypography.body(
                              size: 11.5,
                              color: c.mutedForeground,
                            ),
                          ),
                          trailing: Text(
                            list[i].balanceLabel,
                            style: AppTypography.numeric(
                              size: 13,
                              weight: FontWeight.w700,
                              color: list[i].overLimit
                                  ? c.destructive
                                  : c.foreground,
                            ),
                          ),
                          onTap: () => context.go(
                            Routes.accountsCorporateAccount(list[i].id),
                          ),
                        ),
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

/// One account's statement with a running balance, and money received.
class CorporateStatementScreen extends ConsumerWidget {
  const CorporateStatementScreen({super.key, required this.accountId});
  final String accountId;

  Future<void> _payment(BuildContext context, WidgetRef ref) {
    final amount = TextEditingController();
    final reference = TextEditingController();
    return _sheet(
      context,
      title: 'Record payment received',
      fields: (_) => [
        _money(amount, 'Amount (₹)'),
        _text(reference, 'Reference', hint: 'UTR, cheque no.'),
      ],
      onSave: () => ref
          .read(ledgerActionsProvider)
          .corporatePayment(
            accountId,
            amountPaise: _paise(amount.text),
            reference: reference.text.trim(),
          ),
      saveLabel: 'Record payment',
    );
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final c = context.colors;
    final st = ref.watch(corporateStatementProvider(accountId));
    return PageBody(
      onRefresh: () async =>
          ref.invalidate(corporateStatementProvider(accountId)),
      children: [
        st.when(
          loading: () => const ListSkeleton(rows: 4),
          error: (e, _) => ErrorState(
            error: e,
            onRetry: () =>
                ref.invalidate(corporateStatementProvider(accountId)),
          ),
          data: (s) => Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              PageHeader(
                eyebrow: 'Company account',
                title: s.account.name,
                subtitle:
                    'Outstanding ${formatPaise(s.balancePaise)}${s.account.creditLimitPaise == null ? '' : ' of ${formatPaise(s.account.creditLimitPaise!)} limit'}',
                actions: [
                  PermissionGate(
                    permission: P.folioAdjust,
                    child: OutlinedButton(
                      onPressed: () =>
                          CorporateAccountsScreen.edit(context, ref, s.account),
                      child: const Text('Edit'),
                    ),
                  ),
                  PermissionGate(
                    permission: P.paymentCollect,
                    child: FilledButton.icon(
                      onPressed: () => _payment(context, ref),
                      icon: const Icon(Icons.payments_outlined, size: 16),
                      label: const Text('Payment'),
                    ),
                  ),
                ],
              ),
              gapSection,
              const SectionHeader(
                title: 'Statement',
                icon: Icons.receipt_long_outlined,
              ),
              s.entries.isEmpty
                  ? const EmptyState(
                      title: 'Nothing on the account yet',
                      icon: Icons.receipt_long_outlined,
                    )
                  : SoftCard(
                      padding: EdgeInsets.zero,
                      child: Column(
                        children: [
                          for (var i = s.entries.length - 1; i >= 0; i--) ...[
                            if (i < s.entries.length - 1) const RowDivider(),
                            ListTile(
                              dense: true,
                              title: Text(
                                '${s.entries[i].isCharge ? 'Charge' : 'Payment'}${s.entries[i].reference == null ? '' : ' · ${s.entries[i].reference}'}',
                              ),
                              subtitle: Text(
                                '${s.entries[i].note ?? ''}${s.entries[i].createdAt == null ? '' : ' · ${_dt.format(s.entries[i].createdAt!.toLocal())}'} · balance ${formatPaise(s.entries[i].runningBalancePaise)}',
                                style: AppTypography.body(
                                  size: 11,
                                  color: c.mutedForeground,
                                ),
                              ),
                              trailing: Text(
                                '${s.entries[i].isCharge ? '+' : '−'}${formatPaise(s.entries[i].amountPaise)}',
                                style: AppTypography.numeric(
                                  size: 13,
                                  weight: FontWeight.w600,
                                  color: s.entries[i].isCharge
                                      ? c.foreground
                                      : c.primary,
                                ),
                              ),
                            ),
                          ],
                        ],
                      ),
                    ),
              if (s.stays.isNotEmpty) ...[
                gapSection,
                const SectionHeader(
                  title: 'Stays billed to this account',
                  icon: Icons.hotel_outlined,
                ),
                SoftCard(
                  padding: EdgeInsets.zero,
                  child: Column(
                    children: [
                      for (var i = 0; i < s.stays.length; i++) ...[
                        if (i > 0) const RowDivider(),
                        ListTile(
                          dense: true,
                          title: Text(
                            '${s.stays[i]['guestName']} · ${s.stays[i]['reservationNumber']}',
                          ),
                          subtitle: Text(
                            '${s.stays[i]['checkIn']} → ${s.stays[i]['checkOut']} · ${s.stays[i]['status']}',
                            style: AppTypography.body(
                              size: 11,
                              color: c.mutedForeground,
                            ),
                          ),
                          trailing: Text(
                            formatPaise(
                              (s.stays[i]['totalPaise'] as num?)?.toInt() ?? 0,
                            ),
                            style: AppTypography.numeric(
                              size: 12.5,
                              color: c.foreground,
                            ),
                          ),
                          onTap: () => context.go(
                            Routes.reservation('${s.stays[i]['id']}'),
                          ),
                        ),
                      ],
                    ],
                  ),
                ),
              ],
              gapSection,
            ],
          ),
        ),
      ],
    );
  }
}
