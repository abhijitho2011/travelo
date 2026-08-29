import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/api/api_exception.dart';
import '../../core/data/owner_repository.dart';
import '../../core/models/owner_models.dart';
import '../../theme/app_theme.dart';
import '../../widgets/ui.dart';
import 'property_format.dart';

/// One hotel at a glance.
///
/// The split of what is editable here mirrors how a hotel actually runs:
/// facilities are a fact about the business and belong to the owner, while
/// rooms and room types are operational and belong to the General Manager. So
/// everything below is read-only except the facilities editor — a second create
/// button would put two people in charge of the same numbers.
class PropertyDetailScreen extends ConsumerWidget {
  const PropertyDetailScreen({
    super.key,
    required this.propertyId,
    this.property,
  });

  final String propertyId;

  /// Travels as `extra` from the portfolio and properties lists; null on a cold
  /// deep link (or a web reload), where the record is looked up instead.
  final Property? property;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    if (property != null) {
      return _Detail(propertyId: propertyId, property: property!);
    }

    final props = ref.watch(propertiesProvider);
    return props.when(
      loading: () => const _Shell(child: LoadingView()),
      error: (_, __) => _Shell(
        child: ErrorView(
          message: 'Could not load this hotel.',
          onRetry: () => ref.invalidate(propertiesProvider),
        ),
      ),
      data: (list) {
        final found = list.where((p) => p.id == propertyId).firstOrNull;
        if (found == null) {
          return const _Shell(
            child: ErrorView(message: 'This hotel is no longer in your portfolio.'),
          );
        }
        return _Detail(propertyId: propertyId, property: found);
      },
    );
  }
}

/// App bar for the states that have no property name to show yet.
class _Shell extends StatelessWidget {
  const _Shell({required this.child});
  final Widget child;

  @override
  Widget build(BuildContext context) => Scaffold(
        appBar: AppBar(title: const Text('Hotel')),
        body: child,
      );
}

class _Detail extends ConsumerWidget {
  const _Detail({required this.propertyId, required this.property});
  final String propertyId;
  final Property property;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return Scaffold(
      appBar: AppBar(title: Text(property.name)),
      body: RefreshIndicator(
        onRefresh: () async {
          ref.invalidate(propertiesProvider);
          ref.invalidate(propertyAmenitiesProvider(propertyId));
          ref.invalidate(propertyRoomTypesProvider(propertyId));
          ref.invalidate(propertyRoomsProvider(propertyId));
        },
        child: ListView(
          padding: const EdgeInsets.fromLTRB(20, 16, 20, 40),
          children: [
            _Header(property: property),
            const SizedBox(height: 20),
            _ManagersTile(propertyId: propertyId),
            const SizedBox(height: 24),
            _Facilities(propertyId: propertyId),
            const SizedBox(height: 24),
            _RoomTypes(propertyId: propertyId),
            const SizedBox(height: 24),
            _Rooms(propertyId: propertyId),
          ],
        ),
      ),
    );
  }
}

class _Header extends StatelessWidget {
  const _Header({required this.property});
  final Property property;

  @override
  Widget build(BuildContext context) {
    final p = property;
    final place = [p.city, p.state].where((s) => s.isNotEmpty).join(', ');
    return Container(
      padding: const EdgeInsets.all(20),
      decoration: BoxDecoration(
        color: AppColors.surface,
        borderRadius: BorderRadius.circular(AppRadius.xl),
        border: Border.all(color: AppColors.line),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Container(
                width: 52,
                height: 52,
                decoration: BoxDecoration(
                  color: AppColors.primarySoft,
                  borderRadius: BorderRadius.circular(AppRadius.md),
                ),
                child: const Icon(Icons.location_city_rounded, color: AppColors.primaryDark),
              ),
              const SizedBox(width: 14),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      p.name,
                      style: const TextStyle(
                          fontSize: 19, fontWeight: FontWeight.w800, color: AppColors.ink),
                    ),
                    if (place.isNotEmpty) ...[
                      const SizedBox(height: 2),
                      Text(place,
                          style: const TextStyle(color: AppColors.inkMuted, fontSize: 13.5)),
                    ],
                  ],
                ),
              ),
              const SizedBox(width: 8),
              StatusChip(
                label: p.status.isEmpty ? 'DRAFT' : p.status,
                color: p.status == 'ACTIVE' ? AppColors.success : AppColors.inkMuted,
              ),
            ],
          ),
          const SizedBox(height: 16),
          Row(
            children: [
              const Icon(Icons.bed_outlined, size: 17, color: AppColors.inkFaint),
              const SizedBox(width: 6),
              Text(
                '${p.roomCount} ${p.roomCount == 1 ? 'room' : 'rooms'}',
                style: const TextStyle(color: AppColors.inkMuted, fontSize: 13.5),
              ),
              if (p.starRating > 0) ...[
                const SizedBox(width: 14),
                const Icon(Icons.star_rounded, size: 17, color: AppColors.warning),
                const SizedBox(width: 4),
                Text('${p.starRating}-star',
                    style: const TextStyle(color: AppColors.inkMuted, fontSize: 13.5)),
              ],
            ],
          ),
        ],
      ),
    );
  }
}

