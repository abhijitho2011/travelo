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
