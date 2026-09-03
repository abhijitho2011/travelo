// Night-audit report set and the property reports (`/staff/night-audit`,
// `/staff/reports/*`). Tolerant parsers: an older server still renders.

int _int(Object? v) => v is int ? v : int.tryParse('$v') ?? 0;

class NightAuditDay {
  const NightAuditDay({
    required this.businessDate,
    required this.arrivals,
    required this.departures,
    required this.inHouse,
    required this.roomsAvailable,
    required this.roomsSold,
    required this.occupancyPct,
    required this.noShows,
    required this.revenuePaise,
    required this.adrPaise,
    required this.revparPaise,
    this.closedAt,
  });

  final DateTime businessDate;
  final int arrivals;
  final int departures;
  final int inHouse;
  final int roomsAvailable;
  final int roomsSold;
  final int occupancyPct;
  final int noShows;
  final int revenuePaise;
  final int adrPaise;
  final int revparPaise;
  final DateTime? closedAt;

  factory NightAuditDay.fromJson(Map j) => NightAuditDay(
    businessDate: DateTime.parse('${j['businessDate']}'),
    arrivals: _int(j['arrivals']),
    departures: _int(j['departures']),
    inHouse: _int(j['inHouse']),
    roomsAvailable: _int(j['roomsAvailable']),
    roomsSold: _int(j['roomsSold']),
    occupancyPct: _int(j['occupancyPct']),
    noShows: _int(j['noShows']),
    revenuePaise: _int(j['revenuePaise']),
    adrPaise: _int(j['adrPaise']),
    revparPaise: _int(j['revparPaise']),
    closedAt: DateTime.tryParse('${j['closedAt']}'),
  );
}
