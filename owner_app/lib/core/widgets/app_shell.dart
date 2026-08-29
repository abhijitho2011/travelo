import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../config/app_config.dart';
import '../providers.dart';
import '../theme/app_colors.dart';
import '../theme/app_spacing.dart';
import '../theme/app_typography.dart';
import '../theme/theme_controller.dart';
import '../utils/formatting.dart';

/// One destination in the owner portal's navigation.
class NavItem {
  const NavItem({required this.label, required this.icon, required this.route});

  final String label;
  final IconData icon;
  final String route;
}

/// What a bottom bar can hold without the labels colliding. Everything past
/// this lives behind More on a phone, and directly in the rail on a tablet.
const _phoneNav = <NavItem>[
  NavItem(label: 'Dashboard', icon: Icons.dashboard_outlined, route: '/'),
  NavItem(
    label: 'Hotels',
    icon: Icons.apartment_outlined,
    route: '/properties',
  ),
  NavItem(label: 'Managers', icon: Icons.groups_outlined, route: '/staff'),
  NavItem(label: 'Support', icon: Icons.forum_outlined, route: '/support'),
];

const _overflowNav = <NavItem>[
  NavItem(
    label: 'Subscription',
    icon: Icons.receipt_long_outlined,
    route: '/subscription',
  ),
  NavItem(label: 'Security', icon: Icons.shield_outlined, route: '/security'),
  NavItem(label: 'Profile', icon: Icons.person_outline, route: '/profile'),
];

/// The chrome every signed-in screen sits inside.
class AppShell extends ConsumerWidget {
  const AppShell({super.key, required this.child});

  final Widget child;

  /// Shortest-side threshold that separates a large phone from a small tablet.
  static const double tabletBreakpoint = 600;

  /// Comfortable reading width for list/detail content on a wide screen.
  static const double contentMaxWidth = 1100;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final c = context.colors;
    final location = GoRouterState.of(context).uri.path;

    // Tablets get a side rail instead of a bottom bar: on a 10" screen a bottom
    // bar strands navigation far from the hands holding the device, and wastes
    // the horizontal space the rail uses well.
    final isTablet =
        MediaQuery.sizeOf(context).shortestSide >= tabletBreakpoint;

    // "More" only exists because a bottom bar cannot hold seven destinations.
    // The rail can (it scrolls), so on a tablet every destination is listed
    // directly and there is no More entry to tap through.
    final items = isTablet ? [..._phoneNav, ..._overflowNav] : _phoneNav;
    final showMore = !isTablet;

    final destinations = <NavigationDestination>[
      for (final item in items)
        NavigationDestination(
          icon: Icon(item.icon),
          label: item.label,
          tooltip: item.label,
        ),
      if (showMore)
        const NavigationDestination(
          icon: Icon(Icons.more_horiz),
          label: 'More',
          tooltip: 'More',
        ),
    ];

    // The More destination, when present, is always last.
    final moreIndex = showMore ? destinations.length - 1 : -1;

    void onSelect(int i) {
      if (i == moreIndex) {
        _MoreSheet.show(context, _overflowNav, current: location);
        return;
      }
      context.go(items[i].route);
    }

    // On a phone, sitting on an overflow destination lights "More" rather than
    // leaving the first tab lit on a screen it does not serve. On a tablet the
    // destination is in the rail itself, so it matches directly.
    final itemMatch = selectedNavIndex(
      items.map((n) => n.route).toList(),
      location,
    );
    final moreMatch = selectedNavIndex(
      _overflowNav.map((n) => n.route).toList(),
      location,
    );
    final index = itemMatch >= 0
        ? itemMatch
        : (showMore && moreMatch >= 0 ? moreIndex : 0);

