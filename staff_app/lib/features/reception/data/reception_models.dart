import 'package:flutter/foundation.dart';

import '../../../core/utils/formatting.dart';
import '../../../core/widgets/status_badge.dart';
import '../../rooms/data/room_models.dart' show BedType, formatPaise;

// ---------------------------------------------------------------- parsing --
//
// Same contract as the rooms feature: the server owns the shape, but a client
// that throws on one missing key strands the whole front desk. Every reader
// below takes what it can and falls back to something honest, so a field the
// backend adds or renames costs a value, never the screen.

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

double _double(dynamic value, [double fallback = 0]) {
  if (value is num) return value.toDouble();
  return double.tryParse((value ?? '').toString()) ?? fallback;
}

// ignore: unused_element
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

Map<String, dynamic>? _map(dynamic value) =>
    value is Map ? value.map((k, v) => MapEntry(k.toString(), v)) : null;

// ------------------------------------------------------------ stay dates --
//
// Stay dates are CALENDAR dates, never instants: a night is a night whether
// the guest walks in at 14:00 or at 23:00. Everything below therefore works on
// the date part alone, and `checkOut` is EXCLUSIVE — the morning the room
// frees up — exactly as the booking engine defines it.

/// A calendar date with the time thrown away, so two dates typed on the same
/// day always compare equal.
DateTime dateOnly(DateTime value) =>
    DateTime(value.year, value.month, value.day);

/// `YYYY-MM-DD` — the one date shape the reservations API accepts.
String isoDate(DateTime value) {
  String two(int n) => n.toString().padLeft(2, '0');
  return '${value.year.toString().padLeft(4, '0')}-'
      '${two(value.month)}-${two(value.day)}';
}

/// Nights between two calendar dates, check-out EXCLUSIVE: the 14th to the
/// 15th is ONE night. A backwards or same-day range is zero nights, which is
/// what makes it a refusal rather than a negative number on a form.
int nightsBetween(DateTime checkIn, DateTime checkOut) {
  final nights = dateOnly(checkOut).difference(dateOnly(checkIn)).inDays;
  return nights < 0 ? 0 : nights;
}

/// The client-side half of INVALID_DATES. Same-day turnover is legal between
/// two DIFFERENT bookings, but a single stay must cover at least one night.
bool datesInOrder(DateTime checkIn, DateTime checkOut) =>
    nightsBetween(checkIn, checkOut) >= 1;

// ------------------------------------------------------------------ enums --

enum ReservationStatus {
  pending('PENDING', 'Pending'),
  confirmed('CONFIRMED', 'Confirmed'),
  checkedIn('CHECKED_IN', 'In house'),
  checkedOut('CHECKED_OUT', 'Checked out'),
  cancelled('CANCELLED', 'Cancelled'),
  noShow('NO_SHOW', 'No show');

  const ReservationStatus(this.wire, this.label);

  final String wire;
  final String label;

  /// PENDING is a warning rather than a neutral: a held booking that nobody
  /// confirms is a room the hotel is neither selling nor keeping.
  StatusTone get tone => switch (this) {
    ReservationStatus.pending => StatusTone.warning,
    ReservationStatus.confirmed => StatusTone.info,
    ReservationStatus.checkedIn => StatusTone.occupied,
    ReservationStatus.checkedOut => StatusTone.neutral,
    ReservationStatus.cancelled => StatusTone.critical,
    ReservationStatus.noShow => StatusTone.critical,
  };

  /// One line of plain English, shown wherever a status needs explaining.
  String get hint => switch (this) {
    ReservationStatus.pending => 'Held, but not committed. Blocks nothing yet.',
    ReservationStatus.confirmed => 'Committed. The room is spoken for.',
    ReservationStatus.checkedIn => 'The guest is in the building.',
    ReservationStatus.checkedOut => 'Stay finished and settled.',
    ReservationStatus.cancelled => 'Called off before arrival.',
    ReservationStatus.noShow => 'Confirmed, never arrived.',
  };

