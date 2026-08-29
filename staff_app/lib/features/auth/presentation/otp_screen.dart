import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/config/app_config.dart';
import '../../../core/networking/api_exception.dart';
import '../../../core/providers.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/theme/app_spacing.dart';
import '../../../core/theme/app_typography.dart';
import '../../../core/widgets/otp_field.dart';
import '../auth_copy.dart';
import 'auth_scaffold.dart';

class OtpScreen extends ConsumerStatefulWidget {
  const OtpScreen({super.key});

  @override
  ConsumerState<OtpScreen> createState() => _OtpScreenState();
}

class _OtpScreenState extends ConsumerState<OtpScreen> {
  final _fieldKey = GlobalKey<OtpFieldState>();
  Timer? _ticker;
  Duration _validFor = Duration.zero;
  Duration _resendIn = Duration.zero;

  @override
  void initState() {
    super.initState();
    _ticker = Timer.periodic(const Duration(seconds: 1), (_) => _tick());
    WidgetsBinding.instance.addPostFrameCallback((_) => _tick());
  }

  @override
  void dispose() {
    _ticker?.cancel();
    super.dispose();
  }

  void _tick() {
    if (!mounted) return;
    final auth = ref.read(authControllerProvider);
    final now = DateTime.now();
    setState(() {
      _validFor = auth.otpExpiresAt?.difference(now) ?? Duration.zero;
      _resendIn = auth.resendAvailableAt?.difference(now) ?? Duration.zero;
      if (_validFor.isNegative) _validFor = Duration.zero;
      if (_resendIn.isNegative) _resendIn = Duration.zero;
    });
  }

  String _fmt(Duration d) {
    final m = d.inMinutes.remainder(60).toString().padLeft(2, '0');
    final s = d.inSeconds.remainder(60).toString().padLeft(2, '0');
    return '$m:$s';
  }

  Future<void> _verify(String code) async {
    await ref.read(authControllerProvider.notifier).verifyOtp(code);
    final error = ref.read(authControllerProvider).error;
    if (error != null && mounted) _fieldKey.currentState?.clear();
  }

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    final auth = ref.watch(authControllerProvider);
    final controller = ref.read(authControllerProvider.notifier);
    final error = auth.error;
    final expired = _validFor == Duration.zero && auth.otpExpiresAt != null;
    final hasFieldError =
        error != null &&
        (error.code == ApiErrorCodes.invalidOtp ||
            error.code == ApiErrorCodes.otpExpired);

    final masked = _mask(auth.mobile);

    return AuthScaffold(
      children: [
        Align(
          alignment: Alignment.centerLeft,
          child: TextButton.icon(
            onPressed: controller.changeNumber,
            icon: const Icon(Icons.arrow_back, size: 16),
            label: const Text('Change number'),
          ),
        ),
        const SizedBox(height: Sp.md),
        Text(
          'Enter the code',
          style: AppTypography.display(size: 26, color: c.foreground),
        ),
        const SizedBox(height: 6),
        Text.rich(
          TextSpan(
            style: AppTypography.body(size: 14, color: c.mutedForeground),
            children: [
              const TextSpan(text: 'We sent a 6-digit code to '),
              TextSpan(
                text: masked,
                style: AppTypography.numeric(
                  size: 14,
                  weight: FontWeight.w700,
                  color: c.foreground,
                ),
              ),
              const TextSpan(text: '.'),
            ],
          ),
        ),
        const SizedBox(height: Sp.xxl),

        OtpField(
          key: _fieldKey,
          length: AppConfig.otpLength,
          enabled: !auth.busy && !expired,
          hasError: hasFieldError,
          onCompleted: _verify,
          // Clear the previous failure as soon as the user edits.
          onChanged: (_) => controller.clearError(),
        ),

        if (error != null && !AuthMessage.isFullScreen(error.code)) ...[
          const SizedBox(height: Sp.md),
          InlineError(message: AuthMessage.inline(error)),
        ],

        const SizedBox(height: Sp.lg),

        if (expired)
          Container(
            padding: const EdgeInsets.all(Sp.md),
            decoration: BoxDecoration(
              color: c.warning.withValues(alpha: 0.1),
              borderRadius: R.rMd,
              border: Border.all(color: c.warning.withValues(alpha: 0.3)),
            ),
            child: Row(
              children: [
                Icon(Icons.timer_off_outlined, size: 16, color: c.warning),
                const SizedBox(width: Sp.sm),
                Expanded(
                  child: Text(
                    'That code has expired. Request a new one to continue.',
                    style: AppTypography.body(size: 12.5, color: c.warning),
                  ),
                ),
              ],
            ),
          )
        else
          Row(
            children: [
              Icon(Icons.schedule, size: 15, color: c.mutedForeground),
              const SizedBox(width: 6),
              Text(
                'Code expires in ${_fmt(_validFor)}',
                style: AppTypography.numeric(
                  size: 12.5,
                  color: c.mutedForeground,
                ),
              ),
            ],
          ),

        const SizedBox(height: Sp.lg),
        FilledButton(
          onPressed: auth.busy || expired
              ? null
              : () {
                  final value = _fieldKey.currentState?.value ?? '';
                  if (value.length == AppConfig.otpLength) _verify(value);
                },
          child: auth.busy
              ? SizedBox(
                  width: 18,
                  height: 18,
                  child: CircularProgressIndicator(
                    strokeWidth: 2,
                    valueColor: AlwaysStoppedAnimation(c.primaryForeground),
                  ),
                )
              : const Text('Verify and continue'),
        ),
        const SizedBox(height: Sp.sm),
        TextButton(
          onPressed: _resendIn > Duration.zero || auth.busy
              ? null
              : () {
                  _fieldKey.currentState?.clear();
                  controller.requestOtp(auth.mobile!);
                },
          child: Text(
            _resendIn > Duration.zero
                ? 'Resend code in ${_fmt(_resendIn)}'
                : 'Resend code',
          ),
        ),
      ],
    );
  }

  static String _mask(String? mobile) {
    if (mobile == null || mobile.length < 4) return 'your number';
    final tail = mobile.substring(mobile.length - 4);
    return '+91 ••••• •$tail';
  }
}
