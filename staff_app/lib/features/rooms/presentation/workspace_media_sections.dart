import 'dart:typed_data';
import 'package:desktop_drop/desktop_drop.dart';
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

/// A photo waiting to be uploaded, held in memory while a NEW room is being
/// filled in. There is no record to attach it to yet, so the bytes are kept
/// here and sent the moment the room (or its shared type) is saved.
class PendingPhoto {
  PendingPhoto({
    required this.bytes,
    required this.name,
    this.category = PhotoCategory.room,
  });

  final Uint8List bytes;
  final String name;
  final PhotoCategory category;
}

/// **Photos** — a swipable showcase, the way a listing shows its rooms.
///
/// One widget serves both a saved record and a new one:
///  * [owner] set — the gallery is live: each add uploads immediately, each
///    delete removes, and the first photo is the primary the whole app reads.
///  * [owner] null — the record does not exist yet, so photos go into [pending]
///    and are uploaded on save. The parent owns that buffer and reads it back.
class PhotosSection extends ConsumerStatefulWidget {
  const PhotosSection({
    super.key,
    required this.owner,
    this.pending,
    this.onPendingChanged,
  });

  /// The saved room or room type these photos belong to. Null before the
  /// record exists, which switches the section into buffering mode.
  final PhotoOwner? owner;

  /// The pre-save buffer, owned by the parent so it survives a rebuild and can
  /// be uploaded once the record is created. Required in buffering mode.
  final List<PendingPhoto>? pending;

  /// Fired after the buffer changes, so the parent can mark the form dirty.
  final VoidCallback? onPendingChanged;

  @override
  ConsumerState<PhotosSection> createState() => _PhotosSectionState();
}

class _PhotosSectionState extends ConsumerState<PhotosSection> {
  bool _busy = false;
  bool _dragging = false;
  PhotoCategory _category = PhotoCategory.room;
  final _page = PageController();
  int _current = 0;

  List<PendingPhoto> get _pending => widget.pending ?? const [];
  bool get _buffering => widget.owner == null;

  @override
  void dispose() {
    _page.dispose();
    super.dispose();
  }

  Future<void> _pick() async {
    if (_busy) return;
    final messenger = ScaffoldMessenger.of(context);
    final List<XFile> picked;
    try {
      picked = await ImagePicker().pickMultiImage();
    } catch (e) {
      messenger.showSnackBar(
        SnackBar(content: Text('Could not open photos: $e')),
      );
      return;
    }
    await _upload(picked);
  }

