import { HttpException, HttpStatus } from '@nestjs/common';

export function salesError(code: string, message: string, status: HttpStatus): HttpException {
  return new HttpException({ message, error: code }, status);
}

export const SalesErrors = {
  leadNotFound: () => salesError('LEAD_NOT_FOUND', 'Lead not found', HttpStatus.NOT_FOUND),

  invalidStageTransition: (from: string, to: string) =>
    salesError(
      'INVALID_LEAD_STAGE_TRANSITION',
      `A lead cannot move from ${from} to ${to}`,
      HttpStatus.CONFLICT,
    ),
};
