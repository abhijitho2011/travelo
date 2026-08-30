import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../core/api/api_exception.dart';
import '../../core/config/app_config.dart';
import '../../core/data/owner_repository.dart';
import '../../core/models/owner_models.dart';
import '../../core/theme/app_colors.dart';
import '../../core/theme/app_spacing.dart';
import '../../core/theme/app_typography.dart';
import '../../core/utils/formatting.dart';
import '../../core/widgets/cards.dart';
import '../../core/widgets/primitives.dart';
import '../../core/widgets/states.dart';
import '../../core/widgets/status_badge.dart';

/// The owner's plan, usage and invoices. Owners can pay for the next period
/// (renew) and download invoice PDFs; changing PLAN remains a Tavelo action.
class SubscriptionScreen extends ConsumerWidget {
  const SubscriptionScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final sub = ref.watch(subscriptionProvider);
    return sub.when(
      loading: () =>
          const PageBody(children: [ListSkeleton(rows: 3, height: 120)]),
      error: (e, __) => PageBody(
        children: [
          const PageHeader(eyebrow: 'Billing', title: 'Subscription'),
          gapSection,
          if (e is ApiException && e.code == 'SUBSCRIPTION_NOT_FOUND')
            const EmptyState(
              icon: Icons.receipt_long_outlined,
              title: 'No subscription on file',
              hint:
                  'Contact Tavelo at ${AppConfig.supportEmail} to set up your '
                  'plan.',
            )
          else
            ErrorState(
              error: e,
              message: 'Could not load your subscription.',
              onRetry: () => ref.invalidate(subscriptionProvider),
            ),
        ],
      ),
      data: (s) => PageBody(
        onRefresh: () async {
          ref.invalidate(subscriptionProvider);
          ref.invalidate(invoicesProvider);
        },
        children: [
          const PageHeader(
            eyebrow: 'Billing',
            title: 'Subscription',
            subtitle:
                'Your plan, what it includes, and every invoice raised '
                'against it.',
          ),
          gapSection,
          if (s.isBlocked) ...[
            const NoticeBanner(
              tone: NoticeTone.danger,
              icon: Icons.lock_clock_outlined,
              text:
                  'Your Tavelo subscription has expired. Your hotel data is '
                  'safe, but some features are unavailable.',
            ),
            gapSection,
          ] else if (s.isWarning) ...[
            NoticeBanner(
              tone: NoticeTone.warning,
              icon: Icons.schedule,
              text:
                  'Your subscription expires in ${s.daysRemaining} '
                  '${s.daysRemaining == 1 ? 'day' : 'days'}.',
            ),
            gapSection,
          ],
          _PlanCard(sub: s),
          if (s.isBlocked || s.isWarning) ...[
            gapSection,
            _RenewCard(sub: s),
          ],
          gapSection,
          const SectionHeader(
            title: 'Hotels in your plan',
            icon: Icons.apartment_outlined,
          ),
          _UsageMeter(sub: s),
          if (s.features.isNotEmpty) ...[
            gapSection,
            const SectionHeader(
              title: 'What is included',
              icon: Icons.check_circle_outline,
            ),
            _FeatureList(features: s.features),
          ],
          gapSection,
          const SectionHeader(title: 'Invoices', icon: Icons.receipt_outlined),
          const _Invoices(),
          gapSection,
          NoticeBanner(
            icon: Icons.support_agent_outlined,
            text:
                'Contact Tavelo to change your plan — write to '
                '${AppConfig.supportEmail} or open a support ticket.',
          ),
        ],
      ),
    );
  }
}

/// Plan state → the words and the tone the owner sees.
(String, StatusTone) subscriptionStateChip(SubscriptionState state) =>
    switch (state) {
      SubscriptionState.active => ('Active', StatusTone.healthy),
      SubscriptionState.trial => ('Trial', StatusTone.info),
      SubscriptionState.expiring => ('Expiring', StatusTone.warning),
      SubscriptionState.gracePeriod => ('Grace period', StatusTone.warning),
      SubscriptionState.expired => ('Expired', StatusTone.critical),
      SubscriptionState.suspended => ('Suspended', StatusTone.critical),
      SubscriptionState.cancelled => ('Cancelled', StatusTone.neutral),
      SubscriptionState.unknown => ('Unknown', StatusTone.neutral),
    };

