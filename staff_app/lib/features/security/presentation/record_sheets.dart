import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/networking/api_exception.dart';
import '../../../core/offline/offline_providers.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/theme/app_spacing.dart';
import '../data/security_models.dart';
import '../data/security_repository.dart';

/// A field description for the generic record sheet.
class SheetField {
  const SheetField({
    required this.key,
    required this.label,
    this.hint,
    this.required = false,
    this.capitalise = TextCapitalization.sentences,
    this.uppercase = false,
    this.maxLines = 1,
  });

  final String key;
  final String label;
  final String? hint;
  final bool required;
  final TextCapitalization capitalise;
  final bool uppercase;
  final int maxLines;
}

/// One bottom sheet serving every "log something at the gate" flow.
///
/// On a network failure the entry is written to the offline queue instead of
/// being lost — the guard's job does not stop because the WiFi did.
class RecordSheet extends ConsumerStatefulWidget {
  const RecordSheet({
    super.key,
    required this.title,
    required this.subtitle,
    required this.fields,
    required this.submitLabel,
    required this.onSubmit,
    required this.operationType,
    this.extra,
  });

  final String title;
  final String subtitle;
  final List<SheetField> fields;
  final String submitLabel;
  final String operationType;

  /// Performs the write. Throws [ApiException] on failure.
  final Future<void> Function(Map<String, String> values) onSubmit;

  /// Optional widget rendered above the buttons (e.g. a severity picker).
  final Widget Function(BuildContext, void Function(VoidCallback))? extra;

  static Future<bool?> show(BuildContext context, RecordSheet sheet) =>
      showModalBottomSheet<bool>(
        context: context,
        isScrollControlled: true,
        builder: (ctx) => Padding(
          padding: EdgeInsets.only(bottom: MediaQuery.viewInsetsOf(ctx).bottom),
          child: sheet,
        ),
      );

  @override
  ConsumerState<RecordSheet> createState() => RecordSheetState();
}

class RecordSheetState extends ConsumerState<RecordSheet> {
  final _formKey = GlobalKey<FormState>();
  late final Map<String, TextEditingController> _controllers = {
    for (final f in widget.fields) f.key: TextEditingController(),
  };

  /// Extra state the caller's [RecordSheet.extra] can drive.
  final Map<String, Object?> extras = {};

  bool _busy = false;
  String? _error;

  @override
  void dispose() {
    for (final ctl in _controllers.values) {
      ctl.dispose();
    }
    super.dispose();
  }

  Map<String, String> get _values => {
    for (final entry in _controllers.entries)
      entry.key: entry.value.text.trim(),
  };

