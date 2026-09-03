import { BookingEngineService } from './booking-engine.service';

// A stay a month from now: inside the 365-day booking horizon whenever it runs.
const iso = (d: Date) => d.toISOString().slice(0, 10);
const IN = iso(new Date(Date.now() + 30 * 86_400_000));
const MID = iso(new Date(Date.now() + 31 * 86_400_000));
const OUT = iso(new Date(Date.now() + 32 * 86_400_000));

const settings = {
  propertyId: 'prop-1',
  bookingEngineSlug: 'sea-view',
  bookingEngineEnabled: true,
  holdExpiryMinutes: 120,
  checkinTime: '14:00',
  checkoutTime: '11:00',
  currency: 'INR',
  pricesIncludeTax: false,
  brandColor: null,
  brandLogoKey: null,
  bookingTerms: null,
};

function svc(over: Record<string, unknown> = {}) {
  const deps = {
    db: {},
    config: {
      settingsBySlug: jest.fn(async (slug: string) => (slug === 'sea-view' ? settings : null)),
      listAddons: jest.fn(async () => [
        {
          id: 'add-1',
          name: 'Airport pickup',
          pricePaise: 150_000,
          unit: 'PER_STAY',
          taxCategory: 'other',
          hsnCode: null,
          isActive: true,
          sellOnline: true,
        },
      ]),
      listPolicies: jest.fn(async () => []),
    },
    roomTypes: { list: jest.fn(async () => ({ items: [] })) },
    photos: { list: jest.fn(async () => []) },
    desk: {
      availability: jest.fn(async (): Promise<{ items: unknown[] }> => ({
        items: [
          {
            roomTypeId: 't1',
            name: 'Deluxe',
            maxOccupancy: 3,
            availableRooms: 2,
            totalRooms: 5,
            baseRate: 300_000,
          },
        ],
      })),
    },
    rates: {
      nightlyPrices: jest.fn(async () => [
        { date: IN, pricePaise: 300_000, source: 'base' },
        { date: MID, pricePaise: 350_000, source: 'day' },
      ]),
      dayRules: jest.fn(async (): Promise<unknown[]> => []),
    },
    reservations: {
      create: jest.fn(async (_p: string, dto: Record<string, unknown>) => ({
        id: 'res-1',
        reservationNumber: 'RES-0001',
        status: dto.status,
        holdExpiresAt: new Date(),
        checkIn: dto.checkIn,
        checkOut: dto.checkOut,
        nights: 2,
        roomTypeName: 'Deluxe',
        guestName: dto.guestName,
      })),
    },
    folio: {
      postCharge: jest.fn(async () => ({ id: 'l1' })),
      summary: jest.fn(async () => ({
        subtotalPaise: 800_000,
        taxPaise: 105_000,
        chargesPaise: 905_000,
      })),
    },
    storage: { getSignedUrl: jest.fn(async () => 'https://signed') },
    ...over,
  };
  const s = new BookingEngineService(
    deps.db as never,
    deps.config as never,
    deps.roomTypes as never,
    deps.photos as never,
    deps.desk as never,
    deps.rates as never,
    deps.reservations as never,
    deps.folio as never,
    deps.storage as never,
  );
  return { s, deps };
}

describe('BookingEngineService', () => {
  it('an unknown or switched-off slug is a 404 that says nothing else', async () => {
    const { s } = svc();
    await expect(s.availability('nope', { checkIn: IN, checkOut: OUT })).rejects.toMatchObject({
      response: { error: 'BOOKING_PAGE_NOT_FOUND' },
    });
  });

  it('availability prices the stay per night and says why a type is not bookable', async () => {
    const { s, deps } = svc();
    deps.rates.dayRules.mockResolvedValue([
      {
        date: IN,
        cap: null,
        minLos: 3,
        maxLos: null,
        stopSell: false,
        closedToArrival: false,
        closedToDeparture: false,
      },
      {
        date: MID,
        cap: null,
        minLos: null,
        maxLos: null,
        stopSell: false,
        closedToArrival: false,
        closedToDeparture: false,
      },
    ]);
    const a = await s.availability('sea-view', {
      checkIn: IN,
      checkOut: OUT,
      adults: 2,
    });
    const t = a.items[0];
    expect(t.totalPaise).toBe(650_000);
    expect(t.averageNightPaise).toBe(325_000);
    expect(t.bookable).toBe(false);
    expect(t.restriction).toMatch(/Minimum stay is 3/);
  });

  it('a web booking is a HOLD from the booking page, through the desk’s own create, with add-ons on the folio', async () => {
    const { s, deps } = svc();
    const out = await s.book('sea-view', {
      roomTypeId: 't1',
      checkIn: IN,
      checkOut: OUT,
      adults: 2,
      guestName: 'Asha Menon',
      guestPhone: '9876543210',
      addons: [{ id: 'add-1', quantity: 1 }],
    });
    expect(deps.reservations.create).toHaveBeenCalledWith(
      'prop-1',
      expect.objectContaining({ source: 'BOOKING_ENGINE', status: 'PENDING', holdMinutes: 120 }),
      null,
    );
    expect(deps.folio.postCharge).toHaveBeenCalledWith(
      expect.objectContaining({
        reservationId: 'res-1',
        description: 'Airport pickup',
        amountPaise: 150_000,
        sourceType: 'ADDON',
      }),
    );
    expect(out).toMatchObject({
      reservationNumber: 'RES-0001',
      status: 'PENDING',
      paysAtProperty: true,
      totalPaise: 905_000,
    });
  });

  it('with no hold expiry the booking lands CONFIRMED, like a phone booking', async () => {
    const { s, deps } = svc({
      config: {
        settingsBySlug: jest.fn(async () => ({ ...settings, holdExpiryMinutes: null })),
        listAddons: jest.fn(async () => []),
        listPolicies: jest.fn(async () => []),
      },
    });
    await s.book('sea-view', {
      roomTypeId: 't1',
      checkIn: IN,
      checkOut: OUT,
      adults: 1,
      guestName: 'B C',
      guestPhone: '9876543210',
    });
    expect(deps.reservations.create).toHaveBeenCalledWith(
      'prop-1',
      expect.objectContaining({ status: 'CONFIRMED', holdMinutes: 0 }),
      null,
    );
  });

  it('refuses a stay that is sold out or too far out', async () => {
    const { s, deps } = svc();
    deps.desk.availability.mockResolvedValue({
      items: [
        {
          roomTypeId: 't1',
          name: 'Deluxe',
          maxOccupancy: 3,
          availableRooms: 0,
          totalRooms: 5,
          baseRate: 1,
        },
      ],
    });
    await expect(
      s.book('sea-view', {
        roomTypeId: 't1',
        checkIn: IN,
        checkOut: OUT,
        adults: 1,
        guestName: 'B C',
        guestPhone: '9876543210',
      }),
    ).rejects.toMatchObject({ response: { error: 'NOT_BOOKABLE' } });
    expect(() => BookingEngineService.assertStay('2020-01-01', '2020-01-02')).toThrow(/past/);
  });
});
