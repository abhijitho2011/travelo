import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { createHash, randomBytes } from 'node:crypto';
import { and, asc, desc, eq, gt, gte, isNull, lt, or, type SQL } from 'drizzle-orm';
import { DRIZZLE, Database } from '../../database/database.module';
import {
  guestLinks,
  properties,
  propertySettings,
  reservations,
  roomTypes,
  rooms,
} from '../../database/schema';
import { FolioService } from '../folio/folio.service';
import { NotificationDeliveryService } from '../notifications/notification-delivery.service';
import { PropertyConfigService } from '../property-config/property-config.service';
import { RealtimeService } from '../realtime/realtime.service';
import { addDays, nightsBetween, today } from '../reservations/reservation-rules';
import { ReservationsService } from '../reservations/reservations.service';
import { StorageService } from '../storage/storage.service';

/** A link lives until the day after checkout. */
const LINK_TTL_AFTER_CHECKOUT_MS = 24 * 3600_000;
const MAX_UPLOAD_BYTES = 8 * 1024 * 1024;
export type GuestLinkWindow = 'today' | 'week' | 'all';
const GUEST_LINK_LIST_LIMIT = 500;

const IMAGE_MIME: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'application/pdf': 'pdf',
};

/**
 * The contactless guest journey — the "magic link".
 *
 * One link per reservation. The token is random, sent to the guest, and only
 * its hash is stored, so a database read cannot forge a link. With it a guest
 * checks in online (details, ID proof, photo), reads arrival instructions,
 * picks add-on services that post straight to the folio, and asks to check
 * out. Everything a guest does is visible to the desk immediately.
 */
