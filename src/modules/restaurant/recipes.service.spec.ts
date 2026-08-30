import { RecipesService } from './recipes.service';
import { mockDb } from '../owner-auth/testing/db.mock';

describe('RecipesService.set', () => {
  it('replaces the recipe (delete-then-insert) for a menu item at the property', async () => {
    const db = mockDb({ select: { menu_items: [[{ id: 'm1' }]] } });
    const svc = new RecipesService(db as never);
    await svc.set('p1', 'm1', [
      { inventoryItemId: 'i1', qtyPerUnit: 2 },
      { inventoryItemId: 'i2', qtyPerUnit: 1 },
    ]);
    expect(db.deletes.find((d) => d.table === 'menu_item_recipes')).toBeTruthy();
    expect(db.inserts.find((i) => i.table === 'menu_item_recipes')).toBeTruthy();
  });

  it('404s for a menu item at another property', async () => {
    const db = mockDb({ select: { menu_items: [[]] } });
    await expect(new RecipesService(db as never).set('p1', 'm1', [])).rejects.toMatchObject({
      status: 404,
    });
  });
});
