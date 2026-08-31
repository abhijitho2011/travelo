import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/networking/api_exception.dart';
import '../../../core/permissions/permission_gate.dart';
import '../../../core/permissions/permission_keys.dart';
import '../../../core/providers.dart';
import '../../../core/routing/routes.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/theme/app_spacing.dart';
import '../../../core/theme/app_typography.dart';
import '../../../core/widgets/primitives.dart';
import '../../../core/widgets/states.dart';
import '../../../core/widgets/status_badge.dart';
import '../application/rooms_controllers.dart';
import '../data/room_models.dart';
import '../data/rooms_repository.dart';
import 'room_widgets.dart';

/// The catalogue of sellable room categories.
///
/// The server grants `roomtype.*` to the GM and the AGM alone, so in practice
/// everyone who reaches this screen can also edit it. The gates are still on
/// every button: the day a third role is granted `roomtype.read`, this screen
/// becomes read-only for them without a line changing here.
class RoomTypesScreen extends ConsumerStatefulWidget {
  const RoomTypesScreen({super.key});

  @override
  ConsumerState<RoomTypesScreen> createState() => _RoomTypesScreenState();
}

class _RoomTypesScreenState extends ConsumerState<RoomTypesScreen> {
  final _search = TextEditingController();

  @override
  void initState() {
    super.initState();
    _search.text = ref.read(roomTypeFilterProvider).query ?? '';
  }

  @override
  void dispose() {
    _search.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    final filter = ref.watch(roomTypeFilterProvider);
    final types = ref.watch(roomTypesProvider);
    final canWrite = ref.watch(
      canProvider(P.roomTypeCreate),
    );

    return PageBody(
      onRefresh: () async => ref.invalidate(roomTypesProvider),
      children: [
        PageHeader(
          eyebrow: 'Rooms',
          title: 'Room types',
          subtitle:
              'The categories your rooms are sold as. Rate, occupancy and '
              'everything a room of this type comes with.',
          actions: [
            PermissionGate(
              permission: P.roomTypeCreate,
              child: FilledButton.icon(
                onPressed: () => context.go(Routes.roomTypeNew),
                icon: const Icon(Icons.add, size: 16),
                label: const Text('Add room type'),
              ),
            ),
          ],
        ),
        gapSection,

        TextField(
          controller: _search,
          textInputAction: TextInputAction.search,
          decoration: InputDecoration(
            hintText: 'Search room types',
            prefixIcon: const Icon(Icons.search, size: 20),
            suffixIcon: _search.text.isEmpty
                ? null
                : IconButton(
                    icon: const Icon(Icons.close, size: 18),
                    onPressed: () {
                      _search.clear();
                      ref.read(roomTypeFilterProvider.notifier).state = filter
                          .copyWith(query: '');
                    },
                  ),
          ),
          onChanged: (_) => setState(() {}),
          onSubmitted: (value) =>
              ref.read(roomTypeFilterProvider.notifier).state = filter.copyWith(
                query: value.trim(),
              ),
        ),
        gapMd,

        SingleChildScrollView(
          scrollDirection: Axis.horizontal,
          child: Segmented<RoomTypeStatus?>(
            options: const [null, RoomTypeStatus.active, RoomTypeStatus.archived],
            labelOf: (status) => status?.label ?? 'All',
            value: filter.status,
            onChanged: (status) =>
                ref.read(roomTypeFilterProvider.notifier).state = status == null
                ? filter.copyWith(clearStatus: true)
                : filter.copyWith(status: status),
          ),
        ),
        gapMd,

        types.when(
          loading: () => const ListSkeleton(rows: 3, height: 132),
          error: (error, _) => ErrorState(
            error: error,
            onRetry: () => ref.invalidate(roomTypesProvider),
          ),
          data: (list) => list.isEmpty
              ? EmptyState(
                  title: filter.isEmpty
                      ? 'No room types yet'
                      : 'Nothing matches that',
                  hint: filter.isEmpty
                      ? 'Create the categories you sell — Deluxe, Twin, Suite '
                            '— then add rooms to them.'
                      : 'Try a different search, or switch the status filter '
                            'back to All.',
                  icon: Icons.bed_outlined,
                  action: filter.isEmpty
                      ? PermissionGate(
                          permission: P.roomTypeCreate,
                          child: FilledButton.icon(
                            onPressed: () => context.go(Routes.roomTypeNew),
                            icon: const Icon(Icons.add, size: 16),
                            label: const Text('Add room type'),
                          ),
                        )
                      : null,
                )
              : Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    Align(
                      alignment: Alignment.centerLeft,
                      child: Padding(
                        padding: const EdgeInsets.only(bottom: Sp.sm),
                        child: Text(
                          '${list.length} '
                          '${list.length == 1 ? 'type' : 'types'} · '
                          '${list.fold<int>(0, (sum, t) => sum + t.roomCount)} '
                          'rooms in total',
                          style: AppTypography.labelXs(c.mutedForeground),
                        ),
                      ),
                    ),
                    for (final type in list)
                      Padding(
                        padding: const EdgeInsets.only(bottom: Sp.md),
                        child: RoomTypeCard(roomType: type),
                      ),
                    if (!canWrite) ...[
                      gapSm,
                      const PermissionNote(
                        text:
                            'You can see the catalogue. Creating and changing '
                            'room types is a manager’s job.',
                      ),
                    ],
                  ],
                ),
        ),
      ],
    );
  }
}

/// One catalogue row plus its permission-gated actions.
class RoomTypeCard extends ConsumerStatefulWidget {
  const RoomTypeCard({super.key, required this.roomType});

