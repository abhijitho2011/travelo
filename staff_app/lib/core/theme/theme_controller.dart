import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../providers.dart';
import '../storage/local_store.dart';

/// Light / dark / system, persisted locally.
class ThemeController extends StateNotifier<ThemeMode> {
  ThemeController(this._store) : super(ThemeMode.system) {
    _restore();
  }

  final LocalStore _store;

  Future<void> _restore() async {
    final saved = await _store.themeMode();
    if (saved == null) return;
    state = ThemeMode.values.firstWhere(
      (m) => m.name == saved,
      orElse: () => ThemeMode.system,
    );
  }

  Future<void> set(ThemeMode mode) async {
    state = mode;
    await _store.setThemeMode(mode.name);
  }

  /// Cycles system → light → dark → system, which is what the shell's single
  /// theme button does.
  Future<void> cycle() => set(switch (state) {
    ThemeMode.system => ThemeMode.light,
    ThemeMode.light => ThemeMode.dark,
    ThemeMode.dark => ThemeMode.system,
  });
}

final themeControllerProvider =
    StateNotifierProvider<ThemeController, ThemeMode>(
      (ref) => ThemeController(ref.watch(localStoreProvider)),
    );
