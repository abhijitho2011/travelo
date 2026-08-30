import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../data/sales_models.dart';
import '../data/sales_repository.dart';

final salesSummaryProvider = FutureProvider.autoDispose<SalesSummary?>(
  (ref) => ref.watch(salesRepositoryProvider).summary(),
);

final pipelineProvider = FutureProvider.autoDispose<List<PipelineColumn>>(
  (ref) => ref.watch(salesRepositoryProvider).pipeline(),
);

final leadProvider = FutureProvider.autoDispose.family<Lead?, String>(
  (ref, id) => ref.watch(salesRepositoryProvider).lead(id),
);

class SalesActions {
  const SalesActions(this._ref);
  final Ref _ref;

  SalesRepository get _repo => _ref.read(salesRepositoryProvider);

  void _invalidate() {
    _ref.invalidate(pipelineProvider);
    _ref.invalidate(salesSummaryProvider);
  }

  Future<Lead> create(Map<String, dynamic> body) async {
    final l = await _repo.create(body);
    _invalidate();
    return l;
  }

  Future<Lead> update(String id, Map<String, dynamic> changes) async {
    final l = await _repo.update(id, changes);
    _invalidate();
    _ref.invalidate(leadProvider(id));
    return l;
  }

  Future<Lead> moveStage(String id, LeadStage stage) async {
    final l = await _repo.moveStage(id, stage);
    _invalidate();
    _ref.invalidate(leadProvider(id));
    return l;
  }

  Future<void> logActivity(String leadId, Map<String, dynamic> body) async {
    await _repo.logActivity(leadId, body);
    _ref.invalidate(leadProvider(leadId));
    _invalidate();
  }

  Future<void> deleteLead(String id) async {
    await _repo.deleteLead(id);
    _invalidate();
  }
}

final salesActionsProvider = Provider.autoDispose<SalesActions>(
  (ref) => SalesActions(ref),
);
