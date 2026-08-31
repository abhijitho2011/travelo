import 'dart:async';

import 'package:connectivity_plus/connectivity_plus.dart';

/// Reports whether the device has a network path.
///
/// This answers "is there a route out", not "is the Tavelo API reachable" —
/// the shell's indicator is honest about that distinction by saying "Offline"
/// only when the platform says there is no connection at all.
class ConnectivityService {
  ConnectivityService([Connectivity? connectivity])
    : _connectivity = connectivity ?? Connectivity();

  final Connectivity _connectivity;

  Stream<bool> get onlineChanges =>
      _connectivity.onConnectivityChanged.map(_isOnline);

  Future<bool> isOnline() async =>
      _isOnline(await _connectivity.checkConnectivity());

  static bool _isOnline(List<ConnectivityResult> results) =>
      results.isNotEmpty && results.any((r) => r != ConnectivityResult.none);
}
