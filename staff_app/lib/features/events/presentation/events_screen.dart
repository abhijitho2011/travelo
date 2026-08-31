import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/networking/api_exception.dart';
import '../../../core/permissions/permission_gate.dart';
import '../../../core/permissions/permission_keys.dart';
import '../../../core/routing/routes.dart';
import '../../../core/utils/formatting.dart';
import '../../../core/widgets/cards.dart';
import '../../../core/widgets/primitives.dart';
import '../../../core/widgets/states.dart';
import '../application/events_controllers.dart';
import '../data/events_models.dart';
import '../data/events_repository.dart';

/// Events & Banquets — the manager's dashboard on top, the pipeline below.
class EventsScreen extends ConsumerWidget {
  const EventsScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final dashboard = ref.watch(eventsDashboardProvider);
    final events = ref.watch(eventsProvider);

    return PageBody(
      onRefresh: () async {
        ref.invalidate(eventsDashboardProvider);
        ref.invalidate(eventsProvider);
      },
      children: [
        PageHeader(
          eyebrow: 'Events',
          title: 'Events & banquets',
          subtitle: 'Enquiries, confirmed functions and the day-of checklist.',
          actions: [
            PermissionGate(
              permission: P.eventCreate,
              child: FilledButton.icon(
                onPressed: () => _create(context, ref),
                icon: const Icon(Icons.add, size: 17),
                label: const Text('New event'),
              ),
            ),
          ],
        ),
        gapSection,
        dashboard.when(
          loading: () => const KpiSkeleton(),
          error: (_, _) => const SizedBox.shrink(),
          data: (d) => d == null
              ? const SizedBox.shrink()
              : Padding(
                  padding: const EdgeInsets.only(bottom: 20),
                  child: KpiGrid(
                    children: [
                      KpiCard(label: 'Today', value: Fmt.count(d.todayCount)),
                      KpiCard(
                        label: 'Upcoming',
                        value: Fmt.count(d.upcomingCount),
                      ),
                      KpiCard(
                        label: 'Pipeline value',
                        value: d.upcomingRevenueLabel,
                      ),
                      KpiCard(
                        label: 'Open tasks',
                        value: Fmt.count(d.pendingTasks),
                      ),
                    ],
                  ),
                ),
        ),
        events.when(
          loading: () => const ListSkeleton(rows: 4, height: 88),
          error: (e, _) => ErrorState(
            error: e,
            onRetry: () => ref.invalidate(eventsProvider),
          ),
          data: (list) {
            if (list.isEmpty) {
              return const EmptyState(
                title: 'No events yet',
                hint: 'Log an enquiry and it will appear here.',
                icon: Icons.celebration_outlined,
              );
            }
            return Column(
              children: [
                for (final e in list) ...[_EventCard(event: e), gapMd],
              ],
            );
          },
        ),
      ],
    );
  }
}

class _EventCard extends StatelessWidget {
  const _EventCard({required this.event});

  final EventItem event;

  @override
  Widget build(BuildContext context) {
    final e = event;
    final doneTasks = e.tasks.where((t) => t.done).length;
    return TaskCard(
      headline: e.name,
      type: e.clientName,
      statusLabel: e.status.label,
      statusTone: e.status.tone,
      meta: [
        if (e.startAt != null) Fmt.dayMonth(e.startAt),
        if (e.venue != null) e.venue!,
        '${e.guestCount} pax',
        e.revenueLabel,
        if (e.tasks.isNotEmpty) '$doneTasks/${e.tasks.length} tasks',
      ].join(' · '),
      onTap: () => context.push(Routes.event(e.id)),
    );
  }
}

Future<void> _create(BuildContext context, WidgetRef ref) async {
  final saved = await showModalBottomSheet<bool>(
    context: context,
    isScrollControlled: true,
    builder: (ctx) => Padding(
      padding: EdgeInsets.only(bottom: MediaQuery.viewInsetsOf(ctx).bottom),
      child: const _EventForm(),
    ),
  );
  if (saved == true) {
    ref.invalidate(eventsProvider);
    ref.invalidate(eventsDashboardProvider);
  }
}

class _EventForm extends ConsumerStatefulWidget {
  const _EventForm();

