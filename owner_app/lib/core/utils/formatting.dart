import 'package:intl/intl.dart';

/// Pure presentation helpers shared across screens, so the avatar in the top
/// bar, the one on the profile page and the one beside a manager's name all
/// derive the same letters from the same name.

/// One or two initials from a person's name.
///
/// A single-word name gives one letter; anything longer gives first + last, so
/// a middle name does not push the surname out. [fallback] covers the accounts
/// whose name has not been filled in yet.
String initialsOf(String? name, {String fallback = '?'}) {
  final trimmed = (name ?? '').trim();
  if (trimmed.isEmpty) return fallback;
  final parts = trimmed.split(RegExp(r'\s+'));
  if (parts.length == 1) return parts.first.substring(0, 1).toUpperCase();
  return (parts.first[0] + parts.last[0]).toUpperCase();
}

/// The name to greet someone by. Falls back to a greeting that still reads as
/// a sentence when we have no name at all.
String firstNameOf(String? name, {String fallback = 'there'}) {
  final trimmed = (name ?? '').trim();
  if (trimmed.isEmpty) return fallback;
  return trimmed.split(RegExp(r'\s+')).first;
}

/// Rates and invoices are stored in paise; the owner sees whole rupees.
///
/// A non-INR currency keeps its ISO code rather than borrowing the ₹ — showing
/// a dollar amount with a rupee sign would be worse than showing no symbol.
String formatPaise(int paise, [String currency = 'INR']) {
  final symbol = currency.toUpperCase() == 'INR' ? '₹' : '$currency ';
  return NumberFormat.currency(
    locale: 'en_IN',
    symbol: symbol,
    decimalDigits: 0,
  ).format(paise / 100);
}
