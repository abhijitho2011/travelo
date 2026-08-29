import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/intl.dart';

import '../../core/data/owner_repository.dart';
import '../../core/models/owner_models.dart';
import '../../core/providers.dart';
import '../../theme/app_theme.dart';
import '../../widgets/ui.dart';

class PortfolioScreen extends ConsumerWidget {
  const PortfolioScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final auth = ref.watch(authControllerProvider);
    final owner = auth.owner;
    final props = ref.watch(propertiesProvider);

    return Scaffold(
      appBar: AppBar(
        titleSpacing: 20,
        title: Row(
          children: [
            Container(
              width: 30,
              height: 30,
              decoration: BoxDecoration(
                color: AppColors.primary,
                borderRadius: BorderRadius.circular(8),
              ),
              child: const Icon(Icons.apartment_rounded, color: Colors.white, size: 18),
            ),
            const SizedBox(width: 10),
            const Text('Tavelo', style: TextStyle(fontWeight: FontWeight.w700)),
          ],
        ),
        actions: [
          PopupMenuButton<String>(
            offset: const Offset(0, 48),
            onSelected: (v) {
              switch (v) {
                case 'profile':
                  context.push('/profile');
                case 'security':
                  context.push('/security');
                case 'subscription':
                  context.push('/subscription');
                case 'support':
                  context.push('/support');
                case 'signout':
                  ref.read(authControllerProvider.notifier).signOut();
              }
            },
            itemBuilder: (_) => [
              PopupMenuItem(
                enabled: false,
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(owner?.name ?? 'Owner',
                        style: const TextStyle(fontWeight: FontWeight.w700, color: AppColors.ink)),
                    const Text('Owner', style: TextStyle(color: AppColors.inkFaint, fontSize: 12)),
                  ],
                ),
              ),
              const PopupMenuDivider(),
              const PopupMenuItem(value: 'profile', child: Text('Profile')),
              const PopupMenuItem(value: 'security', child: Text('Security')),
              const PopupMenuItem(value: 'subscription', child: Text('Subscription')),
              const PopupMenuItem(value: 'support', child: Text('Support')),
              const PopupMenuDivider(),
              const PopupMenuItem(value: 'signout', child: Text('Sign out')),
            ],
            child: Padding(
              padding: const EdgeInsets.only(right: 16),
              child: CircleAvatar(
                radius: 17,
                backgroundColor: AppColors.primarySoft,
                child: Text(
                  _initials(owner?.name),
                  style: const TextStyle(
                      color: AppColors.primaryDark, fontWeight: FontWeight.w700, fontSize: 13),
                ),
              ),
            ),
          ),
        ],
      ),
      body: RefreshIndicator(
        onRefresh: () async {
          ref.invalidate(propertiesProvider);
          ref.invalidate(portfolioProvider);
          await ref.read(authControllerProvider.notifier).refreshMe();
        },
        child: ListView(
          padding: const EdgeInsets.fromLTRB(20, 12, 20, 40),
          children: [
            if (auth.subscription != null) _SubscriptionNotice(sub: auth.subscription!),
            Text(
              'Welcome back, ${_firstName(owner?.name)}',
              style: const TextStyle(fontSize: 24, fontWeight: FontWeight.w800, color: AppColors.ink),
            ),
            const SizedBox(height: 4),
            Text(
              owner?.company ?? 'Your portfolio',
              style: const TextStyle(color: AppColors.inkMuted),
            ),
            const SizedBox(height: 20),
            props.when(
              loading: () => const Padding(
                padding: EdgeInsets.only(top: 60),
                child: LoadingView(),
              ),
              error: (e, _) => Padding(
                padding: const EdgeInsets.only(top: 40),
                child: ErrorView(
                  message: 'Could not load your portfolio.',
                  onRetry: () => ref.invalidate(propertiesProvider),
                ),
              ),
              data: (list) => list.isEmpty
                  ? const _FirstTimeOwner()
                  : _PortfolioBody(properties: list),
            ),
          ],
        ),
      ),
    );
  }

  static String _initials(String? name) {
    if (name == null || name.trim().isEmpty) return 'O';
    final parts = name.trim().split(RegExp(r'\s+'));
    return parts.length == 1
        ? parts.first.substring(0, 1).toUpperCase()
        : (parts.first[0] + parts.last[0]).toUpperCase();
  }

  static String _firstName(String? name) =>
      (name == null || name.trim().isEmpty) ? 'there' : name.trim().split(' ').first;
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
          loading: () => _StatRow(hotels: properties.length, rooms: rooms),
          error: (_, __) => _StatRow(hotels: properties.length, rooms: rooms),
          data: (s) => _StatRow(
            hotels: s.hotels == 0 ? properties.length : s.hotels,
            rooms: s.rooms == 0 ? rooms : s.rooms,
            revenue: s.revenue,
            occupancy: s.occupancy,
          ),
        ),
        const SizedBox(height: 24),
        SectionTitle(
          'Your hotels',
          trailing: TextButton.icon(
            onPressed: () => context.push('/properties/new'),
            icon: const Icon(Icons.add, size: 18),
            label: const Text('Add hotel'),
          ),
        ),
        const SizedBox(height: 12),
        ...properties.map((p) => Padding(
              padding: const EdgeInsets.only(bottom: 12),
              child: _PropertyCard(property: p),
            )),
      ],
    );
  }
}

