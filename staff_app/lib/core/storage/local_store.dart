import 'dart:convert';

import 'package:shared_preferences/shared_preferences.dart';

/// Non-secret local persistence.
///
/// Two namespaces are kept deliberately separate:
///   * `cache.*`   — read-only copies of server data, safe to drop at any time,
///   * `pending.*` — mutations the user has made that the server has not yet
///                   accepted. These must survive a restart and are never
///                   cleared by a cache eviction.
class LocalStore {
  SharedPreferences? _prefs;

  Future<SharedPreferences> get _p async =>
      _prefs ??= await SharedPreferences.getInstance();

  static const _cachePrefix = 'cache.';
  static const _pendingKey = 'pending.mutations';
  static const _themeKey = 'pref.themeMode';
  static const _seenWelcomeKey = 'pref.seenWelcome';

  // ------------------------------------------------------------------ cache

  Future<void> writeCache(String key, Object value) async {
    final p = await _p;
    await p.setString('$_cachePrefix$key', jsonEncode(value));
  }

  Future<dynamic> readCache(String key) async {
    final p = await _p;
    final raw = p.getString('$_cachePrefix$key');
    if (raw == null) return null;
    try {
      return jsonDecode(raw);
    } catch (_) {
      return null;
    }
  }

  /// Drops cached server data only — queued mutations are untouched.
  Future<void> clearCache() async {
    final p = await _p;
    for (final k in p.getKeys().where((k) => k.startsWith(_cachePrefix))) {
      await p.remove(k);
    }
  }

  // -------------------------------------------------------- pending queue --

  Future<List<Map<String, dynamic>>> readPending() async {
    final p = await _p;
    final raw = p.getString(_pendingKey);
    if (raw == null) return [];
    try {
      final decoded = jsonDecode(raw);
      if (decoded is! List) return [];
      return decoded.whereType<Map>().map(Map<String, dynamic>.from).toList();
    } catch (_) {
      return [];
    }
  }

  Future<void> writePending(List<Map<String, dynamic>> ops) async {
    final p = await _p;
    await p.setString(_pendingKey, jsonEncode(ops));
  }

  // ---------------------------------------------------------- preferences --

  Future<String?> themeMode() async => (await _p).getString(_themeKey);

  Future<void> setThemeMode(String mode) async =>
      (await _p).setString(_themeKey, mode);

  Future<bool> hasSeenWelcome(String userId) async =>
      (await _p).getBool('$_seenWelcomeKey.$userId') ?? false;

  Future<void> markWelcomeSeen(String userId) async =>
      (await _p).setBool('$_seenWelcomeKey.$userId', true);

  /// Sign-out: cached server data goes, queued mutations stay (they belong to
  /// the device and will replay once someone signs back in).
  Future<void> onSignOut() => clearCache();
}
