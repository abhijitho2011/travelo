/// A live Tavelo Support session, as reported by `GET /owner/auth/me`.
///
/// When this is non-null the signed-in "owner" is actually a support agent
/// looking at the account. The API enforces read-only on its side; the app's
/// job is to make that visible rather than let a write fail at submit time.
class ImpersonationInfo {
  const ImpersonationInfo({
    required this.byAdmin,
    required this.sessionId,
    this.byAdminEmail = '',
    this.startedAt,
  });

  /// Name (or email) of the Tavelo employee behind the session.
  final String byAdmin;
  final String byAdminEmail;
  final String sessionId;
  final DateTime? startedAt;

  /// Returns null unless the payload actually declares an ACTIVE session, so a
  /// malformed or absent block can never leave the app half-flagged.
  static ImpersonationInfo? fromJson(Object? json) {
    if (json is! Map) return null;
    if (json['active'] != true) return null;
    final sessionId = json['sessionId']?.toString() ?? '';
    if (sessionId.isEmpty) return null;
    final started = json['startedAt']?.toString();
    return ImpersonationInfo(
      byAdmin: (json['byAdmin']?.toString().trim().isNotEmpty ?? false)
          ? json['byAdmin'].toString().trim()
          : 'Tavelo Support',
      byAdminEmail: json['byAdminEmail']?.toString() ?? '',
      sessionId: sessionId,
      startedAt: started == null ? null : DateTime.tryParse(started),
    );
  }
}
