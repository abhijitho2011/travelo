/**
 * Adds `months` calendar months to `date`, clamping to the last valid day of the
 * target month.
 *
 * The naive `d.setMonth(d.getMonth() + n)` overflows: Jan 31 + 1 month becomes
 * Mar 2/3 because February has no 31st. Billing periods must not silently skip
 * a month, so the day-of-month is clamped instead.
 *
 * Time-of-day and the UTC instant are otherwise preserved.
 */
export function addMonths(date: Date, months: number): Date {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) {
    throw new TypeError('addMonths: invalid date');
  }
  if (!Number.isInteger(months)) {
    throw new TypeError('addMonths: months must be an integer');
  }

  const day = date.getUTCDate();
  const absoluteMonth = date.getUTCFullYear() * 12 + date.getUTCMonth() + months;
  const targetYear = Math.floor(absoluteMonth / 12);
  const targetMonth = absoluteMonth - targetYear * 12;

  // Day 0 of the following month === last day of the target month.
  const daysInTargetMonth = new Date(Date.UTC(targetYear, targetMonth + 1, 0)).getUTCDate();

  const result = new Date(date.getTime());
  result.setUTCFullYear(targetYear, targetMonth, Math.min(day, daysInTargetMonth));
  return result;
}
