import 'package:flutter/foundation.dart';

import '../../../core/widgets/status_badge.dart';

// Local parsing helpers, kept private so this file reads on its own. They match
// the tolerant style of room_models.dart: a field the server has not sent yet
// degrades to a sensible value rather than throwing on a half-filled payload.
String? _str(Object? v) {
  final t = v?.toString().trim();
  return (t == null || t.isEmpty) ? null : t;
}

int _int(Object? v, [int fallback = 0]) {
  if (v is int) return v;
  if (v is num) return v.toInt();
  return int.tryParse((v ?? '').toString()) ?? fallback;
}

int? _intOrNull(Object? v) {
  if (v == null) return null;
  if (v is int) return v;
  if (v is num) return v.toInt();
  return int.tryParse(v.toString());
}

bool _bool(Object? v) =>
    v == true || v == 1 || v.toString().toLowerCase() == 'true';

String? _norm(Object? v) =>
    _str(v)?.toUpperCase().replaceAll(RegExp(r'[\s-]+'), '_');

Object? _pick(Map json, List<String> keys) {
  for (final k in keys) {
    if (json[k] != null) return json[k];
  }
  return null;
}

/// Money as the wire carries it — paise — rendered as rupees for people.
String rupees(int paise) {
  final whole = paise ~/ 100;
  final buf = StringBuffer();
  final digits = whole.abs().toString();
  // Indian grouping: last three, then pairs (12,34,567).
  for (var i = 0; i < digits.length; i++) {
    final fromEnd = digits.length - i;
    buf.write(digits[i]);
    if (fromEnd > 3 && (fromEnd - 3).isOdd && i != digits.length - 1) {
      buf.write(',');
    } else if (fromEnd == 4 && i != digits.length - 1) {
      buf.write(',');
    }
  }
  return '${whole < 0 ? '-' : ''}₹${buf.toString()}';
}

/// Basis points as a human percentage: 1800 → "18", 1250 → "12.5", 1205 → "12.05".
String percentLabel(int basisPoints) {
  if (basisPoints % 100 == 0) return '${basisPoints ~/ 100}';
  final text = (basisPoints / 100).toStringAsFixed(2);
  return text.endsWith('0') ? text.substring(0, text.length - 1) : text;
}

// ---------------------------------------------------------------- room type --

/// Whether guests may smoke in this room type.
enum SmokingPolicy {
  nonSmoking('NON_SMOKING', 'Non-smoking'),
  smoking('SMOKING', 'Smoking'),
  both('BOTH', 'Allow both');

  const SmokingPolicy(this.wire, this.label);
  final String wire;
  final String label;

  static SmokingPolicy fromWire(Object? v) {
    final n = _norm(v);
    for (final p in SmokingPolicy.values) {
      if (p.wire == n) return p;
    }
    return SmokingPolicy.nonSmoking;
  }
}

/// The unit a floor size is quoted in. The server also keeps a square-feet
/// figure in sync so older screens keep reading one number.
enum SizeUnit {
  sqm('SQM', 'm²'),
  sqft('SQFT', 'ft²');

  const SizeUnit(this.wire, this.label);
  final String wire;
  final String label;

  static SizeUnit fromWire(Object? v) =>
      _norm(v) == SizeUnit.sqm.wire ? SizeUnit.sqm : SizeUnit.sqft;
}

/// The accommodation shape a type is sold as. `unitKind` on the server is a
/// narrower ROOM|VILLA flag that drives villa maths; this is the guest-facing
/// label shown on the list and in the form.
enum AccommodationType {
  room('ROOM', 'Room'),
  suite('SUITE', 'Suite'),
  villa('VILLA', 'Villa'),
  apartment('APARTMENT', 'Apartment'),
  dormitory('DORMITORY', 'Dormitory'),
  cabin('CABIN', 'Cabin'),
  bungalow('BUNGALOW', 'Bungalow'),
  tent('TENT', 'Tent'),
  other('OTHER', 'Other');

  const AccommodationType(this.wire, this.label);
  final String wire;
  final String label;

