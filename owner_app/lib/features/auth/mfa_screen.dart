import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/api/api_exception.dart';
import '../../core/providers.dart';
import '../../core/theme/app_colors.dart';
import '../../core/theme/app_spacing.dart';
import '../../core/theme/app_typography.dart';
import '../../core/widgets/auth_scaffold.dart';
import '../../core/widgets/otp_field.dart';

/// The second factor, for an owner who has enrolled an authenticator.
///
/// Reached only from a pending challenge: the first factor (OTP or Google)
/// passed, the server answered `mfaRequired`, and no session exists until the
/// code here clears it. A recovery code — one of the eight handed out at
/// enrolment — is accepted in place of the six-digit TOTP, for the phone that
/// was lost.
class MfaScreen extends ConsumerStatefulWidget {
  const MfaScreen({super.key});

  @override
  ConsumerState<MfaScreen> createState() => _MfaScreenState();
}

class _MfaScreenState extends ConsumerState<MfaScreen> {
  final _totpKey = GlobalKey<OtpFieldState>();
  final _recovery = TextEditingController();
  String _totp = '';
  bool _useRecovery = false;
  bool _busy = false;
  String? _error;

  @override
  void dispose() {
    _recovery.dispose();
    super.dispose();
  }

  String get _code => _useRecovery ? _recovery.text.trim() : _totp.trim();

  Future<void> _submit() async {
    setState(() => _error = null);
    if (_useRecovery ? _code.length < 6 : _code.length < 6) {
      setState(
        () => _error = _useRecovery
            ? 'Enter one of your recovery codes.'
            : 'Enter the 6-digit code from your authenticator.',
      );
      return;
    }
    setState(() => _busy = true);
    try {
      await ref.read(authControllerProvider.notifier).completeMfa(_code);
      // Router redirects on auth state change.
    } on ApiException catch (e) {
      setState(() {
        switch (e.code) {
          case 'NETWORK':
            _error =
                "We couldn't reach Tavelo. Check your connection and try again.";
          case 'MFA_CHALLENGE_EXPIRED':
          case 'TOKEN_EXPIRED':
            _error =
                'This sign-in has expired. Start again from the sign-in screen.';
          default:
            _error = _useRecovery
                ? 'That recovery code was not accepted. Each one works only once.'
                : 'Incorrect or expired code. Codes change every 30 seconds.';
        }
      });
      _totpKey.currentState?.clear();
      _totp = '';
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  void _cancel() => ref.read(authControllerProvider.notifier).cancelMfa();

  @override
  Widget build(BuildContext context) {
    final c = context.colors;

    return AuthScaffold(
      footer: const Text('Two-step verification keeps your hotels yours.'),
      children: [
        Text(
          'Two-step verification',
          style: AppTypography.display(size: 26, color: c.foreground),
        ),
        const SizedBox(height: 6),
        Text(
          _useRecovery
              ? 'Enter one of the recovery codes you saved when you set this up.'
              : 'Enter the code from your authenticator app to finish signing in.',
          style: AppTypography.body(size: 14, color: c.mutedForeground),
        ),
        const SizedBox(height: Sp.xxl),

        if (_error != null) ...[
          InlineError(message: _error!),
          const SizedBox(height: Sp.lg),
        ],

        if (_useRecovery)
          TextField(
            controller: _recovery,
            enabled: !_busy,
            autofocus: true,
            textInputAction: TextInputAction.done,
            autocorrect: false,
            enableSuggestions: false,
            textCapitalization: TextCapitalization.characters,
            style: AppTypography.numeric(size: 16, color: c.foreground),
            inputFormatters: [LengthLimitingTextInputFormatter(32)],
            decoration: const InputDecoration(
              labelText: 'Recovery code',
              hintText: 'XXXX-XXXX',
              prefixIcon: Icon(Icons.key_outlined, size: 20),
            ),
            onSubmitted: (_) => _submit(),
          )
        else
          OtpField(
            key: _totpKey,
            length: 6,
            enabled: !_busy,
            hasError: _error != null,
            onChanged: (v) => setState(() {
              _totp = v;
              if (_error != null) _error = null;
            }),
            // Six digits typed is the whole intent; submit without a second tap.
            onCompleted: (v) {
              _totp = v;
              _submit();
            },
          ),

        const SizedBox(height: Sp.xl),
        FilledButton(
          onPressed: _busy ? null : _submit,
          child: _busy ? const ButtonSpinner() : const Text('Verify'),
        ),

        const SizedBox(height: Sp.lg),
        Center(
          child: TextButton(
            onPressed: _busy
                ? null
                : () => setState(() {
                    _useRecovery = !_useRecovery;
                    _error = null;
                  }),
            child: Text(
              _useRecovery
                  ? 'Use my authenticator app instead'
                  : 'Lost your phone? Use a recovery code',
            ),
          ),
        ),
        Center(
          child: TextButton(
            onPressed: _busy ? null : _cancel,
            child: const Text('Back to sign in'),
          ),
        ),

        const SizedBox(height: Sp.sm),
        Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Icon(Icons.shield_outlined, size: 15, color: c.mutedForeground),
            const SizedBox(width: Sp.sm),
            Expanded(
              child: Text(
                'You are not signed in yet. Nothing in your account can be '
                'reached until this step is complete.',
                style: AppTypography.body(size: 11.5, color: c.mutedForeground),
              ),
            ),
          ],
        ),
      ],
    );
  }
}
