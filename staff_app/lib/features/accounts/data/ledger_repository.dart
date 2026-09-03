import '../../../core/networking/api_client.dart';
import 'ledger_models.dart';

class LedgerRepository {
  LedgerRepository(this._api);
  final ApiClient _api;

  List<T> _list<T>(Object? data, T Function(Map) parse) {
    final raw = data is Map && data['items'] is List ? data['items'] : data;
    return (raw as List? ?? const []).whereType<Map>().map(parse).toList();
  }

  Future<List<CorporateAccount>> corporateAccounts() async =>
      _list(await _api.get('/corporate-accounts'), CorporateAccount.fromJson);
  Future<void> createCorporate(Map<String, dynamic> b) =>
      _api.post('/corporate-accounts', body: b);
  Future<void> updateCorporate(String id, Map<String, dynamic> b) =>
      _api.patch('/corporate-accounts/$id', body: b);
  Future<CorporateStatement> statement(String id) async =>
      CorporateStatement.fromJson(
        await _api.get('/corporate-accounts/$id/statement') as Map,
      );
  Future<void> corporatePayment(
    String id, {
    required int amountPaise,
    String? reference,
    String? note,
  }) => _api.post(
    '/corporate-accounts/$id/payments',
    body: {
      'amountPaise': amountPaise,
      if (reference != null && reference.isNotEmpty) 'reference': reference,
      if (note != null && note.isNotEmpty) 'note': note,
    },
  );

  Future<CashBook> cash({int days = 7}) async => CashBook.fromJson(
    await _api.get('/cash', query: {'days': '$days'}) as Map,
  );
  Future<void> cashEntry({
    required String kind,
    required int amountPaise,
    required String note,
  }) => _api.post(
    '/cash',
    body: {'kind': kind, 'amountPaise': amountPaise, 'note': note},
  );
  Future<List<Shift>> shifts() async =>
      _list(await _api.get('/cash/shifts'), Shift.fromJson);
  Future<Shift?> currentShift() async {
    final d = await _api.get('/cash/shifts/current');
    return d is Map ? Shift.fromJson(d) : null;
  }

  Future<void> openShift(int openingCashPaise, {String? note}) => _api.post(
    '/cash/shifts/open',
    body: {
      'openingCashPaise': openingCashPaise,
      if (note != null && note.isNotEmpty) 'note': note,
    },
  );
  Future<Shift> closeShift(int declaredCashPaise, {String? note}) async =>
      Shift.fromJson(
        await _api.post(
              '/cash/shifts/close',
              body: {
                'declaredCashPaise': declaredCashPaise,
                if (note != null && note.isNotEmpty) 'note': note,
              },
            )
            as Map,
      );
}
