import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart';

import '../../core/api/api_exception.dart';
import '../../core/data/owner_repository.dart';
import '../../core/models/owner_models.dart';
import '../../core/providers.dart';
import '../../core/theme/app_colors.dart';
import '../../core/theme/app_spacing.dart';
import '../../core/theme/app_typography.dart';
import '../../core/theme/theme_controller.dart';
import '../../core/utils/formatting.dart';
import '../../core/widgets/auth_scaffold.dart' show ButtonSpinner;
import '../../core/widgets/cards.dart';
import '../../core/widgets/primitives.dart';
import '../../core/widgets/states.dart';
import '../../core/widgets/status_badge.dart';
import '../../core/widgets/impersonation_banner.dart';

/// The owner's own details. Email is shown but never editable — it is the
/// address the account signs in with, so changing it is a support action.
class ProfileScreen extends ConsumerWidget {
  const ProfileScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final account = ref.watch(ownerAccountProvider);
    return account.when(
      loading: () => const PageBody(children: [ListSkeleton(rows: 4)]),
      error: (e, __) => PageBody(
        children: [
          const PageHeader(eyebrow: 'Account', title: 'Profile'),
          gapSection,
          ErrorState(
            error: e,
            message: 'Could not load your profile.',
            onRetry: () => ref.invalidate(ownerAccountProvider),
          ),
        ],
      ),
      data: (a) => _ProfileForm(account: a),
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
    if (body.containsKey('state') &&
        (_stateId == null || _districtId == null)) {
      setState(() => _error = 'Select a state and district.');
      return;
    }

    setState(() => _busy = true);
    try {
      await ref.read(ownerRepositoryProvider).updateProfile(body);
      ref.invalidate(ownerAccountProvider);
      await ref.read(authControllerProvider.notifier).refreshMe();
      if (!mounted) return;
      ScaffoldMessenger.of(
        context,
      ).showSnackBar(const SnackBar(content: Text('Profile updated.')));
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
      child: PageBody(
        children: [
          const PageHeader(eyebrow: 'Account', title: 'Profile'),
          gapSection,
          _Header(account: a),
          gapSection,
          const _Appearance(),
          gapSection,
          if (_error != null) ...[
            NoticeBanner(
              text: _error!,
              tone: NoticeTone.danger,
              icon: Icons.error_outline,
            ),
            gapSection,
          ],
          const SectionHeader(title: 'Account', icon: Icons.person_outline),
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
              return RegExp(
                    r'^\d{2}[A-Z]{5}\d{4}[A-Z]\d[Z][A-Z\d]$',
                  ).hasMatch(t)
                  ? null
                  : 'Enter a valid 15-character GSTIN';
            },
          ),
          gapSection,
          const SectionHeader(title: 'Address', icon: Icons.place_outlined),
          TextFormField(
            controller: _address,
            decoration: const InputDecoration(labelText: 'Address'),
          ),
          const SizedBox(height: 14),
          catalogue.when(
            loading: () => const InlineLoader(),
            error: (_, __) => Text(
              'Could not load locations',
              style: AppTypography.body(
                size: 13,
                color: context.colors.destructive,
              ),
            ),
            data: (states) {
              final districts =
                  states
                      .where((s) => s.id == _stateId)
                      .map((s) => s.districts)
                      .firstOrNull ??
                  const <CatalogueDistrict>[];
              return Column(
                children: [
                  DropdownButtonFormField<String>(
                    initialValue: states.any((s) => s.id == _stateId)
                        ? _stateId
                        : null,
                    isExpanded: true,
                    decoration: const InputDecoration(labelText: 'State'),
                    items: states
                        .map(
                          (s) => DropdownMenuItem(
                            value: s.id,
                            child: Text(s.name),
                          ),
                        )
                        .toList(),
                    onChanged: (v) => setState(() {
                      _stateId = v;
                      _districtId = null;
                    }),
                  ),
                  const SizedBox(height: 14),
                  DropdownButtonFormField<String>(
                    initialValue: districts.any((d) => d.id == _districtId)
                        ? _districtId
                        : null,
                    isExpanded: true,
                    decoration: const InputDecoration(labelText: 'District'),
                    items: districts
                        .map(
                          (d) => DropdownMenuItem(
                            value: d.id,
                            child: Text(d.name),
                          ),
                        )
                        .toList(),
                    onChanged: _stateId == null
                        ? null
                        : (v) => setState(() => _districtId = v),
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
            validator: (v) {
              final t = (v ?? '').trim();
              if (t.isEmpty) return null;
              return t.length == 6 ? null : '6-digit PIN';
            },
          ),
          const SizedBox(height: 28),
          ReadOnlyWhenImpersonating(
            child: FilledButton(
              onPressed: _busy ? null : _save,
              child: _busy ? const ButtonSpinner() : const Text('Save changes'),
            ),
          ),
        ],
      ),
    );
  }
}

/// The one setting the owner controls on this device. It lives beside the
/// profile because the top bar's single button cannot say what the three
/// choices are.
class _Appearance extends ConsumerWidget {
  const _Appearance();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final c = context.colors;
    final mode = ref.watch(themeControllerProvider);
    return Panel(
      title: 'Appearance',
      description: 'Applies to this device only.',
      child: Row(
        children: [
          Icon(Icons.contrast_outlined, size: 18, color: c.mutedForeground),
          const SizedBox(width: Sp.md),
          Expanded(
            child: Text(
              'Theme',
              style: AppTypography.body(
                size: 13.5,
                weight: FontWeight.w600,
                color: c.foreground,
              ),
            ),
          ),
          Segmented<ThemeMode>(
            options: const [ThemeMode.system, ThemeMode.light, ThemeMode.dark],
            value: mode,
            labelOf: (m) => switch (m) {
              ThemeMode.system => 'Auto',
              ThemeMode.light => 'Light',
              ThemeMode.dark => 'Dark',
            },
            onChanged: (m) => ref.read(themeControllerProvider.notifier).set(m),
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
    final c = context.colors;
    final joined = account.createdAt;
    return SoftCard(
      child: Row(
        children: [
          Monogram(
            initials: initialsOf(account.name, fallback: 'O'),
            radius: 28,
          ),
          const SizedBox(width: Sp.lg),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  account.name.isEmpty ? 'Owner' : account.name,
                  style: AppTypography.display(size: 19, color: c.foreground),
                ),
                if (account.company.isNotEmpty)
                  Text(
                    account.company,
                    style: AppTypography.body(
                      size: 13,
                      color: c.mutedForeground,
                    ),
                  ),
                const SizedBox(height: Sp.sm),
                Wrap(
                  spacing: Sp.sm,
                  runSpacing: 6,
                  children: [
                    StatusBadge(
                      tone: StatusTone.healthy,
                      icon: Icons.apartment_outlined,
                      dense: true,
                      label:
                          '${account.propertiesCount} '
                          '${account.propertiesCount == 1 ? 'hotel' : 'hotels'}',
                    ),
                    StatusBadge(
                      tone: StatusTone.info,
                      icon: Icons.groups_outlined,
                      dense: true,
                      label: '${account.staffCount} staff',
                    ),
                    if (joined != null)
                      StatusBadge(
                        tone: StatusTone.neutral,
                        icon: Icons.event_outlined,
                        dense: true,
                        label: 'Since ${DateFormat.yMMM().format(joined)}',
                      ),
                  ],
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _ReadOnlyEmail extends StatelessWidget {
  const _ReadOnlyEmail({required this.email, required this.verified});
  final String email;
  final bool verified;

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: Sp.lg, vertical: 14),
      decoration: BoxDecoration(
        color: c.muted,
        borderRadius: R.rMd,
        border: Border.all(color: c.border),
      ),
      child: Row(
        children: [
          Icon(Icons.mail_outline, size: 20, color: c.mutedForeground),
          const SizedBox(width: Sp.md),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const LabelXs('Email'),
                const SizedBox(height: 2),
                Text(
                  email.isEmpty ? '—' : email,
                  overflow: TextOverflow.ellipsis,
                  style: AppTypography.body(size: 14, color: c.foreground),
                ),
              ],
            ),
          ),
          const SizedBox(width: Sp.sm),
          StatusBadge(
            tone: verified ? StatusTone.healthy : StatusTone.warning,
            label: verified ? 'Verified' : 'Not verified',
            dense: true,
          ),
        ],
      ),
    );
  }
}
