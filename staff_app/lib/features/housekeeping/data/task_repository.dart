import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/networking/api_client.dart';
import '../../../core/networking/api_exception.dart';
import '../../../core/providers.dart';
import 'task_models.dart';

class TaskRepository {
  TaskRepository(this._api);

  final ApiClient _api;

  Future<List<StaffTask>> myTasks() async {
    try {
      final data = await _api.get('/tasks/mine');
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
    } on ApiException catch (e) {
      if (e.isMissingEndpoint) return const [];
      rethrow;
    }
  }

  Future<void> setStage(String taskId, TaskStage stage, {String? note}) =>
      _api.post(
        '/tasks/$taskId/stage',
        body: {'stage': stage.name.toUpperCase(), if (note != null) 'note': note},
      );

  Future<void> reportIssue(
    String taskId, {
    required String description,
    String? photoPath,
  }) => _api.post(
    '/tasks/$taskId/issue',
    body: {
      'description': description,
      if (photoPath != null) 'photoPath': photoPath,
    },
  );
}

final taskRepositoryProvider = Provider<TaskRepository>(
  (ref) => TaskRepository(ref.watch(apiClientProvider)),
);
