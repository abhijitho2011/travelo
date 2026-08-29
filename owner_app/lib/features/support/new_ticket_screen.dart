import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/api/api_exception.dart';
import '../../core/data/owner_repository.dart';
import '../../core/models/owner_models.dart';
import '../../core/theme/app_colors.dart';
import '../../core/theme/app_typography.dart';
import '../../core/widgets/auth_scaffold.dart' show ButtonSpinner;
import '../../core/widgets/cards.dart';
import '../../core/widgets/primitives.dart';
import '../../core/widgets/states.dart';

const _priorities = <(String, String)>[
  ('LOW', 'Low'),
  ('NORMAL', 'Normal'),
  ('HIGH', 'High'),
  ('CRITICAL', 'Critical'),
];

/// Open a ticket. The subject and first message are written together by the
/// backend, so the thread is never empty.
class NewTicketScreen extends ConsumerStatefulWidget {
  const NewTicketScreen({super.key});
  @override
  ConsumerState<NewTicketScreen> createState() => _NewTicketScreenState();
}

class _NewTicketScreenState extends ConsumerState<NewTicketScreen> {
  final _form = GlobalKey<FormState>();
  final _subject = TextEditingController();
  final _message = TextEditingController();
  String _priority = 'NORMAL';
  String? _propertyId;
  bool _busy = false;
  String? _error;

  @override
  void dispose() {
    _subject.dispose();
    _message.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    setState(() => _error = null);
    if (!_form.currentState!.validate()) return;
    setState(() => _busy = true);
    try {
      final ticket = await ref.read(ownerRepositoryProvider).createTicket({
        'subject': _subject.text.trim(),
        'message': _message.text.trim(),
        'priority': _priority,
        if (_propertyId != null) 'propertyId': _propertyId,
      });
      if (!mounted) return;
      ScaffoldMessenger.of(
        context,
      ).showSnackBar(const SnackBar(content: Text('Ticket opened.')));
      // Replace this screen with the thread so Back lands on the ticket list.
      context.pushReplacement('/support/${ticket.id}');
    } on ApiException catch (e) {
      setState(() => _error = e.message);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final properties = ref.watch(propertiesProvider);
    return Scaffold(
      backgroundColor: context.colors.background,
      appBar: AppBar(title: const Text('New ticket')),
      body: Form(
        key: _form,
        child: PageBody(
          children: [
            if (_error != null) ...[
              NoticeBanner(
                text: _error!,
                tone: NoticeTone.danger,
                icon: Icons.error_outline,
              ),
              gapSection,
            ],
            const SectionHeader(
              title: 'What do you need help with?',
              icon: Icons.help_outline,
            ),
            TextFormField(
              controller: _subject,
              decoration: const InputDecoration(
                labelText: 'Subject',
                hintText: 'Short summary',
              ),
              validator: (v) => (v == null || v.trim().length < 3)
                  ? 'Add a short subject'
                  : null,
            ),
            const SizedBox(height: 14),
            TextFormField(
              controller: _message,
              minLines: 5,
              maxLines: 10,
              decoration: const InputDecoration(
                labelText: 'Message',
                alignLabelWithHint: true,
                hintText:
                    'Tell us what happened, and what you expected instead.',
              ),
              validator: (v) => (v == null || v.trim().isEmpty)
                  ? 'Describe the problem'
                  : null,
            ),
            gapSection,
            const SectionHeader(title: 'Details', icon: Icons.tune),
            DropdownButtonFormField<String>(
              initialValue: _priority,
              isExpanded: true,
              decoration: const InputDecoration(labelText: 'Priority'),
              items: [
                for (final (value, label) in _priorities)
                  DropdownMenuItem(value: value, child: Text(label)),
              ],
              onChanged: (v) => setState(() => _priority = v ?? 'NORMAL'),
            ),
            const SizedBox(height: 14),
            properties.when(
              loading: () => const InlineLoader(),
              error: (_, __) => const SizedBox.shrink(),
              data: (list) {
                if (list.isEmpty) return const SizedBox.shrink();
                return DropdownButtonFormField<String>(
                  initialValue: _propertyId,
                  isExpanded: true,
                  decoration: const InputDecoration(
                    labelText: 'Hotel',
                    hintText: 'Optional',
                  ),
                  items: [
                    const DropdownMenuItem<String>(
                      value: null,
                      child: Text('Not about a specific hotel'),
                    ),
                    ...list.map(
                      (Property p) =>
                          DropdownMenuItem(value: p.id, child: Text(p.name)),
                    ),
                  ],
                  onChanged: (v) => setState(() => _propertyId = v),
                );
              },
            ),
            const SizedBox(height: 28),
            FilledButton(
              onPressed: _busy ? null : _submit,
              child: _busy ? const ButtonSpinner() : const Text('Open ticket'),
            ),
            const SizedBox(height: 16),
            Text(
              'The Tavelo team replies inside this ticket. You will see their '
              'response here.',
              textAlign: TextAlign.center,
              style: AppTypography.body(
                size: 12,
                color: context.colors.mutedForeground,
              ),
            ),
          ],
        ),
      ),
    );
  }
}
