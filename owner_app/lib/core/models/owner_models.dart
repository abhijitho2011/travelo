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
  final String state;
  final String district;
  final String pinCode;
  final StaffRole role;
  final String status; // ACTIVE / BLOCKED

  const StaffMember({
    required this.id,
    required this.firstName,
    required this.lastName,
    required this.email,
    required this.mobile,
    required this.state,
    required this.district,
    required this.pinCode,
    required this.role,
    required this.status,
  });

  String get fullName => '$firstName $lastName'.trim();

  factory StaffMember.fromJson(Map j) => StaffMember(
        id: _asStr(j['id']),
        firstName: _asStr(j['firstName']),
        lastName: _asStr(j['lastName']),
        email: _asStr(j['email']),
        mobile: _asStr(j['mobile'] ?? j['phone']),
        state: _asStr(j['state']),
        district: _asStr(j['district']),
        pinCode: _asStr(j['pinCode'] ?? j['pincode']),
        role: _asStr(j['role']).toUpperCase().contains('ASSISTANT')
            ? StaffRole.assistantGeneralManager
            : StaffRole.generalManager,
        status: _asStr(j['status']).isEmpty ? 'ACTIVE' : _asStr(j['status']),
      );
}
