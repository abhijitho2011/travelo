import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/networking/api_client.dart';
import '../../../core/providers.dart';
import 'guest_models.dart';

class GuestsRepository {
  const GuestsRepository(this._api);
  final ApiClient _api;

  Future<List<GuestSummary>> search({String? q}) async {
    final data = await _api.get(
      '/guests',
      query: q == null || q.isEmpty ? null : {'q': q},
    );
    final rows = data is List ? data : const [];
    return rows.whereType<Map>().map(GuestSummary.fromJson).toList();
  }

  Future<GuestProfile> profile(String phone) async {
    final data = await _api.get('/guests/profile', query: {'phone': phone});
    return GuestProfile.fromJson(data as Map);
  }

  Future<void> flag(
    String phone, {
    bool? blacklisted,
    String? blacklistReason,
    String? notes,
  }) async {
    await _api.patch(
      '/guests/flag',
      body: {
        'phone': phone,
        if (blacklisted != null) 'blacklisted': blacklisted,
        if (blacklistReason != null) 'blacklistReason': blacklistReason,
        if (notes != null) 'notes': notes,
      },
    );
  }
}

final guestsRepositoryProvider = Provider<GuestsRepository>(
  (ref) => GuestsRepository(ref.watch(apiClientProvider)),
);
