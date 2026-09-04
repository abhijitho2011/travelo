import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/intl.dart';

import '../../../core/networking/api_exception.dart';
import '../../../core/permissions/permission_gate.dart';
import '../../../core/permissions/permission_keys.dart';
import '../../../core/routing/routes.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/theme/app_spacing.dart';
import '../../../core/theme/app_typography.dart';
import '../../../core/widgets/primitives.dart';
import '../../../core/widgets/states.dart';
import '../../rooms/data/room_models.dart' show formatPaise;
import '../application/guests_controllers.dart';
import '../data/guest_models.dart';

final _date = DateFormat('d MMM yyyy');

/// **Guests** — every phone that has ever stayed, with stays and total spend.
class GuestsScreen extends ConsumerStatefulWidget {
  const GuestsScreen({super.key});
  @override
  ConsumerState<GuestsScreen> createState() => _GuestsState();
}

class _GuestsState extends ConsumerState<GuestsScreen> {
  final _search = TextEditingController();
  Timer? _debounce;

  @override
  void dispose() {
    _debounce?.cancel();
    _search.dispose();
    super.dispose();
  }

  void _onChanged(String v) {
    _debounce?.cancel();
    _debounce = Timer(const Duration(milliseconds: 250), () {
      if (mounted) {
        ref.read(guestQueryProvider.notifier).state = v;
      }
    });
  }

  @override
  Widget build(BuildContext context) {
    final list = ref.watch(guestsProvider);
    return PageBody(
      onRefresh: () async => ref.invalidate(guestsProvider),
      children: [
        const PageHeader(eyebrow: 'CRM', title: 'Guests'),
        gapMd,
        TextField(
          controller: _search,
          decoration: const InputDecoration(
            hintText: 'Search by name or phone',
            prefixIcon: Icon(Icons.search),
          ),
          onChanged: _onChanged,
        ),
        gapSection,
        list.when(
          loading: () => const ListSkeleton(rows: 4),
          error: (e, _) => ErrorState(
            error: e,
            onRetry: () => ref.invalidate(guestsProvider),
          ),
          data: (items) => items.isEmpty
              ? const EmptyState(
                  title: 'No guests yet',
                  hint: 'Guests appear here as bookings are created.',
                  icon: Icons.person_outline,
                )
              : SoftCard(
                  padding: EdgeInsets.zero,
                  child: Column(
                    children: [
                      for (var i = 0; i < items.length; i++) ...[
                        if (i > 0) const RowDivider(),
                        _GuestRow(guest: items[i]),
                      ],
                    ],
                  ),
                ),
        ),
        gapSection,
      ],
    );
  }
}

class _GuestRow extends ConsumerWidget {
  const _GuestRow({required this.guest});
  final GuestSummary guest;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final c = context.colors;
    return ListTile(
      leading: CircleAvatar(
        backgroundColor: guest.blacklisted ? c.destructive : c.primary,
        child: Text(
          guest.name.isEmpty ? '?' : guest.name[0].toUpperCase(),
          style: TextStyle(color: c.primaryForeground),
        ),
      ),
      title: Row(
        children: [
          Flexible(
            child: Text(
              guest.name,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: AppTypography.body(
                size: 13.5,
                weight: FontWeight.w600,
                color: c.foreground,
              ),
            ),
          ),
          if (guest.blacklisted)
            Padding(
              padding: const EdgeInsets.only(left: 6),
              child: Container(
                padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                decoration: BoxDecoration(
                  color: c.destructive.withValues(alpha: 0.14),
                  borderRadius: R.rPill,
                ),
                child: Text(
                  'Blacklisted',
                  style: AppTypography.body(
                    size: 10,
                    weight: FontWeight.w700,
                    color: c.destructive,
                  ),
                ),
              ),
            ),
        ],
      ),
      subtitle: Text(
        '${guest.phone} · ${guest.stays} stay${guest.stays == 1 ? '' : 's'}'
        '${guest.lastStay == null ? '' : ' · last ${_date.format(guest.lastStay!.toLocal())}'}',
        style: AppTypography.body(size: 11.5, color: c.mutedForeground),
      ),
      trailing: Text(
        formatPaise(guest.totalSpentPaise),
        style: AppTypography.body(
          size: 12.5,
          weight: FontWeight.w600,
          color: c.foreground,
        ),
      ),
      onTap: () => _openProfile(context, ref, guest.phone),
    );
  }
}

Future<void> _openProfile(BuildContext context, WidgetRef ref, String phone) {
  return showModalBottomSheet<void>(
    context: context,
    isScrollControlled: true,
    useSafeArea: true,
    builder: (_) => _ProfileSheet(phone: phone),
  );
}

