import { addMonths } from './add-months';

describe('addMonths', () => {
  it('adds a plain month', () => {
    expect(addMonths(new Date('2026-01-15T10:30:00Z'), 1).toISOString()).toBe(
      '2026-02-15T10:30:00.000Z',
    );
  });

  it('clamps Jan 31 + 1 month to Feb 28 in a common year', () => {
    expect(addMonths(new Date('2026-01-31T00:00:00Z'), 1).toISOString()).toBe(
      '2026-02-28T00:00:00.000Z',
    );
  });

  it('clamps Jan 31 + 1 month to Feb 29 in a leap year', () => {
    expect(addMonths(new Date('2024-01-31T00:00:00Z'), 1).toISOString()).toBe(
      '2024-02-29T00:00:00.000Z',
    );
  });

  it('clamps Aug 31 + 6 months to Feb 28 (common year)', () => {
    expect(addMonths(new Date('2025-08-31T00:00:00Z'), 6).toISOString()).toBe(
      '2026-02-28T00:00:00.000Z',
    );
  });

  it('clamps Aug 31 + 6 months to Feb 29 (leap year)', () => {
    expect(addMonths(new Date('2023-08-31T00:00:00Z'), 6).toISOString()).toBe(
      '2024-02-29T00:00:00.000Z',
    );
  });

  it('handles Feb 29 + 12 months (leap day rolls to Feb 28)', () => {
    expect(addMonths(new Date('2024-02-29T00:00:00Z'), 12).toISOString()).toBe(
      '2025-02-28T00:00:00.000Z',
    );
  });

  it('crosses year boundaries', () => {
    expect(addMonths(new Date('2025-11-30T12:00:00Z'), 3).toISOString()).toBe(
      '2026-02-28T12:00:00.000Z',
    );
    expect(addMonths(new Date('2025-12-31T00:00:00Z'), 1).toISOString()).toBe(
      '2026-01-31T00:00:00.000Z',
    );
  });

  it('supports long durations up to the 120 month plan ceiling', () => {
    expect(addMonths(new Date('2026-01-31T00:00:00Z'), 120).toISOString()).toBe(
      '2036-01-31T00:00:00.000Z',
    );
    expect(addMonths(new Date('2026-03-31T00:00:00Z'), 11).toISOString()).toBe(
      '2027-02-28T00:00:00.000Z',
    );
  });

  it('preserves the time of day', () => {
    expect(addMonths(new Date('2026-03-31T23:59:59.123Z'), 1).toISOString()).toBe(
      '2026-04-30T23:59:59.123Z',
    );
  });

  it('supports zero and negative offsets', () => {
    expect(addMonths(new Date('2026-03-31T00:00:00Z'), 0).toISOString()).toBe(
      '2026-03-31T00:00:00.000Z',
    );
    expect(addMonths(new Date('2026-03-31T00:00:00Z'), -1).toISOString()).toBe(
      '2026-02-28T00:00:00.000Z',
    );
  });

  it('rejects invalid input', () => {
    expect(() => addMonths(new Date('nope'), 1)).toThrow(TypeError);
    expect(() => addMonths(new Date('2026-01-01T00:00:00Z'), 1.5)).toThrow(TypeError);
  });
});
