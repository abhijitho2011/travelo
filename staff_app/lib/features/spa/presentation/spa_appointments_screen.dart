import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/networking/api_exception.dart';
import '../../../core/permissions/permission_gate.dart';
import '../../../core/permissions/permission_keys.dart';
import '../../../core/utils/formatting.dart';
import '../../../core/widgets/cards.dart';
import '../../../core/widgets/primitives.dart';
import '../../../core/widgets/states.dart';
import '../application/spa_controllers.dart';
import '../data/spa_models.dart';
import '../data/spa_repository.dart';

/// The appointment board. The manager sees the whole day and may book, assign a
/// therapist and drive the status; a therapist sees only their own appointments
/// (server-scoped) and starts / completes / annotates them.
class SpaAppointmentsScreen extends ConsumerWidget {
  const SpaAppointmentsScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    // A therapist cannot create; the manager can. That difference decides the
    // scope and the page copy, so the screen serves both without a role check.
    final isManager = ref.watchPermission(P.spaBookingCreate);
    final async = ref.watch(spaAppointmentsProvider(!isManager));

    return PageBody(
      onRefresh: () async =>
          ref.invalidate(spaAppointmentsProvider(!isManager)),
      children: [
        PageHeader(
          eyebrow: 'Spa',
          title: isManager ? 'Appointments' : 'My appointments',
          subtitle: isManager
              ? "Today's calendar. Assign a therapist and follow each treatment."
              : 'Treatments assigned to you. Start one when the guest arrives.',
          actions: [
            PermissionGate(
              permission: P.spaBookingCreate,
              child: FilledButton.icon(
                onPressed: () => _book(context, ref),
                icon: const Icon(Icons.add, size: 17),
                label: const Text('Book'),
              ),
            ),
          ],
        ),
        gapSection,
        async.when(
          loading: () => const ListSkeleton(rows: 4, height: 84),
          error: (e, _) => ErrorState(
            error: e,
            onRetry: () => ref.invalidate(spaAppointmentsProvider(!isManager)),
          ),
          data: (appts) {
            if (appts.isEmpty) {
              return EmptyState(
                title: isManager ? 'No appointments' : 'Nothing assigned',
                hint: isManager
                    ? 'Book a treatment and it will appear here.'
                    : 'Appointments assigned to you will show up here.',
                icon: Icons.event_available_outlined,
              );
            }
            return Column(
              children: [
                for (final a in appts) ...[
                  _AppointmentCard(appointment: a, isManager: isManager),
                  gapMd,
                ],
              ],
            );
          },
        ),
      ],
    );
  }
}

class _AppointmentCard extends ConsumerStatefulWidget {
  const _AppointmentCard({required this.appointment, required this.isManager});

  final SpaAppointment appointment;
  final bool isManager;

  @override
  ConsumerState<_AppointmentCard> createState() => _AppointmentCardState();
}

class _AppointmentCardState extends ConsumerState<_AppointmentCard> {
  bool _busy = false;

  Future<void> _run(Future<void> Function() action) async {
    setState(() => _busy = true);
    final messenger = ScaffoldMessenger.of(context);
    try {
      await action();
      ref.invalidate(spaAppointmentsProvider(true));
      ref.invalidate(spaAppointmentsProvider(false));
      ref.invalidate(spaDashboardProvider);
    } on ApiException catch (e) {
      messenger.showSnackBar(SnackBar(content: Text(e.message)));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final a = widget.appointment;
    final repo = ref.read(spaRepositoryProvider);
    return TaskCard(
      headline: a.guestName,
      type: a.serviceName,
      statusLabel: a.status.label,
      statusTone: a.status.tone,
      note: a.notes,
      meta: [
        if (a.startAt != null) Fmt.time(a.startAt),
        a.priceLabel,
        if (!a.hasTherapist) 'Unassigned',
      ].join(' · '),
      highPriority: !a.hasTherapist && widget.isManager,
      actions: _busy
          ? const SizedBox(
              height: 20,
              width: 20,
              child: CircularProgressIndicator(strokeWidth: 2),
            )
          : Wrap(
              spacing: 4,
              children: [
                if (a.status.canStart)
                  PermissionGate(
                    permission: P.spaBookingUpdate,
                    child: TextButton(
                      onPressed: () => _run(
                        () => repo.setStatus(
                          a.id,
                          SpaAppointmentStatus.inProgress,
                        ),
                      ),
                      child: const Text('Start'),
                    ),
                  ),
                if (a.status.canComplete)
                  PermissionGate(
                    permission: P.spaBookingUpdate,
                    child: FilledButton(
                      onPressed: () => _run(
                        () => repo.setStatus(
                          a.id,
                          SpaAppointmentStatus.completed,
                        ),
                      ),
                      child: const Text('Complete'),
                    ),
                  ),
                if (!a.status.isTerminal)
                  PermissionGate(
                    permission: P.spaBookingUpdate,
                    child: TextButton(
                      onPressed: () => _editNotes(a),
                      child: const Text('Notes'),
                    ),
                  ),
                if (widget.isManager && !a.status.isTerminal)
                  PermissionGate(
                    permission: P.spaRosterUpdate,
                    child: TextButton(
                      onPressed: () => _assign(a),
                      child: Text(a.hasTherapist ? 'Reassign' : 'Assign'),
                    ),
                  ),
              ],
            ),
    );
  }

  Future<void> _editNotes(SpaAppointment a) async {
    final controller = TextEditingController(text: a.notes ?? '');
    final text = await showDialog<String>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Notes'),
        content: TextField(
          controller: controller,
          maxLines: 4,
          decoration: const InputDecoration(hintText: 'Treatment notes'),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx),
            child: const Text('Cancel'),
          ),
          FilledButton(
            onPressed: () => Navigator.pop(ctx, controller.text.trim()),
            child: const Text('Save'),
          ),
        ],
      ),
    );
    if (text != null && text.isNotEmpty) {
      await _run(() => ref.read(spaRepositoryProvider).addNotes(a.id, text));
    }
  }

  Future<void> _assign(SpaAppointment a) async {
    final id = await _promptStaffId(context);
    if (id != null && id.isNotEmpty) {
      await _run(
        () => ref.read(spaRepositoryProvider).assignTherapist(a.id, id),
      );
    }
  }
}

