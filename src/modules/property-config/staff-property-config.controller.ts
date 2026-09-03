import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
  VERSION_NEUTRAL,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AuditService } from '../audit/audit.service';
import { CurrentStaff, AuthenticatedStaff } from '../staff-auth/current-staff.decorator';
import { StaffJwtGuard } from '../staff-auth/staff-jwt.guard';
import {
  RequireStaffPermissions,
  StaffPermissionsGuard,
} from '../staff-auth/staff-permissions.guard';
import {
  AddonInputDto,
  BookingSourceInputDto,
  PolicyInputDto,
  TaxInputDto,
  UpdateAddonDto,
  UpdateBookingSourceDto,
  UpdatePolicyDto,
  UpdatePropertySettingsDto,
  UpdateTaxDto,
  CouponInputDto,
  UpdateCouponDto,
} from './dto';
import { PropertyConfigService } from './property-config.service';

/**
 * Property configuration for the signed-in property.
 *
 * Reads are `property.settings.read` (the folio and booking screens need them);
 * writes are `property.settings.update`, which only management holds. Every
 * write is audited — tax rates and cancellation policies are exactly the
 * settings a dispute later asks "who changed this and when" about.
 */
@ApiTags('Staff Property Config')
@ApiBearerAuth()
@UseGuards(StaffJwtGuard, StaffPermissionsGuard)
@Controller({ path: 'api/v1/staff/property', version: VERSION_NEUTRAL })
export class StaffPropertyConfigController {
  constructor(
    private readonly config: PropertyConfigService,
    private readonly audit: AuditService,
  ) {}

  private actor(me: AuthenticatedStaff) {
    return { actorId: me.id, actorEmail: me.email, actorRole: me.role };
  }

  // ------------------------------------------------------------ settings --

  @Get('settings')
  @RequireStaffPermissions('property.settings.read')
  settings(@CurrentStaff() me: AuthenticatedStaff) {
    return this.config.settings(me.propertyId);
  }

  @Patch('settings')
  @RequireStaffPermissions('property.settings.update')
  async updateSettings(
    @CurrentStaff() me: AuthenticatedStaff,
    @Body() dto: UpdatePropertySettingsDto,
  ) {
    const before = await this.config.settings(me.propertyId);
    const after = await this.config.updateSettings(me.propertyId, dto);
    await this.audit.record({
      action: 'staff.property.settings.updated',
      entity: 'property_settings',
      entityId: me.propertyId,
      before,
      after: dto,
      ...this.actor(me),
    });
    return after;
  }

  // --------------------------------------------------------------- taxes --

  @Get('taxes')
  @RequireStaffPermissions('property.settings.read')
  taxes(@CurrentStaff() me: AuthenticatedStaff) {
    return this.config.listTaxes(me.propertyId);
  }

  @Post('taxes')
  @RequireStaffPermissions('property.settings.update')
  async createTax(@CurrentStaff() me: AuthenticatedStaff, @Body() dto: TaxInputDto) {
    const row = await this.config.createTax(me.propertyId, dto);
    await this.audit.record({
      action: 'staff.property.tax.created',
      entity: 'property_tax',
      entityId: row.id,
      after: row,
      ...this.actor(me),
    });
    return row;
  }

  @Patch('taxes/:id')
  @RequireStaffPermissions('property.settings.update')
  async updateTax(
    @CurrentStaff() me: AuthenticatedStaff,
    @Param('id') id: string,
    @Body() dto: UpdateTaxDto,
  ) {
    const row = await this.config.updateTax(me.propertyId, id, dto);
    await this.audit.record({
      action: 'staff.property.tax.updated',
      entity: 'property_tax',
      entityId: id,
      after: dto,
      ...this.actor(me),
    });
    return row;
  }

  @Delete('taxes/:id')
  @RequireStaffPermissions('property.settings.update')
  async deleteTax(@CurrentStaff() me: AuthenticatedStaff, @Param('id') id: string) {
    const res = await this.config.deleteTax(me.propertyId, id);
    await this.audit.record({
      action: 'staff.property.tax.deleted',
      entity: 'property_tax',
      entityId: id,
      ...this.actor(me),
    });
    return res;
  }

  // ------------------------------------------------------------ policies --

  @Get('policies')
  @RequireStaffPermissions('property.settings.read')
  policies(@CurrentStaff() me: AuthenticatedStaff) {
    return this.config.listPolicies(me.propertyId);
  }

  @Post('policies')
  @RequireStaffPermissions('property.settings.update')
  async createPolicy(@CurrentStaff() me: AuthenticatedStaff, @Body() dto: PolicyInputDto) {
    const row = await this.config.createPolicy(me.propertyId, dto);
    await this.audit.record({
      action: 'staff.property.policy.created',
      entity: 'property_policy',
      entityId: row.id,
      after: row,
      ...this.actor(me),
    });
    return row;
  }

  @Patch('policies/:id')
  @RequireStaffPermissions('property.settings.update')
  async updatePolicy(
    @CurrentStaff() me: AuthenticatedStaff,
    @Param('id') id: string,
    @Body() dto: UpdatePolicyDto,
  ) {
    const row = await this.config.updatePolicy(me.propertyId, id, dto);
    await this.audit.record({
      action: 'staff.property.policy.updated',
      entity: 'property_policy',
      entityId: id,
      after: dto,
      ...this.actor(me),
    });
    return row;
  }

