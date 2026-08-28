import 'dart:io' show File;

import 'package:flutter/foundation.dart' show kIsWeb;
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:image_picker/image_picker.dart';

import '../../core/api/api_exception.dart';
import '../../core/data/location_repository.dart';
import '../../core/data/owner_repository.dart';
import '../../theme/app_theme.dart';
import '../../widgets/ui.dart';

class AddPropertyScreen extends ConsumerStatefulWidget {
  const AddPropertyScreen({super.key});
  @override
  ConsumerState<AddPropertyScreen> createState() => _AddPropertyScreenState();
}

class _AddPropertyScreenState extends ConsumerState<AddPropertyScreen> {
  final _form = GlobalKey<FormState>();
  final _name = TextEditingController();
  final _line1 = TextEditingController();
  final _city = TextEditingController();
  final _pin = TextEditingController();
  final _phone = TextEditingController();
  final _email = TextEditingController();
  String? _state;
  String? _district;
  final List<XFile> _photos = [];
  bool _busy = false;
  String? _error;

  @override
  void dispose() {
    _name.dispose();
    _line1.dispose();
    _city.dispose();
    _pin.dispose();
    _phone.dispose();
    _email.dispose();
    super.dispose();
  }

  /// Same normalisation the API applies (strips +91, spaces and trunk zeros).
  static String _digits(String raw) {
    var d = raw.replaceAll(RegExp(r'\D+'), '');
    if (d.length > 10 && d.startsWith('91')) d = d.substring(2);
    return d.replaceFirst(RegExp(r'^0+'), '');
  }

  Future<void> _pickPhotos() async {
    final picker = ImagePicker();
    final imgs = await picker.pickMultiImage(imageQuality: 80);
    if (imgs.isNotEmpty) setState(() => _photos.addAll(imgs));
  }

  Future<void> _submit() async {
    setState(() => _error = null);
    if (!_form.currentState!.validate()) return;
    if (_state == null || _district == null) {
      setState(() => _error = 'Select a state and district.');
      return;
    }
    setState(() => _busy = true);
    try {
      final repo = ref.read(ownerRepositoryProvider);
      final email = _email.text.trim();
      final propertyId = await repo.createProperty({
        'name': _name.text.trim(),
        'address': {
          'line1': _line1.text.trim(),
          'city': _city.text.trim(),
          'district': _district,
          'state': _state,
          'pinCode': _pin.text.trim(),
          'country': 'India',
        },
        'city': _city.text.trim(),
        'state': _state,
        'phone': _digits(_phone.text),
        if (email.isNotEmpty) 'email': email,
      });

      // The property is already saved at this point, so a failed photo must
      // not fail the whole save — report the count instead.
      var failures = 0;
      for (final photo in _photos) {
        try {
          await repo.uploadPropertyPhoto(propertyId, photo);
        } catch (_) {
          failures++;
        }
      }

      ref.invalidate(propertiesProvider);
      ref.invalidate(portfolioProvider);
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(
            failures == 0
                ? 'Property added.'
                : 'Property added, but $failures photo(s) could not be uploaded.',
          ),
        ),
      );
      context.pop();
    } on ApiException catch (e) {
      setState(() => _error = e.code == 'PROPERTY_LIMIT_REACHED'
          ? 'You have reached the number of properties included in your plan. Contact Tavelo to increase your limit.'
          : e.message);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final locations = ref.watch(locationsProvider);
    return Scaffold(
      appBar: AppBar(title: const Text('Add property')),
      body: Form(
        key: _form,
        child: ListView(
          padding: const EdgeInsets.all(20),
          children: [
            if (_error != null) ...[
              Banner2(text: _error!, tone: BannerTone.danger, icon: Icons.error_outline),
              const SizedBox(height: 16),
            ],
            const SectionTitle('Property details'),
            const SizedBox(height: 12),
            TextFormField(
              controller: _name,
              decoration: const InputDecoration(labelText: 'Property name'),
              validator: (v) => (v == null || v.trim().isEmpty) ? 'Enter a property name' : null,
            ),
            const SizedBox(height: 24),
            const SectionTitle('Photos'),
            const SizedBox(height: 12),
            _PhotoStrip(
              photos: _photos,
              onAdd: _pickPhotos,
              onRemove: (i) => setState(() => _photos.removeAt(i)),
            ),
            const SizedBox(height: 24),
            const SectionTitle('Address'),
            const SizedBox(height: 12),
            TextFormField(
              controller: _line1,
              decoration: const InputDecoration(labelText: 'Address line'),
              validator: (v) => (v == null || v.trim().isEmpty) ? 'Enter the address' : null,
            ),
            const SizedBox(height: 14),
            TextFormField(
              controller: _city,
              decoration: const InputDecoration(labelText: 'City / Town'),
              validator: (v) => (v == null || v.trim().isEmpty) ? 'Enter a city' : null,
            ),
            const SizedBox(height: 14),
            locations.when(
              loading: () => const LinearProgressIndicator(minHeight: 2),
              error: (_, __) => const Text('Could not load locations',
                  style: TextStyle(color: AppColors.danger)),
              data: (map) {
                final states = map.keys.toList()..sort();
                // Districts are always those of the selected state.
                final districts = _state == null ? <String>[] : (map[_state] ?? []);
                return Column(
                  children: [
                    DropdownButtonFormField<String>(
                      initialValue: _state,
                      isExpanded: true,
                      decoration: const InputDecoration(labelText: 'State'),
                      items: states
                          .map((s) => DropdownMenuItem(value: s, child: Text(s)))
                          .toList(),
                      onChanged: (v) => setState(() {
                        _state = v;
                        _district = null; // the old district may not belong here
                      }),
                    ),
                    const SizedBox(height: 14),
                    DropdownButtonFormField<String>(
                      initialValue: _district,
                      isExpanded: true,
                      decoration: const InputDecoration(labelText: 'District'),
                      items: districts
                          .map((d) => DropdownMenuItem(value: d, child: Text(d)))
                          .toList(),
                      onChanged: _state == null
                          ? null
                          : (v) => setState(() => _district = v),
                    ),
                  ],
                );
              },
            ),
            const SizedBox(height: 14),
            TextFormField(
              controller: _pin,
              keyboardType: TextInputType.number,
              inputFormatters: [
                FilteringTextInputFormatter.digitsOnly,
                LengthLimitingTextInputFormatter(6),
              ],
              decoration: const InputDecoration(labelText: 'PIN code'),
              validator: (v) => (v == null || v.trim().length != 6) ? '6-digit PIN' : null,
            ),
            const SizedBox(height: 24),
            const SectionTitle('Contact'),
            const SizedBox(height: 12),
            TextFormField(
              controller: _phone,
              keyboardType: TextInputType.phone,
              decoration: const InputDecoration(labelText: 'Phone number'),
              validator: (v) {
                final d = _digits(v ?? '');
                return RegExp(r'^[6-9]\d{9}$').hasMatch(d)
                    ? null
                    : 'Enter a 10-digit mobile number';
              },
            ),
            const SizedBox(height: 14),
            TextFormField(
              controller: _email,
              keyboardType: TextInputType.emailAddress,
              decoration: const InputDecoration(
                labelText: 'Email',
                helperText: 'Optional',
              ),
              validator: (v) {
                final t = (v ?? '').trim();
                if (t.isEmpty) return null; // optional
                return RegExp(r'^[^\s@]+@[^\s@]+\.[^\s@]+$').hasMatch(t)
                    ? null
                    : 'Enter a valid email';
              },
            ),
            const SizedBox(height: 28),
            FilledButton(
              onPressed: _busy ? null : _submit,
              child: _busy
                  ? const SizedBox(
                      width: 20,
                      height: 20,
                      child: CircularProgressIndicator(strokeWidth: 2.4, color: Colors.white),
                    )
                  : const Text('Save property'),
            ),
          ],
        ),
      ),
    );
  }
}