  /// The transitions the server's map allows, mirrored so a button that would
  /// only earn an INVALID_TRANSITION is never offered.
  bool get canConfirm => this == ReservationStatus.pending;

  bool get canCheckIn => this == ReservationStatus.confirmed;

  bool get canCheckOut => this == ReservationStatus.checkedIn;

  bool get canCancel =>
      this == ReservationStatus.pending || this == ReservationStatus.confirmed;

  bool get canNoShow => this == ReservationStatus.confirmed;

  /// Still live: neither finished nor written off.
  bool get isOpen =>
      this == ReservationStatus.pending ||
      this == ReservationStatus.confirmed ||
      this == ReservationStatus.checkedIn;

  /// Falls back to PENDING — the least committal state there is, so an
  /// unrecognised value never makes a booking look sold.
  static ReservationStatus fromWire(String? value) {
    final normalised = _wire(value);
    for (final status in ReservationStatus.values) {
      if (status.wire == normalised) return status;
    }
    return ReservationStatus.pending;
  }
}

enum ReservationSource {
  walkIn('WALK_IN', 'Walk-in'),
  phone('PHONE', 'Phone'),
  email('EMAIL', 'Email'),
  ota('OTA', 'OTA'),
  other('OTHER', 'Other');

  const ReservationSource(this.wire, this.label);

  final String wire;
  final String label;

  /// The desk books more walk-ins than anything else, so that is the least
  /// surprising thing to show for a value nobody recognises.
  static ReservationSource fromWire(String? value) {
    final normalised = _wire(value);
    for (final source in ReservationSource.values) {
      if (source.wire == normalised) return source;
    }
    return ReservationSource.walkIn;
  }
}

// ---------------------------------------------------------- reservations --

/// A row from `GET /reservations` — one booking.
@immutable
class Reservation {
  const Reservation({
    required this.id,
    required this.reservationNumber,
    required this.roomTypeId,
    required this.guestName,
    required this.status,
    required this.checkIn,
    required this.checkOut,
    this.propertyId,
    this.roomTypeName,
    this.roomId,
    this.roomNumber,
    this.roomStatus,
    this.guestPhone,
    this.guestEmail,
    this.guestIdType,
    this.guestIdNumber,
    this.adults = 1,
    this.children = 0,
    this.nights = 0,
    this.ratePaise = 0,
    this.totalPaise = 0,
    this.paidPaise = 0,
    this.balancePaise = 0,
    this.currency = 'INR',
    this.source = ReservationSource.walkIn,
    this.notes,
    this.checkedInAt,
    this.checkedOutAt,
    this.cancelledAt,
    this.createdAt,
    this.updatedAt,
    this.events = const <ReservationEventEntry>[],
  });

  final String id;
  final String? propertyId;

  /// `RSV-XXXXXX`, unique per property. What the guest is quoted on the phone.
  final String reservationNumber;

  final String roomTypeId;
  final String? roomTypeName;

  /// Null until a room is actually assigned — a hotel sells "a Deluxe on the
  /// 14th", not "room 304".
  final String? roomId;
  final String? roomNumber;
  final String? roomStatus;

  final String guestName;
  final String? guestPhone;
  final String? guestEmail;
  final String? guestIdType;
  final String? guestIdNumber;
  final int adults;
  final int children;

  /// Calendar dates. [checkOut] is EXCLUSIVE.
  final DateTime? checkIn;
  final DateTime? checkOut;
  final int nights;

  final ReservationStatus status;

  /// All paise, all per the wire. Rupees happen at the edge, in the widgets.
  final int ratePaise;
  final int totalPaise;
  final int paidPaise;
  final int balancePaise;
  final String currency;

  final ReservationSource source;
  final String? notes;
  final DateTime? checkedInAt;
  final DateTime? checkedOutAt;
  final DateTime? cancelledAt;
  final DateTime? createdAt;
  final DateTime? updatedAt;