class _ManagersTile extends StatelessWidget {
  const _ManagersTile({required this.propertyId});
  final String propertyId;

  @override
  Widget build(BuildContext context) {
    return Card(
      child: ListTile(
        contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
        onTap: () => context.push('/properties/$propertyId/staff'),
        leading: const CircleAvatar(
          backgroundColor: AppColors.primarySoft,
          child: Icon(Icons.groups_outlined, color: AppColors.primaryDark),
        ),
        title: const Text('Managers', style: TextStyle(fontWeight: FontWeight.w700)),
        subtitle: const Text('General Managers and Assistant GMs for this hotel'),
        trailing: const Icon(Icons.chevron_right, color: AppColors.inkFaint),
      ),
    );
  }
}

// ---------------------------------------------------------------------------
// Facilities — the one editable section
// ---------------------------------------------------------------------------

class _Facilities extends ConsumerWidget {
  const _Facilities({required this.propertyId});
  final String propertyId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final amenities = ref.watch(propertyAmenitiesProvider(propertyId));
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        SectionTitle(
          'Facilities',
          trailing: TextButton.icon(
            onPressed: () => context.push('/properties/$propertyId/amenities'),
            icon: const Icon(Icons.edit_outlined, size: 17),
            label: const Text('Edit'),
          ),
        ),
        const SizedBox(height: 12),
        amenities.when(
          loading: () => const LinearProgressIndicator(minHeight: 2),
          error: (e, __) => Text(
            e is ApiException && e.code == 'PROPERTY_NOT_FOUND'
                ? 'This hotel is no longer in your portfolio.'
                : 'Could not load facilities.',
            style: const TextStyle(color: AppColors.inkMuted),
          ),
          data: (d) => d.selected.isEmpty
              ? const _EmptyNote(
                  icon: Icons.pool_outlined,
                  text: 'No facilities listed yet — tap Edit to tell guests what '
                      'this hotel offers.',
                )
              : Wrap(
                  spacing: 10,
                  runSpacing: 10,
                  children: d.selected.map((a) => _AmenityChip(amenity: a)).toList(),
                ),
        ),
      ],
    );
  }
}

/// Read-only twin of the editor's `FilterChip`. The app declares no `chipTheme`,
/// so the brand colours are set here rather than inherited.
class _AmenityChip extends StatelessWidget {
  const _AmenityChip({required this.amenity});
  final Amenity amenity;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
      decoration: BoxDecoration(
        color: AppColors.primarySoft,
        borderRadius: BorderRadius.circular(AppRadius.md),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(amenityIcon(amenity.icon), size: 17, color: AppColors.primaryDark),
          const SizedBox(width: 8),
          Text(
            amenity.name,
            style: const TextStyle(
              color: AppColors.primaryDark,
              fontSize: 13.5,
              fontWeight: FontWeight.w600,
            ),
          ),
        ],
      ),
    );
  }
}

// ---------------------------------------------------------------------------
// Room types — read-only
// ---------------------------------------------------------------------------

