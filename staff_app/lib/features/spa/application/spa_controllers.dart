import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../data/spa_models.dart';
import '../data/spa_repository.dart';

/// Active services for booking; the manager view (`all`) includes archived.
final spaServicesProvider = FutureProvider.autoDispose<List<SpaService>>(
  (ref) => ref.watch(spaRepositoryProvider).services(),
);

final spaServicesAllProvider = FutureProvider.autoDispose<List<SpaService>>(
  (ref) => ref.watch(spaRepositoryProvider).services(all: true),
);

/// Appointments. `mine` is set by the therapist's My Appointments screen; the
/// server also scopes a therapist to their own regardless.
final spaAppointmentsFilterProvider =
    StateProvider.autoDispose<SpaAppointmentStatus?>((_) => null);

final spaAppointmentsProvider = FutureProvider.autoDispose
    .family<List<SpaAppointment>, bool>(
      (ref, mine) => ref
          .watch(spaRepositoryProvider)
          .appointments(status: ref.watch(spaAppointmentsFilterProvider), mine: mine),
    );

final spaDashboardProvider = FutureProvider.autoDispose<SpaDashboard?>(
  (ref) => ref.watch(spaRepositoryProvider).dashboard(),
);

final spaBillsFilterProvider = StateProvider.autoDispose<SpaBillStatus?>((_) => null);

final spaBillsProvider = FutureProvider.autoDispose<List<SpaBill>>(
  (ref) => ref.watch(spaRepositoryProvider).bills(status: ref.watch(spaBillsFilterProvider)),
);

final spaRevenueProvider = FutureProvider.autoDispose<SpaRevenue?>(
  (ref) => ref.watch(spaRepositoryProvider).revenue(),
);