  /// Only `GET /reservations/:id` carries the trail; the list never does.
  final List<ReservationEventEntry> events;

  bool get roomAssigned => roomNumber != null && roomNumber!.isNotEmpty;

  int get guestCount => adults + children;

  StatusTone get tone => status.tone;

  String get roomLabel => roomAssigned ? 'Room $roomNumber' : 'No room';

  String get guestMixLabel =>
      '$adults ${adults == 1 ? 'adult' : 'adults'}'
      '${children > 0 ? ', $children ${children == 1 ? 'child' : 'children'}' : ''}';

  String get nightsLabel => '$nights ${nights == 1 ? 'night' : 'nights'}';

  String get rateLabel => '${formatPaise(ratePaise)} / night';

  String get totalLabel => formatPaise(totalPaise);

  String get balanceLabel => formatPaise(balancePaise);

  /// The one line every card prints under the guest's name.
  String get stayLine => [
    if (roomTypeName != null) roomTypeName!,
    nightsLabel,
    if (checkIn != null) Fmt.dayMonth(checkIn),
    source.label,
  ].join(' · ');

  factory Reservation.fromJson(Map json) {
    final checkIn = _date(_pick(json, ['checkIn', 'check_in']));
    final checkOut = _date(_pick(json, ['checkOut', 'check_out']));
    return Reservation(
      id: (json['id'] ?? '').toString(),
      propertyId: _str(_pick(json, ['propertyId', 'property_id'])),
      reservationNumber:
          _str(_pick(json, ['reservationNumber', 'reservation_number'])) ?? '—',
      roomTypeId: (_pick(json, ['roomTypeId', 'room_type_id']) ?? '').toString(),
      roomTypeName: _str(_pick(json, ['roomTypeName', 'room_type_name'])),
      roomId: _str(_pick(json, ['roomId', 'room_id'])),
      roomNumber: _str(_pick(json, ['roomNumber', 'room_number'])),
      roomStatus: _wire(_pick(json, ['roomStatus', 'room_status'])),
      guestName: _str(_pick(json, ['guestName', 'guest_name'])) ?? 'Guest',
      guestPhone: _str(_pick(json, ['guestPhone', 'guest_phone'])),
      guestEmail: _str(_pick(json, ['guestEmail', 'guest_email'])),
      guestIdType: _str(_pick(json, ['guestIdType', 'guest_id_type'])),
      guestIdNumber: _str(_pick(json, ['guestIdNumber', 'guest_id_number'])),
      adults: _int(json['adults'], 1),
      children: _int(json['children']),
      checkIn: checkIn,
      checkOut: checkOut,
      // The server sends `nights`, but deriving it when it is absent keeps a
      // half-filled payload from printing "0 nights" over a real stay.
      nights: _intOrNull(json['nights']) ??
          (checkIn != null && checkOut != null
              ? nightsBetween(checkIn, checkOut)
              : 0),
      status: ReservationStatus.fromWire(_str(json['status'])),
      ratePaise: _int(_pick(json, ['ratePaise', 'rate_paise'])),
      totalPaise: _int(_pick(json, ['totalPaise', 'total_paise'])),
      paidPaise: _int(_pick(json, ['paidPaise', 'paid_paise'])),
      balancePaise: _intOrNull(_pick(json, ['balancePaise', 'balance_paise'])) ??
          _int(_pick(json, ['totalPaise', 'total_paise'])) -
              _int(_pick(json, ['paidPaise', 'paid_paise'])),
      currency: _str(json['currency']) ?? 'INR',
      source: ReservationSource.fromWire(_str(json['source'])),
      notes: _str(json['notes']),
      checkedInAt: _date(_pick(json, ['checkedInAt', 'checked_in_at'])),
      checkedOutAt: _date(_pick(json, ['checkedOutAt', 'checked_out_at'])),
      cancelledAt: _date(_pick(json, ['cancelledAt', 'cancelled_at'])),
      createdAt: _date(_pick(json, ['createdAt', 'created_at'])),
      updatedAt: _date(_pick(json, ['updatedAt', 'updated_at'])),
      events: json['events'] is List
          ? (json['events'] as List)
                .whereType<Map>()
                .map(ReservationEventEntry.fromJson)
                .toList(growable: false)
          : const <ReservationEventEntry>[],
    );
  }