class _PlanCard extends StatelessWidget {
  const _PlanCard({required this.sub});
  final SubscriptionDetail sub;

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    final (label, tone) = subscriptionStateChip(sub.state);
    final start = sub.currentPeriodStart;
    final end = sub.currentPeriodEnd;
    final fmt = DateFormat.yMMMd();
    final months = sub.durationMonths;

    return SoftCard(
      padding: const EdgeInsets.all(Sp.xl),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Expanded(
                child: Text(
                  sub.planName.isEmpty ? 'Tavelo' : sub.planName,
                  style: AppTypography.display(size: 20, color: c.foreground),
                ),
              ),
              StatusBadge(tone: tone, label: label),
            ],
          ),
          if (sub.description.isNotEmpty) ...[
            const SizedBox(height: 6),
            Text(
              sub.description,
              style: AppTypography.body(size: 13, color: c.mutedForeground),
            ),
          ],
          const SizedBox(height: Sp.lg),
          Row(
            crossAxisAlignment: CrossAxisAlignment.end,
            children: [
              // A long price and a long period label together outrun a narrow
              // phone, so both halves may shrink rather than overflow.
              Flexible(
                child: Text(
                  formatPaise(sub.periodPrice, sub.currency),
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: AppTypography.kpi(size: 28, color: c.foreground),
                ),
              ),
              const SizedBox(width: 6),
              Flexible(
                child: Padding(
                  padding: const EdgeInsets.only(bottom: 2),
                  child: Text(
                    months <= 1 ? '/ month' : '/ $months months',
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: AppTypography.body(
                      size: 13,
                      color: c.mutedForeground,
                    ),
                  ),
                ),
              ),
            ],
          ),
          if (months > 1)
            Padding(
              padding: const EdgeInsets.only(top: 4),
              child: Text(
                '${formatPaise(sub.monthlyPrice, sub.currency)} per month',
                style: AppTypography.body(size: 12, color: c.mutedForeground),
              ),
            ),
          const SizedBox(height: Sp.lg),
          const RowDivider(),
          const SizedBox(height: Sp.lg),
          FactRow(
            label: 'Current period',
            value: start == null || end == null
                ? '—'
                : '${fmt.format(start)} — ${fmt.format(end)}',
          ),
          const SizedBox(height: 10),
          FactRow(
            label: 'Days remaining',
            value: sub.daysRemaining == 0
                ? 'Expired'
                : '${sub.daysRemaining} ${sub.daysRemaining == 1 ? 'day' : 'days'}',
            valueColor: sub.daysRemaining <= 14 ? c.warning : null,
          ),
          const SizedBox(height: 10),
          FactRow(label: 'Billing cycle', value: _cycleLabel(sub.billingCycle)),
          const SizedBox(height: 10),
          FactRow(
            label: 'Auto-renew',
            value: sub.autoRenew ? 'On' : 'Off',
          ),
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

class _UsageMeter extends StatelessWidget {
  const _UsageMeter({required this.sub});
  final SubscriptionDetail sub;

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    final limit = sub.propertyLimit;
    final used = sub.propertiesUsed;
    final full = limit > 0 && used >= limit;
    final tone = full ? c.warning : c.primary;