class _StatRow extends StatelessWidget {
  const _StatRow({
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
    final money = NumberFormat.compactCurrency(locale: 'en_IN', symbol: '₹', decimalDigits: 1);
    return Wrap(
      spacing: 12,
      runSpacing: 12,
      children: [
        _StatTile(label: 'Hotels', value: '$hotels', icon: Icons.apartment_rounded),
        _StatTile(label: 'Rooms', value: '$rooms', icon: Icons.bed_outlined),
        if (revenue != null)
          _StatTile(label: 'Revenue', value: money.format(revenue), icon: Icons.payments_outlined),
        if (occupancy != null)
          _StatTile(
              label: 'Occupancy',
              value: '${occupancy!.toStringAsFixed(0)}%',
              icon: Icons.pie_chart_outline),
      ],
    );
  }
}

class _StatTile extends StatelessWidget {
  const _StatTile({required this.label, required this.value, required this.icon});
  final String label;
  final String value;
  final IconData icon;

  @override
  Widget build(BuildContext context) {
    final w = (MediaQuery.sizeOf(context).width - 40 - 12) / 2;
    return Container(
      width: w.clamp(150, 260),
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: AppColors.surface,
        borderRadius: BorderRadius.circular(AppRadius.lg),
        border: Border.all(color: AppColors.line),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(icon, color: AppColors.primary, size: 20),
          const SizedBox(height: 12),
          Text(value,
              style: const TextStyle(fontSize: 22, fontWeight: FontWeight.w800, color: AppColors.ink)),
          Text(label, style: const TextStyle(color: AppColors.inkMuted, fontSize: 13)),
        ],
      ),
    );
  }
}

class _PropertyCard extends StatelessWidget {
  const _PropertyCard({required this.property});
  final Property property;

  @override
  Widget build(BuildContext context) {
    return InkWell(
      borderRadius: BorderRadius.circular(AppRadius.lg),
      onTap: () => context.push('/properties/${property.id}', extra: property),
      child: Container(
        padding: const EdgeInsets.all(16),
        decoration: BoxDecoration(
          color: AppColors.surface,
          borderRadius: BorderRadius.circular(AppRadius.lg),
          border: Border.all(color: AppColors.line),
        ),
        child: Row(
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
                  Text(property.name,
                      style: const TextStyle(
                          fontWeight: FontWeight.w700, fontSize: 15.5, color: AppColors.ink)),
                  const SizedBox(height: 2),
                  Text(
                    '${property.city}${property.state.isNotEmpty ? ', ${property.state}' : ''} · ${property.roomCount} rooms',
                    style: const TextStyle(color: AppColors.inkMuted, fontSize: 13),
                  ),
                  const SizedBox(height: 8),
                  _CompletenessBar(pct: property.completeness),
                ],
              ),
            ),
            const SizedBox(width: 8),
            const Icon(Icons.chevron_right, color: AppColors.inkFaint),
          ],
        ),
      ),
    );
  }
}

class _CompletenessBar extends StatelessWidget {
  const _CompletenessBar({required this.pct});
  final int pct;
  @override
  Widget build(BuildContext context) {
    final done = pct >= 100;
    return Row(
      children: [
        Expanded(
          child: ClipRRect(
            borderRadius: BorderRadius.circular(6),
            child: LinearProgressIndicator(
              value: pct / 100,
              minHeight: 6,
              backgroundColor: AppColors.field,
              color: done ? AppColors.success : AppColors.warning,
            ),
          ),
        ),
        const SizedBox(width: 8),
        Text(done ? 'Ready' : '$pct% ready',
            style: TextStyle(
                fontSize: 12,
                color: done ? AppColors.success : AppColors.warning,
                fontWeight: FontWeight.w600)),
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
        padding: const EdgeInsets.only(bottom: 16),
        child: Banner2(
          tone: BannerTone.danger,
          icon: Icons.lock_clock_outlined,
          text:
              'Your Tavelo subscription has expired. Your hotel data is safe, but some features are unavailable.',
          action: FilledButton(
            style: FilledButton.styleFrom(
              minimumSize: const Size(0, 40),
              padding: const EdgeInsets.symmetric(horizontal: 14),
            ),
            onPressed: () => context.push('/subscription'),
            child: const Text('View plan'),
          ),
        ),
      );
    }
    if (sub.isWarning && (sub.daysToExpiry ?? 99) <= 14) {
      return Padding(
        padding: const EdgeInsets.only(bottom: 16),
        child: Banner2(
          tone: BannerTone.warning,
          icon: Icons.schedule,
          text: 'Your subscription expires in ${sub.daysToExpiry} days.',
          action: TextButton(
            onPressed: () => context.push('/subscription'),
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
    return Container(
      margin: const EdgeInsets.only(top: 24),
      padding: const EdgeInsets.all(28),
      decoration: BoxDecoration(
        color: AppColors.surface,
        borderRadius: BorderRadius.circular(AppRadius.xl),
        border: Border.all(color: AppColors.line),
      ),
      child: Column(
        children: [
          Container(
            width: 64,
            height: 64,
            decoration: BoxDecoration(
              color: AppColors.primarySoft,
              borderRadius: BorderRadius.circular(AppRadius.lg),
            ),
            child: const Icon(Icons.add_business_outlined, color: AppColors.primaryDark, size: 30),
          ),
          const SizedBox(height: 18),
          const Text('Let’s set up your first hotel',
              style: TextStyle(fontSize: 19, fontWeight: FontWeight.w800, color: AppColors.ink)),
          const SizedBox(height: 8),
          const Text(
            'Add your property to start managing rooms, reservations and hotel operations.',
            textAlign: TextAlign.center,
            style: TextStyle(color: AppColors.inkMuted, height: 1.4),
          ),
          const SizedBox(height: 20),
          FilledButton(
            onPressed: () => context.push('/properties/new'),
            child: const Text('Add your first hotel'),
          ),
        ],
      ),
    );
  }
}
