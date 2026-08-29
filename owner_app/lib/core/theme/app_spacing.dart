import 'package:flutter/widgets.dart';

/// HF's spacing rhythm and radii, expressed once.
///
/// `--radius: 0.875rem` (14px) is the `lg` radius; the css derives sm/md/xl
/// from it with the same ±4/±2 offsets reproduced here.
class Sp {
  Sp._();

  static const double xxs = 2;
  static const double xs = 4;
  static const double sm = 8;
  static const double md = 12;
  static const double lg = 16;
  static const double xl = 20;
  static const double xxl = 24;
  static const double section = 20; // HF `space-y-5`

  /// Page gutter: `p-4 sm:p-6`.
  static const EdgeInsets page = EdgeInsets.all(16);
  static const EdgeInsets pageWide = EdgeInsets.all(24);

  /// Card body: `p-4`.
  static const EdgeInsets card = EdgeInsets.all(16);

  /// Panel header: `px-4 py-3`.
  static const EdgeInsets panelHeader = EdgeInsets.symmetric(
    horizontal: 16,
    vertical: 12,
  );

  /// List row: `px-4 py-3`.
  static const EdgeInsets row = EdgeInsets.symmetric(
    horizontal: 16,
    vertical: 12,
  );
}

class R {
  R._();

  static const double sm = 10; // calc(var(--radius) - 4px)
  static const double md = 12; // calc(var(--radius) - 2px)
  static const double lg = 14; // var(--radius)
  static const double xl = 18; // calc(var(--radius) + 4px)
  static const double xxl = 22; // calc(var(--radius) + 8px)
  static const double pill = 999;

  static const BorderRadius rSm = BorderRadius.all(Radius.circular(sm));
  static const BorderRadius rMd = BorderRadius.all(Radius.circular(md));
  static const BorderRadius rLg = BorderRadius.all(Radius.circular(lg));
  static const BorderRadius rXl = BorderRadius.all(Radius.circular(xl));
  static const BorderRadius rPill = BorderRadius.all(Radius.circular(pill));
}

/// Minimum touch target for the roles that use this app on their feet — the HF
/// attendant screen sizes every control at `min-h-11` (44px).
const double kTouchTarget = 44;

/// The widest a content column ever gets, so the app reads well on a desktop
/// browser as well as a phone.
const double kMaxContentWidth = 1120;
