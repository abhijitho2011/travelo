import 'package:flutter/material.dart';

import 'staff_form.dart';

/// Create a General Manager or Assistant General Manager for a property.
/// The fields themselves live in [StaffForm], which the edit screen shares.
class AddStaffScreen extends StatelessWidget {
  const AddStaffScreen({super.key, required this.propertyId});
  final String propertyId;

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Add manager')),
      body: StaffForm(propertyId: propertyId),
    );
  }
}
