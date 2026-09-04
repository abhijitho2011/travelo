import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../data/magic_link_models.dart';
import '../data/magic_link_repository.dart';

final magicLinkWindowProvider = StateProvider<String>((_) => 'today');

final magicLinksProvider = FutureProvider.autoDispose<List<GuestLinkRow>>((
  ref,
) {
  final w = ref.watch(magicLinkWindowProvider);
  return ref.watch(magicLinkRepositoryProvider).list(window: w);
});
