import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/config/app_config.dart';
import '../../../core/networking/api_exception.dart';
import '../../../core/permissions/permission_gate.dart';
import '../../../core/permissions/permission_keys.dart';
import '../../../core/routing/routes.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/theme/app_spacing.dart';
import '../../../core/theme/app_typography.dart';
import '../../../core/widgets/primitives.dart';
import '../../../core/widgets/states.dart';
import '../../property_settings/application/property_settings_controllers.dart';
import '../../property_settings/data/property_settings_models.dart';

/// **Booking engine** — the property's own public booking page. Slug, enable
/// switch, branding, terms, hold expiry, embed snippet.
class BookingEngineScreen extends ConsumerWidget {
  const BookingEngineScreen({super.key});

  String _publicUrl(String? slug) {
    if (slug == null || slug.isEmpty) return '';
    // AppConfig.apiBaseUrl already includes /api/v1 in production; the public
    // booking route is /api/v1/public/booking/<slug>.
    final base = AppConfig.apiBaseUrl.replaceAll(RegExp(r'/api/v1/?$'), '');
    return '$base/api/v1/public/booking/$slug';
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final s = ref.watch(propertySettingsProvider);
    return PageBody(
      onRefresh: () async => ref.invalidate(propertySettingsProvider),
      children: [
        const PageHeader(eyebrow: 'Distribution', title: 'Booking engine'),
        gapSection,
        s.when(
          loading: () => const ListSkeleton(rows: 3),
          error: (e, _) => ErrorState(
            error: e,
            onRetry: () => ref.invalidate(propertySettingsProvider),
          ),
          data: (settings) => _Body(
            settings: settings,
            publicUrl: _publicUrl(settings.bookingEngineSlug),
          ),
        ),
        gapSection,
      ],
    );
  }
}

class _Body extends ConsumerStatefulWidget {
  const _Body({required this.settings, required this.publicUrl});
  final PropertySettings settings;
  final String publicUrl;
  @override
  ConsumerState<_Body> createState() => _BodyState();
}

class _BodyState extends ConsumerState<_Body> {
  late final _slug = TextEditingController(
    text: widget.settings.bookingEngineSlug ?? '',
  );
  late final _brandColor = TextEditingController(
    text: widget.settings.brandColor ?? '',
  );
  late final _terms = TextEditingController(
    text: widget.settings.bookingTerms ?? '',
  );
  late final _hold = TextEditingController(
    text: widget.settings.holdExpiryMinutes?.toString() ?? '',
  );
  late bool _enabled = widget.settings.bookingEngineEnabled;
  bool _busy = false;

  @override
  void dispose() {
    for (final t in [_slug, _brandColor, _terms, _hold]) {
      t.dispose();
    }
    super.dispose();
  }

