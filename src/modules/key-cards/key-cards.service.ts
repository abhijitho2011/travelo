import { Inject, Injectable } from '@nestjs/common';
import { and, desc, eq, isNull, sql } from 'drizzle-orm';
import { DRIZZLE, Database } from '../../database/database.module';
import { keyCards, reservations, rooms, type KeyCard } from '../../database/schema';
import { KeyCardErrors } from './key-card-errors';

/**
 * Key cards — the physical keys reception cuts against a stay.
 *
 * The stored status is only what reception controls (ACTIVE / DEACTIVATED /
 * LOST). "EXPIRED" is DERIVED: an ACTIVE row past its `expires_at` reports as
 * expired without any clock-driven job ever writing to the table.
 *
 * The property is never a client parameter — every read and write is scoped to
 * the caller's own property, and a foreign id 404s rather than 403s.
 */

export interface KeyCardDto {
  id: string;
  cardNumber: string;
  /** Stored status, except stored-ACTIVE past expiry reports 'EXPIRED'. */
  status: 'ACTIVE' | 'DEACTIVATED' | 'LOST' | 'EXPIRED';
  issuedAt: Date;
  expiresAt: Date;
  reservationId: string;
  guestName: string | null;
  roomNumber: string | null;
}

/** Bumps past a handful of unique collisions before giving up. */
const NUMBER_RETRIES = 5;

@Injectable()
export class KeyCardsService {
  constructor(@Inject(DRIZZLE) private readonly db: Database) {}

  private static toDto(
    card: KeyCard,
    guestName: string | null,
    roomNumber: string | null,
    now: Date,
  ): KeyCardDto {
    const expired = card.status === 'ACTIVE' && card.expiresAt.getTime() < now.getTime();
    return {
      id: card.id,
      cardNumber: card.cardNumber,
      status: expired ? 'EXPIRED' : card.status,
      issuedAt: card.issuedAt,
      expiresAt: card.expiresAt,
      reservationId: card.reservationId,
      guestName,
      roomNumber,
    };
  }

  /** The property's cards, newest first. One joined scan, capped at 100. */
  async list(propertyId: string, now: Date = new Date()) {
    const rows = await this.db
      .select({
        card: keyCards,
        guestName: reservations.guestName,
        roomNumber: rooms.number,
      })
      .from(keyCards)
      .innerJoin(reservations, eq(keyCards.reservationId, reservations.id))
      .leftJoin(rooms, eq(reservations.roomId, rooms.id))
      .where(eq(keyCards.propertyId, propertyId))
      .orderBy(desc(keyCards.issuedAt))
      .limit(100);

    return {
      items: rows.map((r) =>
        KeyCardsService.toDto(r.card, r.guestName ?? null, r.roomNumber ?? null, now),
      ),
    };
  }

  /**
   * Issue a card for a committed or in-house stay. The card dies with the stay:
   * it expires on the check-out DATE at 11:00, server-local.
   */
  async issue(
    propertyId: string,
    reservationId: string,
    staffId: string | null,
    now: Date = new Date(),
  ): Promise<KeyCardDto> {
    const reservation = await this.requireReservation(propertyId, reservationId);
    if (reservation.status !== 'CONFIRMED' && reservation.status !== 'CHECKED_IN') {
      throw KeyCardErrors.reservationNotEligible(reservation.status);
    }
    const card = await this.insertCard(propertyId, reservation, staffId);
    return KeyCardsService.toDto(
      card,
      reservation.guestName,
      await this.roomNumberFor(reservation.roomId),
      now,
    );
  }

