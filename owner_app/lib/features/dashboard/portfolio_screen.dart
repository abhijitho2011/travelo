import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/intl.dart';

import '../../core/data/owner_repository.dart';
import '../../core/models/owner_models.dart';
import '../../core/providers.dart';
import '../../core/theme/app_spacing.dart';
import '../../core/utils/formatting.dart';
import '../../core/widgets/cards.dart';
import '../../core/widgets/primitives.dart';
import '../../core/widgets/states.dart';
import '../properties/property_card.dart';

class PortfolioScreen extends ConsumerWidget {
  const PortfolioScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final auth = ref.watch(authControllerProvider);
    final owner = auth.owner;
    final props = ref.watch(propertiesProvider);

    return PageBody(
      onRefresh: () async {
        ref.invalidate(propertiesProvider);
        ref.invalidate(portfolioProvider);
        ref.invalidate(portfolioPerformanceProvider);
        await ref.read(authControllerProvider.notifier).refreshMe();
      },
      children: [
        if (auth.subscription != null) ...[
          _SubscriptionNotice(sub: auth.subscription!),
        ],
        PageHeader(
          eyebrow: owner?.company.isNotEmpty == true
              ? owner!.company
              : 'Your portfolio',
          title: 'Welcome back, ${firstNameOf(owner?.name)}',
          subtitle: 'Every hotel you own, and how ready each one is.',
        ),
        gapSection,
        props.when(
          loading: () => const KpiSkeleton(),
          error: (e, _) => ErrorState(
            error: e,
            message: 'Could not load your portfolio.',
            onRetry: () => ref.invalidate(propertiesProvider),
          ),
          data: (list) => list.isEmpty
              ? const _FirstTimeOwner()
              : _PortfolioBody(properties: list),
        ),
      ],
    );
  }
}

class _PortfolioBody extends ConsumerWidget {
  const _PortfolioBody({required this.properties});
  final List<Property> properties;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final summary = ref.watch(portfolioProvider);
    final rooms = properties.fold<int>(0, (a, p) => a + p.roomCount);

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        summary.when(
          loading: () => _StatGrid(hotels: properties.length, rooms: rooms),
          error: (_, __) => _StatGrid(hotels: properties.length, rooms: rooms),
          data: (s) => _StatGrid(
            hotels: s.hotels == 0 ? properties.length : s.hotels,
            rooms: s.rooms == 0 ? rooms : s.rooms,
            revenue: s.revenue,
            occupancy: s.occupancy,
          ),
        ),
        if (properties.length > 1) ...[gapSection, const _PerformanceSection()],
        gapSection,
        SectionHeader(
          title: 'Your hotels',
          icon: Icons.apartment_outlined,
          trailing: TextButton.icon(
            onPressed: () => context.push('/properties/new'),
            icon: const Icon(Icons.add, size: 16),
            label: const Text('Add hotel'),
          ),
        ),
        for (final p in properties)
          Padding(
            padding: const EdgeInsets.only(bottom: Sp.md),
            child: PropertyCard(property: p),
          ),
      ],
    );
  }
}

