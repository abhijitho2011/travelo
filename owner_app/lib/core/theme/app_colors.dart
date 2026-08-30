import 'package:flutter/material.dart';

/// The Tavelo design-system tokens (`--tv-*`), as sRGB.
///
/// Every value here is a direct transcription of a `--tv-*` custom property in
/// the Tavelo design system (brand `#006847`, accent `#23A926`; Outfit +
/// Poppins). Field names are the app's own semantic slots; the trailing comment
/// records which `--tv-*` token each maps to so a token change can be re-applied
/// rather than eyeballed.
///
/// Instances are resolved per brightness; widgets read them through
/// `Theme.of(context).extension<AppColors>()` (see `context.colors`).
@immutable
class AppColors extends ThemeExtension<AppColors> {
  const AppColors({
    required this.background,
    required this.foreground,
    required this.surface,
    required this.card,
    required this.cardForeground,
    required this.popover,
    required this.primary,
    required this.primaryForeground,
    required this.secondary,
    required this.secondaryForeground,
    required this.muted,
    required this.mutedForeground,
    required this.accent,
    required this.accentForeground,
    required this.destructive,
    required this.destructiveForeground,
    required this.border,
    required this.input,
    required this.ring,
    required this.sidebar,
    required this.sidebarForeground,
    required this.sidebarPrimary,
    required this.sidebarAccent,
    required this.sidebarAccentForeground,
    required this.stAvailable,
    required this.stOccupied,
    required this.stDirty,
    required this.stCleaning,
    required this.stInspected,
    required this.stMaintenance,
    required this.stOoo,
    required this.healthy,
    required this.warning,
    required this.critical,
    required this.elevation1,
    required this.elevation2,
  });

  final Color background;
  final Color foreground;
  final Color surface;
  final Color card;
  final Color cardForeground;
  final Color popover;
  final Color primary;
  final Color primaryForeground;
  final Color secondary;
  final Color secondaryForeground;
  final Color muted;
  final Color mutedForeground;
  final Color accent;
  final Color accentForeground;
  final Color destructive;
  final Color destructiveForeground;
  final Color border;
  final Color input;
  final Color ring;
  final Color sidebar;
  final Color sidebarForeground;
  final Color sidebarPrimary;
  final Color sidebarAccent;
  final Color sidebarAccentForeground;

  // Operational status palette
  final Color stAvailable;
  final Color stOccupied;
  final Color stDirty;
  final Color stCleaning;
  final Color stInspected;
  final Color stMaintenance;
  final Color stOoo;

  // Semantic health palette
  final Color healthy;
  final Color warning;
  final Color critical;

  final List<BoxShadow> elevation1;
  final List<BoxShadow> elevation2;

  // ------------------------------------------------------------------ light

  static const light = AppColors(
    background: Color(0xFFF5F7F6), // tv-canvas = n-50
    foreground: Color(0xFF141A18), // tv text = n-900
    surface: Color(0xFFEDF0EE), // tv-subtle = n-100
    card: Color(0xFFFFFFFF), // tv-surface = n-0
    cardForeground: Color(0xFF141A18),
    popover: Color(0xFFFFFFFF),
    primary: Color(0xFF006847), // tv-action = brand-600
    primaryForeground: Color(0xFFFFFFFF),
    secondary: Color(0xFFEDF0EE), // n-100
    secondaryForeground: Color(0xFF232B28), // n-800
    muted: Color(0xFFEDF0EE), // n-100
    mutedForeground: Color(0xFF6E7B76), // n-500
    accent: Color(0xFFE9F5F0), // tv-selected = brand-50
    accentForeground: Color(0xFF00432C), // brand-800
    destructive: Color(0xFFC8372D), // tv-danger
    destructiveForeground: Color(0xFFFFFFFF),
    border: Color(0xFFDFE4E1), // tv-border = n-200
    input: Color(0xFFDFE4E1),
    ring: Color(0xFF23A926), // tv-focus = accent-500
    sidebar: Color(0xFF002E1E), // brand-900 (branded dark rail)
    sidebarForeground: Color(0xFFC6CDC9), // n-300
    sidebarPrimary: Color(0xFF23A926), // accent-500
    sidebarAccent: Color(0xFF00432C), // brand-800
    sidebarAccentForeground: Color(0xFFE9F5F0), // brand-50
    stAvailable: Color(0xFF1B8A1E), // success-600
    stOccupied: Color(0xFF2563A8), // info
    stDirty: Color(0xFFE08A1E), // warning
    stCleaning: Color(0xFF0D7A55), // brand-500
    stInspected: Color(0xFF7F75B8),
    stMaintenance: Color(0xFFCB6440),
    stOoo: Color(0xFF6E7B76), // n-500
    healthy: Color(0xFF1B8A1E), // success
    warning: Color(0xFFE08A1E), // tv-warning
    critical: Color(0xFFC8372D), // tv-danger
    elevation1: [
      // tv-shadow-raised
      BoxShadow(
        color: Color(0x0F141A18),
        blurRadius: 2,
        offset: Offset(0, 1),
      ),
      BoxShadow(
        color: Color(0x0D141A18),
        blurRadius: 6,
        offset: Offset(0, 2),
      ),
    ],
    elevation2: [
      // tv-shadow-overlay
      BoxShadow(
        color: Color(0x1A141A18),
        blurRadius: 24,
        offset: Offset(0, 8),
      ),
      BoxShadow(
        color: Color(0x0F141A18),
        blurRadius: 6,
        offset: Offset(0, 2),
      ),
    ],
  );

