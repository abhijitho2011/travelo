// Domain models for the Owner portal. Tolerant parsers — the backend envelope
// is still evolving, so every field degrades gracefully.

int _asInt(dynamic v) => v is int ? v : int.tryParse('${v ?? ''}') ?? 0;
double _asDouble(dynamic v) =>
    v is num ? v.toDouble() : double.tryParse('${v ?? ''}') ?? 0;
String _asStr(dynamic v) => v?.toString() ?? '';

enum OwnerAccountStatus { pending, active, suspended, blocked, deactivated, unknown }

OwnerAccountStatus ownerStatusFrom(String? s) {
  switch ((s ?? '').toUpperCase()) {
    case 'PENDING':
      return OwnerAccountStatus.pending;
    case 'ACTIVE':
      return OwnerAccountStatus.active;
    case 'SUSPENDED':
      return OwnerAccountStatus.suspended;
    case 'BLOCKED':
      return OwnerAccountStatus.blocked;
    case 'DEACTIVATED':
      return OwnerAccountStatus.deactivated;
    default:
      return OwnerAccountStatus.unknown;
  }
}

enum SubscriptionState { trial, active, expiring, gracePeriod, expired, suspended, cancelled, unknown }

SubscriptionState subStateFrom(String? s) {
  switch ((s ?? '').toUpperCase()) {
    case 'TRIAL':
      return SubscriptionState.trial;
    case 'ACTIVE':
      return SubscriptionState.active;
    case 'EXPIRING':
      return SubscriptionState.expiring;
    case 'GRACE_PERIOD':
      return SubscriptionState.gracePeriod;
    case 'EXPIRED':
      return SubscriptionState.expired;
    case 'SUSPENDED':
      return SubscriptionState.suspended;
    case 'CANCELLED':
      return SubscriptionState.cancelled;
    default:
      return SubscriptionState.unknown;
  }
}

class OwnerProfile {
  final String id;
  final String name;
  final String company;
  final String email;
  final String phone;
  final bool emailVerified;
  final OwnerAccountStatus status;

  const OwnerProfile({
    required this.id,
    required this.name,
    required this.company,
    required this.email,
    required this.phone,
    required this.emailVerified,
    required this.status,
  });

  factory OwnerProfile.fromJson(Map j) => OwnerProfile(
        id: _asStr(j['id']),
        name: _asStr(j['name'] ?? j['ownerName']),
        company: _asStr(j['company'] ?? j['organization'] ?? j['companyName']),
        email: _asStr(j['email']),
        phone: _asStr(j['phone'] ?? j['mobile']),
        emailVerified: j['emailVerified'] == true,
        status: ownerStatusFrom(_asStr(j['status'])),
      );
}

class SubscriptionInfo {
  final SubscriptionState state;
  final String planName;
  final DateTime? currentPeriodEnd;
  final int? daysToExpiry;

  const SubscriptionInfo({
    required this.state,
    required this.planName,
    this.currentPeriodEnd,
    this.daysToExpiry,
  });

  bool get isExpired => state == SubscriptionState.expired || state == SubscriptionState.suspended;
  bool get isWarning =>
      state == SubscriptionState.expiring || state == SubscriptionState.gracePeriod;

  factory SubscriptionInfo.fromJson(Map j) {
    final end = DateTime.tryParse(_asStr(j['currentPeriodEnd'] ?? j['expiresAt']));
    int? days;
    if (end != null) days = end.difference(DateTime.now()).inDays;
    return SubscriptionInfo(
      state: subStateFrom(_asStr(j['status'] ?? j['state'])),
      planName: _asStr(j['planName'] ?? j['plan'] ?? 'Tavelo'),
      currentPeriodEnd: end,
      daysToExpiry: days,
    );
  }
}

class Property {
  final String id;
  final String name;
  final int starRating;
  final String city;
  final String state;
  final String status;
  final int roomCount;
  final int completeness; // 0..100
  final String? coverPhotoUrl;

  const Property({
    required this.id,
    required this.name,
    required this.starRating,
    required this.city,
    required this.state,
    required this.status,
    required this.roomCount,
    required this.completeness,
    this.coverPhotoUrl,
  });

