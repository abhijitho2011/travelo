import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:image_picker/image_picker.dart';

import '../../core/api/api_exception.dart';
import '../../core/data/owner_repository.dart';
import '../../core/models/owner_models.dart';
import '../../core/theme/app_colors.dart';
import '../../core/theme/app_spacing.dart';
import '../../core/theme/app_typography.dart';
import '../../core/widgets/cards.dart';
import '../../core/widgets/primitives.dart';
import '../../core/widgets/states.dart';
import '../../core/widgets/status_badge.dart';
import 'property_card.dart' show propertyStatusTone;
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
      loading: () =>
          const _Shell(child: PageBody(children: [ListSkeleton(rows: 3)])),
      error: (e, __) => _Shell(
        child: PageBody(
          children: [
            ErrorState(
              error: e,
              message: 'Could not load this hotel.',
              onRetry: () => ref.invalidate(propertiesProvider),
            ),
          ],
        ),
      ),
      data: (list) {
        final found = list.where((p) => p.id == propertyId).firstOrNull;
        if (found == null) {
          return const _Shell(
            child: PageBody(
              children: [
                EmptyState(
                  icon: Icons.location_off_outlined,
                  title: 'This hotel is no longer in your portfolio.',
                ),
              ],
            ),
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
    backgroundColor: context.colors.background,
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
      backgroundColor: context.colors.background,
      appBar: AppBar(
        title: Text(property.name),
        actions: [
          PopupMenuButton<String>(
            onSelected: (v) {
              if (v == 'archive') _confirmArchive(context, ref, property);
            },
            itemBuilder: (_) => const [
              PopupMenuItem(value: 'archive', child: Text('Archive property')),
            ],
          ),
        ],
      ),
      body: PageBody(
        onRefresh: () async {
          ref.invalidate(propertiesProvider);
          ref.invalidate(propertyAmenitiesProvider(propertyId));
          ref.invalidate(propertyRoomTypesProvider(propertyId));
          ref.invalidate(propertyRoomsProvider(propertyId));
        },
        children: [
          _Header(property: property),
          gapMd,
          _Photos(propertyId: propertyId),
          gapSection,
          _Operations(propertyId: propertyId),
          gapSection,
          _CalendarTile(propertyId: propertyId, propertyName: property.name),
          gapSection,
          _ManagersTile(propertyId: propertyId),
          gapSection,
          _Facilities(propertyId: propertyId),
          gapSection,
          _RoomTypes(propertyId: propertyId),
          gapSection,
          _Rooms(propertyId: propertyId),
        ],
      ),
    );
  }
}

class _Header extends StatelessWidget {
  const _Header({required this.property});
  final Property property;

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    final p = property;
    final place = [p.city, p.state].where((s) => s.isNotEmpty).join(', ');
    return SoftCard(
      padding: const EdgeInsets.all(Sp.xl),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Container(
                width: 52,
                height: 52,
                decoration: BoxDecoration(color: c.accent, borderRadius: R.rMd),
                alignment: Alignment.center,
                child: Icon(
                  Icons.location_city_rounded,
                  color: c.accentForeground,
                ),
              ),
              const SizedBox(width: Sp.md),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      p.name,
                      style: AppTypography.display(
                        size: 19,
                        color: c.foreground,
                      ),
                    ),
                    if (place.isNotEmpty) ...[
                      const SizedBox(height: 2),
                      Text(
                        place,
                        style: AppTypography.body(
                          size: 13,
                          color: c.mutedForeground,
                        ),
                      ),
                    ],
                  ],
                ),
              ),
              const SizedBox(width: Sp.sm),
              StatusBadge(
                tone: propertyStatusTone(p.status),
                label: p.status.isEmpty ? 'DRAFT' : p.status,
              ),
            ],
          ),
          const SizedBox(height: Sp.lg),
          Wrap(
            spacing: Sp.sm,
            runSpacing: Sp.sm,
            children: [
              MetaPill(
                icon: Icons.bed_outlined,
                label: '${p.roomCount} ${p.roomCount == 1 ? 'room' : 'rooms'}',
              ),
              if (p.contactPhone.isNotEmpty)
                MetaPill(
                  icon: Icons.phone_outlined,
                  label: p.contactPhone,
                ),
            ],
          ),
        ],
      ),
    );
  }
}

