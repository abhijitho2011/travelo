import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/networking/api_exception.dart';
import '../../../core/permissions/permission_keys.dart';
import '../../../core/providers.dart';
import '../../../core/routing/routes.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/theme/app_spacing.dart';
import '../../../core/theme/app_typography.dart';
import '../../../core/utils/formatting.dart';
import '../../../core/widgets/primitives.dart';
import '../../../core/widgets/states.dart';
import '../data/reception_models.dart';
import '../data/reception_repository.dart';

/// The guided digital check-in.
///
/// Eight steps, each one confirmed by the receptionist before the next opens.
/// The payment step is skipped automatically for anyone without
/// `payment.collect` — they simply cannot take money, so asking them to is
/// dishonest.
class CheckInScreen extends ConsumerStatefulWidget {
  const CheckInScreen({super.key, this.reservationId});

  final String? reservationId;

  @override
  ConsumerState<CheckInScreen> createState() => _CheckInScreenState();
}

class _CheckInScreenState extends ConsumerState<CheckInScreen> {
  int _index = 0;
  final Set<CheckInStep> _done = {};
  final _roomController = TextEditingController();
  bool _busy = false;
  String? _error;

  @override
  void dispose() {
    _roomController.dispose();
    super.dispose();
  }

  List<CheckInStep> get _steps {
    final canCollect = ref.read(permissionsProvider).has(P.paymentCollect);
    return CheckInStep.ordered
        .where((s) => s != CheckInStep.payment || canCollect)
        .toList();
  }

  Future<void> _advance(Reservation? reservation) async {
    final steps = _steps;
    final current = steps[_index];

    if (current == CheckInStep.complete) {
      await _finish(reservation);
      return;
    }

    setState(() {
      _done.add(current);
      _index = (_index + 1).clamp(0, steps.length - 1);
      _error = null;
    });
  }

