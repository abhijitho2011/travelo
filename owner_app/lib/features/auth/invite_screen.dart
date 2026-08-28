import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/api/api_exception.dart';
import '../../core/providers.dart';
import '../../theme/app_theme.dart';
import '../../widgets/auth_shell.dart';

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
      await ref.read(authControllerProvider.notifier).requestOtp(_mobile.text.trim());
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
      setState(() => _error = e.code == 'INVITATION_EXPIRED'
          ? 'This invitation is no longer valid. Contact Tavelo Support for a new one.'
          : 'Incorrect or expired code.');
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
          const Text("You're invited",
              style: TextStyle(fontSize: 26, fontWeight: FontWeight.w800, color: AppColors.ink)),
          const SizedBox(height: 6),
          const Text('Activate your Tavelo account to manage your hotel portfolio.',
              style: TextStyle(color: AppColors.inkMuted, fontSize: 15)),
          const SizedBox(height: 24),
          if (_error != null) ...[
            _err(_error!),
            const SizedBox(height: 16),
          ],
          const Text('Mobile number',
              style: TextStyle(fontWeight: FontWeight.w600, color: AppColors.ink)),
          const SizedBox(height: 8),
          TextField(
            controller: _mobile,
            enabled: !_otpSent && !_busy,
            keyboardType: TextInputType.phone,
            inputFormatters: [
              FilteringTextInputFormatter.digitsOnly,
              LengthLimitingTextInputFormatter(10),
            ],
            decoration: const InputDecoration(prefixText: '+91  ', hintText: 'Registered number'),
          ),
          if (_otpSent) ...[
            const SizedBox(height: 16),
            const Text('OTP', style: TextStyle(fontWeight: FontWeight.w600, color: AppColors.ink)),
            const SizedBox(height: 8),
            TextField(
              controller: _otp,
              enabled: !_busy,
              keyboardType: TextInputType.number,
              inputFormatters: [
                FilteringTextInputFormatter.digitsOnly,
                LengthLimitingTextInputFormatter(6),
              ],
              decoration: const InputDecoration(hintText: 'Enter 6-digit code'),
            ),
          ],
          const SizedBox(height: 20),
          FilledButton(
            onPressed: _busy ? null : (_otpSent ? _activate : _send),
            child: _busy
                ? const SizedBox(
                    width: 20,
                    height: 20,
                    child: CircularProgressIndicator(strokeWidth: 2.4, color: Colors.white),
                  )
                : Text(_otpSent ? 'Activate account' : 'Send OTP'),
          ),
          const SizedBox(height: 16),
          Center(
            child: TextButton(
              onPressed: () => context.go('/login'),
              child: const Text('Back to sign in'),
            ),
          ),
        ],
      ),
    );
  }

  Widget _err(String t) => Container(
        padding: const EdgeInsets.all(14),
        decoration: BoxDecoration(
          color: AppColors.danger.withValues(alpha: 0.07),
          borderRadius: BorderRadius.circular(AppRadius.md),
          border: Border.all(color: AppColors.danger.withValues(alpha: 0.25)),
        ),
        child: Row(children: [
          const Icon(Icons.error_outline, color: AppColors.danger, size: 20),
          const SizedBox(width: 10),
          Expanded(child: Text(t, style: const TextStyle(color: AppColors.ink, fontSize: 13.5))),
        ]),
      );
}
