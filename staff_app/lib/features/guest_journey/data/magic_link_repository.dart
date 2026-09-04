import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/networking/api_client.dart';
import '../../../core/providers.dart';
import 'magic_link_models.dart';

class MagicLinkRepository {
  const MagicLinkRepository(this._api);
  final ApiClient _api;

  Future<List<GuestLinkRow>> list({String window = 'today'}) async {
    final data = await _api.get('/guest-links', query: {'window': window});
    final rows = data is Map ? (data['items'] as List? ?? const []) : const [];
    return rows.whereType<Map>().map(GuestLinkRow.fromJson).toList();
  }
}

final magicLinkRepositoryProvider = Provider<MagicLinkRepository>(
  (ref) => MagicLinkRepository(ref.watch(apiClientProvider)),
);
