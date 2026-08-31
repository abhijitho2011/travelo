import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
  VERSION_NEUTRAL,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { StaffJwtGuard } from '../staff-auth/staff-jwt.guard';
import {
  RequireStaffPermissions,
  StaffPermissionsGuard,
} from '../staff-auth/staff-permissions.guard';
import { CurrentStaff, AuthenticatedStaff } from '../staff-auth/current-staff.decorator';
import { AuditService } from '../audit/audit.service';
import { RatePlansService } from './rate-plans.service';
import {
  CreateRatePlanDto,
  ListRatePlansQueryDto,
  SetRatePlanStatusDto,
  UpdateRatePlanDto,
} from './dto';

/**
 * Rate plans — what a room type COSTS and on what terms.
 *
 * These are room-type CONFIGURATION, so they reuse the existing
 * `roomtype.*` permissions rather than inventing a parallel set: anybody
 * trusted to define the room type is trusted to price it.
 *
 * The property is NEVER a parameter — every route resolves against the
 * caller's own `propertyId`, so a foreign id 404s rather than 403s.
 */
@ApiTags('Staff Rate Plans')
@ApiBearerAuth()
@UseGuards(StaffJwtGuard, StaffPermissionsGuard)
@Controller({ path: 'api/v1/staff/rate-plans', version: VERSION_NEUTRAL })
export class StaffRatePlansController {
  constructor(
    private readonly ratePlans: RatePlansService,
    private readonly audit: AuditService,
  ) {}

  /** `roomTypeId` is optional: absent lists every plan at the property. */
  @Get()
  @RequireStaffPermissions('roomtype.read')
  list(@CurrentStaff() me: AuthenticatedStaff, @Query() query: ListRatePlansQueryDto) {
    return this.ratePlans.listPlans(me.propertyId, query.roomTypeId);
  }

  @Post()
  @RequireStaffPermissions('roomtype.create')
  async create(@CurrentStaff() me: AuthenticatedStaff, @Body() dto: CreateRatePlanDto) {
    const plan = await this.ratePlans.createPlan(me.propertyId, dto);
    await this.audit.record({
      action: 'staff.rate_plan.created',
      entity: 'rate_plan',
      entityId: plan.id,
      after: { roomTypeId: plan.roomTypeId, name: plan.name, basePricePaise: plan.basePricePaise },
      actorId: me.id,
      actorEmail: me.email,
      actorRole: me.role,
    });
    return plan;
  }

  @Patch(':id')
  @RequireStaffPermissions('roomtype.update')
  async update(
    @CurrentStaff() me: AuthenticatedStaff,
    @Param('id') id: string,
    @Body() dto: UpdateRatePlanDto,
  ) {
    const plan = await this.ratePlans.updatePlan(me.propertyId, id, dto);
    await this.audit.record({
      action: 'staff.rate_plan.updated',
      entity: 'rate_plan',
      entityId: plan.id,
      after: { ...dto },
      actorId: me.id,
      actorEmail: me.email,
      actorRole: me.role,
    });
    return plan;
  }

  /** ACTIVE <-> INACTIVE. INACTIVE keeps the plan but stops it selling. */
  @Post(':id/status')
  @RequireStaffPermissions('roomtype.update')
  async setStatus(
    @CurrentStaff() me: AuthenticatedStaff,
    @Param('id') id: string,
    @Body() dto: SetRatePlanStatusDto,
  ) {
    const plan = await this.ratePlans.setPlanStatus(me.propertyId, id, dto.status);
    await this.audit.record({
      action: 'staff.rate_plan.updated',
      entity: 'rate_plan',
      entityId: plan.id,
      after: { status: plan.status },
      actorId: me.id,
      actorEmail: me.email,
      actorRole: me.role,
    });
    return plan;
  }

  /** SOFT delete: the plan's name becomes reusable for the room type. */
  @Delete(':id')
  @RequireStaffPermissions('roomtype.delete')
  async remove(@CurrentStaff() me: AuthenticatedStaff, @Param('id') id: string) {
    const result = await this.ratePlans.removePlan(me.propertyId, id);
    await this.audit.record({
      action: 'staff.rate_plan.deleted',
      entity: 'rate_plan',
      entityId: id,
      actorId: me.id,
      actorEmail: me.email,
      actorRole: me.role,
    });
    return result;
  }
}
