import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/networking/api_exception.dart';
import '../../../core/permissions/permission_gate.dart';
import '../../../core/permissions/permission_keys.dart';
import '../../../core/providers.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/theme/app_spacing.dart';
import '../../../core/theme/app_typography.dart';
import '../../../core/widgets/primitives.dart';
import '../../../core/widgets/states.dart';
import '../../../core/widgets/status_badge.dart';
import '../application/units_controllers.dart';
import '../data/unit_models.dart';

/// The pricing half of the room-type workspace: rate plans, taxes & fees,
/// dynamic pricing and sales channels.
///
/// Every section here is only ever built for a room type the server already
/// knows about, so `roomTypeId` is a real id and each section can fetch and
/// mutate on its own. That keeps the workspace shell free of pricing state.

// ------------------------------------------------------------ money & maths --

/// Parses a decimal the user typed (rupees, or a percentage) into hundredths.
///
/// Deliberately string-based: `double.parse('1250.10') * 100` is 125009.99…, so
/// a rupee amount rounded through a double can lose a paisa. Splitting the text
/// keeps the conversion exact, which is why money only ever crosses this edge.
/// Returns null when the text is not a plain non-negative decimal.
int? _hundredths(String raw) {
  final text = raw.trim().replaceAll(',', '').replaceAll('₹', '').trim();
  if (text.isEmpty) return null;
  final match = RegExp(r'^(\d+)(?:\.(\d{1,2}))?$').firstMatch(text);
  if (match == null) return null;
  final whole = int.tryParse(match.group(1)!);
  if (whole == null) return null;
  final fraction = (match.group(2) ?? '').padRight(2, '0');
  return whole * 100 + int.parse(fraction);
}

/// The inverse, for pre-filling an editor without showing a stray `.00`.
String _decimalText(int hundredths) => hundredths % 100 == 0
    ? '${hundredths ~/ 100}'
    : (hundredths / 100).toStringAsFixed(2);

/// Whole counts (nights, days) where blank legitimately means "no limit".
int? _wholeOrNull(String raw) {
  final text = raw.trim();
  if (text.isEmpty) return null;
  return int.tryParse(text);
}

/// Turns a failed mutation into a sentence a receptionist can act on.
///
/// Only the one code the rate-plan endpoint raises for a human mistake is
/// spelled out; anything else already carries a server-written message, and
/// inventing copy for codes we have not seen would be worse than showing it.
String _friendlyError(Object error) {
  if (error is ApiException) {
    if (error.code == 'RATE_PLAN_NAME_TAKEN') {
      return 'A rate plan with that name already exists for this room type.';
    }
    return error.message;
  }
  return '$error';
}

// -------------------------------------------------------- shared furniture --

/// A titled card, matching the units list idiom: heading, muted sub-line, body.
class _SectionCard extends StatelessWidget {
  const _SectionCard({
    required this.title,
    required this.child,
    this.subtitle,
    this.trailing,
    this.header,
  });

  final String title;
  final String? subtitle;
  final Widget? trailing;

  /// Replaces the default heading block entirely — used by the collapsible
  /// Taxes & fees card, which needs the whole strip to be tappable.
  final Widget? header;
  final Widget child;

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    return SoftCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        mainAxisSize: MainAxisSize.min,
        children: [
          header ??
              Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          title,
                          style: AppTypography.body(
                            size: 15,
                            weight: FontWeight.w700,
                            color: c.foreground,
                          ),
                        ),
                        if (subtitle != null)
                          Text(
                            subtitle!,
                            style: AppTypography.body(
                              size: 12,
                              color: c.mutedForeground,
                            ),
                          ),
                      ],
                    ),
                  ),
                  if (trailing != null) ...[
                    const SizedBox(width: Sp.sm),
                    trailing!,
                  ],
                ],
              ),
          const SizedBox(height: Sp.md),
          child,
        ],
      ),
    );
  }
}

/// The small spinner a section shows while its own list loads. A section is one
/// card on a long page, so a full skeleton would be louder than the wait.
class _SectionLoading extends StatelessWidget {
  const _SectionLoading();

  @override
  Widget build(BuildContext context) => const Padding(
    padding: EdgeInsets.symmetric(vertical: Sp.xl),
    child: Center(
      child: SizedBox(
        width: 20,
        height: 20,
        child: CircularProgressIndicator(strokeWidth: 2),
      ),
    ),
  );
}

/// ⋮ menu shared by the plan, fee and rule rows.
class _RowMenu extends StatelessWidget {
  const _RowMenu({required this.items, required this.onSelected});

  final List<PopupMenuEntry<String>> items;
  final ValueChanged<String> onSelected;

  @override
  Widget build(BuildContext context) => PopupMenuButton<String>(
    tooltip: 'Actions',
    icon: Icon(
      Icons.more_vert,
      size: 18,
      color: context.colors.mutedForeground,
    ),
    itemBuilder: (_) => items,
    onSelected: onSelected,
  );
}

/// One bordered row inside a section list.
class _ListRow extends StatelessWidget {
  const _ListRow({required this.child, this.first = false});

  final Widget child;
  final bool first;

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    return Container(
      padding: const EdgeInsets.symmetric(vertical: Sp.sm),
      decoration: first
          ? null
          : BoxDecoration(
              border: Border(
                top: BorderSide(color: c.border.withValues(alpha: 0.7)),
              ),
            ),
      child: child,
    );
  }
}

Future<bool> _confirm(
  BuildContext context, {
  required String title,
  required String body,
  String confirmLabel = 'Delete',
}) async {
  final answer = await showDialog<bool>(
    context: context,
    builder: (dialogContext) => AlertDialog(
      title: Text(title),
      content: Text(body),
      actions: [
        TextButton(
          onPressed: () => Navigator.of(dialogContext).pop(false),
          child: const Text('Cancel'),
        ),
        FilledButton(
          onPressed: () => Navigator.of(dialogContext).pop(true),
          child: Text(confirmLabel),
        ),
      ],
    ),
  );
  return answer ?? false;
}

/// Opens an editor as a tall, scrollable bottom sheet. Every editor in this
/// file uses the same shell so the forms feel like one control.
Future<T?> _openSheet<T>(BuildContext context, WidgetBuilder builder) {
  return showModalBottomSheet<T>(
    context: context,
    isScrollControlled: true,
    showDragHandle: true,
    backgroundColor: context.colors.card,
    constraints: BoxConstraints(
      maxHeight: MediaQuery.sizeOf(context).height * 0.85,
      maxWidth: 640,
    ),
    builder: builder,
  );
}

// ------------------------------------------------------- sheet form pieces --

/// The scrolling body every editor sheet shares: title, fields, error strip and
/// a pinned save button.
class _SheetScaffold extends StatelessWidget {
  const _SheetScaffold({
    required this.title,
    required this.fields,
    required this.error,
    required this.saving,
    required this.onSave,
    this.saveLabel = 'Save',
  });

  final String title;
  final List<Widget> fields;
  final String? error;
  final bool saving;
  final VoidCallback onSave;
  final String saveLabel;

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    // The view inset keeps the save button above the keyboard rather than
    // behind it, which is where a plain padded column would put it.
    final inset = MediaQuery.viewInsetsOf(context).bottom;

