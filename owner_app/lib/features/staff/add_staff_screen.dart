import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/api/api_exception.dart';
import '../../core/data/location_repository.dart';
import '../../core/data/owner_repository.dart';
import '../../core/models/owner_models.dart';
import '../../theme/app_theme.dart';
import '../../widgets/ui.dart';

/// Create a General Manager or Assistant General Manager for a property.
class AddStaffScreen extends ConsumerStatefulWidget {
  const AddStaffScreen({super.key, required this.propertyId});
  final String propertyId;
  @override
  ConsumerState<AddStaffScreen> createState() => _AddStaffScreenState();
}

class _AddStaffScreenState extends ConsumerState<AddStaffScreen> {
  final _form = GlobalKey<FormState>();
  final _first = TextEditingController();
  final _last = TextEditingController();
  final _address = TextEditingController();
  final _pin = TextEditingController();
  final _mobile = TextEditingController();
  final _email = TextEditingController();
  StaffRole _role = StaffRole.generalManager;
  String? _state;
  String? _district;
  bool _busy = false;
  String? _error;

  @override
  void dispose() {
    for (final c in [_first, _last, _address, _pin, _mobile, _email]) {
      c.dispose();
    }
    super.dispose();
  }

  Future<void> _submit() async {
    setState(() => _error = null);
    if (!_form.currentState!.validate()) return;
    if (_state == null || _district == null) {
      setState(() => _error = 'Select a state and district.');
      return;
    }
    setState(() => _busy = true);
    try {
      await ref.read(ownerRepositoryProvider).createStaff(widget.propertyId, {
        'role': _role.api,
        'firstName': _first.text.trim(),
        'lastName': _last.text.trim(),
        'address': _address.text.trim(),
        'pinCode': _pin.text.trim(),
        'state': _state,
        'district': _district,
        'mobile': _mobile.text.trim(),
        'email': _email.text.trim(),
      });
      if (!mounted) return;
      ScaffoldMessenger.of(context)
          .showSnackBar(Text('${_role.label} added.').asSnack());
      context.pop();
    } on ApiException catch (e) {
      setState(() => _error = e.message);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final locations = ref.watch(locationsProvider);
    return Scaffold(
      appBar: AppBar(title: const Text('Add manager')),
      body: Form(
        key: _form,
        child: ListView(
          padding: const EdgeInsets.all(20),
          children: [
            if (_error != null) ...[
              Banner2(text: _error!, tone: BannerTone.danger, icon: Icons.error_outline),
              const SizedBox(height: 16),
            ],
            const SectionTitle('Role'),
            const SizedBox(height: 12),
            SegmentedButton<StaffRole>(
              segments: const [
                ButtonSegment(value: StaffRole.generalManager, label: Text('General Manager')),
                ButtonSegment(
                    value: StaffRole.assistantGeneralManager, label: Text('Assistant GM')),
              ],
              selected: {_role},
              onSelectionChanged: (s) => setState(() => _role = s.first),
            ),
            const SizedBox(height: 24),
            const SectionTitle('Personal details'),
            const SizedBox(height: 12),
            Row(children: [
              Expanded(
                child: TextFormField(
                  controller: _first,
                  decoration: const InputDecoration(labelText: 'First name'),
                  validator: _required,
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: TextFormField(
                  controller: _last,
                  decoration: const InputDecoration(labelText: 'Last name'),
                  validator: _required,
                ),
              ),
            ]),
            const SizedBox(height: 14),
            TextFormField(
              controller: _mobile,
              keyboardType: TextInputType.phone,
              inputFormatters: [
                FilteringTextInputFormatter.digitsOnly,
                LengthLimitingTextInputFormatter(10),
              ],
              decoration: const InputDecoration(labelText: 'Mobile number', prefixText: '+91  '),
              validator: (v) =>
                  RegExp(r'^[6-9]\d{9}$').hasMatch(v?.trim() ?? '') ? null : 'Valid mobile number',
            ),
            const SizedBox(height: 14),
            TextFormField(
              controller: _email,
              keyboardType: TextInputType.emailAddress,
              decoration: const InputDecoration(labelText: 'Email'),
              validator: (v) =>
                  RegExp(r'^[^@\s]+@[^@\s]+\.[^@\s]+$').hasMatch(v?.trim() ?? '')
                      ? null
                      : 'Valid email address',
            ),
            const SizedBox(height: 24),
            const SectionTitle('Address'),
            const SizedBox(height: 12),
            TextFormField(
              controller: _address,
              decoration: const InputDecoration(labelText: 'Address'),
              validator: _required,
            ),
            const SizedBox(height: 14),
            locations.when(
              loading: () => const LinearProgressIndicator(minHeight: 2),
              error: (_, __) =>
                  const Text('Could not load locations', style: TextStyle(color: AppColors.danger)),
              data: (map) {
                final states = map.keys.toList()..sort();
                final districts = _state == null ? <String>[] : (map[_state] ?? []);
                return Column(children: [
                  DropdownButtonFormField<String>(
                    initialValue: _state,
                    isExpanded: true,
                    decoration: const InputDecoration(labelText: 'State'),
                    items:
                        states.map((s) => DropdownMenuItem(value: s, child: Text(s))).toList(),
                    onChanged: (v) => setState(() {
                      _state = v;
                      _district = null;
                    }),
                  ),
                  const SizedBox(height: 14),
                  DropdownButtonFormField<String>(
                    initialValue: _district,
                    isExpanded: true,
                    decoration: const InputDecoration(labelText: 'District'),
                    items: districts
                        .map((d) => DropdownMenuItem(value: d, child: Text(d)))
                        .toList(),
                    onChanged:
                        _state == null ? null : (v) => setState(() => _district = v),
                  ),
                ]);
              },
            ),
            const SizedBox(height: 14),
            TextFormField(
              controller: _pin,
              keyboardType: TextInputType.number,
              inputFormatters: [
                FilteringTextInputFormatter.digitsOnly,
                LengthLimitingTextInputFormatter(6),
              ],
              decoration: const InputDecoration(labelText: 'PIN code'),
              validator: (v) => (v?.trim().length == 6) ? null : '6-digit PIN',
            ),
            const SizedBox(height: 28),
            FilledButton(
              onPressed: _busy ? null : _submit,
              child: _busy
                  ? const SizedBox(
                      width: 20,
                      height: 20,
                      child: CircularProgressIndicator(strokeWidth: 2.4, color: Colors.white),
                    )
                  : Text('Create ${_role.label}'),
            ),
          ],
        ),
      ),
    );
  }

  String? _required(String? v) => (v == null || v.trim().isEmpty) ? 'Required' : null;
}

extension on Text {
  SnackBar asSnack() => SnackBar(content: this);
}
