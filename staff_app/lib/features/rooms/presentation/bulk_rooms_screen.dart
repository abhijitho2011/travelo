import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/networking/api_exception.dart';
import '../../../core/permissions/permission_gate.dart';
import '../../../core/permissions/permission_keys.dart';
import '../../../core/routing/routes.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/theme/app_spacing.dart';
import '../../../core/theme/app_typography.dart';
import '../../../core/widgets/primitives.dart';
import '../application/rooms_controllers.dart';
import '../data/room_models.dart';
import '../data/rooms_repository.dart';
import 'room_widgets.dart';

/// How many rooms one submission may create. The preview is the point of this
/// screen, and a list nobody can read is not a preview — a range this large is
/// almost always a typo in the "to" field.
const int kMaxBulkRooms = 200;

/// Create a floor's worth of rooms in one go.
///
/// The preview is not decoration: bulk creation is the one place in this app
/// where a slip makes dozens of records, so the form shows exactly what it is
/// about to send before it sends it, and reports exactly what came back.
class BulkRoomsScreen extends ConsumerStatefulWidget {
  const BulkRoomsScreen({super.key});

  @override
  ConsumerState<BulkRoomsScreen> createState() => _BulkRoomsScreenState();
}

class _BulkRoomsScreenState extends ConsumerState<BulkRoomsScreen> {
  final _prefix = TextEditingController();
  final _from = TextEditingController(text: '101');
  final _to = TextEditingController(text: '110');
  final _list = TextEditingController();
  final _floor = TextEditingController();

  BulkRoomMode _mode = BulkRoomMode.range;
  String? _roomTypeId;
  RoomStatus _status = RoomStatus.available;
  bool _pad = false;
  int _padWidth = 3;

  bool _busy = false;
  String? _submitError;
  BulkRoomResult? _result;

  @override
  void initState() {
    super.initState();
    for (final controller in [_prefix, _from, _to, _list]) {
      controller.addListener(_onPreviewInputChanged);
    }
  }

  @override
  void dispose() {
    for (final controller in [_prefix, _from, _to, _list, _floor]) {
      controller
        ..removeListener(_onPreviewInputChanged)
        ..dispose();
    }
    super.dispose();
  }

  /// The preview is derived from raw text, so it has to rebuild on every
  /// keystroke rather than only on submit.
  void _onPreviewInputChanged() => setState(() {});

  /// The request as currently described, or null when it is not yet a request.
  BulkRoomRequest? get _request {
    final typeId = _roomTypeId;
    if (typeId == null || typeId.isEmpty) return null;
    final floor = int.tryParse(_floor.text.trim());

    if (_mode == BulkRoomMode.list) {
      final numbers = BulkRoomRequest.parseNumbers(_list.text);
      if (numbers.isEmpty) return null;
      return BulkRoomRequest.list(
        roomTypeId: typeId,
        numbers: numbers,
        floor: floor,
        status: _status,
      );
    }

    final from = int.tryParse(_from.text.trim());
    final to = int.tryParse(_to.text.trim());
    if (from == null || to == null) return null;
    return BulkRoomRequest.range(
      roomTypeId: typeId,
      prefix: _prefix.text.trim().isEmpty ? null : _prefix.text.trim(),
      from: from,
      to: to,
      pad: _pad ? _padWidth : 0,
      floor: floor,
      status: _status,
    );
  }

  List<String> get _preview => _request?.preview ?? const <String>[];

