import 'package:flutter/foundation.dart';
import 'package:intl/intl.dart';

import '../../../core/utils/formatting.dart';
import '../../../core/widgets/status_badge.dart';

// ---------------------------------------------------------------- parsing --
//
// The server is the authority on shape, but a client that throws on one
// missing key strands a whole screen. Every reader below takes what it can and
// falls back to something honest, so a field the backend adds (or renames)
// costs a value, never the page.

dynamic _pick(Map json, List<String> keys) {
  for (final key in keys) {
    final value = json[key];
    if (value != null) return value;
  }
  return null;
}

int _int(dynamic value, [int fallback = 0]) {
  if (value is int) return value;
  if (value is num) return value.round();
  return int.tryParse((value ?? '').toString()) ?? fallback;
}

int? _intOrNull(dynamic value) {
  if (value == null) return null;
  if (value is int) return value;
  if (value is num) return value.round();
  return int.tryParse(value.toString());
}

bool _bool(dynamic value) =>
    value == true || value == 1 || value.toString().toLowerCase() == 'true';

String? _str(dynamic value) {
  final text = value?.toString().trim();
  return (text == null || text.isEmpty) ? null : text;
}

DateTime? _date(dynamic value) =>
    DateTime.tryParse((value ?? '').toString())?.toLocal();

/// SCREAMING_SNAKE, however the caller typed it.
String? _wire(dynamic value) {
  final text = _str(value);
  return text?.toUpperCase().replaceAll(RegExp(r'[\s-]+'), '_');
}

List<Amenity> _amenities(dynamic value) => value is List
    ? value.whereType<Map>().map(Amenity.fromJson).toList(growable: false)
    : const <Amenity>[];

/// Rates travel as paise. Rupees are what a manager types and reads, so the
/// conversion happens once, here, rather than in every widget.
final _preciseInr = NumberFormat.currency(
  locale: 'en_IN',
  symbol: '₹',
  decimalDigits: 2,
);

String formatPaise(int paise) =>
    paise % 100 == 0 ? Fmt.money(paise ~/ 100) : _preciseInr.format(paise / 100);

/// Rupees as typed into a form: whole where the rate is whole, so an untouched
/// field never looks edited.
String paiseToRupeeInput(int paise) => paise % 100 == 0
    ? '${paise ~/ 100}'
    : (paise / 100).toStringAsFixed(2);

/// Rupees back to paise, rounded — a rate of 2499.995 is not a thing.
int rupeesToPaise(String input) {
  final rupees = double.tryParse(input.trim().replaceAll(',', ''));
  return rupees == null ? 0 : (rupees * 100).round();
}

// --------------------------------------------------------------- amenities --

/// One amenity: a row of the property's ROOM-scoped catalogue, or one attached
/// to a room type or a room.
@immutable
class Amenity {
  const Amenity({
    required this.id,
    required this.key,
    required this.name,
    this.icon,
    this.fromRoomType = false,
  });

  final String id;
  final String key;
  final String name;

  /// The server's icon hint. Deliberately unmapped to a glyph — one neutral
  /// icon everywhere reads better than a confidently wrong one.
  final String? icon;

  /// Set on a room's amenities: true when the amenity arrives from the room
  /// type rather than having been added to this room. Those are not editable
  /// per room, so the forms must be able to tell them apart.
  final bool fromRoomType;

  factory Amenity.fromJson(Map json) {
    final key = (_str(json['key']) ?? '').toString();
    return Amenity(
      id: (json['id'] ?? '').toString(),
      key: key,
      name: _str(json['name']) ?? (key.isEmpty ? 'Amenity' : Fmt.humanise(key)),
      icon: _str(json['icon']),
      fromRoomType: _bool(_pick(json, ['fromRoomType', 'from_room_type'])),
    );
  }

  Map<String, dynamic> toJson() => {
    'id': id,
    'key': key,
    'name': name,
    if (icon != null) 'icon': icon,
    if (fromRoomType) 'fromRoomType': true,
  };
}

// ------------------------------------------------------------------ enums --

enum BedType {
  single('SINGLE', 'Single'),
  twin('TWIN', 'Twin'),
  doubleBed('DOUBLE', 'Double'),
  queen('QUEEN', 'Queen'),
  king('KING', 'King'),
  bunk('BUNK', 'Bunk');

  const BedType(this.wire, this.label);

