import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../core/providers.dart';
import '../data/ledger_repository.dart';
import '../data/ledger_models.dart';

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

// ---------------------------------------------------- ledger & cash ----

final ledgerRepositoryProvider = Provider<LedgerRepository>(
  (ref) => LedgerRepository(ref.watch(apiClientProvider)),
);

final corporateAccountsProvider =
    FutureProvider.autoDispose<List<CorporateAccount>>(
      (ref) => ref.watch(ledgerRepositoryProvider).corporateAccounts(),
    );
final corporateStatementProvider = FutureProvider.autoDispose
    .family<CorporateStatement, String>(
      (ref, id) => ref.watch(ledgerRepositoryProvider).statement(id),
    );
final cashBookProvider = FutureProvider.autoDispose<CashBook>(
  (ref) => ref.watch(ledgerRepositoryProvider).cash(days: 7),
);
final shiftsProvider = FutureProvider.autoDispose<List<Shift>>(
  (ref) => ref.watch(ledgerRepositoryProvider).shifts(),
);
final currentShiftProvider = FutureProvider.autoDispose<Shift?>(
  (ref) => ref.watch(ledgerRepositoryProvider).currentShift(),
);

class LedgerActions {
  LedgerActions(this._ref);
  final Ref _ref;
  LedgerRepository get _repo => _ref.read(ledgerRepositoryProvider);

  Future<void> saveCorporate(String? id, Map<String, dynamic> b) async {
    if (id == null) {
      await _repo.createCorporate(b);
    } else {
      await _repo.updateCorporate(id, b);
    }
    _ref.invalidate(corporateAccountsProvider);
    if (id != null) _ref.invalidate(corporateStatementProvider(id));
  }

  Future<void> corporatePayment(
    String id, {
    required int amountPaise,
    String? reference,
    String? note,
  }) async {
    await _repo.corporatePayment(
      id,
      amountPaise: amountPaise,
      reference: reference,
      note: note,
    );
    _ref.invalidate(corporateAccountsProvider);
    _ref.invalidate(corporateStatementProvider(id));
  }

  Future<void> cashEntry({
    required String kind,
    required int amountPaise,
    required String note,
  }) async {
    await _repo.cashEntry(kind: kind, amountPaise: amountPaise, note: note);
    _ref.invalidate(cashBookProvider);
  }

  Future<void> openShift(int openingCashPaise, {String? note}) async {
    await _repo.openShift(openingCashPaise, note: note);
    _ref.invalidate(currentShiftProvider);
    _ref.invalidate(shiftsProvider);
  }

  Future<Shift> closeShift(int declaredCashPaise, {String? note}) async {
    final s = await _repo.closeShift(declaredCashPaise, note: note);
    _ref.invalidate(currentShiftProvider);
    _ref.invalidate(shiftsProvider);
    _ref.invalidate(cashBookProvider);
    return s;
  }
}

final ledgerActionsProvider = Provider<LedgerActions>(LedgerActions.new);
