import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../data/accounts_models.dart';
import '../data/accounts_repository.dart';

final accountsSummaryProvider = FutureProvider.autoDispose<AccountsSummary?>(
  (ref) => ref.watch(accountsRepositoryProvider).summary(),
);

final expenseStatusFilterProvider = StateProvider.autoDispose<ExpenseStatus?>(
  (_) => null,
);

final expensesProvider = FutureProvider.autoDispose<List<Expense>>((ref) {
  final status = ref.watch(expenseStatusFilterProvider);
  return ref.watch(accountsRepositoryProvider).expenses(status: status);
});

class AccountsActions {
  const AccountsActions(this._ref);
  final Ref _ref;

  AccountsRepository get _repo => _ref.read(accountsRepositoryProvider);

  void _invalidate() {
    _ref.invalidate(expensesProvider);
    _ref.invalidate(accountsSummaryProvider);
  }

  Future<Expense> create(Map<String, dynamic> body) async {
    final e = await _repo.create(body);
    _invalidate();
    return e;
  }

  Future<Expense> update(String id, Map<String, dynamic> changes) async {
    final e = await _repo.update(id, changes);
    _invalidate();
    return e;
  }

  Future<Expense> setStatus(String id, ExpenseStatus status) async {
    final e = await _repo.setStatus(id, status);
    _invalidate();
    return e;
  }

  Future<void> deleteExpense(String id) async {
    await _repo.deleteExpense(id);
    _invalidate();
  }
}

final accountsActionsProvider = Provider.autoDispose<AccountsActions>(
  (ref) => AccountsActions(ref),
);
