import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../features/housekeeping/application/board_controllers.dart';
import '../../features/reception/application/reception_controllers.dart';
import '../permissions/permission_keys.dart';
import '../permissions/role_config.dart';
import '../providers.dart';

/// The live counts the sidebar shows beside Calendar, Reservations and
/// Housekeeping. Each one is read only when the role may read the board it
/// comes from, so a role without the permission never triggers the request.
final navBadgesProvider = Provider<Map<NavBadge, int>>((ref) {
  final can = ref.watch(permissionsProvider);
  final out = <NavBadge, int>{};
  if (can.has(P.reservationRead)) {
    final desk = ref.watch(deskTodayProvider).valueOrNull;
    if (desk != null) {
      out[NavBadge.arrivals] = desk.counts.arrivals;
      out[NavBadge.inHouse] = desk.inHouse.length;
    }
  }
  if (can.has(P.housekeepingRead)) {
    final board = ref.watch(boardProvider).valueOrNull;
    if (board != null) out[NavBadge.dirtyRooms] = board.counts['DIRTY'] ?? 0;
  }
  return out;
});

/// What the sidebar's footer pill says about the channel manager.
enum ChannelSyncState { unknown, notConnected, synced, attention }

class ChannelSync {
  const ChannelSync(this.state, {this.connected = 0, this.total = 0});
  final ChannelSyncState state;
  final int connected;
  final int total;

  String get label => switch (state) {
    ChannelSyncState.synced =>
      total == 1 ? 'Channel synced' : 'All channels synced',
    ChannelSyncState.attention => '$connected of $total channels synced',
    ChannelSyncState.notConnected => 'No channels connected',
    ChannelSyncState.unknown => 'Checking channels…',
  };
}

/// `GET /channels` reduced to one line. Only roles that can read room types
/// (the mapping owners) ask; everyone else sees nothing in the footer.
final channelSyncProvider = FutureProvider<ChannelSync>((ref) async {
  if (!ref.watch(permissionsProvider).has(P.roomTypeRead)) {
    return const ChannelSync(ChannelSyncState.unknown);
  }
  final data = await ref.watch(apiClientProvider).get('/channels');
  final items =
      (data is Map ? data['items'] as List? : data as List?) ?? const [];
  if (items.isEmpty) return const ChannelSync(ChannelSyncState.notConnected);
  final connected = items
      .where((e) => e is Map && e['connected'] == true)
      .length;
  return ChannelSync(
    connected == items.length
        ? ChannelSyncState.synced
        : ChannelSyncState.attention,
    connected: connected,
    total: items.length,
  );
});
