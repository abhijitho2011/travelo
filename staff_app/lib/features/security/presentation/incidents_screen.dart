import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/networking/api_exception.dart';
import '../../../core/offline/offline_providers.dart';
import '../../../core/permissions/permission_gate.dart';
import '../../../core/permissions/permission_keys.dart';
import '../../../core/providers.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/utils/formatting.dart';
import '../../../core/widgets/cards.dart';
import '../../../core/widgets/primitives.dart';
import '../../../core/widgets/states.dart';
import '../../../core/widgets/status_badge.dart';
import '../data/security_models.dart';
import '../data/security_repository.dart';

/// Report an incident, and — for a role that also holds `incident.read` — see
/// the ones already on file.
///
/// A security guard holds `incident.create` but not `incident.read`, so they
/// get the report form and an honest note where the history would be, rather
/// than an empty list that looks like a bug.
class IncidentsScreen extends ConsumerWidget {
  const IncidentsScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final canRead = ref.watch(canProvider(P.incidentRead));
    final async = canRead ? ref.watch(incidentsProvider) : null;

    return PageBody(
      onRefresh: canRead
          ? () async => ref.invalidate(incidentsProvider)
          : null,
      children: [
        const PageHeader(
          eyebrow: 'Security',
          title: 'Incidents',
          subtitle:
              'Anything that needs a record — a dispute, damage, an injury, a '
              'security concern.',
        ),
        gapSection,

        PermissionGate(
          permission: P.incidentCreate,
          child: const _ReportForm(),
        ),

        gapSection,
        const SectionHeader(
          title: 'Recent incidents',
          icon: Icons.history_outlined,
        ),
        if (!canRead)
          const EmptyState(
            title: 'Past incidents are not visible to your role',
            hint:
                'You can report an incident, and your security manager sees the '
                'full history.',
            icon: Icons.lock_outline,
          )
        else
          async!.when(
            loading: () => const ListSkeleton(rows: 3, height: 68),
            error: (e, _) => ErrorState(
              error: e,
              onRetry: () => ref.invalidate(incidentsProvider),
            ),
            data: (items) => items.isEmpty
                ? const EmptyState(
                    title: 'No incidents on file',
                    hint: 'A quiet shift is a good shift.',
                    icon: Icons.verified_outlined,
                  )
                : Panel(
                    title: 'Incident log',
                    padBody: false,
                    child: Column(
                      children: [
                        for (var i = 0; i < items.length; i++) ...[
                          if (i > 0) const RowDivider(),
                          DataRow2(
                            title: items[i].summary,
                            subtitle: [
                              if (items[i].location != null) items[i].location!,
                              Fmt.dateTime(items[i].reportedAt),
                            ].join(' · '),
                            badge: StatusBadge(
                              tone: items[i].severity.tone,
                              label: items[i].severity.label,
                              dense: true,
                            ),
                          ),
                        ],
                      ],
                    ),
                  ),
          ),
      ],
    );
  }
}

class _ReportForm extends ConsumerStatefulWidget {
  const _ReportForm();

  @override
  ConsumerState<_ReportForm> createState() => _ReportFormState();
}

class _ReportFormState extends ConsumerState<_ReportForm> {
  final _formKey = GlobalKey<FormState>();
  final _summary = TextEditingController();
  final _location = TextEditingController();
  IncidentSeverity _severity = IncidentSeverity.medium;
  bool _busy = false;

  @override
  void dispose() {
    _summary.dispose();
    _location.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    if (!(_formKey.currentState?.validate() ?? false)) return;
    setState(() => _busy = true);
    try {
      await ref
          .read(securityRepositoryProvider)
          .reportIncident(
            summary: _summary.text.trim(),
            severity: _severity,
            location: _location.text.trim(),
          );
      ref.invalidate(incidentsProvider);
      _clear('Incident reported');
    } on ApiException catch (e) {
      if (e.isNetwork || e.isMissingEndpoint) {
        await ref.read(enqueueMutationProvider)(
          entityId: 'incident',
          operationType: 'security.incident',
          payload: {
            'summary': _summary.text.trim(),
            'severity': _severity.wire,
            'location': _location.text.trim(),
          },
        );
        _clear('Saved on this device — it will be sent when you are online');
        return;
      }
      if (!mounted) return;
      ScaffoldMessenger.of(
        context,
      ).showSnackBar(SnackBar(content: Text(e.message)));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  void _clear(String message) {
    if (!mounted) return;
    _summary.clear();
    _location.clear();
    setState(() => _severity = IncidentSeverity.medium);
    ScaffoldMessenger.of(
      context,
    ).showSnackBar(SnackBar(content: Text(message)));
  }

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    return Panel(
      title: 'Report an incident',
      description: 'Short, factual, and as soon as you can.',
      child: Form(
        key: _formKey,
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            TextFormField(
              controller: _summary,
              maxLines: 3,
              textCapitalization: TextCapitalization.sentences,
              decoration: const InputDecoration(
                labelText: 'What happened?',
                hintText: 'Describe what you saw, in your own words',
              ),
              validator: (v) =>
                  (v ?? '').trim().isEmpty ? 'Please describe the incident' : null,
            ),
            gapMd,
            TextFormField(
              controller: _location,
              textCapitalization: TextCapitalization.sentences,
              decoration: const InputDecoration(
                labelText: 'Where?',
                hintText: 'Main gate, car park, lobby…',
                prefixIcon: Icon(Icons.place_outlined, size: 20),
              ),
            ),
            gapMd,
            const LabelXs('Severity'),
            const SizedBox(height: 6),
            Align(
              alignment: Alignment.centerLeft,
              child: Segmented<IncidentSeverity>(
                options: IncidentSeverity.values,
                labelOf: (s) => s.label,
                value: _severity,
                onChanged: (s) => setState(() => _severity = s),
              ),
            ),
            gapMd,
            SizedBox(
              height: 48,
              child: FilledButton.icon(
                onPressed: _busy ? null : _submit,
                style: FilledButton.styleFrom(
                  backgroundColor: _severity == IncidentSeverity.high
                      ? c.destructive
                      : null,
                ),
                icon: _busy
                    ? const SizedBox(
                        width: 17,
                        height: 17,
                        child: CircularProgressIndicator(strokeWidth: 2),
                      )
                    : const Icon(Icons.report_gmailerrorred_outlined, size: 19),
                label: const Text('Report incident'),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