  final RoomType roomType;

  @override
  ConsumerState<RoomTypeCard> createState() => _RoomTypeCardState();
}

class _RoomTypeCardState extends ConsumerState<RoomTypeCard> {
  bool _busy = false;

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    final type = widget.roomType;

    return SoftCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      type.name,
                      style: AppTypography.body(
                        size: 15,
                        weight: FontWeight.w700,
                        color: c.foreground,
                      ),
                    ),
                    if (type.description != null)
                      Padding(
                        padding: const EdgeInsets.only(top: 2),
                        child: Text(
                          type.description!,
                          maxLines: 2,
                          overflow: TextOverflow.ellipsis,
                          style: AppTypography.body(
                            size: 12.5,
                            color: c.mutedForeground,
                          ),
                        ),
                      ),
                  ],
                ),
              ),
              const SizedBox(width: Sp.sm),
              Column(
                crossAxisAlignment: CrossAxisAlignment.end,
                children: [
                  Text(
                    type.baseRateLabel,
                    style: AppTypography.kpi(size: 19, color: c.foreground),
                  ),
                  Text(
                    'per night',
                    style: AppTypography.body(
                      size: 11,
                      color: c.mutedForeground,
                    ),
                  ),
                ],
              ),
            ],
          ),
          const SizedBox(height: Sp.md),

          Wrap(
            spacing: 6,
            runSpacing: 6,
            children: [
              // A villa unit reads first — it changes what a "room" of this
              // type even is.
              if (type.isVilla)
                FeatureChip(
                  icon: Icons.villa_outlined,
                  label: type.unitRoomCount > 1
                      ? 'Villa · ${type.unitRoomCount} rooms'
                      : 'Villa',
                  tone: c.stInspected,
                ),
              if (type.privatePool)
                FeatureChip(
                  icon: Icons.pool_outlined,
                  label: 'Private pool',
                  tone: c.stInspected,
                ),
              FeatureChip(icon: Icons.king_bed_outlined, label: type.bedLabel),
              FeatureChip(
                icon: Icons.people_outline,
                label: type.occupancyLabel,
              ),
              FeatureChip(
                icon: Icons.family_restroom_outlined,
                label: type.guestMixLabel,
              ),
              // AC is a fact about the type, not an amenity, so it reads with
              // the same weight as the bed configuration.
              FeatureChip(
                icon: type.airConditioned ? Icons.ac_unit : Icons.air_outlined,
                label: type.airConditioned ? 'Air-conditioned' : 'Non-AC',
                tone: type.airConditioned ? c.stInspected : null,
              ),
              if (type.sizeSqft != null)
                FeatureChip(
                  icon: Icons.straighten_outlined,
                  label: '${type.sizeSqft} sq ft',
                ),
              FeatureChip(
                icon: Icons.meeting_room_outlined,
                label: type.roomCountLabel,
              ),
            ],
          ),

          if (type.amenities.isNotEmpty) ...[
            const SizedBox(height: Sp.md),
            const LabelXs('Included'),
            const SizedBox(height: 6),
            AmenityWrap(amenities: type.amenities, max: 8),
          ],

          const SizedBox(height: Sp.md),
          Row(
            children: [
              StatusBadge(
                tone: type.status.tone,
                label: type.status.label,
                dense: true,
              ),
              const Spacer(),
              PermissionGate(
                permission: P.roomTypeUpdate,
                child: OutlinedButton.icon(
                  onPressed: _busy
                      ? null
                      : () => context.go(Routes.roomType(type.id)),
                  icon: const Icon(Icons.edit_outlined, size: 15),
                  label: const Text('Edit'),
                ),
              ),
              PermissionGate(
                permission: P.roomTypeDelete,
                child: Padding(
                  padding: const EdgeInsets.only(left: Sp.sm),
                  child: OutlinedButton.icon(
                    onPressed: _busy ? null : _confirmDelete,
                    style: OutlinedButton.styleFrom(
                      foregroundColor: c.destructive,
                      side: BorderSide(
                        color: c.destructive.withValues(alpha: 0.4),
                      ),
                    ),
                    icon: const Icon(Icons.delete_outline, size: 15),
                    label: const Text('Delete'),
                  ),
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }

  Future<void> _confirmDelete() async {
    final type = widget.roomType;
    final inUse = type.roomCount > 0;
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: Text('Delete ${type.name}?'),
        content: Text(
          inUse
              ? '${type.roomCountLabel} still use this type, so Tavelo will '
                    'refuse to delete it. Move those rooms to another type '
                    'first, or archive this one so it stops being offered '
                    'without disturbing anything.'
              : 'Nothing uses this type, so removing it changes no rooms and '
                    'no bookings. It cannot be undone from the app.',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(context).pop(false),
            child: const Text('Cancel'),
          ),
          FilledButton(
            onPressed: () => Navigator.of(context).pop(true),
            style: FilledButton.styleFrom(
              backgroundColor: context.colors.destructive,
            ),
            child: const Text('Delete'),
          ),
        ],
      ),
    );
    if (confirmed != true || !mounted) return;

    setState(() => _busy = true);
    final messenger = ScaffoldMessenger.of(context);
    try {
      await ref.read(roomTypeActionsProvider).remove(type.id);
      messenger.showSnackBar(
        SnackBar(content: Text('${type.name} deleted')),
      );
    } on ApiException catch (e) {
      messenger.showSnackBar(
        SnackBar(content: Text(RoomErrors.friendly(e))),
      );
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }
}
