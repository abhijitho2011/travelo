import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/theme/app_colors.dart';
import '../../../core/theme/app_spacing.dart';
import '../../../core/theme/app_typography.dart';
import '../../../core/widgets/states.dart';
import '../application/rooms_controllers.dart';
import '../data/room_models.dart';

/// A small fact about a room or a type — bed configuration, occupancy, AC.
/// Deliberately quieter than a status badge, which stays reserved for
/// operational state.
class FeatureChip extends StatelessWidget {
  const FeatureChip({
    super.key,
    required this.icon,
    required this.label,
    this.tone,
  });

  final IconData icon;
  final String label;
  final Color? tone;

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    final tint = tone ?? c.mutedForeground;
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
      decoration: BoxDecoration(
        color: tint.withValues(alpha: 0.09),
        borderRadius: R.rSm,
        border: Border.all(color: tint.withValues(alpha: 0.25)),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(icon, size: 12, color: tint),
          const SizedBox(width: 5),
          Text(
            label,
            style: AppTypography.body(
              size: 11.5,
              weight: FontWeight.w600,
              color: tint,
            ),
          ),
        ],
      ),
    );
  }
}

/// A read-only list of amenities. Long lists are trimmed with a count rather
/// than wrapping a card into a paragraph nobody reads.
class AmenityWrap extends StatelessWidget {
  const AmenityWrap({
    super.key,
    required this.amenities,
    this.max = 6,
    this.emptyLabel,
  });

  final List<Amenity> amenities;
  final int max;
  final String? emptyLabel;

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    if (amenities.isEmpty) {
      if (emptyLabel == null) return const SizedBox.shrink();
      return Text(
        emptyLabel!,
        style: AppTypography.body(size: 11.5, color: c.mutedForeground),
      );
    }
    final shown = amenities.take(max).toList(growable: false);
    final hidden = amenities.length - shown.length;
    return Wrap(
      spacing: 6,
      runSpacing: 6,
      children: [
        for (final a in shown)
          FeatureChip(icon: Icons.check_circle_outline, label: a.name),
        if (hidden > 0)
          Text(
            '+$hidden more',
            style: AppTypography.body(size: 11.5, color: c.mutedForeground),
          ),
      ],
    );
  }
}

/// The amenity multi-select, fed by the property's ROOM-scoped catalogue.
///
/// An empty or unavailable catalogue is stated plainly instead of rendering an
/// empty row that looks like a bug.
class AmenityPicker extends ConsumerWidget {
  const AmenityPicker({
    super.key,
    required this.selected,
    required this.onChanged,
    this.excluded = const <String>{},
    this.excludedNote,
  });

  final Set<String> selected;
  final ValueChanged<Set<String>> onChanged;

  /// Amenities the room type already provides. Offering them again on a room
  /// would suggest they can be taken away here, which they cannot.
  final Set<String> excluded;
  final String? excludedNote;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final c = context.colors;
    final catalogue = ref.watch(amenityCatalogueProvider);

    return catalogue.when(
      loading: () => const Row(
        children: [
          Shimmer(width: 84, height: 30, radius: R.sm),
          SizedBox(width: 6),
          Shimmer(width: 110, height: 30, radius: R.sm),
          SizedBox(width: 6),
          Shimmer(width: 72, height: 30, radius: R.sm),
        ],
      ),
      error: (_, _) => Text(
        'The amenity list is not available right now. You can save without it '
        'and add amenities later.',
        style: AppTypography.body(size: 12, color: c.mutedForeground),
      ),
      data: (all) {
        final offered = all
            .where((a) => !excluded.contains(a.id))
            .toList(growable: false);
        if (offered.isEmpty) {
          return Text(
            all.isEmpty
                ? 'No amenities have been set up for this property yet.'
                : (excludedNote ??
                      'The room type already provides every amenity in the '
                          'catalogue.'),
            style: AppTypography.body(size: 12, color: c.mutedForeground),
          );
        }
        return Wrap(
          spacing: 6,
          runSpacing: 6,
          children: [
            for (final amenity in offered)
              FilterChip(
                label: Text(amenity.name),
                selected: selected.contains(amenity.id),
                onSelected: (on) {
                  final next = {...selected};
                  if (on) {
                    next.add(amenity.id);
                  } else {
                    next.remove(amenity.id);
                  }
                  onChanged(next);
                },
              ),
          ],
        );
      },
    );
  }
}

/// The inline failure banner every form in this feature shares.
class FormErrorNote extends StatelessWidget {
  const FormErrorNote({super.key, required this.message});

  final String message;

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: Sp.md, vertical: 10),
      decoration: BoxDecoration(
        color: c.destructive.withValues(alpha: 0.1),
        borderRadius: R.rMd,
        border: Border.all(color: c.destructive.withValues(alpha: 0.3)),
      ),
      child: Row(
        children: [
          Icon(Icons.error_outline, size: 16, color: c.destructive),
          const SizedBox(width: Sp.sm),
          Expanded(
            child: Text(
              message,
              style: AppTypography.body(size: 12.5, color: c.destructive),
            ),
          ),
        ],
      ),
    );
  }
}

/// A quiet explanatory strip, used where a field needs a sentence of context
/// that a hint would truncate.
class FieldNote extends StatelessWidget {
  const FieldNote({super.key, required this.text, this.icon});

  final String text;
  final IconData? icon;

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Icon(icon ?? Icons.info_outline, size: 13, color: c.mutedForeground),
        const SizedBox(width: 6),
        Expanded(
          child: Text(
            text,
            style: AppTypography.body(size: 11.5, color: c.mutedForeground),
          ),
        ),
      ],
    );
  }
}
