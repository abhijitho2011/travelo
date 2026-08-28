/// Compile-time configuration. All hosts are injected via --dart-define; there
/// is no localhost fallback. Provide at build/run time, e.g.:
///
///   flutter run --dart-define=API_BASE_URL=https://travelo-admin-api-production.up.railway.app/api/v1
///
class AppConfig {
  AppConfig._();

  /// Base URL of the Tavelo API (without a trailing slash).
  /// Defaults to the deployed Railway backend — never a localhost address.
  static const String apiBaseUrl = String.fromEnvironment(
    'API_BASE_URL',
    defaultValue: 'https://travelo-admin-api-production.up.railway.app/api/v1',
  );

  /// Owner-scoped API root.
  static String get ownerApi => '$apiBaseUrl/owner';

  static const String supportEmail = 'support@tavelo.app';
  static const String appName = 'Tavelo';
  static const String tagline = 'One platform. Every hotel.';
}
