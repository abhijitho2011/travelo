import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

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
import '../application/units_controllers.dart';
import '../data/room_models.dart';
import '../data/unit_models.dart';

/// How the catalogue is ordered on screen. Client-side: the list is one
/// property's room types, never more than a page of them.
enum UnitSort {
  nameAsc('Name A–Z'),
  nameDesc('Name Z–A'),
  rateAsc('Rate low to high'),
  rateDesc('Rate high to low'),
  unitsDesc('Most units');

  const UnitSort(this.label);
  final String label;
}

final _sortProvider = StateProvider<UnitSort>((_) => UnitSort.nameAsc);
final _accommodationProvider = StateProvider<AccommodationType?>((_) => null);

/// **Room types & rates** — the SHARED groupings.
///
/// Room-first properties never come here: a room carries its own
/// specifications and is edited on the room itself. This page is for the
/// grouped case, where several identical rooms really do share one sheet.
///
/// The page holds the hierarchy the rest of the PMS depends on:
///
///   room type → physical units → rate plans → availability → reservations
///
/// A room type ("Deluxe King") is what a guest books; a unit ("101") is the
/// door they walk through. The two are never the same record, and this list is
/// the type level — units live inside each type's workspace.
class UnitsScreen extends ConsumerStatefulWidget {
  const UnitsScreen({super.key});

  @override
  ConsumerState<UnitsScreen> createState() => _UnitsScreenState();
}

class _UnitsScreenState extends ConsumerState<UnitsScreen> {
  final _search = TextEditingController();

  /// Below this the table becomes cards — a row of eight columns cannot be
  /// read on a phone, and a horizontally scrolling table is worse than a list.
  static const double _tableBreakpoint = 900;

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

  List<RoomType> _visible(List<RoomType> all, List<RatePlan> plans) {
    final accommodation = ref.watch(_accommodationProvider);
    final sort = ref.watch(_sortProvider);

    final rows = all
        .where(
          (t) => accommodation == null || t.accommodationType == accommodation,
        )
        .toList();

    int startingRate(RoomType t) {
      final active = plans
          .where((p) => p.roomTypeId == t.id && p.isActive)
          .map((p) => p.basePricePaise);
      return active.isEmpty
          ? t.baseRate
          : active.reduce((a, b) => a < b ? a : b);
    }

    rows.sort(switch (sort) {
      UnitSort.nameAsc => (a, b) => a.name.toLowerCase().compareTo(
        b.name.toLowerCase(),
      ),
      UnitSort.nameDesc => (a, b) => b.name.toLowerCase().compareTo(
        a.name.toLowerCase(),
      ),
      UnitSort.rateAsc => (a, b) => startingRate(a).compareTo(startingRate(b)),
      UnitSort.rateDesc => (a, b) => startingRate(b).compareTo(startingRate(a)),
      UnitSort.unitsDesc => (a, b) => b.units.compareTo(a.units),
    });
    return rows;
  }