  @Delete('policies/:id')
  @RequireStaffPermissions('property.settings.update')
  async deletePolicy(@CurrentStaff() me: AuthenticatedStaff, @Param('id') id: string) {
    const res = await this.config.deletePolicy(me.propertyId, id);
    await this.audit.record({
      action: 'staff.property.policy.deleted',
      entity: 'property_policy',
      entityId: id,
      ...this.actor(me),
    });
    return res;
  }

  // ------------------------------------------------------------- add-ons --

  @Get('addons')
  @RequireStaffPermissions('property.settings.read')
  addons(@CurrentStaff() me: AuthenticatedStaff) {
    return this.config.listAddons(me.propertyId);
  }

  @Post('addons')
  @RequireStaffPermissions('property.settings.update')
  async createAddon(@CurrentStaff() me: AuthenticatedStaff, @Body() dto: AddonInputDto) {
    const row = await this.config.createAddon(me.propertyId, dto);
    await this.audit.record({
      action: 'staff.property.addon.created',
      entity: 'addon_service',
      entityId: row.id,
      after: row,
      ...this.actor(me),
    });
    return row;
  }

  @Patch('addons/:id')
  @RequireStaffPermissions('property.settings.update')
  async updateAddon(
    @CurrentStaff() me: AuthenticatedStaff,
    @Param('id') id: string,
    @Body() dto: UpdateAddonDto,
  ) {
    const row = await this.config.updateAddon(me.propertyId, id, dto);
    await this.audit.record({
      action: 'staff.property.addon.updated',
      entity: 'addon_service',
      entityId: id,
      after: dto,
      ...this.actor(me),
    });
    return row;
  }

  @Delete('addons/:id')
  @RequireStaffPermissions('property.settings.update')
  async deleteAddon(@CurrentStaff() me: AuthenticatedStaff, @Param('id') id: string) {
    const res = await this.config.deleteAddon(me.propertyId, id);
    await this.audit.record({
      action: 'staff.property.addon.deleted',
      entity: 'addon_service',
      entityId: id,
      ...this.actor(me),
    });
    return res;
  }

  // ----------------------------------------------------- booking sources --

  @Get('booking-sources')
  @RequireStaffPermissions('property.settings.read')
  sources(@CurrentStaff() me: AuthenticatedStaff) {
    return this.config.listSources(me.propertyId);
  }

  @Post('booking-sources')
  @RequireStaffPermissions('property.settings.update')
  async createSource(@CurrentStaff() me: AuthenticatedStaff, @Body() dto: BookingSourceInputDto) {
    const row = await this.config.createSource(me.propertyId, dto);
    await this.audit.record({
      action: 'staff.property.source.created',
      entity: 'booking_source',
      entityId: row.id,
      after: row,
      ...this.actor(me),
    });
    return row;
  }

  @Patch('booking-sources/:id')
  @RequireStaffPermissions('property.settings.update')
  async updateSource(
    @CurrentStaff() me: AuthenticatedStaff,
    @Param('id') id: string,
    @Body() dto: UpdateBookingSourceDto,
  ) {
    const row = await this.config.updateSource(me.propertyId, id, dto);
    await this.audit.record({
      action: 'staff.property.source.updated',
      entity: 'booking_source',
      entityId: id,
      after: dto,
      ...this.actor(me),
    });
    return row;
  }

  @Delete('booking-sources/:id')
  @RequireStaffPermissions('property.settings.update')
  async deleteSource(@CurrentStaff() me: AuthenticatedStaff, @Param('id') id: string) {
    const res = await this.config.deleteSource(me.propertyId, id);
    await this.audit.record({
      action: 'staff.property.source.deleted',
      entity: 'booking_source',
      entityId: id,
      ...this.actor(me),
    });
    return res;
  }

  // -------------------------------------------------------------- coupons --

  @Get('coupons')
  @RequireStaffPermissions('property.settings.read')
  coupons(@CurrentStaff() me: AuthenticatedStaff) {
    return this.config.listCoupons(me.propertyId);
  }

  @Post('coupons')
  @RequireStaffPermissions('property.settings.update')
  async createCoupon(@CurrentStaff() me: AuthenticatedStaff, @Body() dto: CouponInputDto) {
    const row = await this.config.createCoupon(me.propertyId, dto);
    await this.audit.record({
      action: 'staff.property.coupon.created',
      entity: 'coupon',
      entityId: row.id,
      after: row,
      ...this.actor(me),
    });
    return row;
  }

  @Patch('coupons/:id')
  @RequireStaffPermissions('property.settings.update')
  async updateCoupon(
    @CurrentStaff() me: AuthenticatedStaff,
    @Param('id') id: string,
    @Body() dto: UpdateCouponDto,
  ) {
    const row = await this.config.updateCoupon(me.propertyId, id, dto);
    await this.audit.record({
      action: 'staff.property.coupon.updated',
      entity: 'coupon',
      entityId: id,
      after: dto,
      ...this.actor(me),
    });
    return row;
  }

  @Delete('coupons/:id')
  @RequireStaffPermissions('property.settings.update')
  async deleteCoupon(@CurrentStaff() me: AuthenticatedStaff, @Param('id') id: string) {
    const res = await this.config.deleteCoupon(me.propertyId, id);
    await this.audit.record({
      action: 'staff.property.coupon.deleted',
      entity: 'coupon',
      entityId: id,
      ...this.actor(me),
    });
    return res;
  }
}