  /// Whole-unit shapes bill and count differently from a single room — the
  /// server's `unitKind` VILLA flag covers exactly these.
  bool get isWholeUnit =>
      this == AccommodationType.villa ||
      this == AccommodationType.apartment ||
      this == AccommodationType.cabin ||
      this == AccommodationType.bungalow;

  static AccommodationType fromWire(Object? v) {
    final n = _norm(v);
    for (final t in AccommodationType.values) {
      if (t.wire == n) return t;
    }
    return AccommodationType.room;
  }
}

/// Where a photo belongs in the gallery.
enum PhotoCategory {
  room('ROOM', 'Room'),
  bathroom('BATHROOM', 'Bathroom'),
  exterior('EXTERIOR', 'Exterior'),
  view('VIEW', 'View'),
  amenities('AMENITIES', 'Amenities'),
  other('OTHER', 'Other');

  const PhotoCategory(this.wire, this.label);
  final String wire;
  final String label;

  static PhotoCategory fromWire(Object? v) {
    final n = _norm(v);
    for (final c in PhotoCategory.values) {
      if (c.wire == n) return c;
    }
    return PhotoCategory.room;
  }
}

/// One uploaded image. `url` is a short-lived presigned link — never a stored
/// address, so it is re-fetched with the room type rather than cached.
@immutable
/// What a photo gallery hangs off.
///
/// Rooms and room types store photos identically — the same columns, the same
/// endpoints one path segment apart — so the repository, the providers and the
/// gallery section are written once and told which one they are looking at.
/// Value equality matters: this keys a provider family.
class PhotoOwner {
  const PhotoOwner.roomType(this.id) : segment = 'room-types';
  const PhotoOwner.room(this.id) : segment = 'rooms';

  final String id;
  final String segment;

  bool get isRoom => segment == 'rooms';

  /// The collection URL. Every photo call is this plus a suffix.
  String get path => '/$segment/$id/photos';

  /// What to call the thing in a sentence the hotelier reads.
  String get noun => isRoom ? 'room' : 'room type';

  @override
  bool operator ==(Object other) =>
      other is PhotoOwner && other.id == id && other.segment == segment;

  @override
  int get hashCode => Object.hash(id, segment);
}

class RoomTypePhoto {
  const RoomTypePhoto({
    required this.id,
    required this.url,
    this.category = PhotoCategory.room,
    this.isPrimary = false,
    this.sortOrder = 0,
  });

  final String id;
  final String url;
  final PhotoCategory category;
  final bool isPrimary;
  final int sortOrder;

  factory RoomTypePhoto.fromJson(Map json) => RoomTypePhoto(
    id: (json['id'] ?? '').toString(),
    url: (json['url'] ?? '').toString(),
    category: PhotoCategory.fromWire(json['category']),
    isPrimary: _bool(_pick(json, ['isPrimary', 'is_primary'])),
    sortOrder: _int(_pick(json, ['sortOrder', 'sort_order'])),
  );
}

// --------------------------------------------------------------- rate plans --

enum MealPlan {
  roomOnly('ROOM_ONLY', 'Room only'),
  breakfast('BREAKFAST', 'Breakfast'),
  halfBoard('HALF_BOARD', 'Half board'),
  fullBoard('FULL_BOARD', 'Full board'),
  allInclusive('ALL_INCLUSIVE', 'All inclusive');

  const MealPlan(this.wire, this.label);
  final String wire;
  final String label;

  static MealPlan fromWire(Object? v) {
    final n = _norm(v);
    for (final m in MealPlan.values) {
      if (m.wire == n) return m;
    }
    return MealPlan.roomOnly;
  }
}

enum CancellationPolicy {
  flexible('FLEXIBLE', 'Flexible'),
  nonRefundable('NON_REFUNDABLE', 'Non-refundable'),
  custom('CUSTOM', 'Custom');

  const CancellationPolicy(this.wire, this.label);
  final String wire;
  final String label;

  StatusTone get tone => this == CancellationPolicy.nonRefundable
      ? StatusTone.warning
      : StatusTone.neutral;

  static CancellationPolicy fromWire(Object? v) {
    final n = _norm(v);
    for (final p in CancellationPolicy.values) {
      if (p.wire == n) return p;
    }
    return CancellationPolicy.flexible;
  }
}