class _RoomTypes extends ConsumerWidget {
  const _RoomTypes({required this.propertyId});
  final String propertyId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final types = ref.watch(propertyRoomTypesProvider(propertyId));
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        const SectionTitle('Room types'),
        const SizedBox(height: 12),
        types.when(
          loading: () => const LinearProgressIndicator(minHeight: 2),
          error: (_, __) => const Text(
            'Could not load room types.',
            style: TextStyle(color: AppColors.inkMuted),
          ),
          data: (list) => list.isEmpty
              ? const _EmptyNote(
                  icon: Icons.king_bed_outlined,
                  text: 'No room types yet — your General Manager sets these up '
                      'in the Tavelo staff app.',
                )
              : Column(
                  children: [
                    for (var i = 0; i < list.length; i++) ...[
                      if (i > 0) const SizedBox(height: 12),
                      _RoomTypeCard(type: list[i]),
                    ],
                  ],
                ),
        ),
      ],
    );
  }
}

class _RoomTypeCard extends StatelessWidget {
  const _RoomTypeCard({required this.type});
  final RoomType type;

  @override
  Widget build(BuildContext context) {
    final t = type;
    final bed = bedSummary(t);
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: AppColors.surface,
        borderRadius: BorderRadius.circular(AppRadius.lg),
        border: Border.all(color: AppColors.line),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Expanded(
                child: Text(
                  t.name.isEmpty ? 'Room type' : t.name,
                  style: const TextStyle(
                      fontWeight: FontWeight.w700, fontSize: 15.5, color: AppColors.ink),
                ),
              ),
              const SizedBox(width: 12),
              Text(
                formatPaise(t.baseRate, t.currency),
                style: const TextStyle(
                    fontWeight: FontWeight.w800, fontSize: 15.5, color: AppColors.ink),
              ),
            ],
          ),
          const SizedBox(height: 2),
          Text(
            '${t.roomCount} ${t.roomCount == 1 ? 'room' : 'rooms'} of this type · '
            'base rate per night',
            style: const TextStyle(color: AppColors.inkFaint, fontSize: 12.5),
          ),
          const SizedBox(height: 12),
          Wrap(
            spacing: 8,
            runSpacing: 8,
            children: [
              if (bed.isNotEmpty) _Fact(icon: Icons.king_bed_outlined, label: bed),
              if (t.maxOccupancy > 0)
                _Fact(icon: Icons.people_outline, label: 'Sleeps ${t.maxOccupancy}'),
              _Fact(
                icon: t.airConditioned ? Icons.ac_unit : Icons.air,
                label: t.airConditioned ? 'AC' : 'Non-AC',
              ),
              if (t.sizeSqft > 0)
                _Fact(icon: Icons.straighten, label: '${t.sizeSqft} sq ft'),
            ],
          ),
        ],
      ),
    );
  }
}

/// One small icon + label pill inside a room-type card.
class _Fact extends StatelessWidget {
  const _Fact({required this.icon, required this.label});
  final IconData icon;
  final String label;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
      decoration: BoxDecoration(
        color: AppColors.field,
        borderRadius: BorderRadius.circular(AppRadius.sm),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(icon, size: 15, color: AppColors.inkMuted),
          const SizedBox(width: 6),
          Text(label,
              style: const TextStyle(
                  color: AppColors.inkMuted, fontSize: 12.5, fontWeight: FontWeight.w600)),
        ],
      ),
    );
  }
}

// ---------------------------------------------------------------------------
// Rooms — read-only summary
// ---------------------------------------------------------------------------

/// Housekeeping statuses, in the order a room moves through them. Tone matters
/// more than the exact word: green is sellable, amber needs work, red is out.
(String, Color) _roomStatus(String raw) => switch (raw.toUpperCase()) {
      'AVAILABLE' => ('Available', AppColors.success),
      'READY' => ('Ready', AppColors.success),
      'INSPECTED' => ('Inspected', AppColors.success),
      'OCCUPIED' => ('Occupied', AppColors.info),
      'DIRTY' => ('Dirty', AppColors.warning),
      'CLEANING' => ('Cleaning', AppColors.warning),
      'MAINTENANCE' => ('Maintenance', AppColors.warning),
      'OUT_OF_ORDER' => ('Out of order', AppColors.danger),
      _ => (raw.isEmpty ? 'Unknown' : raw, AppColors.inkMuted),
    };

