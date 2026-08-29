import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/networking/api_exception.dart';
import '../../../core/permissions/permission_gate.dart';
import '../../../core/permissions/permission_keys.dart';
import '../../../core/routing/routes.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/theme/app_spacing.dart';
import '../../../core/theme/app_typography.dart';
import '../../../core/utils/formatting.dart';
import '../../../core/widgets/cards.dart';
import '../../../core/widgets/primitives.dart';
import '../../../core/widgets/states.dart';
import '../../management/presentation/approvals_screen.dart' show RejectReasonSheet;
import '../data/reception_models.dart';
import '../data/reception_repository.dart';

class ReservationDetailScreen extends ConsumerStatefulWidget {
  const ReservationDetailScreen({super.key, required this.reservationId});

  final String reservationId;

  @override
  ConsumerState<ReservationDetailScreen> createState() =>
      _ReservationDetailScreenState();
}

class _ReservationDetailScreenState
    extends ConsumerState<ReservationDetailScreen> {
  bool _busy = false;

  Future<void> _run(Future<void> Function() action, String success) async {
    setState(() => _busy = true);
    try {
      await action();
      ref.invalidate(reservationProvider(widget.reservationId));
      ref.invalidate(reservationsProvider);
      ref.invalidate(deskSummaryProvider);
      if (!mounted) return;
      ScaffoldMessenger.of(
        context,
      ).showSnackBar(SnackBar(content: Text(success)));
    } on ApiException catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(
        context,
      ).showSnackBar(SnackBar(content: Text(e.message)));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    final async = ref.watch(reservationProvider(widget.reservationId));

    return PageBody(
      onRefresh: () async =>
          ref.invalidate(reservationProvider(widget.reservationId)),
      children: [
        Align(
          alignment: Alignment.centerLeft,
          child: TextButton.icon(
            onPressed: () => context.go(Routes.reservations),
            icon: const Icon(Icons.arrow_back, size: 16),
            label: const Text('Bookings'),
          ),
        ),
        async.when(
          loading: () => const ListSkeleton(rows: 2, height: 120),
          error: (e, _) => ErrorState(
            error: e,
            onRetry: () =>
                ref.invalidate(reservationProvider(widget.reservationId)),
          ),
          data: (r) {
            if (r == null) {
              return const EmptyState(
                title: 'Booking not found',
                hint:
                    'It may have been cancelled, or the bookings service is not '
                    'live yet.',
                icon: Icons.search_off_outlined,
              );
            }
            return Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                ReservationCard(
                  guestName: r.guestName,
                  vip: r.vip,
                  reference: r.reference,
                  stay: [
                    if (r.roomType != null) r.roomType!,
                    if (r.nights != null) '${r.nights} nights',
                    if (r.guestCount > 0) '${r.guestCount} guests',
                  ].join(' · '),
                  statusLabel: r.status.label,
                  statusTone: r.status.tone,
                  roomLabel: r.roomAssigned ? 'Room ${r.roomNumber}' : 'No room',
                  balanceLabel: (r.balance ?? 0) > 0
                      ? '${Fmt.money(r.balance)} due'
                      : null,
                ),
                gapMd,

                Panel(
                  title: 'Stay',
                  padBody: false,
                  child: Column(
                    children: [
                      _Fact(label: 'Check-in', value: Fmt.dateTime(r.checkIn)),
                      const RowDivider(),
                      _Fact(label: 'Check-out', value: Fmt.dateTime(r.checkOut)),
                      const RowDivider(),
                      _Fact(
                        label: 'Room',
                        value: r.roomAssigned
                            ? '${r.roomNumber} · ${r.roomType ?? ''}'.trim()
                            : 'Not assigned yet',
                      ),
                      const RowDivider(),
                      _Fact(label: 'Source', value: r.source ?? Fmt.dash),
                      if (r.guestMobile != null) ...[
                        const RowDivider(),
                        _Fact(label: 'Contact', value: r.guestMobile!),
                      ],
                    ],
                  ),
                ),

                // The folio is money: only a role holding payment.read sees it.
                PermissionGate(
                  permission: P.paymentRead,
                  child: Padding(
                    padding: const EdgeInsets.only(top: Sp.md),
                    child: Panel(
                      title: 'Folio',
                      padBody: false,
                      child: Column(
                        children: [
                          _Fact(
                            label: 'Outstanding balance',
                            value: Fmt.money(r.balance ?? 0),
                            emphasise: (r.balance ?? 0) > 0,
                          ),
                        ],
                      ),
                    ),
                  ),
                ),

                if (r.notes != null && r.notes!.isNotEmpty) ...[
                  gapMd,
                  Panel(
                    title: 'Notes',
                    child: Text(
                      r.notes!,
                      style: AppTypography.body(
                        size: 13.5,
                        color: c.mutedForeground,
                      ),
                    ),
                  ),
                ],

                gapSection,
                _Actions(reservation: r, busy: _busy, run: _run),
              ],
            );
          },
        ),
      ],
    );
  }
}

