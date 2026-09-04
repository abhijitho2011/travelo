import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/networking/api_client.dart';
import '../../../core/providers.dart';
import 'billing_models.dart';

class BillingRepository {
  const BillingRepository(this._api);
  final ApiClient _api;

  Future<FoliosPage> folios({String scope = 'open', String? q}) async {
    final data = await _api.get(
      '/folios',
      query: {'scope': scope, if (q != null && q.isNotEmpty) 'q': q},
    );
    return FoliosPage.fromJson(data as Map);
  }
}

final billingRepositoryProvider = Provider<BillingRepository>(
  (ref) => BillingRepository(ref.watch(apiClientProvider)),
);