class _Rooms extends ConsumerWidget {
  const _Rooms({required this.propertyId});
  final String propertyId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final rooms = ref.watch(propertyRoomsProvider(propertyId));
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        const SectionTitle('Rooms'),
        const SizedBox(height: 12),
        rooms.when(
          loading: () => const LinearProgressIndicator(minHeight: 2),
          error: (_, __) => const Text(
            'Could not load rooms.',
            style: TextStyle(color: AppColors.inkMuted),
          ),
          data: (list) => list.isEmpty
              ? const _EmptyNote(
                  icon: Icons.meeting_room_outlined,
                  text: 'No rooms yet — your General Manager adds them in the '
                      'Tavelo staff app.',
                )
              : _RoomsSummary(rooms: list),
        ),
      ],
    );
  }
}

class _RoomsSummary extends StatelessWidget {
  const _RoomsSummary({required this.rooms});
  final List<Room> rooms;

  /// Counts keyed by raw status, in the order the statuses first appear on the
  /// sorted room list — stable enough to read at a glance without imposing an
  /// order the backend has not promised.
  Map<String, int> get _byStatus {
    final out = <String, int>{};
    for (final r in rooms) {
      final key = r.status.toUpperCase();
      out[key] = (out[key] ?? 0) + 1;
    }
    return out;
  }

  /// Floors are varchars ("G", "LG", "M"), so numeric ones sort numerically and
  /// the rest fall back to alphabetical. Rooms with no floor go last.
  List<MapEntry<String, int>> get _byFloor {
    final out = <String, int>{};
    for (final r in rooms) {
      final key = r.floor.trim();
      out[key] = (out[key] ?? 0) + 1;
    }
    final entries = out.entries.toList()
      ..sort((a, b) {
        if (a.key.isEmpty) return 1;
        if (b.key.isEmpty) return -1;
        final na = int.tryParse(a.key);
        final nb = int.tryParse(b.key);
        if (na != null && nb != null) return na.compareTo(nb);
        if (na != null) return -1;
        if (nb != null) return 1;
        return a.key.compareTo(b.key);
      });
    return entries;
  }

  @override
  Widget build(BuildContext context) {
    final counts = _byStatus;
    final floors = _byFloor;

    return Container(
      padding: const EdgeInsets.all(18),
      decoration: BoxDecoration(
        color: AppColors.surface,
        borderRadius: BorderRadius.circular(AppRadius.lg),
        border: Border.all(color: AppColors.line),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Text(
                '${rooms.length}',
                style: const TextStyle(
                    fontSize: 22, fontWeight: FontWeight.w800, color: AppColors.ink),
              ),
              const SizedBox(width: 8),
              Padding(
                padding: const EdgeInsets.only(top: 4),
                child: Text(
                  rooms.length == 1 ? 'room' : 'rooms',
                  style: const TextStyle(color: AppColors.inkMuted),
                ),
              ),
            ],
          ),
          const SizedBox(height: 14),
          Wrap(
            spacing: 8,
            runSpacing: 8,
            children: counts.entries.map((e) {
              final (label, color) = _roomStatus(e.key);
              return StatusChip(label: '${e.value} $label', color: color);
            }).toList(),
          ),
          if (floors.isNotEmpty) ...[
            const SizedBox(height: 14),
            Text(
              floors
                  .map((e) => e.key.isEmpty
                      ? 'No floor set: ${e.value}'
                      : 'Floor ${e.key}: ${e.value}')
                  .join('  ·  '),
              style: const TextStyle(color: AppColors.inkMuted, fontSize: 12.5, height: 1.5),
            ),
          ],
          const SizedBox(height: 14),
          const Text(
            'Rooms are managed by your General Manager in the Tavelo staff app.',
            style: TextStyle(color: AppColors.inkFaint, fontSize: 12.5),
          ),
        ],
      ),
    );
  }
}

/// Shared empty state for the inventory sections. One sentence, because each
/// of these says the same thing: nothing here yet, and here is who adds it.
class _EmptyNote extends StatelessWidget {
  const _EmptyNote({required this.icon, required this.text});
  final IconData icon;
  final String text;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(20),
      decoration: BoxDecoration(
        color: AppColors.surface,
        borderRadius: BorderRadius.circular(AppRadius.lg),
        border: Border.all(color: AppColors.line),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(icon, size: 22, color: AppColors.inkFaint),
          const SizedBox(width: 14),
          Expanded(
            child: Text(
              text,
              style: const TextStyle(
                  color: AppColors.inkMuted, fontSize: 13.5, height: 1.45),
            ),
          ),
        ],
      ),
    );
  }
}
