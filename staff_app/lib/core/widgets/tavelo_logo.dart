import 'package:flutter/widgets.dart';
import 'package:flutter_svg/flutter_svg.dart';

/// The Tavelo brand marks, straight from the design-system SVGs.
///
/// The artwork carries its own two brand colours (green `#006847` + accent
/// `#23A926`), so it is never tinted — it renders identically in light and dark.
/// Use [TaveloLogo] for the full wordmark (sign-in, splash) and [TaveloMark]
/// for the compact leaf mark (app bars, tight spaces).
class TaveloLogo extends StatelessWidget {
  const TaveloLogo({super.key, this.height = 32});

  final double height;

  @override
  Widget build(BuildContext context) {
    return SvgPicture.asset(
      'assets/brand/tavelo-logo.svg',
      height: height,
      semanticsLabel: 'Tavelo',
    );
  }
}

class TaveloMark extends StatelessWidget {
  const TaveloMark({super.key, this.size = 28});

  final double size;

  @override
  Widget build(BuildContext context) {
    return SvgPicture.asset(
      'assets/brand/tavelo-mark.svg',
      height: size,
      semanticsLabel: 'Tavelo',
    );
  }
}
