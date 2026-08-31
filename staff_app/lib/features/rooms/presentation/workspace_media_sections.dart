import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:image_picker/image_picker.dart';

import '../../../core/networking/api_exception.dart';
import '../../../core/permissions/permission_gate.dart';
import '../../../core/permissions/permission_keys.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/theme/app_spacing.dart';
import '../../../core/theme/app_typography.dart';
import '../../../core/widgets/primitives.dart';
import '../../../core/widgets/states.dart';
import '../application/units_controllers.dart';
import '../data/unit_models.dart';
import 'room_widgets.dart';

/// **Photos** (§10).
///
/// The first image a type gets becomes its primary automatically — the server
/// does that, and the thumbnail on the Units list reads from it. Reordering is
/// explicit (move earlier / later) rather than a drag: the gallery is a wrap of
/// small tiles inside a scrolling form, where a drag would fight the scroll.
class RoomTypePhotosSection extends ConsumerStatefulWidget {
  const RoomTypePhotosSection({super.key, required this.roomTypeId});

  /// Null while the room type is unsaved — there is nowhere to put an upload
  /// yet, so the section says so instead of buffering files it might lose.
  final String? roomTypeId;

  @override
  ConsumerState<RoomTypePhotosSection> createState() =>
      _RoomTypePhotosSectionState();
}

class _RoomTypePhotosSectionState extends ConsumerState<RoomTypePhotosSection> {
  bool _busy = false;
  PhotoCategory _category = PhotoCategory.room;