@Injectable()
export class GuestJourneyService {
  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    private readonly reservations: ReservationsService,
    private readonly folio: FolioService,
    private readonly config: PropertyConfigService,
    private readonly storage: StorageService,
    @Optional() private readonly notifications?: NotificationDeliveryService,
    @Optional() private readonly realtime?: RealtimeService,
  ) {}

  static hash(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  /** The public URL the guest opens. Env-driven; never a hard-coded host. */
  private linkUrl(token: string): string {
    const base = (process.env['GUEST_PORTAL_URL'] ?? process.env['PUBLIC_WEB_URL'] ?? '').replace(
      /\/$/,
      '',
    );
    return `${base}/stay/${token}`;
  }

  /**
   * Issue (or re-issue) the link and send it. Re-sending mints a new token
   * and retires the old one — the guest always holds exactly one live link.
   */
  async issue(propertyId: string, reservationId: string, actorStaffId: string | null) {
    const r = await this.reservations.requireReservation(propertyId, reservationId);
    if (r.status === 'CANCELLED' || r.status === 'NO_SHOW' || r.status === 'CHECKED_OUT') {
      throw new BadRequestException({ error: 'STAY_NOT_ACTIVE', message: 'This stay is over' });
    }
    const token = randomBytes(24).toString('base64url');
    const expiresAt = new Date(
      new Date(`${r.checkOut}T00:00:00Z`).getTime() + LINK_TTL_AFTER_CHECKOUT_MS,
    );
    await this.db.delete(guestLinks).where(eq(guestLinks.reservationId, reservationId));
    const [link] = await this.db
      .insert(guestLinks)
      .values({
        propertyId,
        reservationId,
        tokenHash: GuestJourneyService.hash(token),
        expiresAt,
        sentAt: new Date(),
      })
      .returning();

    const [prop] = await this.db
      .select({ name: properties.name })
      .from(properties)
      .where(eq(properties.id, propertyId))
      .limit(1);
    const url = this.linkUrl(token);
    await this.notifications?.notifyQuietly({
      key: 'guest.magic_link',
      relatedType: 'reservation',
      relatedId: reservationId,
      targets: [
        { channel: 'SMS', to: r.guestPhone ?? '' },
        { channel: 'EMAIL', to: r.guestEmail ?? '' },
      ],
      vars: {
        guestName: r.guestName,
        reservationNumber: r.reservationNumber,
        propertyName: prop?.name ?? 'the hotel',
        checkIn: r.checkIn,
        link: url,
      },
    });
    void actorStaffId;
    return { id: link.id, url, expiresAt, sentTo: { phone: r.guestPhone, email: r.guestEmail } };
  }

  /** Resolve a token to its live link + reservation, or 404 with no detail. */
  async resolve(token: string) {
    const [link] = await this.db
      .select()
      .from(guestLinks)
      .where(
        and(
          eq(guestLinks.tokenHash, GuestJourneyService.hash(token)),
          gt(guestLinks.expiresAt, new Date()),
        ),
      )
      .limit(1);
    if (!link)
      throw new NotFoundException({
        error: 'LINK_NOT_FOUND',
        message: 'This link is not valid any more',
      });
    const [r] = await this.db
      .select()
      .from(reservations)
      .where(and(eq(reservations.id, link.reservationId), isNull(reservations.deletedAt)))
      .limit(1);
    if (!r)
      throw new NotFoundException({
        error: 'LINK_NOT_FOUND',
        message: 'This link is not valid any more',
      });
    if (!link.openedAt)
      await this.db
        .update(guestLinks)
        .set({ openedAt: new Date() })
        .where(eq(guestLinks.id, link.id));
    return { link, r };
  }

  /** What the guest sees: their stay, the hotel's instructions, the services on offer. */
  async page(token: string) {
    const { link, r } = await this.resolve(token);
    const [prop] = await this.db
      .select({
        name: properties.name,
        city: properties.city,
        contact: properties.contact,
        address: properties.address,
      })
      .from(properties)
      .where(eq(properties.id, r.propertyId))
      .limit(1);
    const [settings] = await this.db
      .select()
      .from(propertySettings)
      .where(eq(propertySettings.propertyId, r.propertyId))
      .limit(1);
    const [type] = await this.db
      .select({ name: roomTypes.name })
      .from(roomTypes)
      .where(eq(roomTypes.id, r.roomTypeId))
      .limit(1);
    const [room] = r.roomId
      ? await this.db
          .select({ number: rooms.number })
          .from(rooms)
          .where(eq(rooms.id, r.roomId))
          .limit(1)
      : [null];
    const addons = (await this.config.listAddons(r.propertyId)).filter(
      (a) => a.isActive && a.sellOnline,
    );
    const summary = await this.folio.summary(r.id);
    return {
      property: {
        name: prop?.name,
        city: prop?.city,
        contact: prop?.contact,
        address: prop?.address,
      },
      stay: {
        reservationNumber: r.reservationNumber,
        guestName: r.guestName,
        status: r.status,
        checkIn: r.checkIn,
        checkOut: r.checkOut,
        nights: nightsBetween(r.checkIn, r.checkOut),
        adults: r.adults,
        children: r.children,
        roomTypeName: type?.name ?? null,
        roomNumber: room?.number ?? null,
        checkinTime: settings?.checkinTime ?? '14:00',
        checkoutTime: settings?.checkoutTime ?? '11:00',
      },
      instructions: settings?.guestInstructions ?? null,
      checkin: {
        submittedAt: link.checkinSubmittedAt,
        hasIdProof: !!r.guestIdProofKey,
        hasPhoto: !!r.guestPhotoKey,
        idType: r.guestIdType,
        idNumber: r.guestIdNumber ? `••••${r.guestIdNumber.slice(-4)}` : null,
      },
      checkoutRequestedAt: link.checkoutRequestedAt,
      folio: {
        subtotalPaise: summary.subtotalPaise,
        taxPaise: summary.taxPaise,
        totalPaise: summary.chargesPaise,
        paidPaise: summary.netPaidPaise,
        balancePaise: summary.balancePaise,
        lines: summary.lineItems.map((l) => ({
          description: l.description,
          amountPaise: l.amountPaise,
        })),
      },
      addons: addons.map((a) => ({
        id: a.id,
        name: a.name,
        description: a.description,
        pricePaise: a.pricePaise,
        unit: a.unit,
      })),
      paysAtProperty: true,
    };
  }

  /** Online check-in: the details the desk would otherwise type at arrival. */
  async submitCheckin(
    token: string,
    dto: {
      guestName?: string;
      guestEmail?: string;
      idType?: string;
      idNumber?: string;
      adults?: number;
      children?: number;
      notes?: string;
    },
  ) {
    const { link, r } = await this.resolve(token);
    if (r.status !== 'PENDING' && r.status !== 'CONFIRMED')
      throw new BadRequestException({
        error: 'ALREADY_CHECKED_IN',
        message: 'You are already checked in',
      });
    await this.reservations.update(
      r.propertyId,
      r.id,
      {
        guestName: dto.guestName,
        guestEmail: dto.guestEmail,
        guestIdType: dto.idType,
        guestIdNumber: dto.idNumber,
        adults: dto.adults,
        children: dto.children,
        notes: dto.notes
          ? `${r.notes ? `${r.notes}\n` : ''}Guest (online check-in): ${dto.notes}`
          : undefined,
      } as never,
      null,
    );
    await this.db
      .update(guestLinks)
      .set({ checkinSubmittedAt: new Date() })
      .where(eq(guestLinks.id, link.id));
    this.realtime?.emit(r.propertyId, 'reservation.changed', {
      id: r.id,
      status: r.status,
      onlineCheckin: true,
    });
    return { ok: true };
  }

  /** ID proof or the guest's photo — stored as a KEY, served by presigned URL to the desk only. */
  async upload(
    token: string,
    kind: 'id' | 'photo',
    file: { mimetype: string; size: number; buffer: Buffer; originalname?: string },
  ) {
    const { r } = await this.resolve(token);
    const ext = IMAGE_MIME[file.mimetype];
    if (!ext || (kind === 'photo' && ext === 'pdf'))
      throw new BadRequestException({
        error: 'UNSUPPORTED_MEDIA_TYPE',
        message: 'JPEG, PNG or WebP (PDF for ID) only',
      });
    if (file.size > MAX_UPLOAD_BYTES)
      throw new BadRequestException({ error: 'FILE_TOO_LARGE', message: '8 MB is the limit' });
    const key = `guests/${r.id}/${kind}-${randomBytes(6).toString('hex')}.${ext}`;
    await this.storage.put(key, file.buffer, file.mimetype);
    await this.db
      .update(reservations)
      .set(
        kind === 'id'
          ? { guestIdProofKey: key, updatedAt: new Date() }
          : { guestPhotoKey: key, updatedAt: new Date() },
      )
      .where(eq(reservations.id, r.id));
    return { ok: true, kind };
  }

  /** Add-on picks post to the folio at once; the guest's total is the folio's. */
  async requestServices(token: string, picks: { id: string; quantity?: number }[]) {
    const { r } = await this.resolve(token);
    const addons = await this.config.listAddons(r.propertyId);
    const nights = Math.max(1, nightsBetween(r.checkIn, r.checkOut));
    const guests = Math.max(1, r.adults + r.children);
    const posted = [];
    for (const pick of picks) {
      const a = addons.find((x) => x.id === pick.id && x.isActive && x.sellOnline);
      if (!a) continue;
      const qty = Math.max(1, Math.min(50, pick.quantity ?? 1));
      const units =
        a.unit === 'PER_NIGHT'
          ? nights
          : a.unit === 'PER_GUEST'
            ? guests
            : a.unit === 'PER_GUEST_NIGHT'
              ? nights * guests
              : 1;
      posted.push(
        await this.folio.postCharge({
          reservationId: r.id,
          propertyId: r.propertyId,
          kind: 'MISC',
          description: `${a.name} (requested by guest)`,
          amountPaise: a.pricePaise * units * qty,
          quantity: qty,
          taxCategory: a.taxCategory as 'accommodation' | 'restaurant' | 'other',
          hsnCode: a.hsnCode,
          sourceType: 'GUEST_ADDON',
          sourceId: `${r.id}:${a.id}:${Date.now()}`,
        }),
      );
    }
    this.realtime?.emit(r.propertyId, 'reservation.changed', {
      id: r.id,
      status: r.status,
      guestRequest: true,
    });
    return {
      posted: posted.length,
      folio: await this.folio
        .summary(r.id)
        .then((s) => ({ totalPaise: s.chargesPaise, balancePaise: s.balancePaise })),
    };
  }

  /** The guest asks to leave; the desk does the checkout (the folio must balance). */
  async requestCheckout(token: string) {
    const { link, r } = await this.resolve(token);
    if (r.status !== 'CHECKED_IN')
      throw new BadRequestException({ error: 'NOT_IN_HOUSE', message: 'You are not checked in' });
    await this.db
      .update(guestLinks)
      .set({ checkoutRequestedAt: new Date() })
      .where(eq(guestLinks.id, link.id));
    this.realtime?.emit(r.propertyId, 'reservation.changed', {
      id: r.id,
      status: r.status,
      checkoutRequested: true,
    });
    return { ok: true };
  }

  /** The desk-facing view of one link row — the same shape on the per-stay and list routes. */
  static linkState(link: typeof guestLinks.$inferSelect | null | undefined) {
    return link
      ? {
          sentAt: link.sentAt,
          openedAt: link.openedAt,
          checkinSubmittedAt: link.checkinSubmittedAt,
          checkoutRequestedAt: link.checkoutRequestedAt,
          expiresAt: link.expiresAt,
        }
      : null;
  }

  /** For the desk: the link state per reservation, and presigned ID/photo URLs. */
  async status(propertyId: string, reservationId: string) {
    const r = await this.reservations.requireReservation(propertyId, reservationId);
    const [link] = await this.db
      .select()
      .from(guestLinks)
      .where(eq(guestLinks.reservationId, reservationId))
      .orderBy(desc(guestLinks.createdAt))
      .limit(1);
    return {
      link: GuestJourneyService.linkState(link),
      idProofUrl: r.guestIdProofKey
        ? await this.storage.getSignedUrl(r.guestIdProofKey, 900).catch(() => null)
        : null,
      photoUrl: r.guestPhotoKey
        ? await this.storage.getSignedUrl(r.guestPhotoKey, 900).catch(() => null)
        : null,
    };
  }

  /**
   * The desk's link board: which guests have been sent a link, who opened it,
   * who has checked in online, who wants out.
   *
   *   today — arriving today (CONFIRMED) plus everyone in-house
   *   week  — arriving within the next 7 days plus everyone in-house
   *   all   — every CONFIRMED stay still ahead, plus everyone in-house
   *
   * One query: a reservation holds at most one live link (issue() replaces),
   * so the join is one-to-at-most-one.
   */
  async list(propertyId: string, window: GuestLinkWindow = 'today', now: Date = new Date()) {
    const day = today(now);
    const inHouse = eq(reservations.status, 'CHECKED_IN');
    let arriving: SQL;
    if (window === 'today') {
      arriving = and(eq(reservations.status, 'CONFIRMED'), eq(reservations.checkIn, day)) as SQL;
    } else if (window === 'week') {
      arriving = and(
        eq(reservations.status, 'CONFIRMED'),
        gte(reservations.checkIn, day),
        lt(reservations.checkIn, addDays(day, 7)),
      ) as SQL;
    } else {
      arriving = and(eq(reservations.status, 'CONFIRMED'), gte(reservations.checkIn, day)) as SQL;
    }

    const rows = await this.db
      .select({
        id: reservations.id,
        reservationNumber: reservations.reservationNumber,
        guestName: reservations.guestName,
        guestPhone: reservations.guestPhone,
        guestEmail: reservations.guestEmail,
        checkIn: reservations.checkIn,
        checkOut: reservations.checkOut,
        status: reservations.status,
        roomNumber: rooms.number,
        link: guestLinks,
      })
      .from(reservations)
      .leftJoin(rooms, eq(reservations.roomId, rooms.id))
      .leftJoin(guestLinks, eq(guestLinks.reservationId, reservations.id))
      .where(
        and(
          eq(reservations.propertyId, propertyId),
          isNull(reservations.deletedAt),
          or(inHouse, arriving),
        ),
      )
      .orderBy(asc(reservations.checkIn), asc(reservations.guestName))
      .limit(GUEST_LINK_LIST_LIMIT);

    return {
      items: rows.map((r) => ({
        reservationId: r.id,
        code: r.reservationNumber,
        guestName: r.guestName,
        phone: r.guestPhone,
        email: r.guestEmail,
        roomNumber: r.roomNumber ?? null,
        checkIn: r.checkIn,
        checkOut: r.checkOut,
        status: r.status,
        link: GuestJourneyService.linkState(r.link),
      })),
    };
  }
}