  @override
  Widget build(BuildContext context) {
    final filter = ref.watch(roomTypeFilterProvider);
    final types = ref.watch(roomTypesProvider);
    // Plans drive the "from" price and the plan count. A failure here must not
    // blank the catalogue, so it degrades to an empty list.
    final plans =
        ref.watch(allRatePlansProvider).valueOrNull ?? const <RatePlan>[];
    final wide = MediaQuery.sizeOf(context).width >= _tableBreakpoint;

    return PageBody(
      onRefresh: () async {
        ref.invalidate(roomTypesProvider);
        ref.invalidate(allRatePlansProvider);
      },
      children: [
        PageHeader(
          eyebrow: 'Inventory',
          title: 'Room types & rates',
          subtitle:
              'Manage your accommodation types, rooms, inventory and rates.',
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
        _toolbar(context, filter),
        gapMd,
        types.when(
          loading: () => const ListSkeleton(rows: 4, height: 88),
          error: (error, _) => ErrorState(
            error: error,
            onRetry: () => ref.invalidate(roomTypesProvider),
          ),
          data: (all) {
            final rows = _visible(all, plans);
            if (all.isEmpty) return _emptyCatalogue(context);
            if (rows.isEmpty) return _emptyFilter(context);
            return Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                _summaryLine(context, rows),
                gapSm,
                if (wide)
                  _UnitsTable(rows: rows, plans: plans)
                else
                  for (final type in rows)
                    Padding(
                      padding: const EdgeInsets.only(bottom: Sp.md),
                      child: _UnitCard(type: type, plans: plans),
                    ),
              ],
            );
          },
        ),
      ],
    );
  }

  Widget _toolbar(BuildContext context, RoomTypeFilter filter) {
    final accommodation = ref.watch(_accommodationProvider);
    final sort = ref.watch(_sortProvider);

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
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
                    tooltip: 'Clear search',
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
        gapSm,
        Wrap(
          spacing: Sp.sm,
          runSpacing: Sp.sm,
          crossAxisAlignment: WrapCrossAlignment.center,
          children: [
            Segmented<RoomTypeStatus?>(
              options: const [
                null,
                RoomTypeStatus.active,
                RoomTypeStatus.archived,
              ],
              labelOf: (status) => status?.label ?? 'All',
              value: filter.status,
              onChanged: (status) =>
                  ref
                      .read(roomTypeFilterProvider.notifier)
                      .state = status == null
                  ? filter.copyWith(clearStatus: true)
                  : filter.copyWith(status: status),
            ),
            _Dropdown<AccommodationType?>(
              icon: Icons.apartment_outlined,
              value: accommodation,
              hint: 'All types',
              options: [null, ...AccommodationType.values],
              labelOf: (t) => t?.label ?? 'All types',
              onChanged: (t) =>
                  ref.read(_accommodationProvider.notifier).state = t,
            ),
            _Dropdown<UnitSort>(
              icon: Icons.swap_vert,
              value: sort,
              hint: 'Sort',
              options: UnitSort.values,
              labelOf: (s) => s.label,
              onChanged: (s) => ref.read(_sortProvider.notifier).state =
                  s ?? UnitSort.nameAsc,
            ),
          ],
        ),
      ],
    );
  }

  Widget _summaryLine(BuildContext context, List<RoomType> rows) {
    final c = context.colors;
    final units = rows.fold<int>(0, (sum, t) => sum + t.units);
    return Align(
      alignment: Alignment.centerLeft,
      child: Text(
        '${rows.length} ${rows.length == 1 ? 'room type' : 'room types'} · '
        '$units ${units == 1 ? 'unit' : 'units'}',
        style: AppTypography.labelXs(c.mutedForeground),
      ),
    );
  }

  Widget _emptyCatalogue(BuildContext context) => EmptyState(
    title: 'No room types yet',
    hint:
        'Create your first room type to start managing rooms, inventory and '
        'rates.',
    icon: Icons.bed_outlined,
    action: PermissionGate(
      permission: P.roomTypeCreate,
      child: FilledButton.icon(
        onPressed: () => context.go(Routes.roomTypeNew),
        icon: const Icon(Icons.add, size: 16),
        label: const Text('Add room type'),
      ),
    ),
  );

  Widget _emptyFilter(BuildContext context) => const EmptyState(
    title: 'Nothing matches those filters',
    hint:
        'Try a different search, or set the type and status filters back to All.',
    icon: Icons.filter_alt_off_outlined,
  );
}

/// A compact labelled dropdown, styled to sit beside [Segmented] in the
/// toolbar rather than looking like a form field.
class _Dropdown<T> extends StatelessWidget {
  const _Dropdown({
    required this.icon,
    required this.value,
    required this.hint,
    required this.options,
    required this.labelOf,
    required this.onChanged,
  });