    return SoftCard(
      padding: const EdgeInsets.all(18),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            crossAxisAlignment: CrossAxisAlignment.end,
            children: [
              Text(
                '$used of ${limit <= 0 ? '—' : limit}',
                style: AppTypography.kpi(size: 22, color: c.foreground),
              ),
              const SizedBox(width: Sp.sm),
              Text(
                'hotels used',
                style: AppTypography.body(size: 13, color: c.mutedForeground),
              ),
            ],
          ),
          const SizedBox(height: Sp.md),
          MeterBar(value: sub.usageFraction, tone: tone),
          const SizedBox(height: 10),
          Text(
            full
                ? 'You have used your full hotel allowance. Contact Tavelo to add more.'
                : '${limit - used} more ${limit - used == 1 ? 'hotel' : 'hotels'} available on this plan.',
            style: AppTypography.body(
              size: 12,
              color: full ? c.warning : c.mutedForeground,
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
  static String label(String key) {
    final words = key.replaceAll(RegExp(r'[._-]+'), ' ').trim();
    if (words.isEmpty) return key;
    return words[0].toUpperCase() + words.substring(1);
  }

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    return SoftCard(
      padding: const EdgeInsets.symmetric(horizontal: 18, vertical: 6),
      child: Column(
        children: [
          for (final f in features)
            Padding(
              padding: const EdgeInsets.symmetric(vertical: 10),
              child: Row(
                children: [
                  Icon(Icons.check_circle_outline, size: 17, color: c.healthy),
                  const SizedBox(width: Sp.md),
                  Expanded(
                    child: Text(
                      label(f),
                      style: AppTypography.body(
                        size: 13.5,
                        color: c.foreground,
                      ),
                    ),
                  ),
                ],
              ),
            ),
        ],
      ),
    );
  }
}

class _Invoices extends ConsumerWidget {
  const _Invoices();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final c = context.colors;
    final invoices = ref.watch(invoicesProvider);
    return invoices.when(
      loading: () => const InlineLoader(),
      error: (_, __) => Text(
        'Could not load invoices.',
        style: AppTypography.body(size: 13, color: c.mutedForeground),
      ),
      data: (list) {
        if (list.isEmpty) {
          return const EmptyState(
            icon: Icons.receipt_outlined,
            title: 'No invoices yet.',
          );
        }
        return SoftCard(
          padding: EdgeInsets.zero,
          child: Column(
            children: [
              for (var i = 0; i < list.length; i++) ...[
                if (i > 0) const RowDivider(),
                _InvoiceRow(invoice: list[i]),
              ],
            ],
          ),
        );
      },
    );
  }
}

/// Invoice state → the words and the tone the owner sees.
(String, StatusTone) invoiceStatusChip(String raw) =>
    switch (raw.toUpperCase()) {
      'PAID' => ('Paid', StatusTone.healthy),
      'ISSUED' => ('Due', StatusTone.warning),
      'OVERDUE' => ('Overdue', StatusTone.critical),
      'CANCELLED' => ('Cancelled', StatusTone.neutral),
      'DRAFT' => ('Draft', StatusTone.neutral),
      _ => (raw.isEmpty ? '—' : raw, StatusTone.neutral),
    };

class _InvoiceRow extends StatelessWidget {
  const _InvoiceRow({required this.invoice});
  final Invoice invoice;

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    final (label, tone) = invoiceStatusChip(invoice.status);
    final when = invoice.issuedAt ?? invoice.periodStart;
    return DataRow2(
      title: invoice.invoiceNumber.isEmpty ? 'Invoice' : invoice.invoiceNumber,
      subtitle: when == null ? '—' : DateFormat.yMMMd().format(when),
      // A raised invoice with a generated PDF is downloadable: the row opens the
      // short-lived presigned link in the browser.
      onTap: invoice.hasDocument ? () => _openInvoice(context, invoice) : null,
      trailing: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Text(
            formatPaise(invoice.total, invoice.currency),
            style: AppTypography.numeric(
              size: 13.5,
              weight: FontWeight.w700,
              color: c.foreground,
            ),
          ),
          if (invoice.hasDocument) ...[
            const SizedBox(width: 8),
            Icon(Icons.download_outlined, size: 18, color: c.mutedForeground),
          ],
        ],
      ),
      badge: StatusBadge(tone: tone, label: label, dense: true),
    );
  }
}

