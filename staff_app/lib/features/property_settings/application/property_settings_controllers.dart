import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/providers.dart';
import '../data/property_settings_models.dart';
import '../data/property_settings_repository.dart';

final propertySettingsRepositoryProvider = Provider<PropertySettingsRepository>(
  (ref) => PropertySettingsRepository(ref.watch(apiClientProvider)),
);

final propertySettingsProvider = FutureProvider.autoDispose<PropertySettings>(
  (ref) => ref.watch(propertySettingsRepositoryProvider).settings(),
);
final propertyTaxesProvider = FutureProvider.autoDispose<List<PropertyTax>>(
  (ref) => ref.watch(propertySettingsRepositoryProvider).taxes(),
);
final propertyPoliciesProvider =
    FutureProvider.autoDispose<List<PropertyPolicy>>(
      (ref) => ref.watch(propertySettingsRepositoryProvider).policies(),
    );
final propertyAddonsProvider = FutureProvider.autoDispose<List<AddonService>>(
  (ref) => ref.watch(propertySettingsRepositoryProvider).addons(),
);
final bookingSourcesProvider = FutureProvider.autoDispose<List<BookingSource>>(
  (ref) => ref.watch(propertySettingsRepositoryProvider).sources(),
);

final couponsProvider = FutureProvider.autoDispose<List<Coupon>>(
  (ref) => ref.watch(propertySettingsRepositoryProvider).coupons(),
);

/// Writes, each invalidating the list it changed so the screen re-reads.
class PropertySettingsActions {
  PropertySettingsActions(this._ref);
  final Ref _ref;
  PropertySettingsRepository get _repo =>
      _ref.read(propertySettingsRepositoryProvider);

  Future<PropertySettings> updateSettings(Map<String, dynamic> patch) async {
    final s = await _repo.updateSettings(patch);
    _ref.invalidate(propertySettingsProvider);
    return s;
  }

  Future<void> saveTax(String? id, Map<String, dynamic> b) async {
    if (id == null) {
      await _repo.createTax(b);
    } else {
      await _repo.updateTax(id, b);
    }
    _ref.invalidate(propertyTaxesProvider);
  }

  Future<void> deleteTax(String id) async {
    await _repo.deleteTax(id);
    _ref.invalidate(propertyTaxesProvider);
  }

  Future<void> savePolicy(String? id, Map<String, dynamic> b) async {
    if (id == null) {
      await _repo.createPolicy(b);
    } else {
      await _repo.updatePolicy(id, b);
    }
    _ref.invalidate(propertyPoliciesProvider);
  }

  Future<void> deletePolicy(String id) async {
    await _repo.deletePolicy(id);
    _ref.invalidate(propertyPoliciesProvider);
  }

  Future<void> saveAddon(String? id, Map<String, dynamic> b) async {
    if (id == null) {
      await _repo.createAddon(b);
    } else {
      await _repo.updateAddon(id, b);
    }
    _ref.invalidate(propertyAddonsProvider);
  }

  Future<void> deleteAddon(String id) async {
    await _repo.deleteAddon(id);
    _ref.invalidate(propertyAddonsProvider);
  }

  Future<void> saveSource(String? id, Map<String, dynamic> b) async {
    if (id == null) {
      await _repo.createSource(b);
    } else {
      await _repo.updateSource(id, b);
    }
    _ref.invalidate(bookingSourcesProvider);
  }

  Future<void> saveCoupon(String? id, Map<String, dynamic> b) async {
    if (id == null) {
      await _repo.createCoupon(b);
    } else {
      await _repo.updateCoupon(id, b);
    }
    _ref.invalidate(couponsProvider);
  }

  Future<void> deleteCoupon(String id) async {
    await _repo.deleteCoupon(id);
    _ref.invalidate(couponsProvider);
  }

  Future<void> deleteSource(String id) async {
    await _repo.deleteSource(id);
    _ref.invalidate(bookingSourcesProvider);
  }
}

final propertySettingsActionsProvider = Provider<PropertySettingsActions>(
  PropertySettingsActions.new,
);