/// Entry point to the read-only occupancy chart.
class _CalendarTile extends StatelessWidget {
  const _CalendarTile({required this.propertyId, required this.propertyName});
  final String propertyId;
  final String propertyName;

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    return SoftCard(
      padding: EdgeInsets.zero,
      child: DataRow2(
        title: 'Calendar',
        subtitle: 'Occupancy and bookings, a fortnight at a time',
        leading: Container(
          width: 38,
          height: 38,
          decoration: BoxDecoration(color: c.accent, borderRadius: R.rSm),
          alignment: Alignment.center,
          child: Icon(
            Icons.calendar_month_outlined,
            size: 19,
            color: c.accentForeground,
          ),
        ),
        trailing: Icon(Icons.chevron_right, size: 18, color: c.mutedForeground),
        onTap: () => context.push(
          '/properties/$propertyId/calendar',
          extra: propertyName,
        ),
      ),
    );
  }
}

class _ManagersTile extends StatelessWidget {
  const _ManagersTile({required this.propertyId});
  final String propertyId;

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    return SoftCard(
      padding: EdgeInsets.zero,
      child: DataRow2(
        title: 'Managers',
        subtitle: 'General Managers and Assistant GMs for this hotel',
        leading: Container(
          width: 38,
          height: 38,
          decoration: BoxDecoration(color: c.accent, borderRadius: R.rSm),
          alignment: Alignment.center,
          child: Icon(
            Icons.groups_outlined,
            size: 19,
            color: c.accentForeground,
          ),
        ),
        trailing: Icon(Icons.chevron_right, size: 18, color: c.mutedForeground),
        onTap: () => context.push('/properties/$propertyId/staff'),
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
    final c = context.colors;
    final amenities = ref.watch(propertyAmenitiesProvider(propertyId));
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        SectionHeader(
          title: 'Facilities',
          icon: Icons.pool_outlined,
          trailing: TextButton.icon(
            onPressed: () => context.push('/properties/$propertyId/amenities'),
            icon: const Icon(Icons.edit_outlined, size: 15),
            label: const Text('Edit'),
          ),
        ),
        amenities.when(
          loading: () => const InlineLoader(),
          error: (e, __) => Text(
            e is ApiException && e.code == 'PROPERTY_NOT_FOUND'
                ? 'This hotel is no longer in your portfolio.'
                : 'Could not load facilities.',
            style: AppTypography.body(size: 13, color: c.mutedForeground),
          ),
          data: (d) => d.selected.isEmpty
              ? const EmptyState(
                  icon: Icons.pool_outlined,
                  title: 'No facilities listed yet',
                  hint: 'Tap Edit to tell guests what this hotel offers.',
                )
              : Wrap(
                  spacing: Sp.sm,
                  runSpacing: Sp.sm,
                  children: [
                    for (final a in d.selected)
                      MetaPill(
                        icon: amenityIcon(a.icon),
                        label: a.name,
                        tone: c.primary,
                      ),
                  ],
                ),
        ),
      ],
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
    final c = context.colors;
    final types = ref.watch(propertyRoomTypesProvider(propertyId));
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        const SectionHeader(title: 'Room types', icon: Icons.king_bed_outlined),
        types.when(
          loading: () => const InlineLoader(),
          error: (_, __) => Text(
            'Could not load room types.',
            style: AppTypography.body(size: 13, color: c.mutedForeground),
          ),
          data: (list) => list.isEmpty
              ? const EmptyState(
                  icon: Icons.king_bed_outlined,
                  title: 'No room types yet',
                  hint:
                      'Your General Manager sets these up in the Tavelo staff '
                      'app.',
                )
              : Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    for (var i = 0; i < list.length; i++) ...[
                      if (i > 0) const SizedBox(height: Sp.md),
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
    final c = context.colors;
    final t = type;
    final bed = bedSummary(t);
    return SoftCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Expanded(
                child: Text(
                  t.name.isEmpty ? 'Room type' : t.name,
                  style: AppTypography.body(
                    size: 14.5,
                    weight: FontWeight.w700,
                    color: c.foreground,
                  ),
                ),
              ),
              const SizedBox(width: Sp.md),
              Text(
                formatPaise(t.baseRate, t.currency),
                style: AppTypography.kpi(size: 18, color: c.foreground),
              ),
            ],
          ),
          const SizedBox(height: 3),
          Text(
            '${t.roomCount} ${t.roomCount == 1 ? 'room' : 'rooms'} of this type · '
            'base rate per night',
            style: AppTypography.body(size: 12, color: c.mutedForeground),
          ),
          const SizedBox(height: Sp.md),
          Wrap(
            spacing: Sp.sm,
            runSpacing: Sp.sm,
            children: [
              if (bed.isNotEmpty)
                MetaPill(icon: Icons.king_bed_outlined, label: bed),
              if (t.maxOccupancy > 0)
                MetaPill(
                  icon: Icons.people_outline,
                  label: 'Sleeps ${t.maxOccupancy}',
                ),
              MetaPill(
                icon: t.airConditioned ? Icons.ac_unit : Icons.air,
                label: t.airConditioned ? 'AC' : 'Non-AC',
              ),
              if (t.sizeSqft > 0)
                MetaPill(icon: Icons.straighten, label: '${t.sizeSqft} sq ft'),
            ],
          ),
        ],
      ),
    );
  }
}