enum PaymentPolicy {
  payAtProperty('PAY_AT_PROPERTY', 'Pay at property'),
  prepaid('PREPAID', 'Prepaid'),
  partial('PARTIAL', 'Partial payment'),
  custom('CUSTOM', 'Custom');

  const PaymentPolicy(this.wire, this.label);
  final String wire;
  final String label;

  static PaymentPolicy fromWire(Object? v) {
    final n = _norm(v);
    for (final p in PaymentPolicy.values) {
      if (p.wire == n) return p;
    }
    return PaymentPolicy.payAtProperty;
  }
}

enum RatePlanStatus {
  active('ACTIVE', 'Active'),
  inactive('INACTIVE', 'Inactive');

  const RatePlanStatus(this.wire, this.label);
  final String wire;
  final String label;

  StatusTone get tone =>
      this == RatePlanStatus.active ? StatusTone.available : StatusTone.neutral;

  static RatePlanStatus fromWire(Object? v) =>
      _norm(v) == RatePlanStatus.inactive.wire
      ? RatePlanStatus.inactive
      : RatePlanStatus.active;
}

/// A way of selling one room type: a price plus the rules attached to it.
@immutable
class RatePlan {
  const RatePlan({
    required this.id,
    required this.roomTypeId,
    required this.name,
    required this.basePricePaise,
    this.currency = 'INR',
    this.mealPlan = MealPlan.roomOnly,
    this.cancellationPolicy = CancellationPolicy.flexible,
    this.cancellationNote,
    this.paymentPolicy = PaymentPolicy.payAtProperty,
    this.minStay,
    this.maxStay,
    this.minAdvanceDays,
    this.maxAdvanceDays,
    this.extraAdultPaise = 0,
    this.extraChildPaise = 0,
    this.extraInfantPaise = 0,
    this.status = RatePlanStatus.active,
    this.sortOrder = 0,
  });

  final String id;
  final String roomTypeId;
  final String name;
  final int basePricePaise;
  final String currency;
  final MealPlan mealPlan;
  final CancellationPolicy cancellationPolicy;
  final String? cancellationNote;
  final PaymentPolicy paymentPolicy;
  final int? minStay;
  final int? maxStay;
  final int? minAdvanceDays;
  final int? maxAdvanceDays;
  final int extraAdultPaise;
  final int extraChildPaise;
  final int extraInfantPaise;
  final RatePlanStatus status;
  final int sortOrder;

  bool get isActive => status == RatePlanStatus.active;

  /// The one-line summary the plan list shows under the price.
  String get summary => [
    mealPlan.label,
    cancellationPolicy.label,
    if (minStay != null) 'min $minStay ${minStay == 1 ? 'night' : 'nights'}',
  ].join(' · ');

  factory RatePlan.fromJson(Map json) => RatePlan(
    id: (json['id'] ?? '').toString(),
    roomTypeId: (_pick(json, ['roomTypeId', 'room_type_id']) ?? '').toString(),
    name: (json['name'] ?? '').toString(),
    basePricePaise: _int(_pick(json, ['basePricePaise', 'base_price_paise'])),
    currency: _str(json['currency']) ?? 'INR',
    mealPlan: MealPlan.fromWire(_pick(json, ['mealPlan', 'meal_plan'])),
    cancellationPolicy: CancellationPolicy.fromWire(
      _pick(json, ['cancellationPolicy', 'cancellation_policy']),
    ),
    cancellationNote: _str(
      _pick(json, ['cancellationNote', 'cancellation_note']),
    ),
    paymentPolicy: PaymentPolicy.fromWire(
      _pick(json, ['paymentPolicy', 'payment_policy']),
    ),
    minStay: _intOrNull(_pick(json, ['minStay', 'min_stay'])),
    maxStay: _intOrNull(_pick(json, ['maxStay', 'max_stay'])),
    minAdvanceDays: _intOrNull(
      _pick(json, ['minAdvanceDays', 'min_advance_days']),
    ),
    maxAdvanceDays: _intOrNull(
      _pick(json, ['maxAdvanceDays', 'max_advance_days']),
    ),
    extraAdultPaise: _int(
      _pick(json, ['extraAdultPaise', 'extra_adult_paise']),
    ),
    extraChildPaise: _int(
      _pick(json, ['extraChildPaise', 'extra_child_paise']),
    ),
    extraInfantPaise: _int(
      _pick(json, ['extraInfantPaise', 'extra_infant_paise']),
    ),
    status: RatePlanStatus.fromWire(json['status']),
    sortOrder: _int(_pick(json, ['sortOrder', 'sort_order'])),
  );
}

