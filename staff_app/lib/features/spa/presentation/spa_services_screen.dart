import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/networking/api_exception.dart';
import '../../../core/permissions/permission_gate.dart';
import '../../../core/permissions/permission_keys.dart';
import '../../../core/widgets/cards.dart';
import '../../../core/widgets/primitives.dart';
import '../../../core/widgets/states.dart';
import '../../../core/widgets/status_badge.dart';
import '../application/spa_controllers.dart';
import '../data/spa_models.dart';
import '../data/spa_repository.dart';

/// The spa service catalogue — the manager's own. Create, reprice, archive.
class SpaServicesScreen extends ConsumerWidget {
  const SpaServicesScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final async = ref.watch(spaServicesAllProvider);
    return PageBody(
      onRefresh: () async => ref.invalidate(spaServicesAllProvider),
      children: [
        PageHeader(
          eyebrow: 'Spa',
          title: 'Services',
          subtitle: 'Treatments on the menu, their duration and price.',
          actions: [
            PermissionGate(
              permission: P.spaServiceCreate,
              child: FilledButton.icon(
                onPressed: () => _openForm(context, ref),
                icon: const Icon(Icons.add, size: 17),
                label: const Text('New service'),
              ),
            ),
          ],
        ),
        gapSection,
        async.when(
          loading: () => const ListSkeleton(rows: 4, height: 72),
          error: (e, _) =>
              ErrorState(error: e, onRetry: () => ref.invalidate(spaServicesAllProvider)),
          data: (services) {
            if (services.isEmpty) {
              return const EmptyState(
                title: 'No services yet',
                hint: 'Add a treatment to start taking appointments.',
                icon: Icons.spa_outlined,
              );
            }
            return Panel(
              title: 'Catalogue',
              description: '${services.length} services',
              padBody: false,
              child: Column(
                children: [
                  for (var i = 0; i < services.length; i++) ...[
                    if (i > 0) const RowDivider(),
                    _ServiceRow(service: services[i]),
                  ],
                ],
              ),
            );
          },
        ),
      ],
    );
  }
}

class _ServiceRow extends ConsumerWidget {
  const _ServiceRow({required this.service});

  final SpaService service;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return DataRow2(
      title: service.name,
      subtitle: '${service.durationMinutes} min · ${service.priceLabel}',
      badge: StatusBadge(
        tone: service.status == SpaServiceStatus.active
            ? StatusTone.available
            : StatusTone.neutral,
        label: service.status.label,
        dense: true,
      ),
      trailing: PermissionGate(
        permission: P.spaServiceUpdate,
        child: IconButton(
          icon: const Icon(Icons.edit_outlined, size: 18),
          onPressed: () => _openForm(context, ref, service: service),
        ),
      ),
    );
  }
}

Future<void> _openForm(BuildContext context, WidgetRef ref, {SpaService? service}) async {
  final saved = await showModalBottomSheet<bool>(
    context: context,
    isScrollControlled: true,
    builder: (ctx) => Padding(
      padding: EdgeInsets.only(bottom: MediaQuery.viewInsetsOf(ctx).bottom),
      child: _ServiceForm(service: service),
    ),
  );
  if (saved == true) {
    ref.invalidate(spaServicesAllProvider);
    ref.invalidate(spaServicesProvider);
  }
}

class _ServiceForm extends ConsumerStatefulWidget {
  const _ServiceForm({this.service});

  final SpaService? service;

  @override
  ConsumerState<_ServiceForm> createState() => _ServiceFormState();
}

class _ServiceFormState extends ConsumerState<_ServiceForm> {
  final _formKey = GlobalKey<FormState>();
  late final _name = TextEditingController(text: widget.service?.name ?? '');
  late final _duration =
      TextEditingController(text: (widget.service?.durationMinutes ?? 60).toString());
  late final _rupees = TextEditingController(
    text: widget.service != null ? (widget.service!.pricePaise ~/ 100).toString() : '',
  );
  bool _busy = false;
  String? _error;

  @override
  void dispose() {
    _name.dispose();
    _duration.dispose();
    _rupees.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    if (!_formKey.currentState!.validate()) return;
    setState(() {
      _busy = true;
      _error = null;
    });
    final repo = ref.read(spaRepositoryProvider);
    final body = <String, dynamic>{
      'name': _name.text.trim(),
      'durationMinutes': int.parse(_duration.text.trim()),
      'pricePaise': int.parse(_rupees.text.trim()) * 100,
    };
    try {
      if (widget.service == null) {
        await repo.createService(body);
      } else {
        await repo.updateService(widget.service!.id, body);
      }
      if (mounted) Navigator.of(context).pop(true);
    } on ApiException catch (e) {
      setState(() => _error = e.message);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _archive() async {
    setState(() => _busy = true);
    try {
      await ref.read(spaRepositoryProvider).deleteService(widget.service!.id);
      if (mounted) Navigator.of(context).pop(true);
    } on ApiException catch (e) {
      setState(() {
        _error = e.message;
        _busy = false;
      });
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
              Text(
                widget.service == null ? 'New service' : 'Edit service',
                style: Theme.of(context).textTheme.titleLarge,
              ),
              const SizedBox(height: 16),
              TextFormField(
                controller: _name,
                decoration: const InputDecoration(labelText: 'Name'),
                textCapitalization: TextCapitalization.words,
                validator: (v) => (v == null || v.trim().isEmpty) ? 'Required' : null,
              ),
              const SizedBox(height: 12),
              TextFormField(
                controller: _duration,
                decoration: const InputDecoration(labelText: 'Duration (minutes)'),
                keyboardType: TextInputType.number,
                inputFormatters: [FilteringTextInputFormatter.digitsOnly],
                validator: (v) =>
                    (int.tryParse(v ?? '') ?? 0) < 1 ? 'Enter minutes' : null,
              ),
              const SizedBox(height: 12),
              TextFormField(
                controller: _rupees,
                decoration: const InputDecoration(labelText: 'Price (₹)', prefixText: '₹ '),
                keyboardType: TextInputType.number,
                inputFormatters: [FilteringTextInputFormatter.digitsOnly],
                validator: (v) =>
                    (int.tryParse(v ?? '') ?? -1) < 0 ? 'Enter a price' : null,
              ),
              if (_error != null) ...[
                const SizedBox(height: 12),
                Text(_error!, style: TextStyle(color: Theme.of(context).colorScheme.error)),
              ],
              const SizedBox(height: 20),
              FilledButton(
                onPressed: _busy ? null : _submit,
                child: Text(_busy ? 'Saving…' : 'Save'),
              ),
              if (widget.service != null &&
                  widget.service!.status == SpaServiceStatus.active) ...[
                const SizedBox(height: 8),
                PermissionGate(
                  permission: P.spaServiceDelete,
                  child: TextButton(
                    onPressed: _busy ? null : _archive,
                    child: const Text('Archive service'),
                  ),
                ),
              ],
            ],
          ),
        ),
      ),
    );
  }
}
