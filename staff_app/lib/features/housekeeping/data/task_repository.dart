import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/networking/api_client.dart';
import '../../../core/networking/api_exception.dart';
import '../../../core/providers.dart';
import 'task_models.dart';

/// The attendant/cleaner feed and the two actions they drive on it.
///
/// Reads translate a missing endpoint into "nothing there" so the screen
/// degrades to an honest empty state; the action writes let the exception
/// through so the controller can queue them offline or surface a rejection.
class TaskRepository {
  TaskRepository(this._api);

  final ApiClient _api;

  Future<List<StaffTask>> myTasks() async {
    try {
      final data = await _api.get('/housekeeping/my-tasks');
      return _listOf(data);
    } on ApiException catch (e) {
      if (e.isMissingEndpoint) return const [];
      rethrow;
    }
  }

  /// Advances a task through `start` / `complete` — the attendant's two verbs.
  Future<void> act(String taskId, String action, {String? notes}) => _api.post(
    '/housekeeping/tasks/$taskId/$action',
    body: {if (notes != null && notes.isNotEmpty) 'notes': notes},
  );

  List<StaffTask> _listOf(dynamic data) {
    if (data is List) {
      return data.whereType<Map>().map(StaffTask.fromJson).toList();
    }
    if (data is Map && data['items'] is List) {
      return (data['items'] as List)
          .whereType<Map>()
          .map(StaffTask.fromJson)
          .toList();
    }
    return const [];
  }
}

final taskRepositoryProvider = Provider<TaskRepository>(
  (ref) => TaskRepository(ref.watch(apiClientProvider)),
);
