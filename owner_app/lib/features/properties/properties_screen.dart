import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/data/owner_repository.dart';
import '../../theme/app_theme.dart';
import '../../widgets/ui.dart';

class PropertiesScreen extends ConsumerWidget {
  const PropertiesScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final props = ref.watch(propertiesProvider);
    return Scaffold(
      appBar: AppBar(title: const Text('Properties')),
      floatingActionButton: FloatingActionButton.extended(
        backgroundColor: AppColors.primary,
        foregroundColor: Colors.white,
        onPressed: () => context.push('/properties/new'),
        icon: const Icon(Icons.add),
        label: const Text('Add property'),
      ),
      body: props.when(
        loading: () => const LoadingView(),
        error: (_, __) => ErrorView(
          message: 'Could not load properties.',
          onRetry: () => ref.invalidate(propertiesProvider),
        ),
        data: (list) => ListView.separated(
          padding: const EdgeInsets.all(20),
          itemCount: list.length,
          separatorBuilder: (_, __) => const SizedBox(height: 12),
          itemBuilder: (_, i) {
            final p = list[i];
            return Card(
              child: ListTile(
                contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
                onTap: () => context.push('/properties/${p.id}/staff'),
                leading: const CircleAvatar(
                  backgroundColor: AppColors.primarySoft,
                  child: Icon(Icons.location_city, color: AppColors.primaryDark),
                ),
                title: Text(p.name, style: const TextStyle(fontWeight: FontWeight.w700)),
                subtitle: Text('${p.city}, ${p.state} · ${p.roomCount} rooms'),
                trailing: StatusChip(
                  label: p.status.isEmpty ? 'DRAFT' : p.status,
                  color: p.status == 'ACTIVE' ? AppColors.success : AppColors.inkMuted,
                ),
              ),
            );
          },
        ),
      ),
    );
  }
}
