import 'package:flutter_secure_storage/flutter_secure_storage.dart';

/// Secure persistence for the owner's JWT pair.
class TokenStore {
  TokenStore(this._storage);

  final FlutterSecureStorage _storage;

  static const _kAccess = 'tavelo.owner.access';
  static const _kRefresh = 'tavelo.owner.refresh';

  String? _accessCache;

  Future<void> save({required String access, required String refresh}) async {
    _accessCache = access;
    await _storage.write(key: _kAccess, value: access);
    await _storage.write(key: _kRefresh, value: refresh);
  }

  Future<String?> access() async => _accessCache ??= await _storage.read(key: _kAccess);

  Future<String?> refresh() => _storage.read(key: _kRefresh);

  Future<void> clear() async {
    _accessCache = null;
    await _storage.delete(key: _kAccess);
    await _storage.delete(key: _kRefresh);
  }
}
