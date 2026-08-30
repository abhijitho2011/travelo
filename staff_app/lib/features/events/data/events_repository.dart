import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/networking/api_client.dart';
import '../../../core/networking/api_exception.dart';
import '../../../core/providers.dart';
import 'events_models.dart';

/// Every events read and write. Reads degrade a missing endpoint to empty;
/// writes surface the exception.
class EventsRepository {
  EventsRepository(this._api);

  final ApiClient _api;

  Future<List<EventItem>> events({EventStatus? status}) async {
    try {
      final data = await _api.get('/events', query: {
        if (status != null) 'status': status.wire,
      });
      final items = data is Map ? data['items'] : data;
      if (items is List) return items.whereType<Map>().map(EventItem.fromJson).toList();
      return const [];
    } on ApiException catch (e) {
      if (e.isMissingEndpoint) return const [];
      rethrow;
    }
  }

  Future<EventItem?> event(String id) async {
    final data = await _api.get('/events/$id');
    return data is Map ? EventItem.fromJson(data) : null;
  }

  Future<EventsDashboard?> dashboard() async {
    try {
      final data = await _api.get('/events/dashboard');
      return data is Map ? EventsDashboard.fromJson(data) : null;
    } on ApiException catch (e) {
      if (e.isMissingEndpoint) return null;
      rethrow;
    }
  }

  Future<void> createEvent(Map<String, dynamic> body) => _api.post('/events', body: body);

  Future<void> updateEvent(String id, Map<String, dynamic> changes) =>
      _api.patch('/events/$id', body: changes);

  Future<void> setStatus(String id, EventStatus status) =>
      _api.post('/events/$id/status', body: {'status': status.wire});

  Future<void> cancel(String id, {String? reason}) =>
      _api.post('/events/$id/cancel', body: {if (reason != null) 'reason': reason});

  // Tasks
  Future<void> addTask(String eventId, Map<String, dynamic> body) =>
      _api.post('/events/$eventId/tasks', body: body);

  Future<void> updateTask(String taskId, Map<String, dynamic> changes) =>
      _api.patch('/events/tasks/$taskId', body: changes);

  Future<void> deleteTask(String taskId) => _api.delete('/events/tasks/$taskId');
}

final eventsRepositoryProvider = Provider<EventsRepository>(
  (ref) => EventsRepository(ref.watch(apiClientProvider)),
);
