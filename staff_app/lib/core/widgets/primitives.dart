import 'package:flutter/material.dart';

import '../theme/app_colors.dart';
import '../theme/app_spacing.dart';
import '../theme/app_typography.dart';

/// HF `.label-xs` — the small uppercase eyebrow used above every heading.
class LabelXs extends StatelessWidget {
  const LabelXs(this.text, {super.key, this.color});

  final String text;
  final Color? color;

  @override
  Widget build(BuildContext context) => Text(
    text.toUpperCase(),
    style: AppTypography.labelXs(color ?? context.colors.mutedForeground),
  );
}

/// HF `<PageHeader>`: eyebrow, title, subtitle and trailing actions.
class PageHeader extends StatelessWidget {
  const PageHeader({
    super.key,
    required this.title,
    this.eyebrow,
    this.subtitle,
    this.actions = const <Widget>[],
  });

  final String title;
  final String? eyebrow;
  final String? subtitle;
  final List<Widget> actions;

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        if (eyebrow != null) ...[LabelXs(eyebrow!), const SizedBox(height: 2)],
        Text(
          title,
          style: AppTypography.display(size: 22, color: c.foreground),
        ),
        if (subtitle != null) ...[
          const SizedBox(height: 4),
          Text(
            subtitle!,
            style: AppTypography.body(size: 13.5, color: c.mutedForeground),
          ),
        ],
        if (actions.isNotEmpty) ...[
          const SizedBox(height: Sp.md),
          Wrap(spacing: Sp.sm, runSpacing: Sp.sm, children: actions),
        ],
      ],
    );
  }
}

/// HF `<Panel>`: a bordered white card with a tinted header strip and a body.
class Panel extends StatelessWidget {
  const Panel({
    super.key,
    required this.title,
    required this.child,
    this.description,
    this.actions = const <Widget>[],
    this.padBody = true,
  });

  final String title;
  final String? description;
  final List<Widget> actions;
  final Widget child;
  final bool padBody;

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    return Container(
      decoration: BoxDecoration(
        color: c.card,
        borderRadius: R.rLg,
        border: Border.all(color: c.border),
        boxShadow: c.elevation1,
      ),
      clipBehavior: Clip.antiAlias,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        mainAxisSize: MainAxisSize.min,
        children: [
          Container(
            padding: Sp.panelHeader,
            decoration: BoxDecoration(
              // HF: `bg-gradient-to-r from-primary/[0.06] to-transparent`
              gradient: LinearGradient(
                colors: [
                  c.primary.withValues(alpha: 0.06),
                  c.primary.withValues(alpha: 0.0),
                ],
              ),
              border: Border(bottom: BorderSide(color: c.border)),
            ),
            child: Row(
              children: [
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        title,
                        overflow: TextOverflow.ellipsis,
                        style: AppTypography.body(
                          size: 14,
                          weight: FontWeight.w600,
                          color: c.foreground,
                        ),
                      ),
                      if (description != null)
                        Text(
                          description!,
                          overflow: TextOverflow.ellipsis,
                          style: AppTypography.body(
                            size: 12,
                            color: c.mutedForeground,
                          ),
                        ),
                    ],
                  ),
                ),
                if (actions.isNotEmpty) ...[
                  const SizedBox(width: Sp.sm),
                  Row(mainAxisSize: MainAxisSize.min, children: actions),
                ],
              ],
            ),
          ),
          Padding(padding: padBody ? Sp.card : EdgeInsets.zero, child: child),
        ],
      ),
    );
  }
}

/// A plain bordered card, for content that does not warrant a panel header.
class SoftCard extends StatelessWidget {
  const SoftCard({
    super.key,
    required this.child,
    this.padding = Sp.card,
    this.onTap,
    this.accent,
    this.raised = false,
  });

  final Widget child;
  final EdgeInsets padding;
  final VoidCallback? onTap;

  /// Draws HF's 4px left rule, used to flag priority rows.
  final Color? accent;
  final bool raised;

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    // The accent used to be a thicker, differently-coloured left BorderSide.
    // Flutter asserts when a non-uniform Border is combined with a
    // borderRadius, so every accented card — a high-priority task, a critical
    // work order — threw at paint. The stripe is drawn as a clipped overlay
    // instead, which looks the same and cannot assert.
    Widget content = Container(
      padding: padding,
      decoration: BoxDecoration(
        color: c.card,
        borderRadius: R.rLg,
        border: Border.all(color: c.border),
        boxShadow: raised ? c.elevation2 : c.elevation1,
      ),
      child: child,
    );
    if (accent != null) {
      content = Stack(
        children: [
          content,
          Positioned.fill(
            child: IgnorePointer(
              child: ClipRRect(
                borderRadius: R.rLg,
                child: Align(
                  alignment: Alignment.centerLeft,
                  child: SizedBox(width: 4, child: ColoredBox(color: accent!)),
                ),
              ),
            ),
          ),
        ],
      );
    }
    if (onTap == null) return content;
    return Material(
      color: Colors.transparent,
      child: InkWell(onTap: onTap, borderRadius: R.rLg, child: content),
    );
  }
}

/// HF `<KpiCard>`: eyebrow label, large Sora numeral, optional delta chip and
/// hint line.
class KpiCard extends StatelessWidget {
  const KpiCard({
    super.key,
    required this.label,
    required this.value,
    this.delta,
    this.hint,
    this.tone,
    this.onTap,
  });

  final String label;
  final String value;

  /// Percentage change; positive renders healthy, negative renders critical.
  final num? delta;
  final String? hint;

  /// Overrides the numeral colour, e.g. to flag a KPI that needs attention.
  final Color? tone;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    final up = (delta ?? 0) >= 0;
    final deltaColor = up ? c.healthy : c.critical;

