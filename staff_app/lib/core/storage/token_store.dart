import 'package:flutter_secure_storage/flutter_secure_storage.dart';

/// Secure persistence for the staff JWT pair.
///
/// Keys are namespaced `tavelo.staff.*` so a device that also has the owner app
/// installed never shares or clobbers a session.
class TokenStore {
  TokenStore(this._storage);

  final FlutterSecureStorage _storage;

  static const _kAccess = 'tavelo.staff.access';
  static const _kRefresh = 'tavelo.staff.refresh';
  static const _kDeviceId = 'tavelo.staff.deviceId';

  String? _accessCache;

  Future<void> save({required String access, required String refresh}) async {
    _accessCache = access;
    await _storage.write(key: _kAccess, value: access);
    await _storage.write(key: _kRefresh, value: refresh);
  }

  Future<String?> access() async =>
      _accessCache ??= await _storage.read(key: _kAccess);

  Future<String?> refresh() => _storage.read(key: _kRefresh);

  Future<bool> hasSession() async => (await access()) != null;

  /// Stable per-install identifier stamped onto every queued offline mutation.
  Future<String> deviceId() async {
    final existing = await _storage.read(key: _kDeviceId);
    if (existing != null) return existing;
    final generated =
        'dev-${DateTime.now().microsecondsSinceEpoch.toRadixString(36)}';
    await _storage.write(key: _kDeviceId, value: generated);
    return generated;
  }

  Future<void> clear() async {
    _accessCache = null;
    await _storage.delete(key: _kAccess);
    await _storage.delete(key: _kRefresh);
    // deviceId deliberately survives sign-out — it identifies the install.
  }
}
