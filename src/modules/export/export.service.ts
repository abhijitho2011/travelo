import { BadRequestException, Injectable } from '@nestjs/common';
import { AuditService } from '../audit/audit.service';
import { BillingService } from '../billing/billing.service';
import { OwnersService } from '../owners/owners.service';
import { PropertiesService } from '../properties/properties.service';
import { StaffService } from '../staff/staff.service';
import { SubscriptionsService } from '../subscriptions/subscriptions.service';
import { toCsvRow } from '../../common/csv/to-csv';

export const exportEntities = [
  'owners',
  'properties',
  'staff',
  'subscriptions',
  'payments',
  'invoices',
  'audit-logs',
] as const;
export type ExportEntity = (typeof exportEntities)[number];

/**
 * Permission each export requires: the same `.read`/`.view` an admin needs to
 * see the list in the console, so an export can never be a privilege escalation
 * dressed as a download. Audit logs additionally require `audit.export` —
 * bulk-extracting the audit trail is its own decision.
 */
export const EXPORT_PERMISSIONS: Record<ExportEntity, string[]> = {
  owners: ['owner.view'],
  properties: ['property.view'],
  staff: ['staff.read'],
  subscriptions: ['subscription.view'],
  payments: ['billing.view'],
  invoices: ['invoice.view'],
  'audit-logs': ['audit.view', 'audit.export'],
};

/**
 * Hard ceiling on one export. Streaming means memory is not the constraint,
 * but an unbounded query against a growing table is still a way to take the
 * database down by clicking a button.
 */
const MAX_ROWS = 50_000;
/** Each underlying list service caps a page at 200. */
const PAGE_SIZE = 200;

interface Column<T> {
  header: string;
  value: (row: T) => unknown;
}

function columns<T>(defs: Column<T>[]): Column<T>[] {
  return defs;
}

/**
 * CSV exports of the admin lists.
 *
 * Every entity reuses its module's own `list()` — the same filters, the same
 * joins, the same tenant rules the console sees. Nothing here builds a query,
 * so an export can never quietly diverge from the screen it was exported from.
 */
@Injectable()
export class ExportService {
  constructor(
    private readonly owners: OwnersService,
    private readonly properties: PropertiesService,
    private readonly staff: StaffService,
    private readonly subscriptions: SubscriptionsService,
    private readonly billing: BillingService,
    private readonly audit: AuditService,
  ) {}

  static isEntity(value: string): value is ExportEntity {
    return (exportEntities as readonly string[]).includes(value);
  }

  static assertEntity(value: string): ExportEntity {
    if (!ExportService.isEntity(value)) {
      throw new BadRequestException({
        error: 'UNKNOWN_EXPORT_ENTITY',
        message: `Unknown export entity "${value}". Expected one of: ${exportEntities.join(', ')}`,
      });
    }
    return value;
  }

  /** `owners-2026-08-29.csv` — dated, so a downloads folder stays legible. */
  static filename(entity: ExportEntity, now: Date = new Date()): string {
    return `${entity}-${now.toISOString().slice(0, 10)}.csv`;
  }

  /**
   * Yields CSV lines (each already CRLF-terminated) for one entity.
   *
   * A generator rather than a string: the controller pipes these straight to
   * the response, so a 50k-row export never sits in memory as one buffer.
   */
  async *rows(entity: ExportEntity, query: Record<string, string>): AsyncGenerator<string> {
    const spec = this.spec(entity, query);
    yield toCsvRow(spec.columns.map((c) => c.header)) + '\r\n';

    let offset = 0;
    for (;;) {
      const page = await spec.fetch(offset, PAGE_SIZE);
      for (const row of page) {
        yield toCsvRow(spec.columns.map((c) => c.value(row))) + '\r\n';
      }
      offset += page.length;
      if (page.length < PAGE_SIZE || offset >= MAX_ROWS) break;
    }
  }

