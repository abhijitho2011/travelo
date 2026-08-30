import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { and, eq, isNull } from 'drizzle-orm';
import PDFDocument from 'pdfkit';
import { DRIZZLE, Database } from '../../database/database.module';
import { properties, reservations } from '../../database/schema';
import { FolioService, type FolioSummary } from './folio.service';

export interface FolioReceiptData {
  property: { name: string; city: string | null; state: string | null };
  guest: { name: string; phone: string; email: string | null };
  reservationNumber: string;
  checkIn: string;
  checkOut: string;
  currency: string;
  folio: FolioSummary;
  issuedAt: Date;
}

function formatMoney(paise: number, currency: string): string {
  const major = (paise / 100).toLocaleString('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return `${currency} ${major}`;
}

function formatDate(d: Date | string): string {
  const date = typeof d === 'string' ? new Date(`${d}T00:00:00`) : d;
  return date.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

/**
 * The guest's stay receipt — the itemised folio as a PDF, generated on demand
 * and streamed (never stored: unlike a subscription invoice, a stay receipt is
 * ephemeral and reproducible from the folio at any time). Reuses the same
 * pdfkit masthead as the platform invoice so the two read as one brand.
 */
@Injectable()
export class FolioReceiptService {
  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    private readonly folio: FolioService,
  ) {}

  /** Resolves the stay by (id, property) first, so no cross-tenant receipts. */
  async data(propertyId: string, reservationId: string): Promise<FolioReceiptData> {
    const [res] = await this.db
      .select()
      .from(reservations)
      .where(
        and(
          eq(reservations.id, reservationId),
          eq(reservations.propertyId, propertyId),
          isNull(reservations.deletedAt),
        ),
      )
      .limit(1);
    if (!res) throw new NotFoundException('Reservation not found');

    const [prop] = await this.db
      .select({ name: properties.name, city: properties.city, state: properties.state })
      .from(properties)
      .where(eq(properties.id, propertyId))
      .limit(1);

    const folio = await this.folio.summary(reservationId);
    return {
      property: {
        name: prop?.name ?? 'Tavelo',
        city: prop?.city ?? null,
        state: prop?.state ?? null,
      },
      guest: { name: res.guestName, phone: res.guestPhone, email: res.guestEmail },
      reservationNumber: res.reservationNumber,
      checkIn: res.checkIn,
      checkOut: res.checkOut,
      currency: res.currency,
      folio,
      issuedAt: new Date(),
    };
  }

  /** Pure rendering — no database, no storage — so it is trivially testable. */
  static render(data: FolioReceiptData): Promise<Buffer> {
    const doc = new PDFDocument({ size: 'A4', margin: 50 });
    const chunks: Buffer[] = [];
    const done = new Promise<Buffer>((resolve, reject) => {
      doc.on('data', (c: Buffer) => chunks.push(c));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);
    });

    const left = 50;
    const right = 545;
    const { currency } = data;

    // ---- Masthead: the hotel, not the platform ----
    doc.font('Helvetica-Bold').fontSize(20).fillColor('#000000').text(data.property.name, left, 50);
    const place = [data.property.city, data.property.state].filter(Boolean).join(', ');
    if (place) doc.font('Helvetica').fontSize(9).fillColor('#666666').text(place, left, 76);
    doc
      .font('Helvetica-Bold')
      .fontSize(16)
      .fillColor('#000000')
      .text('GUEST RECEIPT', left, 50, { align: 'right', width: right - left });
    doc
      .font('Helvetica')
      .fontSize(10)
      .text(`Reservation  ${data.reservationNumber}`, left, 74, {
        align: 'right',
        width: right - left,
      })
      .text(`Issued  ${formatDate(data.issuedAt)}`, { align: 'right', width: right - left });

    doc.moveTo(left, 104).lineTo(right, 104).strokeColor('#cccccc').stroke();

    // ---- Guest + stay block ----
    let y = 120;
    doc.font('Helvetica-Bold').fontSize(10).fillColor('#666666').text('GUEST', left, y);
    doc.text('STAY', left + 300, y);
    y += 16;
    doc.font('Helvetica-Bold').fontSize(12).fillColor('#000000').text(data.guest.name, left, y);
    doc
      .font('Helvetica')
      .fontSize(10)
      .text(`${formatDate(data.checkIn)}  →  ${formatDate(data.checkOut)}`, left + 300, y);
    y += 16;
    doc.font('Helvetica').fontSize(10).fillColor('#000000').text(data.guest.phone, left, y);
    if (data.guest.email) {
      y += 14;
      doc.text(data.guest.email, left, y);
    }

    // ---- Charges ----
    y += 30;
    const headerRow = (label: string) => {
      doc
        .rect(left, y, right - left, 22)
        .fillColor('#f2f2f2')
        .fill();
      doc.fillColor('#000000').font('Helvetica-Bold').fontSize(10);
      doc.text(label, left + 8, y + 6);
      doc.text('AMOUNT', right - 158, y + 6, { width: 150, align: 'right' });
      y += 30;
    };
    const line = (label: string, amountPaise: number) => {
      doc.font('Helvetica').fontSize(10).fillColor('#000000');
      doc.text(label, left + 8, y, { width: right - left - 180 });
      doc.text(formatMoney(amountPaise, currency), right - 158, y, { width: 150, align: 'right' });
      y += 20;
    };

    headerRow('CHARGES');
    line('Room charge', data.folio.roomChargePaise);
    for (const item of data.folio.lineItems) line(item.description, item.amountPaise);

    y += 6;
    doc.moveTo(left, y).lineTo(right, y).strokeColor('#cccccc').stroke();
    y += 10;
    doc.font('Helvetica-Bold').fontSize(10);
    doc.text('Total charges', left + 8, y);
    doc.text(formatMoney(data.folio.chargesPaise, currency), right - 158, y, {
      width: 150,
      align: 'right',
    });
    y += 26;

    // ---- Payments ----
    if (data.folio.payments.length > 0) {
      headerRow('PAYMENTS');
      for (const p of data.folio.payments) {
        const signed = p.direction === 'REFUND' ? -p.amountPaise : p.amountPaise;
        const label = `${p.direction === 'REFUND' ? 'Refund' : 'Payment'} — ${p.method}${
          p.reference ? ` (${p.reference})` : ''
        }`;
        line(label, signed);
      }
      y += 6;
      doc.moveTo(left, y).lineTo(right, y).strokeColor('#cccccc').stroke();
      y += 10;
      doc.font('Helvetica-Bold').fontSize(10);
      doc.text('Total paid', left + 8, y);
      doc.text(formatMoney(data.folio.netPaidPaise, currency), right - 158, y, {
        width: 150,
        align: 'right',
      });
      y += 26;
    }

    // ---- Balance ----
    doc
      .rect(left, y, right - left, 30)
      .fillColor(data.folio.balancePaise > 0 ? '#fdecea' : '#eafaf1')
      .fill();
    doc.fillColor('#000000').font('Helvetica-Bold').fontSize(12);
    doc.text(data.folio.balancePaise > 0 ? 'BALANCE DUE' : 'BALANCE', left + 8, y + 8);
    doc.text(formatMoney(data.folio.balancePaise, currency), right - 158, y + 8, {
      width: 150,
      align: 'right',
    });

    // ---- Footer ----
    doc
      .font('Helvetica')
      .fontSize(8)
      .fillColor('#666666')
      .text(
        'This is a computer-generated receipt for your stay. Amounts are shown in the stay currency. ' +
          'For any billing query please contact the front desk.',
        left,
        770,
        { width: right - left, align: 'center' },
      );

    doc.end();
    return done;
  }

  /** Convenience: assemble + render in one call. */
  async pdf(propertyId: string, reservationId: string): Promise<Buffer> {
    const data = await this.data(propertyId, reservationId);
    return FolioReceiptService.render(data);
  }
}