  Future<void> _save() async {
    setState(() => _busy = true);
    final messenger = ScaffoldMessenger.of(context);
    try {
      await ref.read(propertySettingsActionsProvider).updateSettings({
        'bookingEngineEnabled': _enabled,
        if (_slug.text.trim().isNotEmpty)
          'bookingEngineSlug': _slug.text.trim(),
        if (_brandColor.text.trim().isNotEmpty)
          'brandColor': _brandColor.text.trim(),
        'bookingTerms': _terms.text.trim(),
        if (_hold.text.trim().isNotEmpty)
          'holdExpiryMinutes': int.tryParse(_hold.text.trim()),
      });
      messenger.showSnackBar(const SnackBar(content: Text('Saved')));
    } on ApiException catch (e) {
      messenger.showSnackBar(SnackBar(content: Text(e.message)));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _copy(String s, String label) async {
    await Clipboard.setData(ClipboardData(text: s));
    if (mounted) {
      ScaffoldMessenger.of(
        context,
      ).showSnackBar(SnackBar(content: Text('$label copied')));
    }
  }

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    final url = widget.publicUrl;
    final embed = url.isEmpty
        ? ''
        : '<iframe src="$url" style="width:100%;height:820px;border:0" allow="payment"></iframe>';
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        SoftCard(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              SwitchListTile(
                contentPadding: EdgeInsets.zero,
                title: const Text('Public booking page'),
                subtitle: Text(
                  _enabled
                      ? 'Guests can book directly from your Tavelo page.'
                      : 'The public page is off — guests cannot book here.',
                  style: AppTypography.body(size: 12, color: c.mutedForeground),
                ),
                value: _enabled,
                onChanged: (v) => setState(() => _enabled = v),
              ),
              gapMd,
              TextField(
                controller: _slug,
                decoration: const InputDecoration(
                  labelText: 'Page address',
                  hintText: 'harbour-view',
                  helperText: 'Lower-case letters, digits and hyphens.',
                ),
              ),
              if (url.isNotEmpty) ...[
                const SizedBox(height: Sp.sm),
                _CopyLine(label: 'Public URL', value: url, onCopy: _copy),
              ],
              gapMd,
              TextField(
                controller: _brandColor,
                decoration: const InputDecoration(
                  labelText: 'Brand colour',
                  hintText: '#2E7D5F',
                ),
              ),
              gapMd,
              TextField(
                controller: _hold,
                keyboardType: TextInputType.number,
                decoration: const InputDecoration(
                  labelText: 'Hold expiry (minutes)',
                  helperText:
                      'How long an unpaid enquiry hold survives before it releases the room.',
                ),
              ),
              gapMd,
              TextField(
                controller: _terms,
                minLines: 3,
                maxLines: 8,
                decoration: const InputDecoration(labelText: 'Booking terms'),
              ),
              gapMd,
              PermissionGate(
                permission: P.propertySettingsUpdate,
                child: Align(
                  alignment: Alignment.centerRight,
                  child: FilledButton(
                    onPressed: _busy ? null : _save,
                    child: Text(_busy ? 'Saving…' : 'Save'),
                  ),
                ),
              ),
            ],
          ),
        ),
        gapMd,
        if (embed.isNotEmpty)
          SoftCard(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Text(
                  'Embed on your website',
                  style: AppTypography.body(
                    size: 13,
                    weight: FontWeight.w600,
                    color: c.foreground,
                  ),
                ),
                Text(
                  'Paste this into any page — the booking widget renders inline.',
                  style: AppTypography.body(
                    size: 11.5,
                    color: c.mutedForeground,
                  ),
                ),
                const SizedBox(height: Sp.sm),
                _CopyLine(
                  label: 'Snippet',
                  value: embed,
                  onCopy: _copy,
                  mono: true,
                ),
              ],
            ),
          ),
        gapMd,
        SoftCard(
          child: Row(
            children: [
              Icon(Icons.percent, color: c.mutedForeground, size: 18),
              const SizedBox(width: Sp.sm),
              const Expanded(
                child: Text(
                  'Discount codes for the booking page live under Coupons.',
                ),
              ),
              TextButton(
                onPressed: () => context.go(Routes.propertyCoupons),
                child: const Text('Manage coupons'),
              ),
            ],
          ),
        ),
      ],
    );
  }
}

class _CopyLine extends StatelessWidget {
  const _CopyLine({
    required this.label,
    required this.value,
    required this.onCopy,
    this.mono = false,
  });
  final String label;
  final String value;
  final Future<void> Function(String, String) onCopy;
  final bool mono;
  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: Sp.sm, vertical: Sp.sm),
      decoration: BoxDecoration(color: c.muted, borderRadius: R.rSm),
      child: Row(
        children: [
          Expanded(
            child: SelectableText(
              value,
              maxLines: 3,
              style: mono
                  ? const TextStyle(fontFamily: 'monospace', fontSize: 12)
                  : AppTypography.body(size: 12, color: c.foreground),
            ),
          ),
          IconButton(
            onPressed: () => onCopy(value, label),
            icon: const Icon(Icons.copy, size: 16),
            tooltip: 'Copy',
          ),
        ],
      ),
    );
  }
}
