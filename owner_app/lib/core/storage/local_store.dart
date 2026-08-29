import 'package:shared_preferences/shared_preferences.dart';

/// Non-secret local preferences.
///
/// Tokens live in secure storage (`TokenStore`); this holds only the handful of
/// device-local choices that are worthless to an attacker and pointless to keep
/// on the server — today, the theme mode. Keys are namespaced `pref.*` so a
/// future cache namespace can be cleared without touching them.
class LocalStore {
  SharedPreferences? _prefs;

  Future<SharedPreferences> get _p async =>
      _prefs ??= await SharedPreferences.getInstance();

  static const _themeKey = 'pref.themeMode';

  Future<String?> themeMode() async => (await _p).getString(_themeKey);

  Future<void> setThemeMode(String mode) async =>
      (await _p).setString(_themeKey, mode);
}
