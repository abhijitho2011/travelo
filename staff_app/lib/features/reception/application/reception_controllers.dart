import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../rooms/data/room_models.dart' show Room, RoomFilter, RoomStatus;
import '../../rooms/data/rooms_repository.dart' show roomsRepositoryProvider;
import '../data/reception_models.dart';
import '../data/reception_repository.dart';
import 'reservation_calendar_controllers.dart';

// ------------------------------------------------------------- the boards --

/// The reception dashboard. One request, so every figure on the screen is from
/// the same instant.
final deskTodayProvider = FutureProvider.autoDispose<DeskBoard?>(
  (ref) => ref.watch(receptionRepositoryProvider).deskToday(),
);

/// The GM/AGM tiles. Separate from [deskTodayProvider] because it is a
/// different permission (`dashboard.read`) and a different audience.
final gmDashboardProvider = FutureProvider.autoDispose<GmDashboard?>(
  (ref) => ref.watch(receptionRepositoryProvider).dashboard(),
);

// ----------------------------------------------------------- the bookings --

final reservationFilterProvider = StateProvider<ReservationFilter>(
  (_) => const ReservationFilter(),
);

final reservationsProvider = FutureProvider.autoDispose<List<Reservation>>((
  ref,
) {
  final filter = ref.watch(reservationFilterProvider);
  return ref.watch(receptionRepositoryProvider).reservations(filter);
});

final reservationProvider = FutureProvider.autoDispose
    .family<Reservation?, String>(
      (ref, id) => ref.watch(receptionRepositoryProvider).reservation(id),
    );

/// The itemised folio for one stay. Autodisposed and keyed by reservation id,
/// invalidated whenever a payment, refund or checkout lands.
/// The folio's own log — who changed what on the bill.
final folioEventsProvider = FutureProvider.autoDispose
    .family<List<FolioEvent>, String>(
      (ref, id) => ref.watch(receptionRepositoryProvider).folioEvents(id),
    );

final folioProvider = FutureProvider.autoDispose.family<Folio, String>(
  (ref, id) => ref.watch(receptionRepositoryProvider).folio(id),
);

/// The dates a booking form is currently asking about. A record rather than a
/// class so two forms on the same range share one fetch for free.
typedef StayRange = ({DateTime checkIn, DateTime checkOut});

/// Free rooms per type for one range. Keyed on the range, so moving a date
/// refetches and moving it back does not.
final availabilityProvider = FutureProvider.autoDispose
    .family<List<RoomTypeAvailability>, StayRange>(
      (ref, range) => ref
          .watch(receptionRepositoryProvider)
          .availability(range.checkIn, range.checkOut),
    );

/// The rooms a guest on this booking could actually be put in: rooms of the
/// type the stay was SOLD as, in a housekeeping state fit for an arrival.
///
/// Deliberately filtered on the client. The rooms endpoint takes one status at
/// a time, and three round trips to build one picker is worse than fetching a
/// property's rooms of one type — a few dozen rows — and narrowing them here.
/// The set matches `ASSIGNABLE_ROOM_STATUSES` on the server, which has the
/// final say either way.
final assignableRoomsProvider = FutureProvider.autoDispose
    .family<List<Room>, String>((ref, roomTypeId) async {
      final rooms = await ref
          .watch(roomsRepositoryProvider)
          .rooms(RoomFilter(roomTypeId: roomTypeId));
      return rooms
          .where((r) => kAssignableRoomStatuses.contains(r.status))
          .toList(growable: false);
    });

/// AVAILABLE, READY and INSPECTED. DIRTY, CLEANING and OCCUPIED all mean
/// somebody or something is still in the room; MAINTENANCE and OUT_OF_ORDER
/// mean it is off the board.
const kAssignableRoomStatuses = <RoomStatus>{
  RoomStatus.available,
  RoomStatus.ready,
  RoomStatus.inspected,
};

// ------------------------------------------------------------------ actions --

/// Every write against a booking. Each throws on failure — the caller shows
/// the message rather than pretending the change stuck.
class ReservationActions {
  const ReservationActions(this._ref);

  final Ref _ref;

  ReceptionRepository get _repo => _ref.read(receptionRepositoryProvider);

  Future<Reservation> create(NewReservation input) async {
    final created = await _repo.create(input);
    _invalidate();
    return created;
  }

  Future<Reservation> update(String id, Map<String, dynamic> changes) async {
    final updated = await _repo.update(id, changes);
    _invalidate(id);
    return updated;
  }

  Future<void> folioDiscount(
    String id, {
    required int amountPaise,
    required String reason,
  }) async {
    await _repo.folioDiscount(id, amountPaise: amountPaise, reason: reason);
    _ref.invalidate(folioProvider(id));
    _ref.invalidate(folioEventsProvider(id));
  }