    return Padding(
      padding: EdgeInsets.only(bottom: inset),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(Sp.lg, 0, Sp.lg, Sp.sm),
            child: Text(
              title,
              style: AppTypography.display(size: 18, color: c.foreground),
            ),
          ),
          Flexible(
            child: ListView(
              shrinkWrap: true,
              padding: const EdgeInsets.fromLTRB(Sp.lg, 0, Sp.lg, Sp.md),
              children: fields,
            ),
          ),
          if (error != null)
            Padding(
              padding: const EdgeInsets.fromLTRB(Sp.lg, 0, Sp.lg, Sp.sm),
              child: Container(
                padding: const EdgeInsets.symmetric(
                  horizontal: Sp.md,
                  vertical: Sp.sm,
                ),
                decoration: BoxDecoration(
                  color: c.critical.withValues(alpha: 0.1),
                  borderRadius: R.rMd,
                  border: Border.all(color: c.critical.withValues(alpha: 0.35)),
                ),
                child: Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Icon(Icons.error_outline, size: 15, color: c.critical),
                    const SizedBox(width: 6),
                    Expanded(
                      child: Text(
                        error!,
                        style: AppTypography.body(
                          size: 12.5,
                          color: c.critical,
                        ),
                      ),
                    ),
                  ],
                ),
              ),
            ),
          Padding(
            padding: const EdgeInsets.fromLTRB(Sp.lg, 0, Sp.lg, Sp.lg),
            child: FilledButton(
              onPressed: saving ? null : onSave,
              child: saving
                  ? const SizedBox(
                      width: 16,
                      height: 16,
                      child: CircularProgressIndicator(strokeWidth: 2),
                    )
                  : Text(saveLabel),
            ),
          ),
        ],
      ),
    );
  }
}

class _SheetField extends StatelessWidget {
  const _SheetField({
    required this.label,
    required this.controller,
    this.hint,
    this.helper,
    this.suffix,
    this.numeric = false,
    this.decimal = false,
    this.autofocus = false,
  });

  final String label;
  final TextEditingController controller;
  final String? hint;
  final String? helper;
  final String? suffix;
  final bool numeric;
  final bool decimal;
  final bool autofocus;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: Sp.md),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          LabelXs(label),
          const SizedBox(height: 4),
          TextField(
            controller: controller,
            autofocus: autofocus,
            keyboardType: numeric
                ? TextInputType.numberWithOptions(decimal: decimal)
                : TextInputType.text,
            inputFormatters: numeric
                ? [
                    FilteringTextInputFormatter.allow(
                      decimal ? RegExp(r'[0-9.]') : RegExp(r'[0-9]'),
                    ),
                  ]
                : null,
            decoration: InputDecoration(
              hintText: hint,
              helperText: helper,
              helperMaxLines: 2,
              suffixText: suffix,
            ),
          ),
        ],
      ),
    );
  }
}

class _SheetDropdown<T> extends StatelessWidget {
  const _SheetDropdown({
    required this.label,
    required this.value,
    required this.options,
    required this.labelOf,
    required this.onChanged,
  });

  final String label;
  final T value;
  final List<T> options;
  final String Function(T) labelOf;
  final ValueChanged<T> onChanged;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: Sp.md),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          LabelXs(label),
          const SizedBox(height: 4),
          DropdownButtonFormField<T>(
            initialValue: value,
            borderRadius: R.rMd,
            items: [
              for (final option in options)
                DropdownMenuItem<T>(
                  value: option,
                  child: Text(labelOf(option)),
                ),
            ],
            onChanged: (next) {
              if (next != null) onChanged(next);
            },
          ),
        ],
      ),
    );
  }
}

/// Two fields on one line, for the natural pairs (min/max, adult/child).
class _SheetPair extends StatelessWidget {
  const _SheetPair({required this.left, required this.right});

  final Widget left;
  final Widget right;

  @override
  Widget build(BuildContext context) => Row(
    crossAxisAlignment: CrossAxisAlignment.start,
    children: [
      Expanded(child: left),
      const SizedBox(width: Sp.md),
      Expanded(child: right),
    ],
  );
}

class _SheetSwitch extends StatelessWidget {
  const _SheetSwitch({
    required this.label,
    required this.hint,
    required this.value,
    required this.onChanged,
  });

  final String label;
  final String hint;
  final bool value;
  final ValueChanged<bool> onChanged;

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    return Padding(
      padding: const EdgeInsets.only(bottom: Sp.md),
      child: Row(
        children: [
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  label,
                  style: AppTypography.body(
                    size: 13.5,
                    weight: FontWeight.w600,
                    color: c.foreground,
                  ),
                ),
                Text(
                  hint,
                  style: AppTypography.body(
                    size: 11.5,
                    color: c.mutedForeground,
                  ),
                ),
              ],
            ),
          ),
          Switch(value: value, onChanged: onChanged),
        ],
      ),
    );
  }
}

// ============================================================= rate plans ==

/// §12/13 — the rate plans a guest can actually book this room type on.
class RatePlansSection extends ConsumerWidget {
  const RatePlansSection({super.key, required this.roomTypeId});

  final String roomTypeId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final plans = ref.watch(ratePlansProvider(roomTypeId));

