import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/networking/api_client.dart';
import '../../../core/networking/api_exception.dart';
import '../../../core/providers.dart';
import 'room_models.dart';

/// Every room and room-type read and write.
///
/// Reads translate a missing endpoint into "nothing there" so a screen degrades
/// to an honest empty state; writes let the exception through, because a
/// silently swallowed create would leave someone believing a room exists.
class RoomsRepository {
  RoomsRepository(this._api);

  final ApiClient _api;

  // ----------------------------------------------------------- room types --

  Future<List<RoomType>> roomTypes(RoomTypeFilter filter) async {
    try {
      final data = await _api.get('/room-types', query: filter.toQuery());
      return _listOf(data, RoomType.fromJson);
    } on ApiException catch (e) {
      if (e.isMissingEndpoint) return const [];
      rethrow;
    }
  }

  /// The same catalogue, for the type pickers on screens the caller may not
  /// hold `roomtype.read` for. A receptionist lists rooms all day without ever
  /// being allowed the catalogue; one missing filter reads far better there
  /// than a red error stamped over a list that is working fine.
  Future<List<RoomType>> roomTypeOptions() async {
    try {
      return await roomTypes(
        const RoomTypeFilter(status: RoomTypeStatus.active),
      );
    } on ApiException catch (e) {
      if (e.code == ApiErrorCodes.forbidden ||
          e.code == RoomErrors.staffForbidden) {
        return const [];
      }
      rethrow;
    }
  }

  Future<RoomType?> roomType(String id) async {
    try {
      final data = await _api.get('/room-types/$id');
      return data is Map ? RoomType.fromJson(data) : null;
    } on ApiException catch (e) {
      if (e.isMissingEndpoint) return null;
      rethrow;
    }
  }

  Future<RoomType> createRoomType(NewRoomType input) async {
    final data = await _api.post('/room-types', body: input.toJson());
    return _one(data, RoomType.fromJson, 'room type');
  }

  /// [changes] carries only the fields that actually changed, so an untouched
  /// field is never rewritten with a value the form happened to be holding.
  Future<RoomType> updateRoomType(
    String id,
    Map<String, dynamic> changes,
  ) async {
    final data = await _api.patch('/room-types/$id', body: changes);
    return _one(data, RoomType.fromJson, 'room type');
  }

  Future<void> deleteRoomType(String id) => _api.delete('/room-types/$id');

  // ---------------------------------------------------------------- rooms --

  Future<List<Room>> rooms(RoomFilter filter) async {
    try {
      final data = await _api.get('/rooms', query: filter.toQuery());
      return _listOf(data, Room.fromJson);
    } on ApiException catch (e) {
      if (e.isMissingEndpoint) return const [];
      rethrow;
    }
  }

  Future<Room?> room(String id) async {
    try {
      final data = await _api.get('/rooms/$id');
      return data is Map ? Room.fromJson(data) : null;
    } on ApiException catch (e) {
      if (e.isMissingEndpoint) return null;
      rethrow;
    }
  }

  Future<Room> createRoom(NewRoom input) async {
    final data = await _api.post('/rooms', body: input.toJson());
    return _one(data, Room.fromJson, 'room');
  }

  Future<BulkRoomResult> createRooms(BulkRoomRequest request) async {
    final data = await _api.post('/rooms/bulk', body: request.toJson());
    return _one(data, BulkRoomResult.fromJson, 'result');
  }

  Future<Room> updateRoom(String id, Map<String, dynamic> changes) async {
    final data = await _api.patch('/rooms/$id', body: changes);
    return _one(data, Room.fromJson, 'room');
  }

  Future<RoomStatusChange> setRoomStatus(
    String id,
    RoomStatus status, {
    String? note,
  }) async {
    final data = await _api.post(
      '/rooms/$id/status',
      body: {
        'status': status.wire,
        if (note != null && note.isNotEmpty) 'note': note,
      },
    );
    return _one(data, RoomStatusChange.fromJson, 'room');
  }

  Future<void> deleteRoom(String id) => _api.delete('/rooms/$id');

  // ------------------------------------------------------------ amenities --

  /// The ROOM-scoped, ACTIVE catalogue that feeds every amenity picker.
  Future<List<Amenity>> amenities() async {
    try {
      final data = await _api.get('/amenities');
      return _listOf(data, Amenity.fromJson);
    } on ApiException catch (e) {
      if (e.isMissingEndpoint) return const [];
      rethrow;
    }
  }

  // -------------------------------------------------------------- helpers --

  static List<T> _listOf<T>(dynamic data, T Function(Map) parse) {
    if (data is List) return data.whereType<Map>().map(parse).toList();
    if (data is Map && data['items'] is List) {
      return (data['items'] as List).whereType<Map>().map(parse).toList();
    }
    return const [];
  }

  /// A write that comes back with something other than the saved record is a
  /// failure, not a success with a blank object.
  static T _one<T>(dynamic data, T Function(Map) parse, String what) {
    if (data is Map) return parse(data);
    throw ApiException(
      code: 'ERROR',
      message: 'The server did not send back the $what it saved.',
    );
  }
}

final roomsRepositoryProvider = Provider<RoomsRepository>(
  (ref) => RoomsRepository(ref.watch(apiClientProvider)),
);

/// The codes these endpoints return, mapped to copy someone can act on.
///
/// Anything unlisted keeps the server's own message: it is written for staff
/// too, and a friendlier invention would hide what actually happened.
class RoomErrors {
  RoomErrors._();

  static const roomTypeNotFound = 'ROOM_TYPE_NOT_FOUND';
  static const roomNotFound = 'ROOM_NOT_FOUND';
  static const roomTypeNameTaken = 'ROOM_TYPE_NAME_TAKEN';
  static const roomNumberTaken = 'ROOM_NUMBER_TAKEN';
  static const roomTypeInUse = 'ROOM_TYPE_IN_USE';
  static const amenityScopeMismatch = 'AMENITY_SCOPE_MISMATCH';
  static const nothingToUpdate = 'NOTHING_TO_UPDATE';
  static const nothingToCreate = 'NOTHING_TO_CREATE';
  static const staffForbidden = 'STAFF_FORBIDDEN';

  // Every case is written as a qualified name: a bare identifier in a pattern
  // is a variable binding, which would match everything.
  static String friendly(ApiException error) => switch (error.code) {
    RoomErrors.roomTypeNotFound =>
      'That room type is no longer there — someone may have removed it.',
    RoomErrors.roomNotFound =>
      'That room is no longer there — someone may have removed it.',
    RoomErrors.roomTypeNameTaken =>
      'Another room type at this property already uses that name.',
    RoomErrors.roomNumberTaken =>
      'A room with that number already exists at this property.',
    RoomErrors.roomTypeInUse =>
      'Rooms still use this type. Move them to another type first, or archive '
          'this one instead of deleting it.',
    RoomErrors.amenityScopeMismatch =>
      'One of those amenities does not belong to rooms. Reload and pick again.',
    RoomErrors.nothingToUpdate => 'Nothing has changed yet.',
    RoomErrors.nothingToCreate => 'There are no room numbers to create.',
    RoomErrors.staffForbidden ||
    ApiErrorCodes.forbidden => "Your role doesn't allow this change.",
    _ => error.message,
  };
}
