import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/permissions/permission_gate.dart';
import '../../../core/permissions/permission_keys.dart';
import '../../../core/routing/routes.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/theme/app_spacing.dart';
import '../../../core/widgets/primitives.dart';
import '../../../core/widgets/states.dart';
import '../../../core/widgets/status_badge.dart';
import '../application/reception_controllers.dart';
import '../data/reception_models.dart';
import 'reservation_list.dart';

/// Every booking at this property, searchable and filterable.
///
/// The desk board answers "what is happening today"; this answers "where is
/// the booking for Mrs Nair on the 14th", which is the other half of the job
/// and the reason the search box takes a phone number and a reservation
/// number as readily as a name.
class ReservationsScreen extends ConsumerStatefulWidget {
  const ReservationsScreen({super.key});

  @override
  ConsumerState<ReservationsScreen> createState() => _ReservationsScreenState();
}

class _ReservationsScreenState extends ConsumerState<ReservationsScreen> {
  final _search = TextEditingController();

  @override
  void initState() {
    super.initState();
    _search.text = ref.read(reservationFilterProvider).query ?? '';
  }

  @override
  void dispose() {
    _search.dispose();
    super.dispose();
  }

  void _setFilter(ReservationFilter next) =>
      ref.read(reservationFilterProvider.notifier).state = next;

  Future<void> _pickRange(ReservationFilter filter) async {
    final now = DateTime.now();
    final picked = await showDateRangePicker(
      context: context,
      firstDate: DateTime(now.year - 1),
      lastDate: DateTime(now.year + 2),
      initialDateRange: filter.from != null && filter.to != null
          ? DateTimeRange(start: filter.from!, end: filter.to!)
          : null,
    );
    if (picked == null) return;
    _setFilter(filter.copyWith(from: picked.start, to: picked.end));
  }

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    final filter = ref.watch(reservationFilterProvider);
    final reservations = ref.watch(reservationsProvider);

    return PageBody(
      onRefresh: () async => ref.invalidate(reservationsProvider),
      children: [
        PageHeader(
          eyebrow: 'Front office',
          title: 'Bookings',
          subtitle: 'Every stay on the book, past and future.',
          actions: [
            // The same bookings, seen as a room-by-night chart. It sits beside
            // New booking because that is the pair a clerk reaches for: look at
            // what is free, then sell it.
            OutlinedButton.icon(
              onPressed: () => context.go(Routes.calendar),
              icon: const Icon(Icons.calendar_month_outlined, size: 16),
              label: const Text('Calendar'),
            ),
            PermissionGate(
              permission: P.reservationCreate,
              child: FilledButton.icon(
                onPressed: () => context.go(Routes.reservationNew),
                icon: const Icon(Icons.add, size: 16),
                label: const Text('New booking'),
              ),
            ),
          ],
        ),
        gapSection,

        TextField(
          controller: _search,
          textInputAction: TextInputAction.search,
          decoration: InputDecoration(
            hintText: 'Guest name, phone or RSV number',
            prefixIcon: const Icon(Icons.search, size: 20),
            suffixIcon: _search.text.isEmpty
                ? null
                : IconButton(
                    icon: const Icon(Icons.close, size: 18),
                    onPressed: () {
                      _search.clear();
                      _setFilter(filter.copyWith(query: ''));
                    },
                  ),
          ),
          onChanged: (_) => setState(() {}),
          onSubmitted: (value) =>
              _setFilter(filter.copyWith(query: value.trim())),
        ),
        gapMd,

        _StatusFilterChips(filter: filter, onChanged: _setFilter),
        const SizedBox(height: Sp.sm),

        Align(
          alignment: Alignment.centerLeft,
          child: Wrap(
            spacing: Sp.sm,
            children: [
              OutlinedButton.icon(
                onPressed: () => _pickRange(filter),
                icon: const Icon(Icons.date_range_outlined, size: 15),
                label: Text(filter.rangeLabel),
              ),
              if (!filter.isEmpty)
                TextButton.icon(
                  onPressed: () {
                    _search.clear();
                    _setFilter(const ReservationFilter());
                  },
                  icon: const Icon(Icons.filter_alt_off_outlined, size: 15),
                  label: const Text('Clear filters'),
                ),
            ],
          ),
        ),
        gapSm,

        reservations.when(
          loading: () => const ListSkeleton(rows: 4, height: 120),
          error: (e, _) => ErrorState(
            error: e,
            onRetry: () => ref.invalidate(reservationsProvider),
          ),
          data: (items) => Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              if (items.isNotEmpty)
                Padding(
                  padding: const EdgeInsets.only(bottom: Sp.sm),
                  child: LabelXs(
                    '${items.length} '
                    '${items.length == 1 ? 'booking' : 'bookings'}'
                    '${filter.isEmpty ? '' : ' matching'}',
                    color: c.mutedForeground,
                  ),
                ),
              ReservationList(
                reservations: items,
                emptyTitle: filter.isEmpty
                    ? 'No bookings yet'
                    : 'Nothing matches those filters',
                emptyHint: filter.isEmpty
                    ? 'Take the first one with New booking — a walk-in at the '
                          'desk counts.'
                    : 'Try a wider date range, or clear the status filter.',
              ),
            ],
          ),
        ),
      ],
    );
  }
}

/// Status filters. `All` clears rather than being a status of its own, so the
/// list never has to represent "every status at once" as a value.
class _StatusFilterChips extends StatelessWidget {
  const _StatusFilterChips({required this.filter, required this.onChanged});

  final ReservationFilter filter;
  final ValueChanged<ReservationFilter> onChanged;

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    return SingleChildScrollView(
      scrollDirection: Axis.horizontal,
      child: Row(
        children: [
          FilterChip(
            label: const Text('All'),
            selected: filter.status == null,
            onSelected: (_) => onChanged(filter.copyWith(clearStatus: true)),
          ),
          for (final status in ReservationStatus.values)
            Padding(
              padding: const EdgeInsets.only(left: 6),
              child: FilterChip(
                avatar: Icon(
                  status.tone.icon,
                  size: 15,
                  color: status.tone.color(c),
                ),
                label: Text(status.label),
                selected: filter.status == status,
                onSelected: (on) => onChanged(
                  on
                      ? filter.copyWith(status: status)
                      : filter.copyWith(clearStatus: true),
                ),
              ),
            ),
        ],
      ),
    );
  }
}
