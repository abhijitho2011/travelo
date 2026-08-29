import 'package:flutter/material.dart';

/// The HF design tokens, converted from `oklch()` to sRGB.
///
/// Every value here is a direct conversion of a custom property in
/// `HF/src/styles.css` — the oklch source is kept in the trailing comment so a
/// future token change can be re-derived rather than eyeballed.
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
    background: Color(0xFFF4F8F6), // oklch(0.975 0.004 165)
    foreground: Color(0xFF0F1613), // oklch(0.19 0.012 170)
    surface: Color(0xFFEDF1EF), // oklch(0.955 0.006 165)
    card: Color(0xFFFFFFFF), // oklch(1 0 0)
    cardForeground: Color(0xFF0F1613),
    popover: Color(0xFFFFFFFF),
    primary: Color(0xFF139E6F), // oklch(0.62 0.13 163)
    primaryForeground: Color(0xFFFFFFFF),
    secondary: Color(0xFFE8EFEB), // oklch(0.945 0.008 165)
    secondaryForeground: Color(0xFF1A2722), // oklch(0.26 0.02 170)
    muted: Color(0xFFEDF1EF), // oklch(0.955 0.006 165)
    mutedForeground: Color(0xFF5C6662), // oklch(0.5 0.014 170)
    accent: Color(0xFFD6EFE3), // oklch(0.93 0.03 165)
    accentForeground: Color(0xFF122F25), // oklch(0.28 0.04 168)
    destructive: Color(0xFFC73332), // oklch(0.55 0.185 26)
    destructiveForeground: Color(0xFFFDFCF8), // oklch(0.99 0.005 90)
    border: Color(0xFFD9E0DD), // oklch(0.9 0.008 168)
    input: Color(0xFFD9E0DD),
    ring: Color(0xFF139E6F),
    sidebar: Color(0xFF09110E), // oklch(0.17 0.014 168)
    sidebarForeground: Color(0xFFD2DAD6), // oklch(0.88 0.01 168)
    sidebarPrimary: Color(0xFF35BF8B), // oklch(0.72 0.14 163)
    sidebarAccent: Color(0xFF172822), // oklch(0.26 0.026 168)
    sidebarAccentForeground: Color(0xFFECF4F0), // oklch(0.96 0.01 165)
    stAvailable: Color(0xFF139E6F), // oklch(0.62 0.13 163)
    stOccupied: Color(0xFF3A6FA3), // oklch(0.53 0.1 250)
    stDirty: Color(0xFFCC7D1B), // oklch(0.66 0.14 65)
    stCleaning: Color(0xFF31A4AF), // oklch(0.66 0.1 205)
    stInspected: Color(0xFF7F75B8), // oklch(0.6 0.1 290)
    stMaintenance: Color(0xFFCB6440), // oklch(0.62 0.14 40)
    stOoo: Color(0xFF5F6B74), // oklch(0.52 0.02 240)
    healthy: Color(0xFF139E6F), // oklch(0.62 0.13 163)
    warning: Color(0xFFCD9219), // oklch(0.7 0.14 78)
    critical: Color(0xFFCC3333), // oklch(0.56 0.19 26)
    elevation1: [
      BoxShadow(
        color: Color(0x0D111A16),
        blurRadius: 2,
        offset: Offset(0, 1),
      ),
      BoxShadow(
        color: Color(0x08111A16),
        blurRadius: 1,
        offset: Offset(0, 1),
      ),
    ],
    elevation2: [
      BoxShadow(
        color: Color(0x38111A16),
        blurRadius: 34,
        spreadRadius: -14,
        offset: Offset(0, 12),
      ),
    ],
  );

  // ------------------------------------------------------------------- dark

  static const dark = AppColors(
    background: Color(0xFF070B09), // oklch(0.145 0.008 168)
    foreground: Color(0xFFEBF0ED), // oklch(0.95 0.006 165)
    surface: Color(0xFF0C1210), // oklch(0.175 0.01 168)
    card: Color(0xFF0E1412), // oklch(0.185 0.011 168)
    cardForeground: Color(0xFFEBF0ED),
    popover: Color(0xFF0E1412),
    primary: Color(0xFF35CE95), // oklch(0.76 0.15 163)
    primaryForeground: Color(0xFF020C08), // oklch(0.14 0.02 170)
    secondary: Color(0xFF19201D), // oklch(0.235 0.012 168)
    secondaryForeground: Color(0xFFE6EDEA), // oklch(0.94 0.008 165)
    muted: Color(0xFF161E1B), // oklch(0.225 0.012 168)
    mutedForeground: Color(0xFF97A19D), // oklch(0.7 0.014 168)
    accent: Color(0xFF182B23), // oklch(0.27 0.03 165)
    accentForeground: Color(0xFFECF4F0), // oklch(0.96 0.01 165)
    destructive: Color(0xFFE86059), // oklch(0.66 0.17 26)
    destructiveForeground: Color(0xFFFAF8F5), // oklch(0.98 0.005 90)
    border: Color(0x1AFFFFFF), // oklch(1 0 0 / 10%)
    input: Color(0x24FFFFFF), // oklch(1 0 0 / 14%)
    ring: Color(0xFF35CE95),
    sidebar: Color(0xFF040807), // oklch(0.13 0.01 168)
    sidebarForeground: Color(0xFFD2DAD6),
    sidebarPrimary: Color(0xFF35CE95),
    sidebarAccent: Color(0xFF15201B), // oklch(0.23 0.018 168)
    sidebarAccentForeground: Color(0xFFEDF4F0),
    stAvailable: Color(0xFF35CE95), // oklch(0.76 0.15 163)
    stOccupied: Color(0xFF6FA2DB), // oklch(0.7 0.1 252)
    stDirty: Color(0xFFEEA753), // oklch(0.78 0.13 68)
    stCleaning: Color(0xFF57C3CF), // oklch(0.76 0.1 205)
    stInspected: Color(0xFFAA9FEC), // oklch(0.74 0.11 290)
    stMaintenance: Color(0xFFEE8F63), // oklch(0.74 0.13 45)
    stOoo: Color(0xFF88949D), // oklch(0.66 0.02 240)
    healthy: Color(0xFF35CE95),
    warning: Color(0xFFE9B452), // oklch(0.8 0.13 80)
    critical: Color(0xFFF66D64), // oklch(0.7 0.17 26)
    elevation1: [
      BoxShadow(
        color: Color(0x73000000),
        blurRadius: 2,
        offset: Offset(0, 1),
      ),
    ],
    elevation2: [
      BoxShadow(
        color: Color(0xB3000000),
        blurRadius: 34,
        spreadRadius: -14,
        offset: Offset(0, 14),
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