/// The write payload for a rate plan. Separate from [RatePlan] because the
/// server owns id/sortOrder and the form must not invent them.
@immutable
class RatePlanInput {
  const RatePlanInput({
    required this.roomTypeId,
    required this.name,
    required this.basePricePaise,
    this.mealPlan = MealPlan.roomOnly,
    this.cancellationPolicy = CancellationPolicy.flexible,
    this.cancellationNote,
    this.paymentPolicy = PaymentPolicy.payAtProperty,
    this.minStay,
    this.maxStay,
    this.minAdvanceDays,
    this.maxAdvanceDays,
    this.extraAdultPaise = 0,
    this.extraChildPaise = 0,
    this.extraInfantPaise = 0,
    this.status = RatePlanStatus.active,
  });

  final String roomTypeId;
  final String name;
  final int basePricePaise;
  final MealPlan mealPlan;
  final CancellationPolicy cancellationPolicy;
  final String? cancellationNote;
  final PaymentPolicy paymentPolicy;
  final int? minStay;
  final int? maxStay;
  final int? minAdvanceDays;
  final int? maxAdvanceDays;
  final int extraAdultPaise;
  final int extraChildPaise;
  final int extraInfantPaise;
  final RatePlanStatus status;

  Map<String, dynamic> toJson() => {
    'roomTypeId': roomTypeId,
    'name': name,
    'basePricePaise': basePricePaise,
    'mealPlan': mealPlan.wire,
    'cancellationPolicy': cancellationPolicy.wire,
    if (cancellationNote != null && cancellationNote!.isNotEmpty)
      'cancellationNote': cancellationNote,
    'paymentPolicy': paymentPolicy.wire,
    if (minStay != null) 'minStay': minStay,
    if (maxStay != null) 'maxStay': maxStay,
    if (minAdvanceDays != null) 'minAdvanceDays': minAdvanceDays,
    if (maxAdvanceDays != null) 'maxAdvanceDays': maxAdvanceDays,
    'extraAdultPaise': extraAdultPaise,
    'extraChildPaise': extraChildPaise,
    'extraInfantPaise': extraInfantPaise,
    'status': status.wire,
  };
}

// ------------------------------------------------------------ taxes & fees --

enum FeeKind {
  tax('TAX', 'Tax'),
  fee('FEE', 'Fee'),
  service('SERVICE', 'Service charge'),
  cityTax('CITY_TAX', 'Tourism / city tax');

  const FeeKind(this.wire, this.label);
  final String wire;
  final String label;

  static FeeKind fromWire(Object? v) {
    final n = _norm(v);
    for (final k in FeeKind.values) {
      if (k.wire == n) return k;
    }
    return FeeKind.tax;
  }
}

enum FeeCalculation {
  percent('PERCENT', 'Percentage'),
  fixed('FIXED', 'Fixed amount');

  const FeeCalculation(this.wire, this.label);
  final String wire;
  final String label;

  static FeeCalculation fromWire(Object? v) =>
      _norm(v) == FeeCalculation.fixed.wire
      ? FeeCalculation.fixed
      : FeeCalculation.percent;
}

enum FeeBasis {
  perRoom('PER_ROOM', 'Per room'),
  perGuest('PER_GUEST', 'Per guest');

  const FeeBasis(this.wire, this.label);
  final String wire;
  final String label;

  static FeeBasis fromWire(Object? v) =>
      _norm(v) == FeeBasis.perGuest.wire ? FeeBasis.perGuest : FeeBasis.perRoom;
}

enum FeePeriod {
  perNight('PER_NIGHT', 'Per night'),
  perStay('PER_STAY', 'Per stay');