  final String wire;
  final String label;

  /// Falls back to DOUBLE: it is the commonest configuration, so an
  /// unrecognised value shows the least surprising thing rather than nothing.
  static BedType fromWire(String? value) {
    final normalised = _wire(value);
    for (final bed in BedType.values) {
      if (bed.wire == normalised) return bed;
    }
    return BedType.doubleBed;
  }
}

enum RoomStatus {
  available('AVAILABLE', 'Available'),
  occupied('OCCUPIED', 'Occupied'),
  dirty('DIRTY', 'Dirty'),
  cleaning('CLEANING', 'Cleaning'),
  inspected('INSPECTED', 'Inspected'),
  ready('READY', 'Ready'),
  maintenance('MAINTENANCE', 'Maintenance'),
  outOfOrder('OUT_OF_ORDER', 'Out of order');

  const RoomStatus(this.wire, this.label);

  final String wire;
  final String label;

  /// READY has no tone of its own in the palette. A ready room is sellable, so
  /// it borrows the available green rather than inventing an eighth colour
  /// nobody has learnt to read.
  StatusTone get tone => switch (this) {
    RoomStatus.available => StatusTone.available,
    RoomStatus.ready => StatusTone.available,
    RoomStatus.occupied => StatusTone.occupied,
    RoomStatus.dirty => StatusTone.dirty,
    RoomStatus.cleaning => StatusTone.cleaning,
    RoomStatus.inspected => StatusTone.inspected,
    RoomStatus.maintenance => StatusTone.maintenance,
    RoomStatus.outOfOrder => StatusTone.outOfOrder,
  };

  /// One line of plain English per status, shown beside it in the change
  /// sheet so nobody has to guess what INSPECTED commits them to.
  String get hint => switch (this) {
    RoomStatus.available => 'Clean, checked and sellable.',
    RoomStatus.occupied => 'A guest is in the room.',
    RoomStatus.dirty => 'Needs cleaning before anyone else stays.',
    RoomStatus.cleaning => 'Being cleaned right now.',
    RoomStatus.inspected => 'Cleaned and signed off by a supervisor.',
    RoomStatus.ready => 'Ready for the next arrival.',
    RoomStatus.maintenance => 'With maintenance; not sellable today.',
    RoomStatus.outOfOrder => 'Off the inventory until someone puts it back.',
  };

  static RoomStatus fromWire(String? value) {
    final normalised = _wire(value);
    for (final status in RoomStatus.values) {
      if (status.wire == normalised) return status;
    }
    return RoomStatus.available;
  }
}

enum RoomTypeStatus {
  active('ACTIVE', 'Active'),
  archived('ARCHIVED', 'Archived');

  const RoomTypeStatus(this.wire, this.label);

  final String wire;
  final String label;

  StatusTone get tone => this == RoomTypeStatus.active
      ? StatusTone.healthy
      : StatusTone.neutral;

  static RoomTypeStatus fromWire(String? value) =>
      _wire(value) == RoomTypeStatus.archived.wire
      ? RoomTypeStatus.archived
      : RoomTypeStatus.active;
}

// ------------------------------------------------------------- room types --

/// A row from `GET /room-types` — one sellable category of room.
@immutable
class RoomType {
  const RoomType({
    required this.id,
    required this.name,
    required this.bedType,
    required this.bedCount,
    required this.maxOccupancy,
    required this.maxAdults,
    required this.maxChildren,
    required this.airConditioned,
    required this.baseRate,
    required this.status,
    this.propertyId,
    this.description,
    this.currency = 'INR',
    this.sizeSqft,
    this.amenities = const <Amenity>[],
    this.roomCount = 0,
    this.createdAt,
    this.updatedAt,
  });

  final String id;
  final String? propertyId;
  final String name;
  final String? description;
  final BedType bedType;
  final int bedCount;
  final int maxOccupancy;
  final int maxAdults;
  final int maxChildren;

  /// Air conditioning is a property of the type itself, not an amenity: every
  /// room of the type inherits it, and rates are quoted on it.
  final bool airConditioned;

  /// Paise. Never rupees — the wire is the wire.
  final int baseRate;
  final String currency;
  final int? sizeSqft;
  final RoomTypeStatus status;
  final List<Amenity> amenities;

