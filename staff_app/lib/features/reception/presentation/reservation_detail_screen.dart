import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/networking/api_exception.dart';
import '../../../core/permissions/permission_gate.dart';
import '../../../core/permissions/permission_keys.dart';
import '../../../core/providers.dart';
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
  Future<void> _run(Future<void> Function() action, String success) async {
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
                hint: 'It may have been removed since this screen was opened.',
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
                  balanceLabel: r.balancePaise > 0
                      ? '${r.balanceLabel} due'
                      : null,
                ),
                const SizedBox(height: 6),
                FieldNote(text: r.status.hint),
                gapMd,

                Panel(
                  title: 'Stay',
                  padBody: false,
                  child: Column(
                    children: [
                      _Fact(label: 'Check-in', value: Fmt.dayMonth(r.checkIn)),
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
                      if (r.roomId != null &&
                          (r.status == ReservationStatus.confirmed ||
                              r.status == ReservationStatus.checkedIn)) ...[
                        const RowDivider(),
                        _RoomPlacementActions(reservation: r),
                      ],
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

                if (_error != null) ...[gapMd, FormErrorNote(message: _error!)],

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

  Future<void> _take(
    BuildContext context,
    WidgetRef ref,
    bool isRefund,
    int? suggested,
  ) async {
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
          _Fact(
            label: 'Room',
            value: formatPaiseOf(folio?.roomChargePaise ?? r.totalPaise),
          ),
          if (folio != null)
            for (final item in folio.lineItems) ...[
              const RowDivider(),
              _FolioLineRow(reservation: r, item: item),
            ],
          if (folio != null) ...[
            const RowDivider(),
            _Fact(label: 'Subtotal', value: formatPaiseOf(folio.subtotalPaise)),
            const RowDivider(),
            _Fact(
              label: folio.roomTaxRatePercent > 0
                  ? 'GST on room (${folio.roomTaxRatePercent}%${folio.intraState ? ', CGST+SGST' : ', IGST'})'
                  : 'GST on room',
              value: formatPaiseOf(folio.roomTaxPaise),
            ),
            if (folio.lineTaxPaise > 0) ...[
              const RowDivider(),
              _Fact(
                label: 'GST on services',
                value: formatPaiseOf(folio.lineTaxPaise),
              ),
            ],
            if (folio.propertyTaxPaise > 0) ...[
              const RowDivider(),
              _Fact(
                label: 'Hotel fees',
                value: formatPaiseOf(folio.propertyTaxPaise),
              ),
            ],
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
                const Spacer(),
                PermissionGate(
                  permission: P.folioAdjust,
                  child: IconButton(
                    tooltip: 'Discount',
                    onPressed: () =>
                        _FolioReasonSheet.discount(context, ref, r.id),
                    icon: const Icon(Icons.percent_outlined, size: 19),
                  ),
                ),
                IconButton(
                  tooltip: 'Folio log',
                  onPressed: () => _FolioLogSheet.show(context, r.id),
                  icon: const Icon(Icons.history, size: 19),
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
                label: Text(r.roomAssigned ? 'Change room' : 'Assign a room'),
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
        if (r.status.canNoShow &&
            r.checkIn != null &&
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

/// One folio line with its tax note and, for adjusters, void / exempt.
class _FolioLineRow extends ConsumerWidget {
  const _FolioLineRow({required this.reservation, required this.item});
  final Reservation reservation;
  final FolioLineItem item;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final c = context.colors;
    final canAdjust = ref.watch(permissionsProvider).has(P.folioAdjust);
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: Sp.md, vertical: Sp.sm),
      child: Row(
        children: [
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  item.description,
                  style: AppTypography.body(
                    size: 13,
                    color: item.isDiscount ? c.primary : c.foreground,
                  ),
                ),
                if (item.taxLabel.isNotEmpty)
                  Text(
                    item.taxLabel,
                    style: AppTypography.body(
                      size: 11,
                      color: c.mutedForeground,
                    ),
                  ),
              ],
            ),
          ),
          Text(
            item.amountLabel,
            style: AppTypography.numeric(
              size: 13,
              weight: FontWeight.w600,
              color: c.foreground,
            ),
          ),
          if (canAdjust && item.id != null && !item.isDiscount)
            PopupMenuButton<String>(
              tooltip: 'Line actions',
              icon: Icon(Icons.more_vert, size: 17, color: c.mutedForeground),
              onSelected: (a) {
                if (a == 'void') {
                  _FolioReasonSheet.voidLine(
                    context,
                    ref,
                    reservation.id,
                    item,
                  );
                }
                if (a == 'exempt') {
                  _FolioReasonSheet.taxExempt(
                    context,
                    ref,
                    reservation.id,
                    item,
                  );
                }
              },
              itemBuilder: (_) => [
                PopupMenuItem(
                  value: 'exempt',
                  child: Text(
                    item.taxExempt ? 'Remove tax exemption' : 'Tax exempt',
                  ),
                ),
                const PopupMenuItem(value: 'void', child: Text('Void line')),
              ],
            ),
        ],
      ),
    );
  }
}

