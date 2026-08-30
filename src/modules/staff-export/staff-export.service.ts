import { Inject, Injectable, BadRequestException } from '@nestjs/common';
import { and, desc, eq, isNull } from 'drizzle-orm';
import { DRIZZLE, Database } from '../../database/database.module';
import { expenses, reservations } from '../../database/schema';
import { toCsvDocument } from '../../common/csv/to-csv';

export const STAFF_EXPORT_ENTITIES = ['reservations', 'expenses'] as const;
export type StaffExportEntity = (typeof STAFF_EXPORT_ENTITIES)[number];

export const STAFF_EXPORT_PERMISSION: Record<StaffExportEntity, string> = {
  reservations: 'reports.export',
  expenses: 'finance.export',
};

/**
 * Hotel-scoped CSV export for a GM — the operational data the admin platform
 * export never covered. One property's data, so a synchronous document rather
 * than the admin export's streaming paginator.
 */
@Injectable()
export class StaffExportService {
  constructor(@Inject(DRIZZLE) private readonly db: Database) {}

  static assertEntity(entity: string): StaffExportEntity {
    if (!(STAFF_EXPORT_ENTITIES as readonly string[]).includes(entity)) {
      throw new BadRequestException(`Unknown export: ${entity}`);
    }
    return entity as StaffExportEntity;
  }

  static filename(entity: StaffExportEntity): string {
    return `tavelo-${entity}.csv`;
  }

  async document(propertyId: string, entity: StaffExportEntity): Promise<string> {
    if (entity === 'reservations') return this.reservations(propertyId);
    return this.expenses(propertyId);
  }

  private async reservations(propertyId: string): Promise<string> {
    const rows = await this.db
      .select()
      .from(reservations)
      .where(and(eq(reservations.propertyId, propertyId), isNull(reservations.deletedAt)))
      .orderBy(desc(reservations.checkIn));
    return toCsvDocument(
      ['reservationNumber', 'guestName', 'guestPhone', 'checkIn', 'checkOut', 'status', 'ratePaise', 'totalPaise', 'paidPaise', 'source'],
      rows.map((r) => [
        r.reservationNumber,
        r.guestName,
        r.guestPhone,
        r.checkIn,
        r.checkOut,
        r.status,
        r.ratePaise,
        r.totalPaise,
        r.paidPaise,
        r.source,
      ]),
    );
  }

  private async expenses(propertyId: string): Promise<string> {
    const rows = await this.db
      .select()
      .from(expenses)
      .where(and(eq(expenses.propertyId, propertyId), isNull(expenses.deletedAt)))
      .orderBy(desc(expenses.incurredOn));
    return toCsvDocument(
      ['category', 'vendor', 'amountPaise', 'status', 'incurredOn', 'note'],
      rows.map((r) => [r.category, r.vendor, r.amountPaise, r.status, r.incurredOn, r.note]),
    );
  }
}