  /// How many rooms currently carry this type. Deleting a type with rooms on
  /// it is refused server-side with ROOM_TYPE_IN_USE.
  final int roomCount;
  final DateTime? createdAt;
  final DateTime? updatedAt;

  bool get isArchived => status == RoomTypeStatus.archived;

  Set<String> get amenityIds =>
      amenities.map((a) => a.id).toSet();

  String get bedLabel =>
      bedCount == 1 ? bedType.label : '$bedCount × ${bedType.label}';

  String get occupancyLabel => 'Sleeps $maxOccupancy';

  String get guestMixLabel =>
      '$maxAdults ${maxAdults == 1 ? 'adult' : 'adults'}'
      '${maxChildren > 0 ? ', $maxChildren ${maxChildren == 1 ? 'child' : 'children'}' : ''}';

  String get baseRateLabel => formatPaise(baseRate);

  String get roomCountLabel =>
      '$roomCount ${roomCount == 1 ? 'room' : 'rooms'}';

  factory RoomType.fromJson(Map json) => RoomType(
    id: (json['id'] ?? '').toString(),
    propertyId: _str(_pick(json, ['propertyId', 'property_id'])),
    name: _str(json['name']) ?? 'Untitled room type',
    description: _str(json['description']),
    bedType: BedType.fromWire(_str(_pick(json, ['bedType', 'bed_type']))),
    bedCount: _int(_pick(json, ['bedCount', 'bed_count']), 1),
    maxOccupancy: _int(_pick(json, ['maxOccupancy', 'max_occupancy']), 2),
    maxAdults: _int(_pick(json, ['maxAdults', 'max_adults']), 2),
    maxChildren: _int(_pick(json, ['maxChildren', 'max_children'])),
    airConditioned: _bool(
      _pick(json, ['airConditioned', 'air_conditioned']),
    ),
    baseRate: _int(_pick(json, ['baseRate', 'base_rate'])),
    currency: _str(json['currency']) ?? 'INR',
    sizeSqft: _intOrNull(_pick(json, ['sizeSqft', 'size_sqft'])),
    status: RoomTypeStatus.fromWire(_str(json['status'])),
    amenities: _amenities(json['amenities']),
    roomCount: _int(_pick(json, ['roomCount', 'room_count'])),
    createdAt: _date(_pick(json, ['createdAt', 'created_at'])),
    updatedAt: _date(_pick(json, ['updatedAt', 'updated_at'])),
  );

  Map<String, dynamic> toJson() => {
    'id': id,
    if (propertyId != null) 'propertyId': propertyId,
    'name': name,
    if (description != null) 'description': description,
    'bedType': bedType.wire,
    'bedCount': bedCount,
    'maxOccupancy': maxOccupancy,
    'maxAdults': maxAdults,
    'maxChildren': maxChildren,
    'airConditioned': airConditioned,
    'baseRate': baseRate,
    'currency': currency,
    if (sizeSqft != null) 'sizeSqft': sizeSqft,
    'status': status.wire,
    'amenities': [for (final a in amenities) a.toJson()],
    'roomCount': roomCount,
  };
}

// ------------------------------------------------------------------ rooms --

/// A row from `GET /rooms` — one physical room.
@immutable
class Room {
  const Room({
    required this.id,
    required this.roomTypeId,
    required this.roomTypeName,
    required this.number,
    required this.status,
    this.propertyId,
    this.bedType,
    this.airConditioned = false,
    this.floor,
    this.notes,
    this.amenities = const <Amenity>[],
    this.createdAt,
    this.updatedAt,
  });

  final String id;
  final String? propertyId;
  final String roomTypeId;
  final String roomTypeName;

  /// Denormalised from the type so a room row reads without a second request.
  final BedType? bedType;
  final bool airConditioned;
  final String number;
  final int? floor;
  final String? notes;
  final RoomStatus status;
  final List<Amenity> amenities;
  final DateTime? createdAt;
  final DateTime? updatedAt;

  StatusTone get tone => status.tone;

  /// What the room type already provides. Not editable per room.
  List<Amenity> get inheritedAmenities =>
      amenities.where((a) => a.fromRoomType).toList(growable: false);

  /// Added to this room alone — the only ones a room form may change.
  List<Amenity> get extraAmenities =>
      amenities.where((a) => !a.fromRoomType).toList(growable: false);

  Set<String> get extraAmenityIds =>
      extraAmenities.map((a) => a.id).toSet();

