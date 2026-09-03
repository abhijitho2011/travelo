import { mockDb } from '../owner-auth/testing/db.mock';
import { PropertyConfigService } from './property-config.service';

const PROP = 'prop-1';

describe('PropertyConfigService', () => {
  it('creates the settings row with defaults on first read, then returns it', async () => {
    const db = mockDb({
      select: { property_settings: [[], [{ propertyId: PROP, invoicePrefix: 'INV' }]] },
      insert: { property_settings: [{ propertyId: PROP }] },
    });
    const s = await new PropertyConfigService(db as never).settings(PROP);
    expect(s).toMatchObject({ propertyId: PROP, invoicePrefix: 'INV' });
    expect(db.inserts.find((i) => i.table === 'property_settings')?.values).toMatchObject({
      propertyId: PROP,
    });
  });

  it('refuses a booking-page slug another property already owns', async () => {
    const db = mockDb({
      select: {
        property_settings: [[{ propertyId: PROP }], [{ propertyId: 'prop-other' }]],
      },
    });
    await expect(
      new PropertyConfigService(db as never).updateSettings(PROP, {
        bookingEngineSlug: 'sea-view',
      }),
    ).rejects.toMatchObject({ response: { error: 'BOOKING_SLUG_TAKEN' } });
  });

  it('a new default policy demotes the previous default of the same kind, in one transaction', async () => {
    const db = mockDb({
      update: { property_policies: [] },
      insert: { property_policies: [{ id: 'pol-2', kind: 'CANCELLATION', isDefault: true }] },
    });
    const row = await new PropertyConfigService(db as never).createPolicy(PROP, {
      kind: 'CANCELLATION',
      name: 'Flexible',
      chargeKind: 'NONE',
      isDefault: true,
    });
    expect(row.isDefault).toBe(true);
    expect(db.updates.find((u) => u.table === 'property_policies')?.values).toMatchObject({
      isDefault: false,
    });
  });

  it('a tax at another property is a 404, never a 403', async () => {
    const db = mockDb({ select: { property_taxes: [[]] } });
    await expect(
      new PropertyConfigService(db as never).updateTax(PROP, 'tax-x', { value: 1 }),
    ).rejects.toMatchObject({ response: { error: 'TAX_NOT_FOUND' } });
  });
});