// ---------------------------------------------------------------------------
// Rooms — read-only summary
// ---------------------------------------------------------------------------

/// Housekeeping statuses, in the order a room moves through them. The wording
/// and the tone both come from the shared status palette, so a room reads the
/// same here as it does in the staff app.
(String, StatusTone) roomStatusChip(String raw) => switch (raw.toUpperCase()) {
  'AVAILABLE' => ('Available', StatusTone.available),
  'READY' => ('Ready', StatusTone.available),
  'INSPECTED' => ('Inspected', StatusTone.inspected),
  'OCCUPIED' => ('Occupied', StatusTone.occupied),
  'DIRTY' => ('Dirty', StatusTone.dirty),
  'CLEANING' => ('Cleaning', StatusTone.cleaning),
  'MAINTENANCE' => ('Maintenance', StatusTone.maintenance),
  'OUT_OF_ORDER' => ('Out of order', StatusTone.outOfOrder),
  _ => (raw.isEmpty ? 'Unknown' : raw, StatusTone.neutral),
};

class _Rooms extends ConsumerWidget {
  const _Rooms({required this.propertyId});
  final String propertyId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final c = context.colors;
    final rooms = ref.watch(propertyRoomsProvider(propertyId));
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        const SectionHeader(title: 'Rooms', icon: Icons.meeting_room_outlined),
        rooms.when(
          loading: () => const InlineLoader(),
          error: (_, __) => Text(
            'Could not load rooms.',
            style: AppTypography.body(size: 13, color: c.mutedForeground),
          ),
          data: (list) => list.isEmpty
              ? const EmptyState(
                  icon: Icons.meeting_room_outlined,
                  title: 'No rooms yet',
                  hint:
                      'Your General Manager adds them in the Tavelo staff app.',
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
    final c = context.colors;
    final counts = _byStatus;
    final floors = _byFloor;

    return SoftCard(
      padding: const EdgeInsets.all(18),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            crossAxisAlignment: CrossAxisAlignment.end,
            children: [
              Text(
                '${rooms.length}',
                style: AppTypography.kpi(size: 24, color: c.foreground),
              ),
              const SizedBox(width: Sp.sm),
              Text(
                rooms.length == 1 ? 'room' : 'rooms',
                style: AppTypography.body(size: 13, color: c.mutedForeground),
              ),
            ],
          ),
          const SizedBox(height: Sp.md),
          Wrap(
            spacing: Sp.sm,
            runSpacing: Sp.sm,
            children: [
              for (final e in counts.entries)
                Builder(
                  builder: (_) {
                    final (label, tone) = roomStatusChip(e.key);
                    return StatusBadge(tone: tone, label: '${e.value} $label');
                  },
                ),
            ],
          ),
          if (floors.isNotEmpty) ...[
            const SizedBox(height: Sp.md),
            Text(
              floors
                  .map(
                    (e) => e.key.isEmpty
                        ? 'No floor set: ${e.value}'
                        : 'Floor ${e.key}: ${e.value}',
                  )
                  .join('  ·  '),
              style: AppTypography.numeric(size: 12, color: c.mutedForeground),
            ),
          ],
          const SizedBox(height: Sp.md),
          Text(
            'Rooms are managed by your General Manager in the Tavelo staff app.',
            style: AppTypography.body(size: 12, color: c.mutedForeground),
          ),
        ],
      ),
    );
  }
}