  final IconData icon;
  final T value;
  final String hint;
  final List<T> options;
  final String Function(T) labelOf;
  final ValueChanged<T?> onChanged;

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    return Container(
      height: 34,
      padding: const EdgeInsets.symmetric(horizontal: 10),
      decoration: BoxDecoration(
        color: c.card,
        borderRadius: R.rMd,
        border: Border.all(color: c.border),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(icon, size: 15, color: c.mutedForeground),
          const SizedBox(width: 6),
          DropdownButtonHideUnderline(
            child: DropdownButton<T>(
              value: value,
              isDense: true,
              borderRadius: R.rMd,
              icon: Icon(Icons.expand_more, size: 16, color: c.mutedForeground),
              style: AppTypography.body(size: 12.5, color: c.foreground),
              items: [
                for (final option in options)
                  DropdownMenuItem<T>(
                    value: option,
                    child: Text(labelOf(option)),
                  ),
              ],
              onChanged: onChanged,
            ),
          ),
        ],
      ),
    );
  }
}

// ------------------------------------------------------------------- table --

const double _colAccommodation = 132;
const double _colUnits = 108;
const double _colOccupancy = 150;
const double _colRate = 128;
const double _colPlans = 104;
const double _colStatus = 96;
const double _colActions = 44;
const double _rowMinName = 260;

/// The catalogue as a table. Scrolls horizontally rather than squeezing, so a
/// column never becomes unreadable; below the breakpoint the page shows cards
/// instead and this is never built.
class _UnitsTable extends StatelessWidget {
  const _UnitsTable({required this.rows, required this.plans});

  final List<RoomType> rows;
  final List<RatePlan> plans;

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    const width =
        _rowMinName +
        _colAccommodation +
        _colUnits +
        _colOccupancy +
        _colRate +
        _colPlans +
        _colStatus +
        _colActions;

    return Container(
      clipBehavior: Clip.antiAlias,
      decoration: BoxDecoration(
        color: c.card,
        borderRadius: R.rLg,
        border: Border.all(color: c.border),
      ),
      child: SingleChildScrollView(
        scrollDirection: Axis.horizontal,
        child: SizedBox(
          width: width,
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              _header(c),
              for (final type in rows) _UnitsTableRow(type: type, plans: plans),
            ],
          ),
        ),
      ),
    );
  }

  Widget _header(AppColors c) => Container(
    height: 38,
    padding: const EdgeInsets.symmetric(horizontal: Sp.lg),
    decoration: BoxDecoration(
      color: c.surface,
      border: Border(bottom: BorderSide(color: c.border)),
    ),
    child: Row(
      children: [
        _head(c, 'Room type', _rowMinName - Sp.lg),
        _head(c, 'Type', _colAccommodation),
        _head(c, 'Units', _colUnits),
        _head(c, 'Occupancy', _colOccupancy),
        _head(c, 'Starting rate', _colRate),
        _head(c, 'Rate plans', _colPlans),
        _head(c, 'Status', _colStatus),
        SizedBox(width: _colActions - Sp.lg),
      ],
    ),
  );

  Widget _head(AppColors c, String label, double width) => SizedBox(
    width: width,
    child: Text(label, style: AppTypography.labelXs(c.mutedForeground)),
  );
}

class _UnitsTableRow extends ConsumerWidget {
  const _UnitsTableRow({required this.type, required this.plans});

  final RoomType type;
  final List<RatePlan> plans;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final c = context.colors;
    final mine = plans.where((p) => p.roomTypeId == type.id).toList();
    final active = mine.where((p) => p.isActive).toList();
    final from = active.isEmpty
        ? type.baseRate
        : active.map((p) => p.basePricePaise).reduce((a, b) => a < b ? a : b);