  /**
   * Kill a card. `lost` records WHY it died — a lost card is a security event,
   * a deactivated one is housekeeping. Already-inactive cards refuse: the desk
   * finds out the card was already dead instead of silently double-killing it.
   */
  async deactivate(
    propertyId: string,
    id: string,
    lost: boolean,
    now: Date = new Date(),
  ): Promise<KeyCardDto> {
    const card = await this.requireCard(propertyId, id);
    if (card.status !== 'ACTIVE') throw KeyCardErrors.notActive();

    const [updated] = await this.db
      .update(keyCards)
      .set({ status: lost ? 'LOST' : 'DEACTIVATED', deactivatedAt: now })
      .where(and(eq(keyCards.id, id), eq(keyCards.propertyId, propertyId)))
      .returning();

    const reservation = await this.reservationFor(updated.reservationId);
    return KeyCardsService.toDto(
      updated,
      reservation?.guestName ?? null,
      await this.roomNumberFor(reservation?.roomId ?? null),
      now,
    );
  }

  /**
   * Replace = deactivate the old card and cut the next number for the SAME
   * stay, same expiry rule. Returns the NEW card.
   */
  async replace(propertyId: string, id: string, now: Date = new Date()): Promise<KeyCardDto> {
    const old = await this.requireCard(propertyId, id);
    if (old.status !== 'ACTIVE') throw KeyCardErrors.notActive();

    const reservation = await this.requireReservation(propertyId, old.reservationId);

    await this.db
      .update(keyCards)
      .set({ status: 'DEACTIVATED', deactivatedAt: now })
      .where(and(eq(keyCards.id, id), eq(keyCards.propertyId, propertyId)))
      .returning();

    const fresh = await this.insertCard(propertyId, reservation, old.issuedBy);
    return KeyCardsService.toDto(
      fresh,
      reservation.guestName,
      await this.roomNumberFor(reservation.roomId),
      now,
    );
  }

  // ---------- internals ----------

  /**
   * `KC-0001` style: the property's card count + 1, padded. Racing issues can
   * collide on the unique (property, number) index, so a 23505 bumps the number
   * and retries a few times rather than failing the desk.
   */
  private async insertCard(
    propertyId: string,
    reservation: { id: string; checkOut: string },
    staffId: string | null,
  ): Promise<KeyCard> {
    // Check-out day at 11:00, server-local — the guest is gone by then.
    const expiresAt = new Date(reservation.checkOut + 'T11:00:00');

    const [{ count }] = await this.db
      .select({ count: sql<number>`count(*)::int` })
      .from(keyCards)
      .where(eq(keyCards.propertyId, propertyId));

    for (let bump = 0; bump < NUMBER_RETRIES; bump++) {
      const cardNumber = 'KC-' + String(count + 1 + bump).padStart(4, '0');
      try {
        const [row] = await this.db
          .insert(keyCards)
          .values({
            propertyId,
            reservationId: reservation.id,
            cardNumber,
            status: 'ACTIVE',
            issuedBy: staffId,
            expiresAt,
          })
          .returning();
        return row;
      } catch (err) {
        if ((err as { code?: string }).code !== '23505') throw err;
      }
    }
    throw KeyCardErrors.numberExhausted();
  }

  private async requireCard(propertyId: string, id: string): Promise<KeyCard> {
    const [card] = await this.db
      .select()
      .from(keyCards)
      .where(and(eq(keyCards.id, id), eq(keyCards.propertyId, propertyId)))
      .limit(1);
    if (!card) throw KeyCardErrors.notFound();
    return card;
  }

  private async requireReservation(propertyId: string, id: string) {
    const row = await this.reservationFor(id, propertyId);
    if (!row) throw KeyCardErrors.reservationNotFound();
    return row;
  }

  private async reservationFor(id: string, propertyId?: string) {
    const conds = [eq(reservations.id, id), isNull(reservations.deletedAt)];
    if (propertyId) conds.push(eq(reservations.propertyId, propertyId));
    const [row] = await this.db
      .select()
      .from(reservations)
      .where(and(...conds))
      .limit(1);
    return row;
  }

  private async roomNumberFor(roomId: string | null | undefined): Promise<string | null> {
    if (!roomId) return null;
    const [room] = await this.db
      .select({ number: rooms.number })
      .from(rooms)
      .where(eq(rooms.id, roomId))
      .limit(1);
    return room?.number ?? null;
  }
}
