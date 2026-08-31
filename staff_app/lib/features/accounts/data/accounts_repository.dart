import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/networking/api_client.dart';
import '../../../core/networking/api_exception.dart';
import '../../../core/providers.dart';
import 'accounts_models.dart';

/// Every accounts read and write. Reads degrade to empty on a missing endpoint;
/// writes let the exception through.
class AccountsRepository {
  AccountsRepository(this._api);

  final ApiClient _api;

  Future<AccountsSummary?> summary() async {
    try {
      final data = await _api.get('/accounts/summary');
      return data is Map ? AccountsSummary.fromJson(data) : null;
    } on ApiException catch (e) {
      if (e.isMissingEndpoint) return null;
      rethrow;
    }
  }

  Future<List<Expense>> expenses({
    ExpenseStatus? status,
    ExpenseCategory? category,
  }) async {
    try {
      final data = await _api.get(
        '/accounts/expenses',
        query: {
          if (status != null) 'status': status.wire,
          if (category != null) 'category': category.wire,
        },
      );
      return _listOf(data, Expense.fromJson);
    } on ApiException catch (e) {
      if (e.isMissingEndpoint) return const [];
      rethrow;
    }
  }

  Future<Expense> create(Map<String, dynamic> body) async {
    final data = await _api.post('/accounts/expenses', body: body);
    return _one(data, Expense.fromJson, 'expense');
  }

  Future<Expense> update(String id, Map<String, dynamic> changes) async {
    final data = await _api.patch('/accounts/expenses/$id', body: changes);
    return _one(data, Expense.fromJson, 'expense');
  }

  Future<Expense> setStatus(String id, ExpenseStatus status) async {
    final data = await _api.patch(
      '/accounts/expenses/$id/status',
      body: {'status': status.wire},
    );
    return _one(data, Expense.fromJson, 'expense');
  }

  Future<void> deleteExpense(String id) =>
      _api.delete('/accounts/expenses/$id');

  static List<T> _listOf<T>(dynamic data, T Function(Map) parse) {
    if (data is List) return data.whereType<Map>().map(parse).toList();
    if (data is Map && data['items'] is List) {
      return (data['items'] as List).whereType<Map>().map(parse).toList();
    }
    return const [];
  }

  static T _one<T>(dynamic data, T Function(Map) parse, String what) {
    if (data is Map) return parse(data);
    throw ApiException(
      code: 'ERROR',
      message: 'The server did not send back the $what it saved.',
    );
  }
}

final accountsRepositoryProvider = Provider<AccountsRepository>(
  (ref) => AccountsRepository(ref.watch(apiClientProvider)),
);
