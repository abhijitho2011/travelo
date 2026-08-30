import { Inject, Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { and, desc, eq, isNull } from 'drizzle-orm';
import { DRIZZLE, Database } from '../../database/database.module';
import { expenses, purchaseOrders } from '../../database/schema';
import { AuditService } from '../audit/audit.service';

export interface ApprovalItemDto {
  id: string;
  type: 'expense' | 'purchase';
  title: string;
  subtitle: string | null;
  amount: number | null; // rupees — the app formats it directly
  createdAt: Date;
}

/**
 * The GM/AGM approval queue the staff app expected but the server never served.
 *
 * Two things wait on a manager's word: DRAFT expenses (approve = move to
 * APPROVED so finance can pay them) and DRAFT purchase orders (approve = SEND
 * to the supplier). Both are folded into one queue, alongside the pending-staff
 * items the app already pulls from /team. Approve/reject resolve the id against
 * whichever table owns it, so the app can post to /approvals/:id without knowing
 * the kind.
 */
@Injectable()
export class ApprovalsService {
  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    private readonly audit: AuditService,
  ) {}

  async list(propertyId: string): Promise<ApprovalItemDto[]> {
    const [pos, exps] = await Promise.all([
      this.db
        .select()
        .from(purchaseOrders)
        .where(
          and(
            eq(purchaseOrders.propertyId, propertyId),
            eq(purchaseOrders.status, 'DRAFT'),
            isNull(purchaseOrders.deletedAt),
          ),
        )
        .orderBy(desc(purchaseOrders.createdAt)),
      this.db
        .select()
        .from(expenses)
        .where(
          and(
            eq(expenses.propertyId, propertyId),
            eq(expenses.status, 'DRAFT'),
            isNull(expenses.deletedAt),
          ),
        )
        .orderBy(desc(expenses.createdAt)),
    ]);

    return [
      ...pos.map((po): ApprovalItemDto => ({
        id: po.id,
        type: 'purchase',
        title: `Purchase order ${po.poNumber}`,
        subtitle: po.supplierName ?? 'Purchase order',
        amount: po.totalPaise / 100,
        createdAt: po.createdAt,
      })),
      ...exps.map((e): ApprovalItemDto => ({
        id: e.id,
        type: 'expense',
        title: e.vendor?.trim() ? e.vendor : `Expense — ${e.category}`,
        subtitle: `Expense · ${e.category}`,
        amount: e.amountPaise / 100,
        createdAt: e.createdAt,
      })),
    ];
  }

  /** Resolves the id against expenses, then purchase orders. */
  async decide(
    propertyId: string,
    id: string,
    approve: boolean,
    reason: string | null,
    actor: { id: string; email: string; role: string },
  ) {
    const [exp] = await this.db
      .select()
      .from(expenses)
      .where(
        and(eq(expenses.id, id), eq(expenses.propertyId, propertyId), isNull(expenses.deletedAt)),
      )
      .limit(1);
    if (exp) {
      if (exp.status !== 'DRAFT') throw new ConflictException('Expense is not awaiting approval');
      if (approve) {
        await this.db
          .update(expenses)
          .set({ status: 'APPROVED', updatedAt: new Date() })
          .where(eq(expenses.id, id));
      } else {
        // No REJECTED status for an expense — a rejected one is withdrawn
        // (soft-deleted), so the ledger keeps the row and its reason.
        await this.db
          .update(expenses)
          .set({ deletedAt: new Date(), updatedAt: new Date() })
          .where(eq(expenses.id, id));
      }
      await this.record('expense', id, approve, reason, actor);
      return { id, type: 'expense', approved: approve };
    }

    const [po] = await this.db
      .select()
      .from(purchaseOrders)
      .where(
        and(
          eq(purchaseOrders.id, id),
          eq(purchaseOrders.propertyId, propertyId),
          isNull(purchaseOrders.deletedAt),
        ),
      )
      .limit(1);
    if (po) {
      if (po.status !== 'DRAFT')
        throw new ConflictException('Purchase order is not awaiting approval');
      await this.db
        .update(purchaseOrders)
        .set({ status: approve ? 'SENT' : 'CANCELLED', updatedAt: new Date() })
        .where(eq(purchaseOrders.id, id));
      await this.record('purchase', id, approve, reason, actor);
      return { id, type: 'purchase', approved: approve };
    }

    throw new NotFoundException('Nothing awaiting approval with that id');
  }

  private async record(
    kind: string,
    id: string,
    approve: boolean,
    reason: string | null,
    actor: { id: string; email: string; role: string },
  ) {
    await this.audit.record({
      action: `staff.approval.${approve ? 'approved' : 'rejected'}`,
      entity: kind,
      entityId: id,
      after: { approved: approve, reason },
      actorId: actor.id,
      actorEmail: actor.email,
      actorRole: actor.role,
    });
  }
}