  Future<void> _submit() async {
    if (!(_formKey.currentState?.validate() ?? false)) return;
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      await widget.onSubmit(_values);
      if (!mounted) return;
      Navigator.of(context).pop(true);
    } on ApiException catch (e) {
      if (e.isNetwork || e.isMissingEndpoint) {
        await ref.read(enqueueMutationProvider)(
          entityId: _values.values.firstWhere(
            (v) => v.isNotEmpty,
            orElse: () => 'new',
          ),
          operationType: widget.operationType,
          payload: _values,
        );
        if (!mounted) return;
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text(
              'Saved on this device — it will be sent when you are online',
            ),
          ),
        );
        Navigator.of(context).pop(true);
        return;
      }
      if (mounted) setState(() => _error = e.message);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    return SafeArea(
      child: Padding(
        padding: const EdgeInsets.fromLTRB(Sp.lg, 0, Sp.lg, Sp.lg),
        child: Form(
          key: _formKey,
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Text(
                widget.title,
                style: Theme.of(context).textTheme.headlineSmall,
              ),
              const SizedBox(height: 4),
              Text(
                widget.subtitle,
                style: Theme.of(
                  context,
                ).textTheme.bodySmall?.copyWith(color: c.mutedForeground),
              ),
              const SizedBox(height: Sp.lg),
              for (final f in widget.fields) ...[
                TextFormField(
                  controller: _controllers[f.key],
                  textCapitalization: f.capitalise,
                  maxLines: f.maxLines,
                  autofocus: f == widget.fields.first,
                  decoration: InputDecoration(
                    labelText: f.label,
                    hintText: f.hint,
                  ),
                  onChanged: f.uppercase
                      ? (v) {
                          final upper = v.toUpperCase();
                          if (upper == v) return;
                          _controllers[f.key]!.value = TextEditingValue(
                            text: upper,
                            selection: TextSelection.collapsed(
                              offset: upper.length,
                            ),
                          );
                        }
                      : null,
                  validator: f.required
                      ? (v) => (v ?? '').trim().isEmpty ? 'Required' : null
                      : null,
                ),
                const SizedBox(height: Sp.md),
              ],
              if (widget.extra != null) widget.extra!(context, setState),
              if (_error != null) ...[
                Text(
                  _error!,
                  style: Theme.of(
                    context,
                  ).textTheme.bodySmall?.copyWith(color: c.destructive),
                ),
                const SizedBox(height: Sp.md),
              ],
              Row(
                children: [
                  Expanded(
                    child: OutlinedButton(
                      onPressed: _busy
                          ? null
                          : () => Navigator.of(context).pop(false),
                      child: const Text('Cancel'),
                    ),
                  ),
                  const SizedBox(width: Sp.sm),
                  Expanded(
                    flex: 2,
                    child: FilledButton(
                      onPressed: _busy ? null : _submit,
                      child: _busy
                          ? const SizedBox(
                              width: 18,
                              height: 18,
                              child: CircularProgressIndicator(strokeWidth: 2),
                            )
                          : Text(widget.submitLabel),
                    ),
                  ),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }
}

/// Ready-made sheets for each gate action.
class SecuritySheets {
  SecuritySheets._();

  static Future<bool?> movement(
    BuildContext context,
    WidgetRef ref,
    GateMovement movement,
  ) {
    final repo = ref.read(securityRepositoryProvider);
    final vehicle = movement.isVehicle;
    return RecordSheet.show(
      context,
      RecordSheet(
        title: movement.label,
        subtitle: vehicle
            ? 'Record the registration number and, if useful, who is driving.'
            : 'Record who is coming through the gate.',
        operationType: 'gate.${movement.wire.toLowerCase()}',
        submitLabel: 'Record',
        fields: [
          SheetField(
            key: 'subject',
            label: vehicle ? 'Registration number' : 'Name or employee ID',
            hint: vehicle ? 'KL 15 AB 1234' : 'e.g. Anu Thomas',
            required: true,
            uppercase: vehicle,
            capitalise: vehicle
                ? TextCapitalization.characters
                : TextCapitalization.words,
          ),
          const SheetField(
            key: 'detail',
            label: 'Note (optional)',
            hint: 'Purpose, driver, gate number…',
          ),
        ],
        onSubmit: (v) => repo.recordMovement(
          movement: movement,
          subject: v['subject']!,
          detail: v['detail'],
        ),
      ),
    );
  }

  static Future<bool?> visitor(BuildContext context, WidgetRef ref) {
    final repo = ref.read(securityRepositoryProvider);
    return RecordSheet.show(
      context,
      RecordSheet(
        title: 'Record a visitor',
        subtitle: 'Who has arrived, and who are they here to see?',
        operationType: 'gate.visitor',
        submitLabel: 'Record visitor',
        fields: const [
          SheetField(
            key: 'name',
            label: 'Visitor name',
            required: true,
            capitalise: TextCapitalization.words,
          ),
          SheetField(
            key: 'visiting',
            label: 'Here to see',
            capitalise: TextCapitalization.words,
          ),
          SheetField(key: 'purpose', label: 'Purpose'),
          SheetField(
            key: 'passNumber',
            label: 'Pass number',
            uppercase: true,
            capitalise: TextCapitalization.characters,
          ),
        ],
        onSubmit: (v) => repo.recordVisitor(
          name: v['name']!,
          visiting: v['visiting'],
          purpose: v['purpose'],
          passNumber: v['passNumber'],
        ),
      ),
    );
  }

  static Future<bool?> foundItem(BuildContext context, WidgetRef ref) {
    final repo = ref.read(securityRepositoryProvider);
    return RecordSheet.show(
      context,
      RecordSheet(
        title: 'Log a found item',
        subtitle: 'Describe it plainly so it can be matched to a claim later.',
        operationType: 'gate.lostfound',
        submitLabel: 'Log item',
        fields: const [
          SheetField(
            key: 'description',
            label: 'What is it?',
            hint: 'Black leather wallet, no ID inside',
            required: true,
            maxLines: 2,
          ),
          SheetField(key: 'location', label: 'Where was it found?'),
        ],
        onSubmit: (v) => repo.logFoundItem(
          description: v['description']!,
          location: v['location'],
        ),
      ),
    );
  }
}
