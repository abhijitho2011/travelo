import { HttpException, HttpStatus } from '@nestjs/common';

/**
 * Domain errors for the staff channels surface. `error` is surfaced verbatim by
 * the global AllExceptionsFilter as `error.code` — the strings the staff app
 * branches on, same rule as `KeyCardErrors`.
 */
function channelError(code: string, message: string, status: HttpStatus): HttpException {
  return new HttpException({ message, error: code }, status);
}

export const StaffChannelErrors = {
  /** Missing room type OR another property's — indistinguishable on purpose. */
  roomTypeNotFound: () =>
    channelError('ROOM_TYPE_NOT_FOUND', 'Room type not found', HttpStatus.NOT_FOUND),

  /** Same 404-over-403 rule: a foreign property's connection simply isn't there. */
  connectionNotFound: () =>
    channelError(
      'CHANNEL_CONNECTION_NOT_FOUND',
      'Sales channel connection not found',
      HttpStatus.NOT_FOUND,
    ),

  invalidMapping: (message: string) =>
    channelError('CHANNEL_MAPPING_INVALID', message, HttpStatus.BAD_REQUEST),
};
