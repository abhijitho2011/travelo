import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/api/api_exception.dart';
import '../../core/data/location_repository.dart';
import '../../core/data/owner_repository.dart';
import '../../core/models/owner_models.dart';
import '../../core/theme/app_colors.dart';
import '../../core/theme/app_typography.dart';
import '../../core/widgets/auth_scaffold.dart' show ButtonSpinner;
import '../../core/widgets/cards.dart';
import '../../core/widgets/primitives.dart';
import '../../core/widgets/states.dart';
import '../../core/widgets/impersonation_banner.dart';

/// The one manager form, used for both create and edit.
///
/// Passing [existing] switches it into edit mode: the fields arrive pre-filled
/// and submitting sends a PATCH carrying ONLY what actually changed, so an
/// untouched field is never rewritten with a stale value. There is no second
/// copy of this layout to keep in step.
class StaffForm extends ConsumerStatefulWidget {
  const StaffForm({super.key, required this.propertyId, this.existing});

  final String propertyId;
  final StaffMember? existing;

  bool get isEdit => existing != null;

  @override
  ConsumerState<StaffForm> createState() => _StaffFormState();
}

class _StaffFormState extends ConsumerState<StaffForm> {
  final _form = GlobalKey<FormState>();
  late final TextEditingController _first;
  late final TextEditingController _last;
  late final TextEditingController _address;
  late final TextEditingController _pin;
  late final TextEditingController _mobile;
  late final TextEditingController _email;
  late final TextEditingController _department;
  late final TextEditingController _employeeId;
  late StaffRole _role;
  String? _state;
  String? _district;
  bool _busy = false;
  String? _error;

  @override
  void initState() {
    super.initState();
    final e = widget.existing;
    _first = TextEditingController(text: e?.firstName ?? '');
    _last = TextEditingController(text: e?.lastName ?? '');
    _address = TextEditingController(text: e?.address ?? '');
    _pin = TextEditingController(text: e?.pinCode ?? '');
    _mobile = TextEditingController(text: e?.mobile ?? '');
    _email = TextEditingController(text: e?.email ?? '');
    _department = TextEditingController(text: e?.department ?? '');
    _employeeId = TextEditingController(text: e?.employeeId ?? '');
    _role = e?.role ?? StaffRole.generalManager;
    _state = (e?.state.isNotEmpty ?? false) ? e!.state : null;
    _district = (e?.district.isNotEmpty ?? false) ? e!.district : null;
  }

  @override
  void dispose() {
    for (final c in [
      _first,
      _last,
      _address,
      _pin,
      _mobile,
      _email,
      _department,
      _employeeId,
    ]) {
      c.dispose();
    }
    super.dispose();
  }

  /// Only the keys whose value differs from the stored record. An empty result
  /// means there is nothing to save.
  Map<String, dynamic> _changedFields(StaffMember e) {
    final body = <String, dynamic>{};
    void put(String key, String next, String prev) {
      if (next != prev) body[key] = next;
    }

    if (_role != e.role) body['role'] = _role.api;
    put('firstName', _first.text.trim(), e.firstName);
    put('lastName', _last.text.trim(), e.lastName);
    put('address', _address.text.trim(), e.address);
    put('pinCode', _pin.text.trim(), e.pinCode);
    put('mobile', _mobile.text.trim(), e.mobile);
    put('email', _email.text.trim(), e.email);
    put('department', _department.text.trim(), e.department);
    put('employeeId', _employeeId.text.trim(), e.employeeId);
    if (_state != e.state) body['state'] = _state;
    if (_district != e.district) body['district'] = _district;
    return body;
  }