  factory Property.fromJson(Map j) => Property(
        id: _asStr(j['id']),
        name: _asStr(j['name']),
        starRating: _asInt(j['starRating'] ?? j['star_rating']),
        city: _asStr(j['city']),
        state: _asStr(j['state']),
        status: _asStr(j['status']),
        roomCount: _asInt(j['roomCount'] ?? j['room_count']),
        completeness: _asInt(j['listingCompleteness'] ?? j['completeness']),
        coverPhotoUrl: (j['coverPhotoUrl'] ?? j['photo']) as String?,
      );
}

class PortfolioSummary {
  final int hotels;
  final int rooms;
  final double revenue; // rupees
  final double occupancy; // 0..100

  const PortfolioSummary({
    required this.hotels,
    required this.rooms,
    required this.revenue,
    required this.occupancy,
  });

  factory PortfolioSummary.fromJson(Map j) => PortfolioSummary(
        hotels: _asInt(j['hotels'] ?? j['propertyCount']),
        rooms: _asInt(j['rooms'] ?? j['roomCount']),
        revenue: _asDouble(j['revenue']),
        occupancy: _asDouble(j['occupancy']),
      );
}

enum StaffRole { generalManager, assistantGeneralManager }

extension StaffRoleX on StaffRole {
  String get api =>
      this == StaffRole.generalManager ? 'GENERAL_MANAGER' : 'ASSISTANT_GENERAL_MANAGER';
  String get label =>
      this == StaffRole.generalManager ? 'General Manager' : 'Assistant General Manager';
}

class StaffMember {
  final String id;
  final String firstName;
  final String lastName;
  final String email;
  final String mobile;
  final String address;
  final String state;
  final String district;
  final String pinCode;
  final StaffRole role;
  final String status; // ACTIVE / BLOCKED
  final String department;
  final String employeeId;

  const StaffMember({
    required this.id,
    required this.firstName,
    required this.lastName,
    required this.email,
    required this.mobile,
    required this.address,
    required this.state,
    required this.district,
    required this.pinCode,
    required this.role,
    required this.status,
    this.department = '',
    this.employeeId = '',
  });

  String get fullName => '$firstName $lastName'.trim();

  factory StaffMember.fromJson(Map j) => StaffMember(
        id: _asStr(j['id']),
        firstName: _asStr(j['firstName']),
        lastName: _asStr(j['lastName']),
        email: _asStr(j['email']),
        mobile: _asStr(j['mobile'] ?? j['phone']),
        address: _asStr(j['address']),
        state: _asStr(j['state']),
        district: _asStr(j['district']),
        pinCode: _asStr(j['pinCode'] ?? j['pincode']),
        role: _asStr(j['role']).toUpperCase().contains('ASSISTANT')
            ? StaffRole.assistantGeneralManager
            : StaffRole.generalManager,
        status: _asStr(j['status']).isEmpty ? 'ACTIVE' : _asStr(j['status']),
        department: _asStr(j['department']),
        employeeId: _asStr(j['employeeId']),
      );
}

// ---------------------------------------------------------------------------
// Account, subscription, support and security
// ---------------------------------------------------------------------------

DateTime? _asDate(dynamic v) =>
    v == null ? null : DateTime.tryParse(v.toString())?.toLocal();

/// The full profile record behind `/owner/profile` — a superset of the
/// [OwnerProfile] the auth controller keeps in memory.
class OwnerAccount {
  final String id;
  final String name;
  final String company;
  final String email;
  final bool emailVerified;
  final String phone;
  final String gstNumber;
  final String address;
  final String pinCode;
  final String? stateId;
  final String? districtId;
  final String state;
  final String district;
  final OwnerAccountStatus status;
  final DateTime? createdAt;
  final int propertiesCount;
  final int staffCount;

  const OwnerAccount({
    required this.id,
    required this.name,
    required this.company,
    required this.email,
    required this.emailVerified,
    required this.phone,
    required this.gstNumber,
    required this.address,
    required this.pinCode,
    required this.stateId,
    required this.districtId,
    required this.state,
    required this.district,
    required this.status,
    required this.createdAt,
    required this.propertiesCount,
    required this.staffCount,
  });

  factory OwnerAccount.fromJson(Map j) => OwnerAccount(
        id: _asStr(j['id']),
        name: _asStr(j['name']),
        company: _asStr(j['company']),
        email: _asStr(j['email']),
        emailVerified: j['emailVerified'] == true,
        phone: _asStr(j['phone'] ?? j['mobile']),
        gstNumber: _asStr(j['gstNumber']),
        address: _asStr(j['address']),
        pinCode: _asStr(j['pinCode']),
        stateId: j['stateId'] as String?,
        districtId: j['districtId'] as String?,
        state: _asStr(j['state']),
        district: _asStr(j['district']),
        status: ownerStatusFrom(_asStr(j['status'])),
        createdAt: _asDate(j['createdAt']),
        propertiesCount: _asInt(j['propertiesCount']),
        staffCount: _asInt(j['staffCount']),
      );
}

