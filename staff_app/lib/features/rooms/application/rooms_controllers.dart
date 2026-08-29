import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../data/room_models.dart';
import '../data/rooms_repository.dart';

// ----------------------------------------------------------------- catalogue

/// The amenity catalogue is a property-level constant in practice, and every
/// form needs it the moment it opens. Deliberately NOT autoDispose: refetching
/// it each time a form is opened buys nothing and costs a visible blank.
final amenityCatalogueProvider = FutureProvider<List<Amenity>>(
  (ref) => ref.watch(roomsRepositoryProvider).amenities(),
);

// ---------------------------------------------------------------- room types

final roomTypeFilterProvider = StateProvider<RoomTypeFilter>(
  (_) => const RoomTypeFilter(),
);

final roomTypesProvider = FutureProvider.autoDispose<List<RoomType>>((ref) {
  final filter = ref.watch(roomTypeFilterProvider);
  return ref.watch(roomsRepositoryProvider).roomTypes(filter);
});

/// The active catalogue as a picker feed. Separate from [roomTypesProvider]
/// because it must survive the caller not holding `roomtype.read`, and because
/// the Room-types screen's own filters must not change what a room form offers.
final roomTypeOptionsProvider = FutureProvider<List<RoomType>>(
  (ref) => ref.watch(roomsRepositoryProvider).roomTypeOptions(),
);

final roomTypeDetailProvider = FutureProvider.autoDispose
    .family<RoomType?, String>(
      (ref, id) => ref.watch(roomsRepositoryProvider).roomType(id),
    );

// --------------------------------------------------------------------- rooms

final roomFilterProvider = StateProvider<RoomFilter>((_) => const RoomFilter());

final roomsProvider = FutureProvider.autoDispose<List<Room>>((ref) {
  final filter = ref.watch(roomFilterProvider);
  return ref.watch(roomsRepositoryProvider).rooms(filter);
});

final roomDetailProvider = FutureProvider.autoDispose.family<Room?, String>(
  (ref, id) => ref.watch(roomsRepositoryProvider).room(id),
);

/// The board, already grouped. Grouping in a provider keeps the screen free of
/// arithmetic and gives the loading/error states one place to live.
final roomsByFloorProvider = Provider.autoDispose<AsyncValue<List<FloorGroup>>>(
  (ref) => ref.watch(roomsProvider).whenData(groupRoomsByFloor),
);

// ------------------------------------------------------------------- actions

/// Writes against a single room type. Each throws on failure — the caller
/// shows the message rather than pretending the change stuck.
class RoomTypeActions {
  const RoomTypeActions(this._ref);

  final Ref _ref;

  RoomsRepository get _repo => _ref.read(roomsRepositoryProvider);

  Future<RoomType> create(NewRoomType input) async {
    final created = await _repo.createRoomType(input);
    _invalidate();
    return created;
  }

  Future<RoomType> update(String id, Map<String, dynamic> changes) async {
    final updated = await _repo.updateRoomType(id, changes);
    _invalidate();
    _ref.invalidate(roomTypeDetailProvider(id));
    return updated;
  }

  Future<void> remove(String id) async {
    await _repo.deleteRoomType(id);
    _invalidate();
  }

  /// A type's name, bed type and AC flag are printed on every room row, so the
  /// board is stale the instant a type changes.
  void _invalidate() {
    _ref.invalidate(roomTypesProvider);
    _ref.invalidate(roomTypeOptionsProvider);
    _ref.invalidate(roomsProvider);
  }
}

final roomTypeActionsProvider = Provider<RoomTypeActions>(RoomTypeActions.new);

/// Writes against rooms, including the status change every shift makes dozens
/// of times a day.
class RoomActions {
  const RoomActions(this._ref);

  final Ref _ref;

  RoomsRepository get _repo => _ref.read(roomsRepositoryProvider);

  Future<Room> create(NewRoom input) async {
    final created = await _repo.createRoom(input);
    _invalidate();
    return created;
  }

  Future<BulkRoomResult> createMany(BulkRoomRequest request) async {
    final result = await _repo.createRooms(request);
    _invalidate();
    return result;
  }

  Future<Room> update(String id, Map<String, dynamic> changes) async {
    final updated = await _repo.updateRoom(id, changes);
    _invalidate();
    _ref.invalidate(roomDetailProvider(id));
    return updated;
  }

  Future<RoomStatusChange> setStatus(
    String id,
    RoomStatus status, {
    String? note,
  }) async {
    final change = await _repo.setRoomStatus(id, status, note: note);
    _ref.invalidate(roomsProvider);
    _ref.invalidate(roomDetailProvider(id));
    return change;
  }

  Future<void> remove(String id) async {
    await _repo.deleteRoom(id);
    _invalidate();
  }

  /// Room types carry a live `roomCount`, so creating or deleting a room dates
  /// the catalogue as well as the board.
  void _invalidate() {
    _ref.invalidate(roomsProvider);
    _ref.invalidate(roomTypesProvider);
  }
}

final roomActionsProvider = Provider<RoomActions>(RoomActions.new);