class _Actions extends ConsumerWidget {
  const _Actions({
    required this.reservation,
    required this.busy,
    required this.run,
  });

  final Reservation reservation;
  final bool busy;
  final Future<void> Function(Future<void> Function(), String) run;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final r = reservation;
    final repo = ref.read(receptionRepositoryProvider);

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        if (r.status.canCheckIn)
          PermissionGate(
            permission: P.checkInPerform,
            child: Padding(
              padding: const EdgeInsets.only(bottom: Sp.sm),
              child: FilledButton.icon(
                onPressed: busy
                    ? null
                    : () => context.go(
                        '${Routes.checkIn}?reservationId=${r.id}',
                      ),
                icon: const Icon(Icons.login_outlined, size: 17),
                label: const Text('Start check-in'),
              ),
            ),
          ),
        if (r.status.canCheckOut)
          PermissionGate(
            permission: P.checkOutPerform,
            child: Padding(
              padding: const EdgeInsets.only(bottom: Sp.sm),
              child: FilledButton.icon(
                onPressed: busy
                    ? null
                    : () => run(
                        () => repo.checkOut(r.id),
                        '${r.guestName} checked out',
                      ),
                icon: const Icon(Icons.logout_outlined, size: 17),
                label: const Text('Check out'),
              ),
            ),
          ),

        // A receptionist does not hold `reservation.cancel`, so this button is
        // never built for them — while a GM sees it on the same screen.
        if (r.status.isOpen)
          PermissionGate(
            permission: P.reservationCancel,
            fallback: const PermissionNote(
              text:
                  'Cancelling a booking needs a manager. Ask your GM if this '
                  'one has to go.',
            ),
            child: OutlinedButton.icon(
              onPressed: busy
                  ? null
                  : () async {
                      final reason = await RejectReasonSheet.show(
                        context,
                        'booking for ${r.guestName}',
                      );
                      if (reason == null) return;
                      await run(
                        () => repo.cancel(r.id, reason: reason),
                        'Booking cancelled',
                      );
                    },
              style: OutlinedButton.styleFrom(
                foregroundColor: context.colors.destructive,
                side: BorderSide(
                  color: context.colors.destructive.withValues(alpha: 0.4),
                ),
              ),
              icon: const Icon(Icons.event_busy_outlined, size: 17),
              label: const Text('Cancel booking'),
            ),
          ),
      ],
    );
  }
}

class _Fact extends StatelessWidget {
  const _Fact({
    required this.label,
    required this.value,
    this.emphasise = false,
  });

  final String label;
  final String value;
  final bool emphasise;

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    return Padding(
      padding: Sp.row,
      child: Row(
        children: [
          Expanded(
            child: Text(
              label,
              style: AppTypography.body(size: 13, color: c.mutedForeground),
            ),
          ),
          Text(
            value,
            style: AppTypography.numeric(
              size: 13.5,
              weight: FontWeight.w600,
              color: emphasise ? c.critical : c.foreground,
            ),
          ),
        ],
      ),
    );
  }
}
