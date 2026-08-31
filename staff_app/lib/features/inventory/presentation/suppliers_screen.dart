import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/networking/api_exception.dart';
import '../../../core/permissions/permission_gate.dart';
import '../../../core/permissions/permission_keys.dart';
import '../../../core/theme/app_spacing.dart';
import '../../../core/widgets/cards.dart';
import '../../../core/widgets/primitives.dart';
import '../../../core/widgets/states.dart';
import '../data/inventory_models.dart';
import '../data/inventory_repository.dart';

/// The supplier directory: who the hotel buys from. Purchase orders reference
/// these. Create/edit gated by supplier.create / supplier.update.
class SuppliersScreen extends ConsumerWidget {
  const SuppliersScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final async = ref.watch(suppliersProvider);
    return PageBody(
      onRefresh: () async => ref.invalidate(suppliersProvider),
      children: [
        PageHeader(
          eyebrow: 'Inventory',
          title: 'Suppliers',
          subtitle: 'The vendors your purchase orders are raised against.',
          actions: [
            PermissionGate(
              permission: P.supplierCreate,
              child: FilledButton.icon(
                onPressed: () => _edit(context, ref, null),
                icon: const Icon(Icons.add, size: 17),
                label: const Text('Add supplier'),
              ),
            ),
          ],
        ),
        gapSection,
        async.when(
          loading: () => const ListSkeleton(rows: 3, height: 64),
          error: (e, _) => ErrorState(
            error: e,
            onRetry: () => ref.invalidate(suppliersProvider),
          ),
          data: (suppliers) => suppliers.isEmpty
              ? const EmptyState(
                  title: 'No suppliers yet',
                  hint:
                      'Add the vendors you buy from so purchase orders can name them.',
                  icon: Icons.local_shipping_outlined,
                )
              : Panel(
                  title: 'Suppliers',
                  description: '${suppliers.length} on file',
                  padBody: false,
                  child: Column(
                    children: [
                      for (var i = 0; i < suppliers.length; i++) ...[
                        if (i > 0) const RowDivider(),
                        DataRow2(
                          leading: const Icon(
                            Icons.storefront_outlined,
                            size: 18,
                          ),
                          title: suppliers[i].name,
                          subtitle: [
                            if (suppliers[i].contact != null)
                              suppliers[i].contact!,
                            if (suppliers[i].phone != null) suppliers[i].phone!,
                          ].join(' · '),
                          onTap: ref.hasPermission(P.supplierUpdate)
                              ? () => _edit(context, ref, suppliers[i])
                              : null,
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

Future<void> _edit(
  BuildContext context,
  WidgetRef ref,
  Supplier? existing,
) async {
  final saved = await showModalBottomSheet<bool>(
    context: context,
    isScrollControlled: true,
    builder: (ctx) => Padding(
      padding: EdgeInsets.only(bottom: MediaQuery.viewInsetsOf(ctx).bottom),
      child: _SupplierSheet(existing: existing),
    ),
  );
  if (saved == true) ref.invalidate(suppliersProvider);
}

class _SupplierSheet extends ConsumerStatefulWidget {
  const _SupplierSheet({this.existing});
  final Supplier? existing;

  @override
  ConsumerState<_SupplierSheet> createState() => _SupplierSheetState();
}

class _SupplierSheetState extends ConsumerState<_SupplierSheet> {
  late final _name = TextEditingController(text: widget.existing?.name ?? '');
  late final _contact = TextEditingController(
    text: widget.existing?.contact ?? '',
  );
  late final _phone = TextEditingController(text: widget.existing?.phone ?? '');
  late final _email = TextEditingController(text: widget.existing?.email ?? '');
  bool _busy = false;
  String? _error;

  @override
  void dispose() {
    _name.dispose();
    _contact.dispose();
    _phone.dispose();
    _email.dispose();
    super.dispose();
  }

  Future<void> _save() async {
    if (_name.text.trim().isEmpty) {
      setState(() => _error = 'A supplier needs a name.');
      return;
    }
    setState(() {
      _busy = true;
      _error = null;
    });
    final body = {
      'name': _name.text.trim(),
      'contact': _contact.text.trim(),
      'phone': _phone.text.trim(),
      'email': _email.text.trim(),
    };
    try {
      final repo = ref.read(inventoryRepositoryProvider);
      if (widget.existing == null) {
        await repo.createSupplier(body);
      } else {
        await repo.updateSupplier(widget.existing!.id, body);
      }
      if (mounted) Navigator.of(context).pop(true);
    } on ApiException catch (e) {
      setState(
        () => _error = e.message.isEmpty ? 'Could not save.' : e.message,
      );
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return SafeArea(
      child: Padding(
        padding: const EdgeInsets.all(Sp.lg),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Text(
              widget.existing == null ? 'Add supplier' : 'Edit supplier',
              style: Theme.of(context).textTheme.titleMedium,
            ),
            const SizedBox(height: Sp.md),
            TextField(
              controller: _name,
              decoration: const InputDecoration(labelText: 'Name'),
            ),
            const SizedBox(height: Sp.sm),
            TextField(
              controller: _contact,
              decoration: const InputDecoration(
                labelText: 'Contact person (optional)',
              ),
            ),
            const SizedBox(height: Sp.sm),
            TextField(
              controller: _phone,
              keyboardType: TextInputType.phone,
              decoration: const InputDecoration(labelText: 'Phone (optional)'),
            ),
            const SizedBox(height: Sp.sm),
            TextField(
              controller: _email,
              keyboardType: TextInputType.emailAddress,
              decoration: const InputDecoration(labelText: 'Email (optional)'),
            ),
            if (_error != null) ...[
              const SizedBox(height: Sp.sm),
              Text(
                _error!,
                style: TextStyle(color: Theme.of(context).colorScheme.error),
              ),
            ],
            const SizedBox(height: Sp.lg),
            FilledButton(
              onPressed: _busy ? null : _save,
              child: _busy
                  ? const SizedBox(
                      height: 18,
                      width: 18,
                      child: CircularProgressIndicator(strokeWidth: 2.2),
                    )
                  : const Text('Save'),
            ),
          ],
        ),
      ),
    );
  }
}