  Future<void> _submit() async {
    setState(() {
      _submitError = null;
      _result = null;
    });

    final request = _request;
    if (_roomTypeId == null || _roomTypeId!.isEmpty) {
      setState(() => _submitError = 'Choose the type these rooms are sold as.');
      return;
    }
    if (request == null || _preview.isEmpty) {
      setState(
        () => _submitError = _mode == BulkRoomMode.range
            ? 'That range creates nothing. Check the first and last numbers.'
            : 'Type at least one room number.',
      );
      return;
    }
    if (_preview.length > kMaxBulkRooms) {
      setState(
        () => _submitError =
            'That is ${_preview.length} rooms in one go. Keep it to '
            '$kMaxBulkRooms at a time so you can check the list before you '
            'create it.',
      );
      return;
    }

    setState(() => _busy = true);
    try {
      final result = await ref.read(roomActionsProvider).createMany(request);
      if (!mounted) return;
      setState(() => _result = result);
    } on ApiException catch (e) {
      if (mounted) setState(() => _submitError = RoomErrors.friendly(e));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final types = ref.watch(roomTypeOptionsProvider);

    return PageBody(
      children: [
        Align(
          alignment: Alignment.centerLeft,
          child: TextButton.icon(
            onPressed: () => context.go(Routes.rooms),
            icon: const Icon(Icons.arrow_back, size: 16),
            label: const Text('Rooms'),
          ),
        ),
        const PageHeader(
          eyebrow: 'Rooms',
          title: 'Bulk add rooms',
          subtitle:
              'Create a run of rooms at once. Numbers that already exist are '
              'left exactly as they are.',
        ),
        gapSection,

        if (_result != null) ...[
          _BulkResultPanel(
            result: _result!,
            onAddMore: () => setState(() => _result = null),
          ),
          gapMd,
        ],

        SoftCard(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              const LabelXs('These rooms are'),
              const SizedBox(height: Sp.md),
              RoomTypeDropdown(
                types: types,
                value: _roomTypeId,
                onChanged: (id) => setState(() => _roomTypeId = id),
              ),
              gapMd,
              Row(
                children: [
                  Expanded(
                    child: TextFormField(
                      controller: _floor,
                      keyboardType: TextInputType.number,
                      inputFormatters: [FilteringTextInputFormatter.digitsOnly],
                      decoration: const InputDecoration(
                        labelText: 'Floor (optional)',
                        hintText: '3',
                      ),
                    ),
                  ),
                  const SizedBox(width: Sp.md),
                  Expanded(
                    child: DropdownButtonFormField<RoomStatus>(
                      initialValue: _status,
                      isExpanded: true,
                      decoration: const InputDecoration(
                        labelText: 'Starting status',
                      ),
                      items: [
                        for (final status in RoomStatus.values)
                          DropdownMenuItem(
                            value: status,
                            child: Text(status.label),
                          ),
                      ],
                      onChanged: (status) =>
                          setState(() => _status = status ?? _status),
                    ),
                  ),
                ],
              ),
            ],
          ),
        ),
        gapMd,

        SoftCard(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              const LabelXs('Numbering'),
              const SizedBox(height: Sp.md),
              Align(
                alignment: Alignment.centerLeft,
                child: Segmented<BulkRoomMode>(
                  options: BulkRoomMode.values,
                  labelOf: (mode) => mode.label,
                  value: _mode,
                  onChanged: (mode) => setState(() => _mode = mode),
                ),
              ),
              gapMd,
              if (_mode == BulkRoomMode.range)
                ..._rangeFields()
              else
                _listField(),
            ],
          ),
        ),
        gapMd,

        _PreviewPanel(numbers: _preview, limit: kMaxBulkRooms),

        if (_submitError != null) ...[
          gapMd,
          FormErrorNote(message: _submitError!),
        ],

        gapSection,
        PermissionGate(
          permission: P.roomCreate,
          fallback: const PermissionNote(
            text:
                'Your role cannot create rooms. Ask a General Manager or '
                'Assistant General Manager.',
          ),
          child: FilledButton(
            onPressed: _busy ? null : _submit,
            child: _busy
                ? const SizedBox(
                    width: 18,
                    height: 18,
                    child: CircularProgressIndicator(strokeWidth: 2),
                  )
                : Text(
                    _preview.isEmpty
                        ? 'Create rooms'
                        : 'Create ${_preview.length} '
                              '${_preview.length == 1 ? 'room' : 'rooms'}',
                  ),
          ),
        ),
      ],
    );
  }

  List<Widget> _rangeFields() => [
    Row(
      children: [
        Expanded(
          flex: 2,
          child: TextFormField(
            controller: _prefix,
            textCapitalization: TextCapitalization.characters,
            decoration: const InputDecoration(
              labelText: 'Prefix',
              hintText: 'A-',
            ),
          ),
        ),
        const SizedBox(width: Sp.md),
        Expanded(
          child: TextFormField(
            controller: _from,
            keyboardType: TextInputType.number,
            inputFormatters: [FilteringTextInputFormatter.digitsOnly],
            decoration: const InputDecoration(labelText: 'From'),
          ),
        ),
        const SizedBox(width: Sp.md),
        Expanded(
          child: TextFormField(
            controller: _to,
            keyboardType: TextInputType.number,
            inputFormatters: [FilteringTextInputFormatter.digitsOnly],
            decoration: const InputDecoration(labelText: 'To'),
          ),
        ),
      ],
    ),
    SwitchListTile.adaptive(
      contentPadding: EdgeInsets.zero,
      value: _pad,
      onChanged: (value) => setState(() => _pad = value),
      title: const Text('Pad with leading zeros'),
      subtitle: const Text('So 7 becomes 007 and sorts with the rest.'),
    ),
    if (_pad)
      Align(
        alignment: Alignment.centerLeft,
        child: Segmented<int>(
          options: const [2, 3, 4],
          labelOf: (width) => '$width digits',
          value: _padWidth,
          onChanged: (width) => setState(() => _padWidth = width),
        ),
      ),
  ];

  Widget _listField() => Column(
    crossAxisAlignment: CrossAxisAlignment.stretch,
    children: [
      TextFormField(
        controller: _list,
        minLines: 3,
        maxLines: 6,
        textCapitalization: TextCapitalization.characters,
        decoration: const InputDecoration(
          labelText: 'Room numbers',
          hintText: '301, 302, 305, 310',
          alignLabelWithHint: true,
        ),
      ),
      const SizedBox(height: Sp.sm),
      const FieldNote(
        text:
            'Separate them with commas, spaces or new lines. Repeats are '
            'dropped.',
      ),
    ],
  );
}

