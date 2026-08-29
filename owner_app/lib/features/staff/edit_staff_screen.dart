import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/data/owner_repository.dart';
import '../../core/models/owner_models.dart';
import '../../widgets/ui.dart';
import 'staff_form.dart';

/// Edit an existing manager. The member usually arrives with the navigation as
/// `extra`, but a cold deep link (or a page reload on web) carries no state —
/// so the record is looked up from the property's staff list in that case.
class EditStaffScreen extends ConsumerWidget {
  const EditStaffScreen({
    super.key,
    required this.propertyId,
    required this.staffId,
    this.member,
  });

  final String propertyId;
  final String staffId;
  final StaffMember? member;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    if (member != null) {
      return _scaffold(StaffForm(propertyId: propertyId, existing: member));
    }

    final staff = ref.watch(staffProvider(propertyId));
    return _scaffold(
      staff.when(
        loading: () => const LoadingView(),
        error: (_, __) => ErrorView(
          message: 'Could not load this manager.',
          onRetry: () => ref.invalidate(staffProvider(propertyId)),
        ),
        data: (list) {
          final found = list.where((s) => s.id == staffId).firstOrNull;
          if (found == null) {
            return const ErrorView(message: 'This manager no longer exists.');
          }
          return StaffForm(propertyId: propertyId, existing: found);
        },
      ),
    );
  }

  Widget _scaffold(Widget body) => Scaffold(
        appBar: AppBar(title: const Text('Edit manager')),
        body: body,
      );
}