class _ProfileSheet extends ConsumerWidget {
  const _ProfileSheet({required this.phone});
  final String phone;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final c = context.colors;
    final data = ref.watch(guestProfileProvider(phone));
    return DraggableScrollableSheet(
      initialChildSize: 0.9,
      maxChildSize: 0.95,
      minChildSize: 0.5,
      expand: false,
      builder: (_, controller) => Padding(
        padding: const EdgeInsets.symmetric(horizontal: Sp.lg),
        child: data.when(
          loading: () => const Center(child: CircularProgressIndicator()),
          error: (e, _) => ErrorState(
            error: e,
            onRetry: () => ref.invalidate(guestProfileProvider(phone)),
          ),
          data: (p) => ListView(
            controller: controller,
            children: [
              const SizedBox(height: Sp.md),
              Text(
                p.name,
                style: AppTypography.display(size: 20, color: c.foreground),
              ),
              Text(
                p.phone,
                style: AppTypography.body(size: 12, color: c.mutedForeground),
              ),
              gapMd,
              KpiGrid(
                children: [
                  KpiCard(label: 'Stays', value: '${p.stays}'),
                  if (p.idType != null && p.idNumber != null)
                    KpiCard(label: p.idType!.toUpperCase(), value: p.idNumber!),
                  if (p.blacklisted)
                    KpiCard(
                      label: 'Status',
                      value: 'Blacklisted',
                      tone: c.destructive,
                    ),
                ],
              ),
              gapMd,
              PermissionGate(
                permission: P.guestUpdate,
                child: _BlacklistPanel(profile: p),
              ),
              gapMd,
              if (p.notes != null && p.notes!.isNotEmpty)
                SoftCard(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        'Internal note',
                        style: AppTypography.labelXs(c.mutedForeground),
                      ),
                      const SizedBox(height: 4),
                      Text(
                        p.notes!,
                        style: AppTypography.body(
                          size: 13,
                          color: c.foreground,
                        ),
                      ),
                    ],
                  ),
                ),
              gapMd,
              Text('Stays', style: AppTypography.labelXs(c.mutedForeground)),
              const SizedBox(height: 6),
              if (p.history.isEmpty)
                const EmptyState(
                  title: 'No past stays',
                  icon: Icons.hotel_outlined,
                ),
              for (final s in p.history)
                ListTile(
                  contentPadding: EdgeInsets.zero,
                  leading: const Icon(Icons.event_outlined),
                  title: Text('#${s.reservationNumber}'),
                  subtitle: Text(
                    '${s.checkIn == null ? '' : _date.format(s.checkIn!.toLocal())}'
                    '${s.checkOut == null ? '' : ' → ${_date.format(s.checkOut!.toLocal())}'} · ${s.status}',
                    style: AppTypography.body(
                      size: 11.5,
                      color: c.mutedForeground,
                    ),
                  ),
                  trailing: Text(
                    formatPaise(s.paidPaise),
                    style: AppTypography.body(
                      size: 12.5,
                      weight: FontWeight.w600,
                      color: c.foreground,
                    ),
                  ),
                  onTap: () {
                    Navigator.pop(context);
                    context.go(Routes.reservation(s.reservationId));
                  },
                ),
              const SizedBox(height: Sp.lg),
            ],
          ),
        ),
      ),
    );
  }
}

class _BlacklistPanel extends ConsumerStatefulWidget {
  const _BlacklistPanel({required this.profile});
  final GuestProfile profile;
  @override
  ConsumerState<_BlacklistPanel> createState() => _BlacklistPanelState();
}

class _BlacklistPanelState extends ConsumerState<_BlacklistPanel> {
  late final _reason = TextEditingController(
    text: widget.profile.blacklistReason ?? '',
  );
  late bool _on = widget.profile.blacklisted;
  bool _busy = false;

  @override
  void dispose() {
    _reason.dispose();
    super.dispose();
  }

  Future<void> _save() async {
    final messenger = ScaffoldMessenger.of(context);
    setState(() => _busy = true);
    try {
      await ref
          .read(guestsActionsProvider)
          .flag(
            widget.profile.phone,
            blacklisted: _on,
            blacklistReason: _on ? _reason.text.trim() : '',
          );
      if (mounted) {
        messenger.showSnackBar(const SnackBar(content: Text('Saved')));
      }
    } on ApiException catch (e) {
      messenger.showSnackBar(SnackBar(content: Text(e.message)));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    return SoftCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          SwitchListTile(
            contentPadding: EdgeInsets.zero,
            title: const Text('Blacklist this guest'),
            subtitle: Text(
              _on
                  ? 'New bookings for this phone need a manager override.'
                  : 'Anyone can book for this phone.',
              style: AppTypography.body(size: 11.5, color: c.mutedForeground),
            ),
            value: _on,
            onChanged: _busy ? null : (v) => setState(() => _on = v),
          ),
          if (_on) ...[
            const SizedBox(height: Sp.sm),
            TextField(
              controller: _reason,
              minLines: 2,
              maxLines: 4,
              decoration: const InputDecoration(
                labelText: 'Reason',
                hintText: 'Why is this guest blacklisted?',
              ),
            ),
          ],
          const SizedBox(height: Sp.sm),
          Align(
            alignment: Alignment.centerRight,
            child: FilledButton(
              onPressed: _busy ? null : _save,
              child: Text(_busy ? 'Saving…' : 'Save'),
            ),
          ),
        ],
      ),
    );
  }
}
