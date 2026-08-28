import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/api/api_exception.dart';
import '../../core/providers.dart';
import '../../theme/app_theme.dart';
import '../../widgets/auth_shell.dart';

class LoginScreen extends ConsumerStatefulWidget {
  const LoginScreen({super.key});

  @override
  ConsumerState<LoginScreen> createState() => _LoginScreenState();
}

enum _Step { mobile, otp }

class _LoginScreenState extends ConsumerState<LoginScreen> {
  final _mobile = TextEditingController();
  final _otp = TextEditingController();
  _Step _step = _Step.mobile;
  bool _busy = false;
  bool _obscure = true;
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
      await ref.read(authControllerProvider.notifier).requestOtp(_mobile.text.trim());
      if (!mounted) return;
      setState(() => _step = _Step.otp);
    } on ApiException catch (e) {
      setState(() => _banner = e.isNetwork
          ? "We couldn't reach Travelo. Check your connection and try again."
          : e.message);
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
            _banner = 'Your account is currently suspended. Please contact Travelo Support.';
            break;
          case 'ACCOUNT_BLOCKED':
            _banner = 'Your account has been blocked. Contact Travelo Support for assistance.';
            break;
          case 'NETWORK':
            _banner = "We couldn't reach Travelo. Check your connection and try again.";
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
    return AuthShell(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          const Text(
            'Welcome back',
            style: TextStyle(fontSize: 28, fontWeight: FontWeight.w800, color: AppColors.ink),
          ),
          const SizedBox(height: 6),
          const Text(
            'Sign in to manage your hotels.',
            style: TextStyle(color: AppColors.inkMuted, fontSize: 15),
          ),
          const SizedBox(height: 28),
          if (_banner != null) ...[
            _InlineBanner(text: _banner!),
            const SizedBox(height: 16),
          ],
          _label('Mobile number'),
          const SizedBox(height: 8),
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Expanded(
                child: TextField(
                  controller: _mobile,
                  enabled: _step == _Step.mobile && !_busy,
                  keyboardType: TextInputType.phone,
                  inputFormatters: [
                    FilteringTextInputFormatter.digitsOnly,
                    LengthLimitingTextInputFormatter(10),
                  ],
                  decoration: InputDecoration(
                    hintText: '98••• •••92',
                    prefixText: '+91  ',
                    errorText: _mobileError,
                  ),
                  onSubmitted: (_) => _sendOtp(),
                ),
              ),
              if (_step == _Step.mobile) ...[
                const SizedBox(width: 10),
                SizedBox(
                  height: 52,
                  child: OutlinedButton(
                    onPressed: _busy ? null : _sendOtp,
                    child: _busy
                        ? const _Spin()
                        : const Text('Send OTP'),
                  ),
                ),
              ],
            ],
          ),
          if (_step == _Step.otp) ...[
            const SizedBox(height: 18),
            Row(
              children: [
                _label('OTP'),
                const Spacer(),
                TextButton(
                  onPressed: _busy
                      ? null
                      : () => setState(() {
                            _step = _Step.mobile;
                            _otp.clear();
                            _otpError = null;
                          }),
                  child: const Text('Change number'),
                ),
              ],
            ),
            const SizedBox(height: 8),
            TextField(
              controller: _otp,
              enabled: !_busy,
              obscureText: _obscure,
              keyboardType: TextInputType.number,
              inputFormatters: [
                FilteringTextInputFormatter.digitsOnly,
                LengthLimitingTextInputFormatter(6),
              ],
              decoration: InputDecoration(
                hintText: 'Enter 6-digit code',
                errorText: _otpError,
                suffixIcon: IconButton(
                  icon: Icon(_obscure ? Icons.visibility_off : Icons.visibility),
                  onPressed: () => setState(() => _obscure = !_obscure),
                ),
              ),
              onSubmitted: (_) => _verify(),
            ),
          ],
          const SizedBox(height: 20),
          FilledButton(
            onPressed: _busy ? null : (_step == _Step.mobile ? _sendOtp : _verify),
            child: _busy
                ? const _Spin(light: true)
                : Text(_step == _Step.mobile ? 'Continue' : 'Sign in'),
          ),
          const SizedBox(height: 16),
          Row(
            children: const [
              Expanded(child: Divider()),
              Padding(
                padding: EdgeInsets.symmetric(horizontal: 12),
                child: Text('or', style: TextStyle(color: AppColors.inkFaint)),
              ),
              Expanded(child: Divider()),
            ],
          ),
          const SizedBox(height: 16),
          OutlinedButton.icon(
            onPressed: _busy ? null : () => _notReady('Google sign-in'),
            icon: const Icon(Icons.g_mobiledata, size: 28),
            label: const Text('Continue with Google'),
          ),
          const SizedBox(height: 20),
          Center(
            child: TextButton(
              onPressed: () => context.push('/invite'),
              child: const Text('Have an invitation? Activate your account'),
            ),
          ),
        ],
      ),
    );
  }

  void _notReady(String what) {
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(content: Text('$what is coming soon.')),
    );
  }

  Widget _label(String t) => Text(
        t,
        style: const TextStyle(
          fontWeight: FontWeight.w600,
          color: AppColors.ink,
          fontSize: 14,
        ),
      );
}

class _InlineBanner extends StatelessWidget {
  const _InlineBanner({required this.text});
  final String text;
  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: AppColors.danger.withValues(alpha: 0.07),
        borderRadius: BorderRadius.circular(AppRadius.md),
        border: Border.all(color: AppColors.danger.withValues(alpha: 0.25)),
      ),
      child: Row(
        children: [
          const Icon(Icons.error_outline, color: AppColors.danger, size: 20),
          const SizedBox(width: 10),
          Expanded(
            child: Text(text,
                style: const TextStyle(color: AppColors.ink, fontSize: 13.5, height: 1.4)),
          ),
        ],
      ),
    );
  }
}

class _Spin extends StatelessWidget {
  const _Spin({this.light = false});
  final bool light;
  @override
  Widget build(BuildContext context) => SizedBox(
        width: 20,
        height: 20,
        child: CircularProgressIndicator(
          strokeWidth: 2.4,
          color: light ? Colors.white : AppColors.primary,
        ),
      );
}
