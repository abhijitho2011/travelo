import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../notifications/notifications_controller.dart';
import '../permissions/role_config.dart';
import '../providers.dart';
import '../routing/routes.dart';
import '../theme/app_colors.dart';
import '../theme/app_spacing.dart';
import '../theme/app_typography.dart';
import '../theme/theme_controller.dart';
import 'offline_indicator.dart';

/// The chrome every signed-in screen sits inside.
///
/// Nothing here knows what role is signed in — it renders whatever
/// [RoleConfig] says the bottom nav and More menu contain, already filtered by
/// the user's permissions.
class AppShell extends ConsumerWidget {
  const AppShell({super.key, required this.child});

  final Widget child;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final c = context.colors;
    final config = ref.watch(roleConfigProvider);
    final permissions = ref.watch(permissionsProvider);
    final nav = config.visibleNav(permissions);
    final more = config.visibleMore(permissions);

    final location = GoRouterState.of(context).uri.path;

    // A role with nothing in More gets no More destination at all — an empty
    // sheet is worse than an absent button.
    final showMore = more.isNotEmpty;
    final destinations = <NavigationDestination>[
      for (final item in nav)
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

    // The More destination is always last, in the rail exactly as in the bottom
    // bar — both call this one function, so neither can drop it.
    final moreIndex = showMore ? destinations.length - 1 : -1;

    void onSelect(int i) {
      if (i == moreIndex) {
        _MoreSheet.show(context, more, current: location);
        return;
      }
      context.go(nav[i].route);
    }

    // Sitting on a More destination lights "More" rather than leaving the first
    // tab lit on a screen it does not serve.
    final navMatch = _selectedIndex(nav.map((n) => n.route).toList(), location);
    final moreMatch = _selectedIndex(more.map((n) => n.route).toList(), location);
    final index = navMatch >= 0
        ? navMatch
        : (showMore && moreMatch >= 0 ? moreIndex : 0);
    final hasNav = destinations.length >= 2;

    // Tablets get a side rail instead of a bottom bar: on a 10" screen a bottom
    // bar strands navigation far from the hands holding the device, and wastes
    // the horizontal space the rail uses well.
    final isTablet = MediaQuery.sizeOf(context).shortestSide >= _tabletBreakpoint;

    if (isTablet && hasNav) {
      return Scaffold(
        backgroundColor: c.background,
        appBar: const _TopBar(),
        body: SafeArea(
          top: false,
          child: Row(
            children: [
              DecoratedBox(
                decoration: BoxDecoration(
                  border: Border(right: BorderSide(color: c.border)),
                ),
                // A NavigationRail does not scroll on its own: a role with many
                // destinations would overflow a short landscape tablet and take
                // the last one — More — off screen with it. Wrapping it in a
                // min-height scroll view keeps every destination reachable.
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
                    constraints: const BoxConstraints(maxWidth: _contentMaxWidth),
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
      appBar: const _TopBar(),
      body: SafeArea(top: false, child: child),
      bottomNavigationBar: !hasNav
          ? null
          : DecoratedBox(
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

  /// Shortest-side threshold that separates a large phone from a small tablet.
  static const double _tabletBreakpoint = 600;

  /// Comfortable reading width for list/detail content on a wide screen.
  static const double _contentMaxWidth = 1100;

  /// Index of the destination whose route is the longest prefix of the current
  /// location, so a detail screen keeps its parent tab lit. Returns -1 when no
  /// destination serves this location — the caller decides what to light.
  static int _selectedIndex(List<String> routes, String location) {
    var best = -1;
    var bestLength = -1;
    for (var i = 0; i < routes.length; i++) {
      final r = routes[i];
      if (r.length <= bestLength) continue;
      if (location == r ||
          (location.startsWith(r) &&
              (r == '/' || location.length > r.length && location[r.length] == '/'))) {
        best = i;
        bestLength = r.length;
      }
    }
    return best;
  }
}

class _TopBar extends ConsumerWidget implements PreferredSizeWidget {
  const _TopBar();

  @override
  Size get preferredSize => const Size.fromHeight(56);

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final c = context.colors;
    final session = ref.watch(sessionProvider);
    final unread = ref.watch(unreadNotificationCountProvider);
    final themeMode = ref.watch(themeControllerProvider);

    return AppBar(
      backgroundColor: c.background,
      elevation: 0,
      titleSpacing: Sp.lg,
      title: Row(
        children: [
          Container(
            width: 28,
            height: 28,
            decoration: BoxDecoration(
              color: c.primary,
              borderRadius: R.rSm,
            ),
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
                  session?.hotel?.name ?? 'Tavelo',
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: AppTypography.display(size: 14, color: c.foreground),
                ),
                Text(
                  session?.role.label ?? '',
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
        const OfflineIndicatorButton(),
        IconButton(
          onPressed: () => ref.read(themeControllerProvider.notifier).cycle(),
          tooltip: switch (themeMode) {
            ThemeMode.system => 'Theme: follows device',
            ThemeMode.light => 'Theme: light',
            ThemeMode.dark => 'Theme: dark',
          },
          icon: Icon(
            switch (themeMode) {
              ThemeMode.system => Icons.brightness_auto_outlined,
              ThemeMode.light => Icons.light_mode_outlined,
              ThemeMode.dark => Icons.dark_mode_outlined,
            },
            size: 20,
          ),
        ),
        _BellButton(unread: unread),
        Padding(
          padding: const EdgeInsets.only(right: Sp.sm),
          child: IconButton(
            tooltip: 'Profile',
            onPressed: () => context.go(Routes.profile),
            icon: CircleAvatar(
              radius: 14,
              backgroundColor: c.primary,
              child: Text(
                session?.user.initials ?? '?',
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

/// The chip only occupies space when it has something to say.
class OfflineIndicatorButton extends StatelessWidget {
  const OfflineIndicatorButton({super.key});

  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.symmetric(horizontal: Sp.xs),
    child: Center(
      child: OfflineIndicator(onTap: () => PendingSyncSheet.show(context)),
    ),
  );
}

class _BellButton extends StatelessWidget {
  const _BellButton({required this.unread});

  final int unread;

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    return Stack(
      alignment: Alignment.center,
      children: [
        IconButton(
          tooltip: unread == 0 ? 'Notifications' : '$unread unread notifications',
          onPressed: () => context.go(Routes.notifications),
          icon: const Icon(Icons.notifications_none, size: 21),
        ),
        if (unread > 0)
          Positioned(
            top: 8,
            right: 6,
            child: Container(
              padding: const EdgeInsets.symmetric(horizontal: 4, vertical: 1),
              constraints: const BoxConstraints(minWidth: 15),
              decoration: BoxDecoration(
                color: c.critical,
                borderRadius: R.rPill,
              ),
              alignment: Alignment.center,
              child: Text(
                unread > 9 ? '9+' : '$unread',
                style: AppTypography.numeric(
                  size: 9,
                  weight: FontWeight.w700,
                  color: Colors.white,
                ),
              ),
            ),
          ),
      ],
    );
  }
}

/// The "More" sheet — the overflow half of the role's navigation.
///
/// Opened identically from the bottom bar and from the tablet rail. Every item
/// in the role's More list appears here with its icon and label; the list
/// scrolls, so a role with a dozen extra modules is no harder to use than one
/// with two.
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
    // Long lists get the height they need instead of being capped at half the
    // screen and silently clipping the last entries.
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
