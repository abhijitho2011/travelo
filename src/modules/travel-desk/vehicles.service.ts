import { Inject, Injectable } from '@nestjs/common';
import { and, asc, eq, isNull } from 'drizzle-orm';
import { DRIZZLE, Database } from '../../database/database.module';
import { vehicles, type Vehicle, type VehicleStatus } from '../../database/schema';
import { CreateVehicleDto, UpdateVehicleDto } from './dto';
import { TransportErrors } from './transport-errors';

/** Vehicles, per property. A foreign id 404s, never 403. */
@Injectable()
export class VehiclesService {
  constructor(@Inject(DRIZZLE) private readonly db: Database) {}

  static toDto(v: Vehicle) {
    return {
      id: v.id,
      propertyId: v.propertyId,
      name: v.name,
      plate: v.plate,
      seats: v.seats,
      status: v.status,
      createdAt: v.createdAt,
      updatedAt: v.updatedAt,
    };
  }

  async requireVehicle(propertyId: string, id: string): Promise<Vehicle> {
    const [row] = await this.db
      .select()
      .from(vehicles)
      .where(
        and(eq(vehicles.id, id), eq(vehicles.propertyId, propertyId), isNull(vehicles.deletedAt)),
      )
      .limit(1);
    if (!row) throw TransportErrors.vehicleNotFound();
    return row;
  }

  async list(propertyId: string) {
    const rows = await this.db
      .select()
      .from(vehicles)
      .where(and(eq(vehicles.propertyId, propertyId), isNull(vehicles.deletedAt)))
      .orderBy(asc(vehicles.name));
    return rows.map(VehiclesService.toDto);
  }

  async create(propertyId: string, dto: CreateVehicleDto) {
    try {
      const [row] = await this.db
        .insert(vehicles)
        .values({
          propertyId,
          name: dto.name.trim(),
          plate: dto.plate.trim(),
          seats: dto.seats ?? 4,
          status: (dto.status as VehicleStatus) ?? 'AVAILABLE',
        })
        .returning();
      return VehiclesService.toDto(row);
    } catch (err) {
      if ((err as { code?: string }).code === '23505') throw TransportErrors.duplicatePlate();
      throw err;
    }
  }

  async update(propertyId: string, id: string, dto: UpdateVehicleDto) {
    const before = await this.requireVehicle(propertyId, id);
    const patch: Partial<typeof vehicles.$inferInsert> = { updatedAt: new Date() };
    if (dto.name !== undefined) patch.name = dto.name.trim();
    if (dto.plate !== undefined) patch.plate = dto.plate.trim();
    if (dto.seats !== undefined) patch.seats = dto.seats;
    if (dto.status !== undefined) patch.status = dto.status as VehicleStatus;
    try {
      const [after] = await this.db
        .update(vehicles)
        .set(patch)
        .where(eq(vehicles.id, id))
        .returning();
      return { before: VehiclesService.toDto(before), after: VehiclesService.toDto(after) };
    } catch (err) {
      if ((err as { code?: string }).code === '23505') throw TransportErrors.duplicatePlate();
      throw err;
    }
  }

  async remove(propertyId: string, id: string) {
    const before = await this.requireVehicle(propertyId, id);
    await this.db
      .update(vehicles)
      .set({ deletedAt: new Date(), updatedAt: new Date() })
      .where(eq(vehicles.id, id));
    return { id, deleted: true, before: VehiclesService.toDto(before) };
  }
}
