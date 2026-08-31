import 'package:flutter/material.dart';

import '../theme/app_colors.dart';
import '../theme/app_spacing.dart';
import '../theme/app_typography.dart';
import 'primitives.dart';
import 'status_badge.dart';

/// A generic two-line list row inside a [Panel] whose body is unpadded.
/// The building block behind arrival queues, departures and log lists.
class DataRow2 extends StatelessWidget {
  const DataRow2({
    super.key,
    required this.title,
    this.subtitle,
    this.leading,
    this.trailing,
    this.badge,
    this.onTap,
    this.titleIcon,
  });

  final String title;
  final String? subtitle;
  final Widget? leading;
  final Widget? trailing;
  final Widget? badge;
  final VoidCallback? onTap;
  final IconData? titleIcon;

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    return InkWell(
      onTap: onTap,
      child: Padding(
        padding: Sp.row,
        child: Row(
          children: [
            if (leading != null) ...[leading!, const SizedBox(width: Sp.md)],
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                mainAxisSize: MainAxisSize.min,
                children: [
                  Row(
                    children: [
                      if (titleIcon != null) ...[
                        Icon(titleIcon, size: 13, color: c.warning),
                        const SizedBox(width: 5),
                      ],
                      Flexible(
                        child: Text(
                          title,
                          overflow: TextOverflow.ellipsis,
                          style: AppTypography.body(
                            size: 13.5,
                            weight: FontWeight.w600,
                            color: c.foreground,
                          ),
                        ),
                      ),
                    ],
                  ),
                  if (subtitle != null)
                    Text(
                      subtitle!,
                      overflow: TextOverflow.ellipsis,
                      style: AppTypography.body(
                        size: 12,
                        color: c.mutedForeground,
                      ),
                    ),
                ],
              ),
            ),
            if (badge != null) ...[const SizedBox(width: Sp.sm), badge!],
            if (trailing != null) ...[const SizedBox(width: Sp.sm), trailing!],
          ],
        ),
      ),
    );
  }
}

/// A task assigned to the signed-in user (housekeeping, cleaning, spa).
class TaskCard extends StatelessWidget {
  const TaskCard({
    super.key,
    required this.headline,
    required this.type,
    required this.statusLabel,
    required this.statusTone,
    this.note,
    this.meta,
    this.highPriority = false,
    this.dimmed = false,
    this.onTap,
    this.actions,
  });

  /// The big Sora numeral — usually the room number.
  final String headline;
  final String type;
  final String statusLabel;
  final StatusTone statusTone;
  final String? note;
  final String? meta;
  final bool highPriority;
  final bool dimmed;
  final VoidCallback? onTap;
  final Widget? actions;

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    return Opacity(
      opacity: dimmed ? 0.68 : 1,
      child: SoftCard(
        onTap: onTap,
        accent: highPriority && !dimmed ? c.critical : null,
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        headline,
                        style: AppTypography.kpi(size: 26, color: c.foreground),
                      ),
                      const SizedBox(height: 6),
                      Text(
                        type,
                        style: AppTypography.body(
                          size: 13.5,
                          weight: FontWeight.w600,
                          color: c.foreground,
                        ),
                      ),
                      if (note != null && note!.isNotEmpty)
                        Padding(
                          padding: const EdgeInsets.only(top: 2),
                          child: Text(
                            note!,
                            style: AppTypography.body(
                              size: 12,
                              color: c.warning,
                            ),
                          ),
                        ),
                      if (meta != null)
                        Padding(
                          padding: const EdgeInsets.only(top: 4),
                          child: Text(
                            meta!,
                            style: AppTypography.numeric(
                              size: 12,
                              color: c.mutedForeground,
                            ),
                          ),
                        ),
                    ],
                  ),
                ),
                StatusBadge(tone: statusTone, label: statusLabel),
              ],
            ),
            if (actions != null) ...[const SizedBox(height: Sp.md), actions!],
          ],
        ),
      ),
    );
  }
}

/// A room tile for a status grid — HF's room card, with its coloured top rule.
class RoomCard extends StatelessWidget {
  const RoomCard({
    super.key,
    required this.number,
    required this.type,
    required this.statusLabel,
    required this.tone,
    this.occupant,
    this.photoUrl,
    this.onTap,
  });

  final String number;
  final String type;
  final String statusLabel;
  final StatusTone tone;
  final String? occupant;

