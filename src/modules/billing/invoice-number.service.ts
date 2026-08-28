import { Inject, Injectable } from '@nestjs/common';
import { sql } from 'drizzle-orm';
import { DRIZZLE, Database } from '../../database/database.module';
import { invoiceSequences } from '../../database/schema';

@Injectable()
export class InvoiceNumberService {
  constructor(@Inject(DRIZZLE) private readonly db: Database) {}

  static keyFor(date: Date): string {
    const y = date.getUTCFullYear();
    const m = (date.getUTCMonth() + 1).toString().padStart(2, '0');
    return `${y}${m}`;
  }

  static format(yearMonth: string, seq: number): string {
    return `INV-${yearMonth}-${seq.toString().padStart(6, '0')}`;
  }

  async next(date: Date = new Date()): Promise<string> {
    const key = InvoiceNumberService.keyFor(date);
    const result = await this.db.execute(sql`
      INSERT INTO invoice_sequences (year_month, last_seq, updated_at)
      VALUES (${key}, 1, now())
      ON CONFLICT (year_month)
      DO UPDATE SET last_seq = invoice_sequences.last_seq + 1, updated_at = now()
      RETURNING last_seq
    `);
    const rows = (result as unknown as { rows: Array<{ last_seq: number }> }).rows;
    const seq = Number(rows[0].last_seq);
    return InvoiceNumberService.format(key, seq);
  }
}