/// Discount / void / exemption all need a reason: the log is the point.
class _FolioReasonSheet {
  static Future<void> _run(
    BuildContext context, {
    required String title,
    required String hint,
    bool askAmount = false,
    required Future<void> Function(int? amountPaise, String reason) action,
  }) async {
    final reason = TextEditingController();
    final amount = TextEditingController();
    final messenger = ScaffoldMessenger.of(context);
    var busy = false;
    await showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      useSafeArea: true,
      builder: (_) => StatefulBuilder(
        builder: (context, setState) {
          final c = context.colors;
          return Padding(
            padding: EdgeInsets.fromLTRB(
              Sp.lg,
              Sp.lg,
              Sp.lg,
              MediaQuery.of(context).viewInsets.bottom + Sp.lg,
            ),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Text(
                  title,
                  style: AppTypography.display(size: 17, color: c.foreground),
                ),
                const SizedBox(height: Sp.lg),
                if (askAmount) ...[
                  TextField(
                    controller: amount,
                    keyboardType: TextInputType.number,
                    decoration: const InputDecoration(labelText: 'Amount (₹)'),
                  ),
                  const SizedBox(height: Sp.md),
                ],
                TextField(
                  controller: reason,
                  maxLines: 2,
                  decoration: InputDecoration(
                    labelText: 'Reason',
                    hintText: hint,
                  ),
                ),
                const SizedBox(height: Sp.lg),
                FilledButton(
                  onPressed: busy
                      ? null
                      : () async {
                          if (reason.text.trim().length < 2) return;
                          setState(() => busy = true);
                          try {
                            final paise = askAmount
                                ? ((double.tryParse(amount.text.trim()) ?? 0) *
                                          100)
                                      .round()
                                : null;
                            await action(paise, reason.text.trim());
                            if (context.mounted) Navigator.pop(context);
                          } on ApiException catch (e) {
                            messenger.showSnackBar(
                              SnackBar(content: Text(e.message)),
                            );
                          } finally {
                            if (context.mounted) setState(() => busy = false);
                          }
                        },
                  child: const Text('Apply'),
                ),
              ],
            ),
          );
        },
      ),
    );
  }

  static Future<void> discount(
    BuildContext context,
    WidgetRef ref,
    String id,
  ) => _run(
    context,
    title: 'Discount',
    hint: 'Loyal guest, service recovery…',
    askAmount: true,
    action: (paise, reason) => ref
        .read(reservationActionsProvider)
        .folioDiscount(id, amountPaise: paise ?? 0, reason: reason),
  );

  static Future<void> voidLine(
    BuildContext context,
    WidgetRef ref,
    String id,
    FolioLineItem item,
  ) => _run(
    context,
    title: 'Void “${item.description}”',
    hint: 'Posted in error, guest disputed…',
    action: (_, reason) => ref
        .read(reservationActionsProvider)
        .folioVoidLine(id, item.id!, reason: reason),
  );

  static Future<void> taxExempt(
    BuildContext context,
    WidgetRef ref,
    String id,
    FolioLineItem item,
  ) => _run(
    context,
    title: item.taxExempt
        ? 'Remove tax exemption'
        : 'Tax exempt “${item.description}”',
    hint: 'Diplomatic guest, SEZ unit…',
    action: (_, reason) => ref
        .read(reservationActionsProvider)
        .folioTaxExempt(id, item.id!, exempt: !item.taxExempt, reason: reason),
  );
}

class _FolioLogSheet {
  static Future<void> show(
    BuildContext context,
    String id,
  ) => showModalBottomSheet<void>(
    context: context,
    useSafeArea: true,
    builder: (_) => Consumer(
      builder: (context, ref, _) {
        final c = context.colors;
        final events = ref.watch(folioEventsProvider(id));
        return Padding(
          padding: const EdgeInsets.all(Sp.lg),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Text(
                'Folio log',
                style: AppTypography.display(size: 17, color: c.foreground),
              ),
              const SizedBox(height: Sp.md),
              Flexible(
                child: events.when(
                  loading: () => const ListSkeleton(rows: 3),
                  error: (e, _) => ErrorState(
                    error: e,
                    onRetry: () => ref.invalidate(folioEventsProvider(id)),
                  ),
                  data: (list) => list.isEmpty
                      ? const EmptyState(
                          title: 'Nothing changed on this folio yet',
                          icon: Icons.history,
                        )
                      : ListView.separated(
                          shrinkWrap: true,
                          itemCount: list.length,
                          separatorBuilder: (_, _) => const RowDivider(),
                          itemBuilder: (_, i) {
                            final e = list[i];
                            final reason = e.payload['reason'];
                            return ListTile(
                              dense: true,
                              title: Text(e.label),
                              subtitle: Text(
                                '${reason ?? ''}${reason == null ? '' : ' · '}${Fmt.dayMonth(e.createdAt)}',
                                style: AppTypography.body(
                                  size: 11.5,
                                  color: c.mutedForeground,
                                ),
                              ),
                            );
                          },
                        ),
                ),
              ),
            ],
          ),
        );
      },
    ),
  );
}