  const FeePeriod(this.wire, this.label);
  final String wire;
  final String label;

  static FeePeriod fromWire(Object? v) => _norm(v) == FeePeriod.perStay.wire
      ? FeePeriod.perStay
      : FeePeriod.perNight;
}

/// A tax, service charge or fee added on top of (or extracted from) the rate.
///
/// `value` is BASIS POINTS for a percentage (1250 = 12.5%) and paise for a
/// fixed amount — the same encoding the server stores, so nothing is lost to
/// floating point on the way through.
@immutable
class RoomTypeFee {
  const RoomTypeFee({
    required this.id,
    required this.roomTypeId,
    required this.name,
    required this.value,
    this.kind = FeeKind.tax,
    this.calculation = FeeCalculation.percent,
    this.basis = FeeBasis.perRoom,
    this.period = FeePeriod.perNight,
    this.sortOrder = 0,
  });

  final String id;
  final String roomTypeId;
  final String name;
  final int value;
  final FeeKind kind;
  final FeeCalculation calculation;
  final FeeBasis basis;
  final FeePeriod period;
  final int sortOrder;

  /// "12.5%" or "₹250". Basis points render with only the decimals they
  /// actually carry — 1250 is 12.5%, not 12.50%.
  String get valueLabel => calculation == FeeCalculation.percent
      ? '${percentLabel(value)}%'
      : rupees(value);

  String get ruleLabel => '${basis.label} · ${period.label}';

  factory RoomTypeFee.fromJson(Map json) => RoomTypeFee(
    id: (json['id'] ?? '').toString(),
    roomTypeId: (_pick(json, ['roomTypeId', 'room_type_id']) ?? '').toString(),
    name: (json['name'] ?? '').toString(),
    value: _int(json['value']),
    kind: FeeKind.fromWire(json['kind']),
    calculation: FeeCalculation.fromWire(json['calculation']),
    basis: FeeBasis.fromWire(json['basis']),
    period: FeePeriod.fromWire(json['period']),
    sortOrder: _int(_pick(json, ['sortOrder', 'sort_order'])),
  );

  Map<String, dynamic> toJson() => {
    'name': name,
    'kind': kind.wire,
    'calculation': calculation.wire,
    'value': value,
    'basis': basis.wire,
    'period': period.wire,
  };
}

// ----------------------------------------------------------- dynamic pricing --

enum PricingTrigger {
  occupancy('OCCUPANCY', 'Occupancy', 'When occupancy is'),
  dayOfWeek('DAY_OF_WEEK', 'Day of week', 'On weekday'),
  season('SEASON', 'Season', 'Between dates'),
  lengthOfStay('LENGTH_OF_STAY', 'Length of stay', 'When the stay is'),
  advanceBooking('ADVANCE_BOOKING', 'Advance booking', 'When booked'),
  specialDate('SPECIAL_DATE', 'Special date', 'On dates');

  const PricingTrigger(this.wire, this.label, this.clause);
  final String wire;
  final String label;

  /// How the rule reads in a sentence on the card.
  final String clause;

  /// What the threshold means, so the input can label its own unit.
  String get unit => switch (this) {
    PricingTrigger.occupancy => '%',
    PricingTrigger.lengthOfStay => 'nights',
    PricingTrigger.advanceBooking => 'days ahead',
    PricingTrigger.dayOfWeek => 'weekday',
    _ => '',
  };

  bool get usesDates =>
      this == PricingTrigger.season || this == PricingTrigger.specialDate;

  static PricingTrigger fromWire(Object? v) {
    final n = _norm(v);
    for (final t in PricingTrigger.values) {
      if (t.wire == n) return t;
    }
    return PricingTrigger.occupancy;
  }
}

enum Comparator {
  gt('GT', 'greater than'),
  gte('GTE', 'at least'),
  lt('LT', 'less than'),
  lte('LTE', 'at most'),
  eq('EQ', 'exactly');

  const Comparator(this.wire, this.label);
  final String wire;
  final String label;

  static Comparator fromWire(Object? v) {
    final n = _norm(v);
    for (final c in Comparator.values) {
      if (c.wire == n) return c;
    }
    return Comparator.gte;
  }
}

