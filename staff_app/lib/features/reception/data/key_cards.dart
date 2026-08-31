import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/networking/api_client.dart';
import '../../../core/providers.dart';
import '../../../core/widgets/status_badge.dart';

/// The states a key card can be in. EXPIRED is computed by the server from the
/// card's expiry — it is never stored, so a card that outlives its stay reports
/// itself honestly without anyone touching the row.
enum KeyCardStatus {
  active('ACTIVE', 'Active'),
  expired('EXPIRED', 'Expired'),
  deactivated('DEACTIVATED', 'Deactivated'),
  lost('LOST', 'Lost');

  const KeyCardStatus(this.wire, this.label);

  final String wire;
  final String label;

  StatusTone get tone => switch (this) {
    KeyCardStatus.active => StatusTone.available,
    KeyCardStatus.expired => StatusTone.neutral,
    KeyCardStatus.deactivated => StatusTone.neutral,
    KeyCardStatus.lost => StatusTone.critical,
  };

  static KeyCardStatus fromWire(String? value) {
    final normalised = value?.trim().toUpperCase();
    for (final s in KeyCardStatus.values) {
      if (s.wire == normalised) return s;
    }
    // The least alarming honest default: a card we cannot classify should not
    // scream "lost", but must not claim to open doors either.
    return KeyCardStatus.deactivated;
  }

  bool get isActive => this == KeyCardStatus.active;
}

/// One issued key card, as `GET /key-cards` returns it.
class KeyCard {
  const KeyCard({
    required this.id,
    required this.cardNumber,
    required this.status,
    this.reservationId,
    this.guestName,
    this.roomNumber,
    this.issuedAt,
    this.expiresAt,
  });

  final String id;
  final String cardNumber;
  final KeyCardStatus status;
  final String? reservationId;
  final String? guestName;
  final String? roomNumber;
  final DateTime? issuedAt;
  final DateTime? expiresAt;

  factory KeyCard.fromJson(Map json) => KeyCard(
    id: (json['id'] ?? '').toString(),
    cardNumber: (json['cardNumber'] ?? json['card_number'] ?? '').toString(),
    status: KeyCardStatus.fromWire(json['status']?.toString()),
    reservationId: json['reservationId']?.toString(),
    guestName: json['guestName']?.toString(),
    roomNumber: json['roomNumber']?.toString(),
    issuedAt: DateTime.tryParse((json['issuedAt'] ?? '').toString())?.toLocal(),
    expiresAt: DateTime.tryParse(
      (json['expiresAt'] ?? '').toString(),
    )?.toLocal(),
  );
}

/// The desk's key-card drawer: issue against a stay, replace a card that
/// stopped working, deactivate one that came back (or never will). Every call
/// lands in the audit log server-side.
class KeyCardsRepository {
  const KeyCardsRepository(this._api);

  final ApiClient _api;

  Future<List<KeyCard>> list() async {
    final data = await _api.get('/key-cards');
    final items = data is Map ? data['items'] : data;
    return items is List
        ? items.whereType<Map>().map(KeyCard.fromJson).toList(growable: false)
        : const <KeyCard>[];
  }

  Future<KeyCard> issue(String reservationId) async {
    final data = await _api.post(
      '/key-cards',
      body: {'reservationId': reservationId},
    );
    return KeyCard.fromJson(data as Map);
  }

  /// Deactivates the old card and issues a fresh one for the same stay.
  Future<KeyCard> replace(String id) async {
    final data = await _api.post('/key-cards/$id/replace');
    return KeyCard.fromJson(data as Map);
  }

  Future<KeyCard> deactivate(String id, {bool lost = false}) async {
    final data = await _api.post(
      '/key-cards/$id/deactivate',
      body: {'lost': lost},
    );
    return KeyCard.fromJson(data as Map);
  }
}

final keyCardsRepositoryProvider = Provider<KeyCardsRepository>(
  (ref) => KeyCardsRepository(ref.watch(apiClientProvider)),
);

final keyCardsProvider = FutureProvider.autoDispose<List<KeyCard>>(
  (ref) => ref.watch(keyCardsRepositoryProvider).list(),
);
