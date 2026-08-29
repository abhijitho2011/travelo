import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart';

import '../../core/api/api_exception.dart';
import '../../core/data/owner_repository.dart';
import '../../core/models/owner_models.dart';
import '../../core/providers.dart';
import '../../theme/app_theme.dart';
import '../../widgets/ui.dart';

/// The owner's own details. Email is shown but never editable — it is the
/// address the account signs in with, so changing it is a support action.
class ProfileScreen extends ConsumerWidget {
  const ProfileScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final account = ref.watch(ownerAccountProvider);
    return Scaffold(
      appBar: AppBar(title: const Text('Profile')),
      body: account.when(
        loading: () => const LoadingView(),
        error: (_, __) => ErrorView(
          message: 'Could not load your profile.',
          onRetry: () => ref.invalidate(ownerAccountProvider),
        ),
        data: (a) => _ProfileForm(account: a),
      ),
    );
  }
}

class _ProfileForm extends ConsumerStatefulWidget {
  const _ProfileForm({required this.account});
  final OwnerAccount account;

  @override
  ConsumerState<_ProfileForm> createState() => _ProfileFormState();
}

class _ProfileFormState extends ConsumerState<_ProfileForm> {
  final _form = GlobalKey<FormState>();
  late final TextEditingController _name;
  late final TextEditingController _company;
  late final TextEditingController _phone;
  late final TextEditingController _gst;
  late final TextEditingController _address;
  late final TextEditingController _pin;
  String? _stateId;
  String? _districtId;
  bool _busy = false;
  String? _error;

  @override
  void initState() {
    super.initState();
    final a = widget.account;
    _name = TextEditingController(text: a.name);
    _company = TextEditingController(text: a.company);
    _phone = TextEditingController(text: a.phone);
    _gst = TextEditingController(text: a.gstNumber);
    _address = TextEditingController(text: a.address);
    _pin = TextEditingController(text: a.pinCode);
    _stateId = a.stateId;
    _districtId = a.districtId;
  }

  @override
  void dispose() {
    for (final c in [_name, _company, _phone, _gst, _address, _pin]) {
      c.dispose();
    }
    super.dispose();
  }

  /// Only what actually changed. `email` is never in here — the backend rejects
  /// it outright, and the field is read-only in the UI.
  Map<String, dynamic> _changed() {
    final a = widget.account;
    final body = <String, dynamic>{};
    void put(String key, String next, String prev) {
      if (next != prev) body[key] = next;
    }

    put('name', _name.text.trim(), a.name);
    put('company', _company.text.trim(), a.company);
    put('phone', _phone.text.trim(), a.phone);
    put('gstNumber', _gst.text.trim(), a.gstNumber);
    put('address', _address.text.trim(), a.address);
    put('pinCode', _pin.text.trim(), a.pinCode);
    // The catalogue ids travel together — the backend insists on both halves.
    if (_stateId != a.stateId || _districtId != a.districtId) {
      body['state'] = _stateId;
      body['district'] = _districtId;
    }
    return body;
  }

