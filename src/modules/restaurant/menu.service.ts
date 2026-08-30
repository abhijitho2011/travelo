import { Inject, Injectable } from '@nestjs/common';
import { and, asc, eq, isNull, SQL } from 'drizzle-orm';
import { DRIZZLE, Database } from '../../database/database.module';
import {
  menuCategories,
  menuItems,
  type MenuCategory,
  type MenuCategoryStatus,
  type MenuItem,
  type MenuItemStatus,
} from '../../database/schema';
import { CreateCategoryDto, CreateMenuItemDto, UpdateCategoryDto, UpdateMenuItemDto } from './dto';
import { RestaurantErrors } from './restaurant-errors';

/**
 * The menu: categories and the items inside them, per property.
 *
 * Same tenant rule as everywhere else — every row resolves by
 * (id, propertyId, not deleted) or 404. Categories and items are ARCHIVED
 * rather than hard-deleted so a bill that snapshotted an item's name still
 * makes sense long after the dish leaves the menu.
 */
@Injectable()
export class MenuService {
  constructor(@Inject(DRIZZLE) private readonly db: Database) {}

  static categoryToDto(c: MenuCategory) {
    return {
      id: c.id,
      propertyId: c.propertyId,
      name: c.name,
      sortOrder: c.sortOrder,
      status: c.status,
      createdAt: c.createdAt,
      updatedAt: c.updatedAt,
    };
  }

  static itemToDto(i: MenuItem) {
    return {
      id: i.id,
      propertyId: i.propertyId,
      categoryId: i.categoryId,
      name: i.name,
      description: i.description,
      pricePaise: i.pricePaise,
      veg: i.veg,
      status: i.status,
      createdAt: i.createdAt,
      updatedAt: i.updatedAt,
    };
  }

  // ---------- Resolution ----------

  async requireCategory(propertyId: string, id: string): Promise<MenuCategory> {
    const [row] = await this.db
      .select()
      .from(menuCategories)
      .where(
        and(
          eq(menuCategories.id, id),
          eq(menuCategories.propertyId, propertyId),
          isNull(menuCategories.deletedAt),
        ),
      )
      .limit(1);
    if (!row) throw RestaurantErrors.categoryNotFound();
    return row;
  }

  async requireItem(propertyId: string, id: string): Promise<MenuItem> {
    const [row] = await this.db
      .select()
      .from(menuItems)
      .where(
        and(
          eq(menuItems.id, id),
          eq(menuItems.propertyId, propertyId),
          isNull(menuItems.deletedAt),
        ),
      )
      .limit(1);
    if (!row) throw RestaurantErrors.menuItemNotFound();
    return row;
  }

  // ---------- The grouped read: ONE call for the whole menu ----------

  /**
   * The menu grouped by category, ordered by each category's sort order then
   * name. `all=false` (the default, for waiters/guests) returns only ACTIVE
   * categories and ACTIVE items; `all=true` (managers) returns everything, so
   * an UNAVAILABLE or ARCHIVED row can be edited back.
   */
  async grouped(propertyId: string, all = false) {
    const catConds: SQL[] = [
      eq(menuCategories.propertyId, propertyId),
      isNull(menuCategories.deletedAt),
    ];
    if (!all) catConds.push(eq(menuCategories.status, 'ACTIVE'));
    const categories = await this.db
      .select()
      .from(menuCategories)
      .where(and(...catConds))
      .orderBy(asc(menuCategories.sortOrder), asc(menuCategories.name));

    const itemConds: SQL[] = [eq(menuItems.propertyId, propertyId), isNull(menuItems.deletedAt)];
    if (!all) itemConds.push(eq(menuItems.status, 'ACTIVE'));
    const items = await this.db
      .select()
      .from(menuItems)
      .where(and(...itemConds))
      .orderBy(asc(menuItems.name));

    const byCategory = new Map<string, MenuItem[]>();
    for (const i of items) {
      const list = byCategory.get(i.categoryId);
      if (list) list.push(i);
      else byCategory.set(i.categoryId, [i]);
    }

    return categories.map((c) => ({
      ...MenuService.categoryToDto(c),
      items: (byCategory.get(c.id) ?? []).map(MenuService.itemToDto),
    }));
  }

  // ---------- Category writes ----------

