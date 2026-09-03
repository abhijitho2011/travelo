import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { and, asc, desc, eq, isNull, sql } from 'drizzle-orm';
import { DRIZZLE, Database } from '../../database/database.module';
import { corporateAccounts, corporateLedger, reservations } from '../../database/schema';

type Tx = Pick<Database, 'select' | 'insert' | 'update'>;

export interface AccountInput {
  name: string;
  gstin?: string;
  contactName?: string;
  contactPhone?: string;
  contactEmail?: string;
  address?: string;
  creditLimitPaise?: number | null;
  isActive?: boolean;
}

/**
 * Direct billing: corporate accounts and their ledger.
 *
 * A stay or a restaurant bill settled by CORPORATE becomes a CHARGE on the
 * account; money received later is a PAYMENT. Balance is the difference, and
 * the statement is the ledger in order. Append-only — nothing here is edited
 * after the fact; a mistake is corrected by a counter-entry with a note.
 */
@Injectable()
export class DirectBillingService {
  constructor(@Inject(DRIZZLE) private readonly db: Database) {}

  list(propertyId: string) {
    return this.db
      .select()
      .from(corporateAccounts)
      .where(and(eq(corporateAccounts.propertyId, propertyId), isNull(corporateAccounts.deletedAt)))
      .orderBy(asc(corporateAccounts.name));
  }

  async listWithBalances(propertyId: string) {
    const accounts = await this.list(propertyId);
    const sums = await this.db
      .select({
        accountId: corporateLedger.accountId,
        balance: sql<number>`coalesce(sum(case when ${corporateLedger.kind} = 'CHARGE' then ${corporateLedger.amountPaise} else -${corporateLedger.amountPaise} end), 0)::int`,
      })
      .from(corporateLedger)
      .where(eq(corporateLedger.propertyId, propertyId))
      .groupBy(corporateLedger.accountId);
    const byId = new Map(sums.map((s) => [s.accountId, Number(s.balance)]));
    return accounts.map((a) => ({ ...a, balancePaise: byId.get(a.id) ?? 0 }));
  }

  async require(propertyId: string, id: string, tx: Tx = this.db) {
    const [row] = await tx
      .select()
      .from(corporateAccounts)
      .where(
        and(
          eq(corporateAccounts.id, id),
          eq(corporateAccounts.propertyId, propertyId),
          isNull(corporateAccounts.deletedAt),
        ),
      )
      .limit(1);
    if (!row)
      throw new NotFoundException({
        error: 'CORPORATE_ACCOUNT_NOT_FOUND',
        message: 'Corporate account not found',
      });
    return row;
  }

  async create(propertyId: string, dto: AccountInput) {
    const [row] = await this.db
      .insert(corporateAccounts)
      .values({ propertyId, ...dto })
      .returning();
    return row;
  }

  async update(propertyId: string, id: string, dto: Partial<AccountInput>) {
    await this.require(propertyId, id);
    const [row] = await this.db
      .update(corporateAccounts)
      .set({ ...dto, updatedAt: new Date() })
      .where(eq(corporateAccounts.id, id))
      .returning();
    return row;
  }

  /** Charge the account — from a folio settlement or a POS bill. */
  async charge(
    e: {
      propertyId: string;
      accountId: string;
      amountPaise: number;
      reservationId?: string | null;
      orderId?: string | null;
      reference?: string | null;
      note?: string | null;
      recordedBy?: string | null;
    },
    tx: Tx = this.db,
  ) {
    await this.require(e.propertyId, e.accountId, tx);
    const [row] = await tx
      .insert(corporateLedger)
      .values({
        accountId: e.accountId,
        propertyId: e.propertyId,
        kind: 'CHARGE',
        amountPaise: e.amountPaise,
        reservationId: e.reservationId ?? null,
        orderId: e.orderId ?? null,
        reference: e.reference ?? null,
        note: e.note ?? null,
        recordedBy: e.recordedBy ?? null,
      })
      .returning();
    return row;
  }

  /** Money received against the account. */
  async payment(
    propertyId: string,
    accountId: string,
    dto: { amountPaise: number; reference?: string; note?: string },
    recordedBy: string | null,
  ) {
    await this.require(propertyId, accountId);
    const [row] = await this.db
      .insert(corporateLedger)
      .values({
        accountId,
        propertyId,
        kind: 'PAYMENT',
        amountPaise: dto.amountPaise,
        reference: dto.reference ?? null,
        note: dto.note ?? null,
        recordedBy,
      })
      .returning();
    return row;
  }

  /** The statement: every entry with a running balance, plus the stays billed. */
  async statement(propertyId: string, accountId: string) {
    const account = await this.require(propertyId, accountId);
    const entries = await this.db
      .select()
      .from(corporateLedger)
      .where(eq(corporateLedger.accountId, accountId))
      .orderBy(asc(corporateLedger.createdAt));
    let running = 0;
    const lines = entries.map((e) => {
      running += e.kind === 'CHARGE' ? e.amountPaise : -e.amountPaise;
      return { ...e, runningBalancePaise: running };
    });
    const stays = await this.db
      .select({
        id: reservations.id,
        reservationNumber: reservations.reservationNumber,
        guestName: reservations.guestName,
        checkIn: reservations.checkIn,
        checkOut: reservations.checkOut,
        status: reservations.status,
        totalPaise: reservations.totalPaise,
        paidPaise: reservations.paidPaise,
      })
      .from(reservations)
      .where(and(eq(reservations.corporateAccountId, accountId), isNull(reservations.deletedAt)))
      .orderBy(desc(reservations.checkIn));
    return { account, balancePaise: running, entries: lines, stays };
  }
}