/// Hotels side by side: who is earning the room-night, who is not, and
/// where the bookings came from. Only shown when there is more than one hotel
/// to compare.
class _PerformanceSection extends ConsumerWidget {
  const _PerformanceSection();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final perf = ref.watch(portfolioPerformanceProvider);
    final money = NumberFormat.compactCurrency(
      locale: 'en_IN',
      symbol: '₹',
      decimalDigits: 0,
    );
    return perf.when(
      loading: () => const SizedBox.shrink(),
      error: (_, __) => const SizedBox.shrink(),
      data: (p) {
        if (p.properties.isEmpty) return const SizedBox.shrink();
        final sourceTotal = p.sources.fold<int>(0, (a, s) => a + s.roomsSold);
        return Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            SectionHeader(
              title: 'Across the group',
              icon: Icons.insights_outlined,
              trailing: Text(
                'Last ${p.months} months',
                style: Theme.of(context).textTheme.labelSmall,
              ),
            ),
            SoftCard(
              padding: EdgeInsets.zero,
              child: SingleChildScrollView(
                scrollDirection: Axis.horizontal,
                child: DataTable(
                  columnSpacing: 20,
                  columns: const [
                    DataColumn(label: Text('Hotel')),
                    DataColumn(label: Text('Revenue'), numeric: true),
                    DataColumn(label: Text('Occupancy'), numeric: true),
                    DataColumn(label: Text('ADR'), numeric: true),
                    DataColumn(label: Text('RevPAR'), numeric: true),
                  ],
                  rows: [
                    for (final h in p.properties)
                      DataRow(
                        cells: [
                          DataCell(
                            Row(
                              children: [
                                if (h.name == p.topName)
                                  const Padding(
                                    padding: EdgeInsets.only(right: 4),
                                    child: Icon(Icons.trending_up, size: 14),
                                  ),
                                if (h.name == p.lowName)
                                  const Padding(
                                    padding: EdgeInsets.only(right: 4),
                                    child: Icon(Icons.trending_down, size: 14),
                                  ),
                                Text(h.name),
                              ],
                            ),
                          ),
                          DataCell(Text(money.format(h.revenuePaise / 100))),
                          DataCell(Text('${h.occupancyPct}%')),
                          DataCell(Text(money.format(h.adrPaise / 100))),
                          DataCell(Text(money.format(h.revparPaise / 100))),
                        ],
                      ),
                  ],
                ),
              ),
            ),
            if (p.sources.isNotEmpty && sourceTotal > 0) ...[
              const SizedBox(height: Sp.md),
              SoftCard(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    Text(
                      'Where bookings came from',
                      style: Theme.of(context).textTheme.titleSmall,
                    ),
                    const SizedBox(height: Sp.sm),
                    for (final s in p.sources) ...[
                      Row(
                        children: [
                          SizedBox(
                            width: 120,
                            child: Text(
                              _sourceLabel(s.source),
                              style: Theme.of(context).textTheme.bodySmall,
                            ),
                          ),
                          Expanded(
                            child: ClipRRect(
                              borderRadius: BorderRadius.circular(4),
                              child: LinearProgressIndicator(
                                value: s.roomsSold / sourceTotal,
                                minHeight: 8,
                              ),
                            ),
                          ),
                          const SizedBox(width: Sp.sm),
                          Text(
                            '${s.roomsSold} · ${money.format(s.revenuePaise / 100)}',
                            style: Theme.of(context).textTheme.bodySmall,
                          ),
                        ],
                      ),
                      const SizedBox(height: 6),
                    ],
                  ],
                ),
              ),
            ],
          ],
        );
      },
    );
  }

  static String _sourceLabel(String s) => switch (s) {
    'WALK_IN' => 'Walk-in',
    'PHONE' => 'Phone',
    'OTA' => 'OTA',
    'BOOKING_ENGINE' => 'Booking page',
    'CORPORATE' => 'Corporate',
    _ => s.replaceAll('_', ' ').toLowerCase(),
  };
}

class _StatGrid extends StatelessWidget {
  const _StatGrid({
    required this.hotels,
    required this.rooms,
    this.revenue,
    this.occupancy,
  });

  final int hotels;
  final int rooms;
  final double? revenue;
  final double? occupancy;

  @override
  Widget build(BuildContext context) {
    final money = NumberFormat.compactCurrency(
      locale: 'en_IN',
      symbol: '₹',
      decimalDigits: 1,
    );
    return KpiGrid(
      children: [
        KpiCard(
          label: 'Hotels',
          value: '$hotels',
          hint: hotels == 1
              ? 'property in your plan'
              : 'properties in your plan',
        ),
        KpiCard(label: 'Rooms', value: '$rooms', hint: 'across your portfolio'),
        if (revenue != null)
          KpiCard(
            label: 'Revenue',
            value: money.format(revenue),
            hint: 'this period',
          ),
        if (occupancy != null)
          KpiCard(
            label: 'Occupancy',
            value: '${occupancy!.toStringAsFixed(0)}%',
            hint: 'rooms sold today',
          ),
      ],
    );
  }
}

class _SubscriptionNotice extends StatelessWidget {
  const _SubscriptionNotice({required this.sub});
  final SubscriptionInfo sub;

  @override
  Widget build(BuildContext context) {
    if (sub.isExpired) {
      return Padding(
        padding: const EdgeInsets.only(bottom: Sp.lg),
        child: NoticeBanner(
          tone: NoticeTone.danger,
          icon: Icons.lock_clock_outlined,
          text:
              'Your Tavelo subscription has expired. Your hotel data is safe, but '
              'some features are unavailable.',
          action: FilledButton(
            style: FilledButton.styleFrom(
              minimumSize: const Size(0, 40),
              padding: const EdgeInsets.symmetric(horizontal: 14),
            ),
            onPressed: () => context.go('/subscription'),
            child: const Text('View plan'),
          ),
        ),
      );
    }
    if (sub.isWarning && (sub.daysToExpiry ?? 99) <= 14) {
      return Padding(
        padding: const EdgeInsets.only(bottom: Sp.lg),
        child: NoticeBanner(
          tone: NoticeTone.warning,
          icon: Icons.schedule,
          text: 'Your subscription expires in ${sub.daysToExpiry} days.',
          action: TextButton(
            onPressed: () => context.go('/subscription'),
            child: const Text('View'),
          ),
        ),
      );
    }
    return const SizedBox.shrink();
  }
}

class _FirstTimeOwner extends StatelessWidget {
  const _FirstTimeOwner();

  @override
  Widget build(BuildContext context) {
    return EmptyState(
      icon: Icons.add_business_outlined,
      title: 'Let’s set up your first hotel',
      hint:
          'Add your property to start managing rooms, reservations and hotel '
          'operations.',
      action: FilledButton.icon(
        onPressed: () => context.push('/properties/new'),
        icon: const Icon(Icons.add, size: 16),
        label: const Text('Add your first hotel'),
      ),
    );
  }
}
