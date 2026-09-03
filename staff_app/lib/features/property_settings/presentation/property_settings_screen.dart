import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/networking/api_exception.dart';
import '../../../core/permissions/permission_gate.dart';
import '../../../core/permissions/permission_keys.dart';
import '../../../core/routing/routes.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/theme/app_spacing.dart';
import '../../../core/theme/app_typography.dart';
import '../../../core/widgets/primitives.dart';
import '../../../core/widgets/states.dart';
import '../application/property_settings_controllers.dart';
import '../data/property_settings_models.dart';

/// **Property settings** — the hub, plus the general form (tax registration,
/// invoice presentation, the check-in day, holds, the booking page).
///
/// The four catalogues (taxes & fees, policies, add-ons, booking sources)
/// are their own screens, linked from the top of this one.
class PropertySettingsScreen extends ConsumerStatefulWidget {
  const PropertySettingsScreen({super.key});

  @override
  ConsumerState<PropertySettingsScreen> createState() =>
      _PropertySettingsScreenState();
}

class _PropertySettingsScreenState
    extends ConsumerState<PropertySettingsScreen> {
  final _gstin = TextEditingController();
  final _stateCode = TextEditingController();
  final _prefix = TextEditingController();
  final _next = TextEditingController();
  final _footer = TextEditingController();
  final _checkin = TextEditingController();
  final _checkout = TextEditingController();
  final _hold = TextEditingController();
  final _slug = TextEditingController();
  final _terms = TextEditingController();
  final _floor = TextEditingController();
  final _serviceCharge = TextEditingController();
  bool _pricesIncludeTax = false;
  bool _showGstin = true;
  bool _showHsn = true;
  bool _showBreakup = true;
  bool _engine = false;
  CheckinModel _model = CheckinModel.single;
  bool _seeded = false;
  bool _busy = false;
  String? _error;

  @override
  void dispose() {
    for (final c in [
      _gstin,
      _stateCode,
      _prefix,
      _next,
      _footer,
      _checkin,
      _checkout,
      _hold,
      _slug,
      _terms,
    ]) {
      c.dispose();
    }
    super.dispose();
  }

  void _seed(PropertySettings s) {
    _gstin.text = s.gstin ?? '';
    _stateCode.text = s.gstStateCode ?? '';
    _prefix.text = s.invoicePrefix;
    _next.text = '${s.invoiceNextNumber}';
    _footer.text = s.invoiceFooter ?? '';
    _checkin.text = s.checkinTime;
    _checkout.text = s.checkoutTime;
    _hold.text = s.holdExpiryMinutes?.toString() ?? '';
    _slug.text = s.bookingEngineSlug ?? '';
    _terms.text = s.bookingTerms ?? '';
    _floor.text = s.minRoomPricePaise == null
        ? ''
        : (s.minRoomPricePaise! ~/ 100).toString();
    _serviceCharge.text = s.restaurantServiceChargeBp == 0
        ? ''
        : (s.restaurantServiceChargeBp / 100).toString();
    _pricesIncludeTax = s.pricesIncludeTax;
    _showGstin = s.invoiceShowGstin;
    _showHsn = s.invoiceShowHsn;
    _showBreakup = s.invoiceShowBreakup;
    _engine = s.bookingEngineEnabled;
    _model = s.checkinModel;
    _seeded = true;
  }

  Future<void> _save() async {
    setState(() {
      _busy = true;
      _error = null;
    });
    final messenger = ScaffoldMessenger.of(context);
    try {
      final gstin = _gstin.text.trim().toUpperCase();
      await ref.read(propertySettingsActionsProvider).updateSettings({
        if (gstin.isNotEmpty) 'gstin': gstin,
        if (_stateCode.text.trim().isNotEmpty)
          'gstStateCode': _stateCode.text.trim(),
        'pricesIncludeTax': _pricesIncludeTax,
        'invoicePrefix': _prefix.text.trim().toUpperCase(),
        'invoiceNextNumber': int.tryParse(_next.text.trim()) ?? 1,
        'invoiceFooter': _footer.text.trim(),
        'invoiceShowGstin': _showGstin,
        'invoiceShowHsn': _showHsn,
        'invoiceShowBreakup': _showBreakup,
        'checkinModel': _model.wire,
        'checkinTime': _checkin.text.trim(),
        'checkoutTime': _checkout.text.trim(),
        'holdExpiryMinutes': _hold.text.trim().isEmpty
            ? null
            : int.tryParse(_hold.text.trim()),
        'bookingEngineEnabled': _engine,
        if (_slug.text.trim().isNotEmpty)
          'bookingEngineSlug': _slug.text.trim(),
        'bookingTerms': _terms.text.trim(),
        'minRoomPricePaise': _floor.text.trim().isEmpty
            ? null
            : (int.tryParse(_floor.text.trim()) ?? 0) * 100,
        'restaurantServiceChargeBp':
            ((double.tryParse(_serviceCharge.text.trim()) ?? 0) * 100).round(),
      });
      messenger.showSnackBar(
        const SnackBar(content: Text('Property settings saved')),
      );
    } on ApiException catch (e) {
      setState(() => _error = e.message);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    final settings = ref.watch(propertySettingsProvider);
    final loaded = settings.valueOrNull;
    if (loaded != null && !_seeded) _seed(loaded);

    return PageBody(
      children: [
        const PageHeader(eyebrow: 'Property', title: 'Property settings'),
        gapSection,
        SoftCard(
          padding: EdgeInsets.zero,
          child: Column(
            children: [
              _link(
                c,
                Icons.receipt_long_outlined,
                'Taxes & fees',
                'GST is automatic; add municipal taxes, service charge, levies',
                Routes.propertyTaxes,
              ),
              const RowDivider(),
              _link(
                c,
                Icons.policy_outlined,
                'Policies',
                'Cancellation, no-show, early checkout, deposit',
                Routes.propertyPolicies,
              ),
              const RowDivider(),
              _link(
                c,
                Icons.room_service_outlined,
                'Add-on services',
                'Airport pickup, breakfast, late checkout',
                Routes.propertyAddons,
              ),
              const RowDivider(),
              _link(
                c,
                Icons.alt_route_outlined,
                'Booking sources',
                'Where bookings come from, with commission',
                Routes.propertySources,
              ),
            ],
          ),
        ),
        gapSection,
        if (settings.isLoading && !_seeded)
          const ListSkeleton(rows: 3)
        else if (settings.hasError && !_seeded)
          ErrorState(
            error: settings.error!,
            onRetry: () => ref.invalidate(propertySettingsProvider),
          )
        else ...[
          _section(
            c,
            'Tax registration',
            'Prints on every invoice and decides intra- vs inter-state supply.',
            [
              _text(_gstin, 'GSTIN', hint: '32AAAAA0000A1Z5', caps: true),
              gapMd,
              _text(_stateCode, 'GST state code', hint: '32', digits: true),
              gapMd,
              SwitchListTile.adaptive(
                contentPadding: EdgeInsets.zero,
                value: _pricesIncludeTax,
                onChanged: (v) => setState(() => _pricesIncludeTax = v),
                title: const Text('Room prices include tax'),
                subtitle: const Text(
                  'Guests see one number; the invoice still shows the break-up.',
                ),
              ),
            ],
          ),
          gapSection,
          _section(
            c,
            'Invoice',
            'Numbering and what the printed folio shows.',
            [
              Row(
                children: [
                  Expanded(
                    child: _text(_prefix, 'Prefix', hint: 'INV', caps: true),
                  ),
                  const SizedBox(width: Sp.md),
                  Expanded(child: _text(_next, 'Next number', digits: true)),
                ],
              ),
              gapMd,
              _text(
                _footer,
                'Footer',
                hint: 'Thank you for staying with us',
                lines: 2,
              ),
              gapMd,
              SwitchListTile.adaptive(
                contentPadding: EdgeInsets.zero,
                value: _showGstin,
                onChanged: (v) => setState(() => _showGstin = v),
                title: const Text('Show GSTIN'),
              ),
              SwitchListTile.adaptive(
                contentPadding: EdgeInsets.zero,
                value: _showHsn,
                onChanged: (v) => setState(() => _showHsn = v),
                title: const Text('Show HSN/SAC codes'),
              ),
              SwitchListTile.adaptive(
                contentPadding: EdgeInsets.zero,
                value: _showBreakup,
                onChanged: (v) => setState(() => _showBreakup = v),
                title: const Text('Show per-night break-up'),
              ),
            ],
          ),
          gapSection,
          _section(
            c,
            'The check-in day',
            'How arrivals and departures are timed.',
            [
              DropdownButtonFormField<CheckinModel>(
                initialValue: _model,
                decoration: const InputDecoration(labelText: 'Model'),
                items: [
                  for (final m in CheckinModel.values)
                    DropdownMenuItem(value: m, child: Text(m.label)),
                ],
                onChanged: (v) => setState(() => _model = v ?? _model),
              ),
              gapMd,
              Row(
                children: [
                  Expanded(
                    child: _text(_checkin, 'Check-in time', hint: '14:00'),
                  ),
                  const SizedBox(width: Sp.md),
                  Expanded(
                    child: _text(_checkout, 'Check-out time', hint: '11:00'),
                  ),
                ],
              ),
              gapMd,
              _text(
                _hold,
                'Enquiry holds expire after (minutes)',
                hint: 'Leave blank to keep holds forever',
                digits: true,
              ),
            ],
          ),
          gapSection,
          _section(
            c,
            'Booking page',
            'Your own hosted booking page and the widget for your website. Guests reserve and pay at the property.',
            [
              SwitchListTile.adaptive(
                contentPadding: EdgeInsets.zero,
                value: _engine,
                onChanged: (v) => setState(() => _engine = v),
                title: const Text('Booking page enabled'),
              ),
              gapMd,
              _text(_slug, 'Page address', hint: 'sea-view-villa'),
              gapMd,
              _text(_terms, 'Booking terms shown to guests', lines: 3),
            ],
          ),
          if (_error != null) ...[
            gapMd,
            Text(
              _error!,
              style: AppTypography.body(size: 12.5, color: c.destructive),
            ),
          ],
          gapSection,
          PermissionGate(
            permission: P.propertySettingsUpdate,
            child: FilledButton(
              onPressed: _busy ? null : _save,
              child: Text(_busy ? 'Saving…' : 'Save settings'),
            ),
          ),
          gapSection,
        ],
      ],
    );
  }

  Widget _link(
    AppColors c,
    IconData icon,
    String title,
    String subtitle,
    String route,
  ) => ListTile(
    leading: Icon(icon, size: 20),
    title: Text(title),
    subtitle: Text(
      subtitle,
      style: AppTypography.body(size: 11.5, color: c.mutedForeground),
    ),
    trailing: Icon(Icons.chevron_right, size: 18, color: c.mutedForeground),
    onTap: () => context.go(route),
  );

  Widget _section(
    AppColors c,
    String title,
    String subtitle,
    List<Widget> children,
  ) => SoftCard(
    child: Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Text(
          title,
          style: AppTypography.display(size: 15, color: c.foreground),
        ),
        const SizedBox(height: 2),
        Text(
          subtitle,
          style: AppTypography.body(size: 11.5, color: c.mutedForeground),
        ),
        const SizedBox(height: Sp.lg),
        ...children,
      ],
    ),
  );

  Widget _text(
    TextEditingController ctl,
    String label, {
    String? hint,
    bool caps = false,
    bool digits = false,
    int lines = 1,
  }) => TextField(
    controller: ctl,
    maxLines: lines,
    keyboardType: digits ? TextInputType.number : null,
    textCapitalization: caps
        ? TextCapitalization.characters
        : TextCapitalization.none,
    inputFormatters: digits ? [FilteringTextInputFormatter.digitsOnly] : null,
    decoration: InputDecoration(labelText: label, hintText: hint),
    onChanged: (_) => setState(() {}),
  );
}
