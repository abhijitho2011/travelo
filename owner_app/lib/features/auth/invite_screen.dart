import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/api/api_exception.dart';
import '../../core/providers.dart';
import '../../core/theme/app_colors.dart';
import '../../core/theme/app_spacing.dart';
import '../../core/theme/app_typography.dart';
import '../../core/widgets/auth_scaffold.dart';
import '../../core/widgets/otp_field.dart';

/// Invitation acceptance / account activation. Owner accounts are created by
/// the Super Admin; the owner activates via mobile + OTP.
class InviteScreen extends ConsumerStatefulWidget {
  const InviteScreen({super.key});
  @override
  ConsumerState<InviteScreen> createState() => _InviteScreenState();
}

class _InviteScreenState extends ConsumerState<InviteScreen> {
  final _mobile = TextEditingController();
  final _otp = TextEditingController();
  final _otpKey = GlobalKey<OtpFieldState>();
  bool _otpSent = false;
  bool _busy = false;
  String? _error;

  @override
  void dispose() {
    _mobile.dispose();
    _otp.dispose();
    super.dispose();
  }

  Future<void> _send() async {
    if (!RegExp(r'^[6-9]\d{9}$').hasMatch(_mobile.text.trim())) {
      setState(() => _error = 'Enter a valid mobile number.');
      return;
    }
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      await ref
          .read(authControllerProvider.notifier)
          .requestOtp(_mobile.text.trim());
      setState(() => _otpSent = true);
    } on ApiException catch (e) {
      setState(() => _error = e.message);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _activate() async {
    if (_otp.text.trim().length < 6) {
      setState(() => _error = 'Enter the 6-digit code.');
      return;
    }
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      await ref
          .read(authControllerProvider.notifier)
          .verifyOtp(mobile: _mobile.text.trim(), otp: _otp.text.trim());
      // Router redirects to dashboard on auth.
    } on ApiException catch (e) {
      setState(
        () => _error = e.code == 'INVITATION_EXPIRED'
            ? 'This invitation is no longer valid. Contact Tavelo Support for a new one.'
            : 'Incorrect or expired code.',
      );
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final c = context.colors;

    return AuthScaffold(
      children: [
        Text(
          "You're invited",
          style: AppTypography.display(size: 26, color: c.foreground),
        ),
        const SizedBox(height: 6),
        Text(
          'Activate your Tavelo account to manage your hotel portfolio.',
          style: AppTypography.body(size: 14, color: c.mutedForeground),
        ),
        const SizedBox(height: Sp.xxl),

        if (_error != null) ...[
          InlineError(message: _error!),
          const SizedBox(height: Sp.lg),
        ],

        TextField(
          controller: _mobile,
          enabled: !_otpSent && !_busy,
          keyboardType: TextInputType.phone,
          autofillHints: const [AutofillHints.telephoneNumberNational],
          style: AppTypography.numeric(size: 16, color: c.foreground),
          inputFormatters: [
            FilteringTextInputFormatter.digitsOnly,
            LengthLimitingTextInputFormatter(10),
          ],
          decoration: InputDecoration(
            labelText: 'Mobile number',
            hintText: 'Registered number',
            prefixIcon: const Icon(Icons.phone_iphone_outlined, size: 20),
            prefix: Padding(
              padding: const EdgeInsets.only(right: Sp.sm),
              child: Text(
                '+91',
                style: AppTypography.numeric(
                  size: 15,
                  color: c.mutedForeground,
                ),
              ),
            ),
          ),
        ),

        if (_otpSent) ...[
          const SizedBox(height: Sp.xl),
          Text(
            'Enter the 6-digit code',
            style: AppTypography.body(
              size: 13.5,
              weight: FontWeight.w600,
              color: c.foreground,
            ),
          ),
          const SizedBox(height: Sp.sm),
          OtpField(
            key: _otpKey,
            length: 6,
            enabled: !_busy,
            hasError: _error != null,
            onChanged: (v) => _otp.text = v,
            onCompleted: (v) => _otp.text = v,
          ),
        ],

        const SizedBox(height: Sp.xl),
        FilledButton(
          onPressed: _busy ? null : (_otpSent ? _activate : _send),
          child: _busy
              ? const ButtonSpinner()
              : Text(_otpSent ? 'Activate account' : 'Send OTP'),
        ),
        const SizedBox(height: Sp.md),
        Center(
          child: TextButton(
            onPressed: () => context.go('/login'),
            child: const Text('Back to sign in'),
          ),
        ),
      ],
    );
  }
}
