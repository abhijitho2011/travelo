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
import { LeadsService } from './leads.service';
import {
  CreateActivityDto,
  CreateLeadDto,
  LeadFilterDto,
  MoveStageDto,
  UpdateLeadDto,
} from './dto';

/**
 * Sales CRM, per property. The pipeline board, lead CRUD, stage moves and the
 * activity timeline. Every route resolves against the caller's own propertyId,
 * so a foreign id 404s.
 */
@ApiTags('Staff Sales')
@ApiBearerAuth()
@UseGuards(StaffJwtGuard, StaffPermissionsGuard)
@Controller({ path: 'api/v1/staff/sales', version: VERSION_NEUTRAL })
export class StaffSalesController {
  constructor(
    private readonly leads: LeadsService,
    private readonly audit: AuditService,
  ) {}

  private actor(me: AuthenticatedStaff) {
    return { actorId: me.id, actorEmail: me.email, actorRole: me.role };
  }

  @Get('summary')
  @RequireStaffPermissions('dashboard.read')
  summary(@CurrentStaff() me: AuthenticatedStaff) {
    return this.leads.summary(me.propertyId);
  }

  @Get('pipeline')
  @RequireStaffPermissions('lead.read')
  board(@CurrentStaff() me: AuthenticatedStaff) {
    return this.leads.board(me.propertyId);
  }

  @Get('leads')
  @RequireStaffPermissions('lead.read')
  list(@CurrentStaff() me: AuthenticatedStaff, @Query() q: LeadFilterDto) {
    return this.leads.list(me.propertyId, q);
  }

  @Get('leads/:id')
  @RequireStaffPermissions('lead.read')
  get(@CurrentStaff() me: AuthenticatedStaff, @Param('id') id: string) {
    return this.leads.get(me.propertyId, id);
  }

  @Post('leads')
  @RequireStaffPermissions('lead.create')
  async create(@CurrentStaff() me: AuthenticatedStaff, @Body() dto: CreateLeadDto) {
    const row = await this.leads.create(me.propertyId, dto);
    await this.audit.record({
      action: 'staff.sales.lead.created',
      entity: 'lead',
      entityId: row.id,
      after: row,
      ...this.actor(me),
    });
    return row;
  }

  @Patch('leads/:id')
  @RequireStaffPermissions('lead.update')
  async update(
    @CurrentStaff() me: AuthenticatedStaff,
    @Param('id') id: string,
    @Body() dto: UpdateLeadDto,
  ) {
    const { before, after } = await this.leads.update(me.propertyId, id, dto);
    await this.audit.record({
      action: 'staff.sales.lead.updated',
      entity: 'lead',
      entityId: id,
      before,
      after,
      ...this.actor(me),
    });
    return after;
  }

  @Patch('leads/:id/stage')
  @RequireStaffPermissions('lead.update')
  async moveStage(
    @CurrentStaff() me: AuthenticatedStaff,
    @Param('id') id: string,
    @Body() dto: MoveStageDto,
  ) {
    const { before, after } = await this.leads.moveStage(me.propertyId, id, dto.stage);
    await this.audit.record({
      action: 'staff.sales.lead.stage_moved',
      entity: 'lead',
      entityId: id,
      before,
      after,
      reason: `${before.stage} → ${after.stage}`,
      ...this.actor(me),
    });
    return after;
  }

  @Delete('leads/:id')
  @RequireStaffPermissions('lead.update')
  async remove(@CurrentStaff() me: AuthenticatedStaff, @Param('id') id: string) {
    const res = await this.leads.remove(me.propertyId, id);
    await this.audit.record({
      action: 'staff.sales.lead.deleted',
      entity: 'lead',
      entityId: id,
      before: res.before,
      ...this.actor(me),
    });
    return res;
  }

  // ---------- Activities ----------

  @Get('leads/:id/activities')
  @RequireStaffPermissions('activity.read')
  listActivities(@CurrentStaff() me: AuthenticatedStaff, @Param('id') id: string) {
    return this.leads.listActivities(me.propertyId, id);
  }

  @Post('leads/:id/activities')
  @RequireStaffPermissions('activity.create')
  async logActivity(
    @CurrentStaff() me: AuthenticatedStaff,
    @Param('id') id: string,
    @Body() dto: CreateActivityDto,
  ) {
    const row = await this.leads.logActivity(me.propertyId, id, dto, me.id);
    await this.audit.record({
      action: 'staff.sales.activity.logged',
      entity: 'sales_activity',
      entityId: row.id,
      after: row,
      ...this.actor(me),
    });
    return row;
  }
}
