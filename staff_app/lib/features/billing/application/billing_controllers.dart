import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../data/billing_models.dart';
import '../data/billing_repository.dart';

final billingScopeProvider = StateProvider<String>((_) => 'open');
final billingQueryProvider = StateProvider<String>((_) => '');

final foliosProvider = FutureProvider.autoDispose<FoliosPage>((ref) {
  final scope = ref.watch(billingScopeProvider);
  final q = ref.watch(billingQueryProvider).trim();
  return ref
      .watch(billingRepositoryProvider)
      .folios(scope: scope, q: q.isEmpty ? null : q);
});