  Future<void> _finish(Reservation? reservation) async {
    if (reservation == null) {
      setState(
        () => _error =
            'Pick a booking first — check-in needs a reservation to attach to.',
      );
      return;
    }
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      await ref
          .read(receptionRepositoryProvider)
          .checkIn(
            reservation.id,
            roomNumber: _roomController.text.trim().isEmpty
                ? null
                : _roomController.text.trim(),
          );
      ref.invalidate(reservationsProvider);
      ref.invalidate(deskSummaryProvider);
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('${reservation.guestName} checked in')),
      );
      context.go(Routes.reception);
    } on ApiException catch (e) {
      if (mounted) setState(() => _error = e.message);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    final steps = _steps;
    final current = steps[_index];

    final reservationAsync = widget.reservationId == null
        ? null
        : ref.watch(reservationProvider(widget.reservationId!));
    final reservation = reservationAsync?.value;

    return PageBody(
      children: [
        Align(
          alignment: Alignment.centerLeft,
          child: TextButton.icon(
            onPressed: () => context.go(Routes.reception),
            icon: const Icon(Icons.arrow_back, size: 16),
            label: const Text('Front desk'),
          ),
        ),
        PageHeader(
          eyebrow: 'Front office',
          title: 'Digital check-in',
          subtitle:
              'Step ${_index + 1} of ${steps.length} · ${current.title}',
        ),
        gapSection,

        if (widget.reservationId == null)
          const EmptyState(
            title: 'Choose a booking to check in',
            hint:
                'Open a booking from the arrival queue and tap “Check in”. '
                'The steps below then run against that reservation.',
            icon: Icons.event_note_outlined,
          )
        else if (reservationAsync!.isLoading)
          const ListSkeleton(rows: 1, height: 96)
        else if (reservation == null)
          const EmptyState(
            title: 'Booking not found',
            hint: 'The bookings service may not be live yet.',
            icon: Icons.search_off_outlined,
          )
        else
          _GuestHeader(reservation: reservation),

        gapMd,
        LinearProgressIndicator(
          value: (_index + (_done.contains(current) ? 1 : 0)) / steps.length,
          minHeight: 6,
          borderRadius: R.rPill,
        ),
        gapMd,

        for (var i = 0; i < steps.length; i++)
          Padding(
            padding: const EdgeInsets.only(bottom: Sp.sm),
            child: _StepTile(
              step: steps[i],
              index: i,
              state: i < _index
                  ? _StepState.done
                  : i == _index
                  ? _StepState.current
                  : _StepState.upcoming,
              child: i == _index ? _stepBody(steps[i], reservation) : null,
            ),
          ),

        if (_error != null) ...[
          gapMd,
          Container(
            padding: const EdgeInsets.symmetric(
              horizontal: Sp.md,
              vertical: 10,
            ),
            decoration: BoxDecoration(
              color: c.destructive.withValues(alpha: 0.1),
              borderRadius: R.rMd,
              border: Border.all(color: c.destructive.withValues(alpha: 0.3)),
            ),
            child: Row(
              children: [
                Icon(Icons.error_outline, size: 16, color: c.destructive),
                const SizedBox(width: Sp.sm),
                Expanded(
                  child: Text(
                    _error!,
                    style: AppTypography.body(
                      size: 12.5,
                      color: c.destructive,
                    ),
                  ),
                ),
              ],
            ),
          ),
        ],

        gapSection,
        Row(
          children: [
            Expanded(
              child: OutlinedButton(
                onPressed: _index == 0 || _busy
                    ? null
                    : () => setState(() {
                        _index--;
                        _done.remove(steps[_index]);
                      }),
                child: const Text('Back'),
              ),
            ),
            const SizedBox(width: Sp.sm),
            Expanded(
              flex: 2,
              child: FilledButton(
                onPressed: _busy ? null : () => _advance(reservation),
                child: _busy
                    ? const SizedBox(
                        width: 18,
                        height: 18,
                        child: CircularProgressIndicator(strokeWidth: 2),
                      )
                    : Text(
                        current == CheckInStep.complete
                            ? 'Confirm check-in'
                            : 'Continue',
                      ),
              ),
            ),
          ],
        ),
      ],
    );
  }

  Widget? _stepBody(CheckInStep step, Reservation? reservation) {
    final c = context.colors;
    return switch (step) {
      CheckInStep.room => Padding(
        padding: const EdgeInsets.only(top: Sp.md),
        child: TextField(
          controller: _roomController,
          decoration: InputDecoration(
            labelText: 'Room number',
            hintText: reservation?.roomNumber ?? 'e.g. 402',
            prefixIcon: const Icon(Icons.meeting_room_outlined, size: 20),
          ),
        ),
      ),
      CheckInStep.payment => Padding(
        padding: const EdgeInsets.only(top: Sp.md),
        child: Container(
          padding: const EdgeInsets.all(Sp.md),
          decoration: BoxDecoration(
            color: c.muted,
            borderRadius: R.rMd,
            border: Border.all(color: c.border),
          ),
          child: Row(
            children: [
              Icon(
                Icons.account_balance_wallet_outlined,
                size: 17,
                color: c.mutedForeground,
              ),
              const SizedBox(width: Sp.sm),
              Expanded(
                child: Text(
                  (reservation?.balance ?? 0) > 0
                      ? '${Fmt.money(reservation!.balance)} outstanding. Collect '
                            'or authorise before continuing.'
                      : 'Nothing outstanding on this booking.',
                  style: AppTypography.body(
                    size: 12.5,
                    color: c.mutedForeground,
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
      _ => null,
    };
  }
}

enum _StepState { done, current, upcoming }

class _StepTile extends StatelessWidget {
  const _StepTile({
    required this.step,
    required this.index,
    required this.state,
    this.child,
  });

  final CheckInStep step;
  final int index;
  final _StepState state;
  final Widget? child;

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    final isCurrent = state == _StepState.current;
    final isDone = state == _StepState.done;

    return AnimatedContainer(
      duration: const Duration(milliseconds: 180),
      padding: const EdgeInsets.all(Sp.md),
      decoration: BoxDecoration(
        color: isCurrent ? c.primary.withValues(alpha: 0.05) : c.card,
        borderRadius: R.rMd,
        border: Border.all(color: isCurrent ? c.primary : c.border),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Container(
                width: 22,
                height: 22,
                decoration: BoxDecoration(
                  color: isDone
                      ? c.healthy
                      : isCurrent
                      ? c.primary
                      : c.muted,
                  shape: BoxShape.circle,
                ),
                alignment: Alignment.center,
                child: isDone
                    ? Icon(Icons.check, size: 13, color: c.card)
                    : Text(
                        '${index + 1}',
                        style: AppTypography.numeric(
                          size: 11,
                          weight: FontWeight.w700,
                          color: isCurrent
                              ? c.primaryForeground
                              : c.mutedForeground,
                        ),
                      ),
              ),
              const SizedBox(width: Sp.md),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      step.title,
                      style: AppTypography.body(
                        size: 13.5,
                        weight: FontWeight.w600,
                        color: isDone ? c.mutedForeground : c.foreground,
                      ),
                    ),
                    Text(
                      isDone ? step.doneLabel : step.detail,
                      style: AppTypography.body(
                        size: 12,
                        color: c.mutedForeground,
                      ),
                    ),
                  ],
                ),
              ),
            ],
          ),
          if (child != null) child!,
        ],
      ),
    );
  }
}

class _GuestHeader extends StatelessWidget {
  const _GuestHeader({required this.reservation});

  final Reservation reservation;

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    final r = reservation;
    return SoftCard(
      child: Row(
        children: [
          CircleAvatar(
            radius: 20,
            backgroundColor: c.accent,
            child: Icon(
              Icons.person_outline,
              size: 20,
              color: c.accentForeground,
            ),
          ),
          const SizedBox(width: Sp.md),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  r.guestName,
                  style: AppTypography.body(
                    size: 15,
                    weight: FontWeight.w700,
                    color: c.foreground,
                  ),
                ),
                Text(
                  [
                    if (r.reference != null) r.reference!,
                    if (r.roomType != null) r.roomType!,
                    if (r.nights != null) '${r.nights} nights',
                  ].join(' · '),
                  style: AppTypography.numeric(
                    size: 12,
                    color: c.mutedForeground,
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
