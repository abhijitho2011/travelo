import { Inject, Injectable, NotFoundException, Optional } from '@nestjs/common';
import { and, desc, eq, isNull, sql } from 'drizzle-orm';
import { DRIZZLE, Database } from '../../database/database.module';
import {
  conversations,
  messages,
  properties,
  propertySettings,
  reservations,
  stayAutomationsSent,
  type MessageChannel,
} from '../../database/schema';
import { NotificationDeliveryService } from '../notifications/notification-delivery.service';
import { RealtimeService } from '../realtime/realtime.service';
import { addDays } from '../reservations/reservation-rules';

type Tx = Pick<Database, 'select' | 'insert' | 'update'>;

/**
 * Conversations: one thread per guest, every message in both directions.
 *
 * Outbound goes through the notifications pipeline (SMS / EMAIL / WHATSAPP
 * providers, retries, delivery log) using the `guest.message` template, so a
 * typed message and an automated one travel the same road. Inbound arrives
 * on a provider-agnostic webhook and lands as an unread message on the
 * guest's thread, with a live event to the desk.
 */
@Injectable()
export class ConversationsService {
  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    @Optional() private readonly notifications?: NotificationDeliveryService,
    @Optional() private readonly realtime?: RealtimeService,
  ) {}

  list(propertyId: string, limit = 100) {
    return this.db
      .select()
      .from(conversations)
      .where(eq(conversations.propertyId, propertyId))
      .orderBy(desc(conversations.lastMessageAt))
      .limit(limit);
  }

  async thread(propertyId: string, id: string) {
    const [c] = await this.db
      .select()
      .from(conversations)
      .where(and(eq(conversations.id, id), eq(conversations.propertyId, propertyId)))
      .limit(1);
    if (!c)
      throw new NotFoundException({
        error: 'CONVERSATION_NOT_FOUND',
        message: 'Conversation not found',
      });
    const rows = await this.db
      .select()
      .from(messages)
      .where(eq(messages.conversationId, id))
      .orderBy(messages.createdAt);
    if (c.unreadCount > 0)
      await this.db.update(conversations).set({ unreadCount: 0 }).where(eq(conversations.id, id));
    return { conversation: { ...c, unreadCount: 0 }, messages: rows };
  }

  /** The thread for a guest — by reservation, else by phone — created on first use. */
  async threadFor(
    propertyId: string,
    who: {
      reservationId?: string | null;
      phone?: string | null;
      email?: string | null;
      name?: string | null;
    },
    tx: Tx = this.db,
  ) {
    const conds = [eq(conversations.propertyId, propertyId)];
    if (who.reservationId) conds.push(eq(conversations.reservationId, who.reservationId));
    else if (who.phone) conds.push(eq(conversations.guestPhone, who.phone));
    else if (who.email) conds.push(eq(conversations.guestEmail, who.email));
    const [existing] = await tx
      .select()
      .from(conversations)
      .where(and(...conds))
      .limit(1);
    if (existing) return existing;
    const [created] = await tx
      .insert(conversations)
      .values({
        propertyId,
        reservationId: who.reservationId ?? null,
        guestName: who.name ?? null,
        guestPhone: who.phone ?? null,
        guestEmail: who.email ?? null,
      })
      .returning();
    return created;
  }

  /** Staff (or an automation) writes to the guest. */
  async send(
    propertyId: string,
    input: {
      conversationId?: string;
      reservationId?: string;
      channel: MessageChannel;
      body: string;
      origin?: 'MANUAL' | 'AUTOMATION';
      automationKey?: string;
      sentBy?: string | null;
    },
  ) {
    let thread;
    if (input.conversationId) {
      const [c] = await this.db
        .select()
        .from(conversations)
        .where(
          and(eq(conversations.id, input.conversationId), eq(conversations.propertyId, propertyId)),
        )
        .limit(1);
      if (!c)
        throw new NotFoundException({
          error: 'CONVERSATION_NOT_FOUND',
          message: 'Conversation not found',
        });
      thread = c;
    } else if (input.reservationId) {
      const [r] = await this.db
        .select()
        .from(reservations)
        .where(
          and(eq(reservations.id, input.reservationId), eq(reservations.propertyId, propertyId)),
        )
        .limit(1);
      if (!r)
        throw new NotFoundException({
          error: 'RESERVATION_NOT_FOUND',
          message: 'Reservation not found',
        });
      thread = await this.threadFor(propertyId, {
        reservationId: r.id,
        phone: r.guestPhone,
        email: r.guestEmail,
        name: r.guestName,
      });
    } else {
      throw new NotFoundException({
        error: 'CONVERSATION_NOT_FOUND',
        message: 'Say who to write to',
      });
    }

    const [msg] = await this.db
      .insert(messages)
      .values({
        conversationId: thread.id,
        propertyId,
        direction: 'OUT',
        channel: input.channel,
        body: input.body,
        status: input.channel === 'INTERNAL' ? 'SENT' : 'QUEUED',
        origin: input.origin ?? 'MANUAL',
        automationKey: input.automationKey ?? null,
        sentBy: input.sentBy ?? null,
      })
      .returning();
    await this.touch(thread.id, input.body);

    if (input.channel !== 'INTERNAL') {
      const to = input.channel === 'EMAIL' ? thread.guestEmail : thread.guestPhone;
      const [prop] = await this.db
        .select({ name: properties.name })
        .from(properties)
        .where(eq(properties.id, propertyId))
        .limit(1);
      if (to && this.notifications) {
        await this.notifications.notifyQuietly({
          key: 'guest.message',
          relatedType: 'message',
          relatedId: msg.id,
          targets: [{ channel: input.channel, to }],
          vars: { body: input.body, propertyName: prop?.name ?? '' },
        });
        await this.db.update(messages).set({ status: 'SENT' }).where(eq(messages.id, msg.id));
      } else {
        await this.db.update(messages).set({ status: 'FAILED' }).where(eq(messages.id, msg.id));
      }
    }
    this.realtime?.emit(propertyId, 'message.sent', { conversationId: thread.id, id: msg.id });
    return msg;
  }

  /** A guest wrote in (webhook). Matched to a thread by phone or email. */
  async receive(
    propertyId: string,
    input: { channel: MessageChannel; from: string; body: string; name?: string },
  ) {
    const isEmail = input.from.includes('@');
    const thread = await this.threadFor(propertyId, {
      phone: isEmail ? null : input.from,
      email: isEmail ? input.from : null,
      name: input.name,
    });
    const [msg] = await this.db
      .insert(messages)
      .values({
        conversationId: thread.id,
        propertyId,
        direction: 'IN',
        channel: input.channel,
        body: input.body,
        status: 'RECEIVED',
        origin: 'GUEST',
      })
      .returning();
    await this.touch(thread.id, input.body, true);
    this.realtime?.emit(propertyId, 'message.received', { conversationId: thread.id, id: msg.id });
    return msg;
  }

  private async touch(conversationId: string, preview: string, unread = false) {
    await this.db
      .update(conversations)
      .set({
        lastMessageAt: new Date(),
        lastPreview: preview.slice(0, 200),
        ...(unread ? { unreadCount: sql`${conversations.unreadCount} + 1` } : {}),
      })
      .where(eq(conversations.id, conversationId));
  }

  // ---------------------------------------------------------- automations --

  /**
   * Pre-stay / post-stay messages, once per reservation per key:
   *   stay.pre_arrival    the day before check-in (CONFIRMED stays)
   *   stay.review_request the day after check-out (CHECKED_OUT stays), when
   *                       the property has a review URL
   * Run hourly; the sent-table makes re-runs harmless.
   */
  async runAutomations(now: Date = new Date()): Promise<{ preArrival: number; reviews: number }> {
    const today = now.toISOString().slice(0, 10);
    const tomorrow = addDays(today, 1);
    const yesterday = addDays(today, -1);
    let preArrival = 0;
    let reviews = 0;

    const arriving = await this.db
      .select()
      .from(reservations)
      .where(
        and(
          eq(reservations.checkIn, tomorrow),
          eq(reservations.status, 'CONFIRMED'),
          isNull(reservations.deletedAt),
        ),
      );
    for (const r of arriving) {
      if (await this.alreadySent(r.id, 'stay.pre_arrival')) continue;
      const [s] = await this.db
        .select()
        .from(propertySettings)
        .where(eq(propertySettings.propertyId, r.propertyId))
        .limit(1);
      const [prop] = await this.db
        .select({ name: properties.name })
        .from(properties)
        .where(eq(properties.id, r.propertyId))
        .limit(1);
      const body = `We look forward to welcoming you tomorrow (booking ${r.reservationNumber}). Check-in is from ${s?.checkinTime ?? '14:00'}.${s?.guestInstructions ? `\n\n${s.guestInstructions}` : ''}\n\n— ${prop?.name ?? ''}`;
      await this.send(r.propertyId, {
        reservationId: r.id,
        channel: r.guestPhone ? 'SMS' : 'EMAIL',
        body,
        origin: 'AUTOMATION',
        automationKey: 'stay.pre_arrival',
      });
      await this.markSent(r.id, 'stay.pre_arrival');
      preArrival += 1;
    }

    const departed = await this.db
      .select()
      .from(reservations)
      .where(
        and(
          eq(reservations.checkOut, yesterday),
          eq(reservations.status, 'CHECKED_OUT'),
          isNull(reservations.deletedAt),
        ),
      );
    for (const r of departed) {
      if (await this.alreadySent(r.id, 'stay.review_request')) continue;
      const [s] = await this.db
        .select({ reviewUrl: propertySettings.reviewUrl })
        .from(propertySettings)
        .where(eq(propertySettings.propertyId, r.propertyId))
        .limit(1);
      if (!s?.reviewUrl) continue;
      const [prop] = await this.db
        .select({ name: properties.name })
        .from(properties)
        .where(eq(properties.id, r.propertyId))
        .limit(1);
      const body = `Thank you for staying with us. A quick review would mean a great deal: ${s.reviewUrl}\n\n— ${prop?.name ?? ''}`;
      await this.send(r.propertyId, {
        reservationId: r.id,
        channel: r.guestEmail ? 'EMAIL' : 'SMS',
        body,
        origin: 'AUTOMATION',
        automationKey: 'stay.review_request',
      });
      await this.markSent(r.id, 'stay.review_request');
      reviews += 1;
    }
    return { preArrival, reviews };
  }

  private async alreadySent(reservationId: string, key: string): Promise<boolean> {
    const [row] = await this.db
      .select({ k: stayAutomationsSent.automationKey })
      .from(stayAutomationsSent)
      .where(
        and(
          eq(stayAutomationsSent.reservationId, reservationId),
          eq(stayAutomationsSent.automationKey, key),
        ),
      )
      .limit(1);
    return !!row;
  }

  private async markSent(reservationId: string, key: string): Promise<void> {
    await this.db
      .insert(stayAutomationsSent)
      .values({ reservationId, automationKey: key })
      .onConflictDoNothing();
  }
}