/// Minimal therapist picker: the staff id to assign. A richer picker would list
/// the spa roster; the id keeps this focused and testable.
Future<String?> _promptStaffId(BuildContext context) {
  final controller = TextEditingController();
  return showDialog<String>(
    context: context,
    builder: (ctx) => AlertDialog(
      title: const Text('Assign therapist'),
      content: TextField(
        controller: controller,
        decoration: const InputDecoration(labelText: 'Therapist staff id'),
      ),
      actions: [
        TextButton(
          onPressed: () => Navigator.pop(ctx),
          child: const Text('Cancel'),
        ),
        FilledButton(
          onPressed: () => Navigator.pop(ctx, controller.text.trim()),
          child: const Text('Assign'),
        ),
      ],
    ),
  );
}

Future<void> _book(BuildContext context, WidgetRef ref) async {
  final saved = await showModalBottomSheet<bool>(
    context: context,
    isScrollControlled: true,
    builder: (ctx) => Padding(
      padding: EdgeInsets.only(bottom: MediaQuery.viewInsetsOf(ctx).bottom),
      child: const _BookForm(),
    ),
  );
  if (saved == true) {
    ref.invalidate(spaAppointmentsProvider(false));
    ref.invalidate(spaAppointmentsProvider(true));
    ref.invalidate(spaDashboardProvider);
  }
}

class _BookForm extends ConsumerStatefulWidget {
  const _BookForm();

  @override
  ConsumerState<_BookForm> createState() => _BookFormState();
}

class _BookFormState extends ConsumerState<_BookForm> {
  final _formKey = GlobalKey<FormState>();
  final _guest = TextEditingController();
  SpaService? _service;
  DateTime _startAt = DateTime.now().add(const Duration(hours: 1));
  bool _busy = false;
  String? _error;

  @override
  void dispose() {
    _guest.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    if (!_formKey.currentState!.validate() || _service == null) {
      setState(() => _error = _service == null ? 'Pick a service' : null);
      return;
    }
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      await ref.read(spaRepositoryProvider).createAppointment({
        'guestName': _guest.text.trim(),
        'serviceId': _service!.id,
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
    final services = ref.watch(spaServicesProvider);
    return SafeArea(
      child: Padding(
        padding: const EdgeInsets.all(20),
        child: Form(
          key: _formKey,
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Text(
                'Book appointment',
                style: Theme.of(context).textTheme.titleLarge,
              ),
              const SizedBox(height: 16),
              TextFormField(
                controller: _guest,
                decoration: const InputDecoration(labelText: 'Guest name'),
                textCapitalization: TextCapitalization.words,
                validator: (v) =>
                    (v == null || v.trim().isEmpty) ? 'Required' : null,
              ),
              const SizedBox(height: 12),
              services.when(
                loading: () => const LinearProgressIndicator(),
                error: (_, _) => const Text('Could not load services'),
                data: (list) => DropdownButtonFormField<SpaService>(
                  initialValue: _service,
                  decoration: const InputDecoration(labelText: 'Service'),
                  items: [
                    for (final s in list)
                      DropdownMenuItem(
                        value: s,
                        child: Text('${s.name} · ${s.priceLabel}'),
                      ),
                  ],
                  onChanged: (v) => setState(() => _service = v),
                ),
              ),
              const SizedBox(height: 12),
              ListTile(
                contentPadding: EdgeInsets.zero,
                title: const Text('Start'),
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
                child: Text(_busy ? 'Booking…' : 'Book'),
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
      lastDate: DateTime.now().add(const Duration(days: 365)),
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
