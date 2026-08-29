import { Inject, Injectable, Logger } from '@nestjs/common';
import { and, asc, desc, eq, gte, ilike, inArray, lte, or, sql, SQL } from 'drizzle-orm';
import { DRIZZLE, Database } from '../../database/database.module';
import {
  notificationDeliveries,
  notificationTemplates,
  type NotificationChannelName,
} from '../../database/schema';
import { SmsTextNotConfiguredError } from '../shared-auth/sms/sms-provider.interface';
import { NOTIFICATION_CHANNELS, type ChannelRegistry } from './channels/channel.interface';
import { isUnavailable } from './channels/console.channel';
import { renderMessage, type TemplateVars } from './template-renderer';

/** Attempts before a delivery is abandoned. */
export const MAX_ATTEMPTS = 5;

/** 1m, 2m, 4m, 8m — exponential, in minutes, indexed by attempts already made. */
export function backoffMs(attempts: number): number {
  return Math.min(2 ** Math.max(0, attempts - 1), 32) * 60_000;
}

export interface NotifyTarget {
  channel: NotificationChannelName;
  /** An email address, a mobile number, or `admin|owner|staff:<uuid>`. */
  to: string;
}

export interface NotifyRequest {
  /** The `notification_templates.template_key` to render. */
  key: string;
  targets: NotifyTarget[];
  vars?: TemplateVars;
  relatedType?: string;
  relatedId?: string;
}

