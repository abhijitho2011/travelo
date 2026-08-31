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
import '../../../core/widgets/primitives.dart';
import '../../../core/widgets/states.dart';
import '../../../core/widgets/status_badge.dart';
import '../application/reception_controllers.dart';
import '../data/key_cards.dart';
import '../data/reception_models.dart';
import '../data/reception_repository.dart' show ReservationErrors;
import 'reservation_list.dart';

/// The receptionist's home: the shift's eight numbers, then the queues the
/// desk actually works — the arrival queue, today's departures, the key-card
/// drawer, and who is in house.
///
/// The board comes from one `GET /desk/today`, so the counts and the lists can
/// never disagree with each other. Check-in is one tap ONLY once a room is
/// assigned — a check-in button that would just bounce off the server is not
/// offered.
class ReceptionDashboardScreen extends ConsumerStatefulWidget {
  const ReceptionDashboardScreen({super.key});

  @override
  ConsumerState<ReceptionDashboardScreen> createState() =>
      _ReceptionDashboardScreenState();
}

class _ReceptionDashboardScreenState
    extends ConsumerState<ReceptionDashboardScreen> {
  bool _busy = false;

  // -------------------------------------------------------------- actions --

  Future<bool> _confirm(
    String title,
    String message,
    String confirmLabel,
  ) async {
    final ok = await showDialog<bool>(
      context: context,
      builder: (dialogContext) => AlertDialog(
        title: Text(title),
        content: Text(message),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(dialogContext, false),
            child: const Text('Cancel'),
          ),
          FilledButton(
            onPressed: () => Navigator.pop(dialogContext, true),
            child: Text(confirmLabel),
          ),
        ],
      ),
    );
    return ok == true;
  }

  Future<void> _run(Future<void> Function() op) async {
    if (_busy) return;
    final messenger = ScaffoldMessenger.of(context);
    setState(() => _busy = true);
    try {
      await op();
    } on ApiException catch (e) {
      messenger.showSnackBar(
        SnackBar(content: Text(ReservationErrors.friendly(e))),
      );
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _checkIn(Reservation r) async {
    final ok = await _confirm(
      'Check in?',
      '${r.guestName} → room ${r.roomNumber}.',
      'Check in',
    );
    if (!ok || !mounted) return;
    final messenger = ScaffoldMessenger.of(context);
    await _run(() async {
      await ref.read(reservationActionsProvider).checkIn(r.id);
      messenger.showSnackBar(
        SnackBar(
          content: Text('${r.guestName} checked in to room ${r.roomNumber}'),
        ),
      );
    });
  }

  Future<void> _checkOut(Reservation r) async {
    final ok = await _confirm(
      'Check out?',
      '${r.guestName} (room ${r.roomNumber ?? '—'}) — the folio is settled.',
      'Check out',
    );
    if (!ok || !mounted) return;
    final messenger = ScaffoldMessenger.of(context);
    await _run(() async {
      await ref.read(reservationActionsProvider).checkOut(r.id);
      messenger.showSnackBar(
        SnackBar(content: Text('${r.guestName} checked out')),
      );
    });
  }

  Future<void> _issueCard(DeskBoard board) async {
    // A card only makes sense against a stay that is here or arriving —
    // exactly the two lists the board already holds.
    final eligible = [...board.inHouse, ...board.arrivals]
        .where(
          (r) =>
              r.status == ReservationStatus.checkedIn ||
              r.status == ReservationStatus.confirmed,
        )
        .toList(growable: false);
    if (eligible.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Nobody to issue a card to right now.')),
      );
      return;
    }

    final chosen = await showModalBottomSheet<Reservation>(
      context: context,
      showDragHandle: true,
      builder: (sheetContext) {
        final c = sheetContext.colors;
        return SafeArea(
          child: ListView(
            shrinkWrap: true,
            padding: const EdgeInsets.fromLTRB(Sp.sm, 0, Sp.sm, Sp.lg),
            children: [
              Padding(
                padding: const EdgeInsets.fromLTRB(Sp.md, 0, Sp.md, Sp.sm),
                child: Text(
                  'Issue a key card',
                  style: AppTypography.display(size: 16, color: c.foreground),
                ),
              ),
              for (final r in eligible)
                ListTile(
                  leading: Icon(
                    Icons.key_outlined,
                    size: 20,
                    color: c.mutedForeground,
                  ),
                  title: Text(r.guestName),
                  subtitle: Text(
                    r.roomNumber != null
                        ? 'Room ${r.roomNumber} · ${r.status.label}'
                        : r.status.label,
                  ),
                  onTap: () => Navigator.pop(sheetContext, r),
                ),
            ],
          ),
        );
      },
    );
    if (chosen == null || !mounted) return;

    final messenger = ScaffoldMessenger.of(context);
    await _run(() async {
      final card = await ref.read(keyCardsRepositoryProvider).issue(chosen.id);
      ref.invalidate(keyCardsProvider);
      messenger.showSnackBar(
        SnackBar(
          content: Text('${card.cardNumber} issued to ${chosen.guestName}'),
        ),
      );
    });
  }

  Future<void> _cardAction(KeyCard card, String action) async {
    final messenger = ScaffoldMessenger.of(context);
    switch (action) {
      case 'replace':
        final ok = await _confirm(
          'Replace card?',
          '${card.cardNumber} stops working and a new card is issued for the '
              'same stay.',
          'Replace',
        );
        if (!ok || !mounted) return;
        await _run(() async {
          final fresh = await ref
              .read(keyCardsRepositoryProvider)
              .replace(card.id);
          ref.invalidate(keyCardsProvider);
          messenger.showSnackBar(
            SnackBar(content: Text('Replaced with ${fresh.cardNumber}')),
          );
        });
      case 'deactivate':
      case 'lost':
        final lost = action == 'lost';
        final ok = await _confirm(
          lost ? 'Mark lost?' : 'Deactivate card?',
          '${card.cardNumber} stops opening the room immediately.',
          lost ? 'Mark lost' : 'Deactivate',
        );
        if (!ok || !mounted) return;
        await _run(() async {
          await ref
              .read(keyCardsRepositoryProvider)
              .deactivate(card.id, lost: lost);
          ref.invalidate(keyCardsProvider);
          messenger.showSnackBar(
            SnackBar(
              content: Text(
                '${card.cardNumber} ${lost ? 'marked lost' : 'deactivated'}',
              ),
            ),
          );
        });
    }
  }

  // ---------------------------------------------------------------- build --

  @override
  Widget build(BuildContext context) {
    final session = ref.watch(sessionProvider);
    final board = ref.watch(deskTodayProvider);

    return PageBody(
      onRefresh: () async {
        ref.invalidate(deskTodayProvider);
        ref.invalidate(keyCardsProvider);
      },
      children: [
        PageHeader(
          eyebrow: [
            'Front office',
            session?.hotel?.name,
          ].where((s) => s != null && s.isNotEmpty).join(' · '),
          title: 'Front desk',
          subtitle: Fmt.fullDate(DateTime.now()),
          actions: [
            PermissionGate(
              permission: P.reservationCreate,
              child: OutlinedButton.icon(
                onPressed: () => context.go(Routes.reservationNew),
                icon: const Icon(Icons.person_add_alt_outlined, size: 16),
                label: const Text('Walk-in'),
              ),
            ),
            PermissionGate(
              permission: P.reservationRead,
              child: OutlinedButton.icon(
                onPressed: () => context.go(Routes.reservationCalendar),
                icon: const Icon(Icons.calendar_month_outlined, size: 16),
                label: const Text('Calendar'),
              ),
            ),
            PermissionGate(
              permission: P.reservationRead,
              child: FilledButton.icon(
                onPressed: () => context.go(Routes.reservations),
                icon: const Icon(Icons.event_note_outlined, size: 16),
                label: const Text('Bookings'),
              ),
            ),
          ],
        ),
        gapSection,
        if (_busy) ...[const LinearProgressIndicator(minHeight: 2), gapSm],
        board.when(
          loading: () => const KpiSkeleton(count: 8),
          error: (e, _) => ErrorState(
            error: e,
            onRetry: () => ref.invalidate(deskTodayProvider),
          ),
          data: (data) => data == null
              ? const EmptyState(
                  title: 'The desk board is not available yet',
                  hint:
                      'The reservations service has not been switched on for '
                      'this property.',
                  icon: Icons.insights_outlined,
                )
              : _board(context, data),
        ),
      ],
    );
  }

  Widget _board(BuildContext context, DeskBoard board) {
    final counts = board.counts;
    final unassignedArrivals = board.arrivals
        .where((r) => r.roomId == null || r.roomId!.isEmpty)
        .length;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        KpiGrid(
          children: [
            KpiCard(
              label: 'Arrivals',
              value: Fmt.count(counts.arrivals),
              hint: unassignedArrivals > 0
                  ? '$unassignedArrivals not yet assigned'
                  : 'still to check in',
            ),
            KpiCard(
              label: 'Departures',
              value: Fmt.count(counts.departures),
              hint: 'due out today',
            ),
            KpiCard(
              label: 'In-house',
              value: Fmt.count(counts.inHouse),
              hint: 'staying tonight',
            ),
            KpiCard(
              label: 'Walk-ins',
              value: Fmt.count(counts.walkInsToday),
              hint: 'today',
            ),
            KpiCard(
              label: 'Available',
              value: Fmt.count(counts.availableRooms),
              hint: 'ready to sell',
            ),
            KpiCard(
              label: 'Dirty',
              value: Fmt.count(counts.roomsDirty),
              hint: 'with housekeeping',
            ),
            KpiCard(
              label: 'Ready',
              value: Fmt.count(counts.roomsReady),
              hint: 'inspected',
            ),
            KpiCard(
              label: 'Pending payment',
              value: Fmt.money(counts.pendingPaymentPaise / 100, compact: true),
              hint:
                  '${counts.pendingFolios} '
                  '${counts.pendingFolios == 1 ? 'folio' : 'folios'}',
            ),
          ],
        ),

        gapSection,
        _arrivalQueue(context, board),

        gapSection,
        _departures(context, board),

        gapSection,
        _keyCards(context, board),

        gapSection,
        const SectionHeader(title: 'In house', icon: Icons.hotel_outlined),
        ReservationList(
          reservations: board.inHouse,
          emptyTitle: 'The hotel is empty tonight',
          emptyHint: 'Guests appear here from the moment they are checked in.',
        ),
      ],
    );
  }

  // ---------------------------------------------------------- arrival queue --

  Widget _arrivalQueue(BuildContext context, DeskBoard board) {
    final c = context.colors;
    return SoftCard(
      padding: EdgeInsets.zero,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          _cardHeader(
            c,
            title: 'Arrival queue',
            subtitle: 'One-tap check-in once a room is assigned',
            icon: Icons.flight_land_outlined,
          ),
          if (board.arrivals.isEmpty)
            _cardEmpty(
              c,
              'Nobody left to check in — every arrival is in house.',
            )
          else
            for (final r in board.arrivals) _arrivalRow(context, r),
        ],
      ),
    );
  }

  Widget _arrivalRow(BuildContext context, Reservation r) {
    final c = context.colors;
    final hasRoom = r.roomId != null && r.roomId!.isNotEmpty;
    final due = r.balancePaise;

    return InkWell(
      onTap: () => context.go(Routes.reservation(r.id)),
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: Sp.lg, vertical: Sp.md),
        decoration: BoxDecoration(
          border: Border(
            top: BorderSide(color: c.border.withValues(alpha: 0.7)),
          ),
        ),
        child: Row(
          children: [
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    r.guestName,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: AppTypography.body(
                      size: 13.5,
                      weight: FontWeight.w600,
                      color: c.foreground,
                    ),
                  ),
                  const SizedBox(height: 2),
                  Text(
                    [
                      if (r.roomTypeName != null) r.roomTypeName!,
                      r.nightsLabel,
                      r.source.label,
                    ].join(' · '),
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: AppTypography.body(
                      size: 11,
                      color: c.mutedForeground,
                    ),
                  ),
                ],
              ),
            ),
            if (due > 0) ...[
              _chip(
                c,
                label: '${formatPaiseCompact(due)} due',
                tone: c.warning,
                filled: true,
              ),
              const SizedBox(width: Sp.sm),
            ],
            if (hasRoom) ...[
              _chip(c, label: 'Room ${r.roomNumber}', tone: c.healthy),
              const SizedBox(width: Sp.sm),
              PermissionGate(
                permission: P.checkInPerform,
                child: SizedBox(
                  height: 32,
                  child: FilledButton(
                    onPressed: _busy ? null : () => _checkIn(r),
                    child: const Text('Check in'),
                  ),
                ),
              ),
            ] else
              SizedBox(
                height: 32,
                child: OutlinedButton(
                  onPressed: () => context.go(Routes.reservation(r.id)),
                  child: const Text('Assign room'),
                ),
              ),
          ],
        ),
      ),
    );
  }

  // ------------------------------------------------------------- departures --

  Widget _departures(BuildContext context, DeskBoard board) {
    final c = context.colors;
    return SoftCard(
      padding: EdgeInsets.zero,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          _cardHeader(
            c,
            title: 'Departures',
            subtitle: 'Settle the folio, release the room, collect the keys',
            icon: Icons.flight_takeoff_outlined,
          ),
          if (board.departures.isEmpty)
            _cardEmpty(c, 'No departures today — nobody in house is due out.')
          else
            for (final r in board.departures) _departureRow(context, r),
        ],
      ),
    );
  }

  Widget _departureRow(BuildContext context, Reservation r) {
    final c = context.colors;
    final balance = r.balancePaise;
    final settled = balance <= 0;

    return InkWell(
      onTap: () => context.go(Routes.reservation(r.id)),
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: Sp.lg, vertical: Sp.md),
        decoration: BoxDecoration(
          border: Border(
            top: BorderSide(color: c.border.withValues(alpha: 0.7)),
          ),
        ),
        child: Row(
          children: [
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    r.guestName,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: AppTypography.body(
                      size: 13.5,
                      weight: FontWeight.w600,
                      color: c.foreground,
                    ),
                  ),
                  const SizedBox(height: 2),
                  Text(
                    [
                      if (r.roomNumber != null) 'Room ${r.roomNumber}',
                      settled
                          ? 'settled'
                          : '${formatPaiseCompact(balance)} outstanding',
                    ].join(' · '),
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: AppTypography.body(
                      size: 11,
                      color: settled ? c.mutedForeground : c.warning,
                    ),
                  ),
                ],
              ),
            ),
            SizedBox(
              height: 32,
              child: settled
                  ? FilledButton.icon(
                      onPressed: _busy ? null : () => _checkOut(r),
                      icon: const Icon(Icons.logout, size: 14),
                      label: const Text('Check out'),
                    )
                  : OutlinedButton(
                      onPressed: () => context.go(Routes.reservation(r.id)),
                      child: const Text('Settle'),
                    ),
            ),
          ],
        ),
      ),
    );
  }

  // -------------------------------------------------------------- key cards --

  Widget _keyCards(BuildContext context, DeskBoard board) {
    final c = context.colors;
    final cards = ref.watch(keyCardsProvider);

    return PermissionGate(
      permission: P.keyCardIssue,
      child: SoftCard(
        padding: EdgeInsets.zero,
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Padding(
              padding: const EdgeInsets.fromLTRB(Sp.lg, Sp.md, Sp.md, Sp.sm),
              child: Row(
                children: [
                  Icon(Icons.key_outlined, size: 17, color: c.mutedForeground),
                  const SizedBox(width: Sp.sm),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          'Key cards',
                          style: AppTypography.body(
                            size: 14,
                            weight: FontWeight.w600,
                            color: c.foreground,
                          ),
                        ),
                        Text(
                          'Issue, replace or deactivate — every action is audited',
                          style: AppTypography.body(
                            size: 11,
                            color: c.mutedForeground,
                          ),
                        ),
                      ],
                    ),
                  ),
                  SizedBox(
                    height: 32,
                    child: OutlinedButton.icon(
                      onPressed: _busy ? null : () => _issueCard(board),
                      icon: const Icon(Icons.add, size: 15),
                      label: const Text('Issue'),
                    ),
                  ),
                ],
              ),
            ),
            cards.when(
              loading: () => const Padding(
                padding: EdgeInsets.all(Sp.lg),
                child: Center(child: CircularProgressIndicator(strokeWidth: 2)),
              ),
              error: (e, _) => _cardEmpty(
                c,
                'Key cards are unavailable right now — pull to refresh.',
              ),
              data: (items) => items.isEmpty
                  ? _cardEmpty(
                      c,
                      'No cards issued yet. Issue one against a stay.',
                    )
                  : Column(
                      children: [
                        for (final card in items) _keyCardRow(context, card),
                      ],
                    ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _keyCardRow(BuildContext context, KeyCard card) {
    final c = context.colors;
    final tone = card.status.tone.color(c);
    final detail = [
      if (card.guestName != null) card.guestName!,
      if (card.issuedAt != null) 'issued ${Fmt.time(card.issuedAt)}',
      if (card.expiresAt != null)
        card.status == KeyCardStatus.expired
            ? 'expired ${Fmt.dayMonth(card.expiresAt)}'
            : 'expires ${Fmt.dayMonth(card.expiresAt)} ${Fmt.time(card.expiresAt)}',
    ].join(' · ');

    return Container(
      padding: const EdgeInsets.fromLTRB(Sp.lg, Sp.sm, Sp.sm, Sp.sm),
      decoration: BoxDecoration(
        border: Border(top: BorderSide(color: c.border.withValues(alpha: 0.7))),
      ),
      child: Row(
        children: [
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  card.roomNumber != null
                      ? '${card.cardNumber} · Room ${card.roomNumber}'
                      : card.cardNumber,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: AppTypography.body(
                    size: 12.5,
                    weight: FontWeight.w600,
                    color: c.foreground,
                  ),
                ),
                if (detail.isNotEmpty)
                  Text(
                    detail,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: AppTypography.body(
                      size: 10.5,
                      color: c.mutedForeground,
                    ),
                  ),
              ],
            ),
          ),
          _chip(c, label: card.status.label, tone: tone),
          if (card.status.isActive)
            PopupMenuButton<String>(
              tooltip: 'Card actions',
              icon: Icon(Icons.more_vert, size: 18, color: c.mutedForeground),
              onSelected: (a) => _cardAction(card, a),
              itemBuilder: (_) => const [
                PopupMenuItem(value: 'replace', child: Text('Replace')),
                PopupMenuItem(value: 'deactivate', child: Text('Deactivate')),
                PopupMenuItem(value: 'lost', child: Text('Mark lost')),
              ],
            )
          else
            const SizedBox(width: Sp.sm),
        ],
      ),
    );
  }

  // ------------------------------------------------------------ small bits --

  Widget _cardHeader(
    AppColors c, {
    required String title,
    required String subtitle,
    required IconData icon,
  }) => Padding(
    padding: const EdgeInsets.fromLTRB(Sp.lg, Sp.md, Sp.lg, Sp.sm),
    child: Row(
      children: [
        Icon(icon, size: 17, color: c.mutedForeground),
        const SizedBox(width: Sp.sm),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                title,
                style: AppTypography.body(
                  size: 14,
                  weight: FontWeight.w600,
                  color: c.foreground,
                ),
              ),
              Text(
                subtitle,
                style: AppTypography.body(size: 11, color: c.mutedForeground),
              ),
            ],
          ),
        ),
      ],
    ),
  );

  Widget _cardEmpty(AppColors c, String message) => Container(
    padding: const EdgeInsets.fromLTRB(Sp.lg, Sp.md, Sp.lg, Sp.lg),
    alignment: Alignment.centerLeft,
    child: Text(
      message,
      style: AppTypography.body(size: 12, color: c.mutedForeground),
    ),
  );

  Widget _chip(
    AppColors c, {
    required String label,
    required Color tone,
    bool filled = false,
  }) => Container(
    padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
    decoration: BoxDecoration(
      color: filled ? tone.withValues(alpha: 0.12) : null,
      borderRadius: R.rPill,
      border: Border.all(color: tone.withValues(alpha: 0.45)),
    ),
    child: Text(
      label,
      style: AppTypography.body(
        size: 10.5,
        weight: FontWeight.w600,
        color: tone,
      ),
    ),
  );
}

/// "₹18,400" from paise, compact enough for a chip.
String formatPaiseCompact(int paise) => Fmt.money(paise / 100);
