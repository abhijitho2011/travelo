import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';

/// Type scale — Tavelo design system (Outfit display + Poppins body).
///
/// Outfit drives headings, KPI numerals and the brand mark; Poppins drives
/// everything else. Headings carry -0.015em tracking, KPI numerals -0.03em.
class AppTypography {
  AppTypography._();

  static TextStyle display({
    double size = 20,
    FontWeight weight = FontWeight.w600,
    Color? color,
    double height = 1.2,
  }) => GoogleFonts.outfit(
    fontSize: size,
    fontWeight: weight,
    color: color,
    height: height,
    letterSpacing: size * -0.015,
  );

  /// The `.kpi` utility: Outfit, tabular numerals, tight tracking.
  static TextStyle kpi({
    double size = 26,
    Color? color,
    FontWeight weight = FontWeight.w600,
  }) => GoogleFonts.outfit(
    fontSize: size,
    fontWeight: weight,
    color: color,
    height: 1.0,
    letterSpacing: size * -0.03,
    fontFeatures: const [FontFeature.tabularFigures()],
  );

  /// The `.num` utility: body face, tabular numerals.
  static TextStyle numeric({
    double size = 13,
    Color? color,
    FontWeight weight = FontWeight.w500,
  }) => GoogleFonts.poppins(
    fontSize: size,
    fontWeight: weight,
    color: color,
    letterSpacing: -0.13,
    fontFeatures: const [FontFeature.tabularFigures()],
  );

  /// The `.label-xs` utility: 11px, 600, uppercase, wide tracking, muted.
  static TextStyle labelXs(Color color) => GoogleFonts.poppins(
    fontSize: 11,
    height: 1.45,
    fontWeight: FontWeight.w600,
    letterSpacing: 0.66,
    color: color,
  );

  static TextStyle body({
    double size = 14,
    FontWeight weight = FontWeight.w400,
    Color? color,
    double height = 1.45,
  }) => GoogleFonts.poppins(
    fontSize: size,
    fontWeight: weight,
    color: color,
    height: height,
  );

  static TextTheme textTheme(Color foreground, Color muted) {
    return TextTheme(
      displayLarge: display(size: 34, color: foreground),
      displayMedium: display(size: 28, color: foreground),
      displaySmall: display(size: 24, color: foreground),
      headlineLarge: display(size: 24, color: foreground),
      headlineMedium: display(size: 20, color: foreground),
      headlineSmall: display(size: 18, color: foreground),
      titleLarge: display(size: 17, color: foreground),
      titleMedium: body(size: 15, weight: FontWeight.w600, color: foreground),
      titleSmall: body(size: 13.5, weight: FontWeight.w600, color: foreground),
      bodyLarge: body(size: 15, color: foreground),
      bodyMedium: body(size: 14, color: foreground),
      bodySmall: body(size: 12.5, color: muted),
      labelLarge: body(size: 14, weight: FontWeight.w600, color: foreground),
      labelMedium: body(size: 12.5, weight: FontWeight.w600, color: foreground),
      labelSmall: labelXs(muted),
    );
  }
}
