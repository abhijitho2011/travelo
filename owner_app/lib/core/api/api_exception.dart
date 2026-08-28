/// Typed error surfaced from the Travelo API `{ success, error }` envelope,
/// or from transport failures. UX maps `code` to friendly, secure messaging —
/// never revealing whether an account exists.
class ApiException implements Exception {
  final String code;
  final String message;
  final int? status;
  final bool isNetwork;

  const ApiException({
    required this.code,
    required this.message,
    this.status,
    this.isNetwork = false,
  });

  factory ApiException.network() => const ApiException(
        code: 'NETWORK',
        message: "We couldn't reach Travelo right now.",
        isNetwork: true,
      );

  @override
  String toString() => 'ApiException($code, $status): $message';
}
