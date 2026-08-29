import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/api/api_exception.dart';
import '../../core/data/owner_repository.dart';
import '../../core/models/owner_models.dart';
import '../../core/theme/app_colors.dart';
import '../../core/theme/app_spacing.dart';
import '../../core/theme/app_typography.dart';
import '../../core/widgets/auth_scaffold.dart' show ButtonSpinner;
import '../../core/widgets/cards.dart';
import '../../core/widgets/primitives.dart';
import '../../core/widgets/states.dart';
import 'property_format.dart';
import '../../core/widgets/impersonation_banner.dart';

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
      backgroundColor: context.colors.background,
      appBar: AppBar(title: const Text('Facilities')),
      body: amenities.when(
        loading: () => const PageBody(children: [ListSkeleton(rows: 2)]),
        error: (e, __) => PageBody(
          children: [
            ErrorState(
              error: e,
              message: e is ApiException && e.code == 'PROPERTY_NOT_FOUND'
                  ? 'This hotel is no longer in your portfolio.'
                  : 'Could not load facilities.',
              onRetry: () =>
                  ref.invalidate(propertyAmenitiesProvider(propertyId)),
            ),
          ],
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
      ScaffoldMessenger.of(
        context,
      ).showSnackBar(const SnackBar(content: Text('Facilities updated.')));
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
    final c = context.colors;
    final catalogue = widget.data.catalogue;
    if (catalogue.isEmpty) {
      return const PageBody(
        children: [
          EmptyState(
            icon: Icons.pool_outlined,
            title: 'No facilities are available to choose from yet.',
          ),
        ],
      );
    }

    return PageBody(
      children: [
        if (_error != null) ...[
          NoticeBanner(
            text: _error!,
            tone: NoticeTone.danger,
            icon: Icons.error_outline,
          ),
          gapMd,
        ],
        Text(
          'Tick everything this hotel offers its guests. Guests see these on '
          'your listing.',
          style: AppTypography.body(size: 13.5, color: c.mutedForeground),
        ),
        gapSection,
        Wrap(
          spacing: Sp.sm,
          runSpacing: Sp.sm,
          children: catalogue.map(_chip).toList(),
        ),
        const SizedBox(height: 28),
        ReadOnlyWhenImpersonating(
          child: FilledButton(
            onPressed: _busy ? null : _save,
            child: _busy
                ? const ButtonSpinner()
                : const Text('Save facilities'),
          ),
        ),
      ],
    );
  }

  Widget _chip(Amenity a) {
    final c = context.colors;
    final on = _selected.contains(a.id);
    return FilterChip(
      selected: on,
      // The catalogue icon already reads as the label; a checkmark beside it
      // just crowds the chip, so selection is carried by fill and border.
      showCheckmark: false,
      avatar: Icon(
        amenityIcon(a.icon),
        size: 17,
        color: on ? c.primary : c.mutedForeground,
      ),
      label: Text(a.name),
      labelStyle: AppTypography.body(
        size: 13,
        weight: on ? FontWeight.w700 : FontWeight.w500,
        color: on ? c.primary : c.foreground,
      ),
      backgroundColor: c.card,
      selectedColor: c.primary.withValues(alpha: 0.12),
      side: BorderSide(
        color: on ? c.primary.withValues(alpha: 0.45) : c.border,
      ),
      shape: const RoundedRectangleBorder(borderRadius: R.rMd),
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
