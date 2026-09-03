// Conversations, reviews and the guest link.

String? _str(Object? v) => v?.toString();
int _int(Object? v) => v is int ? v : int.tryParse('$v') ?? 0;
DateTime? _date(Object? v) => v == null ? null : DateTime.tryParse('$v');

class Conversation {
  const Conversation({
    required this.id,
    this.reservationId,
    this.guestName,
    this.guestPhone,
    this.guestEmail,
    this.lastMessageAt,
    this.lastPreview,
    this.unreadCount = 0,
  });
  final String id;
  final String? reservationId;
  final String? guestName;
  final String? guestPhone;
  final String? guestEmail;
  final DateTime? lastMessageAt;
  final String? lastPreview;
  final int unreadCount;
  String get title => guestName ?? guestPhone ?? guestEmail ?? 'Guest';
  factory Conversation.fromJson(Map j) => Conversation(
    id: '${j['id']}',
    reservationId: _str(j['reservationId']),
    guestName: _str(j['guestName']),
    guestPhone: _str(j['guestPhone']),
    guestEmail: _str(j['guestEmail']),
    lastMessageAt: _date(j['lastMessageAt']),
    lastPreview: _str(j['lastPreview']),
    unreadCount: _int(j['unreadCount']),
  );
}

class GuestMessage {
  const GuestMessage({
    required this.id,
    required this.direction,
    required this.channel,
    required this.body,
    required this.status,
    this.origin = 'MANUAL',
    this.createdAt,
  });
  final String id;
  final String direction;
  final String channel;
  final String body;
  final String status;
  final String origin;
  final DateTime? createdAt;
  bool get inbound => direction == 'IN';
  factory GuestMessage.fromJson(Map j) => GuestMessage(
    id: '${j['id']}',
    direction: _str(j['direction']) ?? 'OUT',
    channel: _str(j['channel']) ?? 'SMS',
    body: _str(j['body']) ?? '',
    status: _str(j['status']) ?? '',
    origin: _str(j['origin']) ?? 'MANUAL',
    createdAt: _date(j['createdAt']),
  );
}

class ConversationThread {
  const ConversationThread({
    required this.conversation,
    required this.messages,
  });
  final Conversation conversation;
  final List<GuestMessage> messages;
  factory ConversationThread.fromJson(Map j) => ConversationThread(
    conversation: Conversation.fromJson(j['conversation'] as Map),
    messages: (j['messages'] as List? ?? const [])
        .whereType<Map>()
        .map(GuestMessage.fromJson)
        .toList(),
  );
}

class GuestReview {
  const GuestReview({
    required this.id,
    required this.source,
    required this.rating,
    this.guestName,
    this.title,
    this.body,
    this.reviewedAt,
    this.response,
    this.respondedAt,
    this.externalUrl,
  });
  final String id;
  final String source;
  final int rating;
  final String? guestName;
  final String? title;
  final String? body;
  final DateTime? reviewedAt;
  final String? response;
  final DateTime? respondedAt;
  final String? externalUrl;
  bool get answered => response != null && response!.isNotEmpty;
  String get sourceLabel => switch (source) {
    'GOOGLE' => 'Google',
    'BOOKING_COM' => 'Booking.com',
    'MAKEMYTRIP' => 'MakeMyTrip',
    'TRIPADVISOR' => 'Tripadvisor',
    'DIRECT' => 'Direct',
    _ => 'Other',
  };
  factory GuestReview.fromJson(Map j) => GuestReview(
    id: '${j['id']}',
    source: _str(j['source']) ?? 'DIRECT',
    rating: _int(j['rating']),
    guestName: _str(j['guestName']),
    title: _str(j['title']),
    body: _str(j['body']),
    reviewedAt: _date(j['reviewedAt']),
    response: _str(j['response']),
    respondedAt: _date(j['respondedAt']),
    externalUrl: _str(j['externalUrl']),
  );
}

class ReviewsPage {
  const ReviewsPage({
    required this.items,
    required this.count,
    required this.averageRating,
    required this.unanswered,
    required this.aiDraftingAvailable,
  });
  final List<GuestReview> items;
  final int count;
  final double averageRating;
  final int unanswered;
  final bool aiDraftingAvailable;
  factory ReviewsPage.fromJson(Map j) => ReviewsPage(
    items: (j['items'] as List? ?? const [])
        .whereType<Map>()
        .map(GuestReview.fromJson)
        .toList(),
    count: _int(j['count']),
    averageRating: (j['averageRating'] as num?)?.toDouble() ?? 0,
    unanswered: _int(j['unanswered']),
    aiDraftingAvailable: j['aiDraftingAvailable'] == true,
  );
}

class GuestLinkStatus {
  const GuestLinkStatus({
    this.sentAt,
    this.openedAt,
    this.checkinSubmittedAt,
    this.checkoutRequestedAt,
    this.idProofUrl,
    this.photoUrl,
  });
  final DateTime? sentAt;
  final DateTime? openedAt;
  final DateTime? checkinSubmittedAt;
  final DateTime? checkoutRequestedAt;
  final String? idProofUrl;
  final String? photoUrl;
  bool get sent => sentAt != null;
  factory GuestLinkStatus.fromJson(Map j) {
    final l = j['link'] is Map ? j['link'] as Map : const {};
    return GuestLinkStatus(
      sentAt: _date(l['sentAt']),
      openedAt: _date(l['openedAt']),
      checkinSubmittedAt: _date(l['checkinSubmittedAt']),
      checkoutRequestedAt: _date(l['checkoutRequestedAt']),
      idProofUrl: _str(j['idProofUrl']),
      photoUrl: _str(j['photoUrl']),
    );
  }
}

class CustomReportResult {
  const CustomReportResult({
    required this.rows,
    required this.measures,
    required this.query,
    this.groupBy,
  });
  final List<Map> rows;
  final List<String> measures;
  final String query;
  final String? groupBy;
  factory CustomReportResult.fromJson(Map j) => CustomReportResult(
    rows: (j['rows'] as List? ?? const []).whereType<Map>().toList(),
    measures: (j['measures'] as List? ?? const []).map((e) => '$e').toList(),
    query: _str(j['query']) ?? '',
    groupBy: _str(j['groupBy']),
  );
}
