import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/networking/api_exception.dart';
import '../../../core/theme/app_spacing.dart';
import '../../../core/utils/formatting.dart';
import '../application/travel_desk_controllers.dart';
import '../data/transport_models.dart';

/// Raise or edit a transport request. Pickup time is a date + time pick; fare is
/// entered in rupees and sent as paise.
class TransportFormSheet extends ConsumerStatefulWidget {
  const TransportFormSheet({super.key, this.existing});

  final TransportRequest? existing;

  static Future<void> show(
    BuildContext context,
    WidgetRef ref, {
    TransportRequest? existing,
  }) => showModalBottomSheet<void>(
    context: context,
    isScrollControlled: true,
    showDragHandle: true,
    constraints: BoxConstraints(
      maxHeight: MediaQuery.sizeOf(context).height * 0.92,
    ),
    builder: (_) => TransportFormSheet(existing: existing),
  );

  @override
  ConsumerState<TransportFormSheet> createState() => _TransportFormSheetState();
}

class _TransportFormSheetState extends ConsumerState<TransportFormSheet> {
  final _form = GlobalKey<FormState>();
  late final TextEditingController _guest;
  late final TextEditingController _from;
  late final TextEditingController _to;
  late final TextEditingController _fare;
  late TransportType _type;
  late DateTime _pickup;
  bool _busy = false;
  String? _error;

  @override
  void initState() {
    super.initState();
    final e = widget.existing;
    _guest = TextEditingController(text: e?.guestName ?? '');
    _from = TextEditingController(text: e?.fromLocation ?? '');
    _to = TextEditingController(text: e?.toLocation ?? '');
    _fare = TextEditingController(
      text: e?.farePaise == null
          ? ''
          : (e!.farePaise! / 100).toStringAsFixed(0),
    );
    _type = e?.type ?? TransportType.pickup;
    _pickup = e?.pickupAt ?? DateTime.now().add(const Duration(hours: 1));
  }

  @override
  void dispose() {
    _guest.dispose();
    _from.dispose();
    _to.dispose();
    _fare.dispose();
    super.dispose();
  }

  Future<void> _pickDateTime() async {
    final date = await showDatePicker(
      context: context,
      initialDate: _pickup,
      firstDate: DateTime.now().subtract(const Duration(days: 1)),
      lastDate: DateTime.now().add(const Duration(days: 365)),
    );
    if (date == null || !mounted) return;
    final time = await showTimePicker(
      context: context,
      initialTime: TimeOfDay.fromDateTime(_pickup),
    );
    if (time == null) return;
    setState(() {
      _pickup = DateTime(
        date.year,
        date.month,
        date.day,
        time.hour,
        time.minute,
      );
    });
  }

  Future<void> _save() async {
    if (!_form.currentState!.validate()) return;
    setState(() {
      _busy = true;
      _error = null;
    });
    final farePaise = _fare.text.trim().isEmpty
        ? null
        : ((double.tryParse(_fare.text.trim()) ?? 0) * 100).round();
    final body = <String, dynamic>{
      'guestName': _guest.text.trim(),
      'type': _type.wire,
      'pickupAt': _pickup.toUtc().toIso8601String(),
      if (_from.text.trim().isNotEmpty) 'fromLocation': _from.text.trim(),
      if (_to.text.trim().isNotEmpty) 'toLocation': _to.text.trim(),
      if (farePaise != null) 'farePaise': farePaise,
    };
    final navigator = Navigator.of(context);
    try {
      final actions = ref.read(travelDeskActionsProvider);
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
                widget.existing == null
                    ? 'New transport request'
                    : 'Edit request',
                style: Theme.of(context).textTheme.titleMedium,
              ),
              const SizedBox(height: Sp.md),
              TextFormField(
                controller: _guest,
                decoration: const InputDecoration(labelText: 'Guest name'),
                textCapitalization: TextCapitalization.words,
                validator: (v) =>
                    (v == null || v.trim().isEmpty) ? 'Required' : null,
              ),
              const SizedBox(height: Sp.md),
              DropdownButtonFormField<TransportType>(
                initialValue: _type,
                decoration: const InputDecoration(labelText: 'Type'),
                items: [
                  for (final t in TransportType.values)
                    DropdownMenuItem(value: t, child: Text(t.label)),
                ],
                onChanged: (v) => setState(() => _type = v ?? _type),
              ),
              const SizedBox(height: Sp.md),
              InkWell(
                onTap: _pickDateTime,
                child: InputDecorator(
                  decoration: const InputDecoration(labelText: 'Pickup time'),
                  child: Text(Fmt.dateTime(_pickup)),
                ),
              ),
              const SizedBox(height: Sp.md),
              TextFormField(
                controller: _from,
                decoration: const InputDecoration(labelText: 'From (optional)'),
              ),
              const SizedBox(height: Sp.md),
              TextFormField(
                controller: _to,
                decoration: const InputDecoration(labelText: 'To (optional)'),
              ),
              const SizedBox(height: Sp.md),
              TextFormField(
                controller: _fare,
                decoration: const InputDecoration(
                  labelText: 'Fare (₹, optional)',
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
                    : Text(
                        widget.existing == null
                            ? 'Create request'
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
