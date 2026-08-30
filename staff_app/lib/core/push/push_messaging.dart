import 'dart:io' show Platform;

import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../networking/api_client.dart';
import '../providers.dart';
import '../routing/routes.dart';

/// Push notifications for the staff app.
///
/// Registration is best-effort and never fatal: a device that denies permission,
/// or a platform without FCM (a test host), simply never gets a token and the
/// in-app inbox poll remains the fallback. The token is registered with the
/// backend on sign-in and revoked on sign-out; the backend fans operational
/// notifications out to it via the PUSH channel.
class PushMessaging {
  PushMessaging(this._api);

  final ApiClient _api;
  bool _refreshHooked = false;

  FirebaseMessaging get _fm => FirebaseMessaging.instance;

  String get _platform {
    if (kIsWeb) return 'web';
    try {
      if (Platform.isIOS) return 'ios';
    } catch (_) {
      // Platform is unavailable on some hosts — default to android.
    }
    return 'android';
  }

  /// Ask for permission, obtain the FCM token and register it. Called after a
  /// successful sign-in. Swallows every error — push is an enhancement.
  Future<void> registerAfterLogin() async {
    try {
      await _fm.requestPermission();
      final token = await _fm.getToken();
      if (token != null && token.isNotEmpty) {
        await _register(token);
      }
      if (!_refreshHooked) {
        _refreshHooked = true;
        _fm.onTokenRefresh.listen((next) {
          if (next.isNotEmpty) _register(next);
        });
      }
    } catch (error) {
      debugPrint('Push register skipped: $error');
    }
  }

  /// Detach this device on sign-out so a shared phone stops receiving the
  /// previous user's notifications.
  Future<void> revokeOnLogout() async {
    try {
      final token = await _fm.getToken();
      if (token != null && token.isNotEmpty) {
        await _api.delete('/device-tokens', body: {'token': token});
      }
      await _fm.deleteToken();
    } catch (error) {
      debugPrint('Push revoke skipped: $error');
    }
  }

  Future<void> _register(String token) async {
    await _api.post('/device-tokens', body: {'token': token, 'platform': _platform});
  }

  /// The in-app route a tapped notification should open, from its data payload.
  /// Unknown types fall back to the inbox so a tap is never a dead end.
  static String routeForData(Map<String, dynamic> data) {
    final type = data['relatedType']?.toString();
    final id = data['relatedId']?.toString();
    switch (type) {
      case 'reservation':
        return id != null ? Routes.reservation(id) : Routes.reservations;
      case 'hotel_staff':
        return Routes.approvals;
      case 'work_order':
        return id != null ? Routes.workOrder(id) : Routes.workOrders;
      default:
        return Routes.notifications;
    }
  }
}

final pushMessagingProvider = Provider<PushMessaging>(
  (ref) => PushMessaging(ref.watch(apiClientProvider)),
);