  /** Column layout + a paging fetch, per entity. */
  private spec(
    entity: ExportEntity,
    q: Record<string, string>,
  ): {
    columns: Column<never>[];
    fetch: (offset: number, limit: number) => Promise<never[]>;
  } {
    const page = <T>(p: Promise<{ items: T[] }>) => p.then((r) => r.items as never[]);

    switch (entity) {
      case 'owners':
        return {
          columns: columns<Record<string, unknown>>([
            { header: 'id', value: (r) => r.id },
            { header: 'name', value: (r) => r.name },
            { header: 'email', value: (r) => r.email },
            { header: 'phone', value: (r) => r.phone },
            { header: 'company', value: (r) => r.company },
            { header: 'gstNumber', value: (r) => r.gstNumber },
            { header: 'city', value: (r) => r.city },
            { header: 'state', value: (r) => r.state },
            { header: 'district', value: (r) => r.district },
            { header: 'country', value: (r) => r.country },
            { header: 'pinCode', value: (r) => r.pinCode },
            { header: 'status', value: (r) => r.status },
            { header: 'createdAt', value: (r) => r.createdAt },
            { header: 'lastActiveAt', value: (r) => r.lastActiveAt },
          ]) as Column<never>[],
          fetch: (offset, limit) =>
            page(
              this.owners.list({
                limit,
                offset,
                q: q.q,
                status: q.status,
                stateId: q.stateId,
                districtId: q.districtId,
              }),
            ),
        };

      case 'properties':
        return {
          columns: columns<Record<string, unknown>>([
            { header: 'id', value: (r) => r.id },
            { header: 'name', value: (r) => r.name },
            { header: 'owner', value: (r) => r.owner ?? r.ownerName },
            { header: 'ownerId', value: (r) => r.ownerId },
            { header: 'city', value: (r) => r.city },
            { header: 'state', value: (r) => r.state },
            { header: 'country', value: (r) => r.country },
            { header: 'status', value: (r) => r.status },
            { header: 'roomCount', value: (r) => r.roomCount },
            { header: 'createdAt', value: (r) => r.createdAt },
          ]) as Column<never>[],
          fetch: (offset, limit) =>
            page(
              this.properties.list({
                limit,
                offset,
                q: q.q,
                status: q.status,
                ownerId: q.ownerId,
                state: q.state,
                district: q.district,
              }),
            ),
        };

      case 'staff':
        return {
          columns: columns<Record<string, unknown>>([
            { header: 'id', value: (r) => r.id },
            {
              header: 'name',
              value: (r) => r.name ?? `${r.firstName ?? ''} ${r.lastName ?? ''}`.trim(),
            },
            { header: 'email', value: (r) => r.email },
            { header: 'mobile', value: (r) => r.mobile ?? r.phone },
            { header: 'role', value: (r) => r.role },
            { header: 'status', value: (r) => r.status },
            { header: 'property', value: (r) => r.property ?? r.propertyName },
            { header: 'propertyId', value: (r) => r.propertyId },
            { header: 'owner', value: (r) => r.owner ?? r.ownerName },
            { header: 'ownerId', value: (r) => r.ownerId },
            { header: 'createdAt', value: (r) => r.createdAt },
          ]) as Column<never>[],
          fetch: (offset, limit) =>
            page(
              this.staff.list({
                limit,
                offset,
                q: q.q,
                state: q.state,
                propertyId: q.propertyId,
                ownerId: q.ownerId,
                role: q.role,
                status: q.status,
              }),
            ),
        };

      case 'subscriptions':
        return {
          columns: columns<Record<string, unknown>>([
            { header: 'id', value: (r) => r.id },
            { header: 'owner', value: (r) => r.owner },
            { header: 'ownerId', value: (r) => r.ownerId },
            { header: 'plan', value: (r) => r.plan },
            { header: 'status', value: (r) => r.status },
            { header: 'cycle', value: (r) => r.cycle },
            { header: 'autoRenew', value: (r) => r.autoRenew },
            { header: 'startsAt', value: (r) => r.startsAt },
            { header: 'currentPeriodStart', value: (r) => r.currentPeriodStart },
            { header: 'currentPeriodEnd', value: (r) => r.currentPeriodEnd },
            { header: 'propertyLimit', value: (r) => r.propertyLimit },
            { header: 'priceOverride', value: (r) => r.priceOverride },
            { header: 'createdAt', value: (r) => r.createdAt },
          ]) as Column<never>[],
          fetch: (offset, limit) =>
            page(
              this.subscriptions.list({
                limit,
                offset,
                ownerId: q.ownerId,
                status: q.status,
              }),
            ),
        };

      case 'payments':
        return {
          columns: columns<Record<string, unknown>>([
            { header: 'id', value: (r) => r.id },
            { header: 'owner', value: (r) => r.owner },
            { header: 'ownerId', value: (r) => r.ownerId },
            { header: 'subscriptionId', value: (r) => r.subscriptionId },
            { header: 'invoiceId', value: (r) => r.invoiceId },
            { header: 'gateway', value: (r) => r.gateway },
            { header: 'gatewayRef', value: (r) => r.gatewayRef },
            { header: 'amountPaise', value: (r) => r.amount },
            { header: 'currency', value: (r) => r.currency },
            { header: 'status', value: (r) => r.status },
            { header: 'method', value: (r) => r.method },
            { header: 'capturedAt', value: (r) => r.capturedAt },
            { header: 'createdAt', value: (r) => r.createdAt },
          ]) as Column<never>[],
          fetch: (offset, limit) =>
            page(
              this.billing.listPayments({
                limit,
                offset,
                ownerId: q.ownerId,
                status: q.status,
                failedOnly: q.failedOnly === 'true',
              }),
            ),
        };

      case 'invoices':
        return {
          columns: columns<Record<string, unknown>>([
            { header: 'id', value: (r) => r.id },
            { header: 'invoiceNumber', value: (r) => r.invoiceNumber },
            { header: 'owner', value: (r) => r.owner },
            { header: 'ownerId', value: (r) => r.ownerId },
            { header: 'subscriptionId', value: (r) => r.subscriptionId },
            { header: 'billingPeriodStart', value: (r) => r.billingPeriodStart },
            { header: 'billingPeriodEnd', value: (r) => r.billingPeriodEnd },
            { header: 'subtotalPaise', value: (r) => r.subtotal },
            { header: 'taxPaise', value: (r) => r.tax },
            { header: 'discountPaise', value: (r) => r.discount },
            { header: 'totalPaise', value: (r) => r.total },
            { header: 'currency', value: (r) => r.currency },
            { header: 'status', value: (r) => r.status },
            { header: 'issuedAt', value: (r) => r.issuedAt },
            { header: 'dueDate', value: (r) => r.dueDate },
            { header: 'paidAt', value: (r) => r.paidAt },
            { header: 'hasDocument', value: (r) => !!r.storageKey },
          ]) as Column<never>[],
          fetch: (offset, limit) =>
            page(
              this.billing.listInvoices({
                limit,
                offset,
                ownerId: q.ownerId,
                status: q.status,
              }),
            ),
        };

      case 'audit-logs':
        return {
          columns: columns<Record<string, unknown>>([
            { header: 'id', value: (r) => r.id },
            { header: 'at', value: (r) => r.createdAt },
            { header: 'actor', value: (r) => r.actorEmail },
            { header: 'actorId', value: (r) => r.actorId },
            { header: 'role', value: (r) => r.actorRole },
            { header: 'action', value: (r) => r.action },
            { header: 'entity', value: (r) => r.entity },
            { header: 'entityId', value: (r) => r.entityId },
            { header: 'reason', value: (r) => r.reason },
            { header: 'ip', value: (r) => r.ip },
            { header: 'userAgent', value: (r) => r.userAgent },
            { header: 'before', value: (r) => r.before },
            { header: 'after', value: (r) => r.after },
          ]) as Column<never>[],
          fetch: (offset, limit) =>
            this.audit
              .list({
                limit,
                offset,
                actorId: q.actorId,
                entity: q.entity,
                entityId: q.entityId,
              })
              .then((r) => r.rows as never[]),
        };
    }
  }
}