  Map<String, dynamic> toJson() => {
    'id': id,
    if (propertyId != null) 'propertyId': propertyId,
    'reservationNumber': reservationNumber,
    'roomTypeId': roomTypeId,
    if (roomTypeName != null) 'roomTypeName': roomTypeName,
    if (roomId != null) 'roomId': roomId,
    if (roomNumber != null) 'roomNumber': roomNumber,
    if (roomStatus != null) 'roomStatus': roomStatus,
    'guestName': guestName,
    if (guestPhone != null) 'guestPhone': guestPhone,
    if (guestEmail != null) 'guestEmail': guestEmail,
    if (guestIdType != null) 'guestIdType': guestIdType,
    if (guestIdNumber != null) 'guestIdNumber': guestIdNumber,
    'adults': adults,
    'children': children,
    if (checkIn != null) 'checkIn': isoDate(checkIn!),
    if (checkOut != null) 'checkOut': isoDate(checkOut!),
    'nights': nights,
    'status': status.wire,
    'ratePaise': ratePaise,
    'totalPaise': totalPaise,
    'paidPaise': paidPaise,
    'balancePaise': balancePaise,
    'currency': currency,
    'source': source.wire,
    if (notes != null) 'notes': notes,
  };
}

/// One row of the append-only transition trail on `GET /reservations/:id`.
@immutable
class ReservationEventEntry {
  const ReservationEventEntry({
    required this.id,
    required this.type,
    this.actorStaffId,
    this.payload,
    this.createdAt,
  });

  final String id;

  /// `created`, `confirmed`, `room_assigned`, `checked_in`, …
  final String type;
  final String? actorStaffId;
  final Map<String, dynamic>? payload;
  final DateTime? createdAt;

  String get label => Fmt.humanise(type);

  /// The one detail worth printing beside an event: a room number, a reason,
  /// a note. Anything richer belongs on the audit log, not on a timeline row.
  String? get detail {
    final p = payload;
    if (p == null) return null;
    for (final key in ['reason', 'note', 'roomNumber', 'room_number']) {
      final value = _str(p[key]);
      if (value != null) return value;
    }
    return null;
  }

  factory ReservationEventEntry.fromJson(Map json) => ReservationEventEntry(
    id: (json['id'] ?? '').toString(),
    type: _str(json['type']) ?? 'updated',
    actorStaffId: _str(_pick(json, ['actorStaffId', 'actor_staff_id'])),
    payload: _map(json['payload']),
    createdAt: _date(_pick(json, ['createdAt', 'created_at'])),
  );
}

// ------------------------------------------------------------ desk board --

/// The four figures across the top of the reception dashboard.
@immutable
class DeskCounts {
  const DeskCounts({
    this.arrivals = 0,
    this.departures = 0,
    this.inHouse = 0,
    this.availableRooms = 0,
    this.roomsDirty = 0,
    this.roomsReady = 0,
    this.walkInsToday = 0,
    this.pendingPaymentPaise = 0,
    this.pendingFolios = 0,
  });

  final int arrivals;
  final int departures;
  final int inHouse;
  final int availableRooms;

  /// Housekeeping's side of the board: rooms that need cleaning, and rooms
  /// cleaned + inspected and ready to sell.
  final int roomsDirty;
  final int roomsReady;

  /// Walk-in business taken since midnight.
  final int walkInsToday;

  /// What today's in-house and departing folios still owe, in total.
  final int pendingPaymentPaise;
  final int pendingFolios;

