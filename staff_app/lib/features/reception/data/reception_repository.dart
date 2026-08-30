import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/networking/api_client.dart';
import '../../../core/networking/api_exception.dart';
import '../../../core/providers.dart';
import 'reception_models.dart';

/// Every reservation read and write, plus the two aggregate boards the apps
/// open on.
///
/// Same split as the rooms feature: reads translate a missing endpoint into
/// "nothing there" so a screen degrades to an honest empty state; writes let
/// the exception through, because a silently swallowed check-in would leave a
/// guest standing at the desk believing they have a room.
class ReceptionRepository {
  ReceptionRepository(this._api);

  final ApiClient _api;

  // ----------------------------------------------------------- the boards --

  Future<DeskBoard?> deskToday() async {
    try {
      final data = await _api.get('/desk/today');
      return data is Map ? DeskBoard.fromJson(data) : null;
    } on ApiException catch (e) {
      if (e.isMissingEndpoint) return null;
      rethrow;
    }
  }

  Future<GmDashboard?> dashboard() async {
    try {
      final data = await _api.get('/dashboard');
      return data is Map ? GmDashboard.fromJson(data) : null;
    } on ApiException catch (e) {
      if (e.isMissingEndpoint) return null;
      rethrow;
    }
  }

  // ---------------------------------------------------------- the bookings --

  Future<List<Reservation>> reservations(ReservationFilter filter) async {
    try {
      final data = await _api.get('/reservations', query: filter.toQuery());
      return _listOf(data, Reservation.fromJson);
    } on ApiException catch (e) {
      if (e.isMissingEndpoint) return const [];
      rethrow;
    }
  }

  /// The detail read, which alone carries the event trail.
  Future<Reservation?> reservation(String id) async {
    try {
      final data = await _api.get('/reservations/$id');
      return data is Map ? Reservation.fromJson(data) : null;
    } on ApiException catch (e) {
      if (e.isMissingEndpoint) return null;
      rethrow;
    }
  }

  /// Free rooms per type for a date range. A read, so a property whose
  /// availability endpoint is not live yet leaves the picker empty rather than
  /// stamping an error over a form that otherwise works.
  Future<List<RoomTypeAvailability>> availability(
    DateTime checkIn,
    DateTime checkOut,
  ) async {
    try {
      final data = await _api.get(
        '/reservations/availability',
        query: {'checkIn': isoDate(checkIn), 'checkOut': isoDate(checkOut)},
      );
      return _listOf(data, RoomTypeAvailability.fromJson);
    } on ApiException catch (e) {
      if (e.isMissingEndpoint) return const [];
      rethrow;
    }
  }

  Future<Reservation> create(NewReservation input) async {
    final data = await _api.post('/reservations', body: input.toJson());
    return _one(data, Reservation.fromJson, 'booking');
  }

  /// [changes] carries only the fields that actually changed, so an untouched
  /// field is never rewritten with a value the form happened to be holding.
  Future<Reservation> update(String id, Map<String, dynamic> changes) async {
    final data = await _api.patch('/reservations/$id', body: changes);
    return _one(data, Reservation.fromJson, 'booking');
  }

  // ------------------------------------------------------------ the moves --

  Future<Reservation> confirm(String id) async {
    final data = await _api.post('/reservations/$id/confirm');
    return _one(data, Reservation.fromJson, 'booking');
  }

  Future<Reservation> assignRoom(String id, String roomId) async {
    final data = await _api.post(
      '/reservations/$id/assign-room',
      body: {'roomId': roomId},
    );
    return _one(data, Reservation.fromJson, 'booking');
  }

  /// Move a guest who is ALREADY CHECKED IN to another room. Before check-in
  /// the room is simply (re)assigned — see [assignRoom]. The server re-quotes
  /// when the new room is a different type.
  Future<Reservation> moveRoom(String id, String roomId) async {
    final data = await _api.post(
      '/reservations/$id/move-room',
      body: {'roomId': roomId},
    );
    return _one(data, Reservation.fromJson, 'booking');
  }

  /// Push check-out later. [checkOut] is EXCLUSIVE and must be after the
  /// current one; the server refuses anything else.
  Future<Reservation> extendStay(String id, DateTime checkOut) async {
    final data = await _api.post(
      '/reservations/$id/extend',
      body: {'checkOut': isoDate(checkOut)},
    );
    return _one(data, Reservation.fromJson, 'booking');
  }

  Future<Reservation> checkIn(
    String id, {
    String? roomId,
    String? guestIdType,
    String? guestIdNumber,
  }) async {
    final data = await _api.post(
      '/reservations/$id/check-in',
      body: {
        if (roomId != null && roomId.isNotEmpty) 'roomId': roomId,
        if (guestIdType != null && guestIdType.isNotEmpty)
          'guestIdType': guestIdType,
        if (guestIdNumber != null && guestIdNumber.isNotEmpty)
          'guestIdNumber': guestIdNumber,
      },
    );
    return _one(data, Reservation.fromJson, 'booking');
  }

  Future<Reservation> checkOut(
    String id, {
    int? collectedPaise,
    String? paymentMethod,
    bool allowOutstanding = false,
    String? note,
    String? idempotencyKey,
  }) async {
    final data = await _api.post(
      '/reservations/$id/check-out',
      body: {
        if (collectedPaise != null) 'collectedPaise': collectedPaise,
        if (paymentMethod != null) 'paymentMethod': paymentMethod,
        if (allowOutstanding) 'allowOutstanding': true,
        if (note != null && note.isNotEmpty) 'note': note,
        if (idempotencyKey != null) 'idempotencyKey': idempotencyKey,
      },
    );
    return _one(data, Reservation.fromJson, 'booking');
  }

