import { Inject, Injectable } from '@nestjs/common';
import { and, desc, eq, isNull, SQL, sql } from 'drizzle-orm';
import { DRIZZLE, Database } from '../../database/database.module';
import {
  expenses,
  type Expense,
  type ExpenseCategory,
  type ExpenseStatus,
} from '../../database/schema';
import { CreateExpenseDto, ExpenseFilterDto, UpdateExpenseDto } from './dto';
import { AccountsErrors } from './accounts-errors';
import { assertExpenseTransition } from './accounts-rules';

/**
 * The expense register, per property. Tenant isolation runs through every
 * method: an expense is only ever resolved by (id, propertyId = the caller's
 * own, deletedAt IS NULL). A foreign id 404s, never 403.
 */
@Injectable()
export class ExpensesService {
  constructor(@Inject(DRIZZLE) private readonly db: Database) {}

  static toDto(e: Expense) {
    return {
      id: e.id,
      propertyId: e.propertyId,
      category: e.category,
      amountPaise: e.amountPaise,
      vendor: e.vendor,
      incurredOn: e.incurredOn,
      note: e.note,
      status: e.status,
      createdBy: e.createdBy,
      createdAt: e.createdAt,
      updatedAt: e.updatedAt,
    };
  }

  async requireExpense(propertyId: string, id: string): Promise<Expense> {
    const [row] = await this.db
      .select()
      .from(expenses)
      .where(
        and(eq(expenses.id, id), eq(expenses.propertyId, propertyId), isNull(expenses.deletedAt)),
      )
      .limit(1);
    if (!row) throw AccountsErrors.expenseNotFound();
    return row;
  }

  async list(propertyId: string, params: ExpenseFilterDto = {}) {
    const conds: SQL[] = [eq(expenses.propertyId, propertyId), isNull(expenses.deletedAt)];
    if (params.status) conds.push(eq(expenses.status, params.status));
    if (params.category) conds.push(eq(expenses.category, params.category));
    const limit = Math.min(params.limit ?? 50, 200);
    const offset = params.offset ?? 0;

    const rows = await this.db
      .select()
      .from(expenses)
      .where(and(...conds))
      .orderBy(desc(expenses.incurredOn), desc(expenses.createdAt))
      .limit(limit)
      .offset(offset);

    const [{ count }] = await this.db
      .select({ count: sql<number>`count(*)::int` })
      .from(expenses)
      .where(and(...conds));

    return { items: rows.map(ExpensesService.toDto), total: count, limit, offset };
  }

  async get(propertyId: string, id: string) {
    return ExpensesService.toDto(await this.requireExpense(propertyId, id));
  }

  async create(propertyId: string, dto: CreateExpenseDto, createdBy: string) {
    const [row] = await this.db
      .insert(expenses)
      .values({
        propertyId,
        category: dto.category as ExpenseCategory,
        amountPaise: dto.amountPaise,
        vendor: dto.vendor?.trim() || null,
        incurredOn: dto.incurredOn ? new Date(dto.incurredOn) : new Date(),
        note: dto.note?.trim() || null,
        createdBy,
      })
      .returning();
    return ExpensesService.toDto(row);
  }

  async update(propertyId: string, id: string, dto: UpdateExpenseDto) {
    const before = await this.requireExpense(propertyId, id);
    const patch: Partial<typeof expenses.$inferInsert> = { updatedAt: new Date() };
    if (dto.category !== undefined) patch.category = dto.category as ExpenseCategory;
    if (dto.amountPaise !== undefined) patch.amountPaise = dto.amountPaise;
    if (dto.vendor !== undefined) patch.vendor = dto.vendor.trim() || null;
    if (dto.incurredOn !== undefined) patch.incurredOn = new Date(dto.incurredOn);
    if (dto.note !== undefined) patch.note = dto.note.trim() || null;

    const [after] = await this.db
      .update(expenses)
      .set(patch)
      .where(eq(expenses.id, id))
      .returning();
    return { before: ExpensesService.toDto(before), after: ExpensesService.toDto(after) };
  }

  /** Walk the DRAFT → APPROVED → PAID lifecycle, validated by the state machine. */
  async setStatus(propertyId: string, id: string, to: ExpenseStatus) {
    const before = await this.requireExpense(propertyId, id);
    assertExpenseTransition(before.status, to);
    const [after] = await this.db
      .update(expenses)
      .set({ status: to, updatedAt: new Date() })
      .where(eq(expenses.id, id))
      .returning();
    return { before: ExpensesService.toDto(before), after: ExpensesService.toDto(after) };
  }

  async remove(propertyId: string, id: string) {
    const before = await this.requireExpense(propertyId, id);
    await this.db
      .update(expenses)
      .set({ deletedAt: new Date(), updatedAt: new Date() })
      .where(eq(expenses.id, id));
    return { id, deleted: true, before: ExpensesService.toDto(before) };
  }
}
