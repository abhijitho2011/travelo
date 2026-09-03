import 'package:flutter/material.dart';
import '../../accounts/application/accounts_controllers.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/networking/api_exception.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/theme/app_spacing.dart';
import '../../../core/theme/app_typography.dart';
import '../../../core/widgets/primitives.dart';
import '../../../core/widgets/states.dart';
import '../application/restaurant_controllers.dart';
import '../data/restaurant_models.dart';
import '../data/restaurant_repository.dart';
import 'restaurant_widgets.dart';

/// Close a billed order. Pick a method; ROOM_CHARGE reveals a search of the
/// hotel's checked-in guests, because the charge must land on a current
/// in-house stay — the server refuses anything else.
class SettleSheet extends ConsumerStatefulWidget {
  const SettleSheet({super.key, required this.order});

  final RestaurantOrder order;

  static Future<void> show(BuildContext context, RestaurantOrder order) =>
      showModalBottomSheet<void>(
        context: context,
        isScrollControlled: true,
        showDragHandle: true,
        constraints: BoxConstraints(
          maxHeight: MediaQuery.sizeOf(context).height * 0.9,
        ),
        builder: (_) => SettleSheet(order: order),
      );

  @override
  ConsumerState<SettleSheet> createState() => _SettleSheetState();
}

class _SettleSheetState extends ConsumerState<SettleSheet> {
  PaymentMethod _method = PaymentMethod.cash;
  InHouseGuest? _guest;
  final _search = TextEditingController();
  String _query = '';
  bool _busy = false;
  String? _error;
  final _amount = TextEditingController();
  String? _corporateId;

  @override
  void dispose() {
    _search.dispose();
    _amount.dispose();
    super.dispose();
  }

