import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../data/events_models.dart';
import '../data/events_repository.dart';

final eventsFilterProvider = StateProvider.autoDispose<EventStatus?>((_) => null);

final eventsProvider = FutureProvider.autoDispose<List<EventItem>>(
  (ref) => ref.watch(eventsRepositoryProvider).events(status: ref.watch(eventsFilterProvider)),
);

final eventsDashboardProvider = FutureProvider.autoDispose<EventsDashboard?>(
  (ref) => ref.watch(eventsRepositoryProvider).dashboard(),
);

final eventProvider = FutureProvider.autoDispose.family<EventItem?, String>(
  (ref, id) => ref.watch(eventsRepositoryProvider).event(id),
);