/// One state in the admin-managed catalogue, carrying the ids the profile form
/// posts back (the property/staff forms post names instead).
class CatalogueState {
  final String id;
  final String name;
  final List<CatalogueDistrict> districts;
  const CatalogueState({required this.id, required this.name, required this.districts});

  factory CatalogueState.fromJson(Map j) => CatalogueState(
        id: _asStr(j['id']),
        name: _asStr(j['name']),
        districts: ((j['districts'] ?? []) as List)
            .map((d) => CatalogueDistrict.fromJson(d as Map))
            .toList(),
      );
}

class CatalogueDistrict {
  final String id;
  final String name;
  const CatalogueDistrict({required this.id, required this.name});
  factory CatalogueDistrict.fromJson(Map j) =>
      CatalogueDistrict(id: _asStr(j['id']), name: _asStr(j['name']));
}

/// The owner's current plan, as shown on the subscription screen.
class SubscriptionDetail {
  final String id;
  final String planName;
  final String description;
  final SubscriptionState state;
  final String billingCycle;
  final int durationMonths;
  final int monthlyPrice; // paise
  final int periodPrice; // paise
  final String currency;
  final DateTime? currentPeriodStart;
  final DateTime? currentPeriodEnd;
  final int daysRemaining;
  final int propertyLimit;
  final int propertiesUsed;
  final List<String> features;

  const SubscriptionDetail({
    required this.id,
    required this.planName,
    required this.description,
    required this.state,
    required this.billingCycle,
    required this.durationMonths,
    required this.monthlyPrice,
    required this.periodPrice,
    required this.currency,
    required this.currentPeriodStart,
    required this.currentPeriodEnd,
    required this.daysRemaining,
    required this.propertyLimit,
    required this.propertiesUsed,
    required this.features,
  });

  bool get isBlocked =>
      state == SubscriptionState.expired || state == SubscriptionState.suspended;
  bool get isWarning =>
      state == SubscriptionState.expiring || state == SubscriptionState.gracePeriod;

  /// 0..1 of the property allowance in use. An unlimited (0) plan reads as full
  /// only when it truly has no headroom.
  double get usageFraction =>
      propertyLimit <= 0 ? 0 : (propertiesUsed / propertyLimit).clamp(0.0, 1.0);

  factory SubscriptionDetail.fromJson(Map j) => SubscriptionDetail(
        id: _asStr(j['id']),
        planName: _asStr(j['planName']),
        description: _asStr(j['description']),
        state: subStateFrom(_asStr(j['status'])),
        billingCycle: _asStr(j['billingCycle']),
        durationMonths: _asInt(j['durationMonths']),
        monthlyPrice: _asInt(j['monthlyPrice']),
        periodPrice: _asInt(j['periodPrice']),
        currency: _asStr(j['currency']).isEmpty ? 'INR' : _asStr(j['currency']),
        currentPeriodStart: _asDate(j['currentPeriodStart']),
        currentPeriodEnd: _asDate(j['currentPeriodEnd']),
        daysRemaining: _asInt(j['daysRemaining']),
        propertyLimit: _asInt(j['propertyLimit']),
        propertiesUsed: _asInt(j['propertiesUsed']),
        features: ((j['features'] ?? []) as List).map((f) => f.toString()).toList(),
      );
}

class Invoice {
  final String id;
  final String invoiceNumber;
  final DateTime? periodStart;
  final DateTime? periodEnd;
  final int total; // paise
  final String currency;
  final String status;
  final DateTime? issuedAt;
  final DateTime? dueDate;
  final DateTime? paidAt;

  const Invoice({
    required this.id,
    required this.invoiceNumber,
    required this.periodStart,
    required this.periodEnd,
    required this.total,
    required this.currency,
    required this.status,
    required this.issuedAt,
    required this.dueDate,
    required this.paidAt,
  });