enum AdjustmentKind {
  percent('PERCENT', 'Percentage'),
  fixed('FIXED', 'Fixed amount');

  const AdjustmentKind(this.wire, this.label);
  final String wire;
  final String label;

  static AdjustmentKind fromWire(Object? v) =>
      _norm(v) == AdjustmentKind.fixed.wire
      ? AdjustmentKind.fixed
      : AdjustmentKind.percent;
}

/// One dynamic-pricing rule, e.g. "when occupancy is at least 80%, increase the
/// rate by 15%". `adjustmentValue` is basis points for a percentage and paise
/// for a fixed amount; negative means a discount.
@immutable
class PricingRule {
  const PricingRule({
    required this.id,
    required this.roomTypeId,
    required this.trigger,
    required this.adjustmentValue,
    this.comparator = Comparator.gte,
    this.threshold,
    this.startDate,
    this.endDate,
    this.adjustmentKind = AdjustmentKind.percent,
    this.enabled = true,
    this.priority = 0,
  });

  final String id;
  final String roomTypeId;
  final PricingTrigger trigger;
  final Comparator comparator;
  final int? threshold;
  final DateTime? startDate;
  final DateTime? endDate;
  final AdjustmentKind adjustmentKind;
  final int adjustmentValue;
  final bool enabled;
  final int priority;

  bool get isIncrease => adjustmentValue >= 0;

  /// "Increase by 15%" / "Reduce by ₹200".
  String get adjustmentLabel {
    final magnitude = adjustmentValue.abs();
    final amount = adjustmentKind == AdjustmentKind.percent
        ? '${percentLabel(magnitude)}%'
        : rupees(magnitude);
    return '${isIncrease ? 'Increase' : 'Reduce'} by $amount';
  }

  /// The condition half, read as a sentence.
  String get conditionLabel {
    if (trigger.usesDates) {
      String d(DateTime? v) => v == null ? '—' : '${v.day}/${v.month}';
      return '${trigger.clause} ${d(startDate)} – ${d(endDate)}';
    }
    return '${trigger.clause} ${comparator.label} ${threshold ?? 0}'
        '${trigger.unit.isEmpty ? '' : ' ${trigger.unit}'}';
  }

  factory PricingRule.fromJson(Map json) => PricingRule(
    id: (json['id'] ?? '').toString(),
    roomTypeId: (_pick(json, ['roomTypeId', 'room_type_id']) ?? '').toString(),
    trigger: PricingTrigger.fromWire(json['trigger']),
    comparator: Comparator.fromWire(json['comparator']),
    threshold: _intOrNull(json['threshold']),
    startDate: DateTime.tryParse(
      (_pick(json, ['startDate', 'start_date']) ?? '').toString(),
    ),
    endDate: DateTime.tryParse(
      (_pick(json, ['endDate', 'end_date']) ?? '').toString(),
    ),
    adjustmentKind: AdjustmentKind.fromWire(
      _pick(json, ['adjustmentKind', 'adjustment_kind']),
    ),
    adjustmentValue: _int(_pick(json, ['adjustmentValue', 'adjustment_value'])),
    enabled: json['enabled'] == null ? true : _bool(json['enabled']),
    priority: _int(json['priority']),
  );

  Map<String, dynamic> toJson() => {
    'trigger': trigger.wire,
    'comparator': comparator.wire,
    if (threshold != null) 'threshold': threshold,
    if (startDate != null) 'startDate': _isoDate(startDate!),
    if (endDate != null) 'endDate': _isoDate(endDate!),
    'adjustmentKind': adjustmentKind.wire,
    'adjustmentValue': adjustmentValue,
    'enabled': enabled,
  };
}

String _isoDate(DateTime v) =>
    '${v.year.toString().padLeft(4, '0')}-'
    '${v.month.toString().padLeft(2, '0')}-'
    '${v.day.toString().padLeft(2, '0')}';

// ------------------------------------------------------ inventory summary --

