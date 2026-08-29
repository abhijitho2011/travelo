import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart';

import '../../core/api/api_exception.dart';
import '../../core/config/app_config.dart';
import '../../core/data/owner_repository.dart';
import '../../core/models/owner_models.dart';
import '../../theme/app_theme.dart';
import '../../widgets/ui.dart';

/// Prices are stored in paise; the owner sees rupees.
String _money(int paise, String currency) {
  final symbol = currency.toUpperCase() == 'INR' ? '₹' : '$currency ';
  return NumberFormat.currency(locale: 'en_IN', symbol: symbol, decimalDigits: 0)
      .format(paise / 100);
}

/// Read-only view of the owner's plan, usage and invoices. Owners cannot change
/// their own plan — that is a Tavelo action — so there is no upgrade button.
class SubscriptionScreen extends ConsumerWidget {
  const SubscriptionScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final sub = ref.watch(subscriptionProvider);
    return Scaffold(
      appBar: AppBar(title: const Text('Subscription')),
      body: sub.when(
        loading: () => const LoadingView(),
        error: (e, __) {
          if (e is ApiException && e.code == 'SUBSCRIPTION_NOT_FOUND') {
            return const _NoSubscription();
          }
          return ErrorView(
            message: 'Could not load your subscription.',
            onRetry: () => ref.invalidate(subscriptionProvider),
          );
        },
        data: (s) => RefreshIndicator(
          onRefresh: () async {
            ref.invalidate(subscriptionProvider);
            ref.invalidate(invoicesProvider);
          },
          child: ListView(
            padding: const EdgeInsets.fromLTRB(20, 16, 20, 40),
            children: [
              if (s.isBlocked) ...[
                const Banner2(
                  tone: BannerTone.danger,
                  icon: Icons.lock_clock_outlined,
                  text:
                      'Your Tavelo subscription has expired. Your hotel data is safe, '
                      'but some features are unavailable.',
                ),
                const SizedBox(height: 16),
              ] else if (s.isWarning) ...[
                Banner2(
                  tone: BannerTone.warning,
                  icon: Icons.schedule,
                  text: 'Your subscription expires in ${s.daysRemaining} '
                      '${s.daysRemaining == 1 ? 'day' : 'days'}.',
                ),
                const SizedBox(height: 16),
              ],
              _PlanCard(sub: s),
              const SizedBox(height: 24),
              const SectionTitle('Hotels in your plan'),
              const SizedBox(height: 12),
              _UsageMeter(sub: s),
              if (s.features.isNotEmpty) ...[
                const SizedBox(height: 24),
                const SectionTitle('What is included'),
                const SizedBox(height: 12),
                _FeatureList(features: s.features),
              ],
              const SizedBox(height: 24),
              const SectionTitle('Invoices'),
              const SizedBox(height: 12),
              const _Invoices(),
              const SizedBox(height: 24),
              const _ContactNote(),
            ],
          ),
        ),
      ),
    );
  }
}

class _PlanCard extends StatelessWidget {
  const _PlanCard({required this.sub});
  final SubscriptionDetail sub;

  (String, Color) get _status => switch (sub.state) {
        SubscriptionState.active => ('Active', AppColors.success),
        SubscriptionState.trial => ('Trial', AppColors.info),
        SubscriptionState.expiring => ('Expiring', AppColors.warning),
        SubscriptionState.gracePeriod => ('Grace period', AppColors.warning),
        SubscriptionState.expired => ('Expired', AppColors.danger),
        SubscriptionState.suspended => ('Suspended', AppColors.danger),
        SubscriptionState.cancelled => ('Cancelled', AppColors.inkMuted),
        SubscriptionState.unknown => ('Unknown', AppColors.inkMuted),
      };