class _PhotoStrip extends StatelessWidget {
  const _PhotoStrip({required this.photos, required this.onAdd, required this.onRemove});
  final List<XFile> photos;
  final VoidCallback onAdd;
  final ValueChanged<int> onRemove;

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      height: 96,
      child: ListView(
        scrollDirection: Axis.horizontal,
        children: [
          GestureDetector(
            onTap: onAdd,
            child: Container(
              width: 96,
              height: 96,
              margin: const EdgeInsets.only(right: 10),
              decoration: BoxDecoration(
                color: AppColors.field,
                borderRadius: BorderRadius.circular(AppRadius.md),
                border: Border.all(color: AppColors.line),
              ),
              child: const Column(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  Icon(Icons.add_a_photo_outlined, color: AppColors.inkMuted),
                  SizedBox(height: 6),
                  Text('Add', style: TextStyle(fontSize: 12, color: AppColors.inkMuted)),
                ],
              ),
            ),
          ),
          ...photos.asMap().entries.map((e) {
            final i = e.key;
            final x = e.value;
            return Stack(
              children: [
                Container(
                  width: 96,
                  height: 96,
                  margin: const EdgeInsets.only(right: 10),
                  decoration: BoxDecoration(
                    borderRadius: BorderRadius.circular(AppRadius.md),
                    image: DecorationImage(
                      fit: BoxFit.cover,
                      image: kIsWeb
                          ? NetworkImage(x.path)
                          : FileImage(File(x.path)) as ImageProvider,
                    ),
                  ),
                ),
                Positioned(
                  right: 14,
                  top: 4,
                  child: GestureDetector(
                    onTap: () => onRemove(i),
                    child: const CircleAvatar(
                      radius: 11,
                      backgroundColor: Colors.black54,
                      child: Icon(Icons.close, size: 14, color: Colors.white),
                    ),
                  ),
                ),
              ],
            );
          }),
        ],
      ),
    );
  }
}
