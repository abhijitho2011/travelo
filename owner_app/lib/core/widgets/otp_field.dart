import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../theme/app_colors.dart';
import '../theme/app_spacing.dart';
import '../theme/app_typography.dart';

/// Six separate boxes backed by one hidden field.
///
/// Using a single [TextField] under the boxes keeps SMS autofill, paste and
/// hardware keyboards working, which per-box fields notoriously break.
class OtpField extends StatefulWidget {
  const OtpField({
    super.key,
    required this.length,
    required this.onCompleted,
    this.onChanged,
    this.hasError = false,
    this.enabled = true,
    this.autofocus = true,
  });

  final int length;
  final ValueChanged<String> onCompleted;
  final ValueChanged<String>? onChanged;
  final bool hasError;
  final bool enabled;
  final bool autofocus;

  @override
  State<OtpField> createState() => OtpFieldState();
}

class OtpFieldState extends State<OtpField> {
  final _controller = TextEditingController();
  final _focus = FocusNode();

  String get value => _controller.text;

  /// Lets the parent wipe the boxes after a rejected code.
  void clear() {
    _controller.clear();
    setState(() {});
    _focus.requestFocus();
  }

  @override
  void dispose() {
    _controller.dispose();
    _focus.dispose();
    super.dispose();
  }

  void _onChanged(String raw) {
    final digits = raw.replaceAll(RegExp(r'\D'), '');
    if (digits != raw) {
      _controller.value = TextEditingValue(
        text: digits,
        selection: TextSelection.collapsed(offset: digits.length),
      );
    }
    setState(() {});
    widget.onChanged?.call(digits);
    if (digits.length == widget.length) {
      _focus.unfocus();
      widget.onCompleted(digits);
    }
  }

  @override
  Widget build(BuildContext context) {
    final chars = _controller.text.split('');

    return Stack(
      children: [
        // The real input, kept invisible but focusable and autofill-capable.
        Opacity(
          opacity: 0,
          child: SizedBox(
            height: 58,
            child: TextField(
              controller: _controller,
              focusNode: _focus,
              autofocus: widget.autofocus,
              enabled: widget.enabled,
              keyboardType: TextInputType.number,
              autofillHints: const [AutofillHints.oneTimeCode],
              maxLength: widget.length,
              inputFormatters: [
                FilteringTextInputFormatter.digitsOnly,
                LengthLimitingTextInputFormatter(widget.length),
              ],
              onChanged: _onChanged,
              decoration: const InputDecoration(counterText: ''),
            ),
          ),
        ),
        GestureDetector(
          onTap: widget.enabled ? () => _focus.requestFocus() : null,
          behavior: HitTestBehavior.opaque,
          child: Semantics(
            label: 'Verification code, ${widget.length} digits',
            textField: true,
            child: Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                for (var i = 0; i < widget.length; i++)
                  Expanded(
                    child: Padding(
                      padding: EdgeInsets.only(
                        right: i == widget.length - 1 ? 0 : Sp.sm,
                      ),
                      child: _Box(
                        char: i < chars.length ? chars[i] : '',
                        focused:
                            _focus.hasFocus &&
                            i == chars.length.clamp(0, widget.length - 1),
                        hasError: widget.hasError,
                        enabled: widget.enabled,
                      ),
                    ),
                  ),
              ],
            ),
          ),
        ),
      ],
    );
  }
}

class _Box extends StatelessWidget {
  const _Box({
    required this.char,
    required this.focused,
    required this.hasError,
    required this.enabled,
  });

  final String char;
  final bool focused;
  final bool hasError;
  final bool enabled;

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    final border = hasError
        ? c.destructive
        : focused
        ? c.ring
        : c.input;

    return AnimatedContainer(
      duration: const Duration(milliseconds: 140),
      height: 58,
      alignment: Alignment.center,
      decoration: BoxDecoration(
        color: enabled ? c.card : c.muted,
        borderRadius: R.rMd,
        border: Border.all(color: border, width: focused || hasError ? 1.7 : 1),
      ),
      child: Text(
        char,
        style: AppTypography.kpi(
          size: 24,
          color: hasError ? c.destructive : c.foreground,
        ),
      ),
    );
  }
}