  /// Files dropped onto the area. Filtered to images here rather than sent and
  /// refused: dropping a folder of mixed files is normal, and a rejection per
  /// stray file would bury the ones that did upload.
  Future<void> _onDrop(DropDoneDetails details) async {
    if (_busy) return;
    const extensions = {'.jpg', '.jpeg', '.png', '.webp'};
    final images = details.files.where((f) {
      final name = f.name.toLowerCase();
      return extensions.any(name.endsWith);
    }).toList();

    if (images.isEmpty) {
      if (details.files.isNotEmpty && mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text(
              'Drop JPEG, PNG or WebP images — nothing else uploads.',
            ),
          ),
        );
      }
      return;
    }
    final skipped = details.files.length - images.length;
    await _upload(images, skipped: skipped);
  }

  /// The one path both the picker and the drop target run through, so a dropped
  /// file and a browsed file are treated identically. In buffering mode the
  /// bytes are held; otherwise they are uploaded straight away.
  Future<void> _upload(List<XFile> files, {int skipped = 0}) async {
    if (files.isEmpty || !mounted) return;
    final messenger = ScaffoldMessenger.of(context);

    if (_buffering) {
      final buffer = widget.pending;
      if (buffer == null) return;
      setState(() => _busy = true);
      try {
        for (final file in files) {
          buffer.add(
            PendingPhoto(
              bytes: await file.readAsBytes(),
              name: file.name,
              category: _category,
            ),
          );
        }
      } finally {
        if (mounted) setState(() => _busy = false);
      }
      widget.onPendingChanged?.call();
      if (skipped > 0) {
        messenger.showSnackBar(
          SnackBar(
            content: Text(
              '$skipped non-image ${skipped == 1 ? 'file' : 'files'} skipped',
            ),
          ),
        );
      }
      _goToLast();
      return;
    }

    final owner = widget.owner!;
    setState(() => _busy = true);
    var uploaded = 0;
    try {
      for (final file in files) {
        final bytes = await file.readAsBytes();
        await ref
            .read(unitsActionsProvider)
            .uploadPhoto(
              owner,
              bytes: bytes,
              filename: file.name,
              category: _category,
            );
        uploaded += 1;
      }
      messenger.showSnackBar(
        SnackBar(
          content: Text(
            '$uploaded ${uploaded == 1 ? 'photo' : 'photos'} added'
            '${skipped > 0 ? ' · $skipped non-image ${skipped == 1 ? 'file' : 'files'} skipped' : ''}',
          ),
        ),
      );
    } on ApiException catch (e) {
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

  void _removePending(int index) {
    final buffer = widget.pending;
    if (buffer == null || index < 0 || index >= buffer.length) return;
    setState(() => buffer.removeAt(index));
    widget.onPendingChanged?.call();
  }

  void _goToLast() {
    // After a jump the page count has changed; hop to the newest image so the
    // person sees what they just added, the way a gallery lands on the last shot.
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!_page.hasClients) return;
      _page.jumpToPage(0x7fffffff);
    });
  }

  static String _friendly(ApiException e) => switch (e.code) {
    'UNSUPPORTED_MEDIA_TYPE' => 'That file is not a JPEG, PNG or WebP image.',
    'FILE_TOO_LARGE' => 'That image is too large — 5 MB is the limit.',
    'PHOTO_LIMIT_REACHED' => 'This already has the maximum 20 photos.',
    _ => e.message,
  };

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    final owner = widget.owner;

    return SoftCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Text(
            'Photos',
            style: AppTypography.display(size: 15, color: c.foreground),
          ),
          const SizedBox(height: 2),
          Text(
            'The first photo is the cover shown across Tavelo. Swipe to review.',
            style: AppTypography.body(size: 11.5, color: c.mutedForeground),
          ),
          const SizedBox(height: Sp.lg),
          if (_buffering) _showcasePending(c) else _showcaseLive(c, owner!),
          const SizedBox(height: Sp.lg),
          _uploadControls(c),
        ],
      ),
    );
  }

  // ---- the swipable showcase --------------------------------------------

  Widget _carousel(int count, Widget Function(int) itemAt) {
    final c = context.colors;
    return Column(
      children: [
        ClipRRect(
          borderRadius: R.rMd,
          child: AspectRatio(
            aspectRatio: 16 / 10,
            child: Stack(
              fit: StackFit.expand,
              children: [
                ColoredBox(color: c.muted),
                PageView.builder(
                  controller: _page,
                  onPageChanged: (i) => setState(() => _current = i),
                  itemCount: count,
                  itemBuilder: (_, i) => itemAt(i),
                ),
                if (count > 1)
                  Positioned(
                    top: 8,
                    right: 8,
                    child: Container(
                      padding: const EdgeInsets.symmetric(
                        horizontal: 8,
                        vertical: 3,
                      ),
                      decoration: BoxDecoration(
                        color: Colors.black.withValues(alpha: 0.55),
                        borderRadius: R.rPill,
                      ),
                      child: Text(
                        '${_current.clamp(0, count - 1) + 1}/$count',
                        style: AppTypography.body(
                          size: 11,
                          weight: FontWeight.w600,
                          color: Colors.white,
                        ),
                      ),
                    ),
                  ),
              ],
            ),
          ),
        ),
        if (count > 1) ...[
          const SizedBox(height: Sp.sm),
          Row(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              for (var i = 0; i < count; i++)
                AnimatedContainer(
                  duration: const Duration(milliseconds: 150),
                  margin: const EdgeInsets.symmetric(horizontal: 3),
                  width: i == _current.clamp(0, count - 1) ? 18 : 6,
                  height: 6,
                  decoration: BoxDecoration(
                    color: i == _current.clamp(0, count - 1)
                        ? c.primary
                        : c.border,
                    borderRadius: R.rPill,
                  ),
                ),
            ],
          ),
        ],
      ],
    );
  }

  Widget _showcasePending(AppColors c) {
    if (_pending.isEmpty) {
      return _emptyShowcase(c, 'Add photos of this room below.');
    }
    return _carousel(_pending.length, (i) {
      final p = _pending[i];
      return Stack(
        fit: StackFit.expand,
        children: [
          Image.memory(p.bytes, fit: BoxFit.cover),
          if (i == 0) _coverBadge(c),
          _deleteButton(() => _removePending(i)),
        ],
      );
    });
  }

  Widget _showcaseLive(AppColors c, PhotoOwner owner) {
    final photos = ref.watch(photosProvider(owner));
    return photos.when(
      loading: () => AspectRatio(
        aspectRatio: 16 / 10,
        child: DecoratedBox(
          decoration: BoxDecoration(color: c.muted, borderRadius: R.rMd),
          child: const Center(child: CircularProgressIndicator(strokeWidth: 2)),
        ),
      ),
      error: (e, _) => ErrorState(
        error: e,
        onRetry: () => ref.invalidate(photosProvider(owner)),
      ),
      data: (list) {
        if (list.isEmpty) {
          return _emptyShowcase(c, 'No photos yet. Add the first below.');
        }
        return _carousel(list.length, (i) {
          final photo = list[i];
          return Stack(
            fit: StackFit.expand,
            children: [
              GestureDetector(
                onTap: () => _preview(photo.url),
                child: Image.network(
                  photo.url,
                  fit: BoxFit.cover,
                  errorBuilder: (_, _, _) => Center(
                    child: Icon(
                      Icons.broken_image_outlined,
                      color: c.mutedForeground,
                    ),
                  ),
                ),
              ),
              if (photo.isPrimary) _coverBadge(c),
              _deleteButton(() => _run(context, ref, 'delete', owner, photo)),
              if (!photo.isPrimary)
                Positioned(
                  left: 8,
                  bottom: 8,
                  child: FilledButton.tonalIcon(
                    style: FilledButton.styleFrom(
                      visualDensity: VisualDensity.compact,
                      padding: const EdgeInsets.symmetric(
                        horizontal: 10,
                        vertical: 4,
                      ),
                    ),
                    onPressed: () =>
                        _run(context, ref, 'primary', owner, photo),
                    icon: const Icon(Icons.star_outline, size: 15),
                    label: const Text('Set as cover'),
                  ),
                ),
            ],
          );
        });
      },
    );
  }

  Widget _emptyShowcase(AppColors c, String message) => AspectRatio(
    aspectRatio: 16 / 10,
    child: DecoratedBox(
      decoration: BoxDecoration(
        color: c.muted,
        borderRadius: R.rMd,
        border: Border.all(color: c.border),
      ),
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Icon(
            Icons.photo_library_outlined,
            size: 30,
            color: c.mutedForeground,
          ),
          const SizedBox(height: Sp.sm),
          Text(
            message,
            style: AppTypography.body(size: 12.5, color: c.mutedForeground),
          ),
        ],
      ),
    ),
  );

  Widget _coverBadge(AppColors c) => Positioned(
    left: 8,
    top: 8,
    child: Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
      decoration: BoxDecoration(color: c.primary, borderRadius: R.rPill),
      child: Text(
        'COVER',
        style: AppTypography.body(
          size: 9,
          weight: FontWeight.w700,
          color: c.primaryForeground,
        ),
      ),
    ),
  );

  Widget _deleteButton(VoidCallback onTap) => Positioned(
    right: 8,
    bottom: 8,
    child: Material(
      color: Colors.black.withValues(alpha: 0.55),
      shape: const CircleBorder(),
      child: InkWell(
        customBorder: const CircleBorder(),
        onTap: onTap,
        child: const Padding(
          padding: EdgeInsets.all(7),
          child: Icon(Icons.delete_outline, size: 18, color: Colors.white),
        ),
      ),
    ),
  );

  Future<void> _preview(String url) => showDialog<void>(
    context: context,
    builder: (_) => Dialog(
      child: InteractiveViewer(child: Image.network(url, fit: BoxFit.contain)),
    ),
  );

  // ---- add controls ------------------------------------------------------

  Widget _uploadControls(AppColors c) => Column(
    crossAxisAlignment: CrossAxisAlignment.stretch,
    children: [
      Align(
        alignment: Alignment.centerLeft,
        child: Wrap(
          spacing: Sp.sm,
          crossAxisAlignment: WrapCrossAlignment.center,
          children: [
            Text('Add as', style: AppTypography.labelXs(c.mutedForeground)),
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
        permission: _buffering ? P.roomCreate : P.roomTypeUpdate,
        child: DropTarget(
          onDragEntered: (_) => setState(() => _dragging = true),
          onDragExited: (_) => setState(() => _dragging = false),
          onDragDone: (details) async {
            setState(() => _dragging = false);
            await _onDrop(details);
          },
          child: InkWell(
            onTap: _busy ? null : _pick,
            borderRadius: R.rMd,
            child: AnimatedContainer(
              duration: const Duration(milliseconds: 120),
              height: 108,
              decoration: BoxDecoration(
                color: _dragging ? c.accent : c.surface,
                borderRadius: R.rMd,
                border: Border.all(
                  color: _dragging ? c.primary : c.border,
                  width: _dragging ? 1.5 : 1,
                ),
              ),
              child: Center(
                child: _busy
                    ? const CircularProgressIndicator(strokeWidth: 2)
                    : Column(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          Icon(
                            _dragging
                                ? Icons.file_download_outlined
                                : Icons.add_photo_alternate_outlined,
                            size: 26,
                            color: _dragging ? c.primary : c.mutedForeground,
                          ),
                          const SizedBox(height: Sp.xs),
                          Text(
                            _dragging
                                ? 'Drop to add'
                                : 'Drag & drop photos here',
                            style: AppTypography.body(
                              size: 13,
                              weight: FontWeight.w600,
                              color: _dragging ? c.primary : c.foreground,
                            ),
                          ),
                          if (!_dragging)
                            Text(
                              'or browse files · JPEG, PNG, WebP · 5 MB each',
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
      ),
    ],
  );

  Future<void> _run(
    BuildContext context,
    WidgetRef ref,
    String action,
    PhotoOwner owner,
    RoomTypePhoto photo,
  ) async {
    final messenger = ScaffoldMessenger.of(context);
    final actions = ref.read(unitsActionsProvider);
    try {
      switch (action) {
        case 'primary':
          await actions.setPrimaryPhoto(owner, photo.id);
          messenger.showSnackBar(
            const SnackBar(content: Text('Cover photo updated')),
          );
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
          await actions.deletePhoto(owner, photo.id);
          messenger.showSnackBar(
            const SnackBar(content: Text('Photo deleted')),
          );
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
                      style: AppTypography.display(
                        size: 15,
                        color: c.foreground,
                      ),
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
