import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/providers.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/theme/app_spacing.dart';
import '../../../core/theme/app_typography.dart';
import '../auth_copy.dart';
import 'auth_scaffold.dart';

/// Mobile + OTP, or Google. No passwords exist in this product.
class LoginScreen extends ConsumerStatefulWidget {
  const LoginScreen({super.key});

  @override
  ConsumerState<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends ConsumerState<LoginScreen> {
  final _controller = TextEditingController();
  final _formKey = GlobalKey<FormState>();
  bool _submitted = false;

  @override
  void initState() {
    super.initState();
    final remembered = ref.read(authControllerProvider).mobile;
    if (remembered != null) _controller.text = remembered;
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  String? _validate(String? raw) {
    final digits = (raw ?? '').replaceAll(RegExp(r'\D'), '');
    if (digits.isEmpty) return 'Enter your mobile number';
    if (digits.length != 10) return 'Enter the 10-digit number';
    if (!RegExp(r'^[6-9]').hasMatch(digits)) {
      return 'That does not look like an Indian mobile number';
    }
    return null;
  }

  Future<void> _sendOtp() async {
    setState(() => _submitted = true);
    if (!(_formKey.currentState?.validate() ?? false)) return;
    final digits = _controller.text.replaceAll(RegExp(r'\D'), '');
    await ref.read(authControllerProvider.notifier).requestOtp(digits);
  }

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    final auth = ref.watch(authControllerProvider);
    final error = auth.error;

    return AuthScaffold(
      footer: const Text(
        'By continuing you agree to use Tavelo in line with your hotel’s policy.',
      ),
      children: [
        Text(
          'Sign in',
          style: AppTypography.display(size: 26, color: c.foreground),
        ),
        const SizedBox(height: 6),
        Text(
          'Use the mobile number your hotel registered for you.',
          style: AppTypography.body(size: 14, color: c.mutedForeground),
        ),
        const SizedBox(height: Sp.xxl),

        Form(
          key: _formKey,
          autovalidateMode: _submitted
              ? AutovalidateMode.onUserInteraction
              : AutovalidateMode.disabled,
          child: TextFormField(
            controller: _controller,
            enabled: !auth.busy,
            keyboardType: TextInputType.phone,
            textInputAction: TextInputAction.done,
            autofillHints: const [AutofillHints.telephoneNumberNational],
            inputFormatters: [
              FilteringTextInputFormatter.digitsOnly,
              LengthLimitingTextInputFormatter(10),
            ],
            onFieldSubmitted: (_) => _sendOtp(),
            validator: _validate,
            style: AppTypography.numeric(size: 16, color: c.foreground),
            decoration: InputDecoration(
              labelText: 'Mobile number',
              hintText: '98765 43210',
              prefixIcon: const Icon(Icons.phone_iphone_outlined, size: 20),
              prefix: Padding(
                padding: const EdgeInsets.only(right: Sp.sm),
                child: Text(
                  '+91',
                  style: AppTypography.numeric(size: 15, color: c.mutedForeground),
                ),
              ),
            ),
          ),
        ),

        if (error != null && !AuthMessage.isFullScreen(error.code)) ...[
          const SizedBox(height: Sp.md),
          InlineError(message: AuthMessage.inline(error)),
        ],

        const SizedBox(height: Sp.lg),
        FilledButton(
          onPressed: auth.busy ? null : _sendOtp,
          child: auth.busy
              ? const _ButtonSpinner()
              : const Text('Send OTP'),
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
          onPressed: auth.busy
              ? null
              : () =>
                    ref.read(authControllerProvider.notifier).signInWithGoogle(),
          icon: const _GoogleGlyph(),
          label: const Text('Continue with Google'),
        ),

        const SizedBox(height: Sp.lg),
        Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Icon(Icons.shield_outlined, size: 15, color: c.mutedForeground),
            const SizedBox(width: Sp.sm),
            Expanded(
              child: Text(
                'Only accounts created by your hotel can sign in. We never say '
                'whether a number is registered.',
                style: AppTypography.body(size: 11.5, color: c.mutedForeground),
              ),
            ),
          ],
        ),
      ],
    );
  }
}

class _ButtonSpinner extends StatelessWidget {
  const _ButtonSpinner();

  @override
  Widget build(BuildContext context) => SizedBox(
    width: 18,
    height: 18,
    child: CircularProgressIndicator(
      strokeWidth: 2,
      valueColor: AlwaysStoppedAnimation(context.colors.primaryForeground),
    ),
  );
}

/// A small four-colour mark, so the button reads as Google without shipping a
/// network-loaded asset (the app must work offline and under a strict CSP).
class _GoogleGlyph extends StatelessWidget {
  const _GoogleGlyph();

  @override
  Widget build(BuildContext context) => SizedBox(
    width: 18,
    height: 18,
    child: CustomPaint(painter: _GooglePainter()),
  );
}

class _GooglePainter extends CustomPainter {
  static const _blue = Color(0xFF4285F4);
  static const _red = Color(0xFFEA4335);
  static const _yellow = Color(0xFFFBBC05);
  static const _green = Color(0xFF34A853);

  @override
  void paint(Canvas canvas, Size size) {
    final rect = Offset.zero & size;
    final stroke = size.width * 0.24;
    final inner = rect.deflate(stroke / 2);
    final paint = Paint()
      ..style = PaintingStyle.stroke
      ..strokeWidth = stroke
      ..strokeCap = StrokeCap.butt;

    void arc(double startDeg, double sweepDeg, Color color) {
      paint.color = color;
      canvas.drawArc(
        inner,
        startDeg * 3.1415926535 / 180,
        sweepDeg * 3.1415926535 / 180,
        false,
        paint,
      );
    }

    arc(-25, -70, _red);
    arc(-95, -85, _yellow);
    arc(180, -85, _green);
    arc(-25, 70, _blue);

    // The signature horizontal bar.
    canvas.drawRect(
      Rect.fromLTWH(
        size.width * 0.5,
        size.height * 0.42,
        size.width * 0.5,
        stroke * 0.85,
      ),
      Paint()..color = _blue,
    );
  }

  @override
  bool shouldRepaint(covariant CustomPainter oldDelegate) => false;
}
