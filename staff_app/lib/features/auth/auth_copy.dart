import 'package:flutter/material.dart';

import '../../core/networking/api_exception.dart';
import '../../core/theme/app_colors.dart';

/// One place for every message the auth flow shows.
///
/// The copy is deliberately non-committal about whether an account exists —
/// `INVALID_OTP` is also what the server returns for an unknown number, and
/// this wording never contradicts that.
class AuthMessage {
  const AuthMessage({
    required this.title,
    required this.body,
    required this.icon,
    required this.toneOf,
    this.detail,
    this.primaryLabel,
    this.secondaryLabel,
  });

  final String title;
  final String body;
  final String? detail;
  final IconData icon;
  final Color Function(AppColors) toneOf;
  final String? primaryLabel;
  final String? secondaryLabel;

  /// Full-screen treatment for the account-status and hard-failure codes.
  static AuthMessage forCode(String code) => switch (code) {
    ApiErrorCodes.accountPendingApproval => AuthMessage(
      title: 'Waiting for approval',
      body:
          'Your account has been created but is waiting for approval from your '
          'General Manager or Assistant General Manager.',
      detail:
          'You will be able to sign in as soon as they approve you. If it is '
          'taking longer than expected, ask your manager to check the Team '
          'screen in their Tavelo app.',
      icon: Icons.hourglass_top_outlined,
      toneOf: (c) => c.warning,
      primaryLabel: 'Check again',
      secondaryLabel: 'Sign in with a different number',
    ),
    ApiErrorCodes.accountInvited => AuthMessage(
      title: 'Finish setting up your account',
      body:
          'You have been invited to Tavelo but your account has not been '
          'activated yet.',
      detail:
          'Ask your manager to complete your profile, then sign in again with '
          'this number.',
      icon: Icons.mark_email_unread_outlined,
      toneOf: (c) => c.stOccupied,
      primaryLabel: 'Check again',
      secondaryLabel: 'Sign in with a different number',
    ),
    ApiErrorCodes.accountBlocked => AuthMessage(
      title: 'Account blocked',
      body:
          'Your account has been blocked. You cannot sign in to Tavelo right '
          'now.',
      detail:
          'Speak to your General Manager if you think this is a mistake. For '
          'your security we cannot say more here.',
      icon: Icons.block_outlined,
      toneOf: (c) => c.critical,
      secondaryLabel: 'Back to sign in',
    ),
    ApiErrorCodes.accountSuspended => AuthMessage(
      title: 'Account suspended',
      body:
          'Your account is suspended, so access to Tavelo is paused.',
      detail:
          'Your General Manager can lift the suspension. Nothing you have '
          'already recorded has been lost.',
      icon: Icons.pause_circle_outline,
      toneOf: (c) => c.warning,
      primaryLabel: 'Check again',
      secondaryLabel: 'Back to sign in',
    ),
    ApiErrorCodes.accountDeactivated => AuthMessage(
      title: 'Account deactivated',
      body:
          'This account has been deactivated and can no longer be used to sign '
          'in.',
      detail:
          'If you have rejoined the hotel, ask your General Manager to create '
          'your account again.',
      icon: Icons.person_off_outlined,
      toneOf: (c) => c.stOoo,
      secondaryLabel: 'Back to sign in',
    ),
    ApiErrorCodes.otpThrottled => AuthMessage(
      title: 'Too many attempts',
      body:
          'For your security we have paused sign-in from this number for a '
          'short while.',
      detail: 'Please wait a few minutes and try again.',
      icon: Icons.timer_off_outlined,
      toneOf: (c) => c.warning,
      secondaryLabel: 'Back to sign in',
    ),
    ApiErrorCodes.network => AuthMessage(
      title: "Can't reach Tavelo",
      body:
          'We could not connect to the server. Check your internet connection '
          'and try again.',
      icon: Icons.wifi_off_outlined,
      toneOf: (c) => c.critical,
      primaryLabel: 'Try again',
      secondaryLabel: 'Back to sign in',
    ),
    ApiErrorCodes.unauthenticated => AuthMessage(
      title: 'Session expired',
      body:
          'You have been signed out because your session expired. Please sign '
          'in again to continue.',
      icon: Icons.lock_clock_outlined,
      toneOf: (c) => c.warning,
      primaryLabel: 'Sign in again',
    ),
    _ => AuthMessage(
      title: 'Something went wrong',
      body: 'We could not complete that. Please try again in a moment.',
      icon: Icons.error_outline,
      toneOf: (c) => c.critical,
      primaryLabel: 'Try again',
      secondaryLabel: 'Back to sign in',
    ),
  };

  /// Short, inline wording for a failure the user can fix on the spot.
  static String inline(ApiException e) => switch (e.code) {
    ApiErrorCodes.invalidOtp =>
      "That code isn't right. Check the message and try again.",
    ApiErrorCodes.otpExpired =>
      'That code has expired. Request a new one to continue.',
    ApiErrorCodes.otpThrottled =>
      'Too many attempts. Please wait a few minutes before trying again.',
    ApiErrorCodes.network =>
      "We couldn't reach Tavelo. Check your connection and try again.",
    ApiErrorCodes.transport =>
      'The connection dropped. Please try again.',
    _ => e.message,
  };

  /// Codes that deserve their own screen rather than an inline strip.
  static bool isFullScreen(String code) =>
      ApiErrorCodes.accountStatus.contains(code) ||
      code == ApiErrorCodes.otpThrottled;
}
