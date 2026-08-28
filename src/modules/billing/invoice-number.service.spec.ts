import { InvoiceNumberService } from './invoice-number.service';

describe('InvoiceNumberService', () => {
  it('formats invoice numbers as INV-YYYYMM-NNNNNN', () => {
    expect(InvoiceNumberService.format('202608', 1)).toBe('INV-202608-000001');
    expect(InvoiceNumberService.format('202612', 42)).toBe('INV-202612-000042');
    expect(InvoiceNumberService.format('202708', 999999)).toBe('INV-202708-999999');
  });

  it('derives yearMonth from Date in UTC', () => {
    expect(InvoiceNumberService.keyFor(new Date('2026-08-15T05:00:00Z'))).toBe('202608');
    expect(InvoiceNumberService.keyFor(new Date('2026-01-01T00:00:00Z'))).toBe('202601');
    expect(InvoiceNumberService.keyFor(new Date('2026-12-31T23:59:59Z'))).toBe('202612');
  });
});