  Future<void> _pick() async {
    final id = widget.roomTypeId;
    if (id == null || _busy) return;
    final messenger = ScaffoldMessenger.of(context);

    final List<XFile> picked;
    try {
      picked = await ImagePicker().pickMultiImage();
    } catch (e) {
      messenger.showSnackBar(SnackBar(content: Text('Could not open photos: $e')));
      return;
    }
    if (picked.isEmpty || !mounted) return;

    setState(() => _busy = true);
    var uploaded = 0;
    try {
      for (final file in picked) {
        final bytes = await file.readAsBytes();
        await ref.read(unitsActionsProvider).uploadPhoto(
          id,
          bytes: bytes,
          filename: file.name,
          category: _category,
        );
        uploaded += 1;
      }
      messenger.showSnackBar(
        SnackBar(
          content: Text('$uploaded ${uploaded == 1 ? 'photo' : 'photos'} added'),
        ),
      );
    } on ApiException catch (e) {
      // Partial success is real: some may have landed before the failure, so
      // the message says how far it got rather than implying none did.
      messenger.showSnackBar(
        SnackBar(
          content: Text(
            uploaded == 0
                ? _friendly(e)
                : '$uploaded uploaded, then: ${_friendly(e)}',
          ),
        ),
      );
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  static String _friendly(ApiException e) => switch (e.code) {
    'UNSUPPORTED_MEDIA_TYPE' => 'That file is not a JPEG, PNG or WebP image.',
    'FILE_TOO_LARGE' => 'That image is too large — 5 MB is the limit.',
    'PHOTO_LIMIT_REACHED' => 'This room type already has the maximum 20 photos.',
    _ => e.message,
  };

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    final id = widget.roomTypeId;

    return SoftCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Text('Photos', style: AppTypography.display(size: 15, color: c.foreground)),
          const SizedBox(height: 2),
          Text(
            'The first photo becomes the primary image used across Tavelo.',
            style: AppTypography.body(size: 11.5, color: c.mutedForeground),
          ),
          const SizedBox(height: Sp.lg),
          if (id == null)
            _saveFirst(c)
          else ...[
            _uploadArea(c),
            const SizedBox(height: Sp.lg),
            _gallery(id),
          ],
        ],
      ),
    );
  }

  Widget _saveFirst(AppColors c) => Container(
    padding: const EdgeInsets.all(Sp.lg),
    decoration: BoxDecoration(
      color: c.muted,
      borderRadius: R.rMd,
      border: Border.all(color: c.border),
    ),
    child: Row(
      children: [
        Icon(Icons.image_outlined, size: 18, color: c.mutedForeground),
        const SizedBox(width: Sp.md),
        Expanded(
          child: Text(
            'Save the room type first — photos are stored against a saved type.',
            style: AppTypography.body(size: 12.5, color: c.mutedForeground),
          ),
        ),
      ],
    ),
  );

  Widget _uploadArea(AppColors c) => Column(
    crossAxisAlignment: CrossAxisAlignment.stretch,
    children: [
      Align(
        alignment: Alignment.centerLeft,
        child: Wrap(
          spacing: Sp.sm,
          crossAxisAlignment: WrapCrossAlignment.center,
          children: [
            Text('Upload as', style: AppTypography.labelXs(c.mutedForeground)),
            for (final category in PhotoCategory.values)
              ChoiceChip(
                label: Text(category.label),
                selected: _category == category,
                onSelected: (_) => setState(() => _category = category),
              ),
          ],
        ),
      ),
      const SizedBox(height: Sp.md),
      PermissionGate(
        permission: P.roomTypeUpdate,
        child: InkWell(
          onTap: _busy ? null : _pick,
          borderRadius: R.rMd,
          child: Container(
            height: 132,
            decoration: BoxDecoration(
              color: c.surface,
              borderRadius: R.rMd,
              border: Border.all(color: c.border),
            ),
            child: Center(
              child: _busy
                  ? const CircularProgressIndicator(strokeWidth: 2)
                  : Column(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        Icon(
                          Icons.add_photo_alternate_outlined,
                          size: 28,
                          color: c.mutedForeground,
                        ),
                        const SizedBox(height: Sp.sm),
                        Text(
                          'Browse files',
                          style: AppTypography.body(
                            size: 13,
                            weight: FontWeight.w600,
                            color: c.primary,
                          ),
                        ),
                        Text(
                          'JPEG, PNG or WebP · up to 5 MB each · select several',
                          style: AppTypography.body(
                            size: 11,
                            color: c.mutedForeground,
                          ),
                        ),
                      ],
                    ),
            ),
          ),
        ),
      ),
    ],
  );

  Widget _gallery(String id) {
    final photos = ref.watch(roomTypePhotosProvider(id));
    return photos.when(
      loading: () => const Padding(
        padding: EdgeInsets.all(Sp.lg),
        child: Center(child: CircularProgressIndicator(strokeWidth: 2)),
      ),
      error: (e, _) => ErrorState(
        error: e,
        onRetry: () => ref.invalidate(roomTypePhotosProvider(id)),
      ),
      data: (list) {
        if (list.isEmpty) {
          final c = context.colors;
          return Text(
            'No photos yet. The list shows a placeholder until one is added.',
            style: AppTypography.body(size: 12.5, color: c.mutedForeground),
          );
        }
        return Wrap(
          spacing: Sp.sm,
          runSpacing: Sp.sm,
          children: [
            for (var i = 0; i < list.length; i++)
              _PhotoTile(
                roomTypeId: id,
                photo: list[i],
                canMoveEarlier: i > 0,
                canMoveLater: i < list.length - 1,
                order: list.map((p) => p.id).toList(),
                index: i,
              ),
          ],
        );
      },
    );
  }
}

class _PhotoTile extends ConsumerWidget {
  const _PhotoTile({
    required this.roomTypeId,
    required this.photo,
    required this.canMoveEarlier,
    required this.canMoveLater,
    required this.order,
    required this.index,
  });