  factory DeskCounts.fromJson(Map json) => DeskCounts(
    arrivals: _int(json['arrivals']),
    departures: _int(json['departures']),
    inHouse: _int(_pick(json, ['inHouse', 'in_house'])),
    // The server's newer key wins; the original stays as the fallback so an
    // older API keeps the tile honest instead of zeroing it.
    availableRooms: _int(
      _pick(json, ['roomsAvailable', 'availableRooms', 'available_rooms']),
    ),
    roomsDirty: _int(_pick(json, ['roomsDirty', 'rooms_dirty'])),
    roomsReady: _int(_pick(json, ['roomsReady', 'rooms_ready'])),
    walkInsToday: _int(_pick(json, ['walkInsToday', 'walk_ins_today'])),
    pendingPaymentPaise: _int(
      _pick(json, ['pendingPaymentPaise', 'pending_payment_paise']),
    ),
    pendingFolios: _int(_pick(json, ['pendingFolios', 'pending_folios'])),
  );
}

/// `GET /desk/today` — the whole reception dashboard in one payload, so every
/// figure on it is from the same instant.
@immutable
class DeskBoard {
  const DeskBoard({
    this.date,
    this.arrivals = const <Reservation>[],
    this.departures = const <Reservation>[],
    this.inHouse = const <Reservation>[],
    this.counts = const DeskCounts(),
  });

  final String? date;
  final List<Reservation> arrivals;
  final List<Reservation> departures;
  final List<Reservation> inHouse;
  final DeskCounts counts;

  bool get isEmpty =>
      arrivals.isEmpty && departures.isEmpty && inHouse.isEmpty;

  static List<Reservation> _rows(dynamic value) => value is List
      ? value.whereType<Map>().map(Reservation.fromJson).toList(growable: false)
      : const <Reservation>[];

  factory DeskBoard.fromJson(Map json) => DeskBoard(
    date: _str(json['date']),
    arrivals: _rows(json['arrivals']),
    departures: _rows(json['departures']),
    inHouse: _rows(_pick(json, ['inHouse', 'in_house'])),
    counts: json['counts'] is Map
        ? DeskCounts.fromJson(json['counts'] as Map)
        : const DeskCounts(),
  );
}

// --------------------------------------------------------- GM dashboard --

/// The room-state breakdown behind the occupancy figure.
@immutable
class DashboardRooms {
  const DashboardRooms({
    this.total = 0,
    this.occupied = 0,
    this.available = 0,
    this.dirty = 0,
    this.maintenance = 0,
  });

  final int total;
  final int occupied;
  final int available;
  final int dirty;
  final int maintenance;

  factory DashboardRooms.fromJson(Map json) => DashboardRooms(
    total: _int(json['total']),
    occupied: _int(json['occupied']),
    available: _int(json['available']),
    dirty: _int(json['dirty']),
    maintenance: _int(json['maintenance']),
  );
}

/// `GET /dashboard` — the GM/AGM tiles, again in one call.
@immutable
class GmDashboard {
  const GmDashboard({
    this.date,
    this.occupancy = 0,
    this.rooms = const DashboardRooms(),
    this.arrivalsToday = 0,
    this.departuresToday = 0,
    this.inHouse = 0,
    this.monthRevenuePaise = 0,
    this.pendingApprovals = 0,
  });

  final String? date;

  /// A percentage, one decimal, already worked out server-side.
  final double occupancy;
  final DashboardRooms rooms;
  final int arrivalsToday;
  final int departuresToday;
  final int inHouse;

  /// An approximation the server documents as such: stays TOUCHING the month
  /// count whole. Good enough for a tile, never for accounts.
  final int monthRevenuePaise;
  final int pendingApprovals;

  String get monthRevenueLabel => formatPaise(monthRevenuePaise);

