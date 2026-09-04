import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/intl.dart';

import '../../../core/routing/routes.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/theme/app_spacing.dart';
import '../../../core/theme/app_typography.dart';
import '../../../core/widgets/primitives.dart';
import '../../../core/widgets/states.dart';
import '../../rooms/data/room_models.dart';
import '../../rooms/data/unit_models.dart';
import '../application/channels_controllers.dart';

final _dt = DateFormat('d MMM HH:mm');

/// **Channels** — Channex connections and per-room-type mapping.
/// A missing mapping is a silent revenue leak: OTA rooms show but never sell.
class ChannelsScreen extends ConsumerWidget {
  const ChannelsScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final c = context.colors;
    final connections = ref.watch(channelConnectionsProvider);
    final matrix = ref.watch(channelMatrixProvider);
    return PageBody(
      onRefresh: () async {
        ref.invalidate(channelConnectionsProvider);
        ref.invalidate(channelMatrixProvider);
      },
      children: [
        const PageHeader(eyebrow: 'Distribution', title: 'Channels'),
        gapSection,
        connections.when(
          loading: () => const ListSkeleton(rows: 2),
          error: (e, _) => ErrorState(
            error: e,
            onRetry: () => ref.invalidate(channelConnectionsProvider),
          ),
          data: (rows) => rows.isEmpty
              ? const EmptyState(
                  title: 'No channel manager connected',
                  hint:
                      'A Tavelo admin connects your OTAs (Booking.com, MakeMyTrip and so on) once per property.',
                  icon: Icons.hub_outlined,
                )
              : Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    for (final r in rows) ...[_ConnectionCard(row: r), gapMd],
                  ],
                ),
        ),
        gapSection,
        Text(
          'Room-type mapping',
          style: AppTypography.labelXs(c.mutedForeground),
        ),
        const SizedBox(height: 6),
        matrix.when(
          loading: () => const ListSkeleton(rows: 3),
          error: (e, _) => ErrorState(
            error: e,
            onRetry: () => ref.invalidate(channelMatrixProvider),
          ),
          data: (rows) => rows.isEmpty
              ? const EmptyState(
                  title: 'No room types yet',
                  hint: 'Add a room from Configuration → Add room.',
                  icon: Icons.meeting_room_outlined,
                )
              : Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    for (final row in rows) ...[_MatrixRow(row: row), gapMd],
                  ],
                ),
        ),
        gapSection,
      ],
    );
  }
}

class _ConnectionCard extends StatelessWidget {
  const _ConnectionCard({required this.row});
  final ChannelConnection row;

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    final ok = row.connected;
    return SoftCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Icon(
                ok ? Icons.check_circle : Icons.error_outline,
                color: ok
                    ? c.primary
                    : (row.status.toUpperCase() == 'ERROR'
                          ? c.destructive
                          : c.warning),
                size: 20,
              ),
              const SizedBox(width: Sp.sm),
              Expanded(
                child: Text(
                  row.providerLabel,
                  style: AppTypography.display(size: 16, color: c.foreground),
                ),
              ),
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                decoration: BoxDecoration(
                  color: ok
                      ? c.primary.withValues(alpha: 0.12)
                      : c.warning.withValues(alpha: 0.14),
                  borderRadius: R.rPill,
                ),
                child: Text(
                  row.statusLabel,
                  style: AppTypography.body(
                    size: 11,
                    weight: FontWeight.w700,
                    color: ok ? c.primary : c.warning,
                  ),
                ),
              ),
            ],
          ),
          const SizedBox(height: Sp.sm),
          Wrap(
            spacing: Sp.md,
            runSpacing: 4,
            children: [
              if (row.channelPropertyId != null)
                _Meta(label: 'Property id', value: row.channelPropertyId!),
              _Meta(
                label: 'Last sync',
                value: row.lastSyncAt == null
                    ? '—'
                    : _dt.format(row.lastSyncAt!.toLocal()),
              ),
              if (row.lastFailureAt != null)
                _Meta(
                  label: 'Last failure',
                  value: _dt.format(row.lastFailureAt!.toLocal()),
                  warn: true,
                ),
              if (row.errorCount > 0)
                _Meta(label: 'Errors', value: '${row.errorCount}', warn: true),
            ],
          ),
          if (row.detail != null && row.detail!.isNotEmpty) ...[
            const SizedBox(height: Sp.sm),
            Text(
              row.detail!,
              style: AppTypography.body(size: 11.5, color: c.mutedForeground),
            ),
          ],
        ],
      ),
    );
  }
}

class _Meta extends StatelessWidget {
  const _Meta({required this.label, required this.value, this.warn = false});
  final String label;
  final String value;
  final bool warn;
  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        Text(
          '$label ',
          style: AppTypography.body(size: 11, color: c.mutedForeground),
        ),
        Text(
          value,
          style: AppTypography.body(
            size: 11.5,
            weight: FontWeight.w600,
            color: warn ? c.warning : c.foreground,
          ),
        ),
      ],
    );
  }
}

class _MatrixRow extends StatelessWidget {
  const _MatrixRow({required this.row});
  final ({RoomType type, List<ChannelMapping> mappings}) row;

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    return SoftCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Expanded(
                child: Text(
                  row.type.name,
                  style: AppTypography.body(
                    size: 14,
                    weight: FontWeight.w600,
                    color: c.foreground,
                  ),
                ),
              ),
              TextButton(
                onPressed: () => context.go(Routes.roomTypes),
                child: const Text('Map'),
              ),
            ],
          ),
          const SizedBox(height: Sp.sm),
          if (row.mappings.isEmpty)
            Text(
              'No channel connections yet',
              style: AppTypography.body(size: 11.5, color: c.mutedForeground),
            )
          else
            Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                for (final m in row.mappings) ...[
                  Row(
                    children: [
                      Icon(
                        m.mapped ? Icons.link : Icons.link_off_outlined,
                        size: 16,
                        color: m.mapped ? c.primary : c.mutedForeground,
                      ),
                      const SizedBox(width: Sp.sm),
                      Expanded(child: Text(m.providerLabel)),
                      Text(
                        m.mapped
                            ? (m.channelRoomTypeId ?? 'Mapped')
                            : 'Not mapped',
                        style: AppTypography.body(
                          size: 11.5,
                          weight: FontWeight.w600,
                          color: m.mapped ? c.primary : c.warning,
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 4),
                ],
              ],
            ),
        ],
      ),
    );
  }
}
