import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/networking/api_client.dart';
import '../../../core/networking/api_exception.dart';
import '../../../core/providers.dart';
import 'sales_models.dart';

/// Every sales-CRM read and write.
class SalesRepository {
  SalesRepository(this._api);

  final ApiClient _api;

  Future<SalesSummary?> summary() async {
    try {
      final data = await _api.get('/sales/summary');
      return data is Map ? SalesSummary.fromJson(data) : null;
    } on ApiException catch (e) {
      if (e.isMissingEndpoint) return null;
      rethrow;
    }
  }

  /// The pipeline board — columns keyed by stage, in pipeline order.
  Future<List<PipelineColumn>> pipeline() async {
    try {
      final data = await _api.get('/sales/pipeline');
      final columns = data is Map ? data['columns'] : data;
      if (columns is List) {
        return columns.whereType<Map>().map((c) {
          final leads = (c['leads'] is List)
              ? (c['leads'] as List)
                    .whereType<Map>()
                    .map(Lead.fromJson)
                    .toList()
              : <Lead>[];
          return PipelineColumn(
            stage: LeadStage.fromWire(c['stage']?.toString()),
            leads: leads,
          );
        }).toList();
      }
      return const [];
    } on ApiException catch (e) {
      if (e.isMissingEndpoint) return const [];
      rethrow;
    }
  }

  Future<Lead?> lead(String id) async {
    try {
      final data = await _api.get('/sales/leads/$id');
      return data is Map ? Lead.fromJson(data) : null;
    } on ApiException catch (e) {
      if (e.isMissingEndpoint) return null;
      rethrow;
    }
  }

  Future<Lead> create(Map<String, dynamic> body) async {
    final data = await _api.post('/sales/leads', body: body);
    return _one(data, Lead.fromJson, 'lead');
  }

  Future<Lead> update(String id, Map<String, dynamic> changes) async {
    final data = await _api.patch('/sales/leads/$id', body: changes);
    return _one(data, Lead.fromJson, 'lead');
  }

  Future<Lead> moveStage(String id, LeadStage stage) async {
    final data = await _api.patch(
      '/sales/leads/$id/stage',
      body: {'stage': stage.wire},
    );
    return _one(data, Lead.fromJson, 'lead');
  }

  Future<void> logActivity(String leadId, Map<String, dynamic> body) =>
      _api.post('/sales/leads/$leadId/activities', body: body);

  Future<void> deleteLead(String id) => _api.delete('/sales/leads/$id');

  static T _one<T>(dynamic data, T Function(Map) parse, String what) {
    if (data is Map) return parse(data);
    throw ApiException(
      code: 'ERROR',
      message: 'The server did not send back the $what it saved.',
    );
  }
}

final salesRepositoryProvider = Provider<SalesRepository>(
  (ref) => SalesRepository(ref.watch(apiClientProvider)),
);