  factory GmDashboard.fromJson(Map json) => GmDashboard(
    date: _str(json['date']),
    occupancy: _double(json['occupancy']),
    rooms: json['rooms'] is Map
        ? DashboardRooms.fromJson(json['rooms'] as Map)
        : const DashboardRooms(),
    arrivalsToday: _int(_pick(json, ['arrivalsToday', 'arrivals_today'])),
    departuresToday: _int(_pick(json, ['departuresToday', 'departures_today'])),
    inHouse: _int(_pick(json, ['inHouse', 'in_house'])),
    monthRevenuePaise: _int(
      _pick(json, ['monthRevenuePaise', 'month_revenue_paise']),
    ),
    pendingApprovals: _int(
      _pick(json, ['pendingApprovals', 'pending_approvals']),
    ),
  );
}

// ------------------------------------------------------------ availability --

/// One room type's free-room count for a date range, from
/// `GET /reservations/availability`. The booking form prints it beside each
/// option so nobody picks a sold-out type and then gets refused.
@immutable
class RoomTypeAvailability {
  const RoomTypeAvailability({
    required this.roomTypeId,
    required this.name,
    this.bedType,
    this.maxOccupancy = 2,
    this.baseRate = 0,
    this.currency = 'INR',
    this.totalRooms = 0,
    this.bookedRooms = 0,
    this.availableRooms = 0,
  });

  final String roomTypeId;
  final String name;
  final BedType? bedType;
  final int maxOccupancy;

  /// Paise per night.
  final int baseRate;
  final String currency;
  final int totalRooms;
  final int bookedRooms;
  final int availableRooms;

  bool get soldOut => availableRooms <= 0;

  /// `Deluxe · 3 of 5 free`. A type with no rooms at all says so instead of
  /// claiming "0 of 0 free", which reads like a sell-out rather than a gap in
  /// the inventory.
  String get pickerLabel => totalRooms == 0
      ? '$name · no rooms yet'
      : '$name · $availableRooms of $totalRooms free';

  factory RoomTypeAvailability.fromJson(Map json) => RoomTypeAvailability(
    roomTypeId: (_pick(json, ['roomTypeId', 'room_type_id']) ?? '').toString(),
    name: _str(json['name']) ?? 'Room type',
    bedType: _pick(json, ['bedType', 'bed_type']) == null
        ? null
        : BedType.fromWire(_str(_pick(json, ['bedType', 'bed_type']))),
    maxOccupancy: _int(_pick(json, ['maxOccupancy', 'max_occupancy']), 2),
    baseRate: _int(_pick(json, ['baseRate', 'base_rate'])),
    currency: _str(json['currency']) ?? 'INR',
    totalRooms: _int(_pick(json, ['totalRooms', 'total_rooms'])),
    bookedRooms: _int(_pick(json, ['bookedRooms', 'booked_rooms'])),
    availableRooms: _int(_pick(json, ['availableRooms', 'available_rooms'])),
  );
}

// ---------------------------------------------------------------- filters --

/// The filter state of the bookings list.
@immutable
class ReservationFilter {
  const ReservationFilter({
    this.status,
    this.from,
    this.to,
    this.query,
    this.roomId,
    this.limit,
    this.offset,
  });

  final ReservationStatus? status;

  /// Inclusive bounds on the stay window, as calendar dates.
  final DateTime? from;
  final DateTime? to;

  /// Guest name, phone, or reservation number.
  final String? query;
  final String? roomId;
  final int? limit;
  final int? offset;

  bool get isEmpty =>
      status == null &&
      from == null &&
      to == null &&
      roomId == null &&
      (query == null || query!.isEmpty);

  /// What the date button reads. "Any dates" rather than a blank or a guessed
  /// range, so an unfiltered list never looks like it is hiding something.
  String get rangeLabel {
    if (from == null && to == null) return 'Any dates';
    if (from != null && to != null) {
      return '${Fmt.dayMonth(from)} – ${Fmt.dayMonth(to)}';
    }
    return from != null
        ? 'From ${Fmt.dayMonth(from)}'
        : 'Until ${Fmt.dayMonth(to)}';
  }