    return _SectionCard(
      title: 'Rates & rate plans',
      subtitle:
          'Define how this room is priced and which rate plans are available.',
      trailing: PermissionGate(
        permission: P.roomTypeCreate,
        child: TextButton.icon(
          onPressed: () => _edit(context, ref, null),
          icon: const Icon(Icons.add, size: 16),
          label: const Text('Add rate plan'),
        ),
      ),
      child: plans.when(
        loading: () => const _SectionLoading(),
        error: (error, _) => ErrorState(
          error: error,
          onRetry: () => ref.invalidate(ratePlansProvider(roomTypeId)),
        ),
        data: (rows) {
          if (rows.isEmpty) {
            return EmptyState(
              title: 'No rate plans yet',
              hint: 'Add a rate plan so this room can be sold.',
              icon: Icons.sell_outlined,
              action: PermissionGate(
                permission: P.roomTypeCreate,
                child: FilledButton.icon(
                  onPressed: () => _edit(context, ref, null),
                  icon: const Icon(Icons.add, size: 16),
                  label: const Text('Add rate plan'),
                ),
              ),
            );
          }
          return Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              for (final (index, plan) in rows.indexed)
                _ListRow(
                  first: index == 0,
                  child: _planRow(context, ref, plan),
                ),
            ],
          );
        },
      ),
    );
  }

  Widget _planRow(BuildContext context, WidgetRef ref, RatePlan plan) {
    final c = context.colors;
    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  Flexible(
                    child: Text(
                      plan.name,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: AppTypography.body(
                        size: 13.5,
                        weight: FontWeight.w600,
                        color: c.foreground,
                      ),
                    ),
                  ),
                  const SizedBox(width: Sp.sm),
                  StatusBadge(
                    label: plan.status.label,
                    tone: plan.status.tone,
                    dense: true,
                  ),
                ],
              ),
              Text(
                '${rupees(plan.basePricePaise)} /night',
                style: AppTypography.numeric(
                  size: 13,
                  weight: FontWeight.w600,
                  color: c.foreground,
                ),
              ),
              Text(
                plan.summary,
                style: AppTypography.body(size: 11.5, color: c.mutedForeground),
              ),
            ],
          ),
        ),
        _RowMenu(
          items: [
            const PopupMenuItem(value: 'edit', child: Text('Edit')),
            PopupMenuItem(
              value: 'status',
              child: Text(plan.isActive ? 'Deactivate' : 'Activate'),
            ),
            const PopupMenuItem(value: 'delete', child: Text('Delete')),
          ],
          onSelected: (action) => _run(context, ref, plan, action),
        ),
      ],
    );
  }

  Future<void> _run(
    BuildContext context,
    WidgetRef ref,
    RatePlan plan,
    String action,
  ) async {
    if (action == 'edit') {
      await _edit(context, ref, plan);
      return;
    }

    final messenger = ScaffoldMessenger.of(context);
    if (action == 'delete') {
      final ok = await _confirm(
        context,
        title: 'Delete ${plan.name}?',
        body:
            'This rate plan will no longer be sellable. Existing reservations '
            'booked on it are not affected.',
      );
      if (!ok) return;
      try {
        await ref
            .read(unitsActionsProvider)
            .deleteRatePlan(roomTypeId, plan.id);
        messenger.showSnackBar(SnackBar(content: Text('${plan.name} deleted')));
      } catch (error) {
        messenger.showSnackBar(SnackBar(content: Text(_friendlyError(error))));
      }
      return;
    }

    final next = plan.isActive
        ? RatePlanStatus.inactive
        : RatePlanStatus.active;
    try {
      await ref
          .read(unitsActionsProvider)
          .setRatePlanStatus(roomTypeId, plan.id, next);
      messenger.showSnackBar(
        SnackBar(
          content: Text('${plan.name} is now ${next.label.toLowerCase()}'),
        ),
      );
    } catch (error) {
      messenger.showSnackBar(SnackBar(content: Text(_friendlyError(error))));
    }
  }

  Future<void> _edit(
    BuildContext context,
    WidgetRef ref,
    RatePlan? plan,
  ) async {
    final messenger = ScaffoldMessenger.of(context);
    final saved = await _openSheet<String>(
      context,
      (_) => _RatePlanSheet(roomTypeId: roomTypeId, plan: plan),
    );
    if (saved == null) return;
    messenger.showSnackBar(SnackBar(content: Text(saved)));
  }
}

/// The rate plan editor. It saves itself so the server's typed error can be
/// shown against the form the user is still looking at, and pops the success
/// line for the caller to announce.
class _RatePlanSheet extends ConsumerStatefulWidget {
  const _RatePlanSheet({required this.roomTypeId, this.plan});

  final String roomTypeId;
  final RatePlan? plan;

  @override
  ConsumerState<_RatePlanSheet> createState() => _RatePlanSheetState();
}

class _RatePlanSheetState extends ConsumerState<_RatePlanSheet> {
  late final TextEditingController _name;
  late final TextEditingController _price;
  late final TextEditingController _note;
  late final TextEditingController _minStay;
  late final TextEditingController _maxStay;
  late final TextEditingController _minAdvance;
  late final TextEditingController _maxAdvance;
  late final TextEditingController _extraAdult;
  late final TextEditingController _extraChild;
  late final TextEditingController _extraInfant;

  late MealPlan _meal;
  late CancellationPolicy _cancellation;
  late PaymentPolicy _payment;
  late bool _active;

  String? _error;
  bool _saving = false;

  @override
  void initState() {
    super.initState();
    final plan = widget.plan;
    _name = TextEditingController(text: plan?.name ?? '');
    // Prices live as paise on the wire and as rupees in the field — this is the
    // only place the two representations meet.
    _price = TextEditingController(
      text: plan == null ? '' : _decimalText(plan.basePricePaise),
    );
    _note = TextEditingController(text: plan?.cancellationNote ?? '');
    _minStay = TextEditingController(text: plan?.minStay?.toString() ?? '');
    _maxStay = TextEditingController(text: plan?.maxStay?.toString() ?? '');
    _minAdvance = TextEditingController(
      text: plan?.minAdvanceDays?.toString() ?? '',
    );
    _maxAdvance = TextEditingController(
      text: plan?.maxAdvanceDays?.toString() ?? '',
    );
    _extraAdult = TextEditingController(
      text: _decimalText(plan?.extraAdultPaise ?? 0),
    );
    _extraChild = TextEditingController(
      text: _decimalText(plan?.extraChildPaise ?? 0),
    );
    _extraInfant = TextEditingController(
      text: _decimalText(plan?.extraInfantPaise ?? 0),
    );
    _meal = plan?.mealPlan ?? MealPlan.roomOnly;
    _cancellation = plan?.cancellationPolicy ?? CancellationPolicy.flexible;
    _payment = plan?.paymentPolicy ?? PaymentPolicy.payAtProperty;
    _active = plan?.isActive ?? true;
  }

  @override
  void dispose() {
    for (final controller in [
      _name,
      _price,
      _note,
      _minStay,
      _maxStay,
      _minAdvance,
      _maxAdvance,
      _extraAdult,
      _extraChild,
      _extraInfant,
    ]) {
      controller.dispose();
    }
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return _SheetScaffold(
      title: widget.plan == null ? 'Add rate plan' : 'Edit rate plan',
      error: _error,
      saving: _saving,
      onSave: _save,
      saveLabel: widget.plan == null ? 'Create rate plan' : 'Save changes',
      fields: [
        _SheetField(
          label: 'Name *',
          controller: _name,
          hint: 'Standard rate',
          autofocus: widget.plan == null,
        ),
        _SheetField(
          label: 'Base price',
          controller: _price,
          hint: '0',
          suffix: '₹ / night',
          helper: 'In rupees. Stored to the paisa.',
          numeric: true,
          decimal: true,
        ),
        _SheetDropdown<MealPlan>(
          label: 'Meal plan',
          value: _meal,
          options: MealPlan.values,
          labelOf: (m) => m.label,
          onChanged: (m) => setState(() => _meal = m),
        ),
        _SheetDropdown<CancellationPolicy>(
          label: 'Cancellation policy',
          value: _cancellation,
          options: CancellationPolicy.values,
          labelOf: (p) => p.label,
          onChanged: (p) => setState(() => _cancellation = p),
        ),
        if (_cancellation == CancellationPolicy.custom)
          _SheetField(
            label: 'Cancellation note',
            controller: _note,
            hint: 'Free cancellation up to 48 hours before arrival',
          ),
        _SheetDropdown<PaymentPolicy>(
          label: 'Payment policy',
          value: _payment,
          options: PaymentPolicy.values,
          labelOf: (p) => p.label,
          onChanged: (p) => setState(() => _payment = p),
        ),
        _SheetPair(
          left: _SheetField(
            label: 'Min stay',
            controller: _minStay,
            hint: 'Any',
            suffix: 'nights',
            numeric: true,
          ),
          right: _SheetField(
            label: 'Max stay',
            controller: _maxStay,
            hint: 'Any',
            suffix: 'nights',
            numeric: true,
          ),
        ),
        _SheetPair(
          left: _SheetField(
            label: 'Min advance',
            controller: _minAdvance,
            hint: 'Any',
            suffix: 'days',
            numeric: true,
          ),
          right: _SheetField(
            label: 'Max advance',
            controller: _maxAdvance,
            hint: 'Any',
            suffix: 'days',
            numeric: true,
          ),
        ),
        _SheetPair(
          left: _SheetField(
            label: 'Extra adult',
            controller: _extraAdult,
            suffix: '₹',
            numeric: true,
            decimal: true,
          ),
          right: _SheetField(
            label: 'Extra child',
            controller: _extraChild,
            suffix: '₹',
            numeric: true,
            decimal: true,
          ),
        ),
        _SheetField(
          label: 'Extra infant',
          controller: _extraInfant,
          suffix: '₹',
          numeric: true,
          decimal: true,
        ),
        _SheetSwitch(
          label: 'Active',
          hint: 'Inactive plans stay on file but cannot be booked.',
          value: _active,
          onChanged: (v) => setState(() => _active = v),
        ),
      ],
    );
  }

