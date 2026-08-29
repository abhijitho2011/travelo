import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import 'app_colors.dart';
import 'app_spacing.dart';
import 'app_typography.dart';

/// Builds the Material theme from the HF tokens. Light and dark are the same
/// construction with a different [AppColors] instance, exactly as the CSS is
/// `:root` and `.dark` over the same custom properties.
class AppTheme {
  AppTheme._();

  static ThemeData light() => _build(Brightness.light, AppColors.light);

  static ThemeData dark() => _build(Brightness.dark, AppColors.dark);

  static ThemeData _build(Brightness brightness, AppColors c) {
    final textTheme = AppTypography.textTheme(c.foreground, c.mutedForeground);

    return ThemeData(
      useMaterial3: true,
      brightness: brightness,
      extensions: <ThemeExtension<dynamic>>[c],
      scaffoldBackgroundColor: c.background,
      canvasColor: c.background,
      dividerColor: c.border,
      splashFactory: InkSparkle.splashFactory,
      colorScheme: ColorScheme(
        brightness: brightness,
        primary: c.primary,
        onPrimary: c.primaryForeground,
        primaryContainer: c.accent,
        onPrimaryContainer: c.accentForeground,
        secondary: c.secondary,
        onSecondary: c.secondaryForeground,
        surface: c.card,
        onSurface: c.cardForeground,
        surfaceContainerHighest: c.muted,
        onSurfaceVariant: c.mutedForeground,
        error: c.destructive,
        onError: c.destructiveForeground,
        outline: c.border,
        outlineVariant: c.border,
        shadow: const Color(0xFF000000),
        scrim: const Color(0x99000000),
        inverseSurface: c.foreground,
        onInverseSurface: c.background,
        inversePrimary: c.primary,
      ),
      textTheme: textTheme,
      dividerTheme: DividerThemeData(
        color: c.border,
        thickness: 1,
        space: 1,
      ),
      appBarTheme: AppBarTheme(
        backgroundColor: c.background,
        foregroundColor: c.foreground,
        surfaceTintColor: Colors.transparent,
        elevation: 0,
        scrolledUnderElevation: 0,
        centerTitle: false,
        titleTextStyle: AppTypography.display(size: 16, color: c.foreground),
        systemOverlayStyle: brightness == Brightness.dark
            ? SystemUiOverlayStyle.light
            : SystemUiOverlayStyle.dark,
      ),
      cardTheme: CardThemeData(
        color: c.card,
        surfaceTintColor: Colors.transparent,
        elevation: 0,
        margin: EdgeInsets.zero,
        shape: RoundedRectangleBorder(
          borderRadius: R.rLg,
          side: BorderSide(color: c.border),
        ),
      ),
      filledButtonTheme: FilledButtonThemeData(
        style: FilledButton.styleFrom(
          backgroundColor: c.primary,
          foregroundColor: c.primaryForeground,
          disabledBackgroundColor: c.muted,
          disabledForegroundColor: c.mutedForeground,
          minimumSize: const Size(0, kTouchTarget),
          padding: const EdgeInsets.symmetric(horizontal: Sp.lg),
          textStyle: AppTypography.body(size: 14, weight: FontWeight.w600),
          shape: const RoundedRectangleBorder(borderRadius: R.rMd),
          elevation: 0,
        ),
      ),
      outlinedButtonTheme: OutlinedButtonThemeData(
        style: OutlinedButton.styleFrom(
          foregroundColor: c.foreground,
          disabledForegroundColor: c.mutedForeground,
          minimumSize: const Size(0, kTouchTarget),
          padding: const EdgeInsets.symmetric(horizontal: Sp.lg),
          side: BorderSide(color: c.border),
          textStyle: AppTypography.body(size: 14, weight: FontWeight.w600),
          shape: const RoundedRectangleBorder(borderRadius: R.rMd),
        ),
      ),
      textButtonTheme: TextButtonThemeData(
        style: TextButton.styleFrom(
          foregroundColor: c.primary,
          minimumSize: const Size(0, 40),
          textStyle: AppTypography.body(size: 14, weight: FontWeight.w600),
          shape: const RoundedRectangleBorder(borderRadius: R.rMd),
        ),
      ),
      iconButtonTheme: IconButtonThemeData(
        style: IconButton.styleFrom(
          foregroundColor: c.mutedForeground,
          highlightColor: c.muted,
        ),
      ),
      inputDecorationTheme: InputDecorationTheme(
        filled: true,
        fillColor: c.card,
        contentPadding: const EdgeInsets.symmetric(
          horizontal: Sp.md,
          vertical: Sp.md + 2,
        ),
        hintStyle: AppTypography.body(size: 14, color: c.mutedForeground),
        labelStyle: AppTypography.body(size: 14, color: c.mutedForeground),
        floatingLabelStyle: AppTypography.body(size: 13, color: c.primary),
        prefixIconColor: c.mutedForeground,
        suffixIconColor: c.mutedForeground,
        border: OutlineInputBorder(
          borderRadius: R.rMd,
          borderSide: BorderSide(color: c.input),
        ),
        enabledBorder: OutlineInputBorder(
          borderRadius: R.rMd,
          borderSide: BorderSide(color: c.input),
        ),
        focusedBorder: OutlineInputBorder(
          borderRadius: R.rMd,
          borderSide: BorderSide(color: c.ring, width: 1.6),
        ),
        errorBorder: OutlineInputBorder(
          borderRadius: R.rMd,
          borderSide: BorderSide(color: c.destructive),
        ),
        focusedErrorBorder: OutlineInputBorder(
          borderRadius: R.rMd,
          borderSide: BorderSide(color: c.destructive, width: 1.6),
        ),
        errorStyle: AppTypography.body(size: 12.5, color: c.destructive),
      ),
      chipTheme: ChipThemeData(
        backgroundColor: c.muted,
        side: BorderSide(color: c.border),
        labelStyle: AppTypography.body(size: 12.5, weight: FontWeight.w600),
        shape: const RoundedRectangleBorder(borderRadius: R.rSm),
        padding: const EdgeInsets.symmetric(horizontal: Sp.sm, vertical: Sp.xs),
      ),
      bottomNavigationBarTheme: BottomNavigationBarThemeData(
        backgroundColor: c.card,
        selectedItemColor: c.primary,
        unselectedItemColor: c.mutedForeground,
        type: BottomNavigationBarType.fixed,
        elevation: 0,
      ),
      navigationBarTheme: NavigationBarThemeData(
        backgroundColor: c.card,
        surfaceTintColor: Colors.transparent,
        indicatorColor: c.primary.withValues(alpha: 0.14),
        elevation: 0,
        height: 64,
        labelBehavior: NavigationDestinationLabelBehavior.alwaysShow,
        labelTextStyle: WidgetStateProperty.resolveWith(
          (states) => AppTypography.body(
            size: 11,
            weight: FontWeight.w600,
            color: states.contains(WidgetState.selected)
                ? c.primary
                : c.mutedForeground,
          ),
        ),
        iconTheme: WidgetStateProperty.resolveWith(
          (states) => IconThemeData(
            size: 22,
            color: states.contains(WidgetState.selected)
                ? c.primary
                : c.mutedForeground,
          ),
        ),
      ),
      bottomSheetTheme: BottomSheetThemeData(
        backgroundColor: c.card,
        surfaceTintColor: Colors.transparent,
        modalBackgroundColor: c.card,
        showDragHandle: true,
        dragHandleColor: c.border,
        shape: const RoundedRectangleBorder(
          borderRadius: BorderRadius.vertical(top: Radius.circular(R.xl)),
        ),
      ),
      dialogTheme: DialogThemeData(
        backgroundColor: c.popover,
        surfaceTintColor: Colors.transparent,
        elevation: 0,
        shape: RoundedRectangleBorder(
          borderRadius: R.rLg,
          side: BorderSide(color: c.border),
        ),
        titleTextStyle: AppTypography.display(size: 18, color: c.foreground),
        contentTextStyle: AppTypography.body(
          size: 14,
          color: c.mutedForeground,
        ),
      ),
      snackBarTheme: SnackBarThemeData(
        backgroundColor: c.foreground,
        contentTextStyle: AppTypography.body(size: 13.5, color: c.background),
        behavior: SnackBarBehavior.floating,
        shape: const RoundedRectangleBorder(borderRadius: R.rMd),
        elevation: 0,
      ),
      progressIndicatorTheme: ProgressIndicatorThemeData(
        color: c.primary,
        linearTrackColor: c.muted,
        circularTrackColor: c.muted,
      ),
      listTileTheme: ListTileThemeData(
        iconColor: c.mutedForeground,
        titleTextStyle: AppTypography.body(size: 14, weight: FontWeight.w600, color: c.foreground),
        subtitleTextStyle: AppTypography.body(size: 12.5, color: c.mutedForeground),
        shape: const RoundedRectangleBorder(borderRadius: R.rMd),
      ),
      switchTheme: SwitchThemeData(
        thumbColor: WidgetStateProperty.resolveWith(
          (s) => s.contains(WidgetState.selected) ? c.primaryForeground : c.card,
        ),
        trackColor: WidgetStateProperty.resolveWith(
          (s) => s.contains(WidgetState.selected) ? c.primary : c.muted,
        ),
      ),
      tabBarTheme: TabBarThemeData(
        labelColor: c.foreground,
        unselectedLabelColor: c.mutedForeground,
        indicatorColor: c.primary,
        indicatorSize: TabBarIndicatorSize.tab,
        dividerColor: c.border,
        labelStyle: AppTypography.body(size: 13.5, weight: FontWeight.w600),
        unselectedLabelStyle: AppTypography.body(size: 13.5),
      ),
      tooltipTheme: TooltipThemeData(
        decoration: BoxDecoration(
          color: c.foreground,
          borderRadius: R.rSm,
        ),
        textStyle: AppTypography.body(size: 12, color: c.background),
      ),
    );
  }
}
