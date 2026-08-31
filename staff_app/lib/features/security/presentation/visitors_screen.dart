import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/networking/api_exception.dart';
import '../../../core/permissions/permission_gate.dart';
import '../../../core/permissions/permission_keys.dart';
import '../../../core/utils/formatting.dart';
import '../../../core/widgets/cards.dart';
import '../../../core/widgets/primitives.dart';
import '../../../core/widgets/states.dart';
import '../../../core/widgets/status_badge.dart';
import '../data/security_models.dart';
import '../data/security_repository.dart';
import 'record_sheets.dart';

class VisitorsScreen extends ConsumerWidget {
  const VisitorsScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final async = ref.watch(visitorsProvider);

    return PageBody(
      onRefresh: () async => ref.invalidate(visitorsProvider),
      children: [
        PageHeader(
          eyebrow: 'Security',
          title: 'Visitors',
          subtitle: 'Everyone on site who is not staff or a guest.',
          actions: [
            PermissionGate(
              permission: P.visitorRecord,
              child: FilledButton.icon(
                onPressed: () async {
                  final saved = await SecuritySheets.visitor(context, ref);
                  if (saved == true) ref.invalidate(visitorsProvider);
                },
                icon: const Icon(Icons.person_add_alt, size: 17),
                label: const Text('Record visitor'),
              ),
            ),
          ],
        ),
        gapSection,
        async.when(
          loading: () => const ListSkeleton(rows: 4, height: 72),
          error: (e, _) => ErrorState(
            error: e,
            onRetry: () => ref.invalidate(visitorsProvider),
          ),
          data: (visitors) {
            if (visitors.isEmpty) {
              return const EmptyState(
                title: 'No visitors recorded',
                hint: 'Record an arrival and it will appear here.',
                icon: Icons.badge_outlined,
              );
            }
            final onSite = visitors.where((v) => v.onSite).toList();
            final gone = visitors.where((v) => !v.onSite).toList();
            return Column(
              children: [
                if (onSite.isNotEmpty)
                  Panel(
                    title: 'On site',
                    description: '${onSite.length} currently inside',
                    padBody: false,
                    child: Column(
                      children: [
                        for (var i = 0; i < onSite.length; i++) ...[
                          if (i > 0) const RowDivider(),
                          _VisitorRow(visitor: onSite[i]),
                        ],
                      ],
                    ),
                  ),
                if (gone.isNotEmpty) ...[
                  gapMd,
                  Panel(
                    title: 'Departed',
                    padBody: false,
                    child: Column(
                      children: [
                        for (var i = 0; i < gone.length; i++) ...[
                          if (i > 0) const RowDivider(),
                          _VisitorRow(visitor: gone[i]),
                        ],
                      ],
                    ),
                  ),
                ],
              ],
            );
          },
        ),
      ],
    );
  }
}

class _VisitorRow extends ConsumerStatefulWidget {
  const _VisitorRow({required this.visitor});

  final Visitor visitor;

  @override
  ConsumerState<_VisitorRow> createState() => _VisitorRowState();
}

class _VisitorRowState extends ConsumerState<_VisitorRow> {
  bool _busy = false;

  @override
  Widget build(BuildContext context) {
    final v = widget.visitor;
    return DataRow2(
      title: v.name,
      subtitle: [
        if (v.visiting != null) 'Visiting ${v.visiting}',
        if (v.passNumber != null) 'Pass ${v.passNumber}',
        'In ${Fmt.time(v.arrivedAt)}',
        if (v.departedAt != null) 'Out ${Fmt.time(v.departedAt)}',
      ].join(' · '),
      badge: StatusBadge(
        tone: v.onSite ? StatusTone.available : StatusTone.neutral,
        label: v.onSite ? 'On site' : 'Left',
        dense: true,
      ),
      trailing: v.onSite
          ? PermissionGate(
              permission: P.visitorRecord,
              child: TextButton(
                onPressed: _busy
                    ? null
                    : () async {
                        setState(() => _busy = true);
                        final messenger = ScaffoldMessenger.of(context);
                        try {
                          await ref
                              .read(securityRepositoryProvider)
                              .checkOutVisitor(v.id);
                          ref.invalidate(visitorsProvider);
                        } on ApiException catch (e) {
                          messenger.showSnackBar(
                            SnackBar(content: Text(e.message)),
                          );
                        } finally {
                          if (mounted) setState(() => _busy = false);
                        }
                      },
                child: const Text('Sign out'),
              ),
            )
          : null,
    );
  }
}
