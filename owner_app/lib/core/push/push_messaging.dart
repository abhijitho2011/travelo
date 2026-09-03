import 'dart:io' show Platform;

import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../api/api_client.dart';
import '../providers.dart';

/// Push notifications for the owner app.
///
/// Best-effort throughout: a denied permission or an FCM-less host never breaks
/// sign-in, and the in-app inbox poll stays the fallback. The token registers
/// with the backend on sign-in and is revoked on sign-out; the backend fans
/// owner notifications (subscription reminders, payment receipts, support
/// replies) out to it via the PUSH channel.
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
      // Platform unavailable on some hosts — default to android.
    }
    return 'android';
  }

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
    await _api.post(
      '/device-tokens',
      body: {'token': token, 'platform': _platform},
    );
  }

  /// The in-app route a tapped notification should open, from its data payload.
  /// Unknown types fall back to the inbox so a tap is never a dead end.
  static String routeForData(Map<String, dynamic> data) {
    final type = data['relatedType']?.toString();
    final id = data['relatedId']?.toString();
    switch (type) {
      case 'subscription':
      case 'payment':
      case 'invoice':
        return '/subscription';
      case 'support_ticket':
      case 'ticket':
        return id != null ? '/support/$id' : '/support';
      case 'property':
        return id != null ? '/properties/$id' : '/properties';
      default:
        return '/notifications';
    }
  }
}

final pushMessagingProvider = Provider<PushMessaging>(
  (ref) => PushMessaging(ref.watch(apiClientProvider)),
);
