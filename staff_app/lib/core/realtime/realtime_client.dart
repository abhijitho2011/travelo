import 'dart:async';

import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:socket_io_client/socket_io_client.dart' as io;

import '../config/app_config.dart';
import '../providers.dart';
import '../../features/housekeeping/application/board_controllers.dart';
import '../../features/rates/application/rates_controllers.dart';
import '../../features/reception/application/reception_controllers.dart';
import '../../features/reception/application/reservation_calendar_controllers.dart';
import '../../features/restaurant/application/restaurant_controllers.dart';
import '../../features/guest_comms/application/guest_comms_controllers.dart';

/// Live updates from the server (`/rt`), authenticated with the same access
/// token the API takes. Every event names the thing that changed; this
/// client invalidates the providers that show it, so the screen re-reads.
/// Nothing here is required for correctness — a dropped socket only means
/// the next refresh is manual.
class RealtimeClient {
  RealtimeClient(this._ref);
  final Ref _ref;
  io.Socket? _socket;

  String get _origin {
    final u = Uri.parse(AppConfig.apiBaseUrl);
    return '${u.scheme}://${u.host}${u.hasPort ? ':${u.port}' : ''}';
  }

  Future<void> connect() async {
    final token = await _ref.read(tokenStoreProvider).access();
    if (token == null || token.isEmpty) return;
    disconnect();
    final s = io.io(
      '$_origin/rt',
      io.OptionBuilder()
          .setTransports(['websocket'])
          .setAuth({'token': token})
          .enableReconnection()
          .build(),
    );
    s.on(
      'reservation.changed',
      (_) => _invalidate([
        reservationsProvider,
        reservationCalendarProvider,
        deskTodayProvider,
      ]),
    );
    s.on(
      'room.status',
      (_) => _invalidate([
        boardProvider,
        reservationCalendarProvider,
        deskTodayProvider,
      ]),
    );
    s.on(
      'order.changed',
      (_) => _invalidate([ordersProvider, kitchenProvider]),
    );
    s.on('task.changed', (_) => _invalidate([boardProvider]));
    s.on(
      'rates.changed',
      (_) => _invalidate([rateGridProvider, rateChangesProvider]),
    );
    s.on('message.received', (_) => _invalidate([conversationsProvider]));
    s.on('message.sent', (_) => _invalidate([conversationsProvider]));
    s.onConnectError((e) => debugPrint('realtime: $e'));
    _socket = s;
  }

  void _invalidate(List<ProviderOrFamily> providers) {
    for (final p in providers) {
      try {
        _ref.invalidate(p);
      } catch (_) {}
    }
  }

  void disconnect() {
    _socket?.dispose();
    _socket = null;
  }
}

final realtimeClientProvider = Provider<RealtimeClient>((ref) {
  final c = RealtimeClient(ref);
  ref.onDispose(c.disconnect);
  return c;
});
