import { Inject, Injectable } from '@nestjs/common';
import { and, eq, isNull, sql } from 'drizzle-orm';
import { DRIZZLE, Database } from '../../database/database.module';
import {
  hotelStaff,
  locationDistricts,
  locationStates,
  owners,
  properties,
} from '../../database/schema';
import { AuditService } from '../audit/audit.service';
import { UpdateOwnerProfileDto } from './dto';
import { OwnerErrors } from './owner-errors';
import { normalizeGstin, normalizeIndianMobile, trimToNull } from './owner-input';

type OwnerRow = typeof owners.$inferSelect;

/** The address JSONB block an owner row carries alongside its flat columns. */
interface OwnerAddress {
  line1?: string | null;
  pinCode?: string | null;
  state?: string | null;
  stateId?: string | null;
  district?: string | null;
  districtId?: string | null;
  country?: string | null;
}

/**
 * Self-service owner profile. Deliberately narrower than the admin-side
 * `OwnersService.update`: an owner can never change their own status, and never
 * their email — that address is what identifies the account at sign-in.
 */
@Injectable()
export class OwnerProfileService {
  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    private readonly audit: AuditService,
  ) {}

  /**
   * The stored row plus the catalogue names for its location ids. Names are
   * read back through a join rather than trusted from the JSONB block, so a
   * renamed district shows up correctly.
   */
  private async load(ownerId: string) {
    const [row] = await this.db
      .select({
        o: owners,
        stateName: locationStates.name,
        districtName: locationDistricts.name,
      })
      .from(owners)
      .leftJoin(locationStates, eq(owners.stateId, locationStates.id))
      .leftJoin(locationDistricts, eq(owners.districtId, locationDistricts.id))
      .where(eq(owners.id, ownerId))
      .limit(1);
    if (!row || row.o.deletedAt) throw OwnerErrors.ownerNotFound();
    return row;
  }

  private static serialize(
    o: OwnerRow,
    stateName: string | null,
    districtName: string | null,
  ): Record<string, unknown> {
    const addr = (o.address as OwnerAddress | null) ?? {};
    return {
      id: o.id,
      name: o.name,
      company: o.company,
      email: o.email,
      emailVerified: o.emailVerified,
      // The app shows one number; `mobile` is the canonical one it signs in with.
      phone: o.mobile ?? o.phone,
      mobile: o.mobile ?? o.phone,
      gstNumber: o.gstNumber,
      address: addr.line1 ?? null,
      pinCode: o.pinCode ?? addr.pinCode ?? null,
      stateId: o.stateId,
      districtId: o.districtId,
      state: stateName ?? addr.state ?? null,
      district: districtName ?? addr.district ?? null,
      country: o.country ?? addr.country ?? 'India',
      status: o.status,
      createdAt: o.createdAt,
    };
  }

  async get(ownerId: string) {
    const row = await this.load(ownerId);
    const [props] = await this.db
      .select({ count: sql<number>`count(*)::int` })
      .from(properties)
      .where(and(eq(properties.ownerId, ownerId), isNull(properties.deletedAt)));
    const [staff] = await this.db
      .select({ count: sql<number>`count(*)::int` })
      .from(hotelStaff)
      .where(and(eq(hotelStaff.ownerId, ownerId), isNull(hotelStaff.deletedAt)));
    return {
      ...OwnerProfileService.serialize(row.o, row.stateName, row.districtName),
      propertiesCount: props?.count ?? 0,
      staffCount: staff?.count ?? 0,
    };
  }

  async update(ownerId: string, dto: UpdateOwnerProfileDto) {
    // Checked before anything else so the reason is the email rule, not a
    // downstream validation failure on some other field.
    if (dto.email !== undefined) throw OwnerErrors.emailNotEditable();

    const row = await this.load(ownerId);
    const before = OwnerProfileService.serialize(row.o, row.stateName, row.districtName);

    const patch: Record<string, unknown> = {};
    if (dto.name !== undefined) patch.name = dto.name.trim();
    if (dto.company !== undefined) patch.company = trimToNull(dto.company);
    if (dto.gstNumber !== undefined) patch.gstNumber = normalizeGstin(dto.gstNumber);
    if (dto.phone !== undefined) {
      const mobile = normalizeIndianMobile(dto.phone, 'phone');
      patch.phone = mobile;
      patch.mobile = mobile;
    }

    // Both halves of the location move together, and both are checked against
    // the admin-managed catalogue, exactly as on the admin surface.
    const changingLocation = dto.state !== undefined || dto.district !== undefined;
    let stateName: string | undefined;
    let districtName: string | undefined;
    if (changingLocation) {
      if (!dto.state || !dto.district) {
        throw OwnerErrors.invalidLocation(
          'Both state and district are required when changing the location',
        );
      }
      const [stateRow] = await this.db
        .select({ id: locationStates.id, name: locationStates.name })
        .from(locationStates)
        .where(eq(locationStates.id, dto.state))
        .limit(1);
      if (!stateRow) throw OwnerErrors.invalidLocation('Unknown state');
      const [districtRow] = await this.db
        .select({ id: locationDistricts.id, name: locationDistricts.name })
        .from(locationDistricts)
        .where(
          and(eq(locationDistricts.id, dto.district), eq(locationDistricts.stateId, stateRow.id)),
        )
        .limit(1);
      if (!districtRow) {
        throw OwnerErrors.invalidLocation(`District does not belong to ${stateRow.name}`);
      }
      stateName = stateRow.name;
      districtName = districtRow.name;
      patch.stateId = stateRow.id;
      patch.districtId = districtRow.id;
      patch.city = districtRow.name;
    }

    // Keep the address JSONB block in step with the flat columns, merging onto
    // whatever is stored so untouched keys survive.
    if (dto.address !== undefined || dto.pinCode !== undefined || changingLocation) {
      const prev = (row.o.address as OwnerAddress | null) ?? {};
      if (dto.pinCode !== undefined) patch.pinCode = dto.pinCode;
      patch.address = {
        ...prev,
        line1: dto.address !== undefined ? trimToNull(dto.address) : (prev.line1 ?? null),
        pinCode: dto.pinCode ?? prev.pinCode ?? row.o.pinCode ?? null,
        state: stateName ?? prev.state ?? row.stateName ?? null,
        stateId: (patch.stateId as string | undefined) ?? prev.stateId ?? row.o.stateId ?? null,
        district: districtName ?? prev.district ?? row.districtName ?? null,
        districtId:
          (patch.districtId as string | undefined) ?? prev.districtId ?? row.o.districtId ?? null,
        country: prev.country ?? row.o.country ?? 'India',
      };
    }

    if (Object.keys(patch).length === 0) throw OwnerErrors.nothingToUpdate();
    patch.updatedAt = new Date();

    await this.db
      .update(owners)
      .set(patch as never)
      .where(eq(owners.id, ownerId));

    const after = await this.get(ownerId);
    await this.audit.record({
      action: 'owner.profile.updated',
      entity: 'owner',
      entityId: ownerId,
      before,
      after,
      actorId: ownerId,
      actorEmail: row.o.email,
      actorRole: 'OWNER',
    });
    return after;
  }
}