  String get floorLabel => floor == null ? 'Floor not set' : 'Floor $floor';

  factory Room.fromJson(Map json) => Room(
    id: (json['id'] ?? '').toString(),
    propertyId: _str(_pick(json, ['propertyId', 'property_id'])),
    roomTypeId: (_pick(json, ['roomTypeId', 'room_type_id']) ?? '').toString(),
    roomTypeName:
        _str(_pick(json, ['roomTypeName', 'room_type_name'])) ?? 'Room',
    bedType: _pick(json, ['bedType', 'bed_type']) == null
        ? null
        : BedType.fromWire(_str(_pick(json, ['bedType', 'bed_type']))),
    airConditioned: _bool(_pick(json, ['airConditioned', 'air_conditioned'])),
    number: _str(json['number']) ?? '—',
    floor: _intOrNull(json['floor']),
    notes: _str(json['notes']),
    status: RoomStatus.fromWire(_str(json['status'])),
    amenities: _amenities(json['amenities']),
    createdAt: _date(_pick(json, ['createdAt', 'created_at'])),
    updatedAt: _date(_pick(json, ['updatedAt', 'updated_at'])),
  );

  Map<String, dynamic> toJson() => {
    'id': id,
    if (propertyId != null) 'propertyId': propertyId,
    'roomTypeId': roomTypeId,
    'roomTypeName': roomTypeName,
    if (bedType != null) 'bedType': bedType!.wire,
    'airConditioned': airConditioned,
    'number': number,
    if (floor != null) 'floor': floor,
    if (notes != null) 'notes': notes,
    'status': status.wire,
    'amenities': [for (final a in amenities) a.toJson()],
  };
}

/// What `POST /rooms/:id/status` gives back. The previous status is worth
/// keeping: the confirmation says what actually changed, not just where it
/// landed.
@immutable
class RoomStatusChange {
  const RoomStatusChange({
    required this.id,
    required this.number,
    required this.status,
    this.previousStatus,
    this.updatedAt,
  });

  final String id;
  final String number;
  final RoomStatus status;
  final RoomStatus? previousStatus;
  final DateTime? updatedAt;

  factory RoomStatusChange.fromJson(Map json) => RoomStatusChange(
    id: (json['id'] ?? '').toString(),
    number: _str(json['number']) ?? '—',
    status: RoomStatus.fromWire(_str(json['status'])),
    previousStatus: _pick(json, ['previousStatus', 'previous_status']) == null
        ? null
        : RoomStatus.fromWire(
            _str(_pick(json, ['previousStatus', 'previous_status'])),
          ),
    updatedAt: _date(_pick(json, ['updatedAt', 'updated_at'])),
  );
}

// --------------------------------------------------------------- grouping --

/// One floor's worth of rooms, for the board.
@immutable
class FloorGroup {
  const FloorGroup({required this.floor, required this.rooms});

  final int? floor;
  final List<Room> rooms;

  String get label => floor == null ? 'Floor not set' : 'Floor $floor';

  String get headline =>
      '$label · ${rooms.length} ${rooms.length == 1 ? 'room' : 'rooms'}';
}

/// Room numbers are strings on the wire but numbers to everyone who works
/// here, so 10 must follow 9 rather than 1.
int compareRoomNumbers(String a, String b) {
  final na = int.tryParse(a);
  final nb = int.tryParse(b);
  if (na != null && nb != null) return na.compareTo(nb);
  if (na != null) return -1;
  if (nb != null) return 1;
  return a.compareTo(b);
}

/// Rooms by floor, floors ascending, with rooms whose floor nobody recorded
/// collected at the end rather than silently dropped.
List<FloorGroup> groupRoomsByFloor(List<Room> rooms) {
  final byFloor = <int?, List<Room>>{};
  for (final room in rooms) {
    byFloor.putIfAbsent(room.floor, () => <Room>[]).add(room);
  }
  final floors = byFloor.keys.toList()
    ..sort((a, b) {
      if (a == null) return 1;
      if (b == null) return -1;
      return a.compareTo(b);
    });
  return [
    for (final floor in floors)
      FloorGroup(
        floor: floor,
        rooms: byFloor[floor]!
          ..sort((a, b) => compareRoomNumbers(a.number, b.number)),
      ),
  ];
}

// ---------------------------------------------------------------- filters --