/// What is about to be created, spelled out.
class _PreviewPanel extends StatelessWidget {
  const _PreviewPanel({required this.numbers, required this.limit});

  final List<String> numbers;
  final int limit;

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    final tooMany = numbers.length > limit;
    final shown = numbers.take(48).toList(growable: false);
    final hidden = numbers.length - shown.length;

    return Panel(
      title: 'Preview',
      description: numbers.isEmpty
          ? 'Nothing yet'
          : '${numbers.length} ${numbers.length == 1 ? 'room' : 'rooms'}: '
                '${numbers.first} to ${numbers.last}',
      child: numbers.isEmpty
          ? Text(
              'Fill in the numbering above and the exact list of rooms appears '
              'here before anything is created.',
              style: AppTypography.body(size: 12.5, color: c.mutedForeground),
            )
          : Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                if (tooMany) ...[
                  FieldNote(
                    text:
                        'That is more than $limit rooms. Narrow the range '
                        'before creating.',
                    icon: Icons.warning_amber_outlined,
                  ),
                  const SizedBox(height: Sp.md),
                ],
                Wrap(
                  spacing: 6,
                  runSpacing: 6,
                  children: [
                    for (final number in shown)
                      FeatureChip(icon: Icons.tag, label: number),
                    if (hidden > 0)
                      Text(
                        '+$hidden more',
                        style: AppTypography.body(
                          size: 11.5,
                          color: c.mutedForeground,
                        ),
                      ),
                  ],
                ),
              ],
            ),
    );
  }
}

/// What actually happened. Naming the skipped numbers is the whole point: "8 of
/// 10 created" on its own sends somebody hunting through the board.
class _BulkResultPanel extends StatelessWidget {
  const _BulkResultPanel({required this.result, required this.onAddMore});

  final BulkRoomResult result;
  final VoidCallback onAddMore;

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    final tone = result.created == 0 ? c.warning : c.healthy;

    return Panel(
      title: result.created == 0
          ? 'Nothing was created'
          : '${result.created} '
                '${result.created == 1 ? 'room' : 'rooms'} created',
      description: 'Asked for ${result.requested}',
      actions: [
        TextButton(onPressed: onAddMore, child: const Text('Add more')),
      ],
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Icon(
                result.created == 0
                    ? Icons.error_outline
                    : Icons.check_circle_outline,
                size: 18,
                color: tone,
              ),
              const SizedBox(width: Sp.sm),
              Expanded(
                child: Text(
                  result.hasSkipped
                      ? '${_join(result.skipped)} already existed and '
                            '${result.skipped.length == 1 ? 'was' : 'were'} '
                            'skipped. Nothing about '
                            '${result.skipped.length == 1 ? 'it' : 'them'} was '
                            'changed.'
                      : 'Every room you asked for was created.',
                  style: AppTypography.body(size: 13, color: c.foreground),
                ),
              ),
            ],
          ),
          if (result.propertyRoomCount != null) ...[
            const SizedBox(height: Sp.sm),
            Text(
              'This property now has ${result.propertyRoomCount} rooms.',
              style: AppTypography.body(size: 12, color: c.mutedForeground),
            ),
          ],
        ],
      ),
    );
  }

  /// "302, 305 and 310" — an Oxford-free list a person can read aloud.
  static String _join(List<String> values) {
    if (values.length == 1) return values.single;
    return '${values.take(values.length - 1).join(', ')} and ${values.last}';
  }
}