  Future<void> folioVoidLine(
    String id,
    String lineId, {
    required String reason,
  }) async {
    await _repo.folioVoidLine(id, lineId, reason: reason);
    _ref.invalidate(folioProvider(id));
    _ref.invalidate(folioEventsProvider(id));
  }

  Future<void> folioTaxExempt(
    String id,
    String lineId, {
    required bool exempt,
    required String reason,
  }) async {
    await _repo.folioTaxExempt(id, lineId, exempt: exempt, reason: reason);
    _ref.invalidate(folioProvider(id));
    _ref.invalidate(folioEventsProvider(id));
  }

  Future<Reservation> lockRoom(String id, bool locked) async {
    final r = await _repo.lockRoom(id, locked);
    _invalidate(id);
    return r;
  }

  Future<void> swapRooms(String id, String otherId) async {
    await _repo.swapRooms(id, otherId);
    _invalidate(id);
    _invalidate(otherId);
  }

  Future<Map> autoAllocate(
    DateTime from,
    DateTime to, {
    bool dryRun = false,
  }) async {
    final res = await _repo.autoAllocate(from, to, dryRun: dryRun);
    if (!dryRun) _invalidate();
    return res;
  }

  Future<Reservation> confirm(String id) async {
    final result = await _repo.confirm(id);
    _invalidate(id);
    return result;
  }

  Future<Reservation> assignRoom(String id, String roomId) async {
    final result = await _repo.assignRoom(id, roomId);
    _invalidate(id);
    return result;
  }

  /// Move a CHECKED-IN guest to another room. Before check-in the room is just
  /// (re)assigned — the calendar picks whichever of the two the status calls for.
  Future<Reservation> moveRoom(String id, String roomId) async {
    final result = await _repo.moveRoom(id, roomId);
    _invalidate(id);
    return result;
  }

  /// Push check-out later. EXCLUSIVE, and the server refuses anything that is
  /// not strictly after the current check-out.
  Future<Reservation> extendStay(String id, DateTime checkOut) async {
    final result = await _repo.extendStay(id, checkOut);
    _invalidate(id);
    return result;
  }

  Future<Reservation> checkIn(
    String id, {
    String? roomId,
    String? guestIdType,
    String? guestIdNumber,
  }) async {
    final result = await _repo.checkIn(
      id,
      roomId: roomId,
      guestIdType: guestIdType,
      guestIdNumber: guestIdNumber,
    );
    _invalidate(id);
    return result;
  }

  Future<Reservation> checkOut(
    String id, {
    int? collectedPaise,
    String? paymentMethod,
    bool allowOutstanding = false,
    String? note,
    String? idempotencyKey,
  }) async {
    final result = await _repo.checkOut(
      id,
      collectedPaise: collectedPaise,
      paymentMethod: paymentMethod,
      allowOutstanding: allowOutstanding,
      note: note,
      idempotencyKey: idempotencyKey,
    );
    _invalidate(id);
    return result;
  }

  Future<void> collectPayment(
    String id, {
    required String method,
    required int amountPaise,
    String? reference,
    String? note,
    String? idempotencyKey,
  }) async {
    await _repo.collectPayment(
      id,
      method: method,
      amountPaise: amountPaise,
      reference: reference,
      note: note,
      idempotencyKey: idempotencyKey,
    );
    _ref.invalidate(folioProvider(id));
    _invalidate(id);
  }

  Future<void> refund(
    String id, {
    required String method,
    required int amountPaise,
    String? reference,
    String? note,
    String? idempotencyKey,
  }) async {
    await _repo.refund(
      id,
      method: method,
      amountPaise: amountPaise,
      reference: reference,
      note: note,
      idempotencyKey: idempotencyKey,
    );
    _ref.invalidate(folioProvider(id));
    _invalidate(id);
  }

  Future<Reservation> cancel(String id, String reason) async {
    final result = await _repo.cancel(id, reason);
    _invalidate(id);
    return result;
  }

  Future<Reservation> noShow(String id, {String? note}) async {
    final result = await _repo.noShow(id, note: note);
    _invalidate(id);
    return result;
  }

  /// Every one of these writes moves a room in or out of service, so the desk
  /// board and the GM tiles are stale the moment any of them lands — not just
  /// the list the caller happens to be looking at.
  void _invalidate([String? id]) {
    _ref.invalidate(reservationsProvider);
    _ref.invalidate(reservationCalendarProvider);
    _ref.invalidate(deskTodayProvider);
    _ref.invalidate(gmDashboardProvider);
    if (id != null) _ref.invalidate(reservationProvider(id));
  }
}

final reservationActionsProvider = Provider<ReservationActions>(
  ReservationActions.new,
);
