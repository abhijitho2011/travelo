import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../providers.dart';
import '../theme/app_colors.dart';

/// Answers the permission question anywhere a `BuildContext` and a `WidgetRef`
/// are in scope. This — not a role comparison — is how every action decides
/// whether it may appear.
///
/// ```dart
/// if (ref.hasPermission(P.reservationCancel)) ...
/// ```
extension PermissionRefX on WidgetRef {
  bool hasPermission(String key) => read(permissionsProvider).has(key);

  bool hasAllPermissions(Iterable<String> keys) =>
      read(permissionsProvider).hasAll(keys);

  bool hasAnyPermission(Iterable<String> keys) =>
      read(permissionsProvider).hasAny(keys);

  /// Watching variant — rebuilds when the permission set changes (e.g. after a
  /// role change lands via `/auth/me`).
  bool watchPermission(String key) => watch(canProvider(key));
}

/// How a gate behaves when the permission is missing.
enum GateMode {
  /// Render nothing at all. The default: an action a user may not take should
  /// not advertise itself.
  hide,

  /// Render the child, disabled and dimmed, with an explanatory tooltip. Use
  /// when the absence of the control would make the layout confusing.
  disable,
}

/// Wraps any widget — usually a button — in a permission check.
///
/// The gate is the only sanctioned way to conditionally render an action.
/// Screens do not branch on role, and they do not read the raw permission list.
class PermissionGate extends ConsumerWidget {
  const PermissionGate({
    super.key,
    required String permission,
    required this.child,
    this.mode = GateMode.hide,
    this.fallback,
    this.deniedTooltip,
  }) : _keys = const [], _single = permission;

  /// Convenience for an action needing several permissions at once.
  const PermissionGate.all({
    super.key,
    required List<String> permissions,
    required this.child,
    this.mode = GateMode.hide,
    this.fallback,
    this.deniedTooltip,
  }) : _single = null,
       _keys = permissions;

  final String? _single;
  final List<String> _keys;
  final Widget child;
  final GateMode mode;

  /// Shown instead of nothing when hidden — rarely needed.
  final Widget? fallback;
  final String? deniedTooltip;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final permissions = ref.watch(permissionsProvider);
    final keys = _single != null ? [_single] : _keys;
    final allowed = permissions.hasAll(keys);

    if (allowed) return child;
    if (mode == GateMode.hide) return fallback ?? const SizedBox.shrink();

    return Tooltip(
      message: deniedTooltip ?? "Your role doesn't allow this action",
      child: Opacity(
        opacity: 0.45,
        child: IgnorePointer(child: child),
      ),
    );
  }
}

/// A small inline note explaining why a surface is thinner than expected —
/// used at the bottom of lists whose row actions were gated away, so the user
/// understands the app is not broken.
class PermissionNote extends StatelessWidget {
  const PermissionNote({super.key, required this.text});

  final String text;

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Icon(Icons.lock_outline, size: 13, color: c.mutedForeground),
        const SizedBox(width: 6),
        Expanded(
          child: Text(
            text,
            style: Theme.of(context).textTheme.bodySmall?.copyWith(
              color: c.mutedForeground,
            ),
          ),
        ),
      ],
    );
  }
}
