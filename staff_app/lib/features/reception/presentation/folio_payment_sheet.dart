import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/networking/api_exception.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/theme/app_spacing.dart';
import '../../../core/theme/app_typography.dart';
import '../../rooms/data/room_models.dart' show paiseToRupeeInput;
import '../../rooms/presentation/room_widgets.dart' show FormErrorNote;
import '../application/reception_controllers.dart';
import '../data/reception_models.dart';

/// Collect a payment — or record a refund — against a stay's folio.
///
/// One sheet serves both, chosen by [isRefund]. The amount is entered in
/// rupees and sent as paise; the method mirrors the server's accepted set. An
/// idempotency key is minted ONCE when the sheet opens, so a double-tap or a
/// retry after a flaky response can never take the guest's money twice.
///
/// Returns true when something was recorded, so the caller can refresh.
class FolioPaymentSheet extends ConsumerStatefulWidget {
  const FolioPaymentSheet({
    super.key,
    required this.reservationId,
    required this.guestName,
    required this.isRefund,
    this.suggestedPaise,
  });

  final String reservationId;
  final String guestName;
  final bool isRefund;
  final int? suggestedPaise;

  static Future<bool?> show(
    BuildContext context, {
    required String reservationId,
    required String guestName,
    required bool isRefund,
    int? suggestedPaise,
  }) => showModalBottomSheet<bool>(
    context: context,
    isScrollControlled: true,
    builder: (ctx) => Padding(
      padding: EdgeInsets.only(bottom: MediaQuery.viewInsetsOf(ctx).bottom),
      child: FolioPaymentSheet(
        reservationId: reservationId,
        guestName: guestName,
        isRefund: isRefund,
        suggestedPaise: suggestedPaise,
      ),
    ),
  );

  @override
  ConsumerState<FolioPaymentSheet> createState() => _FolioPaymentSheetState();
}

class _FolioPaymentSheetState extends ConsumerState<FolioPaymentSheet> {
  late final TextEditingController _amount = TextEditingController(
    text: widget.suggestedPaise != null && widget.suggestedPaise! > 0
        ? paiseToRupeeInput(widget.suggestedPaise!)
        : '',
  );
  final TextEditingController _reference = TextEditingController();
  String _method = kFolioPaymentMethods.first;

  // Minted once: the same submit — retried — is one payment, not two.
  final String _idempotencyKey =
      'staff-${DateTime.now().microsecondsSinceEpoch}';

  bool _busy = false;
  String? _error;

  @override
  void dispose() {
    _amount.dispose();
    _reference.dispose();
    super.dispose();
  }

  int? _amountPaise() {
    final text = _amount.text.trim();
    if (text.isEmpty) return null;
    final rupees = double.tryParse(text);
    if (rupees == null || rupees <= 0) return null;
    return (rupees * 100).round();
  }

  Future<void> _submit() async {
    final paise = _amountPaise();
    if (paise == null) {
      setState(() => _error = 'Enter an amount greater than zero.');
      return;
    }
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      final actions = ref.read(reservationActionsProvider);
      final ref0 = _reference.text.trim();
      if (widget.isRefund) {
        await actions.refund(
          widget.reservationId,
          method: _method,
          amountPaise: paise,
          reference: ref0.isEmpty ? null : ref0,
          idempotencyKey: _idempotencyKey,
        );
      } else {
        await actions.collectPayment(
          widget.reservationId,
          method: _method,
          amountPaise: paise,
          reference: ref0.isEmpty ? null : ref0,
          idempotencyKey: _idempotencyKey,
        );
      }
      if (mounted) Navigator.of(context).pop(true);
    } on ApiException catch (e) {
      setState(() => _error = e.message);
    } catch (_) {
      setState(() => _error = 'Something went wrong. Please try again.');
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    final title = widget.isRefund ? 'Record refund' : 'Collect payment';
    return SafeArea(
      child: Padding(
        padding: const EdgeInsets.fromLTRB(Sp.lg, Sp.lg, Sp.lg, Sp.lg),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Text(title, style: AppTypography.display(size: 18, color: c.foreground)),
            const SizedBox(height: Sp.xs),
            Text(
              widget.guestName,
              style: AppTypography.body(size: 13, color: c.mutedForeground),
            ),
            const SizedBox(height: Sp.lg),

            TextField(
              controller: _amount,
              autofocus: true,
              keyboardType: const TextInputType.numberWithOptions(decimal: true),
              inputFormatters: [
                FilteringTextInputFormatter.allow(RegExp(r'[0-9.]')),
              ],
              decoration: const InputDecoration(
                labelText: 'Amount (₹)',
                prefixText: '₹ ',
              ),
            ),
            const SizedBox(height: Sp.md),

            Text(
              'Method',
              style: AppTypography.body(size: 12.5, color: c.mutedForeground),
            ),
            const SizedBox(height: Sp.xs),
            Wrap(
              spacing: Sp.sm,
              children: [
                for (final m in kFolioPaymentMethods)
                  ChoiceChip(
                    label: Text(m),
                    selected: _method == m,
                    onSelected: _busy ? null : (_) => setState(() => _method = m),
                  ),
              ],
            ),
            const SizedBox(height: Sp.md),

            TextField(
              controller: _reference,
              decoration: const InputDecoration(
                labelText: 'Reference (optional)',
                hintText: 'Receipt or txn no.',
              ),
            ),

            if (_error != null) ...[
              const SizedBox(height: Sp.md),
              FormErrorNote(message: _error!),
            ],

            const SizedBox(height: Sp.lg),
            FilledButton(
              onPressed: _busy ? null : _submit,
              child: _busy
                  ? const SizedBox(
                      height: 18,
                      width: 18,
                      child: CircularProgressIndicator(strokeWidth: 2.2),
                    )
                  : Text(widget.isRefund ? 'Record refund' : 'Take payment'),
            ),
            const SizedBox(height: Sp.sm),
            TextButton(
              onPressed: _busy ? null : () => Navigator.of(context).pop(false),
              child: const Text('Cancel'),
            ),
          ],
        ),
      ),
    );
  }
}