    // The rail branch below reuses everything above, so the two layouts can
    // never disagree about what is selected or where a tap goes.
    if (isTablet) {
      return Scaffold(
        backgroundColor: c.background,
        appBar: const OwnerTopBar(),
        body: SafeArea(
          top: false,
          child: Row(
            children: [
              DecoratedBox(
                decoration: BoxDecoration(
                  border: Border(right: BorderSide(color: c.border)),
                ),
                // A NavigationRail does not scroll on its own: seven
                // destinations would overflow a short landscape tablet and take
                // the last one off screen with it. Wrapping it in a min-height
                // scroll view keeps every destination reachable.
                child: LayoutBuilder(
                  builder: (context, constraints) => SingleChildScrollView(
                    child: ConstrainedBox(
                      constraints: BoxConstraints(
                        minHeight: constraints.maxHeight,
                      ),
                      child: IntrinsicHeight(
                        child: NavigationRail(
                          selectedIndex: index,
                          onDestinationSelected: onSelect,
                          labelType: NavigationRailLabelType.all,
                          backgroundColor: c.surface,
                          destinations: [
                            for (final d in destinations)
                              NavigationRailDestination(
                                icon: d.icon,
                                label: Text(d.label),
                              ),
                          ],
                        ),
                      ),
                    ),
                  ),
                ),
              ),
              // Keep line length readable rather than letting a list span the
              // full width of a landscape tablet.
              Expanded(
                child: Align(
                  alignment: Alignment.topCenter,
                  child: ConstrainedBox(
                    constraints: const BoxConstraints(
                      maxWidth: contentMaxWidth,
                    ),
                    child: child,
                  ),
                ),
              ),
            ],
          ),
        ),
      );
    }

    return Scaffold(
      backgroundColor: c.background,
      appBar: const OwnerTopBar(),
      body: SafeArea(top: false, child: child),
      bottomNavigationBar: DecoratedBox(
        decoration: BoxDecoration(
          border: Border(top: BorderSide(color: c.border)),
        ),
        child: NavigationBar(
          selectedIndex: index,
          destinations: destinations,
          onDestinationSelected: onSelect,
        ),
      ),
    );
  }
}

/// Index of the destination whose route is the longest prefix of the current
/// location, so a detail screen keeps its parent tab lit. Returns -1 when no
/// destination serves this location — the caller decides what to light.
int selectedNavIndex(List<String> routes, String location) {
  var best = -1;
  var bestLength = -1;
  for (var i = 0; i < routes.length; i++) {
    final r = routes[i];
    if (r.length <= bestLength) continue;
    if (location == r ||
        (location.startsWith(r) &&
            (r == '/' ||
                location.length > r.length && location[r.length] == '/'))) {
      best = i;
      bestLength = r.length;
    }
  }
  return best;
}

/// Brand, theme switch, sign-out and the profile avatar.
///
/// There is no notification bell: the owner portal has no notification feed, so
/// a bell here would be a button that never has anything to say.
class OwnerTopBar extends ConsumerWidget implements PreferredSizeWidget {
  const OwnerTopBar({super.key});

  @override
  Size get preferredSize => const Size.fromHeight(56);

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final c = context.colors;
    final owner = ref.watch(authControllerProvider).owner;
    final themeMode = ref.watch(themeControllerProvider);