  Future<void> _save() async {
    final name = _name.text.trim();
    if (name.isEmpty) {
      setState(() => _error = 'Give the rate plan a name.');
      return;
    }

    final basePaise = _price.text.trim().isEmpty ? 0 : _hundredths(_price.text);
    if (basePaise == null) {
      setState(
        () => _error = 'Enter the base price as a plain amount, e.g. 2500.',
      );
      return;
    }

    final extras = <String, int?>{
      'Extra adult price': _extraAdult.text.trim().isEmpty
          ? 0
          : _hundredths(_extraAdult.text),
      'Extra child price': _extraChild.text.trim().isEmpty
          ? 0
          : _hundredths(_extraChild.text),
      'Extra infant price': _extraInfant.text.trim().isEmpty
          ? 0
          : _hundredths(_extraInfant.text),
    };
    for (final entry in extras.entries) {
      if (entry.value == null) {
        setState(() => _error = '${entry.key} must be zero or more.');
        return;
      }
    }

    final minStay = _wholeOrNull(_minStay.text);
    final maxStay = _wholeOrNull(_maxStay.text);
    final minAdvance = _wholeOrNull(_minAdvance.text);
    final maxAdvance = _wholeOrNull(_maxAdvance.text);
    if (minStay != null && maxStay != null && maxStay < minStay) {
      setState(() => _error = 'Max stay must be at least the min stay.');
      return;
    }
    if (minAdvance != null && maxAdvance != null && maxAdvance < minAdvance) {
      setState(
        () => _error = 'Max advance booking must be at least the minimum.',
      );
      return;
    }

    final note = _note.text.trim();
    final input = RatePlanInput(
      roomTypeId: widget.roomTypeId,
      name: name,
      basePricePaise: basePaise,
      mealPlan: _meal,
      cancellationPolicy: _cancellation,
      cancellationNote:
          _cancellation == CancellationPolicy.custom && note.isNotEmpty
          ? note
          : null,
      paymentPolicy: _payment,
      minStay: minStay,
      maxStay: maxStay,
      minAdvanceDays: minAdvance,
      maxAdvanceDays: maxAdvance,
      extraAdultPaise: extras['Extra adult price']!,
      extraChildPaise: extras['Extra child price']!,
      extraInfantPaise: extras['Extra infant price']!,
      status: _active ? RatePlanStatus.active : RatePlanStatus.inactive,
    );

    setState(() {
      _saving = true;
      _error = null;
    });

    final navigator = Navigator.of(context);
    final actions = ref.read(unitsActionsProvider);
    final existing = widget.plan;
    try {
      if (existing == null) {
        await actions.createRatePlan(input);
      } else {
        await actions.updateRatePlan(
          widget.roomTypeId,
          existing.id,
          input.toJson(),
        );
      }
      if (!mounted) return;
      navigator.pop(existing == null ? '$name added' : '$name saved');
    } catch (error) {
      if (!mounted) return;
      setState(() {
        _saving = false;
        _error = _friendlyError(error);
      });
    }
  }
}

// ============================================================ taxes & fees ==

/// §14 — the taxes, service charges and fees layered on top of the rate, with a
/// live preview of what a guest would actually pay.
class TaxesFeesSection extends ConsumerWidget {
  const TaxesFeesSection({
    super.key,
    required this.roomTypeId,
    required this.baseRatePaise,
    required this.pricesIncludeTax,
    required this.onPricesIncludeTaxChanged,
  });

  final String roomTypeId;
  final int baseRatePaise;
  final bool pricesIncludeTax;
  final ValueChanged<bool> onPricesIncludeTaxChanged;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final fees = ref.watch(roomTypeFeesProvider(roomTypeId));

