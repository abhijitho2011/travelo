import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/networking/api_exception.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/theme/app_typography.dart';
import '../../../core/utils/formatting.dart';
import '../../../core/widgets/primitives.dart';
import '../../../core/widgets/states.dart';
import '../../../core/widgets/status_badge.dart';
import '../../travel_desk/data/transport_models.dart';
import '../application/driver_controllers.dart';

/// A single trip the driver drives through its steps: accept → on the way →
/// arrived → picked up → completed. Each button maps to the request's state
/// machine on the server.
class DriverTripScreen extends ConsumerWidget {
  const DriverTripScreen({super.key, required this.tripId});

  final String tripId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final trip = ref.watch(myTripProvider(tripId));
    return Scaffold(
      appBar: AppBar(title: const Text('Trip')),
      body: trip.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (e, _) => ErrorState(
          error: e,
          onRetry: () => ref.invalidate(myTripProvider(tripId)),
        ),
        data: (t) => t == null
            ? const EmptyState(
                title: 'Trip not found',
                hint: 'It may have been reassigned or cancelled.',
                icon: Icons.help_outline,
              )
            : _TripDetail(trip: t),
      ),
    );
  }
}

class _TripDetail extends ConsumerStatefulWidget {
  const _TripDetail({required this.trip});
  final TransportRequest trip;

  @override
  ConsumerState<_TripDetail> createState() => _TripDetailState();
}

class _TripDetailState extends ConsumerState<_TripDetail> {
  bool _busy = false;

  Future<void> _step(DriverStep step) async {
    setState(() => _busy = true);
    final messenger = ScaffoldMessenger.of(context);
    try {
      await ref.read(driverActionsProvider).step(widget.trip.id, step);
    } on ApiException catch (e) {
      messenger.showSnackBar(SnackBar(content: Text(e.message)));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    final t = widget.trip;
    final next = t.nextDriverStep;
    final route = [
      t.fromLocation,
      t.toLocation,
    ].where((s) => s != null && s.isNotEmpty).join('\n→ ');

    return PageBody(
      children: [
        Row(
          children: [
            Expanded(
              child: Text(
                t.guestName,
                style: AppTypography.display(size: 22, color: c.foreground),
              ),
            ),
            StatusBadge(tone: t.status.tone, label: t.status.label),
          ],
        ),
        gapMd,
        Panel(
          title: 'Trip',
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              _row(context, 'Type', t.type.label),
              _row(context, 'Pickup', Fmt.dateTime(t.pickupAt)),
              if (route.isNotEmpty) _row(context, 'Route', route),
              if (t.vehicleName != null)
                _row(context, 'Vehicle', t.vehicleName!),
              _row(context, 'Fare', t.fareLabel),
              if (t.note != null) _row(context, 'Note', t.note!),
              _row(context, 'Progress', t.driverStage?.label ?? '—'),
            ],
          ),
        ),
        gapSection,
        if (next != null)
          FilledButton.icon(
            onPressed: _busy ? null : () => _step(next),
            icon: _busy
                ? const SizedBox(
                    height: 16,
                    width: 16,
                    child: CircularProgressIndicator(strokeWidth: 2),
                  )
                : const Icon(Icons.arrow_forward),
            label: Text(next.label),
          )
        else
          const EmptyState(
            title: 'Trip closed',
            hint: 'This trip is completed or cancelled.',
            icon: Icons.check_circle_outline,
          ),
      ],
    );
  }

  Widget _row(BuildContext context, String label, String value) {
    final c = context.colors;
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 5),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          SizedBox(
            width: 84,
            child: Text(
              label,
              style: AppTypography.body(size: 12.5, color: c.mutedForeground),
            ),
          ),
          Expanded(
            child: Text(
              value,
              style: AppTypography.body(size: 13.5, color: c.foreground),
            ),
          ),
        ],
      ),
    );
  }
}