    return AppBar(
      backgroundColor: c.background,
      elevation: 0,
      titleSpacing: Sp.lg,
      automaticallyImplyLeading: false,
      title: Row(
        children: [
          Container(
            width: 28,
            height: 28,
            decoration: BoxDecoration(color: c.primary, borderRadius: R.rSm),
            alignment: Alignment.center,
            child: Icon(
              Icons.apartment_rounded,
              size: 16,
              color: c.primaryForeground,
            ),
          ),
          const SizedBox(width: Sp.sm),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              mainAxisSize: MainAxisSize.min,
              children: [
                Text(
                  AppConfig.appName,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: AppTypography.display(size: 14, color: c.foreground),
                ),
                Text(
                  owner?.company.isNotEmpty == true ? owner!.company : 'Owner',
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: AppTypography.body(size: 11, color: c.mutedForeground),
                ),
              ],
            ),
          ),
        ],
      ),
      actions: [
        IconButton(
          onPressed: () => ref.read(themeControllerProvider.notifier).cycle(),
          tooltip: switch (themeMode) {
            ThemeMode.system => 'Theme: follows device',
            ThemeMode.light => 'Theme: light',
            ThemeMode.dark => 'Theme: dark',
          },
          icon: Icon(switch (themeMode) {
            ThemeMode.system => Icons.brightness_auto_outlined,
            ThemeMode.light => Icons.light_mode_outlined,
            ThemeMode.dark => Icons.dark_mode_outlined,
          }, size: 20),
        ),
        IconButton(
          tooltip: 'Sign out',
          onPressed: () => confirmSignOut(context, ref),
          icon: const Icon(Icons.logout_rounded, size: 20),
        ),
        Padding(
          padding: const EdgeInsets.only(right: Sp.sm),
          child: IconButton(
            tooltip: 'Profile',
            onPressed: () => context.go('/profile'),
            icon: CircleAvatar(
              radius: 14,
              backgroundColor: c.primary,
              child: Text(
                initialsOf(owner?.name),
                style: AppTypography.body(
                  size: 11,
                  weight: FontWeight.w700,
                  color: c.primaryForeground,
                ),
              ),
            ),
          ),
        ),
      ],
      bottom: PreferredSize(
        preferredSize: const Size.fromHeight(1),
        child: Container(height: 1, color: c.border),
      ),
    );
  }
}

/// Signing out is one tap from every screen, so it asks first — an accidental
/// press would otherwise cost the owner an OTP round trip.
Future<void> confirmSignOut(BuildContext context, WidgetRef ref) async {
  final c = context.colors;
  final ok = await showDialog<bool>(
    context: context,
    builder: (dialogContext) => AlertDialog(
      title: const Text('Sign out?'),
      content: const Text(
        'You will need your mobile number and a new code to sign back in.',
      ),
      actions: [
        TextButton(
          onPressed: () => Navigator.pop(dialogContext, false),
          child: const Text('Cancel'),
        ),
        FilledButton(
          style: FilledButton.styleFrom(
            backgroundColor: c.destructive,
            foregroundColor: c.destructiveForeground,
          ),
          onPressed: () => Navigator.pop(dialogContext, true),
          child: const Text('Sign out'),
        ),
      ],
    ),
  );
  if (ok != true) return;
  await ref.read(authControllerProvider.notifier).signOut();
}

/// The "More" sheet — the overflow half of the phone navigation.
class _MoreSheet extends StatelessWidget {
  const _MoreSheet({required this.items, this.current});

  final List<NavItem> items;

  /// The location the sheet was opened from, so the entry you are already on
  /// reads as selected rather than as one more thing to tap.
  final String? current;

  static Future<void> show(
    BuildContext context,
    List<NavItem> items, {
    String? current,
  }) => showModalBottomSheet(
    context: context,
    showDragHandle: true,
    isScrollControlled: true,
    constraints: BoxConstraints(
      maxHeight: MediaQuery.sizeOf(context).height * 0.85,
    ),
    builder: (_) => _MoreSheet(items: items, current: current),
  );

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    return SafeArea(
      child: Padding(
        padding: const EdgeInsets.fromLTRB(Sp.sm, 0, Sp.sm, Sp.lg),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Padding(
              padding: const EdgeInsets.fromLTRB(Sp.md, 0, Sp.md, Sp.sm),
              child: Text(
                'More',
                style: AppTypography.display(size: 16, color: c.foreground),
              ),
            ),
            Flexible(
              child: ListView(
                shrinkWrap: true,
                children: [
                  for (final item in items)
                    ListTile(
                      selected: item.route == current,
                      selectedColor: c.primary,
                      leading: Icon(item.icon, size: 20),
                      title: Text(item.label),
                      trailing: Icon(
                        Icons.chevron_right,
                        size: 18,
                        color: c.mutedForeground,
                      ),
                      onTap: () {
                        Navigator.of(context).pop();
                        context.go(item.route);
                      },
                    ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}