  @override
  Widget build(BuildContext context) {
    final (label, color) = _status;
    final start = sub.currentPeriodStart;
    final end = sub.currentPeriodEnd;
    final fmt = DateFormat.yMMMd();
    final months = sub.durationMonths;

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
              Expanded(
                child: Text(
                  sub.planName.isEmpty ? 'Tavelo' : sub.planName,
                  style: const TextStyle(
                      fontSize: 21, fontWeight: FontWeight.w800, color: AppColors.ink),
                ),
              ),
              StatusChip(label: label, color: color),
            ],
          ),
          if (sub.description.isNotEmpty) ...[
            const SizedBox(height: 6),
            Text(sub.description,
                style: const TextStyle(color: AppColors.inkMuted, height: 1.4)),
          ],
          const SizedBox(height: 18),
          Row(
            crossAxisAlignment: CrossAxisAlignment.end,
            children: [
              Text(
                _money(sub.periodPrice, sub.currency),
                style: const TextStyle(
                    fontSize: 28, fontWeight: FontWeight.w800, color: AppColors.ink),
              ),
              const SizedBox(width: 6),
              Padding(
                padding: const EdgeInsets.only(bottom: 4),
                child: Text(
                  months <= 1 ? '/ month' : '/ $months months',
                  style: const TextStyle(color: AppColors.inkMuted),
                ),
              ),
            ],
          ),
          if (months > 1)
            Text(
              '${_money(sub.monthlyPrice, sub.currency)} per month',
              style: const TextStyle(color: AppColors.inkFaint, fontSize: 12.5),
            ),
          const SizedBox(height: 18),
          const Divider(height: 1),
          const SizedBox(height: 16),
          _Row(
            label: 'Current period',
            value: start == null || end == null
                ? '—'
                : '${fmt.format(start)} — ${fmt.format(end)}',
          ),
          const SizedBox(height: 10),
          _Row(
            label: 'Days remaining',
            value: sub.daysRemaining == 0
                ? 'Expired'
                : '${sub.daysRemaining} ${sub.daysRemaining == 1 ? 'day' : 'days'}',
            valueColor: sub.daysRemaining <= 14 ? AppColors.warning : null,
          ),
          const SizedBox(height: 10),
          _Row(label: 'Billing cycle', value: _cycleLabel(sub.billingCycle)),
        ],
      ),
    );
  }

  static String _cycleLabel(String raw) => switch (raw.toUpperCase()) {
        'ANNUAL' => 'Annual',
        'MONTHLY' => 'Monthly',
        _ => raw.isEmpty ? '—' : raw,
      };
}

class _Row extends StatelessWidget {
  const _Row({required this.label, required this.value, this.valueColor});
  final String label;
  final String value;
  final Color? valueColor;

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        Text(label, style: const TextStyle(color: AppColors.inkMuted, fontSize: 13.5)),
        const Spacer(),
        Text(
          value,
          style: TextStyle(
            color: valueColor ?? AppColors.ink,
            fontWeight: FontWeight.w600,
            fontSize: 13.5,
          ),
        ),
      ],
    );
  }
}

class _UsageMeter extends StatelessWidget {
  const _UsageMeter({required this.sub});
  final SubscriptionDetail sub;

  @override
  Widget build(BuildContext context) {
    final limit = sub.propertyLimit;
    final used = sub.propertiesUsed;
    final full = limit > 0 && used >= limit;
    final color = full ? AppColors.warning : AppColors.primary;

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
                '$used of ${limit <= 0 ? '—' : limit}',
                style: const TextStyle(
                    fontSize: 20, fontWeight: FontWeight.w800, color: AppColors.ink),
              ),
              const SizedBox(width: 8),
              const Padding(
                padding: EdgeInsets.only(top: 4),
                child: Text('hotels used', style: TextStyle(color: AppColors.inkMuted)),
              ),
            ],
          ),
          const SizedBox(height: 12),
          ClipRRect(
            borderRadius: BorderRadius.circular(6),
            child: LinearProgressIndicator(
              value: sub.usageFraction,
              minHeight: 8,
              backgroundColor: AppColors.field,
              color: color,
            ),
          ),
          const SizedBox(height: 10),
          Text(
            full
                ? 'You have used your full hotel allowance. Contact Tavelo to add more.'
                : '${limit - used} more ${limit - used == 1 ? 'hotel' : 'hotels'} available on this plan.',
            style: TextStyle(
              color: full ? AppColors.warning : AppColors.inkMuted,
              fontSize: 12.5,
            ),
          ),
        ],
      ),
    );
  }
}

class _FeatureList extends StatelessWidget {
  const _FeatureList({required this.features});
  final List<String> features;

