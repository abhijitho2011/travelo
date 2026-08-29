/// Error codes the staff API can return. Kept as constants (not an enum) so an
/// unknown code coming back from a newer backend never crashes the client.
class ApiErrorCodes {
  ApiErrorCodes._();

  static const invalidOtp = 'INVALID_OTP';
  static const otpExpired = 'OTP_EXPIRED';
  static const otpThrottled = 'OTP_THROTTLED';

  static const accountPendingApproval = 'ACCOUNT_PENDING_APPROVAL';
  static const accountBlocked = 'ACCOUNT_BLOCKED';
  static const accountSuspended = 'ACCOUNT_SUSPENDED';
  static const accountDeactivated = 'ACCOUNT_DEACTIVATED';
  static const accountInvited = 'ACCOUNT_INVITED';

  static const unauthenticated = 'UNAUTHENTICATED';
  static const forbidden = 'FORBIDDEN';
  static const notFound = 'NOT_FOUND';
  static const network = 'NETWORK';
  static const transport = 'TRANSPORT';
  static const cancelled = 'CANCELLED';

  /// Codes that mean "the credentials were fine, but this account may not be
  /// used right now". These route to a dedicated status screen rather than an
  /// inline field error.
  static const Set<String> accountStatus = {
    accountPendingApproval,
    accountBlocked,
    accountSuspended,
    accountDeactivated,
    accountInvited,
  };
}

/// Typed error surfaced from the Tavelo `{ success, error: { code, message } }`
/// envelope, or from a transport failure. The UI maps [code] to friendly copy —
/// it never reveals whether an account exists.
class ApiException implements Exception {
  const ApiException({
    required this.code,
    required this.message,
    this.status,
    this.isNetwork = false,
  });

  final String code;
  final String message;
  final int? status;
  final bool isNetwork;

  factory ApiException.network() => const ApiException(
    code: ApiErrorCodes.network,
    message: "We couldn't reach Tavelo right now.",
    isNetwork: true,
  );

  /// True when the endpoint is not deployed yet. Callers use this to fall back
  /// to an honest empty state instead of an error.
  bool get isMissingEndpoint => status == 404 || status == 501;

  bool get isAccountStatus => ApiErrorCodes.accountStatus.contains(code);

  @override
  String toString() => 'ApiException($code, $status): $message';
}
