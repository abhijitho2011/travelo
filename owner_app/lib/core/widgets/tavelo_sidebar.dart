import 'package:flutter/material.dart';

import '../theme/app_colors.dart';
import '../theme/app_spacing.dart';
import '../theme/app_typography.dart';
import 'tavelo_logo.dart';

/// One entry in the Tavelo sidebar.
class SidebarEntry {
  const SidebarEntry({
    required this.label,
    required this.icon,
    required this.route,
    this.onTap,
  });

  final String label;
  final IconData icon;

  /// The route this entry navigates to (also used to compute the active state).
  final String route;

  /// Overrides the default `context.go(route)` — e.g. to open a sheet.
  final VoidCallback? onTap;
}

/// An optional titled group of entries.
class SidebarSection {
  const SidebarSection({this.title, required this.entries});
  final String? title;
  final List<SidebarEntry> entries;
}

/// The Tavelo left navigation, exactly per the design system:
/// a white card (`--tv-surface`) with 14px radius, a brand header, and rows
/// that read `#4E5A55` at rest, hover `#F5F7F6`, and go `#E9F5F0` / brand on
/// the active route. Section labels are 11px uppercase `#9AA5A0`.
class TaveloSidebar extends StatelessWidget {
  const TaveloSidebar({
    super.key,
    required this.sections,
    required this.currentLocation,
    required this.isActive,
    this.width = 232,
    this.footer,
  });

  final List<SidebarSection> sections;
  final String currentLocation;

  /// True when [route] should read as the active row for [currentLocation].
  final bool Function(String route) isActive;

  final double width;
  final Widget? footer;

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    return Container(
      width: width,
      margin: const EdgeInsets.all(Sp.md),
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 14),
      decoration: BoxDecoration(
        color: c.card,
        borderRadius: R.rLg,
        border: Border.all(color: c.border),
        boxShadow: c.elevation1,
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(8, 6, 8, 14),
            child: Align(
              alignment: Alignment.centerLeft,
              child: TaveloLogo(height: 26),
            ),
          ),
          Expanded(
            child: SingleChildScrollView(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  for (var s = 0; s < sections.length; s++) ...[
                    if (s > 0)
                      Container(
                        height: 1,
                        margin: const EdgeInsets.fromLTRB(4, 8, 4, 8),
                        color: c.muted,
                      ),
                    if (sections[s].title != null)
                      Padding(
                        padding: const EdgeInsets.fromLTRB(10, 6, 10, 6),
                        child: Text(
                          sections[s].title!.toUpperCase(),
                          style: AppTypography.body(
                            size: 11,
                            weight: FontWeight.w600,
                            color: c.mutedForeground,
                          ).copyWith(letterSpacing: 0.7),
                        ),
                      ),
                    for (final entry in sections[s].entries)
                      _SidebarRow(entry: entry, active: isActive(entry.route)),
                  ],
                ],
              ),
            ),
          ),
          if (footer != null) footer!,
        ],
      ),
    );
  }
}

class _SidebarRow extends StatefulWidget {
  const _SidebarRow({required this.entry, required this.active});
  final SidebarEntry entry;
  final bool active;

  @override
  State<_SidebarRow> createState() => _SidebarRowState();
}

class _SidebarRowState extends State<_SidebarRow> {
  bool _hover = false;

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    final active = widget.active;
    final Color bg = active
        ? c
              .accent // #E9F5F0 selected tint
        : (_hover ? c.muted : Colors.transparent);
    final Color fg = active ? c.primary : c.mutedForeground;

    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 1),
      child: MouseRegion(
        onEnter: (_) => setState(() => _hover = true),
        onExit: (_) => setState(() => _hover = false),
        cursor: SystemMouseCursors.click,
        child: GestureDetector(
          behavior: HitTestBehavior.opaque,
          onTap: widget.entry.onTap,
          child: Container(
            padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 9),
            decoration: BoxDecoration(color: bg, borderRadius: R.rSm),
            child: Row(
              children: [
                Icon(widget.entry.icon, size: 19, color: fg),
                const SizedBox(width: 10),
                Expanded(
                  child: Text(
                    widget.entry.label,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: AppTypography.body(
                      size: 13.5,
                      weight: active ? FontWeight.w600 : FontWeight.w500,
                      color: active
                          ? c.primary
                          : c.foreground.withValues(alpha: 0.82),
                    ),
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
