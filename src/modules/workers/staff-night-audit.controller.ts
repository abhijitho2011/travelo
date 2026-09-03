import {
  forwardRef,
  Body,
  Controller,
  Get,
  Post,
  Query,
  UseGuards,
  VERSION_NEUTRAL,
  Inject,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { IsInt, IsOptional, Max, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { and, desc, eq } from 'drizzle-orm';
import { DRIZZLE, Database } from '../../database/database.module';
import { propertyDailySnapshots } from '../../database/schema';
import { AuditService } from '../audit/audit.service';
import { CurrentStaff, AuthenticatedStaff } from '../staff-auth/current-staff.decorator';
import { StaffJwtGuard } from '../staff-auth/staff-jwt.guard';
import {
  RequireStaffPermissions,
  StaffPermissionsGuard,
} from '../staff-auth/staff-permissions.guard';
import { NightAuditWorker } from './workers.module';

class NightAuditQueryDto {
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(400) days?: number;
}

class RunNightAuditDto {
  /** Nothing yet — reserved for "as of" once business dates are property-local. */
  @IsOptional() note?: string;
}

/**
 * Night audit, for the property. The close itself runs on the scheduler just
 * after midnight; this lets management read the report set and, when a run
 * was missed (a deploy at 00:30, say), close the day by hand.
 */
@ApiTags('Staff Night Audit')
@ApiBearerAuth()
@UseGuards(StaffJwtGuard, StaffPermissionsGuard)
@Controller({ path: 'api/v1/staff/night-audit', version: VERSION_NEUTRAL })
export class StaffNightAuditController {
  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    // forwardRef: the worker lives in workers.module.ts, which imports this
    // controller — the class is undefined at decoration time without it.
    @Inject(forwardRef(() => NightAuditWorker)) private readonly worker: NightAuditWorker,
    private readonly audit: AuditService,
  ) {}

  /** The closed days, newest first: the night-audit report set. */
  @Get()
  @RequireStaffPermissions('reports.read')
  async list(@CurrentStaff() me: AuthenticatedStaff, @Query() q: NightAuditQueryDto) {
    const rows = await this.db
      .select()
      .from(propertyDailySnapshots)
      .where(and(eq(propertyDailySnapshots.propertyId, me.propertyId)))
      .orderBy(desc(propertyDailySnapshots.businessDate))
      .limit(q.days ?? 30);
    return {
      items: rows.map((r) => ({
        businessDate: r.businessDate,
        arrivals: r.arrivals,
        departures: r.departures,
        inHouse: r.inHouse,
        roomsAvailable: r.roomsAvailable,
        roomsSold: r.roomsSold,
        occupancyPct: r.occupancyPct,
        noShows: r.noShows,
        revenuePaise: r.revenuePaise,
        adrPaise: r.roomsSold > 0 ? Math.round(r.revenuePaise / r.roomsSold) : 0,
        revparPaise: r.roomsAvailable > 0 ? Math.round(r.revenuePaise / r.roomsAvailable) : 0,
        closedAt: r.createdAt,
      })),
    };
  }

  /**
   * Close the day now. Idempotent — the snapshot is keyed on (property,
   * business date), so running twice rewrites the same row rather than
   * doubling anything; no-shows already flagged stay flagged.
   */
  @Post('run')
  @RequireStaffPermissions('reports.export')
  async run(@CurrentStaff() me: AuthenticatedStaff, @Body() _dto: RunNightAuditDto) {
    const res = await this.worker.run();
    await this.audit.record({
      action: 'staff.night_audit.run',
      entity: 'property',
      entityId: me.propertyId,
      after: res,
      actorId: me.id,
      actorEmail: me.email,
      actorRole: me.role,
    });
    return res;
  }
}
