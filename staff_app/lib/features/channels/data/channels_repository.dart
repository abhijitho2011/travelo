import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/networking/api_client.dart';
import '../../../core/providers.dart';
import '../../rooms/data/unit_models.dart';

class ChannelsRepository {
  const ChannelsRepository(this._api);
  final ApiClient _api;

  Future<List<ChannelConnection>> connections() async {
    final data = await _api.get('/channels');
    final rows = data is Map ? (data['items'] as List? ?? const []) : const [];
    return rows.whereType<Map>().map(ChannelConnection.fromJson).toList();
  }
}

final channelsRepositoryProvider = Provider<ChannelsRepository>(
  (ref) => ChannelsRepository(ref.watch(apiClientProvider)),
);