/// The property's photo gallery, with add and delete. Photos were write-once at
/// creation before this; the endpoints (list/upload/delete) already existed.
class _Photos extends ConsumerStatefulWidget {
  const _Photos({required this.propertyId});
  final String propertyId;

  @override
  ConsumerState<_Photos> createState() => _PhotosState();
}

class _PhotosState extends ConsumerState<_Photos> {
  bool _busy = false;

  Future<void> _add() async {
    final messenger = ScaffoldMessenger.of(context);
    final picker = ImagePicker();
    final imgs = await picker.pickMultiImage(imageQuality: 80);
    if (imgs.isEmpty) return;
    setState(() => _busy = true);
    try {
      for (final img in imgs) {
        await ref.read(ownerRepositoryProvider).uploadPropertyPhoto(widget.propertyId, img);
      }
      ref.invalidate(propertyPhotosProvider(widget.propertyId));
      ref.invalidate(propertiesProvider); // cover photo / completeness may change
    } on ApiException catch (e) {
      messenger.showSnackBar(SnackBar(content: Text(e.message.isEmpty ? 'Upload failed.' : e.message)));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _delete(String photoId) async {
    final messenger = ScaffoldMessenger.of(context);
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Delete this photo?'),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('Cancel')),
          FilledButton(onPressed: () => Navigator.pop(ctx, true), child: const Text('Delete')),
        ],
      ),
    );
    if (ok != true) return;
    try {
      await ref.read(ownerRepositoryProvider).deletePropertyPhoto(widget.propertyId, photoId);
      ref.invalidate(propertyPhotosProvider(widget.propertyId));
      ref.invalidate(propertiesProvider);
    } on ApiException catch (e) {
      messenger.showSnackBar(SnackBar(content: Text(e.message.isEmpty ? 'Delete failed.' : e.message)));
    }
  }

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    final async = ref.watch(propertyPhotosProvider(widget.propertyId));
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Row(
          children: [
            const Expanded(
              child: SectionHeader(title: 'Photos', icon: Icons.photo_library_outlined),
            ),
            TextButton.icon(
              onPressed: _busy ? null : _add,
              icon: _busy
                  ? const SizedBox(width: 14, height: 14, child: CircularProgressIndicator(strokeWidth: 2))
                  : const Icon(Icons.add_a_photo_outlined, size: 18),
              label: const Text('Add'),
            ),
          ],
        ),
        async.when(
          loading: () => const SizedBox(height: 110, child: Center(child: CircularProgressIndicator())),
          error: (_, __) => Text(
            'Could not load photos.',
            style: AppTypography.body(size: 13, color: c.mutedForeground),
          ),
          data: (photos) {
            if (photos.isEmpty) {
              return Text(
                'No photos yet. Add a few to help this listing stand out.',
                style: AppTypography.body(size: 13, color: c.mutedForeground),
              );
            }
            return SizedBox(
              height: 110,
              child: ListView.separated(
                scrollDirection: Axis.horizontal,
                itemCount: photos.length,
                separatorBuilder: (_, __) => const SizedBox(width: Sp.sm),
                itemBuilder: (_, i) {
                  final p = photos[i];
                  final url = p['url'] as String?;
                  return Stack(
                    children: [
                      ClipRRect(
                        borderRadius: R.rMd,
                        child: url == null
                            ? Container(width: 150, height: 110, color: c.muted)
                            : Image.network(
                                url,
                                width: 150,
                                height: 110,
                                fit: BoxFit.cover,
                                errorBuilder: (_, __, ___) =>
                                    Container(width: 150, height: 110, color: c.muted),
                              ),
                      ),
                      Positioned(
                        top: 2,
                        right: 2,
                        child: Material(
                          color: Colors.black54,
                          shape: const CircleBorder(),
                          child: InkWell(
                            customBorder: const CircleBorder(),
                            onTap: () => _delete('${p['id']}'),
                            child: const Padding(
                              padding: EdgeInsets.all(4),
                              child: Icon(Icons.close, size: 16, color: Colors.white),
                            ),
                          ),
                        ),
                      ),
                    ],
                  );
                },
              ),
            );
          },
        ),
      ],
    );
  }
}