  async createCategory(propertyId: string, dto: CreateCategoryDto) {
    try {
      const [row] = await this.db
        .insert(menuCategories)
        .values({ propertyId, name: dto.name.trim(), sortOrder: dto.sortOrder ?? 0 })
        .returning();
      return MenuService.categoryToDto(row);
    } catch (err) {
      if ((err as { code?: string }).code === '23505')
        throw RestaurantErrors.duplicateName('category');
      throw err;
    }
  }

  async updateCategory(propertyId: string, id: string, dto: UpdateCategoryDto) {
    const before = await this.requireCategory(propertyId, id);
    const patch: Partial<typeof menuCategories.$inferInsert> = { updatedAt: new Date() };
    if (dto.name !== undefined) patch.name = dto.name.trim();
    if (dto.sortOrder !== undefined) patch.sortOrder = dto.sortOrder;
    if (dto.status !== undefined) patch.status = dto.status as MenuCategoryStatus;
    try {
      const [after] = await this.db
        .update(menuCategories)
        .set(patch)
        .where(eq(menuCategories.id, id))
        .returning();
      return { before: MenuService.categoryToDto(before), after: MenuService.categoryToDto(after) };
    } catch (err) {
      if ((err as { code?: string }).code === '23505')
        throw RestaurantErrors.duplicateName('category');
      throw err;
    }
  }

  async removeCategory(propertyId: string, id: string) {
    const before = await this.requireCategory(propertyId, id);
    await this.db
      .update(menuCategories)
      .set({ deletedAt: new Date(), status: 'ARCHIVED', updatedAt: new Date() })
      .where(eq(menuCategories.id, id));
    return { id, deleted: true, before: MenuService.categoryToDto(before) };
  }

  // ---------- Item writes ----------

  async createItem(propertyId: string, dto: CreateMenuItemDto) {
    // The category must belong to this property before the item points at it.
    await this.requireCategory(propertyId, dto.categoryId);
    try {
      const [row] = await this.db
        .insert(menuItems)
        .values({
          propertyId,
          categoryId: dto.categoryId,
          name: dto.name.trim(),
          description: dto.description ?? null,
          pricePaise: dto.pricePaise,
          veg: dto.veg ?? true,
        })
        .returning();
      return MenuService.itemToDto(row);
    } catch (err) {
      if ((err as { code?: string }).code === '23505') throw RestaurantErrors.duplicateName('item');
      throw err;
    }
  }

  async updateItem(propertyId: string, id: string, dto: UpdateMenuItemDto) {
    const before = await this.requireItem(propertyId, id);
    if (dto.categoryId !== undefined) await this.requireCategory(propertyId, dto.categoryId);
    const patch: Partial<typeof menuItems.$inferInsert> = { updatedAt: new Date() };
    if (dto.categoryId !== undefined) patch.categoryId = dto.categoryId;
    if (dto.name !== undefined) patch.name = dto.name.trim();
    if (dto.description !== undefined) patch.description = dto.description || null;
    if (dto.pricePaise !== undefined) patch.pricePaise = dto.pricePaise;
    if (dto.veg !== undefined) patch.veg = dto.veg;
    if (dto.status !== undefined) patch.status = dto.status as MenuItemStatus;
    try {
      const [after] = await this.db
        .update(menuItems)
        .set(patch)
        .where(eq(menuItems.id, id))
        .returning();
      return { before: MenuService.itemToDto(before), after: MenuService.itemToDto(after) };
    } catch (err) {
      if ((err as { code?: string }).code === '23505') throw RestaurantErrors.duplicateName('item');
      throw err;
    }
  }

  async removeItem(propertyId: string, id: string) {
    const before = await this.requireItem(propertyId, id);
    await this.db
      .update(menuItems)
      .set({ deletedAt: new Date(), status: 'ARCHIVED', updatedAt: new Date() })
      .where(eq(menuItems.id, id));
    return { id, deleted: true, before: MenuService.itemToDto(before) };
  }

  /**
   * The 86 flow. Flip an item between ACTIVE and UNAVAILABLE without disturbing
   * anything else. Never touches an ARCHIVED item back to life implicitly — the
   * caller edits status for that.
   */
  async setAvailability(propertyId: string, id: string, available: boolean) {
    const before = await this.requireItem(propertyId, id);
    const status: MenuItemStatus = available ? 'ACTIVE' : 'UNAVAILABLE';
    const [after] = await this.db
      .update(menuItems)
      .set({ status, updatedAt: new Date() })
      .where(eq(menuItems.id, id))
      .returning();
    return { before: MenuService.itemToDto(before), after: MenuService.itemToDto(after) };
  }
}
