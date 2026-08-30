import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { and, eq } from 'drizzle-orm';
import { DRIZZLE, Database } from '../../database/database.module';
import { menuItemRecipes, menuItems } from '../../database/schema';

/** A menu item's recipe — the inventory it consumes per serving (Phase 4). */
@Injectable()
export class RecipesService {
  constructor(@Inject(DRIZZLE) private readonly db: Database) {}

  private async requireMenuItem(propertyId: string, menuItemId: string) {
    const [row] = await this.db
      .select({ id: menuItems.id })
      .from(menuItems)
      .where(and(eq(menuItems.id, menuItemId), eq(menuItems.propertyId, propertyId)))
      .limit(1);
    if (!row) throw new NotFoundException('Menu item not found');
  }

  async get(propertyId: string, menuItemId: string) {
    await this.requireMenuItem(propertyId, menuItemId);
    return this.db
      .select()
      .from(menuItemRecipes)
      .where(
        and(eq(menuItemRecipes.propertyId, propertyId), eq(menuItemRecipes.menuItemId, menuItemId)),
      );
  }

  /** PUT semantics: the body is the COMPLETE recipe, so a line left out is removed. */
  async set(
    propertyId: string,
    menuItemId: string,
    lines: { inventoryItemId: string; qtyPerUnit: number }[],
  ) {
    await this.requireMenuItem(propertyId, menuItemId);
    return this.db.transaction(async (tx) => {
      await tx
        .delete(menuItemRecipes)
        .where(
          and(
            eq(menuItemRecipes.propertyId, propertyId),
            eq(menuItemRecipes.menuItemId, menuItemId),
          ),
        );
      if (lines.length) {
        await tx.insert(menuItemRecipes).values(
          lines.map((l) => ({
            propertyId,
            menuItemId,
            inventoryItemId: l.inventoryItemId,
            qtyPerUnit: l.qtyPerUnit,
          })),
        );
      }
      return { menuItemId, lines: lines.length };
    });
  }
}
