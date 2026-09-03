import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/providers.dart';
import '../data/reports_models.dart';
import '../data/reports_repository.dart';

final reportsRepositoryProvider = Provider<ReportsRepository>(
  (ref) => ReportsRepository(ref.watch(apiClientProvider)),
);

final nightAuditProvider = FutureProvider.autoDispose<List<NightAuditDay>>(
  (ref) => ref.watch(reportsRepositoryProvider).nightAudit(days: 60),
);
