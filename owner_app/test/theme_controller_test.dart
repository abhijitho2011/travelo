import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'package:tavelo_owner/core/providers.dart';
import 'package:tavelo_owner/core/storage/local_store.dart';
import 'package:tavelo_owner/core/theme/app_colors.dart';
import 'package:tavelo_owner/core/theme/app_theme.dart';
import 'package:tavelo_owner/core/theme/theme_controller.dart';

/// The theme mode is the one preference the owner sets on their own device, so
/// it has to survive a restart and it has to start out following the device
/// rather than guessing.
void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  // Building a theme resolves Sora and Manrope. Under test there is no network
  // and no font cache, so let google_fonts fall back instead of reaching out.
  GoogleFonts.config.allowRuntimeFetching = false;

  ProviderContainer containerWith(Map<String, Object> prefs) {
    SharedPreferences.setMockInitialValues(prefs);
    final container = ProviderContainer(
      overrides: [localStoreProvider.overrideWithValue(LocalStore())],
    );
    addTearDown(container.dispose);
    // Read once so the controller — and with it the restore — actually starts;
    // a Riverpod provider nobody has read yet has not been built.
    container.read(themeControllerProvider);
    return container;
  }

  group('ThemeController', () {
    test('starts on system when nothing has been stored', () async {
      final c = containerWith({});
      expect(c.read(themeControllerProvider), ThemeMode.system);
      await pumpEventQueue();
      expect(c.read(themeControllerProvider), ThemeMode.system);
    });

    test('restores the stored mode on a cold start', () async {
      final c = containerWith({'flutter.pref.themeMode': 'dark'});
      await pumpEventQueue();
      expect(c.read(themeControllerProvider), ThemeMode.dark);
    });

    test(
      'a stored value this build does not know falls back to system',
      () async {
        final c = containerWith({'flutter.pref.themeMode': 'sepia'});
        await pumpEventQueue();
        expect(c.read(themeControllerProvider), ThemeMode.system);
      },
    );

    test('set persists the choice', () async {
      final c = containerWith({});
      await pumpEventQueue();
      await c.read(themeControllerProvider.notifier).set(ThemeMode.light);
      expect(c.read(themeControllerProvider), ThemeMode.light);
      expect(await LocalStore().themeMode(), 'light');
    });

    test('cycle walks system → light → dark → system', () async {
      final c = containerWith({});
      await pumpEventQueue();
      final controller = c.read(themeControllerProvider.notifier);

      await controller.cycle();
      expect(c.read(themeControllerProvider), ThemeMode.light);
      await controller.cycle();
      expect(c.read(themeControllerProvider), ThemeMode.dark);
      await controller.cycle();
      expect(c.read(themeControllerProvider), ThemeMode.system);
    });
  });

  /// Building a theme resolves Sora and Manrope through google_fonts, which in
  /// a test has neither a network nor a bundled font and reports that as an
  /// unhandled async error. The ThemeData itself is built correctly, so the
  /// font lookup is absorbed here rather than failing assertions it is not
  /// about.
  Future<ThemeData> buildTheme(ThemeData Function() build) async {
    late ThemeData theme;
    await runZonedGuarded(() async {
      theme = build();
      await pumpEventQueue();
    }, (_, _) {});
    return theme;
  }

  group('AppTheme', () {
    test('carries the palette as an extension in both brightnesses', () async {
      final light = await buildTheme(AppTheme.light);
      final dark = await buildTheme(AppTheme.dark);
      expect(light.brightness, Brightness.light);
      expect(dark.brightness, Brightness.dark);
      expect(light.extension<AppColors>(), AppColors.light);
      expect(dark.extension<AppColors>(), AppColors.dark);
    });

    test('the scaffold ground matches the palette, so no half-themed screen '
        'can paint a white page in dark mode', () async {
      expect(
        (await buildTheme(AppTheme.light)).scaffoldBackgroundColor,
        AppColors.light.background,
      );
      expect(
        (await buildTheme(AppTheme.dark)).scaffoldBackgroundColor,
        AppColors.dark.background,
      );
    });

    test('foreground and background stay far apart in both themes', () {
      // A palette edit that quietly ruins contrast is the one dark-mode bug a
      // screenshot review misses, so it is pinned here instead.
      double luminanceGap(Color a, Color b) =>
          (a.computeLuminance() - b.computeLuminance()).abs();

      expect(
        luminanceGap(AppColors.light.foreground, AppColors.light.background),
        greaterThan(0.5),
      );
      expect(
        luminanceGap(AppColors.dark.foreground, AppColors.dark.background),
        greaterThan(0.5),
      );
      // Muted text is the quietest thing on a card and still has to be read.
      expect(
        luminanceGap(AppColors.dark.mutedForeground, AppColors.dark.card),
        greaterThan(0.2),
      );
      expect(
        luminanceGap(AppColors.light.mutedForeground, AppColors.light.card),
        greaterThan(0.2),
      );
    });
  });
}
