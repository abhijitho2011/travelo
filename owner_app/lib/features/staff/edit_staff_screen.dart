import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/data/owner_repository.dart';
import '../../core/models/owner_models.dart';
import '../../core/theme/app_colors.dart';
import '../../core/widgets/primitives.dart';
import '../../core/widgets/states.dart';
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
      return _scaffold(
        context,
        StaffForm(propertyId: propertyId, existing: member),
      );
    }

    final staff = ref.watch(staffProvider(propertyId));
    return _scaffold(
      context,
      staff.when(
        loading: () => const PageBody(children: [ListSkeleton(rows: 3)]),
        error: (e, __) => PageBody(
          children: [
            ErrorState(
              error: e,
              message: 'Could not load this manager.',
              onRetry: () => ref.invalidate(staffProvider(propertyId)),
            ),
          ],
        ),
        data: (list) {
          final found = list.where((s) => s.id == staffId).firstOrNull;
          if (found == null) {
            return const PageBody(
              children: [
                EmptyState(
                  icon: Icons.person_off_outlined,
                  title: 'This manager no longer exists.',
                ),
              ],
            );
          }
          return StaffForm(propertyId: propertyId, existing: found);
        },
      ),
    );
  }

  Widget _scaffold(BuildContext context, Widget body) => Scaffold(
    backgroundColor: context.colors.background,
    appBar: AppBar(title: const Text('Edit manager')),
    body: body,
  );
}
