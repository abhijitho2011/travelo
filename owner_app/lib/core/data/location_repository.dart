import 'dart:convert';

import 'package:flutter/services.dart' show rootBundle;
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'owner_repository.dart';

/// State → districts reference for the property/staff location dropdowns.
/// Primary source is the admin-managed backend endpoint; when that is
/// unavailable we fall back to the bundled asset so the form still works.
final locationsProvider = FutureProvider<Map<String, List<String>>>((
  ref,
) async {
  try {
    final remote = await ref.watch(ownerRepositoryProvider).locations();
    if (remote.isNotEmpty) return remote;
  } catch (_) {
    /* fall through to bundled asset */
  }
  final raw = await rootBundle.loadString(
    'assets/data/in_states_districts.json',
  );
  final map = json.decode(raw) as Map<String, dynamic>;
  return map.map(
    (k, v) => MapEntry(k, (v as List).map((e) => e.toString()).toList()),
  );
});