    return _Collapsible(
      title: 'Taxes & fees',
      subtitle: 'How tax is quoted, and what is added on top of the rate.',
      summary: fees.valueOrNull == null
          ? null
          : '${fees.value!.length} ${fees.value!.length == 1 ? 'charge' : 'charges'}',
      builder: (context) => Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Align(
            alignment: Alignment.centerLeft,
            child: Segmented<bool>(
              options: const [false, true],
              value: pricesIncludeTax,
              labelOf: (v) =>
                  v ? 'Prices include taxes' : 'Prices exclude taxes',
              onChanged: onPricesIncludeTaxChanged,
            ),
          ),
          gapMd,
          fees.when(
            loading: () => const _SectionLoading(),
            error: (error, _) => ErrorState(
              error: error,
              onRetry: () => ref.invalidate(roomTypeFeesProvider(roomTypeId)),
            ),
            data: (rows) => Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                if (rows.isEmpty)
                  const EmptyState(
                    title: 'No taxes or fees',
                    hint:
                        'Add the taxes and charges that apply to this room type '
                        'so guest prices are accurate.',
                    icon: Icons.receipt_long_outlined,
                  )
                else
                  for (final (index, fee) in rows.indexed)
                    _ListRow(
                      first: index == 0,
                      child: _feeRow(context, ref, fee),
                    ),
                gapSm,
                Align(
                  alignment: Alignment.centerLeft,
                  child: PermissionGate(
                    permission: P.roomTypeCreate,
                    child: TextButton.icon(
                      onPressed: () => _edit(context, ref, null),
                      icon: const Icon(Icons.add, size: 16),
                      label: const Text('Add fee'),
                    ),
                  ),
                ),
                gapSm,
                _preview(context, rows),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _feeRow(BuildContext context, WidgetRef ref, RoomTypeFee fee) {
    final c = context.colors;
    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                fee.name,
                style: AppTypography.body(
                  size: 13.5,
                  weight: FontWeight.w600,
                  color: c.foreground,
                ),
              ),
              Text(
                '${fee.kind.label} · ${fee.ruleLabel}',
                style: AppTypography.body(size: 11.5, color: c.mutedForeground),
              ),
            ],
          ),
        ),
        Text(
          fee.valueLabel,
          style: AppTypography.numeric(
            size: 13,
            weight: FontWeight.w600,
            color: c.foreground,
          ),
        ),
        _RowMenu(
          items: const [
            PopupMenuItem(value: 'edit', child: Text('Edit')),
            PopupMenuItem(value: 'delete', child: Text('Delete')),
          ],
          onSelected: (action) => _run(context, ref, fee, action),
        ),
      ],
    );
  }

  /// What one guest-facing night costs today, computed by the same arithmetic
  /// the server uses so the preview cannot quietly disagree with the folio.
  Widget _preview(BuildContext context, List<RoomTypeFee> fees) {
    final c = context.colors;
    final preview = PricePreview.compute(
      basePaise: baseRatePaise,
      fees: fees,
      nights: 1,
      guests: 2,
      pricesIncludeTax: pricesIncludeTax,
    );

    Widget line(String label, int paise, {bool bold = false}) => Padding(
      padding: const EdgeInsets.symmetric(vertical: 2),
      child: Row(
        children: [
          Expanded(
            child: Text(
              label,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: AppTypography.body(
                size: 12.5,
                weight: bold ? FontWeight.w700 : FontWeight.w400,
                color: bold ? c.foreground : c.mutedForeground,
              ),
            ),
          ),
          Text(
            rupees(paise),
            style: AppTypography.numeric(
              size: 12.5,
              weight: bold ? FontWeight.w700 : FontWeight.w500,
              color: c.foreground,
            ),
          ),
        ],
      ),
    );

    return Container(
      padding: const EdgeInsets.all(Sp.md),
      decoration: BoxDecoration(
        color: c.muted,
        borderRadius: R.rMd,
        border: Border.all(color: c.border),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          const LabelXs('Guest price · 1 night, 2 guests'),
          const SizedBox(height: 6),
          line('Room rate', preview.basePaise),
          for (final item in preview.lines) line(item.name, item.amountPaise),
          const SizedBox(height: 4),
          const RowDivider(),
          const SizedBox(height: 4),
          line('Guest price', preview.guestTotalPaise, bold: true),
          if (pricesIncludeTax && preview.taxTotalPaise > 0)
            Padding(
              padding: const EdgeInsets.only(top: 4),
              child: Text(
                'Includes ${rupees(preview.taxTotalPaise)} of taxes and fees.',
                style: AppTypography.body(size: 11, color: c.mutedForeground),
              ),
            ),
        ],
      ),
    );
  }

  Future<void> _run(
    BuildContext context,
    WidgetRef ref,
    RoomTypeFee fee,
    String action,
  ) async {
    if (action == 'edit') {
      await _edit(context, ref, fee);
      return;
    }

    final messenger = ScaffoldMessenger.of(context);
    final ok = await _confirm(
      context,
      title: 'Delete ${fee.name}?',
      body: 'It will stop being added to new bookings of this room type.',
    );
    if (!ok) return;
    try {
      await ref.read(unitsActionsProvider).deleteFee(roomTypeId, fee.id);
      messenger.showSnackBar(SnackBar(content: Text('${fee.name} deleted')));
    } catch (error) {
      messenger.showSnackBar(SnackBar(content: Text(_friendlyError(error))));
    }
  }

  Future<void> _edit(
    BuildContext context,
    WidgetRef ref,
    RoomTypeFee? fee,
  ) async {
    final messenger = ScaffoldMessenger.of(context);
    final saved = await _openSheet<String>(
      context,
      (_) => _FeeSheet(roomTypeId: roomTypeId, fee: fee),
    );
    if (saved == null) return;
    messenger.showSnackBar(SnackBar(content: Text(saved)));
  }
}

/// A card whose body can be folded away. Taxes & fees is long and rarely
/// changed, so it stays out of the way until someone asks for it.
class _Collapsible extends StatefulWidget {
  const _Collapsible({
    required this.title,
    required this.builder,
    this.subtitle,
    this.summary,
  });

  final String title;
  final String? subtitle;

  /// A one-line hint of what is inside, shown while collapsed.
  final String? summary;
  final WidgetBuilder builder;

  @override
  State<_Collapsible> createState() => _CollapsibleState();
}

class _CollapsibleState extends State<_Collapsible> {
  bool _open = false;

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    return _SectionCard(
      title: widget.title,
      header: InkWell(
        onTap: () => setState(() => _open = !_open),
        borderRadius: R.rMd,
        child: Row(
          children: [
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    widget.title,
                    style: AppTypography.body(
                      size: 15,
                      weight: FontWeight.w700,
                      color: c.foreground,
                    ),
                  ),
                  Text(
                    _open
                        ? (widget.subtitle ?? '')
                        : (widget.summary ?? widget.subtitle ?? ''),
                    style: AppTypography.body(
                      size: 12,
                      color: c.mutedForeground,
                    ),
                  ),
                ],
              ),
            ),
            Icon(
              _open ? Icons.expand_less : Icons.expand_more,
              size: 20,
              color: c.mutedForeground,
            ),
          ],
        ),
      ),
      child: AnimatedCrossFade(
        duration: const Duration(milliseconds: 180),
        firstChild: const SizedBox(width: double.infinity),
        secondChild: Builder(builder: widget.builder),
        crossFadeState: _open
            ? CrossFadeState.showSecond
            : CrossFadeState.showFirst,
        sizeCurve: Curves.easeOut,
      ),
    );
  }
}

/// The fee editor. Percentages are typed as percent and stored as basis points;
/// fixed amounts are typed as rupees and stored as paise. Both are the server's
/// own encoding, so nothing is rounded on the way out.
class _FeeSheet extends ConsumerStatefulWidget {
  const _FeeSheet({required this.roomTypeId, this.fee});

  final String roomTypeId;
  final RoomTypeFee? fee;

  @override
  ConsumerState<_FeeSheet> createState() => _FeeSheetState();
}

class _FeeSheetState extends ConsumerState<_FeeSheet> {
  late final TextEditingController _name;
  late final TextEditingController _value;

  late FeeKind _kind;
  late FeeCalculation _calculation;
  late FeeBasis _basis;
  late FeePeriod _period;

  String? _error;
  bool _saving = false;

  @override
  void initState() {
    super.initState();
    final fee = widget.fee;
    _name = TextEditingController(text: fee?.name ?? '');
    // Both encodings are hundredths of their own unit, so one formatter serves.
    _value = TextEditingController(
      text: fee == null ? '' : _decimalText(fee.value),
    );
    _kind = fee?.kind ?? FeeKind.tax;
    _calculation = fee?.calculation ?? FeeCalculation.percent;
    _basis = fee?.basis ?? FeeBasis.perRoom;
    _period = fee?.period ?? FeePeriod.perNight;
  }