  Future<void> _settle() async {
    if (_method.isRoomCharge && _guest == null) {
      setState(() => _error = 'Pick the in-house guest to charge the room to.');
      return;
    }
    if (_method.isCorporate && _corporateId == null) {
      setState(() => _error = 'Pick the company account to bill.');
      return;
    }
    final partial = _amount.text.trim().isEmpty
        ? null
        : (int.tryParse(_amount.text.trim()) ?? 0) * 100;
    setState(() {
      _busy = true;
      _error = null;
    });
    final navigator = Navigator.of(context);
    final messenger = ScaffoldMessenger.of(context);
    try {
      await ref
          .read(restaurantActionsProvider)
          .settle(
            widget.order.id,
            _method,
            reservationId: _method.isRoomCharge ? _guest!.id : null,
            corporateAccountId: _method.isCorporate ? _corporateId : null,
            amountPaise: partial,
          );
      navigator.pop();
      messenger.showSnackBar(
        SnackBar(
          content: Text(
            '${widget.order.orderNumber} settled · ${_method.label}',
          ),
        ),
      );
    } on ApiException catch (e) {
      if (!mounted) return;
      setState(() {
        _busy = false;
        _error = RestaurantErrors.friendly(e);
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    return SafeArea(
      child: Padding(
        padding: const EdgeInsets.fromLTRB(Sp.lg, 0, Sp.lg, Sp.lg),
        child: SingleChildScrollView(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Text(
                'Settle bill',
                style: AppTypography.display(size: 19, color: c.foreground),
              ),
              const SizedBox(height: Sp.md),
              MoneyRow(
                label: 'Total due',
                value: widget.order.totalLabel,
                strong: true,
              ),
              const SizedBox(height: Sp.lg),

              const LabelXs('Payment method'),
              const SizedBox(height: Sp.sm),
              Wrap(
                spacing: Sp.sm,
                runSpacing: Sp.sm,
                children: [
                  for (final m in PaymentMethod.values)
                    ChoiceChip(
                      label: Text(m.label),
                      selected: _method == m,
                      onSelected: (_) => setState(() {
                        _method = m;
                        _error = null;
                      }),
                    ),
                ],
              ),

              if (_method.isRoomCharge) ...[
                const SizedBox(height: Sp.lg),
                const LabelXs('Charge to in-house guest'),
                const SizedBox(height: Sp.sm),
                TextField(
                  controller: _search,
                  decoration: const InputDecoration(
                    hintText: 'Search checked-in guests',
                    prefixIcon: Icon(Icons.search, size: 20),
                  ),
                  onChanged: (v) => setState(() => _query = v.trim()),
                ),
                const SizedBox(height: Sp.sm),
                _GuestPicker(
                  query: _query,
                  selected: _guest,
                  onPick: (g) => setState(() {
                    _guest = g;
                    _error = null;
                  }),
                ),
              ],

              if (_method.isCorporate) ...[
                const SizedBox(height: Sp.lg),
                const LabelXs('Bill to company account'),
                const SizedBox(height: Sp.sm),
                _CorporatePicker(
                  selected: _corporateId,
                  onPick: (id) => setState(() {
                    _corporateId = id;
                    _error = null;
                  }),
                ),
              ],
              if (!_method.isRoomCharge && !_method.isCorporate) ...[
                const SizedBox(height: Sp.lg),
                TextField(
                  controller: _amount,
                  keyboardType: TextInputType.number,
                  decoration: const InputDecoration(
                    labelText: 'Amount now (₹)',
                    hintText: 'Blank = the whole balance · less = part payment',
                  ),
                  onChanged: (_) => setState(() {}),
                ),
              ],
              if (_error != null) ...[
                const SizedBox(height: Sp.md),
                RestaurantErrorNote(message: _error!),
              ],
              const SizedBox(height: Sp.lg),
              FilledButton(
                onPressed: _busy ? null : _settle,
                child: Text(
                  _amount.text.trim().isEmpty
                      ? 'Take ${_method.label} · ${widget.order.totalLabel}'
                      : 'Take ${_method.label} · ₹${_amount.text.trim()} now',
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _GuestPicker extends ConsumerWidget {
  const _GuestPicker({
    required this.query,
    required this.selected,
    required this.onPick,
  });

  final String query;
  final InHouseGuest? selected;
  final ValueChanged<InHouseGuest> onPick;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final c = context.colors;
    final guests = ref.watch(inHouseGuestsProvider(query));
    return guests.when(
      loading: () => const ListSkeleton(rows: 2, height: 52),
      error: (e, _) =>
          RestaurantErrorNote(message: 'Could not load in-house guests. $e'),
      data: (list) => list.isEmpty
          ? Text(
              'No checked-in guests match. A room charge needs a guest who is '
              'currently in-house.',
              style: AppTypography.body(size: 12.5, color: c.mutedForeground),
            )
          : Column(
              children: [
                for (final g in list)
                  ListTile(
                    onTap: () => onPick(g),
                    contentPadding: EdgeInsets.zero,
                    leading: Icon(
                      selected?.id == g.id
                          ? Icons.radio_button_checked
                          : Icons.radio_button_unchecked,
                      color: selected?.id == g.id
                          ? c.primary
                          : c.mutedForeground,
                    ),
                    title: Text(g.guestName),
                    subtitle: g.subtitle.isEmpty ? null : Text(g.subtitle),
                  ),
              ],
            ),
    );
  }
}

/// The property's corporate accounts, for a CORPORATE settlement.
class _CorporatePicker extends ConsumerWidget {
  const _CorporatePicker({required this.selected, required this.onPick});
  final String? selected;
  final ValueChanged<String?> onPick;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final accounts = ref.watch(corporateAccountsProvider);
    return accounts.when(
      loading: () => const ListSkeleton(rows: 2, height: 44),
      error: (e, _) => ErrorState(error: e),
      data: (list) {
        final active = list.where((a) => a.isActive).toList();
        if (active.isEmpty) {
          return const EmptyState(
            title: 'No company accounts yet',
            hint: 'Add one under Accounts → Company accounts.',
            icon: Icons.business_outlined,
          );
        }
        return DropdownButtonFormField<String?>(
          initialValue: active.any((a) => a.id == selected) ? selected : null,
          isExpanded: true,
          decoration: const InputDecoration(labelText: 'Company'),
          items: [
            for (final a in active)
              DropdownMenuItem(value: a.id, child: Text(a.name)),
          ],
          onChanged: onPick,
        );
      },
    );
  }
}
