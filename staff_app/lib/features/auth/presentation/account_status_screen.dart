import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/networking/api_exception.dart';
import '../../../core/providers.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/theme/app_spacing.dart';
import '../../../core/theme/app_typography.dart';
import '../auth_copy.dart';
import 'auth_scaffold.dart';

/// One screen serving every non-usable account state. Which copy appears is
/// decided by the error code the server returned — pending approval, invited,
/// blocked, suspended, deactivated or throttled.
class AccountStatusScreen extends ConsumerStatefulWidget {
  const AccountStatusScreen({super.key});

  @override
  ConsumerState<AccountStatusScreen> createState() =>
      _AccountStatusScreenState();
}

class _AccountStatusScreenState extends ConsumerState<AccountStatusScreen> {
  bool _checking = false;

  Future<void> _recheck() async {
    setState(() => _checking = true);
    await ref.read(authControllerProvider.notifier).refreshSession();
    if (mounted) setState(() => _checking = false);
  }

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    final auth = ref.watch(authControllerProvider);
    final code = auth.error?.code ?? ApiErrorCodes.accountPendingApproval;
    final message = AuthMessage.forCode(code);
    final user = auth.session?.user;

    return AuthScaffold(
      children: [
        AuthStatusView(
          icon: message.icon,
          tone: message.toneOf(c),
          title: message.title,
          body: message.body,
          detail: message.detail,
          primaryLabel: _checking ? 'Checking…' : message.primaryLabel,
          onPrimary: _checking ? null : _recheck,
          secondaryLabel: message.secondaryLabel,
          onSecondary: () =>
              ref.read(authControllerProvider.notifier).signOut(),
        ),
        if (user != null) ...[
          const SizedBox(height: Sp.lg),
          Container(
            padding: const EdgeInsets.all(Sp.md),
            decoration: BoxDecoration(
              color: c.card,
              borderRadius: R.rMd,
              border: Border.all(color: c.border),
            ),
            child: Row(
              children: [
                CircleAvatar(
                  radius: 16,
                  backgroundColor: c.muted,
                  child: Text(
                    user.initials,
                    style: AppTypography.body(
                      size: 12,
                      weight: FontWeight.w700,
                      color: c.mutedForeground,
                    ),
                  ),
                ),
                const SizedBox(width: Sp.md),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        user.fullName,
                        style: AppTypography.body(
                          size: 13.5,
                          weight: FontWeight.w600,
                          color: c.foreground,
                        ),
                      ),
                      Text(
                        [
                          auth.session?.role.label,
                          auth.session?.hotel?.name,
                        ].where((s) => s != null && s.isNotEmpty).join(' · '),
                        style: AppTypography.body(
                          size: 12,
                          color: c.mutedForeground,
                        ),
                      ),
                    ],
                  ),
                ),
              ],
            ),
          ),
        ],
      ],
    );
  }
}