  /// Feature keys are dotted identifiers (`reports.advanced`); render them as
  /// readable words rather than exposing the key.
  static String _label(String key) {
    final words = key.replaceAll(RegExp(r'[._-]+'), ' ').trim();
    if (words.isEmpty) return key;
    return words[0].toUpperCase() + words.substring(1);
  }

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 18, vertical: 6),
      decoration: BoxDecoration(
        color: AppColors.surface,
        borderRadius: BorderRadius.circular(AppRadius.lg),
        border: Border.all(color: AppColors.line),
      ),
      child: Column(
        children: features
            .map(
              (f) => Padding(
                padding: const EdgeInsets.symmetric(vertical: 10),
                child: Row(
                  children: [
                    const Icon(Icons.check_circle_outline,
                        size: 18, color: AppColors.success),
                    const SizedBox(width: 12),
                    Expanded(
                      child: Text(_label(f),
                          style: const TextStyle(color: AppColors.ink, fontSize: 14)),
                    ),
                  ],
                ),
              ),
            )
            .toList(),
      ),
    );
  }
}

class _Invoices extends ConsumerWidget {
  const _Invoices();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final invoices = ref.watch(invoicesProvider);
    return invoices.when(
      loading: () => const Padding(
        padding: EdgeInsets.symmetric(vertical: 16),
        child: LinearProgressIndicator(minHeight: 2),
      ),
      error: (_, __) => const Text(
        'Could not load invoices.',
        style: TextStyle(color: AppColors.inkMuted),
      ),
      data: (list) {
        if (list.isEmpty) {
          return const Text(
            'No invoices yet.',
            style: TextStyle(color: AppColors.inkMuted),
          );
        }
        return Container(
          decoration: BoxDecoration(
            color: AppColors.surface,
            borderRadius: BorderRadius.circular(AppRadius.lg),
            border: Border.all(color: AppColors.line),
          ),
          child: Column(
            children: [
              for (var i = 0; i < list.length; i++) ...[
                if (i > 0) const Divider(height: 1),
                _InvoiceRow(invoice: list[i]),
              ],
            ],
          ),
        );
      },
    );
  }
}

class _InvoiceRow extends StatelessWidget {
  const _InvoiceRow({required this.invoice});
  final Invoice invoice;

  static (String, Color) _status(String raw) => switch (raw.toUpperCase()) {
        'PAID' => ('Paid', AppColors.success),
        'ISSUED' => ('Due', AppColors.warning),
        'OVERDUE' => ('Overdue', AppColors.danger),
        'CANCELLED' => ('Cancelled', AppColors.inkMuted),
        'DRAFT' => ('Draft', AppColors.inkMuted),
        _ => (raw.isEmpty ? '—' : raw, AppColors.inkMuted),
      };

  @override
  Widget build(BuildContext context) {
    final (label, color) = _status(invoice.status);
    final when = invoice.issuedAt ?? invoice.periodStart;
    return Padding(
      padding: const EdgeInsets.all(16),
      child: Row(
        children: [
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  invoice.invoiceNumber.isEmpty ? 'Invoice' : invoice.invoiceNumber,
                  style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 14),
                ),
                const SizedBox(height: 2),
                Text(
                  when == null ? '—' : DateFormat.yMMMd().format(when),
                  style: const TextStyle(color: AppColors.inkMuted, fontSize: 12.5),
                ),
              ],
            ),
          ),
          Text(
            _money(invoice.total, invoice.currency),
            style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 14),
          ),
          const SizedBox(width: 12),
          StatusChip(label: label, color: color),
        ],
      ),
    );
  }
}

class _ContactNote extends StatelessWidget {
  const _ContactNote();
  @override
  Widget build(BuildContext context) {
    return Banner2(
      icon: Icons.support_agent_outlined,
      text: 'Contact Tavelo to change your plan — write to ${AppConfig.supportEmail} '
          'or open a support ticket.',
    );
  }
}

class _NoSubscription extends StatelessWidget {
  const _NoSubscription();
  @override
  Widget build(BuildContext context) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(32),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const Icon(Icons.receipt_long_outlined, size: 44, color: AppColors.inkFaint),
            const SizedBox(height: 12),
            const Text(
              'No subscription on file',
              style: TextStyle(fontWeight: FontWeight.w700, color: AppColors.ink),
            ),
            const SizedBox(height: 6),
            Text(
              'Contact Tavelo at ${AppConfig.supportEmail} to set up your plan.',
              textAlign: TextAlign.center,
              style: const TextStyle(color: AppColors.inkMuted),
            ),
          ],
        ),
      ),
    );
  }
}
