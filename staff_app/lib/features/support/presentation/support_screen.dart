import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/config/app_config.dart';
import '../../../core/providers.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/theme/app_spacing.dart';
import '../../../core/theme/app_typography.dart';
import '../../../core/widgets/primitives.dart';

/// Help & support — the last entry in every role's More menu.
///
/// It answers the questions the app actually generates ("why can't I see X?",
/// "why can't I sign in?") rather than linking out to a help centre that does
/// not exist. Nothing here is invented: the role, hotel and permission count
/// all come from the live session.
class SupportScreen extends ConsumerWidget {
  const SupportScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final c = context.colors;
    final session = ref.watch(sessionProvider);
    final permissionCount = ref.watch(permissionsProvider).granted.length;

    return PageBody(
      children: [
        const PageHeader(
          eyebrow: 'Support',
          title: 'Help & support',
          subtitle: 'How this app decides what you can see, and who to ask '
              'when it is not what you expect.',
        ),
        gapSection,

        Panel(
          title: 'Common questions',
          padBody: false,
          child: Column(
            children: const [
              _Faq(
                icon: Icons.visibility_off_outlined,
                question: 'A screen I expected is missing',
                answer:
                    'The app shows only what your role is allowed to do. Your '
                    'manager sets the role; nothing on this device changes it. '
                    'If the role is wrong, ask your General Manager to update '
                    'it — the change takes effect the next time you open a '
                    'screen, with no reinstall.',
              ),
              RowDivider(),
              _Faq(
                icon: Icons.hourglass_top_outlined,
                question: 'I cannot sign in yet',
                answer:
                    'A new account waits for approval before its first sign-in. '
                    'Whoever created it can see where it has got to; a General '
                    'Manager or Assistant General Manager approves it.',
              ),
              RowDivider(),
              _Faq(
                icon: Icons.sms_outlined,
                question: 'The one-time code did not arrive',
                answer:
                    'Codes go to the mobile number on your staff record. Check '
                    'that number on your Profile — if it is wrong, only your '
                    'manager can correct it. Wait for the resend timer rather '
                    'than requesting repeatedly; too many requests are throttled.',
              ),
              RowDivider(),
              _Faq(
                icon: Icons.cloud_off_outlined,
                question: 'I was offline while working',
                answer:
                    'Changes you make offline are stored on this device and sent '
                    'when the connection returns. Profile shows how many are '
                    'still waiting. Do not sign out with changes pending — they '
                    'stay on the device until someone signs in again.',
              ),
            ],
          ),
        ),
        gapMd,

        Panel(
          title: 'Who to ask first',
          description: 'In this order — it is usually the fastest route.',
          padBody: false,
          child: Column(
            children: [
              _Step(
                n: '1',
                title: 'Your manager at ${session?.hotel?.name ?? 'your hotel'}',
                detail:
                    'Roles, permissions, mobile numbers and account status are '
                    'all set at the hotel. Almost every access question is '
                    'answered here.',
              ),
              const RowDivider(),
              const _Step(
                n: '2',
                title: 'Your General Manager',
                detail:
                    'Approvals, blocked or suspended accounts, and anything '
                    'that needs a decision rather than a fix.',
              ),
              const RowDivider(),
              _Step(
                n: '3',
                title: 'Tavelo support',
                detail:
                    'If the app itself is misbehaving — a screen that will not '
                    'load, an error that keeps coming back — write to '
                    '${AppConfig.supportEmail} with what you were doing and '
                    'what you saw.',
                copyable: AppConfig.supportEmail,
              ),
            ],
          ),
        ),
        gapMd,

        Panel(
          title: 'This device',
          description: 'Useful when you report a problem.',
          padBody: false,
          child: Column(
            children: [
              _Fact(label: 'App', value: '${AppConfig.appName} staff'),
              const RowDivider(),
              _Fact(label: 'Signed in as', value: session?.role.label ?? '—'),
              const RowDivider(),
              _Fact(
                label: 'Hotel',
                value: session?.hotel?.name ?? '—',
              ),
              const RowDivider(),
              _Fact(
                label: 'Permissions granted',
                value: '$permissionCount',
              ),
            ],
          ),
        ),

        const SizedBox(height: Sp.lg),
        Center(
          child: Text(
            AppConfig.tagline,
            style: AppTypography.body(size: 11.5, color: c.mutedForeground),
          ),
        ),
      ],
    );
  }
}

class _Faq extends StatelessWidget {
  const _Faq({
    required this.icon,
    required this.question,
    required this.answer,
  });

  final IconData icon;
  final String question;
  final String answer;

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    return ExpansionTile(
      shape: const Border(),
      collapsedShape: const Border(),
      tilePadding: const EdgeInsets.symmetric(horizontal: Sp.lg),
      childrenPadding: const EdgeInsets.fromLTRB(Sp.lg, 0, Sp.lg, Sp.md),
      leading: Icon(icon, size: 19, color: c.mutedForeground),
      title: Text(
        question,
        style: AppTypography.body(
          size: 13.5,
          weight: FontWeight.w600,
          color: c.foreground,
        ),
      ),
      children: [
        Align(
          alignment: Alignment.centerLeft,
          child: Text(
            answer,
            style: AppTypography.body(size: 12.5, color: c.mutedForeground),
          ),
        ),
      ],
    );
  }
}

class _Step extends StatelessWidget {
  const _Step({
    required this.n,
    required this.title,
    required this.detail,
    this.copyable,
  });

  final String n;
  final String title;
  final String detail;

  /// When set, a copy button puts this on the clipboard — typing an address
  /// off a screen is exactly where mistakes happen.
  final String? copyable;

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    return Padding(
      padding: Sp.row,
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Container(
            width: 24,
            height: 24,
            decoration: BoxDecoration(color: c.accent, borderRadius: R.rSm),
            alignment: Alignment.center,
            child: Text(
              n,
              style: AppTypography.numeric(
                size: 12,
                weight: FontWeight.w700,
                color: c.accentForeground,
              ),
            ),
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
                const SizedBox(height: 2),
                Text(
                  detail,
                  style: AppTypography.body(
                    size: 12.5,
                    color: c.mutedForeground,
                  ),
                ),
              ],
            ),
          ),
          if (copyable != null)
            IconButton(
              tooltip: 'Copy $copyable',
              icon: const Icon(Icons.copy_all_outlined, size: 17),
              onPressed: () async {
                await Clipboard.setData(ClipboardData(text: copyable!));
                if (!context.mounted) return;
                ScaffoldMessenger.of(context).showSnackBar(
                  SnackBar(content: Text('$copyable copied')),
                );
              },
            ),
        ],
      ),
    );
  }
}

class _Fact extends StatelessWidget {
  const _Fact({required this.label, required this.value});

  final String label;
  final String value;

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    return Padding(
      padding: Sp.row,
      child: Row(
        children: [
          Expanded(
            child: Text(
              label,
              style: AppTypography.body(size: 12.5, color: c.mutedForeground),
            ),
          ),
          Flexible(
            child: Text(
              value,
              textAlign: TextAlign.right,
              overflow: TextOverflow.ellipsis,
              style: AppTypography.body(
                size: 13,
                weight: FontWeight.w600,
                color: c.foreground,
              ),
            ),
          ),
        ],
      ),
    );
  }
}
