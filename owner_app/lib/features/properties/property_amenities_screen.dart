import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/api/api_exception.dart';
import '../../core/data/owner_repository.dart';
import '../../core/models/owner_models.dart';
import '../../theme/app_theme.dart';
import '../../widgets/ui.dart';
import 'property_format.dart';

/// Edit what one hotel offers.
///
/// Facilities are the owner's call — "does this hotel have a pool?" is a fact
/// about the business — which is why this is the only writable surface on the
/// property detail screen.
class PropertyAmenitiesScreen extends ConsumerWidget {
  const PropertyAmenitiesScreen({super.key, required this.propertyId});
  final String propertyId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final amenities = ref.watch(propertyAmenitiesProvider(propertyId));
    return Scaffold(
      appBar: AppBar(title: const Text('Facilities')),
      body: amenities.when(
        loading: () => const LoadingView(),
        error: (e, __) => ErrorView(
          message: e is ApiException && e.code == 'PROPERTY_NOT_FOUND'
              ? 'This hotel is no longer in your portfolio.'
              : 'Could not load facilities.',
          onRetry: () => ref.invalidate(propertyAmenitiesProvider(propertyId)),
        ),
        data: (data) => _AmenitiesEditor(propertyId: propertyId, data: data),
      ),
    );
  }
}

class _AmenitiesEditor extends ConsumerStatefulWidget {
  const _AmenitiesEditor({required this.propertyId, required this.data});

  final String propertyId;
  final PropertyAmenities data;

  @override
  ConsumerState<_AmenitiesEditor> createState() => _AmenitiesEditorState();
}

class _AmenitiesEditorState extends ConsumerState<_AmenitiesEditor> {
  /// The working set. Seeded once from the server so the "nothing has changed"
  /// guard below has a stable baseline to compare against.
  late final Set<String> _original;
  late Set<String> _selected;
  bool _busy = false;
  String? _error;

  @override
  void initState() {
    super.initState();
    _original = widget.data.selectedIds.toSet();
    _selected = {..._original};
  }

  Future<void> _save() async {
    setState(() => _error = null);
    // The PUT replaces the whole set, so sending an unchanged set would still
    // be a write — and a pointless audit entry.
    if (setEquals(_selected, _original)) {
      setState(() => _error = 'Nothing has changed yet.');
      return;
    }

    setState(() => _busy = true);
    try {
      await ref
          .read(ownerRepositoryProvider)
          .setPropertyAmenities(widget.propertyId, _selected.toList());
      ref.invalidate(propertyAmenitiesProvider(widget.propertyId));
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Facilities updated.')),
      );
      context.pop();
    } on ApiException catch (e) {
      if (!mounted) return;
      setState(() => _error = e.message);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final catalogue = widget.data.catalogue;
    if (catalogue.isEmpty) {
      return const ErrorView(
        message: 'No facilities are available to choose from yet.',
      );
    }

    return ListView(
      padding: const EdgeInsets.fromLTRB(20, 20, 20, 40),
      children: [
        if (_error != null) ...[
          Banner2(text: _error!, tone: BannerTone.danger, icon: Icons.error_outline),
          const SizedBox(height: 16),
        ],
        const Text(
          'Tick everything this hotel offers its guests. Guests see these on '
          'your listing.',
          style: TextStyle(color: AppColors.inkMuted, height: 1.4),
        ),
        const SizedBox(height: 20),
        Wrap(
          spacing: 10,
          runSpacing: 10,
          children: catalogue.map(_chip).toList(),
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
              : const Text('Save facilities'),
        ),
      ],
    );
  }

  /// The app declares no `chipTheme`, so every colour is set here — otherwise
  /// Material 3 falls back to the seeded purple, which is not the brand.
  Widget _chip(Amenity a) {
    final on = _selected.contains(a.id);
    return FilterChip(
      selected: on,
      // The catalogue icon already reads as the label; a checkmark beside it
      // just crowds the chip, so selection is carried by fill and border.
      showCheckmark: false,
      avatar: Icon(
        amenityIcon(a.icon),
        size: 18,
        color: on ? AppColors.primaryDark : AppColors.inkMuted,
      ),
      label: Text(a.name),
      labelStyle: TextStyle(
        color: on ? AppColors.primaryDark : AppColors.ink,
        fontWeight: on ? FontWeight.w600 : FontWeight.w500,
        fontSize: 13.5,
      ),
      backgroundColor: AppColors.surface,
      selectedColor: AppColors.primarySoft,
      side: BorderSide(color: on ? AppColors.primary : AppColors.line),
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(AppRadius.md),
      ),
      onSelected: _busy
          ? null
          : (v) => setState(() {
                if (v) {
                  _selected.add(a.id);
                } else {
                  _selected.remove(a.id);
                }
              }),
    );
  }
}