/// Lock the booking to its room, or swap rooms with another booking.
class _RoomPlacementActions extends ConsumerWidget {
  const _RoomPlacementActions({required this.reservation});
  final Reservation reservation;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final r = reservation;
    final c = context.colors;
    return PermissionGate(
      permission: P.reservationAllocate,
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: Sp.md, vertical: Sp.sm),
        child: Row(
          children: [
            Icon(
              r.roomLocked ? Icons.lock_outline : Icons.lock_open_outlined,
              size: 16,
              color: r.roomLocked ? c.primary : c.mutedForeground,
            ),
            const SizedBox(width: Sp.sm),
            Expanded(
              child: Text(
                r.roomLocked
                    ? 'Locked to this room'
                    : 'May be moved by auto-allocation',
                style: AppTypography.body(size: 12, color: c.mutedForeground),
              ),
            ),
            TextButton(
              onPressed: () async {
                final messenger = ScaffoldMessenger.of(context);
                try {
                  await ref
                      .read(reservationActionsProvider)
                      .lockRoom(r.id, !r.roomLocked);
                  messenger.showSnackBar(
                    SnackBar(
                      content: Text(
                        r.roomLocked
                            ? 'Room unlocked'
                            : 'Locked to room ${r.roomNumber}',
                      ),
                    ),
                  );
                } on ApiException catch (e) {
                  messenger.showSnackBar(SnackBar(content: Text(e.message)));
                }
              },
              child: Text(r.roomLocked ? 'Unlock' : 'Lock'),
            ),
            TextButton(
              onPressed: r.roomLocked
                  ? null
                  : () => _SwapSheet.show(context, ref, r),
              child: const Text('Swap'),
            ),
          ],
        ),
      ),
    );
  }
}

/// Pick another booking of the same type that is in a room, and swap.
class _SwapSheet {
  static Future<void> show(
    BuildContext context,
    WidgetRef ref,
    Reservation r,
  ) async {
    final messenger = ScaffoldMessenger.of(context);
    await showModalBottomSheet<void>(
      context: context,
      useSafeArea: true,
      builder: (_) => Consumer(
        builder: (context, ref, _) {
          final c = context.colors;
          final all = ref.watch(reservationsProvider);
          return Padding(
            padding: const EdgeInsets.all(Sp.lg),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Text(
                  'Swap rooms with…',
                  style: AppTypography.display(size: 17, color: c.foreground),
                ),
                Text(
                  'Same room type, both in a room, neither locked.',
                  style: AppTypography.body(size: 12, color: c.mutedForeground),
                ),
                const SizedBox(height: Sp.md),
                Flexible(
                  child: all.when(
                    loading: () => const ListSkeleton(rows: 3),
                    error: (e, _) => ErrorState(error: e),
                    data: (list) {
                      final candidates = list
                          .where(
                            (o) =>
                                o.id != r.id &&
                                o.roomTypeId == r.roomTypeId &&
                                o.roomId != null &&
                                !o.roomLocked &&
                                (o.status == ReservationStatus.confirmed ||
                                    o.status == ReservationStatus.checkedIn),
                          )
                          .toList();
                      if (candidates.isEmpty) {
                        return const EmptyState(
                          title: 'No booking to swap with',
                          icon: Icons.swap_horiz,
                        );
                      }
                      return ListView.separated(
                        shrinkWrap: true,
                        itemCount: candidates.length,
                        separatorBuilder: (_, _) => const RowDivider(),
                        itemBuilder: (_, i) {
                          final o = candidates[i];
                          return ListTile(
                            title: Text(
                              '${o.guestName} · Room ${o.roomNumber}',
                            ),
                            subtitle: Text(
                              o.stayLine,
                              style: AppTypography.body(
                                size: 11.5,
                                color: c.mutedForeground,
                              ),
                            ),
                            onTap: () async {
                              try {
                                await ref
                                    .read(reservationActionsProvider)
                                    .swapRooms(r.id, o.id);
                                if (context.mounted) Navigator.pop(context);
                                messenger.showSnackBar(
                                  SnackBar(
                                    content: Text(
                                      'Swapped with ${o.guestName}',
                                    ),
                                  ),
                                );
                              } on ApiException catch (e) {
                                messenger.showSnackBar(
                                  SnackBar(content: Text(e.message)),
                                );
                              }
                            },
                          );
                        },
                      );
                    },
                  ),
                ),
              ],
            ),
          );
        },
      ),
    );
  }
}