  // ------------------------------------------------------------------- dark

  static const dark = AppColors(
    background: Color(0xFF0B100E), // tv-canvas = n-950
    foreground: Color(0xFFF5F7F6), // n-50
    surface: Color(0xFF232B28), // tv-subtle = n-800
    card: Color(0xFF141A18), // tv-surface = n-900
    cardForeground: Color(0xFFF5F7F6),
    popover: Color(0xFF141A18),
    primary: Color(0xFF52C34E), // tv-action dark = accent-400
    primaryForeground: Color(0xFF0B100E),
    secondary: Color(0xFF232B28), // n-800
    secondaryForeground: Color(0xFFC6CDC9), // n-300
    muted: Color(0xFF232B28), // n-800
    mutedForeground: Color(0xFF9AA5A0), // n-400
    accent: Color(0xFF0F2E22), // tv-selected dark
    accentForeground: Color(0xFFE9F5F0),
    destructive: Color(0xFFE4655A), // tv-danger dark
    destructiveForeground: Color(0xFFFAF8F5),
    border: Color(0xFF2C3733), // tv-border dark
    input: Color(0xFF3E4A45), // tv-border-strong dark
    ring: Color(0xFF23A926),
    sidebar: Color(0xFF060B09), // near-black brand
    sidebarForeground: Color(0xFFC6CDC9),
    sidebarPrimary: Color(0xFF52C34E),
    sidebarAccent: Color(0xFF00432C), // brand-800
    sidebarAccentForeground: Color(0xFFE9F5F0),
    stAvailable: Color(0xFF52C34E), // accent-400
    stOccupied: Color(0xFF5A9BE0), // info dark
    stDirty: Color(0xFFF0A93E), // warning dark
    stCleaning: Color(0xFF3D9E78), // brand-400
    stInspected: Color(0xFFAA9FEC),
    stMaintenance: Color(0xFFEE8F63),
    stOoo: Color(0xFF9AA5A0), // n-400
    healthy: Color(0xFF52C34E),
    warning: Color(0xFFF0A93E),
    critical: Color(0xFFE4655A),
    elevation1: [
      BoxShadow(
        color: Color(0x73000000),
        blurRadius: 2,
        offset: Offset(0, 1),
      ),
      BoxShadow(
        color: Color(0x40000000),
        blurRadius: 6,
        offset: Offset(0, 2),
      ),
    ],
    elevation2: [
      BoxShadow(
        color: Color(0x99000000),
        blurRadius: 24,
        offset: Offset(0, 8),
      ),
    ],
  );

  /// HF renders status chips as `color-mix(in oklab, <tone> 12%, transparent)`
  /// on a `35%` border. Alpha compositing is the Flutter equivalent.
  Color tint(Color tone, [double opacity = 0.12]) =>
      tone.withValues(alpha: opacity);

  @override
  AppColors copyWith() => this;

  @override
  AppColors lerp(ThemeExtension<AppColors>? other, double t) {
    if (other is! AppColors) return this;
    return t < 0.5 ? this : other;
  }
}

/// Terse access to the palette: `context.colors.primary`.
extension AppColorsX on BuildContext {
  AppColors get colors =>
      Theme.of(this).extension<AppColors>() ?? AppColors.light;
}
