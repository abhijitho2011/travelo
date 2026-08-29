import { Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import PDFDocument from 'pdfkit';
import { eq } from 'drizzle-orm';
import { DRIZZLE, Database } from '../../database/database.module';
import { invoices, owners, subscriptionPlans, subscriptions } from '../../database/schema';
import { StorageService } from '../storage/storage.service';

/** One printable invoice, assembled from rows that already exist. */
export interface InvoiceDocumentData {
  invoiceNumber: string;
  issuedAt: Date | null;
  createdAt: Date;
  dueDate: Date | null;
  billingPeriodStart: Date;
  billingPeriodEnd: Date;
  currency: string;
  subtotal: number;
  tax: number;
  discount: number;
  total: number;
  status: string;
  planName: string | null;
  owner: {
    name: string;
    company: string | null;
    gstNumber: string | null;
    addressLines: string[];
  };
}

/** Paise -> a rupee string. Money is stored as an integer; only display divides. */
export function formatMoney(paise: number, currency = 'INR'): string {
  const sign = paise < 0 ? '-' : '';
  const abs = Math.abs(Math.trunc(paise));
  const whole = Math.floor(abs / 100).toString();
  const frac = (abs % 100).toString().padStart(2, '0');
  // Indian grouping: last three digits, then pairs (12,34,567.89).
  const grouped =
    whole.length > 3
      ? whole.slice(0, -3).replace(/\B(?=(\d{2})+(?!\d))/g, ',') + ',' + whole.slice(-3)
      : whole;
  return `${currency} ${sign}${grouped}.${frac}`;
}

function formatDate(d: Date | null | undefined): string {
  if (!d) return '—';
  return d.toISOString().slice(0, 10);
}

/** Flattens the owner's JSONB address into printable lines. */
export function addressLines(
  address: unknown,
  fallback: { city?: string | null; country?: string | null; pinCode?: string | null },
): string[] {
  const a = (address ?? {}) as Record<string, unknown>;
  const pick = (k: string) => {
    const v = a[k];
    return typeof v === 'string' && v.trim() ? v.trim() : null;
  };
  const line1 = [pick('line1') ?? pick('street') ?? pick('address'), pick('line2')]
    .filter(Boolean)
    .join(', ');
  const cityLine = [
    pick('city') ?? fallback.city ?? null,
    pick('district'),
    pick('state'),
    pick('pinCode') ?? pick('pincode') ?? fallback.pinCode ?? null,
  ]
    .filter(Boolean)
    .join(', ');
  const country = pick('country') ?? fallback.country ?? null;
  return [line1, cityLine, country].filter((l): l is string => !!l && l.length > 0);
}

@Injectable()
export class InvoicePdfService {
  private readonly log = new Logger(InvoicePdfService.name);

  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    private readonly storage: StorageService,
  ) {}

  /** Object key an invoice document is (or will be) stored under. */
  static objectKey(ownerId: string, invoiceNumber: string): string {
    return `invoices/${ownerId}/${invoiceNumber}.pdf`;
  }

  /**
   * Renders, uploads and records the PDF for one invoice.
   *
   * Every money figure is copied verbatim from the invoice row. This method
   * computes NO tax and re-derives NO total — the invoice row is the ledger,
   * and a document that disagrees with it would be worse than no document.
   */
  async generate(invoiceId: string): Promise<{ storageKey: string }> {
    const data = await this.load(invoiceId);
    const [row] = await this.db
      .select({ ownerId: invoices.ownerId })
      .from(invoices)
      .where(eq(invoices.id, invoiceId))
      .limit(1);
    const buffer = await InvoicePdfService.render(data);
    const key = InvoicePdfService.objectKey(row.ownerId, data.invoiceNumber);
    await this.storage.put(key, buffer, 'application/pdf');
    await this.db
      .update(invoices)
      .set({ storageKey: key, updatedAt: new Date() })
      .where(eq(invoices.id, invoiceId));
    this.log.log(`Generated invoice document ${data.invoiceNumber} -> ${key}`);
    return { storageKey: key };
  }

  /**
   * Best-effort generation for the money paths.
   *
   * A settled payment is a fact; a missing PDF is an inconvenience. This never
   * throws, so a storage outage can neither roll back nor 500 a transaction
   * that has already committed. `POST /billing/invoices/:id/generate-pdf` is
   * the retry.
   */
  async generateQuietly(invoiceId: string): Promise<void> {
    try {
      await this.generate(invoiceId);
    } catch (err) {
      this.log.error(
        `Invoice document generation failed for ${invoiceId} — the payment is unaffected; retry via POST /billing/invoices/${invoiceId}/generate-pdf`,
        err as Error,
      );
    }
  }

  private async load(invoiceId: string): Promise<InvoiceDocumentData> {
    const [row] = await this.db
      .select({ i: invoices, o: owners })
      .from(invoices)
      .innerJoin(owners, eq(invoices.ownerId, owners.id))
      .where(eq(invoices.id, invoiceId))
      .limit(1);
    if (!row) throw new NotFoundException('Invoice not found');

    let planName: string | null = null;
    if (row.i.subscriptionId) {
      const [plan] = await this.db
        .select({ name: subscriptionPlans.name })
        .from(subscriptions)
        .innerJoin(subscriptionPlans, eq(subscriptions.planId, subscriptionPlans.id))
        .where(eq(subscriptions.id, row.i.subscriptionId))
        .limit(1);
      planName = plan?.name ?? null;
    }

    return {
      invoiceNumber: row.i.invoiceNumber,
      issuedAt: row.i.issuedAt,
      createdAt: row.i.createdAt,
      dueDate: row.i.dueDate,
      billingPeriodStart: row.i.billingPeriodStart,
      billingPeriodEnd: row.i.billingPeriodEnd,
      currency: row.i.currency,
      subtotal: row.i.subtotal,
      tax: row.i.tax,
      discount: row.i.discount,
      total: row.i.total,
      status: row.i.status,
      planName,
      owner: {
        name: row.o.name,
        company: row.o.company,
        gstNumber: row.o.gstNumber,
        addressLines: addressLines(row.o.address, {
          city: row.o.city,
          country: row.o.country,
          pinCode: row.o.pinCode,
        }),
      },
    };
  }

  /** Pure rendering — no database, no storage — so it is trivially testable. */
  static render(data: InvoiceDocumentData): Promise<Buffer> {
    const doc = new PDFDocument({ size: 'A4', margin: 50 });
    const chunks: Buffer[] = [];
    const done = new Promise<Buffer>((resolve, reject) => {
      doc.on('data', (c: Buffer) => chunks.push(c));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);
    });

    const left = 50;
    const right = 545;

    // ---- Masthead ----
    doc.font('Helvetica-Bold').fontSize(26).text('tavelo', left, 50);
    doc
      .font('Helvetica')
      .fontSize(9)
      .fillColor('#666666')
      .text('Hotel management platform', left, 80);
    doc
      .font('Helvetica-Bold')
      .fontSize(16)
      .fillColor('#000000')
      .text('TAX INVOICE', left, 50, { align: 'right', width: right - left });
    doc
      .font('Helvetica')
      .fontSize(10)
      .text(`Invoice no.  ${data.invoiceNumber}`, left, 74, {
        align: 'right',
        width: right - left,
      })
      .text(`Invoice date  ${formatDate(data.issuedAt ?? data.createdAt)}`, {
        align: 'right',
        width: right - left,
      })
      .text(`Due date  ${formatDate(data.dueDate)}`, { align: 'right', width: right - left });

    doc.moveTo(left, 118).lineTo(right, 118).strokeColor('#cccccc').stroke();

    // ---- Billed-to block ----
    let y = 134;
    doc.font('Helvetica-Bold').fontSize(10).fillColor('#666666').text('BILLED TO', left, y);
    y += 16;
    doc.font('Helvetica-Bold').fontSize(12).fillColor('#000000').text(data.owner.name, left, y);
    y += 16;
    doc.font('Helvetica').fontSize(10);
    if (data.owner.company) {
      doc.text(data.owner.company, left, y);
      y += 14;
    }
    for (const line of data.owner.addressLines) {
      doc.text(line, left, y, { width: 300 });
      y += 14;
    }
    if (data.owner.gstNumber) {
      doc.text(`GSTIN: ${data.owner.gstNumber}`, left, y);
      y += 14;
    }

    // ---- Single line item ----
    y += 20;
    doc
      .rect(left, y, right - left, 22)
      .fillColor('#f2f2f2')
      .fill();
    doc.fillColor('#000000').font('Helvetica-Bold').fontSize(10);
    doc.text('DESCRIPTION', left + 8, y + 6);
    doc.text('AMOUNT', right - 158, y + 6, { width: 150, align: 'right' });
    y += 30;

    const period = `${formatDate(data.billingPeriodStart)} to ${formatDate(data.billingPeriodEnd)}`;
    doc.font('Helvetica').fontSize(10);
    doc.text(`${data.planName ?? 'Subscription'} — billing period ${period}`, left + 8, y, {
      width: right - left - 180,
    });
    doc.text(formatMoney(data.subtotal, data.currency), right - 158, y, {
      width: 150,
      align: 'right',
    });
    y += 34;
    doc.moveTo(left, y).lineTo(right, y).strokeColor('#cccccc').stroke();

    // ---- Totals, verbatim from the invoice row ----
    y += 12;
    const totalsRow = (label: string, value: string, bold = false) => {
      doc.font(bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(bold ? 12 : 10);
      doc.text(label, right - 320, y, { width: 160, align: 'right' });
      doc.text(value, right - 158, y, { width: 150, align: 'right' });
      y += bold ? 22 : 16;
    };
    totalsRow('Subtotal', formatMoney(data.subtotal, data.currency));
    totalsRow('Tax', formatMoney(data.tax, data.currency));
    totalsRow('Discount', formatMoney(-data.discount, data.currency));
    doc
      .moveTo(right - 320, y + 2)
      .lineTo(right, y + 2)
      .strokeColor('#cccccc')
      .stroke();
    y += 10;
    totalsRow('Total', formatMoney(data.total, data.currency), true);
    doc
      .font('Helvetica')
      .fontSize(10)
      .fillColor('#666666')
      .text(`Status: ${data.status}`, right - 320, y, { width: 310, align: 'right' });

    // ---- Footer ----
    doc
      .font('Helvetica')
      .fontSize(8)
      .fillColor('#666666')
      .text(
        'This is a computer-generated invoice and is valid without a signature. ' +
          'Amounts are shown in the invoice currency. For billing queries contact support via the Tavelo console.',
        left,
        760,
        { width: right - left, align: 'center' },
      );

    doc.end();
    return done;
  }
}