  @override
  ConsumerState<_EventForm> createState() => _EventFormState();
}

class _EventFormState extends ConsumerState<_EventForm> {
  final _formKey = GlobalKey<FormState>();
  final _name = TextEditingController();
  final _client = TextEditingController();
  final _venue = TextEditingController();
  final _guests = TextEditingController(text: '0');
  final _rupees = TextEditingController(text: '0');
  DateTime _startAt = DateTime.now().add(const Duration(days: 1));
  bool _busy = false;
  String? _error;

  @override
  void dispose() {
    _name.dispose();
    _client.dispose();
    _venue.dispose();
    _guests.dispose();
    _rupees.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    if (!_formKey.currentState!.validate()) return;
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      await ref.read(eventsRepositoryProvider).createEvent({
        'name': _name.text.trim(),
        'clientName': _client.text.trim(),
        if (_venue.text.trim().isNotEmpty) 'venue': _venue.text.trim(),
        'guestCount': int.tryParse(_guests.text.trim()) ?? 0,
        'revenuePaise': (int.tryParse(_rupees.text.trim()) ?? 0) * 100,
        'startAt': _startAt.toUtc().toIso8601String(),
      });
      if (mounted) Navigator.of(context).pop(true);
    } on ApiException catch (e) {
      setState(() => _error = e.message);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return SafeArea(
      child: Padding(
        padding: const EdgeInsets.all(20),
        child: Form(
          key: _formKey,
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Text('New event', style: Theme.of(context).textTheme.titleLarge),
              const SizedBox(height: 16),
              TextFormField(
                controller: _name,
                decoration: const InputDecoration(labelText: 'Event name'),
                textCapitalization: TextCapitalization.words,
                validator: (v) =>
                    (v == null || v.trim().isEmpty) ? 'Required' : null,
              ),
              const SizedBox(height: 12),
              TextFormField(
                controller: _client,
                decoration: const InputDecoration(labelText: 'Client name'),
                textCapitalization: TextCapitalization.words,
                validator: (v) =>
                    (v == null || v.trim().isEmpty) ? 'Required' : null,
              ),
              const SizedBox(height: 12),
              TextFormField(
                controller: _venue,
                decoration: const InputDecoration(
                  labelText: 'Venue (optional)',
                ),
              ),
              const SizedBox(height: 12),
              Row(
                children: [
                  Expanded(
                    child: TextFormField(
                      controller: _guests,
                      decoration: const InputDecoration(labelText: 'Guests'),
                      keyboardType: TextInputType.number,
                      inputFormatters: [FilteringTextInputFormatter.digitsOnly],
                    ),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: TextFormField(
                      controller: _rupees,
                      decoration: const InputDecoration(
                        labelText: 'Revenue (₹)',
                      ),
                      keyboardType: TextInputType.number,
                      inputFormatters: [FilteringTextInputFormatter.digitsOnly],
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 12),
              ListTile(
                contentPadding: EdgeInsets.zero,
                title: const Text('Starts'),
                subtitle: Text(Fmt.dateTime(_startAt)),
                trailing: const Icon(Icons.schedule),
                onTap: _pickTime,
              ),
              if (_error != null) ...[
                const SizedBox(height: 8),
                Text(
                  _error!,
                  style: TextStyle(color: Theme.of(context).colorScheme.error),
                ),
              ],
              const SizedBox(height: 16),
              FilledButton(
                onPressed: _busy ? null : _submit,
                child: Text(_busy ? 'Saving…' : 'Create'),
              ),
            ],
          ),
        ),
      ),
    );
  }

  Future<void> _pickTime() async {
    final date = await showDatePicker(
      context: context,
      initialDate: _startAt,
      firstDate: DateTime.now().subtract(const Duration(days: 1)),
      lastDate: DateTime.now().add(const Duration(days: 730)),
    );
    if (date == null || !mounted) return;
    final time = await showTimePicker(
      context: context,
      initialTime: TimeOfDay.fromDateTime(_startAt),
    );
    if (time == null) return;
    setState(() {
      _startAt = DateTime(
        date.year,
        date.month,
        date.day,
        time.hour,
        time.minute,
      );
    });
  }
}
