import { ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { asc, eq } from 'drizzle-orm';
import { DRIZZLE, Database } from '../../database/database.module';
import { locationDistricts, locationStates } from '../../database/schema';

@Injectable()
export class LocationsService {
  constructor(@Inject(DRIZZLE) private readonly db: Database) {}

  /** Owner-facing: { states: { "<State>": ["<District>", ...] } } */
  async asStatesMap(): Promise<{ states: Record<string, string[]> }> {
    const states = await this.db.select().from(locationStates).orderBy(asc(locationStates.name));
    const districts = await this.db
      .select()
      .from(locationDistricts)
      .orderBy(asc(locationDistricts.name));
    const byState = new Map<string, string[]>();
    for (const s of states) byState.set(s.id, []);
    for (const d of districts) {
      const arr = byState.get(d.stateId);
      if (arr) arr.push(d.name);
    }
    const out: Record<string, string[]> = {};
    for (const s of states) out[s.name] = byState.get(s.id) ?? [];
    return { states: out };
  }

  // ---------- Admin management ----------
  async listStates() {
    return this.db.select().from(locationStates).orderBy(asc(locationStates.name));
  }

  async createState(name: string) {
    const existing = await this.db
      .select({ id: locationStates.id })
      .from(locationStates)
      .where(eq(locationStates.name, name))
      .limit(1);
    if (existing.length) throw new ConflictException('State already exists');
    const [row] = await this.db.insert(locationStates).values({ name }).returning();
    return row;
  }

  async deleteState(id: string) {
    const [row] = await this.db
      .select({ id: locationStates.id })
      .from(locationStates)
      .where(eq(locationStates.id, id))
      .limit(1);
    if (!row) throw new NotFoundException('State not found');
    await this.db.delete(locationStates).where(eq(locationStates.id, id));
    return { id, deleted: true };
  }

  async listDistricts(stateId: string) {
    const [state] = await this.db
      .select({ id: locationStates.id })
      .from(locationStates)
      .where(eq(locationStates.id, stateId))
      .limit(1);
    if (!state) throw new NotFoundException('State not found');
    return this.db
      .select()
      .from(locationDistricts)
      .where(eq(locationDistricts.stateId, stateId))
      .orderBy(asc(locationDistricts.name));
  }

  async createDistrict(stateId: string, name: string) {
    const [state] = await this.db
      .select({ id: locationStates.id })
      .from(locationStates)
      .where(eq(locationStates.id, stateId))
      .limit(1);
    if (!state) throw new NotFoundException('State not found');
    try {
      const [row] = await this.db.insert(locationDistricts).values({ stateId, name }).returning();
      return row;
    } catch (err) {
      if ((err as { code?: string }).code === '23505') {
        throw new ConflictException('District already exists for this state');
      }
      throw err;
    }
  }

  async deleteDistrict(id: string) {
    const [row] = await this.db
      .select({ id: locationDistricts.id })
      .from(locationDistricts)
      .where(eq(locationDistricts.id, id))
      .limit(1);
    if (!row) throw new NotFoundException('District not found');
    await this.db.delete(locationDistricts).where(eq(locationDistricts.id, id));
    return { id, deleted: true };
  }
}