/// Opens an invoice's presigned PDF link in the browser. The link is generated
/// per request and expires quickly, so it is always fetched fresh from the list.
Future<void> _openInvoice(BuildContext context, Invoice invoice) async {
  final url = invoice.documentUrl;
  if (url == null) return;
  final ok = await launchUrl(Uri.parse(url), mode: LaunchMode.externalApplication);
  if (!ok && context.mounted) {
    ScaffoldMessenger.of(context).showSnackBar(
      const SnackBar(content: Text('Could not open the invoice PDF.')),
    );
  }
}

/// The renew / pay-for-next-period action. Raises a gateway order server-side,
/// then hands the owner to the gateway's checkout to complete payment. Shown
/// only when the plan is expiring, in grace, or already lapsed.
class _RenewCard extends ConsumerStatefulWidget {
  const _RenewCard({required this.sub});
  final SubscriptionDetail sub;

  @override
  ConsumerState<_RenewCard> createState() => _RenewCardState();
}

class _RenewCardState extends ConsumerState<_RenewCard> {
  bool _busy = false;

  Future<void> _renew() async {
    setState(() => _busy = true);
    final messenger = ScaffoldMessenger.of(context);
    try {
      final order =
          await ref.read(ownerRepositoryProvider).createSubscriptionOrder();
      if (!mounted) return;
      // Cashfree hands back a hosted-checkout session; Razorpay a key+order for
      // its widget. When a hosted session URL is available we open it; either
      // way the parked order is settled by the gateway webhook on success.
      final sessionUrl = _hostedCheckoutUrl(order);
      if (sessionUrl != null) {
        final ok = await launchUrl(
          Uri.parse(sessionUrl),
          mode: LaunchMode.externalApplication,
        );
        if (!ok && mounted) {
          messenger.showSnackBar(
            const SnackBar(content: Text('Could not open the payment page.')),
          );
        }
      } else if (mounted) {
        messenger.showSnackBar(
          SnackBar(
            content: Text(
              'Payment order created (${formatPaise(order.amount, order.currency)}). '
              'Complete it with your Tavelo representative.',
            ),
          ),
        );
      }
    } on ApiException catch (e) {
      if (!mounted) return;
      final msg = e.code == 'GATEWAY_NOT_CONFIGURED'
          ? 'Online payment is not enabled yet. Contact Tavelo to renew.'
          : (e.message.isEmpty ? 'Could not start the payment.' : e.message);
      messenger.showSnackBar(SnackBar(content: Text(msg)));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  /// A directly-launchable hosted checkout URL, when one is available.
  ///
  /// Deliberately null for now: redeeming a Razorpay order or a Cashfree
  /// payment_session_id needs the gateway's own widget/hosted flow, which must
  /// be wired and verified against CONFIGURED credentials on-device before it
  /// ships — guessing a URL here would silently break real payments. Until then
  /// the order is raised (parked PENDING, settled by the webhook) and the owner
  /// is shown the amount; the final in-app redemption is the remaining step.
  static String? _hostedCheckoutUrl(SubscriptionOrder order) {
    return null;
  }

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    return SoftCard(
      padding: const EdgeInsets.all(Sp.xl),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            widget.sub.isBlocked ? 'Renew your subscription' : 'Renew early',
            style: AppTypography.display(size: 17, color: c.foreground),
          ),
          const SizedBox(height: 6),
          Text(
            'Pay ${formatPaise(widget.sub.periodPrice, widget.sub.currency)} for '
            'the next period. Your rooms, reservations and staff carry over '
            'unchanged.',
            style: AppTypography.body(size: 13, color: c.mutedForeground),
          ),
          const SizedBox(height: Sp.lg),
          SizedBox(
            width: double.infinity,
            child: FilledButton.icon(
              onPressed: _busy ? null : _renew,
              icon: _busy
                  ? const SizedBox(
                      height: 16,
                      width: 16,
                      child: CircularProgressIndicator(strokeWidth: 2.2),
                    )
                  : const Icon(Icons.payment_outlined, size: 18),
              label: Text(_busy ? 'Starting…' : 'Renew now'),
            ),
          ),
        ],
      ),
    );
  }
}
