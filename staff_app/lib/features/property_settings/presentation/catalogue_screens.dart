import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/networking/api_exception.dart';
import '../../../core/permissions/permission_gate.dart';
import '../../../core/permissions/permission_keys.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/theme/app_spacing.dart';
import '../../../core/theme/app_typography.dart';
import '../../../core/widgets/primitives.dart';
import '../../../core/widgets/states.dart';
import '../application/property_settings_controllers.dart';
import '../data/property_settings_models.dart';

/// The four property catalogues. Each is a list with add/edit/delete behind
/// `property.settings.update`, built on one shared list scaffold so they
/// cannot drift apart.

// ------------------------------------------------------------- scaffold ---

class _CatalogueList<T> extends ConsumerWidget {
  const _CatalogueList({
    required this.title,
    required this.subtitle,
    required this.provider,
    required this.emptyHint,
    required this.tile,
    required this.onAdd,
  });

  final String title;
  final String subtitle;
  final AutoDisposeFutureProvider<List<T>> provider;
  final String emptyHint;
  final Widget Function(BuildContext, WidgetRef, T) tile;
  final Future<void> Function(BuildContext, WidgetRef) onAdd;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final c = context.colors;
    final items = ref.watch(provider);
    return PageBody(
      children: [
        PageHeader(
          eyebrow: 'Property settings',
          title: title,
          actions: [
            PermissionGate(
              permission: P.propertySettingsUpdate,
              child: FilledButton.icon(
                onPressed: () => onAdd(context, ref),
                icon: const Icon(Icons.add, size: 16),
                label: const Text('Add'),
              ),
            ),
          ],
        ),
        Text(
          subtitle,
          style: AppTypography.body(size: 12.5, color: c.mutedForeground),
        ),
        gapSection,
        items.when(
          loading: () => const ListSkeleton(rows: 3),
          error: (e, _) =>
              ErrorState(error: e, onRetry: () => ref.invalidate(provider)),
          data: (list) => list.isEmpty
              ? EmptyState(
                  title: 'Nothing here yet',
                  hint: emptyHint,
                  icon: Icons.inbox_outlined,
                )
              : SoftCard(
                  padding: EdgeInsets.zero,
                  child: Column(
                    children: [
                      for (var i = 0; i < list.length; i++) ...[
                        if (i > 0) const RowDivider(),
                        tile(context, ref, list[i]),
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

/// A modal form sheet: fields, Save, optional Delete. Returns true when saved.
Future<bool?> _formSheet(
  BuildContext context, {
  required String title,
  required List<Widget> Function(void Function(VoidCallback) setState) fields,
  required Future<void> Function() onSave,
  Future<void> Function()? onDelete,
}) {
  return showModalBottomSheet<bool>(
    context: context,
    isScrollControlled: true,
    useSafeArea: true,
    builder: (sheetContext) {
      var busy = false;
      String? error;
      return StatefulBuilder(
        builder: (context, setState) {
          final c = context.colors;
          Future<void> run(Future<void> Function() fn) async {
            setState(() {
              busy = true;
              error = null;
            });
            try {
              await fn();
              if (context.mounted) Navigator.pop(context, true);
            } on ApiException catch (e) {
              setState(() => error = e.message);
            } catch (e) {
              setState(() => error = '$e');
            } finally {
              if (context.mounted) setState(() => busy = false);
            }
          }

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
                  if (error != null) ...[
                    const SizedBox(height: Sp.md),
                    Text(
                      error!,
                      style: AppTypography.body(
                        size: 12.5,
                        color: c.destructive,
                      ),
                    ),
                  ],
                  const SizedBox(height: Sp.lg),
                  Row(
                    children: [
                      if (onDelete != null)
                        TextButton(
                          onPressed: busy ? null : () => run(onDelete),
                          style: TextButton.styleFrom(
                            foregroundColor: c.destructive,
                          ),
                          child: const Text('Delete'),
                        ),
                      const Spacer(),
                      TextButton(
                        onPressed: busy
                            ? null
                            : () => Navigator.pop(context, false),
                        child: const Text('Cancel'),
                      ),
                      const SizedBox(width: Sp.sm),
                      FilledButton(
                        onPressed: busy ? null : () => run(onSave),
                        child: Text(busy ? 'Saving…' : 'Save'),
                      ),
                    ],
                  ),
                ],
              ),
            ),
          );
        },
      );
    },
  );
}

Widget _tf(
  TextEditingController c,
  String label, {
  String? hint,
  bool digits = false,
  int lines = 1,
  bool caps = false,
}) => Padding(
  padding: const EdgeInsets.only(bottom: Sp.md),
  child: TextField(
    controller: c,
    maxLines: lines,
    keyboardType: digits ? TextInputType.number : null,
    textCapitalization: caps
        ? TextCapitalization.characters
        : TextCapitalization.none,
    inputFormatters: digits ? [FilteringTextInputFormatter.digitsOnly] : null,
    decoration: InputDecoration(labelText: label, hintText: hint),
  ),
);

Widget _dd<T>(
  String label,
  T value,
  List<T> values,
  String Function(T) labelOf,
  void Function(T) onChanged,
) => Padding(
  padding: const EdgeInsets.only(bottom: Sp.md),
  child: DropdownButtonFormField<T>(
    initialValue: value,
    decoration: InputDecoration(labelText: label),
    items: [
      for (final v in values)
        DropdownMenuItem(value: v, child: Text(labelOf(v))),
    ],
    onChanged: (v) => v == null ? null : onChanged(v),
  ),
);

int _rupeesToPaise(String s) =>
    ((double.tryParse(s.trim()) ?? 0) * 100).round();
int _percentToBp(String s) => ((double.tryParse(s.trim()) ?? 0) * 100).round();

// ---------------------------------------------------------------- taxes ---

class TaxesScreen extends ConsumerWidget {
  const TaxesScreen({super.key});

  Future<void> _edit(
    BuildContext context,
    WidgetRef ref,
    PropertyTax? t,
  ) async {
    final name = TextEditingController(text: t?.name ?? '');
    final value = TextEditingController(
      text: t == null
          ? ''
          : (t.calculation == TaxCalculation.percent
                ? (t.value / 100).toString()
                : (t.value / 100).toStringAsFixed(0)),
    );
    final hsn = TextEditingController(text: t?.hsnCode ?? '');
    var calc = t?.calculation ?? TaxCalculation.percent;
    var basis = t?.basis ?? TaxBasis.perStay;
    var applies = t?.appliesTo ?? TaxAppliesTo.room;
    var active = t?.isActive ?? true;
    final actions = ref.read(propertySettingsActionsProvider);
    await _formSheet(
      context,
      title: t == null ? 'Add tax or fee' : 'Edit ${t.name}',
      fields: (setState) => [
        _tf(name, 'Name', hint: 'Municipal tax, Service charge'),
        _dd(
          'Calculated as',
          calc,
          TaxCalculation.values,
          (v) => v.label,
          (v) => setState(() => calc = v),
        ),
        _tf(
          value,
          calc == TaxCalculation.percent ? 'Percent' : 'Amount (₹)',
          digits: false,
        ),
        if (calc == TaxCalculation.fixed)
          _dd(
            'Charged',
            basis,
            TaxBasis.values,
            (v) => v.label,
            (v) => setState(() => basis = v),
          ),
        _dd(
          'Applies to',
          applies,
          TaxAppliesTo.values,
          (v) => v.label,
          (v) => setState(() => applies = v),
        ),
        _tf(hsn, 'HSN / SAC code (optional)', caps: true),
        SwitchListTile.adaptive(
          contentPadding: EdgeInsets.zero,
          value: active,
          onChanged: (v) => setState(() => active = v),
          title: const Text('Active'),
        ),
      ],
      onSave: () => actions.saveTax(t?.id, {
        'name': name.text.trim(),
        'calculation': calc.wire,
        'value': calc == TaxCalculation.percent
            ? _percentToBp(value.text)
            : _rupeesToPaise(value.text),
        'basis': basis.wire,
        'appliesTo': applies.wire,
        if (hsn.text.trim().isNotEmpty) 'hsnCode': hsn.text.trim(),
        'isActive': active,
      }),
      onDelete: t == null ? null : () => actions.deleteTax(t.id),
    );
  }

  @override
  Widget build(
    BuildContext context,
    WidgetRef ref,
  ) => _CatalogueList<PropertyTax>(
    title: 'Taxes & fees',
    subtitle:
        'GST on rooms (12%/18% by nightly tariff), restaurant (5%) and services (18%) is applied automatically. Add anything the hotel levies on top.',
    provider: propertyTaxesProvider,
    emptyHint: 'No extra taxes or fees. Only statutory GST applies.',
    onAdd: (ctx, r) => _edit(ctx, r, null),
    tile: (ctx, r, t) {
      final c = ctx.colors;
      return ListTile(
        title: Text(t.name),
        subtitle: Text(
          '${t.valueLabel} · ${t.appliesTo.label}${t.hsnCode == null ? '' : ' · ${t.hsnCode}'}',
          style: AppTypography.body(size: 11.5, color: c.mutedForeground),
        ),
        trailing: t.isActive
            ? null
            : Text(
                'Inactive',
                style: AppTypography.body(size: 11, color: c.mutedForeground),
              ),
        onTap: () => _edit(ctx, r, t),
      );
    },
  );
}

// ------------------------------------------------------------- policies ---

class PoliciesScreen extends ConsumerWidget {
  const PoliciesScreen({super.key});

  Future<void> _edit(
    BuildContext context,
    WidgetRef ref,
    PropertyPolicy? p,
  ) async {
    final name = TextEditingController(text: p?.name ?? '');
    final desc = TextEditingController(text: p?.description ?? '');
    final hours = TextEditingController(text: p?.hoursBefore?.toString() ?? '');
    final value = TextEditingController(
      text:
          p == null ||
              p.chargeKind == ChargeKind.none ||
              p.chargeKind == ChargeKind.firstNight
          ? ''
          : (p.chargeKind == ChargeKind.percent
                ? (p.value / 100).toStringAsFixed(0)
                : (p.value / 100).toStringAsFixed(0)),
    );
    var kind = p?.kind ?? PolicyKind.cancellation;
    var charge = p?.chargeKind ?? ChargeKind.none;
    var isDefault = p?.isDefault ?? false;
    var active = p?.isActive ?? true;
    final actions = ref.read(propertySettingsActionsProvider);
    await _formSheet(
      context,
      title: p == null ? 'Add policy' : 'Edit ${p.name}',
      fields: (setState) => [
        if (p == null)
          _dd(
            'Kind',
            kind,
            PolicyKind.values,
            (v) => v.label,
            (v) => setState(() => kind = v),
          ),
        _tf(name, 'Name', hint: 'Flexible, 24-hour, Non-refundable'),
        _tf(desc, 'Shown to guests', lines: 2),
        _tf(
          hours,
          'Applies within this many hours of check-in',
          hint: 'Blank = always',
          digits: true,
        ),
        _dd(
          'Charge',
          charge,
          ChargeKind.values,
          (v) => v.label,
          (v) => setState(() => charge = v),
        ),
        if (charge == ChargeKind.percent || charge == ChargeKind.fixed)
          _tf(
            value,
            charge == ChargeKind.percent ? 'Percent of the stay' : 'Amount (₹)',
            digits: true,
          ),
        SwitchListTile.adaptive(
          contentPadding: EdgeInsets.zero,
          value: isDefault,
          onChanged: (v) => setState(() => isDefault = v),
          title: const Text('Default for this kind'),
        ),
        SwitchListTile.adaptive(
          contentPadding: EdgeInsets.zero,
          value: active,
          onChanged: (v) => setState(() => active = v),
          title: const Text('Active'),
        ),
      ],
      onSave: () => actions.savePolicy(p?.id, {
        if (p == null) 'kind': kind.wire,
        'name': name.text.trim(),
        'description': desc.text.trim(),
        'hoursBefore': hours.text.trim().isEmpty
            ? null
            : int.tryParse(hours.text.trim()),
        'chargeKind': charge.wire,
        'value': charge == ChargeKind.percent
            ? _percentToBp(value.text)
            : charge == ChargeKind.fixed
            ? _rupeesToPaise(value.text)
            : 0,
        'isDefault': isDefault,
        'isActive': active,
      }),
      onDelete: p == null ? null : () => actions.deletePolicy(p.id),
    );
  }

  @override
  Widget build(
    BuildContext context,
    WidgetRef ref,
  ) => _CatalogueList<PropertyPolicy>(
    title: 'Policies',
    subtitle:
        'What happens on a cancellation, a no-show, an early checkout, or when a deposit is due. One default per kind.',
    provider: propertyPoliciesProvider,
    emptyHint: 'No policies yet. Without one, cancellations carry no charge.',
    onAdd: (ctx, r) => _edit(ctx, r, null),
    tile: (ctx, r, p) {
      final c = ctx.colors;
      return ListTile(
        title: Text(p.name),
        subtitle: Text(
          '${p.kind.label} · ${p.chargeLabel}${p.hoursBefore == null ? '' : ' · within ${p.hoursBefore}h'}',
          style: AppTypography.body(size: 11.5, color: c.mutedForeground),
        ),
        trailing: p.isDefault
            ? Text(
                'Default',
                style: AppTypography.body(
                  size: 11,
                  weight: FontWeight.w600,
                  color: c.primary,
                ),
              )
            : null,
        onTap: () => _edit(ctx, r, p),
      );
    },
  );
}

// -------------------------------------------------------------- add-ons ---

class AddonsScreen extends ConsumerWidget {
  const AddonsScreen({super.key});

  Future<void> _edit(
    BuildContext context,
    WidgetRef ref,
    AddonService? a,
  ) async {
    final name = TextEditingController(text: a?.name ?? '');
    final desc = TextEditingController(text: a?.description ?? '');
    final price = TextEditingController(
      text: a == null ? '' : (a.pricePaise / 100).toStringAsFixed(0),
    );
    var unit = a?.unit ?? AddonUnit.perStay;
    var tax = a?.taxCategory ?? 'other';
    var online = a?.sellOnline ?? true;
    var active = a?.isActive ?? true;
    final actions = ref.read(propertySettingsActionsProvider);
    await _formSheet(
      context,
      title: a == null ? 'Add service' : 'Edit ${a.name}',
      fields: (setState) => [
        _tf(name, 'Name', hint: 'Airport pickup'),
        _tf(desc, 'Description', lines: 2),
        _tf(price, 'Price (₹)', digits: true),
        _dd(
          'Charged',
          unit,
          AddonUnit.values,
          (v) => v.label,
          (v) => setState(() => unit = v),
        ),
        _dd(
          'Tax treatment',
          tax,
          const ['other', 'restaurant', 'accommodation'],
          (v) => switch (v) {
            'restaurant' => 'Food & beverage (5%)',
            'accommodation' => 'Part of the room',
            _ => 'Service (18%)',
          },
          (v) => setState(() => tax = v),
        ),
        SwitchListTile.adaptive(
          contentPadding: EdgeInsets.zero,
          value: online,
          onChanged: (v) => setState(() => online = v),
          title: const Text('Offer on the booking page'),
        ),
        SwitchListTile.adaptive(
          contentPadding: EdgeInsets.zero,
          value: active,
          onChanged: (v) => setState(() => active = v),
          title: const Text('Active'),
        ),
      ],
      onSave: () => actions.saveAddon(a?.id, {
        'name': name.text.trim(),
        'description': desc.text.trim(),
        'pricePaise': _rupeesToPaise(price.text),
        'unit': unit.wire,
        'taxCategory': tax,
        'sellOnline': online,
        'isActive': active,
      }),
      onDelete: a == null ? null : () => actions.deleteAddon(a.id),
    );
  }

  @override
  Widget build(
    BuildContext context,
    WidgetRef ref,
  ) => _CatalogueList<AddonService>(
    title: 'Add-on services',
    subtitle:
        'Sold with a stay and posted to the folio. Those marked online appear on the booking page.',
    provider: propertyAddonsProvider,
    emptyHint: 'No add-ons yet.',
    onAdd: (ctx, r) => _edit(ctx, r, null),
    tile: (ctx, r, a) {
      final c = ctx.colors;
      return ListTile(
        title: Text(a.name),
        subtitle: Text(
          '${a.priceLabel}${a.sellOnline ? ' · online' : ''}',
          style: AppTypography.body(size: 11.5, color: c.mutedForeground),
        ),
        trailing: a.isActive
            ? null
            : Text(
                'Inactive',
                style: AppTypography.body(size: 11, color: c.mutedForeground),
              ),
        onTap: () => _edit(ctx, r, a),
      );
    },
  );
}

// ------------------------------------------------------ booking sources ---

class BookingSourcesScreen extends ConsumerWidget {
  const BookingSourcesScreen({super.key});

  static const _channels = [
    'WALK_IN',
    'PHONE',
    'EMAIL',
    'OTA',
    'BOOKING_ENGINE',
    'OTHER',
  ];
  static String _channelLabel(String v) => switch (v) {
    'WALK_IN' => 'Walk-in',
    'PHONE' => 'Phone',
    'EMAIL' => 'Email',
    'OTA' => 'OTA',
    'BOOKING_ENGINE' => 'Booking page',
    _ => 'Other',
  };

  Future<void> _edit(
    BuildContext context,
    WidgetRef ref,
    BookingSource? s,
  ) async {
    final name = TextEditingController(text: s?.name ?? '');
    final commission = TextEditingController(
      text: s == null ? '' : (s.commissionBp / 100).toStringAsFixed(0),
    );
    var channel = s?.channel ?? 'OTHER';
    var active = s?.isActive ?? true;
    final actions = ref.read(propertySettingsActionsProvider);
    await _formSheet(
      context,
      title: s == null ? 'Add booking source' : 'Edit ${s.name}',
      fields: (setState) => [
        _tf(name, 'Name', hint: 'MakeMyTrip, Corporate — Infosys'),
        _dd(
          'Counts as',
          channel,
          _channels,
          _channelLabel,
          (v) => setState(() => channel = v),
        ),
        _tf(commission, 'Commission (%)', digits: true),
        SwitchListTile.adaptive(
          contentPadding: EdgeInsets.zero,
          value: active,
          onChanged: (v) => setState(() => active = v),
          title: const Text('Active'),
        ),
      ],
      onSave: () => actions.saveSource(s?.id, {
        'name': name.text.trim(),
        'channel': channel,
        'commissionBp': _percentToBp(commission.text),
        'isActive': active,
      }),
      onDelete: s == null ? null : () => actions.deleteSource(s.id),
    );
  }

  @override
  Widget build(
    BuildContext context,
    WidgetRef ref,
  ) => _CatalogueList<BookingSource>(
    title: 'Booking sources',
    subtitle:
        'Your own list of where bookings come from, each rolled up to a channel for reports.',
    provider: bookingSourcesProvider,
    emptyHint: 'No custom sources. Bookings still record the channel.',
    onAdd: (ctx, r) => _edit(ctx, r, null),
    tile: (ctx, r, s) {
      final c = ctx.colors;
      return ListTile(
        title: Text(s.name),
        subtitle: Text(
          '${_channelLabel(s.channel)}${s.commissionBp > 0 ? ' · ${(s.commissionBp / 100).toStringAsFixed(0)}% commission' : ''}',
          style: AppTypography.body(size: 11.5, color: c.mutedForeground),
        ),
        trailing: s.isActive
            ? null
            : Text(
                'Inactive',
                style: AppTypography.body(size: 11, color: c.mutedForeground),
              ),
        onTap: () => _edit(ctx, r, s),
      );
    },
  );
}
