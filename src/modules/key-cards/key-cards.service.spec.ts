import { mockDb, sqlText, type MockDb } from '../owner-auth/testing/db.mock';
import { KeyCardsService } from './key-cards.service';
import type { Database } from '../../database/database.module';

const MY_PROPERTY = 'prop-mine';
const NOW = new Date('2026-03-15T10:00:00.000Z');

function svc(db: MockDb) {
  return new KeyCardsService(db as unknown as Database);
}

const RESERVATION = {
  id: 'res-1',
  propertyId: MY_PROPERTY,
  status: 'CHECKED_IN',
  guestName: 'Asha Rao',
  roomId: 'room-1',
  checkIn: '2026-03-14',
  checkOut: '2026-03-17',
};

const CARD = {
  id: 'card-1',
  propertyId: MY_PROPERTY,
  reservationId: 'res-1',
  cardNumber: 'KC-0005',
  status: 'ACTIVE',
  issuedBy: 'staff-1',
  issuedAt: new Date('2026-03-14T12:00:00.000Z'),
  expiresAt: new Date('2026-03-17T11:00:00'),
  deactivatedAt: null,
};

describe('KeyCardsService.issue', () => {
  it('issues the next number for an in-house stay, expiring at check-out 11:00', async () => {
    const db = mockDb({
      select: {
        reservations: [[RESERVATION]],
        key_cards: [[{ count: 4 }]],
        rooms: [[{ number: '304' }]],
      },
      insert: { key_cards: [CARD] },
    });
    const dto = await svc(db).issue(MY_PROPERTY, 'res-1', 'staff-1', NOW);

    // count 4 → the property's 5th card.
    expect(db.inserts[0].values).toMatchObject({
      propertyId: MY_PROPERTY,
      reservationId: 'res-1',
      cardNumber: 'KC-0005',
      status: 'ACTIVE',
      issuedBy: 'staff-1',
      expiresAt: new Date('2026-03-17T11:00:00'),
    });
    expect(dto).toMatchObject({
      id: 'card-1',
      cardNumber: 'KC-0005',
      status: 'ACTIVE',
      reservationId: 'res-1',
      guestName: 'Asha Rao',
      roomNumber: '304',
    });
  });

  it('bumps the number and retries when the unique index refuses it', async () => {
    const db = mockDb({
      select: {
        reservations: [[RESERVATION]],
        key_cards: [[{ count: 4 }]],
        rooms: [[{ number: '304' }]],
      },
      insert: { key_cards: [{ ...CARD, cardNumber: 'KC-0006' }] },
    });
    // First insert collides (a racing desk took KC-0005); the retry lands.
    const realInsert = db.insert.bind(db);
    let calls = 0;
    db.insert = (table: unknown) => {
      calls += 1;
      if (calls === 1) {
        return {
          values: () => ({ returning: () => Promise.reject({ code: '23505' }) }),
        };
      }
      return realInsert(table);
    };

    const dto = await svc(db).issue(MY_PROPERTY, 'res-1', 'staff-1', NOW);
    expect(db.inserts[0].values).toMatchObject({ cardNumber: 'KC-0006' });
    expect(dto.cardNumber).toBe('KC-0006');
  });

  it('404s a reservation from another property, indistinguishably from a missing one', async () => {
    const db = mockDb({ select: { reservations: [[]] } });
    await expect(svc(db).issue(MY_PROPERTY, 'res-foreign', 'staff-1', NOW)).rejects.toMatchObject({
      response: { error: 'RESERVATION_NOT_FOUND' },
      status: 404,
    });
    expect(sqlText(db.wheresFor('reservations')[0])).toContain(MY_PROPERTY);
  });

  it('refuses a stay that is neither CONFIRMED nor CHECKED_IN', async () => {
    const db = mockDb({
      select: { reservations: [[{ ...RESERVATION, status: 'CHECKED_OUT' }]] },
    });
    await expect(svc(db).issue(MY_PROPERTY, 'res-1', 'staff-1', NOW)).rejects.toMatchObject({
      response: { error: 'KEYCARD_RESERVATION_NOT_ELIGIBLE' },
      status: 409,
    });
  });
});

