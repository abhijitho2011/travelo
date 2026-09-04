import '../../../core/config/app_config.dart';

/// The addresses the public booking page lives at, derived from the SAME base
/// URL the API client is built with — so a staging build previews staging and
/// nothing here ever names a host.
///
/// The server mounts the page at `api/v1/public/booking/:slug`
/// (`src/modules/booking-engine/public-booking.controller.ts`).
class BookingEngineLinks {
  BookingEngineLinks._();

  /// Mirrors the server's `SLUG` rule: lower-case letters, digits and hyphens,
  /// 1–80 characters, never starting or ending with a hyphen.
  static final slugPattern = RegExp(r'^[a-z0-9](?:[a-z0-9-]{1,78}[a-z0-9])?$');

  /// Mirrors the server's `HEX_COLOR` rule: `#RRGGBB` or `#RRGGBBAA`.
  static final hexColourPattern = RegExp(r'^#[0-9a-fA-F]{6}([0-9a-fA-F]{2})?$');

  /// `https://host` — scheme and authority of the configured API base.
  static String origin({String? apiBaseUrl}) =>
      Uri.parse(apiBaseUrl ?? AppConfig.apiBaseUrl).origin;

  static String pageUrl(String slug, {String? apiBaseUrl}) =>
      '${origin(apiBaseUrl: apiBaseUrl)}/api/v1/public/booking/$slug';

  /// The snippet a hotel pastes into its own website.
  static String embedSnippet(String slug, {String? apiBaseUrl}) =>
      '<iframe src="${pageUrl(slug, apiBaseUrl: apiBaseUrl)}" '
      'title="Book your stay" '
      'style="width:100%;min-height:720px;border:0;border-radius:12px" '
      'loading="lazy" allow="payment"></iframe>';
}