  /// A presigned cover photo. Set on the inventory screen, where a room is a
  /// thing you look at; left null on the front-desk board, where the card is a
  /// status tile and a photo would only slow the scan.
  final String? photoUrl;

  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    final t = tone.color(c);
    return InkWell(
      onTap: onTap,
      borderRadius: R.rMd,
      child: Container(
        padding: const EdgeInsets.fromLTRB(10, 12, 10, 10),
        decoration: BoxDecoration(
          color: c.card,
          borderRadius: R.rMd,
          border: Border.all(color: c.border),
          gradient: LinearGradient(
            begin: Alignment.topCenter,
            end: Alignment.bottomCenter,
            colors: [t.withValues(alpha: 0.09), t.withValues(alpha: 0)],
            stops: const [0, 0.62],
          ),
        ),
        child: Stack(
          children: [
            Positioned(
              top: -12,
              left: -10,
              right: -10,
              child: Container(height: 3, color: t),
            ),
            Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              mainAxisSize: MainAxisSize.min,
              children: [
                Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    Text(
                      number,
                      style: AppTypography.numeric(
                        size: 14,
                        weight: FontWeight.w700,
                        color: c.foreground,
                      ),
                    ),
                    Icon(tone.icon, size: 13, color: t),
                  ],
                ),
                Text(
                  type,
                  overflow: TextOverflow.ellipsis,
                  style: AppTypography.body(size: 10, color: c.mutedForeground),
                ),
                if (photoUrl != null) ...[
                  const SizedBox(height: 6),
                  ClipRRect(
                    borderRadius: R.rSm,
                    child: AspectRatio(
                      aspectRatio: 16 / 9,
                      child: Image.network(
                        photoUrl!,
                        fit: BoxFit.cover,
                        // A presigned URL can expire between the list load and
                        // the paint. A room with no visible cover is a smaller
                        // problem than a broken-image glyph on the board.
                        errorBuilder: (_, _, _) => ColoredBox(color: c.muted),
                        loadingBuilder: (context, child, progress) =>
                            progress == null
                            ? child
                            : ColoredBox(color: c.muted),
                      ),
                    ),
                  ),
                ],
                const SizedBox(height: 3),
                Text(
                  statusLabel,
                  overflow: TextOverflow.ellipsis,
                  style: AppTypography.body(
                    size: 11,
                    weight: FontWeight.w600,
                    color: t,
                  ),
                ),
                Text(
                  occupant ?? '—',
                  overflow: TextOverflow.ellipsis,
                  style: AppTypography.body(size: 10, color: c.mutedForeground),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }
}

/// A booking summary, used in the reservation list and its detail header.
class ReservationCard extends StatelessWidget {
  const ReservationCard({
    super.key,
    required this.guestName,
    required this.stay,
    required this.statusLabel,
    required this.statusTone,
    this.roomLabel,
    this.reference,
    this.balanceLabel,
    this.vip = false,
    this.onTap,
    this.actions,
  });

  final String guestName;
  final String stay;
  final String statusLabel;
  final StatusTone statusTone;
  final String? roomLabel;
  final String? reference;
  final String? balanceLabel;
  final bool vip;
  final VoidCallback? onTap;
  final Widget? actions;

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    return SoftCard(
      onTap: onTap,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      children: [
                        if (vip) ...[
                          Icon(
                            Icons.workspace_premium_outlined,
                            size: 14,
                            color: c.warning,
                          ),
                          const SizedBox(width: 4),
                        ],
                        Flexible(
                          child: Text(
                            guestName,
                            overflow: TextOverflow.ellipsis,
                            style: AppTypography.body(
                              size: 14.5,
                              weight: FontWeight.w700,
                              color: c.foreground,
                            ),
                          ),
                        ),
                      ],
                    ),
                    const SizedBox(height: 2),
                    Text(
                      stay,
                      style: AppTypography.numeric(
                        size: 12,
                        color: c.mutedForeground,
                      ),
                    ),
                    if (reference != null)
                      Text(
                        reference!,
                        style: AppTypography.numeric(
                          size: 11,
                          color: c.mutedForeground,
                        ),
                      ),
                  ],
                ),
              ),
              Column(
                crossAxisAlignment: CrossAxisAlignment.end,
                children: [
                  StatusBadge(tone: statusTone, label: statusLabel),
                  if (roomLabel != null)
                    Padding(
                      padding: const EdgeInsets.only(top: 5),
                      child: Text(
                        roomLabel!,
                        style: AppTypography.numeric(
                          size: 12,
                          weight: FontWeight.w600,
                          color: c.foreground,
                        ),
                      ),
                    ),
                  if (balanceLabel != null)
                    Padding(
                      padding: const EdgeInsets.only(top: 2),
                      child: Text(
                        balanceLabel!,
                        style: AppTypography.numeric(
                          size: 11.5,
                          weight: FontWeight.w600,
                          color: c.critical,
                        ),
                      ),
                    ),
                ],
              ),
            ],
          ),
          if (actions != null) ...[const SizedBox(height: Sp.md), actions!],
        ],
      ),
    );
  }
}

