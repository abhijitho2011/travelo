import 'package:flutter/material.dart';
import 'package:intl/intl.dart';

import '../../core/models/owner_models.dart';

/// Presentation helpers shared by the property detail screen and the amenities
/// editor. They live here rather than inside either screen so both render the
/// same catalogue icon and the same price for the same data.

/// Catalogue icon name → Material icon.
///
/// The catalogue stores an icon NAME because it is admin-editable and has to
/// stay renderable without an app release. This lookup is deliberately a const
/// map of real `Icons.*` constants: building `IconData` from a codepoint that
/// arrives at runtime defeats icon tree-shaking and ships the whole font.
///
/// Keys cover the seeded catalogue for both scopes — room amenities travel
/// attached to room types, so they turn up here too.
const Map<String, IconData> kAmenityIcons = {
  // PROPERTY scope
  'pool': Icons.pool,
  'fitness_center': Icons.fitness_center,
  'local_parking': Icons.local_parking,
  'restaurant': Icons.restaurant,
  'spa': Icons.spa,
  'local_bar': Icons.local_bar,
  'meeting_room': Icons.meeting_room,
  'airport_shuttle': Icons.airport_shuttle,
  'local_laundry_service': Icons.local_laundry_service,
  // Material has no `concierge`; room service is the closest read for a 24h
  // front desk.
  'concierge': Icons.room_service,
  'elevator': Icons.elevator,
  'bolt': Icons.bolt,
  // ROOM scope
  'ac_unit': Icons.ac_unit,
  'tv': Icons.tv,
  'wifi': Icons.wifi,
  'kitchen': Icons.kitchen,
  'lock': Icons.lock,
  'bathtub': Icons.bathtub,
  'balcony': Icons.balcony,
  'waves': Icons.waves,
  'landscape': Icons.landscape,
  'accessible': Icons.accessible,
  'coffee': Icons.coffee,
  'desk': Icons.desk,
  'air': Icons.air,
};

/// An admin can add a catalogue entry with an icon this build has never heard
/// of, so an unknown (or missing) name must still render something.
IconData amenityIcon(String? name) =>
    kAmenityIcons[name ?? ''] ?? Icons.check_circle_outline;

/// Rates are stored in paise; the owner sees rupees.
String formatPaise(int paise, [String currency = 'INR']) {
  final symbol = currency.toUpperCase() == 'INR' ? '₹' : '$currency ';
  return NumberFormat.currency(locale: 'en_IN', symbol: symbol, decimalDigits: 0)
      .format(paise / 100);
}

/// "2 × Queen", or just the bed type when there is one of them. Empty when the
/// GM has not filled the type in yet.
String bedSummary(RoomType t) {
  final bed = t.bedType.trim();
  if (bed.isEmpty) return '';
  return t.bedCount > 1 ? '${t.bedCount} × $bed' : bed;
}
