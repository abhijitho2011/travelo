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
import '../../../core/widgets/primitives.dart';
import '../../../core/widgets/states.dart';
import '../../property_settings/application/property_settings_controllers.dart';
import '../../rooms/application/rooms_controllers.dart';
import '../../rooms/application/units_controllers.dart';
import '../../rooms/data/room_models.dart';

/// **Revenue manager** — per-room-type pricing rules with preview and apply.
class RevenueScreen extends ConsumerStatefulWidget {
  const RevenueScreen({super.key});
  @override
  ConsumerState<RevenueScreen> createState() => _RevenueState();
}

class _RevenueState extends ConsumerState<RevenueScreen> {
  String? _selectedTypeId;

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    final types = ref.watch(roomTypesProvider);
    final settings = ref.watch(propertySettingsProvider);
    return PageBody(
      onRefresh: () async {
        ref.invalidate(roomTypesProvider);
        ref.invalidate(propertySettingsProvider);
        if (_selectedTypeId != null) {
          ref.invalidate(pricingRulesProvider(_selectedTypeId!));
        }
      },
      children: [
        const PageHeader(eyebrow: 'Distribution', title: 'Revenue manager'),
        gapMd,
        SoftCard(
          child: Row(
            children: [
              Icon(Icons.auto_graph, color: c.mutedForeground, size: 18),
              const SizedBox(width: Sp.sm),
              Expanded(
                child: Text(
                  'Rules watch occupancy, lead time and day-of-week and lift or drop '
                  'nightly rates automatically. Preview first, then apply.',
                  style: AppTypography.body(size: 12, color: c.mutedForeground),
                ),
              ),
              TextButton(
                onPressed: () => context.go(Routes.rates),
                child: const Text('Rates grid'),
              ),
            ],
          ),
        ),
        gapMd,
        settings.maybeWhen(
          data: (s) => KpiGrid(
            children: [
              KpiCard(
                label: 'Price floor',
                value: s.minRoomPricePaise == null
                    ? 'None'
                    : formatPaise(s.minRoomPricePaise!),
                hint: 'Rules never drop below this',
              ),
              KpiCard(
                label: 'Room types',
                value: types.valueOrNull == null
                    ? '—'
                    : '${types.valueOrNull!.length}',
              ),
            ],
          ),
          orElse: () => const SizedBox.shrink(),
        ),
        gapSection,
        types.when(
          loading: () => const ListSkeleton(rows: 3),
          error: (e, _) => ErrorState(
            error: e,
            onRetry: () => ref.invalidate(roomTypesProvider),
          ),
          data: (rows) {
            if (rows.isEmpty) {
              return const EmptyState(
                title: 'No room types yet',
                hint: 'Add a room from Configuration → Add room first.',
                icon: Icons.meeting_room_outlined,
              );
            }
            _selectedTypeId ??= rows.first.id;
            final selected = rows.firstWhere(
              (t) => t.id == _selectedTypeId,
              orElse: () => rows.first,
            );
            return Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                DropdownButtonFormField<String>(
                  initialValue: selected.id,
                  decoration: const InputDecoration(labelText: 'Room type'),
                  items: [
                    for (final t in rows)
                      DropdownMenuItem(value: t.id, child: Text(t.name)),
                  ],
                  onChanged: (v) => setState(() => _selectedTypeId = v),
                ),
                gapMd,
                _RulesPanel(
                  roomTypeId: selected.id,
                  roomTypeName: selected.name,
                ),
              ],
            );
          },
        ),
        gapSection,
      ],
    );
  }
}

class _RulesPanel extends ConsumerWidget {
  const _RulesPanel({required this.roomTypeId, required this.roomTypeName});
  final String roomTypeId;
  final String roomTypeName;

  Future<void> _run(BuildContext context, WidgetRef ref, bool dryRun) async {
    final messenger = ScaffoldMessenger.of(context);
    try {
      final r = await ref
          .read(unitsActionsProvider)
          .runRules(roomTypeId, dryRun: dryRun);
      final priced = r['daysPriced'] ?? 0;
      final reverted = r['daysReverted'] ?? 0;
      messenger.showSnackBar(
        SnackBar(
          content: Text(
            dryRun
                ? 'Preview: would price $priced day(s), revert $reverted'
                : 'Priced $priced day(s), reverted $reverted',
          ),
        ),
      );
    } on ApiException catch (e) {
      messenger.showSnackBar(SnackBar(content: Text(e.message)));
    }
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final c = context.colors;
    final rules = ref.watch(pricingRulesProvider(roomTypeId));
    return SoftCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(
            children: [
              Expanded(
                child: Text(
                  'Rules for $roomTypeName',
                  style: AppTypography.body(
                    size: 14,
                    weight: FontWeight.w600,
                    color: c.foreground,
                  ),
                ),
              ),
              PermissionGate(
                permission: P.ratesUpdate,
                child: Wrap(
                  spacing: Sp.sm,
                  children: [
                    OutlinedButton.icon(
                      onPressed: () => _run(context, ref, true),
                      icon: const Icon(Icons.remove_red_eye_outlined, size: 16),
                      label: const Text('Preview'),
                    ),
                    FilledButton.icon(
                      onPressed: () => _run(context, ref, false),
                      icon: const Icon(Icons.play_arrow, size: 16),
                      label: const Text('Apply now'),
                    ),
                  ],
                ),
              ),
            ],
          ),
          const SizedBox(height: Sp.md),
          rules.when(
            loading: () => const ListSkeleton(rows: 3),
            error: (e, _) => ErrorState(
              error: e,
              onRetry: () => ref.invalidate(pricingRulesProvider(roomTypeId)),
            ),
            data: (list) => list.isEmpty
                ? const EmptyState(
                    title: 'No rules yet',
                    hint:
                        'Rules live inside each room type — open a room to add one.',
                    icon: Icons.auto_awesome_outlined,
                  )
                : Column(
                    children: [
                      for (final r in list)
                        ListTile(
                          contentPadding: EdgeInsets.zero,
                          leading: Icon(
                            r.adjustmentValue >= 0
                                ? Icons.trending_up
                                : Icons.trending_down,
                            color: r.adjustmentValue >= 0
                                ? c.primary
                                : c.warning,
                          ),
                          title: Text(r.displayName),
                          subtitle: Text(
                            '${r.conditionLabel} — ${r.adjustmentLabel}',
                            style: AppTypography.body(
                              size: 11.5,
                              color: c.mutedForeground,
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