  /// The itemised folio for a stay: room, ancillary charges, payments, balance.
  Future<Folio> folio(String id) async {
    final data = await _api.get('/reservations/$id/folio');
    return _one(data, Folio.fromJson, 'folio');
  }

  /// Take a payment against a stay's folio. Idempotent: pass a stable key so a
  /// double-tap on a flaky connection never charges the guest twice.
  Future<void> collectPayment(
    String id, {
    required String method,
    required int amountPaise,
    String? reference,
    String? note,
    String? idempotencyKey,
  }) async {
    await _api.post(
      '/reservations/$id/payments',
      body: {
        'method': method,
        'amountPaise': amountPaise,
        if (reference != null && reference.isNotEmpty) 'reference': reference,
        if (note != null && note.isNotEmpty) 'note': note,
        if (idempotencyKey != null) 'idempotencyKey': idempotencyKey,
      },
    );
  }

  /// Record a refund against a stay's folio. Behind the stronger
  /// `payment.refund` server-side.
  Future<void> refund(
    String id, {
    required String method,
    required int amountPaise,
    String? reference,
    String? note,
    String? idempotencyKey,
  }) async {
    await _api.post(
      '/reservations/$id/refunds',
      body: {
        'method': method,
        'amountPaise': amountPaise,
        if (reference != null && reference.isNotEmpty) 'reference': reference,
        if (note != null && note.isNotEmpty) 'note': note,
        if (idempotencyKey != null) 'idempotencyKey': idempotencyKey,
      },
    );
  }

  /// The reason is required by the server, not optional politeness: a
  /// cancellation nobody explained is unauditable.
  Future<Reservation> cancel(String id, String reason) async {
    final data = await _api.post(
      '/reservations/$id/cancel',
      body: {'reason': reason},
    );
    return _one(data, Reservation.fromJson, 'booking');
  }

  Future<Reservation> noShow(String id, {String? note}) async {
    final data = await _api.post(
      '/reservations/$id/no-show',
      body: {if (note != null && note.isNotEmpty) 'note': note},
    );
    return _one(data, Reservation.fromJson, 'booking');
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

final receptionRepositoryProvider = Provider<ReceptionRepository>(
  (ref) => ReceptionRepository(ref.watch(apiClientProvider)),
);

/// The codes the reservations surface returns, mapped to copy someone at the
/// desk can act on.
///
/// Anything unlisted keeps the server's own message: it is written for staff
/// too, and a friendlier invention would hide what actually happened.
class ReservationErrors {
  ReservationErrors._();

  static const reservationNotFound = 'RESERVATION_NOT_FOUND';
  static const roomNotFound = 'ROOM_NOT_FOUND';
  static const roomTypeNotFound = 'ROOM_TYPE_NOT_FOUND';
  static const roomUnavailable = 'ROOM_UNAVAILABLE';
  static const noAvailability = 'NO_AVAILABILITY';
  static const roomNotReady = 'ROOM_NOT_READY';
  static const roomTypeMismatch = 'ROOM_TYPE_MISMATCH';
  static const invalidTransition = 'INVALID_TRANSITION';
  static const invalidDates = 'INVALID_DATES';
  static const notArrivalDay = 'NOT_ARRIVAL_DAY';
  static const noRoomAssigned = 'NO_ROOM_ASSIGNED';
  static const datesLocked = 'DATES_LOCKED';
  static const nothingToUpdate = 'NOTHING_TO_UPDATE';
  static const staffForbidden = 'STAFF_FORBIDDEN';

  // Every case is written as a qualified name: a bare identifier in a pattern
  // is a variable binding, which would match everything.
  static String friendly(ApiException error) => switch (error.code) {
    ReservationErrors.reservationNotFound =>
      'That booking is no longer there — it may have been removed.',
    ReservationErrors.roomNotFound =>
      'That room is no longer there — someone may have removed it.',
    ReservationErrors.roomTypeNotFound =>
      'That room type is no longer there — someone may have removed it.',
    ReservationErrors.roomUnavailable =>
      'That room is already booked for part of those dates. Pick another one.',
    ReservationErrors.noAvailability =>
      'Every room of that type is taken for at least one night of the stay.',
    ReservationErrors.roomNotReady =>
      'That room is not fit for a guest yet. Housekeeping has to release it '
          'first.',
    ReservationErrors.roomTypeMismatch =>
      'That room is not of the type this booking was sold as.',
    ReservationErrors.invalidTransition =>
      'This booking has already moved on. Reload it and look again.',
    ReservationErrors.invalidDates =>
      'Check-out has to be at least one day after check-in.',
    ReservationErrors.notArrivalDay =>
      "Today falls outside this booking's stay dates.",
    ReservationErrors.noRoomAssigned =>
      'Assign a room before checking this guest in.',
    ReservationErrors.datesLocked =>
      'Stay dates can only be changed before the guest checks in.',
    ReservationErrors.nothingToUpdate => 'Nothing has changed yet.',
    ReservationErrors.staffForbidden ||
    ApiErrorCodes.forbidden => "Your role doesn't allow this.",
    _ => error.message,
  };
}
