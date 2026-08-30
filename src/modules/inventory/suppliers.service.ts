import { Inject, Injectable } from '@nestjs/common';
import { and, asc, eq, isNull } from 'drizzle-orm';
import { DRIZZLE, Database } from '../../database/database.module';
import { suppliers, type Supplier } from '../../database/schema';
import { CreateSupplierDto, UpdateSupplierDto } from './dto';
import { InventoryErrors } from './inventory-errors';

/** Suppliers, per property. A foreign id 404s, never 403. */
@Injectable()
export class SuppliersService {
  constructor(@Inject(DRIZZLE) private readonly db: Database) {}

  static toDto(s: Supplier) {
    return {
      id: s.id,
      propertyId: s.propertyId,
      name: s.name,
      contact: s.contact,
      phone: s.phone,
      email: s.email,
      address: s.address,
      createdAt: s.createdAt,
      updatedAt: s.updatedAt,
    };
  }

  async requireSupplier(propertyId: string, id: string): Promise<Supplier> {
    const [row] = await this.db
      .select()
      .from(suppliers)
      .where(
        and(
          eq(suppliers.id, id),
          eq(suppliers.propertyId, propertyId),
          isNull(suppliers.deletedAt),
        ),
      )
      .limit(1);
    if (!row) throw InventoryErrors.supplierNotFound();
    return row;
  }

  async list(propertyId: string) {
    const rows = await this.db
      .select()
      .from(suppliers)
      .where(and(eq(suppliers.propertyId, propertyId), isNull(suppliers.deletedAt)))
      .orderBy(asc(suppliers.name));
    return rows.map(SuppliersService.toDto);
  }

  async get(propertyId: string, id: string) {
    return SuppliersService.toDto(await this.requireSupplier(propertyId, id));
  }

  async create(propertyId: string, dto: CreateSupplierDto) {
    try {
      const [row] = await this.db
        .insert(suppliers)
        .values({
          propertyId,
          name: dto.name.trim(),
          contact: dto.contact?.trim() || null,
          phone: dto.phone?.trim() || null,
          email: dto.email?.trim() || null,
          address: dto.address?.trim() || null,
        })
        .returning();
      return SuppliersService.toDto(row);
    } catch (err) {
      if ((err as { code?: string }).code === '23505')
        throw InventoryErrors.duplicateSupplierName();
      throw err;
    }
  }

  async update(propertyId: string, id: string, dto: UpdateSupplierDto) {
    const before = await this.requireSupplier(propertyId, id);
    const patch: Partial<typeof suppliers.$inferInsert> = { updatedAt: new Date() };
    if (dto.name !== undefined) patch.name = dto.name.trim();
    if (dto.contact !== undefined) patch.contact = dto.contact.trim() || null;
    if (dto.phone !== undefined) patch.phone = dto.phone.trim() || null;
    if (dto.email !== undefined) patch.email = dto.email.trim() || null;
    if (dto.address !== undefined) patch.address = dto.address.trim() || null;
    try {
      const [after] = await this.db
        .update(suppliers)
        .set(patch)
        .where(eq(suppliers.id, id))
        .returning();
      return { before: SuppliersService.toDto(before), after: SuppliersService.toDto(after) };
    } catch (err) {
      if ((err as { code?: string }).code === '23505')
        throw InventoryErrors.duplicateSupplierName();
      throw err;
    }
  }

  async remove(propertyId: string, id: string) {
    const before = await this.requireSupplier(propertyId, id);
    await this.db
      .update(suppliers)
      .set({ deletedAt: new Date(), updatedAt: new Date() })
      .where(eq(suppliers.id, id));
    return { id, deleted: true, before: SuppliersService.toDto(before) };
  }
}