/// The live unit counts behind one room type, taken from the rooms board — not
/// recomputed here, so the summary and the board can never disagree.
@immutable
class UnitInventory {
  const UnitInventory({
    this.total = 0,
    this.available = 0,
    this.occupied = 0,
    this.blocked = 0,
    this.outOfService = 0,
  });

  final int total;
  final int available;
  final int occupied;
  final int blocked;
  final int outOfService;
}

// ---------------------------------------------------------- sales channels --

/// One channel-manager connection the platform holds for this property.
///
/// `status` stays a plain string rather than an enum: it is the integration
/// health the server writes (`HEALTHY`, `WARNING`, `ERROR`, and whatever an
/// operator sets by hand), and the app only ever needs to know "is this usable"
/// — which the server already answers in [connected] — plus the raw word to
/// show when it is not. An enum here would have to guess at values it does not
/// own and would go stale the moment a new one appears.
@immutable
class ChannelConnection {
  const ChannelConnection({
    required this.id,
    required this.provider,
    required this.status,
    required this.connected,
    this.errorCount = 0,
    this.detail,
    this.channelPropertyId,
  });

  final String id;
  final String provider;
  final String status;
  final bool connected;
  final int errorCount;
  final String? detail;

  /// The property's id on the provider's side, when the admin has set one.
  final String? channelPropertyId;

  /// "channex" -> "Channex". The provider column is a slug, not display copy.
  String get providerLabel => provider.isEmpty
      ? 'Channel'
      : provider[0].toUpperCase() + provider.substring(1);

  /// What the badge says: connected, or the reason it is not.
  String get statusLabel => connected
      ? 'Connected'
      : (status.isEmpty ? 'Not connected' : _title(status));

  StatusTone get statusTone {
    if (connected) return StatusTone.available;
    return status.toUpperCase() == 'ERROR'
        ? StatusTone.critical
        : StatusTone.neutral;
  }

  static ChannelConnection fromJson(Map json) => ChannelConnection(
    id: (json['id'] ?? '').toString(),
    provider: _str(json['provider']) ?? '',
    status: _str(json['status']) ?? '',
    connected: _bool(json['connected']),
    errorCount: _int(_pick(json, ['errorCount', 'error_count'])),
    detail: _str(json['detail']),
    channelPropertyId: _str(
      _pick(json, ['channexPropertyId', 'channex_property_id']),
    ),
  );
}

/// One connection as seen from ONE room type: the same health, plus whether
/// this room type has been pointed at its counterpart on the channel.
@immutable
class ChannelMapping {
  const ChannelMapping({
    required this.connectionId,
    required this.provider,
    required this.status,
    required this.connected,
    required this.mapped,
    this.channelRoomTypeId,
    this.channelRatePlanId,
  });

  final String connectionId;
  final String provider;
  final String status;
  final bool connected;
  final bool mapped;
  final String? channelRoomTypeId;
  final String? channelRatePlanId;

  String get providerLabel => ChannelConnection(
    id: connectionId,
    provider: provider,
    status: status,
    connected: connected,
  ).providerLabel;

  String get statusLabel => ChannelConnection(
    id: connectionId,
    provider: provider,
    status: status,
    connected: connected,
  ).statusLabel;

  StatusTone get statusTone => ChannelConnection(
    id: connectionId,
    provider: provider,
    status: status,
    connected: connected,
  ).statusTone;

  static ChannelMapping fromJson(Map json) => ChannelMapping(
    connectionId: (_pick(json, ['connectionId', 'connection_id']) ?? '')
        .toString(),
    provider: _str(json['provider']) ?? '',
    status: _str(json['status']) ?? '',
    connected: _bool(json['connected']),
    mapped: _bool(json['mapped']),
    channelRoomTypeId: _str(
      _pick(json, ['channelRoomTypeId', 'channel_room_type_id']),
    ),
    channelRatePlanId: _str(
      _pick(json, ['channelRatePlanId', 'channel_rate_plan_id']),
    ),
  );
}

/// `HEALTHY` / `not_connected` -> `Healthy` / `Not connected`.
String _title(String raw) {
  final words = raw.toLowerCase().replaceAll('_', ' ').trim();
  if (words.isEmpty) return raw;
  return words[0].toUpperCase() + words.substring(1);
}