  ReservationFilter copyWith({
    ReservationStatus? status,
    DateTime? from,
    DateTime? to,
    String? query,
    String? roomId,
    int? limit,
    int? offset,
    bool clearStatus = false,
    bool clearDates = false,
    bool clearRoom = false,
  }) => ReservationFilter(
    status: clearStatus ? null : (status ?? this.status),
    from: clearDates ? null : (from ?? this.from),
    to: clearDates ? null : (to ?? this.to),
    query: query ?? this.query,
    roomId: clearRoom ? null : (roomId ?? this.roomId),
    limit: limit ?? this.limit,
    offset: offset ?? this.offset,
  );

  Map<String, dynamic> toQuery() => {
    if (status != null) 'status': status!.wire,
    if (from != null) 'from': isoDate(from!),
    if (to != null) 'to': isoDate(to!),
    if (query != null && query!.isNotEmpty) 'q': query,
    if (roomId != null && roomId!.isNotEmpty) 'roomId': roomId,
    if (limit != null) 'limit': limit,
    if (offset != null) 'offset': offset,
  };
}

/// What the calendar hands the booking form when a clerk taps an empty cell:
/// the room lane and the date they pointed at. Travels as go_router `extra`, so
/// it is null on a cold deep link and the form simply opens blank.
@immutable
class NewBookingSeed {
  const NewBookingSeed({this.checkIn, this.roomId, this.roomTypeId});

  final DateTime? checkIn;
  final String? roomId;
  final String? roomTypeId;
}

// --------------------------------------------------------------- payloads --

/// Payload for `POST /reservations`.
@immutable
class NewReservation {
  const NewReservation({
    required this.roomTypeId,
    required this.guestName,
    required this.guestPhone,
    required this.checkIn,
    required this.checkOut,
    this.roomId,
    this.guestEmail,
    this.guestIdType,
    this.guestIdNumber,
    this.adults = 1,
    this.children = 0,
    this.ratePaise,
    this.source,
    this.notes,
    this.confirmImmediately = false,
  });

  final String roomTypeId;

  /// Optional at booking time — reception usually picks the room on arrival.
  final String? roomId;
  final String guestName;
  final String guestPhone;
  final String? guestEmail;
  final String? guestIdType;
  final String? guestIdNumber;
  final int adults;
  final int children;
  final DateTime checkIn;

  /// EXCLUSIVE.
  final DateTime checkOut;

  /// Paise per night. Left null, the server snapshots the type's base rate.
  final int? ratePaise;
  final ReservationSource? source;
  final String? notes;

  /// A walk-in at the desk is never a soft hold, so the form can book straight
  /// into CONFIRMED rather than making the clerk press two buttons.
  final bool confirmImmediately;

  int get nights => nightsBetween(checkIn, checkOut);

  Map<String, dynamic> toJson() => {
    'roomTypeId': roomTypeId,
    if (roomId != null && roomId!.isNotEmpty) 'roomId': roomId,
    'guestName': guestName,
    'guestPhone': guestPhone,
    if (guestEmail != null && guestEmail!.isNotEmpty) 'guestEmail': guestEmail,
    if (guestIdType != null && guestIdType!.isNotEmpty)
      'guestIdType': guestIdType,
    if (guestIdNumber != null && guestIdNumber!.isNotEmpty)
      'guestIdNumber': guestIdNumber,
    'adults': adults,
    if (children > 0) 'children': children,
    'checkIn': isoDate(checkIn),
    'checkOut': isoDate(checkOut),
    if (ratePaise != null) 'ratePaise': ratePaise,
    if (source != null) 'source': source!.wire,
    if (notes != null && notes!.isNotEmpty) 'notes': notes,
    'status': confirmImmediately ? 'CONFIRMED' : 'PENDING',
  };
}

// --------------------------------------------------------------- check-in --