  Future<void> _submit() async {
    setState(() => _error = null);
    if (!_form.currentState!.validate()) return;
    if (_state == null || _district == null) {
      setState(() => _error = 'Select a state and district.');
      return;
    }

    final repo = ref.read(ownerRepositoryProvider);
    final existing = widget.existing;
    setState(() => _busy = true);
    try {
      if (existing == null) {
        await repo.createStaff(widget.propertyId, {
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
      } else {
        final body = _changedFields(existing);
        if (body.isEmpty) {
          setState(() => _error = 'Nothing has changed yet.');
          return;
        }
        await repo.updateStaff(widget.propertyId, existing.id, body);
      }
      ref.invalidate(staffProvider(widget.propertyId));
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(
            existing == null ? '${_role.label} added.' : 'Changes saved.',
          ),
        ),
      );
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
    final isEdit = widget.isEdit;

    return Form(
      key: _form,
      child: PageBody(
        children: [
          if (_error != null) ...[
            NoticeBanner(
              text: _error!,
              tone: NoticeTone.danger,
              icon: Icons.error_outline,
            ),
            gapSection,
          ],
          const SectionHeader(title: 'Role', icon: Icons.badge_outlined),
          SegmentedButton<StaffRole>(
            segments: const [
              ButtonSegment(
                value: StaffRole.generalManager,
                label: Text('General Manager'),
              ),
              ButtonSegment(
                value: StaffRole.assistantGeneralManager,
                label: Text('Assistant GM'),
              ),
            ],
            selected: {_role},
            onSelectionChanged: (s) => setState(() => _role = s.first),
          ),
          gapSection,
          const SectionHeader(
            title: 'Personal details',
            icon: Icons.person_outline,
          ),
          Row(
            children: [
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
            ],
          ),
          const SizedBox(height: 14),
          TextFormField(
            controller: _mobile,
            keyboardType: TextInputType.phone,
            inputFormatters: [
              FilteringTextInputFormatter.digitsOnly,
              LengthLimitingTextInputFormatter(10),
            ],
            decoration: const InputDecoration(
              labelText: 'Mobile number',
              prefixText: '+91  ',
            ),
            validator: (v) => RegExp(r'^[6-9]\d{9}$').hasMatch(v?.trim() ?? '')
                ? null
                : 'Valid mobile number',
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
          // Work details exist only on the edit surface: the create endpoint
          // does not accept them, and the GM fills them in later.
          if (isEdit) ...[
            gapSection,
            const SectionHeader(
              title: 'Work details',
              icon: Icons.work_outline,
            ),
            TextFormField(
              controller: _department,
              decoration: const InputDecoration(
                labelText: 'Department',
                hintText: 'Optional',
              ),
            ),
            const SizedBox(height: 14),
            TextFormField(
              controller: _employeeId,
              decoration: const InputDecoration(
                labelText: 'Employee ID',
                hintText: 'Optional',
              ),
            ),
          ],
          gapSection,
          const SectionHeader(title: 'Address', icon: Icons.place_outlined),
          TextFormField(
            controller: _address,
            decoration: const InputDecoration(labelText: 'Address'),
            validator: _required,
          ),
          const SizedBox(height: 14),
          locations.when(
            loading: () => const InlineLoader(),
            error: (_, __) => Text(
              'Could not load locations',
              style: AppTypography.body(
                size: 13,
                color: context.colors.destructive,
              ),
            ),
            data: (map) {
              final states = map.keys.toList()..sort();
              final districts = _state == null
                  ? <String>[]
                  : (map[_state] ?? []);
              return Column(
                children: [
                  DropdownButtonFormField<String>(
                    initialValue: states.contains(_state) ? _state : null,
                    isExpanded: true,
                    decoration: const InputDecoration(labelText: 'State'),
                    items: states
                        .map((s) => DropdownMenuItem(value: s, child: Text(s)))
                        .toList(),
                    onChanged: (v) => setState(() {
                      _state = v;
                      _district = null;
                    }),
                  ),
                  const SizedBox(height: 14),
                  DropdownButtonFormField<String>(
                    initialValue: districts.contains(_district)
                        ? _district
                        : null,
                    isExpanded: true,
                    decoration: const InputDecoration(labelText: 'District'),
                    items: districts
                        .map((d) => DropdownMenuItem(value: d, child: Text(d)))
                        .toList(),
                    onChanged: _state == null
                        ? null
                        : (v) => setState(() => _district = v),
                  ),
                ],
              );
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
          ReadOnlyWhenImpersonating(
            child: FilledButton(
              onPressed: _busy ? null : _submit,
              child: _busy
                  ? const ButtonSpinner()
                  : Text(isEdit ? 'Save changes' : 'Create ${_role.label}'),
            ),
          ),
        ],
      ),
    );
  }

  String? _required(String? v) =>
      (v == null || v.trim().isEmpty) ? 'Required' : null;
}
