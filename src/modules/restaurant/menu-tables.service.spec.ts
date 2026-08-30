import { mockDb, sqlText, type MockDb } from '../owner-auth/testing/db.mock';
import { TablesService } from './tables.service';
import { MenuService } from './menu.service';
import type { Database } from '../../database/database.module';

const MY = 'prop-mine';

const tables = (db: MockDb) => new TablesService(db as unknown as Database);
const menu = (db: MockDb) => new MenuService(db as unknown as Database);

describe('TablesService — tenant isolation & unique name', () => {
  it('404s for a table at another property (never 403)', async () => {
    const db = mockDb({ select: { restaurant_tables: [[]] } });
    await expect(tables(db).requireTable(MY, 'foreign')).rejects.toMatchObject({
      status: 404,
      response: { error: 'TABLE_NOT_FOUND' },
    });
    const where = sqlText(db.wheresFor('restaurant_tables')[0]);
    expect(where).toContain(MY);
    expect(where).toContain('deleted_at');
  });

  it('maps a duplicate-name 23505 to a clean DUPLICATE_NAME', async () => {
    const db = mockDb({ insert: { restaurant_tables: [] } });
    // Force the insert chain to throw a unique-violation.
    (db as unknown as { insert: (t: unknown) => unknown }).insert = () => ({
      values: () => ({ returning: () => Promise.reject({ code: '23505' }) }),
    });
    await expect(tables(db).create(MY, { name: 'T1', seats: 4 })).rejects.toMatchObject({
      status: 409,
      response: { error: 'DUPLICATE_NAME' },
    });
  });
});

describe('MenuService — grouped read', () => {
  it('groups items under their category and hides non-ACTIVE rows by default', async () => {
    const cat = {
      id: 'cat-1',
      propertyId: MY,
      name: 'Starters',
      sortOrder: 0,
      status: 'ACTIVE',
      createdAt: new Date(),
      updatedAt: new Date(),
      deletedAt: null,
    };
    const item = {
      id: 'mi-1',
      propertyId: MY,
      categoryId: 'cat-1',
      name: 'Paneer Tikka',
      description: null,
      pricePaise: 25_000,
      veg: true,
      status: 'ACTIVE',
      createdAt: new Date(),
      updatedAt: new Date(),
      deletedAt: null,
    };
    const db = mockDb({ select: { menu_categories: [[cat]], menu_items: [[item]] } });
    const out = await menu(db).grouped(MY, false);
    expect(out).toHaveLength(1);
    expect(out[0].items).toHaveLength(1);
    expect(out[0].items[0]).toMatchObject({ name: 'Paneer Tikka', pricePaise: 25_000, veg: true });
    // ACTIVE-only filter present on both queries.
    expect(sqlText(db.wheresFor('menu_categories')[0])).toContain('ACTIVE');
    expect(sqlText(db.wheresFor('menu_items')[0])).toContain('ACTIVE');
  });

  it('does not filter on status when all=true (the manager view)', async () => {
    const db = mockDb({ select: { menu_categories: [[]], menu_items: [[]] } });
    await menu(db).grouped(MY, true);
    expect(sqlText(db.wheresFor('menu_categories')[0])).not.toContain('ACTIVE');
  });

  it('the 86 flow flips ACTIVE ↔ UNAVAILABLE', async () => {
    const item = {
      id: 'mi-1',
      propertyId: MY,
      categoryId: 'cat-1',
      name: 'Paneer Tikka',
      description: null,
      pricePaise: 25_000,
      veg: true,
      status: 'ACTIVE',
      createdAt: new Date(),
      updatedAt: new Date(),
      deletedAt: null,
    };
    const db = mockDb({
      select: { menu_items: [[item]] },
      update: { menu_items: [{ ...item, status: 'UNAVAILABLE' }] },
    });
    await menu(db).setAvailability(MY, 'mi-1', false);
    const update = db.updates.find((u) => u.table === 'menu_items');
    expect(update?.values).toMatchObject({ status: 'UNAVAILABLE' });
  });
});
