import { HttpException, HttpStatus } from '@nestjs/common';

/**
 * Domain errors for the Channex adapter. `error` is surfaced verbatim by the
 * global AllExceptionsFilter as `error.code`, so these strings are the contract
 * the admin console branches on — same rule as `ReservationErrors`.
 */
export function channexError(code: string, message: string, status: HttpStatus): HttpException {
  return new HttpException({ message, error: code }, status);
}

export const ChannexErrors = {
  /**
   * The one error an unconfigured deployment ever sees. Returned instead of a
   * stack trace so the console can say "connect Channex" rather than "500".
   */
  notConfigured: () =>
    channexError(
      'CHANNEX_NOT_CONFIGURED',
      'Channex is not configured on this deployment',
      HttpStatus.SERVICE_UNAVAILABLE,
    ),
  notFound: () =>
    channexError('INTEGRATION_NOT_FOUND', 'Integration not found', HttpStatus.NOT_FOUND),
  /** The connection exists but is not a Channex one. */
  wrongProvider: (provider: string) =>
    channexError(
      'CHANNEX_WRONG_PROVIDER',
      `Integration is a ${provider} connection, not Channex`,
      HttpStatus.BAD_REQUEST,
    ),
  /** `config.channexPropertyId` missing — nothing can be addressed without it. */
  unmappedProperty: () =>
    channexError(
      'CHANNEX_PROPERTY_UNMAPPED',
      'This connection has no channexPropertyId in its config',
      HttpStatus.BAD_REQUEST,
    ),
  badSignature: () =>
    channexError('CHANNEX_BAD_SIGNATURE', 'Webhook signature mismatch', HttpStatus.UNAUTHORIZED),
};

/**
 * A non-2xx (or unparseable) response from Channex, carrying enough to debug
 * without carrying the request that produced it — the API key travels in a
 * header and must never reach a log line or a sync-log row.
 */
export class ChannexApiError extends Error {
  constructor(
    readonly status: number,
    readonly path: string,
    readonly body: string,
  ) {
    super(`Channex ${path} responded ${status}`);
    this.name = 'ChannexApiError';
  }

  /** Short, safe one-liner for `channex_sync_log.error`. */
  get summary(): string {
    return `HTTP ${this.status} ${this.path}: ${this.body.slice(0, 300)}`;
  }
}