    return InkWell(
      onTap: () => context.go(Routes.roomType(type.id)),
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: Sp.lg, vertical: Sp.md),
        decoration: BoxDecoration(
          border: Border(
            top: BorderSide(color: c.border.withValues(alpha: 0.7)),
          ),
        ),
        child: Row(
          children: [
            SizedBox(
              width: _rowMinName - Sp.lg,
              child: Row(
                children: [
                  _Thumbnail(url: type.primaryPhotoUrl),
                  const SizedBox(width: Sp.md),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          type.name,
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: AppTypography.body(
                            size: 13.5,
                            weight: FontWeight.w600,
                            color: c.foreground,
                          ),
                        ),
                        Text(
                          type.subtitleLine,
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: AppTypography.body(
                            size: 11,
                            color: c.mutedForeground,
                          ),
                        ),
                      ],
                    ),
                  ),
                ],
              ),
            ),
            _cell(
              c,
              _colAccommodation,
              type.accommodationType.label,
              sub: type.code,
            ),
            _cell(
              c,
              _colUnits,
              '${type.units} total',
              sub: type.units == 0 ? 'no units yet' : null,
            ),
            _cell(
              c,
              _colOccupancy,
              type.occupancyMix,
              sub: 'base ${type.baseOccupancy}',
            ),
            _cell(c, _colRate, 'From ${rupees(from)}', sub: 'per night'),
            _cell(
              c,
              _colPlans,
              mine.isEmpty ? '—' : '${mine.length}',
              sub: mine.isEmpty
                  ? 'none yet'
                  : (mine.length == 1 ? 'plan' : 'plans'),
            ),
            SizedBox(
              width: _colStatus,
              child: Align(
                alignment: Alignment.centerLeft,
                child: StatusBadge(
                  label: type.status.label,
                  tone: type.isArchived
                      ? StatusTone.neutral
                      : StatusTone.available,
                ),
              ),
            ),
            SizedBox(
              width: _colActions - Sp.lg,
              child: _RowActions(type: type),
            ),
          ],
        ),
      ),
    );
  }

  Widget _cell(AppColors c, double width, String value, {String? sub}) =>
      SizedBox(
        width: width,
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              value,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: AppTypography.body(size: 12.5, color: c.foreground),
            ),
            if (sub != null)
              Text(
                sub,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: AppTypography.body(size: 10.5, color: c.mutedForeground),
              ),
          ],
        ),
      );
}

/// The primary photo, or a neutral placeholder when the type has none — never
/// a broken image box.
class _Thumbnail extends StatelessWidget {
  const _Thumbnail({required this.url, this.size = 40});

  final String? url;
  final double size;

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    final placeholder = Container(
      width: size,
      height: size,
      decoration: BoxDecoration(
        color: c.muted,
        borderRadius: R.rSm,
        border: Border.all(color: c.border),
      ),
      child: Icon(
        Icons.bed_outlined,
        size: size * 0.45,
        color: c.mutedForeground,
      ),
    );
    if (url == null || url!.isEmpty) return placeholder;
    return ClipRRect(
      borderRadius: R.rSm,
      child: Image.network(
        url!,
        width: size,
        height: size,
        fit: BoxFit.cover,
        errorBuilder: (_, _, _) => placeholder,
      ),
    );
  }
}

/// View / Edit / Manage units / Manage rates / Duplicate / Archive.
class _RowActions extends ConsumerWidget {
  const _RowActions({required this.type});

  final RoomType type;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final c = context.colors;
    final canEdit = ref.watch(canProvider(P.roomTypeUpdate));