  @override
  void dispose() {
    _name.dispose();
    _value.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final percent = _calculation == FeeCalculation.percent;
    return _SheetScaffold(
      title: widget.fee == null ? 'Add fee' : 'Edit fee',
      error: _error,
      saving: _saving,
      onSave: _save,
      saveLabel: widget.fee == null ? 'Add fee' : 'Save changes',
      fields: [
        _SheetField(
          label: 'Name *',
          controller: _name,
          hint: percent ? 'GST' : 'Resort fee',
          autofocus: widget.fee == null,
        ),
        _SheetDropdown<FeeKind>(
          label: 'Kind',
          value: _kind,
          options: FeeKind.values,
          labelOf: (k) => k.label,
          onChanged: (k) => setState(() => _kind = k),
        ),
        _SheetDropdown<FeeCalculation>(
          label: 'Calculation',
          value: _calculation,
          options: FeeCalculation.values,
          labelOf: (c) => c.label,
          onChanged: (c) => setState(() => _calculation = c),
        ),
        _SheetField(
          label: percent ? 'Percentage' : 'Amount',
          controller: _value,
          hint: percent ? '12.5' : '0',
          suffix: percent ? '%' : '₹',
          helper: percent
              ? 'A percentage of the room rate, e.g. 12.5 for 12.5%.'
              : 'A flat amount in rupees.',
          numeric: true,
          decimal: true,
        ),
        _SheetDropdown<FeeBasis>(
          label: 'Charged',
          value: _basis,
          options: FeeBasis.values,
          labelOf: (b) => b.label,
          onChanged: (b) => setState(() => _basis = b),
        ),
        _SheetDropdown<FeePeriod>(
          label: 'Period',
          value: _period,
          options: FeePeriod.values,
          labelOf: (p) => p.label,
          onChanged: (p) => setState(() => _period = p),
        ),
      ],
    );
  }

  Future<void> _save() async {
    final name = _name.text.trim();
    if (name.isEmpty) {
      setState(() => _error = 'Give this charge a name.');
      return;
    }

    final value = _value.text.trim().isEmpty ? 0 : _hundredths(_value.text);
    if (value == null) {
      setState(() => _error = 'Enter the value as a plain number, e.g. 12.5.');
      return;
    }
    if (_calculation == FeeCalculation.percent && value > 10000) {
      setState(() => _error = 'A percentage cannot be more than 100%.');
      return;
    }

    setState(() {
      _saving = true;
      _error = null;
    });

    final navigator = Navigator.of(context);
    final actions = ref.read(unitsActionsProvider);
    final existing = widget.fee;
    final fee = RoomTypeFee(
      id: existing?.id ?? '',
      roomTypeId: widget.roomTypeId,
      name: name,
      value: value,
      kind: _kind,
      calculation: _calculation,
      basis: _basis,
      period: _period,
    );

    try {
      if (existing == null) {
        await actions.createFee(widget.roomTypeId, fee);
      } else {
        await actions.updateFee(widget.roomTypeId, existing.id, fee.toJson());
      }
      if (!mounted) return;
      navigator.pop(existing == null ? '$name added' : '$name saved');
    } catch (error) {
      if (!mounted) return;
      setState(() {
        _saving = false;
        _error = _friendlyError(error);
      });
    }
  }
}

// ========================================================= dynamic pricing ==

/// §15 — rules that move the rate automatically. Off by default, and compact
/// while off: a property that does not use it should not have to scroll past it.
class DynamicPricingSection extends ConsumerWidget {
  const DynamicPricingSection({
    super.key,
    required this.roomTypeId,
    required this.enabled,
    required this.onEnabledChanged,
  });

  final String roomTypeId;
  final bool enabled;
  final ValueChanged<bool> onEnabledChanged;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final c = context.colors;

    return _SectionCard(
      title: 'Dynamic pricing',
      subtitle: 'Adjust rates automatically as demand changes.',
      trailing: Switch(value: enabled, onChanged: onEnabledChanged),
      child: !enabled
          ? Text(
              'Turn this on to adjust rates automatically by occupancy, season '
              'or length of stay.',
              style: AppTypography.body(size: 12.5, color: c.mutedForeground),
            )
          : _rules(context, ref),
    );
  }

  Widget _rules(BuildContext context, WidgetRef ref) {
    final rules = ref.watch(pricingRulesProvider(roomTypeId));

    return rules.when(
      loading: () => const _SectionLoading(),
      error: (error, _) => ErrorState(
        error: error,
        onRetry: () => ref.invalidate(pricingRulesProvider(roomTypeId)),
      ),
      data: (rows) => Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          if (rows.isEmpty)
            const EmptyState(
              title: 'No pricing rules yet',
              hint:
                  'Add a rule to raise or lower the rate when occupancy, dates '
                  'or length of stay change.',
              icon: Icons.auto_graph_outlined,
            )
          else
            for (final (index, rule) in rows.indexed)
              _ListRow(first: index == 0, child: _ruleRow(context, ref, rule)),
          gapSm,
          Align(
            alignment: Alignment.centerLeft,
            child: PermissionGate(
              permission: P.roomTypeCreate,
              child: TextButton.icon(
                onPressed: () => _edit(context, ref, null),
                icon: const Icon(Icons.add, size: 16),
                label: const Text('Add rule'),
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _ruleRow(BuildContext context, WidgetRef ref, PricingRule rule) {
    final c = context.colors;
    final canEdit = ref.watch(canProvider(P.roomTypeUpdate));

    return Row(
      crossAxisAlignment: CrossAxisAlignment.center,
      children: [
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                '${rule.conditionLabel} → ${rule.adjustmentLabel}',
                style: AppTypography.body(
                  size: 13,
                  weight: FontWeight.w600,
                  color: rule.enabled ? c.foreground : c.mutedForeground,
                ),
              ),
              Text(
                rule.trigger.label,
                style: AppTypography.body(size: 11.5, color: c.mutedForeground),
              ),
            ],
          ),
        ),
        Switch(
          value: rule.enabled,
          onChanged: canEdit ? (v) => _toggle(context, ref, rule, v) : null,
        ),
        _RowMenu(
          items: const [
            PopupMenuItem(value: 'edit', child: Text('Edit')),
            PopupMenuItem(value: 'delete', child: Text('Delete')),
          ],
          onSelected: (action) => _run(context, ref, rule, action),
        ),
      ],
    );
  }

  Future<void> _toggle(
    BuildContext context,
    WidgetRef ref,
    PricingRule rule,
    bool value,
  ) async {
    final messenger = ScaffoldMessenger.of(context);
    try {
      await ref.read(unitsActionsProvider).updatePricingRule(
        roomTypeId,
        rule.id,
        {'enabled': value},
      );
      messenger.showSnackBar(
        SnackBar(content: Text(value ? 'Rule enabled' : 'Rule disabled')),
      );
    } catch (error) {
      messenger.showSnackBar(SnackBar(content: Text(_friendlyError(error))));
    }
  }

  Future<void> _run(
    BuildContext context,
    WidgetRef ref,
    PricingRule rule,
    String action,
  ) async {
    if (action == 'edit') {
      await _edit(context, ref, rule);
      return;
    }

    final messenger = ScaffoldMessenger.of(context);
    final ok = await _confirm(
      context,
      title: 'Delete this rule?',
      body: '${rule.conditionLabel} → ${rule.adjustmentLabel}',
    );
    if (!ok) return;
    try {
      await ref
          .read(unitsActionsProvider)
          .deletePricingRule(roomTypeId, rule.id);
      messenger.showSnackBar(const SnackBar(content: Text('Rule deleted')));
    } catch (error) {
      messenger.showSnackBar(SnackBar(content: Text(_friendlyError(error))));
    }
  }

  Future<void> _edit(
    BuildContext context,
    WidgetRef ref,
    PricingRule? rule,
  ) async {
    final messenger = ScaffoldMessenger.of(context);
    final saved = await _openSheet<String>(
      context,
      (_) => _PricingRuleSheet(roomTypeId: roomTypeId, rule: rule),
    );
    if (saved == null) return;
    messenger.showSnackBar(SnackBar(content: Text(saved)));
  }
}

