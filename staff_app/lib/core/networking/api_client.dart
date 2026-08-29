import 'package:dio/dio.dart';

import '../config/app_config.dart';
import '../storage/token_store.dart';
import 'api_exception.dart';

/// Thin wrapper over Dio that:
///  - attaches the staff bearer token,
///  - unwraps the `{ success, data, error, meta }` envelope,
///  - refreshes the access token once on 401 (single-flight, shared by all
///    concurrent callers),
///  - maps every failure to [ApiException].
///
/// Adapted from the proven owner-app client; the base URL and token namespace
/// are the only behavioural differences.
class ApiClient {
  ApiClient(this._tokens, {Dio? dio, this.onSessionExpired}) {
    _dio =
        dio ??
        Dio(
          BaseOptions(
            baseUrl: AppConfig.staffApi,
            connectTimeout: const Duration(seconds: 15),
            receiveTimeout: const Duration(seconds: 20),
            headers: {'Content-Type': 'application/json'},
            validateStatus: (_) => true, // envelopes are inspected below
          ),
        );
  }

  late final Dio _dio;
  final TokenStore _tokens;

  /// Invoked once when a refresh fails and the session is dropped, so the
  /// router can send the user to the "session expired" screen.
  final void Function()? onSessionExpired;

  Future<bool>? _refreshing;

  Future<dynamic> get(String path, {Map<String, dynamic>? query}) =>
      _send('GET', path, query: query);

  Future<dynamic> post(String path, {Object? body}) =>
      _send('POST', path, body: body);

  Future<dynamic> patch(String path, {Object? body}) =>
      _send('PATCH', path, body: body);

  Future<dynamic> delete(String path, {Object? body}) =>
      _send('DELETE', path, body: body);

  /// Multipart POST (evidence photos). Dio derives the boundary from [form],
  /// so the JSON default content type must be overridden.
  Future<dynamic> postMultipart(String path, FormData form) =>
      _send('POST', path, body: form, multipart: true);

  Future<dynamic> _send(
    String method,
    String path, {
    Map<String, dynamic>? query,
    Object? body,
    bool retry = true,
    bool multipart = false,
  }) async {
    Response res;
    try {
      final token = await _tokens.access();
      res = await _dio.request(
        path,
        queryParameters: query,
        data: body,
        options: Options(
          method: method,
          contentType: multipart ? 'multipart/form-data' : null,
          headers: token != null ? {'Authorization': 'Bearer $token'} : null,
        ),
      );
    } on DioException catch (e) {
      if (e.type == DioExceptionType.connectionError ||
          e.type == DioExceptionType.connectionTimeout ||
          e.type == DioExceptionType.receiveTimeout ||
          e.type == DioExceptionType.sendTimeout) {
        throw ApiException.network();
      }
      throw ApiException(
        code: ApiErrorCodes.transport,
        message: e.message ?? 'Request failed',
      );
    }

    if (res.statusCode == 401 && retry) {
      final ok = await _refreshOnce();
      if (ok) {
        return _send(
          method,
          path,
          query: query,
          body: body,
          retry: false,
          multipart: multipart,
        );
      }
      await _tokens.clear();
      onSessionExpired?.call();
      throw const ApiException(
        code: ApiErrorCodes.unauthenticated,
        message: 'Your session has expired. Please sign in again.',
        status: 401,
      );
    }

    final data = res.data;
    if (data is Map && data['success'] == true) return data['data'];

    final err = (data is Map ? data['error'] : null) as Map?;
    throw ApiException(
      code: (err?['code'] as String?) ?? _codeForStatus(res.statusCode),
      message: (err?['message'] as String?) ?? 'Something went wrong.',
      status: res.statusCode,
    );
  }

  String _codeForStatus(int? status) => switch (status) {
    403 => ApiErrorCodes.forbidden,
    404 => ApiErrorCodes.notFound,
    _ => 'ERROR',
  };

  Future<bool> _refreshOnce() =>
      _refreshing ??= _doRefresh().whenComplete(() => _refreshing = null);

  Future<bool> _doRefresh() async {
    final refresh = await _tokens.refresh();
    if (refresh == null) return false;
    try {
      final res = await _dio.post(
        '/auth/refresh',
        data: {'refreshToken': refresh},
      );
      final data = res.data;
      if (data is Map && data['success'] == true) {
        final d = data['data'] as Map;
        await _tokens.save(
          access: d['accessToken'] as String,
          refresh: (d['refreshToken'] as String?) ?? refresh,
        );
        return true;
      }
    } catch (_) {
      // fall through — treated as a failed refresh
    }
    return false;
  }
}
