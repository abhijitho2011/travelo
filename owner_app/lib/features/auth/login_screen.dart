import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/api/api_exception.dart';
import '../../core/config/app_config.dart';
import '../../core/providers.dart';
import '../../core/theme/app_colors.dart';
import '../../core/theme/app_spacing.dart';
import '../../core/theme/app_typography.dart';
import '../../core/widgets/auth_scaffold.dart';
import '../../core/widgets/otp_field.dart';

class LoginScreen extends ConsumerStatefulWidget {
  const LoginScreen({super.key});

  @override
  ConsumerState<LoginScreen> createState() => _LoginScreenState();
}

enum _Step { mobile, otp }

class _LoginScreenState extends ConsumerState<LoginScreen> {
  final _mobile = TextEditingController();
  final _otp = TextEditingController();
  final _otpKey = GlobalKey<OtpFieldState>();
  _Step _step = _Step.mobile;
  bool _busy = false;
  String? _mobileError;
  String? _otpError;
  String? _banner;

  @override
  void dispose() {
    _mobile.dispose();
    _otp.dispose();
    super.dispose();
  }

  bool _validMobile(String v) => RegExp(r'^[6-9]\d{9}$').hasMatch(v.trim());

  Future<void> _sendOtp() async {
    setState(() => _mobileError = null);
    if (!_validMobile(_mobile.text)) {
      setState(() => _mobileError = 'Enter a valid mobile number.');
      return;
    }
    setState(() {
      _busy = true;
      _banner = null;
    });
    try {
      await ref
          .read(authControllerProvider.notifier)
          .requestOtp(_mobile.text.trim());
      if (!mounted) return;
      setState(() => _step = _Step.otp);
    } on ApiException catch (e) {
      setState(
        () => _banner = e.isNetwork
            ? "We couldn't reach Tavelo. Check your connection and try again."
            : e.message,
      );
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _verify() async {
    setState(() => _otpError = null);
    if (_otp.text.trim().length < 6) {
      setState(() => _otpError = 'Enter the 6-digit code.');
      return;
    }
    setState(() {
      _busy = true;
      _banner = null;
    });
    try {
      await ref
          .read(authControllerProvider.notifier)
          .verifyOtp(mobile: _mobile.text.trim(), otp: _otp.text.trim());
      // Router redirects on auth state change.
    } on ApiException catch (e) {
      setState(() {
        switch (e.code) {
          case 'ACCOUNT_SUSPENDED':
            _banner =
                'Your account is currently suspended. Please contact Tavelo Support.';
            break;
          case 'ACCOUNT_BLOCKED':
            _banner =
                'Your account has been blocked. Contact Tavelo Support for assistance.';
            break;
          case 'NETWORK':
            _banner =
                "We couldn't reach Tavelo. Check your connection and try again.";
            break;
          default:
            _otpError = 'Incorrect or expired code.';
        }
      });
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    final onOtp = _step == _Step.otp;

    return AuthScaffold(
      footer: const Text(
        'Manage your entire hotel portfolio from one place.\n'
        'Support · Privacy · Terms',
      ),
      children: [
        Text(
          'Welcome back',
          style: AppTypography.display(size: 26, color: c.foreground),
        ),
        const SizedBox(height: 6),
        Text(
          'Sign in to manage your hotels.',
          style: AppTypography.body(size: 14, color: c.mutedForeground),
        ),
        const SizedBox(height: Sp.xxl),

        if (_banner != null) ...[
          InlineError(message: _banner!),
          const SizedBox(height: Sp.lg),
        ],

        TextField(
          controller: _mobile,
          enabled: !onOtp && !_busy,
          autofocus: true,
          keyboardType: TextInputType.phone,
          textInputAction: TextInputAction.done,
          autofillHints: const [AutofillHints.telephoneNumberNational],
          style: AppTypography.numeric(size: 16, color: c.foreground),
          inputFormatters: [
            FilteringTextInputFormatter.digitsOnly,
            LengthLimitingTextInputFormatter(10),
          ],
          decoration: InputDecoration(
            labelText: 'Mobile number',
            hintText: '98765 43210',
            errorText: _mobileError,
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
          onSubmitted: (_) => _sendOtp(),
        ),

        if (onOtp) ...[
          const SizedBox(height: Sp.xl),
          Row(
            children: [
              Expanded(
                child: Text(
                  'Enter the 6-digit code',
                  style: AppTypography.body(
                    size: 13.5,
                    weight: FontWeight.w600,
                    color: c.foreground,
                  ),
                ),
              ),
              TextButton(
                onPressed: _busy
                    ? null
                    : () => setState(() {
                        _step = _Step.mobile;
                        _otp.clear();
                        _otpKey.currentState?.clear();
                        _otpError = null;
                      }),
                child: const Text('Change number'),
              ),
            ],
          ),
          const SizedBox(height: Sp.sm),
          OtpField(
            key: _otpKey,
            length: 6,
            enabled: !_busy,
            hasError: _otpError != null,
            // Submitting stays on the button, as it always has here — the code
            // is only remembered as it is typed.
            onChanged: (v) => setState(() {
              _otp.text = v;
              if (_otpError != null) _otpError = null;
            }),
            onCompleted: (v) => _otp.text = v,
          ),
          if (_otpError != null) ...[
            const SizedBox(height: Sp.md),
            InlineError(message: _otpError!),
          ],
        ],

        const SizedBox(height: Sp.xl),
        FilledButton(
          onPressed: _busy ? null : (onOtp ? _verify : _sendOtp),
          child: _busy
              ? const ButtonSpinner()
              : Text(onOtp ? 'Sign in' : 'Send OTP'),
        ),

        const SizedBox(height: Sp.xl),
        Row(
          children: [
            Expanded(child: Divider(color: c.border)),
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: Sp.md),
              child: Text(
                'or',
                style: AppTypography.body(size: 12, color: c.mutedForeground),
              ),
            ),
            Expanded(child: Divider(color: c.border)),
          ],
        ),
        const SizedBox(height: Sp.xl),

        OutlinedButton.icon(
          onPressed: _busy ? null : _google,
          icon: const GoogleGlyph(),
          label: const Text('Continue with Google'),
        ),

        const SizedBox(height: Sp.lg),
        Center(
          child: TextButton(
            onPressed: () => context.push('/invite'),
            child: const Text('Have an invitation? Activate your account'),
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
                'Only owner accounts created by ${AppConfig.appName} can sign in. '
                'We never say whether a number is registered.',
                style: AppTypography.body(size: 11.5, color: c.mutedForeground),
              ),
            ),
          ],
        ),
      ],
    );
  }

  Future<void> _google() async {
    setState(() {
      _busy = true;
      _banner = null;
    });
    try {
      await ref.read(authControllerProvider.notifier).signInWithGoogle();
      // Router redirects on auth state change.
    } on ApiException catch (e) {
      if (e.code == 'CANCELLED') return;
      setState(() {
        switch (e.code) {
          case 'ACCOUNT_SUSPENDED':
            _banner =
                'Your account is currently suspended. Please contact Tavelo Support.';
            break;
          case 'ACCOUNT_BLOCKED':
            _banner =
                'Your account has been blocked. Contact Tavelo Support for assistance.';
            break;
          case 'OWNER_NOT_FOUND':
          case 'NOT_FOUND':
            _banner =
                'This Google account is not registered with Tavelo. Ask your Tavelo administrator for an invitation.';
            break;
          case 'NETWORK':
            _banner =
                "We couldn't reach Tavelo. Check your connection and try again.";
            break;
          default:
            _banner = 'Google sign-in failed. Please try again.';
        }
      });
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }
}
