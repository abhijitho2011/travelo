// The rates & inventory grid, one cell per room type per night, as the
// server resolves it (`GET /rates/grid`).

int _int(Object? v) => v is int ? v : int.tryParse('$v') ?? 0;
int? _intOrNull(Object? v) =>
    v == null ? null : (v is int ? v : int.tryParse('$v'));
bool _bool(Object? v) => v == true || v == 'true';

class RateDayCell {
  const RateDayCell({
    required this.roomTypeId,
    required this.date,
    required this.pricePaise,
    required this.priceSource,
    required this.available,
    required this.physical,
    required this.sold,
    this.cap,
    this.minLos,
    this.maxLos,
    this.stopSell = false,
    this.closedToArrival = false,
    this.closedToDeparture = false,
    this.pricingRuleId,
  });

  final String roomTypeId;
  final DateTime date;
  final int pricePaise;

  /// 'day' | 'override' | 'base' — where the price came from.
  final String priceSource;
  final int available;
  final int physical;
  final int sold;
  final int? cap;
  final int? minLos;
  final int? maxLos;
  final bool stopSell;
  final bool closedToArrival;
  final bool closedToDeparture;
  final String? pricingRuleId;

  bool get restricted =>
      stopSell ||
      closedToArrival ||
      closedToDeparture ||
      minLos != null ||
      maxLos != null;
  String get priceLabel => '₹${(pricePaise / 100).round()}';

  factory RateDayCell.fromJson(Map j) => RateDayCell(
    roomTypeId: '${j['roomTypeId']}',
    date: DateTime.parse('${j['date']}'),
    pricePaise: _int(j['pricePaise']),
    priceSource: '${j['priceSource'] ?? 'base'}',
    available: _int(j['available']),
    physical: _int(j['physical']),
    sold: _int(j['sold']),
    cap: _intOrNull(j['cap']),
    minLos: _intOrNull(j['minLos']),
    maxLos: _intOrNull(j['maxLos']),
    stopSell: _bool(j['stopSell']),
    closedToArrival: _bool(j['closedToArrival']),
    closedToDeparture: _bool(j['closedToDeparture']),
    pricingRuleId: j['pricingRuleId']?.toString(),
  );
}

class RateGridRow {
  const RateGridRow({
    required this.id,
    required this.name,
    required this.baseRatePaise,
    required this.physical,
    required this.days,
    this.isPrivate = false,
  });
  final String id;
  final String name;
  final int baseRatePaise;
  final int physical;
  final bool isPrivate;
  final List<RateDayCell> days;
  factory RateGridRow.fromJson(Map j) => RateGridRow(
    id: '${j['id']}',
    name: '${j['name'] ?? ''}',
    baseRatePaise: _int(j['baseRatePaise']),
    physical: _int(j['physical']),
    isPrivate: _bool(j['isPrivate']),
    days: (j['days'] as List? ?? const [])
        .whereType<Map>()
        .map(RateDayCell.fromJson)
        .toList(),
  );
}

class RateGrid {
  const RateGrid({required this.from, required this.to, required this.rows});
  final DateTime from;
  final DateTime to;
  final List<RateGridRow> rows;
  factory RateGrid.fromJson(Map j) => RateGrid(
    from: DateTime.parse('${j['from']}'),
    to: DateTime.parse('${j['to']}'),
    rows: (j['roomTypes'] as List? ?? const [])
        .whereType<Map>()
        .map(RateGridRow.fromJson)
        .toList(),
  );
}

class RateChange {
  const RateChange({
    required this.roomTypeId,
    required this.date,
    required this.field,
    required this.actorKind,
    required this.createdAt,
    this.before,
    this.after,
    this.batchId,
  });
  final String roomTypeId;
  final DateTime date;
  final String field;
  final Object? before;
  final Object? after;
  final String actorKind;
  final String? batchId;
  final DateTime createdAt;
  String get fieldLabel => switch (field) {
    'price' => 'Price',
    'available' => 'Availability',
    'min_los' => 'Min stay',
    'max_los' => 'Max stay',
    'stop_sell' => 'Stop sell',
    'cta' => 'Closed to arrival',
    'ctd' => 'Closed to departure',
    'channel' => 'Channel override',
    _ => field,
  };
  String _fmt(Object? v) {
    if (v == null) return '—';
    if (field == 'price' && v is num) return '₹${(v / 100).round()}';
    if (v is bool) return v ? 'on' : 'off';
    if (v is Map) return v.isEmpty ? '—' : v.toString();
    return '$v';
  }

  String get beforeLabel => _fmt(before);
  String get afterLabel => _fmt(after);
  factory RateChange.fromJson(Map j) => RateChange(
    roomTypeId: '${j['roomTypeId']}',
    date: DateTime.parse('${j['date']}'),
    field: '${j['field']}',
    before: j['before'],
    after: j['after'],
    actorKind: '${j['actorKind'] ?? 'STAFF'}',
    batchId: j['batchId']?.toString(),
    createdAt: DateTime.tryParse('${j['createdAt']}') ?? DateTime.now(),
  );
}
