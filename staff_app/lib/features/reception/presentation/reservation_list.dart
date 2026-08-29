import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/permissions/permission_gate.dart';
import '../../../core/permissions/permission_keys.dart';
import '../../../core/routing/routes.dart';
import '../../../core/theme/app_spacing.dart';
import '../../../core/utils/formatting.dart';
import '../../../core/widgets/cards.dart';
import '../../../core/widgets/states.dart';
import '../data/reception_models.dart';

/// Shared renderer for a list of bookings — used by the desk dashboard and by
/// the full bookings screen so the two never drift apart.
class ReservationList extends ConsumerWidget {
  const ReservationList({
    super.key,
    required this.reservations,
    this.emptyTitle = 'No bookings',
    this.emptyHint,
  });

  final List<Reservation> reservations;
  final String emptyTitle;
  final String? emptyHint;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    if (reservations.isEmpty) {
      return EmptyState(
        title: emptyTitle,
        hint: emptyHint,
        icon: Icons.event_note_outlined,
      );
    }

    return Column(
      children: [
        for (final r in reservations)
          Padding(
            padding: const EdgeInsets.only(bottom: Sp.md),
            child: ReservationCard(
              guestName: r.guestName,
              vip: r.vip,
              reference: r.reference,
              stay: _stayLine(r),
              statusLabel: r.status.label,
              statusTone: r.status.tone,
              roomLabel: r.roomAssigned ? 'Room ${r.roomNumber}' : 'No room',
              balanceLabel: (r.balance ?? 0) > 0
                  ? '${Fmt.money(r.balance)} due'
                  : null,
              onTap: () => context.go(Routes.reservation(r.id)),
              actions: _RowActions(reservation: r),
            ),
          ),
      ],
    );
  }

  static String _stayLine(Reservation r) {
    final parts = <String>[
      if (r.roomType != null) r.roomType!,
      if (r.nights != null) '${r.nights}N',
      if (r.checkIn != null) Fmt.dayMonth(r.checkIn),
      if (r.eta != null) 'ETA ${r.eta}',
      if (r.source != null) r.source!,
    ];
    return parts.isEmpty ? 'Booking' : parts.join(' · ');
  }
}

/// The per-row actions, each behind its own permission.
///
/// A receptionist holds `checkin.perform` and `checkout.perform` but **not**
/// `reservation.cancel` — so they get Check in / Check out, and the Cancel
/// button is simply not built. A GM, who holds all three, sees all three.
class _RowActions extends ConsumerWidget {
  const _RowActions({required this.reservation});

  final Reservation reservation;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final r = reservation;
    final buttons = <Widget>[
      if (r.status.canCheckIn)
        PermissionGate(
          permission: P.checkInPerform,
          child: FilledButton(
            onPressed: () => context.go('${Routes.checkIn}?reservationId=${r.id}'),
            child: const Text('Check in'),
          ),
        ),
      if (r.status.canCheckOut)
        PermissionGate(
          permission: P.checkOutPerform,
          child: FilledButton(
            onPressed: () => context.go(Routes.reservation(r.id)),
            child: const Text('Check out'),
          ),
        ),
      if (r.status.isOpen)
        PermissionGate(
          permission: P.reservationCancel,
          child: OutlinedButton(
            onPressed: () => context.go(Routes.reservation(r.id)),
            child: const Text('Cancel'),
          ),
        ),
      OutlinedButton(
        onPressed: () => context.go(Routes.reservation(r.id)),
        child: const Text('Details'),
      ),
    ];

    return Wrap(spacing: Sp.sm, runSpacing: Sp.sm, children: buttons);
  }
}