/// Confirms and archives a property, then returns to the portfolio.
Future<void> _confirmArchive(
  BuildContext context,
  WidgetRef ref,
  Property property,
) async {
  final messenger = ScaffoldMessenger.of(context);
  final ok = await showDialog<bool>(
    context: context,
    builder: (ctx) => AlertDialog(
      title: Text('Archive ${property.name}?'),
      content: const Text(
        'The hotel is hidden from your portfolio and frees an allowance slot. '
        'Contact Tavelo to restore it.',
      ),
      actions: [
        TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('Cancel')),
        FilledButton(onPressed: () => Navigator.pop(ctx, true), child: const Text('Archive')),
      ],
    ),
  );
  if (ok != true) return;
  try {
    await ref.read(ownerRepositoryProvider).archiveProperty(property.id);
    ref.invalidate(propertiesProvider);
    ref.invalidate(portfolioProvider);
    if (context.mounted) context.go('/properties');
  } on ApiException catch (e) {
    messenger.showSnackBar(
      SnackBar(content: Text(e.message.isEmpty ? 'Could not archive.' : e.message)),
    );
  }
}


/// A read-only operational snapshot of the hotel for the owner: today's
/// occupancy, arrivals/departures and in-house, plus a short history.
class _Operations extends ConsumerWidget {
  const _Operations({required this.propertyId});
  final String propertyId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final c = context.colors;
    final async = ref.watch(propertyOperationsProvider(propertyId));
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        const SectionHeader(title: 'Operations today', icon: Icons.insights_outlined),
        async.when(
          loading: () => const SizedBox(height: 72, child: Center(child: CircularProgressIndicator())),
          error: (_, __) => Text(
            'Operational figures are unavailable right now.',
            style: AppTypography.body(size: 13, color: c.mutedForeground),
          ),
          data: (ops) {
            int n(String k) => (ops[k] as num?)?.toInt() ?? 0;
            return SoftCard(
              padding: const EdgeInsets.all(Sp.lg),
              child: Column(
                children: [
                  FactRow(label: 'Occupancy', value: '${n('occupancyPct')}%'),
                  const SizedBox(height: 10),
                  FactRow(label: 'In-house', value: '${n('inHouse')} guests'),
                  const SizedBox(height: 10),
                  FactRow(label: 'Arrivals today', value: '${n('arrivalsToday')}'),
                  const SizedBox(height: 10),
                  FactRow(label: 'Departures today', value: '${n('departuresToday')}'),
                  const SizedBox(height: 10),
                  FactRow(
                    label: 'Rooms occupied',
                    value: '${n('roomsOccupied')} / ${n('roomsSellable')}',
                  ),
                ],
              ),
            );
          },
        ),
      ],
    );
  }
}
