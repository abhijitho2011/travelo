import 'package:flutter/foundation.dart';

/// The signed-in user's effective permissions.
///
/// Matching mirrors the server's `PermissionsService.matches`:
///   * `"*"`        grants everything,
///   * `"group.*"`  grants every key in that group,
///   * a literal key grants exactly itself.
///
/// This is the single place permission logic lives on the client. Screens ask
/// questions of it; they never parse permission strings themselves.
@immutable
class PermissionSet {
  const PermissionSet(this._granted);

  const PermissionSet.empty() : _granted = const <String>{};

  factory PermissionSet.fromJson(dynamic raw) {
    if (raw is! List) return const PermissionSet.empty();
    return PermissionSet(raw.whereType<String>().toSet());
  }

  final Set<String> _granted;

  Set<String> get granted => Set.unmodifiable(_granted);

  bool get isEmpty => _granted.isEmpty;

  /// True when every one of [keys] is granted. An empty list is always true,
  /// which lets a nav item declare "no permission required".
  bool hasAll(Iterable<String> keys) => keys.every(has);

  /// True when at least one of [keys] is granted.
  bool hasAny(Iterable<String> keys) {
    final list = keys.toList();
    if (list.isEmpty) return true;
    return list.any(has);
  }

  bool has(String key) {
    if (_granted.contains('*')) return true;
    if (_granted.contains(key)) return true;
    final dot = key.indexOf('.');
    if (dot <= 0) return false;
    return _granted.contains('${key.substring(0, dot)}.*');
  }

  @override
  bool operator ==(Object other) =>
      other is PermissionSet && setEquals(_granted, other._granted);

  @override
  int get hashCode => Object.hashAllUnordered(_granted);

  @override
  String toString() => 'PermissionSet(${_granted.length} keys)';
}