/// The filter state of the room-type catalogue.
@immutable
class RoomTypeFilter {
  const RoomTypeFilter({this.status, this.query, this.limit, this.offset});

  final RoomTypeStatus? status;
  final String? query;
  final int? limit;
  final int? offset;

  bool get isEmpty => status == null && (query == null || query!.isEmpty);

  RoomTypeFilter copyWith({
    RoomTypeStatus? status,
    String? query,
    int? limit,
    int? offset,
    bool clearStatus = false,
  }) => RoomTypeFilter(
    status: clearStatus ? null : (status ?? this.status),
    query: query ?? this.query,
    limit: limit ?? this.limit,
    offset: offset ?? this.offset,
  );

  Map<String, dynamic> toQuery() => {
    if (status != null) 'status': status!.wire,
    if (query != null && query!.isNotEmpty) 'q': query,
    if (limit != null) 'limit': limit,
    if (offset != null) 'offset': offset,
  };
}

/// The filter state of the room board.
@immutable
class RoomFilter {
  const RoomFilter({
    this.status,
    this.roomTypeId,
    this.floor,
    this.query,
    this.limit,
    this.offset,
  });

  final RoomStatus? status;
  final String? roomTypeId;
  final int? floor;
  final String? query;
  final int? limit;
  final int? offset;

  bool get isEmpty =>
      status == null &&
      roomTypeId == null &&
      floor == null &&
      (query == null || query!.isEmpty);

  RoomFilter copyWith({
    RoomStatus? status,
    String? roomTypeId,
    int? floor,
    String? query,
    int? limit,
    int? offset,
    bool clearStatus = false,
    bool clearRoomType = false,
    bool clearFloor = false,
  }) => RoomFilter(
    status: clearStatus ? null : (status ?? this.status),
    roomTypeId: clearRoomType ? null : (roomTypeId ?? this.roomTypeId),
    floor: clearFloor ? null : (floor ?? this.floor),
    query: query ?? this.query,
    limit: limit ?? this.limit,
    offset: offset ?? this.offset,
  );

  Map<String, dynamic> toQuery() => {
    if (status != null) 'status': status!.wire,
    if (roomTypeId != null && roomTypeId!.isNotEmpty) 'roomTypeId': roomTypeId,
    if (floor != null) 'floor': floor,
    if (query != null && query!.isNotEmpty) 'q': query,
    if (limit != null) 'limit': limit,
    if (offset != null) 'offset': offset,
  };
}

// --------------------------------------------------------------- payloads --

/// Payload for `POST /room-types`.
@immutable
class NewRoomType {
  const NewRoomType({
    required this.name,
    required this.bedType,
    required this.bedCount,
    required this.maxOccupancy,
    required this.maxAdults,
    required this.maxChildren,
    required this.airConditioned,
    required this.baseRate,
    this.description,
    this.currency,
    this.sizeSqft,
    this.amenityIds = const <String>[],
  });

  final String name;
  final String? description;
  final BedType bedType;
  final int bedCount;
  final int maxOccupancy;
  final int maxAdults;
  final int maxChildren;
  final bool airConditioned;

  /// Paise.
  final int baseRate;
  final String? currency;
  final int? sizeSqft;
  final List<String> amenityIds;

  Map<String, dynamic> toJson() => {
    'name': name,
    if (description != null && description!.isNotEmpty)
      'description': description,
    'bedType': bedType.wire,
    'bedCount': bedCount,
    'maxOccupancy': maxOccupancy,
    'maxAdults': maxAdults,
    'maxChildren': maxChildren,
    'airConditioned': airConditioned,
    'baseRate': baseRate,
    if (currency != null && currency!.isNotEmpty) 'currency': currency,
    if (sizeSqft != null) 'sizeSqft': sizeSqft,
    if (amenityIds.isNotEmpty) 'amenityIds': amenityIds,
  };
}

/// Payload for `POST /rooms`.
@immutable
class NewRoom {
  const NewRoom({
    required this.roomTypeId,
    required this.number,
    this.floor,
    this.status,
    this.notes,
    this.amenityIds = const <String>[],
  });

  final String roomTypeId;
  final String number;
  final int? floor;
  final RoomStatus? status;
  final String? notes;

  /// Extras for this room alone; the type's own amenities are never resent.
  final List<String> amenityIds;

