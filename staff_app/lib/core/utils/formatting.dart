import 'package:intl/intl.dart';

/// Indian-format money and the short date/time strings used across the app.
class Fmt {
  Fmt._();

  static final _inr = NumberFormat.currency(
    locale: 'en_IN',
    symbol: '₹',
    decimalDigits: 0,
  );
  static final _compactInr = NumberFormat.compactCurrency(
    locale: 'en_IN',
    symbol: '₹',
    decimalDigits: 1,
  );

  static const dash = '—';

  static String money(num? value, {bool compact = false}) {
    if (value == null) return dash;
    return compact ? _compactInr.format(value) : _inr.format(value);
  }

  static String count(int? value) => value?.toString() ?? dash;

  static String percent(num? value) =>
      value == null ? dash : '${value.round()}%';

  static String time(DateTime? value) =>
      value == null ? dash : DateFormat.Hm().format(value);

  static String dayMonth(DateTime? value) =>
      value == null ? dash : DateFormat('d MMM').format(value);

  static String fullDate(DateTime? value) =>
      value == null ? dash : DateFormat('EEEE, d MMMM').format(value);

  static String dateTime(DateTime? value) =>
      value == null ? dash : DateFormat('d MMM, HH:mm').format(value);

  /// "just now", "12m ago", "3h ago", "5d ago" — used on feeds and log rows.
  static String ago(DateTime? value) {
    if (value == null) return dash;
    final diff = DateTime.now().difference(value);
    if (diff.inSeconds < 60) return 'just now';
    if (diff.inMinutes < 60) return '${diff.inMinutes}m ago';
    if (diff.inHours < 24) return '${diff.inHours}h ago';
    if (diff.inDays < 7) return '${diff.inDays}d ago';
    return dayMonth(value);
  }

  /// Minutes as "45 min" / "1h 20m".
  static String duration(int? minutes) {
    if (minutes == null) return dash;
    if (minutes < 60) return '$minutes min';
    final h = minutes ~/ 60;
    final m = minutes % 60;
    return m == 0 ? '${h}h' : '${h}h ${m}m';
  }

  /// Title-cases a SCREAMING_SNAKE wire value for display.
  static String humanise(String wire) => wire
      .split(RegExp(r'[_\s]+'))
      .where((w) => w.isNotEmpty)
      .map((w) => w[0].toUpperCase() + w.substring(1).toLowerCase())
      .join(' ');
}
