// Property configuration models — the settings document and the four small
// catalogues (taxes, policies, add-ons, booking sources). Wire shapes match
// `src/modules/property-config`; every parser is tolerant so an older server
// still renders.

String? _str(Object? v) => v?.toString();
int _int(Object? v) => v is int ? v : int.tryParse('$v') ?? 0;
int? _intOrNull(Object? v) =>
    v == null ? null : (v is int ? v : int.tryParse('$v'));
bool _bool(Object? v) => v == true || v == 'true';

enum CheckinModel {
  single('SINGLE', 'Single check-in time'),
  threeSlot('THREE_SLOT', 'Three arrival windows'),
  hourly('HOURLY', 'Hourly stays');

  const CheckinModel(this.wire, this.label);
  final String wire;
  final String label;
  static CheckinModel fromWire(Object? v) =>
      values.firstWhere((e) => e.wire == v, orElse: () => CheckinModel.single);
}

class PropertySettings {
  const PropertySettings({
    this.gstin,
    this.gstStateCode,
    this.pricesIncludeTax = false,
    this.invoicePrefix = 'INV',
    this.invoiceNextNumber = 1,
    this.invoiceFooter,
    this.invoiceShowGstin = true,
    this.invoiceShowHsn = true,
    this.invoiceShowBreakup = true,
    this.checkinModel = CheckinModel.single,
    this.checkinTime = '14:00',
    this.checkoutTime = '11:00',
    this.holdExpiryMinutes,
    this.bookingEngineEnabled = false,
    this.bookingEngineSlug,
    this.brandColor,
    this.bookingTerms,
    this.currency = 'INR',
  });

  final String? gstin;
  final String? gstStateCode;
  final bool pricesIncludeTax;
  final String invoicePrefix;
  final int invoiceNextNumber;
  final String? invoiceFooter;
  final bool invoiceShowGstin;
  final bool invoiceShowHsn;
  final bool invoiceShowBreakup;
  final CheckinModel checkinModel;
  final String checkinTime;
  final String checkoutTime;
  final int? holdExpiryMinutes;
  final bool bookingEngineEnabled;
  final String? bookingEngineSlug;
  final String? brandColor;
  final String? bookingTerms;
  final String currency;

  factory PropertySettings.fromJson(Map j) => PropertySettings(
    gstin: _str(j['gstin']),
    gstStateCode: _str(j['gstStateCode']),
    pricesIncludeTax: _bool(j['pricesIncludeTax']),
    invoicePrefix: _str(j['invoicePrefix']) ?? 'INV',
    invoiceNextNumber: _int(j['invoiceNextNumber']),
    invoiceFooter: _str(j['invoiceFooter']),
    invoiceShowGstin: j['invoiceShowGstin'] == null
        ? true
        : _bool(j['invoiceShowGstin']),
    invoiceShowHsn: j['invoiceShowHsn'] == null
        ? true
        : _bool(j['invoiceShowHsn']),
    invoiceShowBreakup: j['invoiceShowBreakup'] == null
        ? true
        : _bool(j['invoiceShowBreakup']),
    checkinModel: CheckinModel.fromWire(j['checkinModel']),
    checkinTime: _str(j['checkinTime']) ?? '14:00',
    checkoutTime: _str(j['checkoutTime']) ?? '11:00',
    holdExpiryMinutes: _intOrNull(j['holdExpiryMinutes']),
    bookingEngineEnabled: _bool(j['bookingEngineEnabled']),
    bookingEngineSlug: _str(j['bookingEngineSlug']),
    brandColor: _str(j['brandColor']),
    bookingTerms: _str(j['bookingTerms']),
    currency: _str(j['currency']) ?? 'INR',
  );
}

enum TaxCalculation {
  percent('PERCENT', 'Percent'),
  fixed('FIXED', 'Fixed amount');

  const TaxCalculation(this.wire, this.label);
  final String wire;
  final String label;
  static TaxCalculation fromWire(Object? v) => values.firstWhere(
    (e) => e.wire == v,
    orElse: () => TaxCalculation.percent,
  );
}

enum TaxBasis {
  perNight('PER_NIGHT', 'Per night'),
  perStay('PER_STAY', 'Per stay'),
  perGuest('PER_GUEST', 'Per guest');

  const TaxBasis(this.wire, this.label);
  final String wire;
  final String label;
  static TaxBasis fromWire(Object? v) =>
      values.firstWhere((e) => e.wire == v, orElse: () => TaxBasis.perStay);
}

enum TaxAppliesTo {
  room('ROOM', 'Room'),
  restaurant('RESTAURANT', 'Restaurant'),
  spa('SPA', 'Spa'),
  addon('ADDON', 'Add-ons'),
  all('ALL', 'Everything');

  const TaxAppliesTo(this.wire, this.label);
  final String wire;
  final String label;
  static TaxAppliesTo fromWire(Object? v) =>
      values.firstWhere((e) => e.wire == v, orElse: () => TaxAppliesTo.room);
}