/// The rule editor. The condition half of the form follows the trigger: a
/// season is a pair of dates, everything else is a comparator and a threshold.
class _PricingRuleSheet extends ConsumerStatefulWidget {
  const _PricingRuleSheet({required this.roomTypeId, this.rule});

  final String roomTypeId;
  final PricingRule? rule;

  @override
  ConsumerState<_PricingRuleSheet> createState() => _PricingRuleSheetState();
}

class _PricingRuleSheetState extends ConsumerState<_PricingRuleSheet> {
  late final TextEditingController _threshold;
  late final TextEditingController _amount;

  late PricingTrigger _trigger;
  late Comparator _comparator;
  late AdjustmentKind _kind;
  late bool _increase;
  DateTime? _start;
  DateTime? _end;

  String? _error;
  bool _saving = false;

  @override
  void initState() {
    super.initState();
    final rule = widget.rule;
    _threshold = TextEditingController(text: rule?.threshold?.toString() ?? '');
    _amount = TextEditingController(
      text: rule == null ? '' : _decimalText(rule.adjustmentValue.abs()),
    );
    _trigger = rule?.trigger ?? PricingTrigger.occupancy;
    _comparator = rule?.comparator ?? Comparator.gte;
    _kind = rule?.adjustmentKind ?? AdjustmentKind.percent;
    _increase = rule?.isIncrease ?? true;
    _start = rule?.startDate;
    _end = rule?.endDate;
  }

  @override
  void dispose() {
    _threshold.dispose();
    _amount.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final percent = _kind == AdjustmentKind.percent;

    return _SheetScaffold(
      title: widget.rule == null ? 'Add pricing rule' : 'Edit pricing rule',
      error: _error,
      saving: _saving,
      onSave: _save,
      saveLabel: widget.rule == null ? 'Add rule' : 'Save changes',
      fields: [
        _SheetDropdown<PricingTrigger>(
          label: 'Trigger',
          value: _trigger,
          options: PricingTrigger.values,
          labelOf: (t) => t.label,
          onChanged: (t) => setState(() => _trigger = t),
        ),
        if (_trigger.usesDates)
          _SheetPair(
            left: _dateField(
              'Start date',
              _start,
              (d) => setState(() => _start = d),
            ),
            right: _dateField(
              'End date',
              _end,
              (d) => setState(() => _end = d),
            ),
          )
        else ...[
          _SheetDropdown<Comparator>(
            label: 'Condition',
            value: _comparator,
            options: Comparator.values,
            labelOf: (c) => c.label,
            onChanged: (c) => setState(() => _comparator = c),
          ),
          _SheetField(
            label: 'Threshold',
            controller: _threshold,
            hint: '0',
            suffix: _trigger.unit.isEmpty ? null : _trigger.unit,
            numeric: true,
          ),
        ],
        _SheetDropdown<AdjustmentKind>(
          label: 'Adjustment',
          value: _kind,
          options: AdjustmentKind.values,
          labelOf: (k) => k.label,
          onChanged: (k) => setState(() => _kind = k),
        ),
        Padding(
          padding: const EdgeInsets.only(bottom: Sp.md),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const LabelXs('Direction'),
              const SizedBox(height: 4),
              Segmented<bool>(
                options: const [true, false],
                value: _increase,
                labelOf: (v) => v ? 'Increase' : 'Reduce',
                onChanged: (v) => setState(() => _increase = v),
              ),
            ],
          ),
        ),
        _SheetField(
          label: 'Adjustment value',
          controller: _amount,
          hint: percent ? '15' : '0',
          suffix: percent ? '%' : '₹',
          helper: percent
              ? 'A percentage of the rate, e.g. 15 for 15%.'
              : 'A flat amount in rupees.',
          numeric: true,
          decimal: true,
        ),
      ],
    );
  }

  Widget _dateField(
    String label,
    DateTime? value,
    ValueChanged<DateTime> onPick,
  ) {
    final c = context.colors;
    return Padding(
      padding: const EdgeInsets.only(bottom: Sp.md),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          LabelXs(label),
          const SizedBox(height: 4),
          OutlinedButton.icon(
            onPressed: () async {
              final now = DateTime.now();
              final picked = await showDatePicker(
                context: context,
                initialDate: value ?? now,
                firstDate: DateTime(now.year - 1),
                lastDate: DateTime(now.year + 5),
              );
              if (picked != null) onPick(picked);
            },
            icon: const Icon(Icons.event_outlined, size: 16),
            label: Text(
              value == null
                  ? 'Choose'
                  : '${value.day}/${value.month}/${value.year}',
              style: AppTypography.body(size: 12.5, color: c.foreground),
            ),
          ),
        ],
      ),
    );
  }

  Future<void> _save() async {
    int? threshold;
    if (_trigger.usesDates) {
      if (_start == null || _end == null) {
        setState(() => _error = 'Choose both a start and an end date.');
        return;
      }
      if (_end!.isBefore(_start!)) {
        setState(
          () => _error = 'The end date must be on or after the start date.',
        );
        return;
      }
    } else {
      threshold = _wholeOrNull(_threshold.text);
      if (threshold == null) {
        setState(() => _error = 'Enter a threshold for this trigger.');
        return;
      }
    }

    final magnitude = _hundredths(_amount.text);
    if (magnitude == null || magnitude == 0) {
      setState(() => _error = 'Enter an adjustment greater than zero.');
      return;
    }
    if (_kind == AdjustmentKind.percent && magnitude > 10000) {
      setState(() => _error = 'A percentage cannot be more than 100%.');
      return;
    }

    setState(() {
      _saving = true;
      _error = null;
    });

    final navigator = Navigator.of(context);
    final actions = ref.read(unitsActionsProvider);
    final existing = widget.rule;
    final rule = PricingRule(
      id: existing?.id ?? '',
      roomTypeId: widget.roomTypeId,
      trigger: _trigger,
      comparator: _comparator,
      threshold: threshold,
      // Dates only travel with the triggers that use them, so switching a rule
      // from a season to occupancy cannot leave a stale range behind.
      startDate: _trigger.usesDates ? _start : null,
      endDate: _trigger.usesDates ? _end : null,
      adjustmentKind: _kind,
      // The sign carries the direction; the server reads a negative value as a
      // discount rather than needing a separate flag.
      adjustmentValue: _increase ? magnitude : -magnitude,
      enabled: existing?.enabled ?? true,
    );

    try {
      if (existing == null) {
        await actions.createPricingRule(widget.roomTypeId, rule);
      } else {
        await actions.updatePricingRule(
          widget.roomTypeId,
          existing.id,
          rule.toJson(),
        );
      }
      if (!mounted) return;
      navigator.pop(existing == null ? 'Rule added' : 'Rule saved');
    } catch (error) {
      if (!mounted) return;
      setState(() {
        _saving = false;
        _error = _friendlyError(error);
      });
    }
  }
}