  Map<String, dynamic> toJson() => {
    'roomTypeId': roomTypeId,
    'number': number,
    if (floor != null) 'floor': floor,
    if (status != null) 'status': status!.wire,
    if (notes != null && notes!.isNotEmpty) 'notes': notes,
    if (amenityIds.isNotEmpty) 'amenityIds': amenityIds,
  };
}

/// Which way a bulk create describes the rooms it wants.
enum BulkRoomMode {
  range('Range'),
  list('List');

  const BulkRoomMode(this.label);

  final String label;
}

/// Payload for `POST /rooms/bulk`, in either of the two shapes the endpoint
/// accepts.
@immutable
class BulkRoomRequest {
  const BulkRoomRequest.list({
    required this.roomTypeId,
    required this.numbers,
    this.floor,
    this.status,
  }) : mode = BulkRoomMode.list,
       prefix = null,
       from = null,
       to = null,
       pad = 0;

  const BulkRoomRequest.range({
    required this.roomTypeId,
    required this.from,
    required this.to,
    this.prefix,
    this.pad = 0,
    this.floor,
    this.status,
  }) : mode = BulkRoomMode.range,
       numbers = const <String>[];

  final BulkRoomMode mode;
  final String roomTypeId;
  final int? floor;
  final RoomStatus? status;

  /// List mode.
  final List<String> numbers;

  /// Range mode.
  final String? prefix;
  final int? from;
  final int? to;
  final int pad;

  /// Exactly what this request will ask the server to create. The server
  /// expands the range again — this is a preview so the form can show its
  /// work, not a second source of truth.
  List<String> get preview => switch (mode) {
    BulkRoomMode.list => numbers,
    BulkRoomMode.range => (from == null || to == null)
        ? const <String>[]
        : expandRange(prefix: prefix, from: from!, to: to!, pad: pad),
  };

  Map<String, dynamic> toJson() => {
    'roomTypeId': roomTypeId,
    if (floor != null) 'floor': floor,
    if (status != null) 'status': status!.wire,
    if (mode == BulkRoomMode.list) 'numbers': numbers,
    if (mode == BulkRoomMode.range) ...{
      if (prefix != null && prefix!.isNotEmpty) 'prefix': prefix,
      'from': from,
      'to': to,
      if (pad > 0) 'pad': pad,
    },
  };

  /// A descending or empty range expands to nothing rather than looping
  /// forever or throwing at the user.
  static List<String> expandRange({
    String? prefix,
    required int from,
    required int to,
    int pad = 0,
  }) {
    if (to < from) return const <String>[];
    final head = prefix ?? '';
    return [
      for (var n = from; n <= to; n++) '$head${n.toString().padLeft(pad, '0')}',
    ];
  }

  /// Splits a typed list on commas and whitespace. Blanks and repeats go, the
  /// order the user typed stays — they are reading their own list back.
  static List<String> parseNumbers(String raw) {
    final seen = <String>{};
    final out = <String>[];
    for (final token in raw.split(RegExp(r'[,\s]+'))) {
      final trimmed = token.trim();
      if (trimmed.isEmpty) continue;
      if (seen.add(trimmed)) out.add(trimmed);
    }
    return out;
  }
}

/// How many rooms a bulk create actually made, and which numbers it left
/// alone. Naming the skipped numbers is the whole point — "3 of 5 created" on
/// its own sends someone hunting.
@immutable
class BulkRoomResult {
  const BulkRoomResult({
    required this.requested,
    required this.created,
    this.skipped = const <String>[],
    this.items = const <Room>[],
    this.propertyRoomCount,
  });

  final int requested;
  final int created;
  final List<String> skipped;
  final List<Room> items;
  final int? propertyRoomCount;

  bool get hasSkipped => skipped.isNotEmpty;

  factory BulkRoomResult.fromJson(Map json) => BulkRoomResult(
    requested: _int(json['requested']),
    created: _int(json['created']),
    skipped: json['skipped'] is List
        ? (json['skipped'] as List).map((s) => s.toString()).toList()
        : const <String>[],
    items: json['items'] is List
        ? (json['items'] as List)
              .whereType<Map>()
              .map(Room.fromJson)
              .toList(growable: false)
        : const <Room>[],
    propertyRoomCount: _intOrNull(
      _pick(json, ['propertyRoomCount', 'property_room_count']),
    ),
  );
}