describe('KeyCardsService.list', () => {
  it('derives EXPIRED for a stored-ACTIVE card past its expiry, without writing it', async () => {
    const expired = {
      ...CARD,
      id: 'card-old',
      expiresAt: new Date('2026-03-15T09:00:00.000Z'),
    };
    const dead = { ...CARD, id: 'card-dead', status: 'LOST' };
    const db = mockDb({
      select: {
        key_cards: [
          [
            { card: CARD, guestName: 'Asha Rao', roomNumber: '304' },
            { card: expired, guestName: 'Asha Rao', roomNumber: '304' },
            { card: dead, guestName: 'Asha Rao', roomNumber: null },
          ],
        ],
      },
    });
    const { items } = await svc(db).list(MY_PROPERTY, NOW);

    expect(items.map((c) => c.status)).toEqual(['ACTIVE', 'EXPIRED', 'LOST']);
    // Derived only: nothing was UPDATEd to EXPIRED.
    expect(db.updates).toEqual([]);
  });
});

describe('KeyCardsService.deactivate', () => {
  const deactivated = { ...CARD, status: 'DEACTIVATED', deactivatedAt: NOW };

  it('marks a card DEACTIVATED and stamps when', async () => {
    const db = mockDb({
      select: {
        key_cards: [[CARD]],
        reservations: [[RESERVATION]],
        rooms: [[{ number: '304' }]],
      },
      update: { key_cards: [deactivated] },
    });
    const dto = await svc(db).deactivate(MY_PROPERTY, 'card-1', false, NOW);

    expect(db.updates[0].values).toMatchObject({ status: 'DEACTIVATED', deactivatedAt: NOW });
    expect(dto.status).toBe('DEACTIVATED');
    expect(dto.guestName).toBe('Asha Rao');
  });

  it('records LOST when the guest lost it', async () => {
    const db = mockDb({
      select: {
        key_cards: [[CARD]],
        reservations: [[RESERVATION]],
        rooms: [[{ number: '304' }]],
      },
      update: { key_cards: [{ ...deactivated, status: 'LOST' }] },
    });
    const dto = await svc(db).deactivate(MY_PROPERTY, 'card-1', true, NOW);
    expect(db.updates[0].values).toMatchObject({ status: 'LOST' });
    expect(dto.status).toBe('LOST');
  });

  it('409s a card that is already inactive', async () => {
    const db = mockDb({ select: { key_cards: [[{ ...CARD, status: 'DEACTIVATED' }]] } });
    await expect(svc(db).deactivate(MY_PROPERTY, 'card-1', false, NOW)).rejects.toMatchObject({
      response: { error: 'KEYCARD_NOT_ACTIVE' },
      status: 409,
    });
    expect(db.updates).toEqual([]);
  });

  it("404s another property's card", async () => {
    const db = mockDb({ select: { key_cards: [[]] } });
    await expect(svc(db).deactivate(MY_PROPERTY, 'card-foreign', false, NOW)).rejects.toMatchObject(
      { response: { error: 'KEYCARD_NOT_FOUND' }, status: 404 },
    );
  });
});

describe('KeyCardsService.replace', () => {
  it('deactivates the old card and returns a fresh one for the same stay', async () => {
    const fresh = { ...CARD, id: 'card-2', cardNumber: 'KC-0006' };
    const db = mockDb({
      select: {
        key_cards: [[CARD], [{ count: 5 }]],
        reservations: [[RESERVATION]],
        rooms: [[{ number: '304' }]],
      },
      update: { key_cards: [{ ...CARD, status: 'DEACTIVATED', deactivatedAt: NOW }] },
      insert: { key_cards: [fresh] },
    });
    const dto = await svc(db).replace(MY_PROPERTY, 'card-1', NOW);

    expect(db.updates[0].values).toMatchObject({ status: 'DEACTIVATED', deactivatedAt: NOW });
    expect(db.inserts[0].values).toMatchObject({
      reservationId: 'res-1',
      cardNumber: 'KC-0006',
      expiresAt: new Date('2026-03-17T11:00:00'),
    });
    expect(dto).toMatchObject({ id: 'card-2', cardNumber: 'KC-0006', status: 'ACTIVE' });
  });

  it('refuses to replace a card that is not stored ACTIVE', async () => {
    const db = mockDb({ select: { key_cards: [[{ ...CARD, status: 'LOST' }]] } });
    await expect(svc(db).replace(MY_PROPERTY, 'card-1', NOW)).rejects.toMatchObject({
      response: { error: 'KEYCARD_NOT_ACTIVE' },
      status: 409,
    });
    expect(db.inserts).toEqual([]);
  });
});
