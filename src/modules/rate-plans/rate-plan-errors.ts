import { HttpException, HttpStatus } from '@nestjs/common';

/**
 * Domain errors for the rate-plan surface. `error` is surfaced verbatim by the
 * global AllExceptionsFilter as `error.code` — the strings the staff and owner
 * apps branch on, same rule as `KeyCardErrors`.
 */
function ratePlanError(code: string, message: string, status: HttpStatus): HttpException {
  return new HttpException({ message, error: code }, status);
}

export const RatePlanErrors = {
  /**
   * A missing room type OR one belonging to another property — deliberately
   * indistinguishable, so a foreign id 404s rather than 403s.
   */
  roomTypeNotFound: () =>
    ratePlanError('ROOM_TYPE_NOT_FOUND', 'Room type not found', HttpStatus.NOT_FOUND),

  notFound: () => ratePlanError('RATE_PLAN_NOT_FOUND', 'Rate plan not found', HttpStatus.NOT_FOUND),

  /** The partial unique index on (room_type_id, name) refused. */
  nameTaken: (name: string) =>
    ratePlanError(
      'RATE_PLAN_NAME_TAKEN',
      `A rate plan named "${name}" already exists for this room type`,
      HttpStatus.CONFLICT,
    ),

  feeNotFound: () => ratePlanError('FEE_NOT_FOUND', 'Fee not found', HttpStatus.NOT_FOUND),

  pricingRuleNotFound: () =>
    ratePlanError('PRICING_RULE_NOT_FOUND', 'Pricing rule not found', HttpStatus.NOT_FOUND),

  invalid: (message: string) => ratePlanError('RATE_PLAN_INVALID', message, HttpStatus.BAD_REQUEST),
};