@Injectable()
export class NotificationDeliveryService {
  private readonly logger = new Logger(NotificationDeliveryService.name);

  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    @Inject(NOTIFICATION_CHANNELS) private readonly channels: ChannelRegistry,
  ) {}

  // ---------- Enqueue ----------

  /**
   * Renders and queues one delivery row per target.
   *
   * Rendering happens HERE, not at send time, so the delivery row preserves the
   * exact copy that was queued even if the template is later edited.
   *
   * A target whose channel has no template row is recorded as SKIPPED rather
   * than silently dropped — that is how "SMS was skipped because there is no
   * short body" becomes visible instead of an owner receiving a truncated
   * email in a text message.
   */
  async notify(req: NotifyRequest): Promise<void> {
    const targets = req.targets.filter((t) => t.to && t.to.trim().length > 0);
    if (targets.length === 0) return;

    const templates = await this.db
      .select()
      .from(notificationTemplates)
      .where(
        and(
          eq(notificationTemplates.templateKey, req.key),
          eq(notificationTemplates.status, 'Active'),
        ),
      );
    const byChannel = new Map(templates.map((t) => [t.channel, t]));

    for (const target of targets) {
      const template = byChannel.get(target.channel);
      if (!template) {
        await this.db.insert(notificationDeliveries).values({
          notificationKey: req.key,
          channel: target.channel,
          recipient: target.to,
          body: '',
          status: 'SKIPPED',
          lastError: `No active ${target.channel} template for ${req.key}`,
          relatedType: req.relatedType ?? null,
          relatedId: req.relatedId ?? null,
        });
        continue;
      }
      const rendered = renderMessage(req.key, target.channel, template, req.vars);
      await this.db.insert(notificationDeliveries).values({
        notificationKey: req.key,
        channel: target.channel,
        recipient: target.to,
        subject: rendered.subject?.slice(0, 255) ?? null,
        body: rendered.body,
        status: 'PENDING',
        relatedType: req.relatedType ?? null,
        relatedId: req.relatedId ?? null,
      });
    }
  }

  /**
   * The only form the event call sites use.
   *
   * Same discipline as `InvoicePdfService.generateQuietly`: telling somebody
   * about a fact must never be able to undo the fact. Call it AFTER the
   * transaction that produced the event has committed; it swallows and logs.
   */
  async notifyQuietly(req: NotifyRequest): Promise<void> {
    try {
      await this.notify(req);
    } catch (err) {
      this.logger.error(
        `Failed to enqueue notification ${req.key} — the originating action is unaffected`,
        err as Error,
      );
    }
  }

  /**
   * `notifyQuietly`, but at most once for a given (key, relatedType, relatedId).
   *
   * The lifecycle worker runs on a schedule and re-evaluates the same
   * subscriptions every day; without this an owner whose plan expires in 30
   * days would be told so 23 times. `relatedType` carries the variant (e.g.
   * `subscription.expiring.30`) so the 30-, 7- and 3-day warnings are distinct
   * events rather than one repeated one.
   */
  async notifyOnceQuietly(req: NotifyRequest & { relatedType: string; relatedId: string }) {
    try {
      const [existing] = await this.db
        .select({ id: notificationDeliveries.id })
        .from(notificationDeliveries)
        .where(
          and(
            eq(notificationDeliveries.notificationKey, req.key),
            eq(notificationDeliveries.relatedType, req.relatedType),
            eq(notificationDeliveries.relatedId, req.relatedId),
          ),
        )
        .limit(1);
      if (existing) return;
      await this.notify(req);
    } catch (err) {
      this.logger.error(
        `Failed to enqueue notification ${req.key} — the originating action is unaffected`,
        err as Error,
      );
    }
  }

  /**
   * The admins who should hear about a platform event, resolved from the RBAC
   * tables rather than a hard-coded role list — `'*'` (SUPER_ADMIN) counts.
   *
   * Used for the "tell the support desk" style notifications, where the
   * audience is "whoever is allowed to act on this", not a named person.
   */
  async adminsWithPermission(
    permissionKey: string,
  ): Promise<Array<{ id: string; name: string; email: string }>> {
    const res = await this.db.execute(sql`
      SELECT DISTINCT a.id, a.name, a.email
        FROM admins a
        JOIN admin_roles ar ON ar.admin_id = a.id
        JOIN role_permissions rp ON rp.role_id = ar.role_id
       WHERE a.deleted_at IS NULL
         AND a.status = 'Active'
         AND rp.permission_key IN (${permissionKey}, '*')
    `);
    return ((res as unknown as { rows?: Record<string, unknown>[] }).rows ?? []).map((r) => ({
      id: String(r.id),
      name: (r.name as string) ?? '',
      email: (r.email as string) ?? '',
    }));
  }

  // ---------- Drain ----------

  /**
   * Sends every due PENDING delivery.
   *
   * A provider that throws costs that one row an attempt and nothing else: the
   * loop is per-row try/catch, so one broken channel can never stop the queue.
   */
  async drain(limit = 50, now: Date = new Date()): Promise<{
    processed: number;
    sent: number;
    failed: number;
    skipped: number;
    retried: number;
  }> {
    const due = await this.db
      .select()
      .from(notificationDeliveries)
      .where(
        and(
          eq(notificationDeliveries.status, 'PENDING'),
          lte(notificationDeliveries.scheduledFor, now),
        ),
      )
      .orderBy(asc(notificationDeliveries.scheduledFor))
      .limit(limit);

    const stats = { processed: 0, sent: 0, failed: 0, skipped: 0, retried: 0 };

    for (const row of due) {
      stats.processed++;
      const channel = this.channels.get(row.channel as NotificationChannelName);
      if (!channel) {
        await this.mark(row.id, {
          status: 'SKIPPED',
          attempts: row.attempts + 1,
          lastError: `No implementation registered for channel ${row.channel}`,
        });
        stats.skipped++;
        continue;
      }
      if (isUnavailable(channel)) {
        // WHATSAPP / PUSH: no provider exists. Never mark these SENT.
        await channel.send(row.recipient, { subject: row.subject, body: row.body });
        await this.mark(row.id, {
          status: 'SKIPPED',
          attempts: row.attempts + 1,
          lastError: `${row.channel} delivery is not implemented`,
        });
        stats.skipped++;
        continue;
      }

      try {
        await channel.send(row.recipient, {
          subject: row.subject,
          body: row.body,
          relatedType: row.relatedType,
          relatedId: row.relatedId,
          notificationKey: row.notificationKey,
        });
        await this.mark(row.id, {
          status: 'SENT',
          attempts: row.attempts + 1,
          sentAt: now,
          lastError: null,
        });
        stats.sent++;
      } catch (err) {
        const attempts = row.attempts + 1;
        const message = ((err as Error)?.message ?? String(err)).slice(0, 2000);

        // No DLT template registered is a permanent condition, not a blip.
        if (err instanceof SmsTextNotConfiguredError) {
          await this.mark(row.id, { status: 'SKIPPED', attempts, lastError: message });
          stats.skipped++;
          continue;
        }

        if (attempts >= MAX_ATTEMPTS) {
          await this.mark(row.id, { status: 'FAILED', attempts, lastError: message });
          stats.failed++;
          this.logger.error(
            `Notification ${row.notificationKey}/${row.channel} to ${row.recipient} failed permanently after ${attempts} attempts: ${message}`,
          );
        } else {
          await this.mark(row.id, {
            status: 'PENDING',
            attempts,
            lastError: message,
            scheduledFor: new Date(now.getTime() + backoffMs(attempts)),
          });
          stats.retried++;
          this.logger.warn(
            `Notification ${row.notificationKey}/${row.channel} attempt ${attempts} failed, retrying: ${message}`,
          );
        }
      }
    }

    return stats;
  }

  private async mark(
    id: string,
    values: {
      status: string;
      attempts: number;
      lastError?: string | null;
      sentAt?: Date;
      scheduledFor?: Date;
    },
  ): Promise<void> {
    await this.db
      .update(notificationDeliveries)
      .set(values)
      .where(eq(notificationDeliveries.id, id));
  }

  // ---------- Admin visibility ----------

  async listDeliveries(params: {
    channel?: string;
    status?: string;
    q?: string;
    from?: string;
    to?: string;
    limit?: number;
    offset?: number;
  }) {
    const limit = Math.min(params.limit ?? 50, 200);
    const offset = params.offset ?? 0;
    const conds: SQL[] = [];
    if (params.channel) conds.push(eq(notificationDeliveries.channel, params.channel));
    if (params.status) {
      const wanted = params.status
        .split(',')
        .map((s) => s.trim().toUpperCase())
        .filter(Boolean);
      if (wanted.length) conds.push(inArray(notificationDeliveries.status, wanted));
    }
    if (params.q) {
      const term = `%${params.q}%`;
      conds.push(
        or(
          ilike(notificationDeliveries.recipient, term),
          ilike(notificationDeliveries.notificationKey, term),
          ilike(notificationDeliveries.subject, term),
        ) as SQL,
      );
    }
    if (params.from) conds.push(gte(notificationDeliveries.createdAt, new Date(params.from)));
    if (params.to) conds.push(lte(notificationDeliveries.createdAt, new Date(params.to)));
    const where = conds.length ? and(...conds) : undefined;

    const items = await this.db
      .select()
      .from(notificationDeliveries)
      .where(where)
      .orderBy(desc(notificationDeliveries.createdAt))
      .limit(limit)
      .offset(offset);
    const [{ count }] = await this.db
      .select({ count: sql<number>`count(*)::int` })
      .from(notificationDeliveries)
      .where(where);

    return { items, total: count, limit, offset };
  }
}