// =========================================================== sales channels ==

/// §16 — where this room type is sold.
///
/// Connecting a channel manager is the platform administrator's job; what the
/// hotel owns is the last mile — telling the channel WHICH of its room types
/// this one is. So the section lists the property's real connections with their
/// real health, and the only control it offers is that mapping.
class SalesChannelsSection extends ConsumerWidget {
  const SalesChannelsSection({super.key, required this.roomTypeId});

  final String roomTypeId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final channels = ref.watch(channelMappingsProvider(roomTypeId));

    return _SectionCard(
      title: 'Sales channels',
      subtitle: 'Where this room type can be booked.',
      child: channels.when(
        loading: () => const _SectionLoading(),
        error: (error, _) => ErrorState(
          error: error,
          onRetry: () => ref.invalidate(channelMappingsProvider(roomTypeId)),
        ),
        data: (rows) {
          if (rows.isEmpty) {
            return const EmptyState(
              title: 'No sales channels connected',
              hint:
                  'A platform administrator connects a channel manager, then '
                  'you map this room type to it here.',
              icon: Icons.hub_outlined,
            );
          }
          return Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              for (final (index, channel) in rows.indexed)
                _ListRow(
                  first: index == 0,
                  child: _channelRow(context, ref, channel),
                ),
            ],
          );
        },
      ),
    );
  }

  Widget _channelRow(
    BuildContext context,
    WidgetRef ref,
    ChannelMapping channel,
  ) {
    final c = context.colors;
    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Padding(
          padding: const EdgeInsets.only(top: 2),
          child: Icon(Icons.hub_outlined, size: 16, color: c.mutedForeground),
        ),
        const SizedBox(width: Sp.sm),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Wrap(
                spacing: Sp.sm,
                runSpacing: 4,
                crossAxisAlignment: WrapCrossAlignment.center,
                children: [
                  Text(
                    channel.providerLabel,
                    style: AppTypography.body(
                      size: 13.5,
                      weight: FontWeight.w600,
                      color: c.foreground,
                    ),
                  ),
                  StatusBadge(
                    label: channel.statusLabel,
                    tone: channel.statusTone,
                    dense: true,
                  ),
                  StatusBadge(
                    label: channel.mapped ? 'Mapped' : 'Not mapped',
                    tone: channel.mapped ? StatusTone.info : StatusTone.neutral,
                    dense: true,
                  ),
                ],
              ),
              const SizedBox(height: 2),
              Text(
                channel.mapped
                    ? 'Room type ${channel.channelRoomTypeId}'
                          '${channel.channelRatePlanId == null ? '' : ' · rate plan ${channel.channelRatePlanId}'}'
                    : 'This room type is not sold on this channel yet.',
                style: AppTypography.body(size: 11.5, color: c.mutedForeground),
              ),
            ],
          ),
        ),
        PermissionGate(
          permission: P.roomTypeUpdate,
          child: channel.mapped
              ? _RowMenu(
                  items: const [
                    PopupMenuItem(value: 'edit', child: Text('Edit mapping')),
                    PopupMenuItem(
                      value: 'remove',
                      child: Text('Remove mapping'),
                    ),
                  ],
                  onSelected: (action) => _run(context, ref, channel, action),
                )
              : TextButton(
                  onPressed: () => _map(context, ref, channel),
                  child: const Text('Map'),
                ),
        ),
      ],
    );
  }

  Future<void> _run(
    BuildContext context,
    WidgetRef ref,
    ChannelMapping channel,
    String action,
  ) async {
    if (action == 'edit') {
      await _map(context, ref, channel);
      return;
    }

    final messenger = ScaffoldMessenger.of(context);
    final ok = await _confirm(
      context,
      title: 'Remove ${channel.providerLabel} mapping?',
      body:
          'This room type will stop being synced to ${channel.providerLabel}. '
          'Nothing already booked is affected.',
      confirmLabel: 'Remove',
    );
    if (!ok) return;
    try {
      await ref
          .read(unitsActionsProvider)
          .unmapChannel(roomTypeId, channel.connectionId);
      messenger.showSnackBar(
        SnackBar(content: Text('${channel.providerLabel} mapping removed')),
      );
    } catch (error) {
      messenger.showSnackBar(SnackBar(content: Text(_friendlyError(error))));
    }
  }

  Future<void> _map(
    BuildContext context,
    WidgetRef ref,
    ChannelMapping channel,
  ) async {
    final messenger = ScaffoldMessenger.of(context);
    final saved = await _openSheet<String>(
      context,
      (_) => _ChannelMappingSheet(roomTypeId: roomTypeId, channel: channel),
    );
    if (saved == null) return;
    messenger.showSnackBar(SnackBar(content: Text(saved)));
  }
}

/// The mapping editor. Both ids are the CHANNEL's, copied out of the channel
/// manager — so the sheet says so rather than leaving a receptionist guessing
/// which system the value belongs to.
class _ChannelMappingSheet extends ConsumerStatefulWidget {
  const _ChannelMappingSheet({required this.roomTypeId, required this.channel});

  final String roomTypeId;
  final ChannelMapping channel;

  @override
  ConsumerState<_ChannelMappingSheet> createState() =>
      _ChannelMappingSheetState();
}

class _ChannelMappingSheetState extends ConsumerState<_ChannelMappingSheet> {
  late final TextEditingController _roomTypeId = TextEditingController(
    text: widget.channel.channelRoomTypeId ?? '',
  );
  late final TextEditingController _ratePlanId = TextEditingController(
    text: widget.channel.channelRatePlanId ?? '',
  );

  String? _error;
  bool _saving = false;

  @override
  void dispose() {
    _roomTypeId.dispose();
    _ratePlanId.dispose();
    super.dispose();
  }

  Future<void> _save() async {
    final channelRoomTypeId = _roomTypeId.text.trim();
    if (channelRoomTypeId.isEmpty) {
      setState(() => _error = 'Enter the room type id from the channel.');
      return;
    }

    setState(() {
      _saving = true;
      _error = null;
    });
    try {
      await ref
          .read(unitsActionsProvider)
          .mapChannel(
            widget.roomTypeId,
            widget.channel.connectionId,
            channelRoomTypeId: channelRoomTypeId,
            channelRatePlanId: _ratePlanId.text.trim(),
          );
      if (!mounted) return;
      Navigator.of(context).pop('Mapped to ${widget.channel.providerLabel}');
    } catch (error) {
      if (!mounted) return;
      setState(() {
        _saving = false;
        _error = _friendlyError(error);
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    return _SheetScaffold(
      title: '${widget.channel.providerLabel} mapping',
      error: _error,
      saving: _saving,
      onSave: _save,
      saveLabel: 'Save mapping',
      fields: [
        _SheetField(
          label: 'Channel room type id',
          controller: _roomTypeId,
          autofocus: true,
          helper:
              'The id this room type has in ${widget.channel.providerLabel}. '
              'Copy it from the channel manager.',
        ),
        _SheetField(
          label: 'Channel rate plan id (optional)',
          controller: _ratePlanId,
          helper: 'Leave blank to sync availability only, without prices.',
        ),
      ],
    );
  }
}