    return PopupMenuButton<String>(
      tooltip: 'Room type actions',
      icon: Icon(Icons.more_vert, size: 18, color: c.mutedForeground),
      onSelected: (action) => _run(context, ref, action),
      itemBuilder: (_) => [
        const PopupMenuItem(value: 'view', child: Text('View')),
        if (canEdit) const PopupMenuItem(value: 'edit', child: Text('Edit')),
        const PopupMenuItem(value: 'units', child: Text('Manage units')),
        const PopupMenuItem(value: 'rates', child: Text('Manage rates')),
        if (canEdit) ...[
          const PopupMenuItem(value: 'duplicate', child: Text('Duplicate')),
          PopupMenuItem(
            value: 'archive',
            child: Text(type.isArchived ? 'Restore' : 'Archive'),
          ),
        ],
      ],
    );
  }

  Future<void> _run(BuildContext context, WidgetRef ref, String action) async {
    final messenger = ScaffoldMessenger.of(context);
    switch (action) {
      case 'view':
      case 'edit':
        context.go(Routes.roomType(type.id));
      case 'units':
        // The workspace opens on the units section; the rooms board stays the
        // place to work a single room's status.
        context.go('${Routes.roomType(type.id)}?section=units');
      case 'rates':
        context.go('${Routes.roomType(type.id)}?section=rates');
      case 'duplicate':
        context.go('${Routes.roomTypeNew}?duplicateOf=${type.id}');
      case 'archive':
        final next = type.isArchived
            ? RoomTypeStatus.active
            : RoomTypeStatus.archived;
        try {
          await ref.read(roomTypeActionsProvider).update(type.id, {
            'status': next.wire,
          });
          messenger.showSnackBar(
            SnackBar(
              content: Text(
                type.isArchived
                    ? '${type.name} restored'
                    : '${type.name} archived',
              ),
            ),
          );
        } catch (error) {
          messenger.showSnackBar(SnackBar(content: Text('$error')));
        }
    }
  }
}

// -------------------------------------------------------------------- card --

/// The narrow-screen form of one row.
class _UnitCard extends ConsumerWidget {
  const _UnitCard({required this.type, required this.plans});

  final RoomType type;
  final List<RatePlan> plans;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final c = context.colors;
    final mine = plans.where((p) => p.roomTypeId == type.id).toList();
    final active = mine.where((p) => p.isActive).toList();
    final from = active.isEmpty
        ? type.baseRate
        : active.map((p) => p.basePricePaise).reduce((a, b) => a < b ? a : b);

    return SoftCard(
      onTap: () => context.go(Routes.roomType(type.id)),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              _Thumbnail(url: type.primaryPhotoUrl, size: 52),
              const SizedBox(width: Sp.md),
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
                    Text(
                      type.subtitleLine,
                      style: AppTypography.body(
                        size: 11.5,
                        color: c.mutedForeground,
                      ),
                    ),
                  ],
                ),
              ),
              StatusBadge(
                label: type.status.label,
                tone: type.isArchived
                    ? StatusTone.neutral
                    : StatusTone.available,
              ),
              _RowActions(type: type),
            ],
          ),
          const SizedBox(height: Sp.md),
          Wrap(
            spacing: Sp.sm,
            runSpacing: Sp.sm,
            children: [
              _pill(c, Icons.apartment_outlined, type.accommodationType.label),
              _pill(c, Icons.meeting_room_outlined, '${type.units} units'),
              _pill(c, Icons.people_outline, type.occupancyMix),
              _pill(c, Icons.sell_outlined, 'From ${rupees(from)}'),
              _pill(
                c,
                Icons.local_offer_outlined,
                mine.isEmpty
                    ? 'No rate plans'
                    : '${mine.length} ${mine.length == 1 ? 'rate plan' : 'rate plans'}',
              ),
            ],
          ),
        ],
      ),
    );
  }

  Widget _pill(AppColors c, IconData icon, String label) => Container(
    padding: const EdgeInsets.symmetric(horizontal: 9, vertical: 4),
    decoration: BoxDecoration(
      color: c.muted,
      borderRadius: R.rPill,
      border: Border.all(color: c.border),
    ),
    child: Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        Icon(icon, size: 13, color: c.mutedForeground),
        const SizedBox(width: 5),
        Text(label, style: AppTypography.body(size: 11.5, color: c.foreground)),
      ],
    ),
  );
}
