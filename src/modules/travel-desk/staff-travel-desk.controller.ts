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
import { TransportService } from './transport.service';
import { VehiclesService } from './vehicles.service';
import {
  AssignTransportDto,
  CreateTransportDto,
  CreateVehicleDto,
  TransportFilterDto,
  TransportStatusDto,
  UpdateTransportDto,
  UpdateVehicleDto,
} from './dto';

/**
 * Travel Desk, per property. Transport requests (create, assign a driver/
 * vehicle, cancel) and the vehicle fleet. Every route resolves against the
 * caller's own propertyId, so a foreign id 404s.
 */
@ApiTags('Staff Travel Desk')
@ApiBearerAuth()
@UseGuards(StaffJwtGuard, StaffPermissionsGuard)
@Controller({ path: 'api/v1/staff/travel-desk', version: VERSION_NEUTRAL })
export class StaffTravelDeskController {
  constructor(
    private readonly transport: TransportService,
    private readonly vehicles: VehiclesService,
    private readonly audit: AuditService,
  ) {}

  private actor(me: AuthenticatedStaff) {
    return { actorId: me.id, actorEmail: me.email, actorRole: me.role };
  }

  @Get('summary')
  @RequireStaffPermissions('transport.read')
  summary(@CurrentStaff() me: AuthenticatedStaff) {
    return this.transport.summary(me.propertyId);
  }

  // ---------- Requests ----------

  @Get('requests')
  @RequireStaffPermissions('transport.read')
  list(@CurrentStaff() me: AuthenticatedStaff, @Query() q: TransportFilterDto) {
    return this.transport.list(me.propertyId, q);
  }

  @Get('requests/:id')
  @RequireStaffPermissions('transport.read')
  get(@CurrentStaff() me: AuthenticatedStaff, @Param('id') id: string) {
    return this.transport.get(me.propertyId, id);
  }

  @Post('requests')
  @RequireStaffPermissions('transport.create')
  async create(@CurrentStaff() me: AuthenticatedStaff, @Body() dto: CreateTransportDto) {
    const row = await this.transport.create(me.propertyId, dto, me.id);
    await this.audit.record({
      action: 'staff.travel.request.created',
      entity: 'transport_request',
      entityId: row.id,
      after: row,
      ...this.actor(me),
    });
    return row;
  }

  @Patch('requests/:id')
  @RequireStaffPermissions('transport.update')
  async update(
    @CurrentStaff() me: AuthenticatedStaff,
    @Param('id') id: string,
    @Body() dto: UpdateTransportDto,
  ) {
    const { before, after } = await this.transport.update(me.propertyId, id, dto);
    await this.audit.record({
      action: 'staff.travel.request.updated',
      entity: 'transport_request',
      entityId: id,
      before,
      after,
      ...this.actor(me),
    });
    return after;
  }

  @Post('requests/:id/assign')
  @RequireStaffPermissions('transport.assign')
  async assign(
    @CurrentStaff() me: AuthenticatedStaff,
    @Param('id') id: string,
    @Body() dto: AssignTransportDto,
  ) {
    const { before, after } = await this.transport.assign(
      me.propertyId,
      id,
      dto.driverStaffId,
      dto.vehicleId,
    );
    await this.audit.record({
      action: 'staff.travel.request.assigned',
      entity: 'transport_request',
      entityId: id,
      before,
      after,
      reason: `Assigned to ${after.driverName ?? dto.driverStaffId}`,
      ...this.actor(me),
    });
    return after;
  }

  @Patch('requests/:id/status')
  @RequireStaffPermissions('transport.update')
  async setStatus(
    @CurrentStaff() me: AuthenticatedStaff,
    @Param('id') id: string,
    @Body() dto: TransportStatusDto,
  ) {
    const { before, after } = await this.transport.setStatus(me.propertyId, id, dto.status);
    await this.audit.record({
      action: 'staff.travel.request.status_changed',
      entity: 'transport_request',
      entityId: id,
      before,
      after,
      reason: `${before.status} → ${after.status}`,
      ...this.actor(me),
    });
    return after;
  }

  @Delete('requests/:id')
  @RequireStaffPermissions('transport.update')
  async remove(@CurrentStaff() me: AuthenticatedStaff, @Param('id') id: string) {
    const res = await this.transport.remove(me.propertyId, id);
    await this.audit.record({
      action: 'staff.travel.request.deleted',
      entity: 'transport_request',
      entityId: id,
      before: res.before,
      ...this.actor(me),
    });
    return res;
  }

  // ---------- Vehicles ----------

  @Get('vehicles')
  @RequireStaffPermissions('vehicle.read')
  listVehicles(@CurrentStaff() me: AuthenticatedStaff) {
    return this.vehicles.list(me.propertyId);
  }

  @Post('vehicles')
  @RequireStaffPermissions('vehicle.create')
  async createVehicle(@CurrentStaff() me: AuthenticatedStaff, @Body() dto: CreateVehicleDto) {
    const row = await this.vehicles.create(me.propertyId, dto);
    await this.audit.record({
      action: 'staff.travel.vehicle.created',
      entity: 'vehicle',
      entityId: row.id,
      after: row,
      ...this.actor(me),
    });
    return row;
  }

  @Patch('vehicles/:id')
  @RequireStaffPermissions('vehicle.update')
  async updateVehicle(
    @CurrentStaff() me: AuthenticatedStaff,
    @Param('id') id: string,
    @Body() dto: UpdateVehicleDto,
  ) {
    const { before, after } = await this.vehicles.update(me.propertyId, id, dto);
    await this.audit.record({
      action: 'staff.travel.vehicle.updated',
      entity: 'vehicle',
      entityId: id,
      before,
      after,
      ...this.actor(me),
    });
    return after;
  }

  @Delete('vehicles/:id')
  @RequireStaffPermissions('vehicle.update')
  async removeVehicle(@CurrentStaff() me: AuthenticatedStaff, @Param('id') id: string) {
    const res = await this.vehicles.remove(me.propertyId, id);
    await this.audit.record({
      action: 'staff.travel.vehicle.deleted',
      entity: 'vehicle',
      entityId: id,
      before: res.before,
      ...this.actor(me),
    });
    return res;
  }
}