/// The guided check-in, reduced to the four things that actually happen at the
/// desk. Every step maps to something the API takes: the first two feed
/// `guestIdType`/`guestIdNumber`, the third feeds `roomId`, and the last is the
/// single POST that admits the guest.
enum CheckInStep {
  verifyGuest(
    'Verify guest',
    'Check the booking against the person standing in front of you.',
    'Booking checked',
  ),
  captureId(
    'Capture ID',
    'Record the passport or government ID the guest is presenting.',
    'ID recorded',
  ),
  assignRoom(
    'Assign room',
    'Pick a clean, ready room of the type this booking was sold as.',
    'Room assigned',
  ),
  confirm(
    'Confirm arrival',
    'Admit the guest and hand the room over.',
    'Checked in',
  );

  const CheckInStep(this.title, this.detail, this.doneLabel);

  final String title;
  final String detail;
  final String doneLabel;

  static List<CheckInStep> get ordered => CheckInStep.values;
}

// --------------------------------------------------------------- Folio ---

/// The itemised stay bill: the room charge, any ancillary charges posted from
/// restaurant/spa, every payment and refund, and the outstanding balance.
class Folio {
  const Folio({
    required this.roomChargePaise,
    required this.ancillaryPaise,
    required this.chargesPaise,
    required this.netPaidPaise,
    required this.balancePaise,
    required this.lineItems,
    required this.payments,
  });

  final int roomChargePaise;
  final int ancillaryPaise;
  final int chargesPaise;
  final int netPaidPaise;
  final int balancePaise;
  final List<FolioLineItem> lineItems;
  final List<FolioPayment> payments;

  bool get hasBalance => balancePaise > 0;
  String get roomChargeLabel => formatPaise(roomChargePaise);
  String get chargesLabel => formatPaise(chargesPaise);
  String get paidLabel => formatPaise(netPaidPaise);
  String get balanceLabel => formatPaise(balancePaise);

  factory Folio.fromJson(Map json) => Folio(
    roomChargePaise: _int(_pick(json, ['roomChargePaise', 'room_charge_paise'])),
    ancillaryPaise: _int(_pick(json, ['ancillaryPaise', 'ancillary_paise'])),
    chargesPaise: _int(_pick(json, ['chargesPaise', 'charges_paise'])),
    netPaidPaise: _int(_pick(json, ['netPaidPaise', 'net_paid_paise'])),
    balancePaise: _int(_pick(json, ['balancePaise', 'balance_paise'])),
    lineItems: (json['lineItems'] as List? ?? const [])
        .whereType<Map>()
        .map(FolioLineItem.fromJson)
        .toList(),
    payments: (json['payments'] as List? ?? const [])
        .whereType<Map>()
        .map(FolioPayment.fromJson)
        .toList(),
  );
}

class FolioLineItem {
  const FolioLineItem({
    required this.kind,
    required this.description,
    required this.amountPaise,
  });

  final String kind;
  final String description;
  final int amountPaise;

  String get amountLabel => formatPaise(amountPaise);

  factory FolioLineItem.fromJson(Map json) => FolioLineItem(
    kind: _str(json['kind']) ?? 'MISC',
    description: _str(json['description']) ?? '',
    amountPaise: _int(_pick(json, ['amountPaise', 'amount_paise'])),
  );
}

class FolioPayment {
  const FolioPayment({
    required this.direction,
    required this.method,
    required this.amountPaise,
    this.reference,
  });

  final String direction;
  final String method;
  final int amountPaise;
  final String? reference;

  bool get isRefund => direction == 'REFUND';
  String get amountLabel => formatPaise(amountPaise);

  factory FolioPayment.fromJson(Map json) => FolioPayment(
    direction: _str(json['direction']) ?? 'PAYMENT',
    method: _str(json['method']) ?? 'CASH',
    amountPaise: _int(_pick(json, ['amountPaise', 'amount_paise'])),
    reference: _str(json['reference']),
  );
}

/// The payment methods the desk can record — mirrors the server's
/// folioPaymentMethodValues.
const kFolioPaymentMethods = <String>['CASH', 'CARD', 'UPI', 'BANK', 'ONLINE'];
