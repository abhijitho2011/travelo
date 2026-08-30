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
import '../../management/presentation/approvals_screen.dart'
    show RejectReasonSheet;
import '../../rooms/presentation/room_widgets.dart'
    show FieldNote, FormErrorNote;
import '../application/reception_controllers.dart';
import '../data/reception_models.dart';
import '../data/reception_repository.dart';
import 'folio_payment_sheet.dart';
import 'room_picker_sheet.dart';

/// One booking, and everything the desk may do to it.
///
/// Which buttons exist is decided twice over, and both checks matter. The
/// STATUS decides what is possible — a checked-out stay offers nothing, so a
/// button that could only earn an INVALID_TRANSITION is never drawn. The
/// PERMISSION decides what this person may do — a receptionist gets check-in
/// and check-out, and the server refuses anything the UI failed to hide.
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
  String? _error;

  /// Runs one action, reporting its outcome where the user is looking. Errors
  /// stay ON the screen rather than in a snackbar that vanishes: a refused
  /// check-in is something the clerk has to read and act on.
  Future<void> _run(
    Future<void> Function() action,
    String success,
  ) async {
    setState(() {
      _busy = true;
      _error = null;
    });
    final messenger = ScaffoldMessenger.of(context);
    try {
      await action();
      if (!mounted) return;
      messenger.showSnackBar(SnackBar(content: Text(success)));
    } on ApiException catch (e) {
      if (!mounted) return;
      setState(() => _error = ReservationErrors.friendly(e));
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
                    'It may have been removed since this screen was opened.',
                icon: Icons.search_off_outlined,
              );
            }
            return Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                ReservationCard(
                  guestName: r.guestName,
                  reference: r.reservationNumber,
                  stay: r.stayLine,
                  statusLabel: r.status.label,
                  statusTone: r.tone,
                  roomLabel: r.roomLabel,
                  balanceLabel:
                      r.balancePaise > 0 ? '${r.balanceLabel} due' : null,
                ),
                const SizedBox(height: 6),
                FieldNote(text: r.status.hint),
                gapMd,

                Panel(
                  title: 'Stay',
                  padBody: false,
                  child: Column(
                    children: [
                      _Fact(
                        label: 'Check-in',
                        value: Fmt.dayMonth(r.checkIn),
                      ),
                      const RowDivider(),
                      _Fact(
                        label: 'Check-out',
                        value: Fmt.dayMonth(r.checkOut),
                      ),
                      const RowDivider(),
                      _Fact(label: 'Nights', value: r.nightsLabel),
                      const RowDivider(),
                      _Fact(
                        label: 'Sold as',
                        value: r.roomTypeName ?? Fmt.dash,
                      ),
                      const RowDivider(),
                      _Fact(
                        label: 'Room',
                        value: r.roomAssigned
                            ? 'Room ${r.roomNumber}'
                            : 'Not assigned yet',
                      ),
                      const RowDivider(),
                      _Fact(label: 'Guests', value: r.guestMixLabel),
                      const RowDivider(),
                      _Fact(label: 'Booked through', value: r.source.label),
                    ],
                  ),
                ),
                gapMd,

                Panel(
                  title: 'Guest',
                  padBody: false,
                  child: Column(
                    children: [
                      _Fact(label: 'Name', value: r.guestName),
                      const RowDivider(),
                      _Fact(label: 'Mobile', value: r.guestPhone ?? Fmt.dash),
                      if (r.guestEmail != null) ...[
                        const RowDivider(),
                        _Fact(label: 'Email', value: r.guestEmail!),
                      ],
                      if (r.guestIdNumber != null) ...[
                        const RowDivider(),
                        _Fact(
                          label: r.guestIdType ?? 'ID',
                          value: r.guestIdNumber!,
                        ),
                      ],
                    ],
                  ),
                ),

                // The folio is money: only a role holding payment.read sees it.
                PermissionGate(
                  permission: P.paymentRead,
                  child: Padding(
                    padding: const EdgeInsets.only(top: Sp.md),
                    child: _FolioPanel(reservation: r),
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

                if (r.events.isNotEmpty) ...[
                  gapMd,
                  Panel(
                    title: 'What has happened',
                    padBody: false,
                    child: Column(
                      children: [
                        for (var i = 0; i < r.events.length; i++) ...[
                          if (i > 0) const RowDivider(),
                          _EventRow(event: r.events[i]),
                        ],
                      ],
                    ),
                  ),
                ],

                if (_error != null) ...[
                  gapMd,
                  FormErrorNote(message: _error!),
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

/// Rupees for a paise figure the model does not already label.
String formatPaiseOf(int paise) => Fmt.money(paise / 100);

/// The folio panel: the itemised stay bill with collect-payment and refund
/// actions. It watches the live folio (ancillary charges posted from
/// restaurant/spa land here too), and falls back to the reservation's own
/// figures while that first fetch is in flight so the panel is never empty.
class _FolioPanel extends ConsumerWidget {
  const _FolioPanel({required this.reservation});

  final Reservation reservation;

  Future<void> _take(BuildContext context, WidgetRef ref, bool isRefund, int? suggested) async {
    final ok = await FolioPaymentSheet.show(
      context,
      reservationId: reservation.id,
      guestName: reservation.guestName,
      isRefund: isRefund,
      suggestedPaise: suggested,
    );
    if (ok == true && context.mounted) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(isRefund ? 'Refund recorded' : 'Payment taken')),
      );
    }
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final r = reservation;
    final folioAsync = ref.watch(folioProvider(r.id));
    final folio = folioAsync.valueOrNull;

    final balancePaise = folio?.balancePaise ?? r.balancePaise;
    final paidPaise = folio?.netPaidPaise ?? r.paidPaise;
    final chargesPaise = folio?.chargesPaise ?? r.totalPaise;

    return Panel(
      title: 'Folio',
      padBody: false,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          _Fact(label: 'Room', value: formatPaiseOf(folio?.roomChargePaise ?? r.totalPaise)),
          if (folio != null)
            for (final item in folio.lineItems) ...[
              const RowDivider(),
              _Fact(label: item.description, value: item.amountLabel),
            ],
          const RowDivider(),
          _Fact(label: 'Total charges', value: formatPaiseOf(chargesPaise)),
          if (folio != null)
            for (final p in folio.payments) ...[
              const RowDivider(),
              _Fact(
                label: '${p.isRefund ? 'Refund' : 'Payment'} · ${p.method}',
                value: '${p.isRefund ? '-' : ''}${p.amountLabel}',
              ),
            ],
          const RowDivider(),
          _Fact(label: 'Paid', value: formatPaiseOf(paidPaise)),
          const RowDivider(),
          _Fact(
            label: 'Outstanding',
            value: formatPaiseOf(balancePaise),
            emphasise: balancePaise > 0,
          ),
          Padding(
            padding: const EdgeInsets.all(Sp.md),
            child: Row(
              children: [
                PermissionGate(
                  permission: P.paymentCollect,
                  child: FilledButton.icon(
                    onPressed: () => _take(
                      context,
                      ref,
                      false,
                      balancePaise > 0 ? balancePaise : null,
                    ),
                    icon: const Icon(Icons.payments_outlined, size: 17),
                    label: const Text('Collect'),
                  ),
                ),
                const SizedBox(width: Sp.sm),
                PermissionGate(
                  permission: P.paymentRefund,
                  child: OutlinedButton.icon(
                    onPressed: () => _take(context, ref, true, null),
                    icon: const Icon(Icons.undo_outlined, size: 17),
                    label: const Text('Refund'),
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

class _Actions extends ConsumerWidget {
  const _Actions({
    required this.reservation,
    required this.busy,
    required this.run,
  });

  final Reservation reservation;
  final bool busy;
  final Future<void> Function(Future<void> Function(), String) run;

  Future<void> _checkOut(
    BuildContext context,
    WidgetRef ref,
    Reservation r,
  ) async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: Text('Check out ${r.guestName}?'),
        content: Text(
          r.balancePaise > 0
              ? 'There is still ${r.balanceLabel} outstanding on this folio. '
                    'Checking out releases room ${r.roomNumber ?? ''} to '
                    'housekeeping and ends the stay.'
              : 'Room ${r.roomNumber ?? ''} goes to housekeeping and the stay '
                    'ends. This cannot be undone from the app.',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(context).pop(false),
            child: const Text('Not yet'),
          ),
          FilledButton(
            onPressed: () => Navigator.of(context).pop(true),
            child: const Text('Check out'),
          ),
        ],
      ),
    );
    if (confirmed != true) return;
    // Confirming the dialog above — which spells out the outstanding amount — IS
    // the explicit override the server now requires to let a guest depart owing
    // money. Collect first via the folio's Collect button to avoid it.
    await run(
      () => ref
          .read(reservationActionsProvider)
          .checkOut(r.id, allowOutstanding: r.balancePaise > 0),
      '${r.guestName} checked out',
    );
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final r = reservation;
    final actions = ref.read(reservationActionsProvider);

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        if (r.status.canConfirm)
          PermissionGate(
            permission: P.reservationUpdate,
            child: Padding(
              padding: const EdgeInsets.only(bottom: Sp.sm),
              child: FilledButton.icon(
                onPressed: busy
                    ? null
                    : () => run(
                        () => actions.confirm(r.id),
                        'Booking confirmed — the room is now held',
                      ),
                icon: const Icon(Icons.task_alt_outlined, size: 17),
                label: const Text('Confirm booking'),
              ),
            ),
          ),

        // Assigning early is optional but useful: a guest who rings ahead
        // asking for a quiet room gets one now rather than at the desk.
        if (r.status.isOpen && r.status != ReservationStatus.checkedIn)
          PermissionGate(
            permission: P.reservationUpdate,
            child: Padding(
              padding: const EdgeInsets.only(bottom: Sp.sm),
              child: OutlinedButton.icon(
                onPressed: busy
                    ? null
                    : () async {
                        final roomId = await RoomPickerSheet.show(
                          context,
                          roomTypeId: r.roomTypeId,
                          roomTypeName: r.roomTypeName,
                        );
                        if (roomId == null) return;
                        await run(
                          () => actions.assignRoom(r.id, roomId),
                          'Room assigned',
                        );
                      },
                icon: const Icon(Icons.meeting_room_outlined, size: 17),
                label: Text(
                  r.roomAssigned ? 'Change room' : 'Assign a room',
                ),
              ),
            ),
          ),

        if (r.status.canCheckIn)
          PermissionGate(
            permission: P.checkInPerform,
            child: Padding(
              padding: const EdgeInsets.only(bottom: Sp.sm),
              child: FilledButton.icon(
                onPressed: busy
                    ? null
                    : () =>
                          context.go('${Routes.checkIn}?reservationId=${r.id}'),
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
                onPressed: busy ? null : () => _checkOut(context, ref, r),
                icon: const Icon(Icons.logout_outlined, size: 17),
                label: const Text('Check out'),
              ),
            ),
          ),

        // A no-show is a judgement about a guest who never came, so it is only
        // offered once the arrival date is behind us — the server refuses it
        // before that, and offering it earlier would invite the refusal.
        if (r.status.canNoShow && r.checkIn != null &&
            dateOnly(DateTime.now()).isAfter(dateOnly(r.checkIn!)))
          PermissionGate(
            permission: P.reservationCancel,
            child: Padding(
              padding: const EdgeInsets.only(bottom: Sp.sm),
              child: OutlinedButton.icon(
                onPressed: busy
                    ? null
                    : () => run(
                        () => actions.noShow(r.id),
                        'Marked as a no-show',
                      ),
                icon: const Icon(Icons.person_off_outlined, size: 17),
                label: const Text('Mark as no-show'),
              ),
            ),
          ),

        // A receptionist DOES hold `reservation.cancel` — a guest who rings to
        // cancel cannot be told to wait for the GM — but sales and the travel
        // desk, who can raise a booking, cannot cancel one.
        if (r.status.canCancel)
          PermissionGate(
            permission: P.reservationCancel,
            fallback: const PermissionNote(
              text:
                  'Your role can raise a booking but not cancel one. Ask '
                  'reception or a manager.',
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
                        () => actions.cancel(r.id, reason),
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

/// One row of the transition trail.
class _EventRow extends StatelessWidget {
  const _EventRow({required this.event});

  final ReservationEventEntry event;

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    return Padding(
      padding: Sp.row,
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  event.label,
                  style: AppTypography.body(
                    size: 13,
                    weight: FontWeight.w600,
                    color: c.foreground,
                  ),
                ),
                if (event.detail != null)
                  Text(
                    event.detail!,
                    style: AppTypography.body(
                      size: 12,
                      color: c.mutedForeground,
                    ),
                  ),
              ],
            ),
          ),
          Text(
            Fmt.dateTime(event.createdAt),
            style: AppTypography.body(size: 12, color: c.mutedForeground),
          ),
        ],
      ),
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
          Flexible(
            child: Text(
              value,
              textAlign: TextAlign.right,
              style: AppTypography.numeric(
                size: 13.5,
                weight: FontWeight.w600,
                color: emphasise ? c.critical : c.foreground,
              ),
            ),
          ),
        ],
      ),
    );
  }
}
