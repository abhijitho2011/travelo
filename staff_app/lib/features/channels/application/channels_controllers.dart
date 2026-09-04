import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../rooms/application/rooms_controllers.dart';
import '../../rooms/data/units_repository.dart';
import '../../rooms/data/room_models.dart';
import '../../rooms/data/unit_models.dart';
import '../data/channels_repository.dart';

/// The Channex (or other) connections the property has.
final channelConnectionsProvider =
    FutureProvider.autoDispose<List<ChannelConnection>>((ref) {
      return ref.watch(channelsRepositoryProvider).connections();
    });

/// One row per room type × connection: fetches each room type's mappings.
final channelMatrixProvider =
    FutureProvider.autoDispose<
      List<({RoomType type, List<ChannelMapping> mappings})>
    >((ref) async {
      final types = await ref.watch(roomTypesProvider.future);
      final repo = ref.watch(unitsRepositoryProvider);
      final out = <({RoomType type, List<ChannelMapping> mappings})>[];
      for (final t in types) {
        final maps = await repo.channelMappings(t.id);
        out.add((type: t, mappings: maps));
      }
      return out;
    });