/// A maintenance work order.
class WorkOrderCard extends StatelessWidget {
  const WorkOrderCard({
    super.key,
    required this.reference,
    required this.summary,
    required this.location,
    required this.statusLabel,
    required this.statusTone,
    this.reportedAgo,
    this.onTap,
    this.actions,
  });

  final String reference;
  final String summary;
  final String location;
  final String statusLabel;
  final StatusTone statusTone;
  final String? reportedAgo;
  final VoidCallback? onTap;
  final Widget? actions;

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    return SoftCard(
      onTap: onTap,
      accent: statusTone == StatusTone.critical ? c.critical : null,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Expanded(
                child: Text(
                  reference,
                  style: AppTypography.numeric(
                    size: 12,
                    weight: FontWeight.w700,
                    color: c.mutedForeground,
                  ),
                ),
              ),
              StatusBadge(tone: statusTone, label: statusLabel, dense: true),
            ],
          ),
          const SizedBox(height: 6),
          Text(
            summary,
            style: AppTypography.body(
              size: 14,
              weight: FontWeight.w600,
              color: c.foreground,
            ),
          ),
          const SizedBox(height: 3),
          Text(
            [location, if (reportedAgo != null) reportedAgo!].join(' · '),
            style: AppTypography.body(size: 12, color: c.mutedForeground),
          ),
          if (actions != null) ...[const SizedBox(height: Sp.md), actions!],
        ],
      ),
    );
  }
}

/// One item in the approval centre.
class ApprovalCard extends StatelessWidget {
  const ApprovalCard({
    super.key,
    required this.kindLabel,
    required this.title,
    required this.icon,
    this.subtitle,
    this.meta,
    this.amountLabel,
    this.actions,
  });

  final String kindLabel;
  final String title;
  final IconData icon;
  final String? subtitle;
  final String? meta;
  final String? amountLabel;
  final Widget? actions;

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    return SoftCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Container(
                width: 34,
                height: 34,
                decoration: BoxDecoration(color: c.accent, borderRadius: R.rSm),
                alignment: Alignment.center,
                child: Icon(icon, size: 17, color: c.accentForeground),
              ),
              const SizedBox(width: Sp.md),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    LabelXs(kindLabel),
                    Text(
                      title,
                      style: AppTypography.body(
                        size: 14.5,
                        weight: FontWeight.w700,
                        color: c.foreground,
                      ),
                    ),
                    if (subtitle != null)
                      Text(
                        subtitle!,
                        style: AppTypography.body(
                          size: 12.5,
                          color: c.mutedForeground,
                        ),
                      ),
                    if (meta != null)
                      Padding(
                        padding: const EdgeInsets.only(top: 2),
                        child: Text(
                          meta!,
                          style: AppTypography.numeric(
                            size: 11.5,
                            color: c.mutedForeground,
                          ),
                        ),
                      ),
                  ],
                ),
              ),
              if (amountLabel != null)
                Text(
                  amountLabel!,
                  style: AppTypography.kpi(size: 18, color: c.foreground),
                ),
            ],
          ),
          if (actions != null) ...[const SizedBox(height: Sp.lg), actions!],
        ],
      ),
    );
  }
}

/// An operational alert on the management dashboard.
class AlertCard extends StatelessWidget {
  const AlertCard({
    super.key,
    required this.title,
    required this.count,
    required this.tone,
    this.detail,
    this.onTap,
  });

  final String title;
  final int count;
  final StatusTone tone;
  final String? detail;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    final t = tone.color(c);
    return SoftCard(
      onTap: onTap,
      padding: const EdgeInsets.all(14),
      child: Row(
        children: [
          Container(
            width: 36,
            height: 36,
            decoration: BoxDecoration(
              color: t.withValues(alpha: 0.12),
              borderRadius: R.rSm,
              border: Border.all(color: t.withValues(alpha: 0.3)),
            ),
            alignment: Alignment.center,
            child: Icon(tone.icon, size: 18, color: t),
          ),
          const SizedBox(width: Sp.md),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  title,
                  style: AppTypography.body(
                    size: 13.5,
                    weight: FontWeight.w600,
                    color: c.foreground,
                  ),
                ),
                if (detail != null)
                  Text(
                    detail!,
                    overflow: TextOverflow.ellipsis,
                    style: AppTypography.body(
                      size: 12,
                      color: c.mutedForeground,
                    ),
                  ),
              ],
            ),
          ),
          const SizedBox(width: Sp.sm),
          Text('$count', style: AppTypography.kpi(size: 22, color: t)),
          if (onTap != null) ...[
            const SizedBox(width: 4),
            Icon(Icons.chevron_right, size: 18, color: c.mutedForeground),
          ],
        ],
      ),
    );
  }
}