  factory Invoice.fromJson(Map j) => Invoice(
        id: _asStr(j['id']),
        invoiceNumber: _asStr(j['invoiceNumber']),
        periodStart: _asDate(j['billingPeriodStart']),
        periodEnd: _asDate(j['billingPeriodEnd']),
        total: _asInt(j['total']),
        currency: _asStr(j['currency']).isEmpty ? 'INR' : _asStr(j['currency']),
        status: _asStr(j['status']),
        issuedAt: _asDate(j['issuedAt']),
        dueDate: _asDate(j['dueDate']),
        paidAt: _asDate(j['paidAt']),
      );
}

class SupportTicket {
  final String id;
  final String subject;
  final String priority;
  final String status;
  final String? propertyId;
  final String propertyName;
  final DateTime? createdAt;
  final DateTime? updatedAt;
  final List<TicketMessage> messages;

  const SupportTicket({
    required this.id,
    required this.subject,
    required this.priority,
    required this.status,
    required this.propertyId,
    required this.propertyName,
    required this.createdAt,
    required this.updatedAt,
    this.messages = const [],
  });

  bool get isClosed {
    final s = status.toUpperCase();
    return s == 'RESOLVED' || s == 'CLOSED';
  }

  factory SupportTicket.fromJson(Map j) => SupportTicket(
        id: _asStr(j['id']),
        subject: _asStr(j['subject']),
        priority: _asStr(j['priority']).isEmpty ? 'NORMAL' : _asStr(j['priority']),
        status: _asStr(j['status']).isEmpty ? 'OPEN' : _asStr(j['status']),
        propertyId: j['propertyId'] as String?,
        propertyName: _asStr(j['propertyName']),
        createdAt: _asDate(j['createdAt']),
        updatedAt: _asDate(j['updatedAt']),
        messages: ((j['messages'] ?? []) as List)
            .map((m) => TicketMessage.fromJson(m as Map))
            .toList(),
      );
}

class TicketMessage {
  final String id;
  final String body;
  final bool mine;
  final String authorLabel;
  final DateTime? createdAt;

  const TicketMessage({
    required this.id,
    required this.body,
    required this.mine,
    required this.authorLabel,
    required this.createdAt,
  });

  factory TicketMessage.fromJson(Map j) => TicketMessage(
        id: _asStr(j['id']),
        body: _asStr(j['body']),
        mine: j['mine'] == true,
        authorLabel: _asStr(j['authorLabel']).isEmpty ? 'Tavelo Support' : _asStr(j['authorLabel']),
        createdAt: _asDate(j['createdAt']),
      );
}

/// One signed-in device, from `owner_sessions`.
class OwnerSession {
  final String id;
  final String ip;
  final String userAgent;
  final DateTime? createdAt;
  final DateTime? expiresAt;
  final bool current;

  const OwnerSession({
    required this.id,
    required this.ip,
    required this.userAgent,
    required this.createdAt,
    required this.expiresAt,
    required this.current,
  });

  factory OwnerSession.fromJson(Map j) => OwnerSession(
        id: _asStr(j['id']),
        ip: _asStr(j['ip']),
        userAgent: _asStr(j['userAgent']),
        createdAt: _asDate(j['createdAt']),
        expiresAt: _asDate(j['expiresAt']),
        current: j['current'] == true,
      );

  /// A readable device name from the user-agent string. Deliberately coarse —
  /// enough for the owner to recognise a device, never a fingerprint.
  String get deviceLabel {
    final ua = userAgent;
    if (ua.trim().isEmpty) return 'Unknown device';
    final lower = ua.toLowerCase();

    String platform = 'Unknown device';
    if (lower.contains('android')) {
      platform = 'Android';
    } else if (lower.contains('iphone')) {
      platform = 'iPhone';
    } else if (lower.contains('ipad')) {
      platform = 'iPad';
    } else if (lower.contains('mac os') || lower.contains('macintosh')) {
      platform = 'Mac';
    } else if (lower.contains('windows')) {
      platform = 'Windows';
    } else if (lower.contains('linux')) {
      platform = 'Linux';
    } else if (lower.contains('dart')) {
      platform = 'Tavelo app';
    }

    String? browser;
    if (lower.contains('edg/')) {
      browser = 'Edge';
    } else if (lower.contains('chrome/') && !lower.contains('chromium')) {
      browser = 'Chrome';
    } else if (lower.contains('firefox/')) {
      browser = 'Firefox';
    } else if (lower.contains('safari/') && !lower.contains('chrome/')) {
      browser = 'Safari';
    }

    return browser == null ? platform : '$browser on $platform';
  }
}
