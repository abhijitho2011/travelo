/// Compile-time configuration. Every host is injected via `--dart-define`;
/// there is no localhost fallback anywhere in this app.
///
///   flutter run --dart-define=API_BASE_URL=https://travelo-admin-api-production.up.railway.app/api/v1
///
class AppConfig {
  AppConfig._();

  /// Base URL of the Tavelo API (no trailing slash). Defaults to the deployed
  /// Railway backend — never a localhost address.
  static const String apiBaseUrl = String.fromEnvironment(
    'API_BASE_URL',
    defaultValue: 'https://travelo-admin-api-production.up.railway.app/api/v1',
  );

  /// Staff-scoped API root. All endpoints in this app hang off it.
  static String get staffApi => '$apiBaseUrl/staff';

  static const String appName = 'Tavelo';
  static const String tagline = 'One app. Every role.';
  static const String supportEmail = 'support@tavelo.app';

  /// OTP length the backend issues.
  static const int otpLength = 6;

  /// Seconds before "Resend code" becomes tappable again.
  static const int otpResendCooldownSeconds = 30;

  /// Seconds an issued OTP stays valid (mirrors the server's `OTP_TTL_MIN`).
  /// Only used for the visible countdown — the server is the authority.
  static const int otpValiditySeconds = 300;
}