  Future<void> _save() async {
    setState(() => _error = null);
    if (!_form.currentState!.validate()) return;
    final body = _changed();
    if (body.isEmpty) {
      setState(() => _error = 'Nothing has changed yet.');
      return;
    }
    if (body.containsKey('state') && (_stateId == null || _districtId == null)) {
      setState(() => _error = 'Select a state and district.');
      return;
    }

    setState(() => _busy = true);
    try {
      await ref.read(ownerRepositoryProvider).updateProfile(body);
      ref.invalidate(ownerAccountProvider);
      await ref.read(authControllerProvider.notifier).refreshMe();
      if (!mounted) return;
      ScaffoldMessenger.of(context)
          .showSnackBar(const SnackBar(content: Text('Profile updated.')));
    } on ApiException catch (e) {
      setState(() => _error = e.message);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final a = widget.account;
    final catalogue = ref.watch(locationCatalogueProvider);

    return Form(
      key: _form,
      child: ListView(
        padding: const EdgeInsets.fromLTRB(20, 20, 20, 40),
        children: [
          _Header(account: a),
          const SizedBox(height: 24),
          if (_error != null) ...[
            Banner2(text: _error!, tone: BannerTone.danger, icon: Icons.error_outline),
            const SizedBox(height: 16),
          ],
          const SectionTitle('Account'),
          const SizedBox(height: 12),
          _ReadOnlyEmail(email: a.email, verified: a.emailVerified),
          const SizedBox(height: 14),
          TextFormField(
            controller: _name,
            decoration: const InputDecoration(labelText: 'Full name'),
            validator: (v) =>
                (v == null || v.trim().length < 2) ? 'Enter your name' : null,
          ),
          const SizedBox(height: 14),
          TextFormField(
            controller: _company,
            decoration: const InputDecoration(
              labelText: 'Company',
              hintText: 'Optional',
            ),
          ),
          const SizedBox(height: 14),
          TextFormField(
            controller: _phone,
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
            controller: _gst,
            textCapitalization: TextCapitalization.characters,
            inputFormatters: [LengthLimitingTextInputFormatter(15)],
            decoration: const InputDecoration(
              labelText: 'GSTIN',
              hintText: 'Optional — 15 characters',
            ),
            validator: (v) {
              final t = (v ?? '').trim().toUpperCase();
              if (t.isEmpty) return null;
              return RegExp(r'^\d{2}[A-Z]{5}\d{4}[A-Z]\d[Z][A-Z\d]$').hasMatch(t)
                  ? null
                  : 'Enter a valid 15-character GSTIN';
            },
          ),
          const SizedBox(height: 24),
          const SectionTitle('Address'),
          const SizedBox(height: 12),
          TextFormField(
            controller: _address,
            decoration: const InputDecoration(labelText: 'Address'),
          ),
          const SizedBox(height: 14),
          catalogue.when(
            loading: () => const LinearProgressIndicator(minHeight: 2),
            error: (_, __) => const Text(
              'Could not load locations',
              style: TextStyle(color: AppColors.danger),
            ),
            data: (states) {
              final districts = states
                      .where((s) => s.id == _stateId)
                      .map((s) => s.districts)
                      .firstOrNull ??
                  const <CatalogueDistrict>[];
              return Column(children: [
                DropdownButtonFormField<String>(
                  initialValue: states.any((s) => s.id == _stateId) ? _stateId : null,
                  isExpanded: true,
                  decoration: const InputDecoration(labelText: 'State'),
                  items: states
                      .map((s) => DropdownMenuItem(value: s.id, child: Text(s.name)))
                      .toList(),
                  onChanged: (v) => setState(() {
                    _stateId = v;
                    _districtId = null;
                  }),
                ),
                const SizedBox(height: 14),
                DropdownButtonFormField<String>(
                  initialValue:
                      districts.any((d) => d.id == _districtId) ? _districtId : null,
                  isExpanded: true,
                  decoration: const InputDecoration(labelText: 'District'),
                  items: districts
                      .map((d) => DropdownMenuItem(value: d.id, child: Text(d.name)))
                      .toList(),
                  onChanged:
                      _stateId == null ? null : (v) => setState(() => _districtId = v),
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
            validator: (v) {
              final t = (v ?? '').trim();
              if (t.isEmpty) return null;
              return t.length == 6 ? null : '6-digit PIN';
            },
          ),
          const SizedBox(height: 28),
          FilledButton(
            onPressed: _busy ? null : _save,
            child: _busy
                ? const SizedBox(
                    width: 20,
                    height: 20,
                    child: CircularProgressIndicator(strokeWidth: 2.4, color: Colors.white),
                  )
                : const Text('Save changes'),
          ),
        ],
      ),
    );
  }
}

class _Header extends StatelessWidget {
  const _Header({required this.account});
  final OwnerAccount account;

  @override
  Widget build(BuildContext context) {
    final joined = account.createdAt;
    return Row(
      children: [
        CircleAvatar(
          radius: 32,
          backgroundColor: AppColors.primarySoft,
          child: Text(
            _initials(account.name),
            style: const TextStyle(
              color: AppColors.primaryDark,
              fontWeight: FontWeight.w700,
              fontSize: 22,
            ),
          ),
        ),
        const SizedBox(width: 16),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                account.name.isEmpty ? 'Owner' : account.name,
                style: const TextStyle(
                    fontSize: 19, fontWeight: FontWeight.w800, color: AppColors.ink),
              ),
              if (account.company.isNotEmpty)
                Text(account.company, style: const TextStyle(color: AppColors.inkMuted)),
              const SizedBox(height: 8),
              Wrap(
                spacing: 8,
                runSpacing: 6,
                children: [
                  StatusChip(
                    label: '${account.propertiesCount} '
                        '${account.propertiesCount == 1 ? 'hotel' : 'hotels'}',
                    color: AppColors.primary,
                  ),
                  StatusChip(
                    label: '${account.staffCount} staff',
                    color: AppColors.info,
                  ),
                  if (joined != null)
                    StatusChip(
                      label: 'Since ${DateFormat.yMMM().format(joined)}',
                      color: AppColors.inkMuted,
                    ),
                ],
              ),
            ],
          ),
        ),
      ],
    );
  }

  static String _initials(String name) {
    final n = name.trim();
    if (n.isEmpty) return 'O';
    final parts = n.split(RegExp(r'\s+'));
    return parts.length == 1
        ? parts.first.substring(0, 1).toUpperCase()
        : (parts.first[0] + parts.last[0]).toUpperCase();
  }
}

class _ReadOnlyEmail extends StatelessWidget {
  const _ReadOnlyEmail({required this.email, required this.verified});
  final String email;
  final bool verified;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
      decoration: BoxDecoration(
        color: AppColors.field,
        borderRadius: BorderRadius.circular(AppRadius.md),
        border: Border.all(color: AppColors.line),
      ),
      child: Row(
        children: [
          const Icon(Icons.mail_outline, size: 20, color: AppColors.inkFaint),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Text('Email',
                    style: TextStyle(color: AppColors.inkMuted, fontSize: 12)),
                const SizedBox(height: 2),
                Text(email, style: const TextStyle(color: AppColors.ink, fontSize: 14.5)),
              ],
            ),
          ),
          const SizedBox(width: 8),
          StatusChip(
            label: verified ? 'Verified' : 'Not verified',
            color: verified ? AppColors.success : AppColors.warning,
          ),
        ],
      ),
    );
  }
}
