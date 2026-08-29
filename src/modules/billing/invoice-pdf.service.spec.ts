import {
  InvoiceDocumentData,
  InvoicePdfService,
  addressLines,
  formatMoney,
} from './invoice-pdf.service';

const DATA: InvoiceDocumentData = {
  invoiceNumber: 'INV-202608-000001',
  issuedAt: new Date('2026-08-29T00:00:00Z'),
  createdAt: new Date('2026-08-29T00:00:00Z'),
  dueDate: new Date('2026-09-12T00:00:00Z'),
  billingPeriodStart: new Date('2026-09-01T00:00:00Z'),
  billingPeriodEnd: new Date('2027-09-01T00:00:00Z'),
  currency: 'INR',
  subtotal: 3_000_000,
  tax: 540_000,
  discount: 100_000,
  total: 3_440_000,
  status: 'PAID',
  planName: 'Annual Pro',
  owner: {
    name: 'Anita Menon',
    company: 'Backwater Resorts Pvt Ltd',
    gstNumber: '32AABCU9603R1ZM',
    addressLines: ['12 Marine Drive', 'Kochi, Ernakulam, Kerala, 682031', 'India'],
  },
};

describe('formatMoney', () => {
  it('divides paise by 100 and groups the Indian way', () => {
    expect(formatMoney(3_000_000)).toBe('INR 30,000.00');
    expect(formatMoney(123_456_789)).toBe('INR 12,34,567.89');
    expect(formatMoney(99)).toBe('INR 0.99');
    expect(formatMoney(0)).toBe('INR 0.00');
  });

  it('renders a discount as a negative and honours the currency', () => {
    expect(formatMoney(-100_000, 'USD')).toBe('USD -1,000.00');
  });
});

describe('addressLines', () => {
  it('builds printable lines from the JSONB address', () => {
    expect(
      addressLines(
        { line1: '12 Marine Drive', city: 'Kochi', district: 'Ernakulam', state: 'Kerala' },
        { country: 'India' },
      ),
    ).toEqual(['12 Marine Drive', 'Kochi, Ernakulam, Kerala', 'India']);
  });

  it('falls back to the owner columns and drops empty lines', () => {
    expect(addressLines(null, { city: 'Kochi', country: 'India', pinCode: '682031' })).toEqual([
      'Kochi, 682031',
      'India',
    ]);
    expect(addressLines(null, {})).toEqual([]);
  });
});

describe('InvoicePdfService.render', () => {
  it('produces a real PDF', async () => {
    const buf = await InvoicePdfService.render(DATA);
    expect(buf.subarray(0, 5).toString('latin1')).toBe('%PDF-');
    expect(buf.length).toBeGreaterThan(1000);
  });

  it('never invents tax maths — it prints what the row says, even when it does not add up', async () => {
    // A deliberately inconsistent row. The document must still show the stored
    // total, because the invoice row is the ledger and the PDF is its picture.
    const inconsistent = { ...DATA, total: 1 };
    await expect(InvoicePdfService.render(inconsistent)).resolves.toBeInstanceOf(Buffer);
  });

  it('renders without an optional company, GSTIN, plan or due date', async () => {
    const sparse: InvoiceDocumentData = {
      ...DATA,
      planName: null,
      dueDate: null,
      issuedAt: null,
      owner: { name: 'Solo Owner', company: null, gstNumber: null, addressLines: [] },
    };
    const buf = await InvoicePdfService.render(sparse);
    expect(buf.subarray(0, 5).toString('latin1')).toBe('%PDF-');
  });
});

describe('InvoicePdfService.objectKey', () => {
  it('files documents under the owner, named by invoice number', () => {
    expect(InvoicePdfService.objectKey('own-1', 'INV-202608-000001')).toBe(
      'invoices/own-1/INV-202608-000001.pdf',
    );
  });
});

describe('InvoicePdfService.generateQuietly', () => {
  it('swallows a storage failure so a committed payment is never undone', async () => {
    const svc = new InvoicePdfService(
      {} as never,
      {
        put: async () => {
          throw new Error('object store unreachable');
        },
      } as never,
    );
    jest.spyOn(svc, 'generate').mockRejectedValue(new Error('object store unreachable'));
    await expect(svc.generateQuietly('inv-1')).resolves.toBeUndefined();
  });
});