class PropertyTax {
  const PropertyTax({
    required this.id,
    required this.name,
    required this.value,
    this.calculation = TaxCalculation.percent,
    this.basis = TaxBasis.perStay,
    this.appliesTo = TaxAppliesTo.room,
    this.hsnCode,
    this.isActive = true,
  });
  final String id;
  final String name;
  final int value;
  final TaxCalculation calculation;
  final TaxBasis basis;
  final TaxAppliesTo appliesTo;
  final String? hsnCode;
  final bool isActive;
  String get valueLabel => calculation == TaxCalculation.percent
      ? '${(value / 100).toStringAsFixed(value % 100 == 0 ? 0 : 2)}%'
      : '₹${(value / 100).toStringAsFixed(0)} ${basis.label.toLowerCase()}';
  factory PropertyTax.fromJson(Map j) => PropertyTax(
    id: '${j['id']}',
    name: _str(j['name']) ?? '',
    value: _int(j['value']),
    calculation: TaxCalculation.fromWire(j['calculation']),
    basis: TaxBasis.fromWire(j['basis']),
    appliesTo: TaxAppliesTo.fromWire(j['appliesTo']),
    hsnCode: _str(j['hsnCode']),
    isActive: j['isActive'] == null ? true : _bool(j['isActive']),
  );
}

enum PolicyKind {
  cancellation('CANCELLATION', 'Cancellation'),
  noShow('NO_SHOW', 'No-show'),
  earlyCheckout('EARLY_CHECKOUT', 'Early checkout'),
  deposit('DEPOSIT', 'Deposit');

  const PolicyKind(this.wire, this.label);
  final String wire;
  final String label;
  static PolicyKind fromWire(Object? v) => values.firstWhere(
    (e) => e.wire == v,
    orElse: () => PolicyKind.cancellation,
  );
}

enum ChargeKind {
  none('NONE', 'No charge'),
  firstNight('FIRST_NIGHT', 'First night'),
  percent('PERCENT', 'Percent of stay'),
  fixed('FIXED', 'Fixed amount');

  const ChargeKind(this.wire, this.label);
  final String wire;
  final String label;
  static ChargeKind fromWire(Object? v) =>
      values.firstWhere((e) => e.wire == v, orElse: () => ChargeKind.none);
}

class PropertyPolicy {
  const PropertyPolicy({
    required this.id,
    required this.kind,
    required this.name,
    this.description,
    this.hoursBefore,
    this.chargeKind = ChargeKind.none,
    this.value = 0,
    this.isDefault = false,
    this.isActive = true,
  });
  final String id;
  final PolicyKind kind;
  final String name;
  final String? description;
  final int? hoursBefore;
  final ChargeKind chargeKind;
  final int value;
  final bool isDefault;
  final bool isActive;
  String get chargeLabel => switch (chargeKind) {
    ChargeKind.none => 'No charge',
    ChargeKind.firstNight => 'First night',
    ChargeKind.percent => '${(value / 100).toStringAsFixed(0)}% of the stay',
    ChargeKind.fixed => '₹${(value / 100).toStringAsFixed(0)}',
  };
  factory PropertyPolicy.fromJson(Map j) => PropertyPolicy(
    id: '${j['id']}',
    kind: PolicyKind.fromWire(j['kind']),
    name: _str(j['name']) ?? '',
    description: _str(j['description']),
    hoursBefore: _intOrNull(j['hoursBefore']),
    chargeKind: ChargeKind.fromWire(j['chargeKind']),
    value: _int(j['value']),
    isDefault: _bool(j['isDefault']),
    isActive: j['isActive'] == null ? true : _bool(j['isActive']),
  );
}

enum AddonUnit {
  perStay('PER_STAY', 'Per stay'),
  perNight('PER_NIGHT', 'Per night'),
  perGuest('PER_GUEST', 'Per guest'),
  perGuestNight('PER_GUEST_NIGHT', 'Per guest per night');

  const AddonUnit(this.wire, this.label);
  final String wire;
  final String label;
  static AddonUnit fromWire(Object? v) =>
      values.firstWhere((e) => e.wire == v, orElse: () => AddonUnit.perStay);
}

class AddonService {
  const AddonService({
    required this.id,
    required this.name,
    required this.pricePaise,
    this.description,
    this.unit = AddonUnit.perStay,
    this.taxCategory = 'other',
    this.sellOnline = true,
    this.isActive = true,
  });
  final String id;
  final String name;
  final int pricePaise;
  final String? description;
  final AddonUnit unit;
  final String taxCategory;
  final bool sellOnline;
  final bool isActive;
  String get priceLabel =>
      '₹${(pricePaise / 100).toStringAsFixed(0)} · ${unit.label.toLowerCase()}';
  factory AddonService.fromJson(Map j) => AddonService(
    id: '${j['id']}',
    name: _str(j['name']) ?? '',
    pricePaise: _int(j['pricePaise']),
    description: _str(j['description']),
    unit: AddonUnit.fromWire(j['unit']),
    taxCategory: _str(j['taxCategory']) ?? 'other',
    sellOnline: j['sellOnline'] == null ? true : _bool(j['sellOnline']),
    isActive: j['isActive'] == null ? true : _bool(j['isActive']),
  );
}

class BookingSource {
  const BookingSource({
    required this.id,
    required this.name,
    this.channel = 'OTHER',
    this.commissionBp = 0,
    this.isActive = true,
  });
  final String id;
  final String name;
  final String channel;
  final int commissionBp;
  final bool isActive;
  factory BookingSource.fromJson(Map j) => BookingSource(
    id: '${j['id']}',
    name: _str(j['name']) ?? '',
    channel: _str(j['channel']) ?? 'OTHER',
    commissionBp: _int(j['commissionBp']),
    isActive: j['isActive'] == null ? true : _bool(j['isActive']),
  );
}