    return SoftCard(
      onTap: onTap,
      padding: const EdgeInsets.all(14),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        mainAxisSize: MainAxisSize.min,
        children: [
          LabelXs(label),
          const SizedBox(height: 6),
          Row(
            crossAxisAlignment: CrossAxisAlignment.end,
            children: [
              Expanded(
                child: Text(
                  value,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: AppTypography.kpi(
                    size: 24,
                    color: tone ?? c.foreground,
                  ),
                ),
              ),
              if (delta != null)
                Container(
                  padding: const EdgeInsets.symmetric(
                    horizontal: 6,
                    vertical: 2,
                  ),
                  decoration: BoxDecoration(
                    color: deltaColor.withValues(alpha: 0.12),
                    borderRadius: R.rPill,
                  ),
                  child: Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Icon(
                        up ? Icons.trending_up : Icons.trending_down,
                        size: 12,
                        color: deltaColor,
                      ),
                      const SizedBox(width: 2),
                      Text(
                        '${up ? '+' : ''}$delta%',
                        style: AppTypography.numeric(
                          size: 11,
                          weight: FontWeight.w700,
                          color: deltaColor,
                        ),
                      ),
                    ],
                  ),
                ),
            ],
          ),
          if (hint != null) ...[
            const SizedBox(height: 5),
            Text(
              hint!,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: AppTypography.body(size: 11.5, color: c.mutedForeground),
            ),
          ],
        ],
      ),
    );
  }
}

/// Responsive KPI grid — HF's `grid-cols-2 lg:grid-cols-4`.
class KpiGrid extends StatelessWidget {
  const KpiGrid({super.key, required this.children, this.minTileWidth = 158});

  final List<Widget> children;
  final double minTileWidth;

  @override
  Widget build(BuildContext context) {
    return LayoutBuilder(
      builder: (context, constraints) {
        final columns = (constraints.maxWidth / minTileWidth).floor().clamp(
          2,
          6,
        );
        return GridView.count(
          crossAxisCount: columns,
          crossAxisSpacing: Sp.md,
          mainAxisSpacing: Sp.md,
          shrinkWrap: true,
          physics: const NeverScrollableScrollPhysics(),
          childAspectRatio: 1.62,
          children: children,
        );
      },
    );
  }
}

/// HF `<Segmented>` — a small tab control for filters.
class Segmented<T> extends StatelessWidget {
  const Segmented({
    super.key,
    required this.options,
    required this.labelOf,
    required this.value,
    required this.onChanged,
  });

  final List<T> options;
  final String Function(T) labelOf;
  final T value;
  final ValueChanged<T> onChanged;

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    return Container(
      padding: const EdgeInsets.all(2),
      decoration: BoxDecoration(
        color: c.muted,
        borderRadius: R.rMd,
        border: Border.all(color: c.border),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          for (final o in options)
            GestureDetector(
              onTap: () => onChanged(o),
              child: AnimatedContainer(
                duration: const Duration(milliseconds: 160),
                padding: const EdgeInsets.symmetric(
                  horizontal: 12,
                  vertical: 7,
                ),
                decoration: BoxDecoration(
                  color: o == value ? c.card : Colors.transparent,
                  borderRadius: R.rSm,
                  boxShadow: o == value ? c.elevation1 : null,
                ),
                child: Text(
                  labelOf(o),
                  style: AppTypography.body(
                    size: 12.5,
                    weight: FontWeight.w600,
                    color: o == value ? c.foreground : c.mutedForeground,
                  ),
                ),
              ),
            ),
        ],
      ),
    );
  }
}

/// A row separator matching HF's `divide-y`.
class RowDivider extends StatelessWidget {
  const RowDivider({super.key});

  @override
  Widget build(BuildContext context) =>
      Divider(height: 1, thickness: 1, color: context.colors.border);
}

/// Section heading used inside scrolling pages.
class SectionHeader extends StatelessWidget {
  const SectionHeader({
    super.key,
    required this.title,
    this.icon,
    this.trailing,
  });

  final String title;
  final IconData? icon;
  final Widget? trailing;

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    return Padding(
      padding: const EdgeInsets.only(bottom: Sp.sm),
      child: Row(
        children: [
          if (icon != null) ...[
            Icon(icon, size: 16, color: c.mutedForeground),
            const SizedBox(width: 6),
          ],
          Expanded(
            child: Text(
              title,
              style: AppTypography.body(
                size: 14,
                weight: FontWeight.w700,
                color: c.foreground,
              ),
            ),
          ),
          if (trailing != null) trailing!,
        ],
      ),
    );
  }
}

/// Constrains page content and applies HF's page gutter.
class PageBody extends StatelessWidget {
  const PageBody({
    super.key,
    required this.children,
    this.onRefresh,
    this.padding,
  });

  final List<Widget> children;
  final Future<void> Function()? onRefresh;
  final EdgeInsets? padding;

  @override
  Widget build(BuildContext context) {
    final wide = MediaQuery.sizeOf(context).width >= 640;
    final list = ListView(
      padding:
          (padding ?? (wide ? Sp.pageWide : Sp.page)) +
          const EdgeInsets.only(bottom: 32),
      children: [
        Center(
          child: ConstrainedBox(
            constraints: const BoxConstraints(maxWidth: kMaxContentWidth),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: children,
            ),
          ),
        ),
      ],
    );
    if (onRefresh == null) return list;
    return RefreshIndicator(
      onRefresh: onRefresh!,
      color: context.colors.primary,
      backgroundColor: context.colors.card,
      child: list,
    );
  }
}

/// Vertical rhythm helper — HF's `space-y-5`.
const gapSection = SizedBox(height: Sp.section);
const gapMd = SizedBox(height: Sp.md);
const gapSm = SizedBox(height: Sp.sm);
