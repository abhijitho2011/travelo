import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/networking/api_client.dart';
import '../../../core/networking/api_exception.dart';
import '../../../core/providers.dart';
import 'board_models.dart';
import 'task_models.dart';

/// The supervisor's reads and writes: the room board, the filtered task list,
/// the assignee picker, and the assign/inspect actions.
class BoardRepository {
  BoardRepository(this._api);

  final ApiClient _api;

  Future<HousekeepingBoard> board() async {
    try {
      final data = await _api.get('/housekeeping/board');
      if (data is Map) return HousekeepingBoard.fromJson(data);
      return const HousekeepingBoard(
        groups: {},
        counts: {},
        totalRooms: 0,
        areaTasks: [],
      );
    } on ApiException catch (e) {
      if (e.isMissingEndpoint) {
        return const HousekeepingBoard(
          groups: {},
          counts: {},
          totalRooms: 0,
          areaTasks: [],
        );
      }
      rethrow;
    }
  }

  Future<List<StaffTask>> tasks({String? status, String? type}) async {
    try {
      final data = await _api.get(
        '/housekeeping/tasks',
        query: {
          if (status != null) 'status': status,
          if (type != null) 'type': type,
        },
      );
      if (data is Map && data['items'] is List) {
        return (data['items'] as List)
            .whereType<Map>()
            .map(StaffTask.fromJson)
            .toList();
      }
      if (data is List) {
        return data.whereType<Map>().map(StaffTask.fromJson).toList();
      }
      return const [];
    } on ApiException catch (e) {
      if (e.isMissingEndpoint) return const [];
      rethrow;
    }
  }

  Future<List<HkAssignee>> assignableStaff() async {
    try {
      final data = await _api.get('/housekeeping/staff');
      if (data is List) {
        return data.whereType<Map>().map(HkAssignee.fromJson).toList();
      }
      return const [];
    } on ApiException catch (e) {
      if (e.isMissingEndpoint) return const [];
      rethrow;
    }
  }

  /// Every dirty, cleaning or inspected room becomes READY — the end of the round.
  Future<int> markAllClean() async {
    final data = await _api.post('/rooms/status/mark-all-clean', body: {});
    return data is Map ? (data['updated'] as int? ?? 0) : 0;
  }

  /// One status for many rooms at once.
  Future<int> bulkStatus(
    List<String> roomIds,
    String status, {
    String? note,
  }) async {
    final data = await _api.post(
      '/rooms/status/bulk',
      body: {
        'ids': roomIds,
        'status': status,
        if (note != null && note.isNotEmpty) 'note': note,
      },
    );
    return data is Map ? (data['updated'] as int? ?? 0) : 0;
  }

  /// The printable charter, as CSV text.
  Future<String> charterCsv() async {
    final data = await _api.get('/housekeeping/charter.csv');
    return data is String ? data : '$data';
  }

  Future<void> assign(String taskId, String staffId) => _api.post(
    '/housekeeping/tasks/$taskId/assign',
    body: {'staffId': staffId},
  );

  Future<void> inspect(String taskId, {required bool pass, String? notes}) =>
      _api.post(
        '/housekeeping/tasks/$taskId/inspect',
        body: {
          'pass': pass,
          if (notes != null && notes.isNotEmpty) 'notes': notes,
        },
      );
}

final boardRepositoryProvider = Provider<BoardRepository>(
  (ref) => BoardRepository(ref.watch(apiClientProvider)),
);
