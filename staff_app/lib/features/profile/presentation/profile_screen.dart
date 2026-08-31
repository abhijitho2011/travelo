import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/offline/offline_providers.dart';
import '../../../core/providers.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/theme/app_spacing.dart';
import '../../../core/theme/app_typography.dart';
import '../../../core/theme/theme_controller.dart';
import '../../../core/widgets/primitives.dart';
import '../../../core/widgets/states.dart';
import '../../../core/widgets/status_badge.dart';

/// Who you are, where you work, and the two settings you control.
///
/// Role, hotel and department are set by your manager and are deliberately
/// read-only here — the screen says so rather than showing a disabled field
/// with no explanation.
class ProfileScreen extends ConsumerWidget {
  const ProfileScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final c = context.colors;
    final session = ref.watch(sessionProvider);
    final themeMode = ref.watch(themeControllerProvider);
    final pending = ref.watch(pendingSyncCountProvider);

    if (session == null) {
      return const PageBody(
        children: [
          EmptyState(title: 'Not signed in', icon: Icons.person_off_outlined),
        ],
      );
    }

    final user = session.user;

    return PageBody(
      onRefresh: () =>
          ref.read(authControllerProvider.notifier).refreshSession(),
      children: [
        const PageHeader(eyebrow: 'Account', title: 'Profile'),
        gapSection,

        SoftCard(
          child: Row(
            children: [
              CircleAvatar(
                radius: 26,
                backgroundColor: c.primary,
                child: Text(
                  user.initials,
                  style: AppTypography.body(
                    size: 17,
                    weight: FontWeight.w700,
                    color: c.primaryForeground,
                  ),
                ),
              ),
              const SizedBox(width: Sp.lg),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      user.fullName,
                      style: AppTypography.display(
                        size: 19,
                        color: c.foreground,
                      ),
                    ),
                    const SizedBox(height: 2),
                    Text(
                      session.role.label,
                      style: AppTypography.body(
                        size: 13.5,
                        color: c.mutedForeground,
                      ),
                    ),
                    const SizedBox(height: 6),
                    StatusBadge(
                      tone: user.status.canUseApp
                          ? StatusTone.healthy
                          : StatusTone.warning,
                      label: user.status.label,
                      dense: true,
                    ),
                  ],
                ),
              ),
            ],
          ),
        ),
        gapMd,

        Panel(
          title: 'Your posting',
          description: 'Set by your manager — not editable here.',
          padBody: false,
          child: Column(
            children: [
              _Row(
                icon: Icons.apartment_outlined,
                label: 'Hotel',
                value: session.hotel?.name ?? '—',
                hint: session.hotel?.location,
                locked: true,
              ),
              const RowDivider(),
              _Row(
                icon: Icons.badge_outlined,
                label: 'Role',
                value: session.role.label,
                locked: true,
              ),
              const RowDivider(),
              _Row(
                icon: Icons.workspaces_outline,
                label: 'Department',
                value: user.department?.isNotEmpty == true
                    ? user.department!
                    : session.role.department,
                locked: true,
              ),
              const RowDivider(),
              _Row(
                icon: Icons.tag,
                label: 'Employee ID',
                value: user.employeeId?.isNotEmpty == true
                    ? user.employeeId!
                    : '—',
                locked: true,
              ),
              if (session.organization != null) ...[
                const RowDivider(),
                _Row(
                  icon: Icons.corporate_fare_outlined,
                  label: 'Organisation',
                  value: session.organization!.name,
                  locked: true,
                ),
              ],
            ],
          ),
        ),
        gapMd,

        Panel(
          title: 'Contact',
          padBody: false,
          child: Column(
            children: [
              _Row(
                icon: Icons.phone_iphone_outlined,
                label: 'Mobile',
                value: user.mobile ?? '—',
              ),
              const RowDivider(),
              _Row(
                icon: Icons.alternate_email,
                label: 'Email',
                value: user.email ?? '—',
              ),
            ],
          ),
        ),
        gapMd,

        Panel(
          title: 'App',
          padBody: false,
          child: Column(
            children: [
              ListTile(
                leading: const Icon(Icons.brightness_6_outlined, size: 20),
                title: const Text('Appearance'),
                subtitle: Text(switch (themeMode) {
                  ThemeMode.system => 'Follows your device',
                  ThemeMode.light => 'Light',
                  ThemeMode.dark => 'Dark',
                }),
                trailing: SegmentedButton<ThemeMode>(
                  showSelectedIcon: false,
                  style: ButtonStyle(
                    visualDensity: VisualDensity.compact,
                    textStyle: WidgetStatePropertyAll(
                      AppTypography.body(size: 11.5, weight: FontWeight.w600),
                    ),
                  ),
                  segments: const [
                    ButtonSegment(value: ThemeMode.light, label: Text('Light')),
                    ButtonSegment(value: ThemeMode.dark, label: Text('Dark')),
                    ButtonSegment(value: ThemeMode.system, label: Text('Auto')),
                  ],
                  selected: {themeMode},
                  onSelectionChanged: (s) =>
                      ref.read(themeControllerProvider.notifier).set(s.first),
                ),
              ),
              const RowDivider(),
              ListTile(
                leading: const Icon(Icons.sync_outlined, size: 20),
                title: const Text('Waiting to sync'),
                subtitle: Text(
                  pending == 0
                      ? 'Everything is saved to Tavelo'
                      : '$pending change${pending == 1 ? '' : 's'} stored on this device',
                ),
                trailing: pending == 0
                    ? null
                    : StatusBadge(
                        tone: StatusTone.warning,
                        label: '$pending',
                        dense: true,
                      ),
              ),
            ],
          ),
        ),

        gapSection,
        OutlinedButton.icon(
          onPressed: () => _confirmSignOut(context, ref),
          style: OutlinedButton.styleFrom(foregroundColor: c.destructive),
          icon: const Icon(Icons.logout, size: 18),
          label: const Text('Sign out'),
        ),
        const SizedBox(height: Sp.lg),
        Center(
          child: Text(
            'Tavelo staff · one app, every role',
            style: AppTypography.body(size: 11.5, color: c.mutedForeground),
          ),
        ),
      ],
    );
  }

  Future<void> _confirmSignOut(BuildContext context, WidgetRef ref) async {
    final pending = ref.read(pendingSyncCountProvider);
    final ok = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Sign out?'),
        content: Text(
          pending == 0
              ? 'You will need your mobile number and a one-time code to sign '
                    'back in.'
              : 'You have $pending change${pending == 1 ? '' : 's'} stored on '
                    'this device that have not reached Tavelo yet. They stay on '
                    'the device and will be sent when someone signs in again.',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(context).pop(false),
            child: const Text('Stay signed in'),
          ),
          FilledButton(
            onPressed: () => Navigator.of(context).pop(true),
            child: const Text('Sign out'),
          ),
        ],
      ),
    );
    if (ok == true) {
      await ref.read(authControllerProvider.notifier).signOut();
    }
  }
}

class _Row extends StatelessWidget {
  const _Row({
    required this.icon,
    required this.label,
    required this.value,
    this.hint,
    this.locked = false,
  });

  final IconData icon;
  final String label;
  final String value;
  final String? hint;
  final bool locked;

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    return Padding(
      padding: Sp.row,
      child: Row(
        children: [
          Icon(icon, size: 18, color: c.mutedForeground),
          const SizedBox(width: Sp.md),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  label,
                  style: AppTypography.body(
                    size: 12.5,
                    color: c.mutedForeground,
                  ),
                ),
                Text(
                  value,
                  style: AppTypography.body(
                    size: 14,
                    weight: FontWeight.w600,
                    color: c.foreground,
                  ),
                ),
                if (hint != null && hint!.isNotEmpty)
                  Text(
                    hint!,
                    style: AppTypography.body(
                      size: 12,
                      color: c.mutedForeground,
                    ),
                  ),
              ],
            ),
          ),
          if (locked)
            Tooltip(
              message: 'Only your manager can change this',
              child: Icon(
                Icons.lock_outline,
                size: 15,
                color: c.mutedForeground,
              ),
            ),
        ],
      ),
    );
  }
}