  final String roomTypeId;
  final RoomTypePhoto photo;
  final bool canMoveEarlier;
  final bool canMoveLater;
  final List<String> order;
  final int index;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final c = context.colors;
    return SizedBox(
      width: 132,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Stack(
            children: [
              ClipRRect(
                borderRadius: R.rMd,
                child: Image.network(
                  photo.url,
                  width: 132,
                  height: 96,
                  fit: BoxFit.cover,
                  errorBuilder: (_, _, _) => Container(
                    width: 132,
                    height: 96,
                    color: c.muted,
                    child: Icon(
                      Icons.broken_image_outlined,
                      color: c.mutedForeground,
                    ),
                  ),
                ),
              ),
              if (photo.isPrimary)
                Positioned(
                  left: 6,
                  top: 6,
                  child: Container(
                    padding: const EdgeInsets.symmetric(
                      horizontal: 7,
                      vertical: 2,
                    ),
                    decoration: BoxDecoration(
                      color: c.primary,
                      borderRadius: R.rPill,
                    ),
                    child: Text(
                      'PRIMARY',
                      style: AppTypography.body(
                        size: 9,
                        weight: FontWeight.w700,
                        color: c.primaryForeground,
                      ),
                    ),
                  ),
                ),
              Positioned(
                right: 0,
                top: 0,
                child: PopupMenuButton<String>(
                  tooltip: 'Photo actions',
                  icon: const Icon(Icons.more_vert, size: 17, color: Colors.white),
                  onSelected: (a) => _run(context, ref, a),
                  itemBuilder: (_) => [
                    const PopupMenuItem(value: 'preview', child: Text('Preview')),
                    if (!photo.isPrimary)
                      const PopupMenuItem(
                        value: 'primary',
                        child: Text('Set as primary'),
                      ),
                    if (canMoveEarlier)
                      const PopupMenuItem(
                        value: 'earlier',
                        child: Text('Move earlier'),
                      ),
                    if (canMoveLater)
                      const PopupMenuItem(
                        value: 'later',
                        child: Text('Move later'),
                      ),
                    const PopupMenuItem(value: 'delete', child: Text('Delete')),
                  ],
                ),
              ),
            ],
          ),
          const SizedBox(height: 3),
          Text(
            photo.category.label,
            style: AppTypography.body(size: 10.5, color: c.mutedForeground),
          ),
        ],
      ),
    );
  }

  Future<void> _run(BuildContext context, WidgetRef ref, String action) async {
    final messenger = ScaffoldMessenger.of(context);
    final actions = ref.read(unitsActionsProvider);
    try {
      switch (action) {
        case 'preview':
          await showDialog<void>(
            context: context,
            builder: (dialogContext) => Dialog(
              child: InteractiveViewer(
                child: Image.network(photo.url, fit: BoxFit.contain),
              ),
            ),
          );
        case 'primary':
          await actions.setPrimaryPhoto(roomTypeId, photo.id);
          messenger.showSnackBar(
            const SnackBar(content: Text('Primary photo updated')),
          );
        case 'earlier':
        case 'later':
          final next = [...order];
          final to = action == 'earlier' ? index - 1 : index + 1;
          final moved = next.removeAt(index);
          next.insert(to, moved);
          await actions.reorderPhotos(roomTypeId, next);
        case 'delete':
          final ok = await showDialog<bool>(
            context: context,
            builder: (dialogContext) => AlertDialog(
              title: const Text('Delete photo?'),
              content: const Text('This cannot be undone.'),
              actions: [
                TextButton(
                  onPressed: () => Navigator.pop(dialogContext, false),
                  child: const Text('Cancel'),
                ),
                FilledButton(
                  onPressed: () => Navigator.pop(dialogContext, true),
                  child: const Text('Delete'),
                ),
              ],
            ),
          );
          if (ok != true) return;
          await actions.deletePhoto(roomTypeId, photo.id);
          messenger.showSnackBar(const SnackBar(content: Text('Photo deleted')));
      }
    } on ApiException catch (e) {
      messenger.showSnackBar(SnackBar(content: Text(e.message)));
    }
  }
}

/// **Amenities & facilities** (§11).
///
/// Backed by the property's own amenity catalogue rather than a hardcoded list,
/// so a hotel that has defined "Butler service" can attach it here. The picker
/// itself already groups and searches — this section is the card around it.
class AmenitiesSection extends StatelessWidget {
  const AmenitiesSection({
    super.key,
    required this.selected,
    required this.onChanged,
  });

  final Set<String> selected;
  final ValueChanged<Set<String>> onChanged;

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    return SoftCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(
            children: [
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      'Amenities & facilities',
                      style: AppTypography.display(size: 15, color: c.foreground),
                    ),
                    const SizedBox(height: 2),
                    Text(
                      'What every unit of this type comes with.',
                      style: AppTypography.body(
                        size: 11.5,
                        color: c.mutedForeground,
                      ),
                    ),
                  ],
                ),
              ),
              if (selected.isNotEmpty)
                Text(
                  '${selected.length} selected',
                  style: AppTypography.labelXs(c.mutedForeground),
                ),
            ],
          ),
          const SizedBox(height: Sp.lg),
          AmenityPicker(selected: selected, onChanged: onChanged),
        ],
      ),
    );
  }
}
