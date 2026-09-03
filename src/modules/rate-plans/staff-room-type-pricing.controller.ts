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
import { StaffJwtGuard } from '../staff-auth/staff-jwt.guard';
import {
  RequireStaffPermissions,
  StaffPermissionsGuard,
} from '../staff-auth/staff-permissions.guard';
import { CurrentStaff, AuthenticatedStaff } from '../staff-auth/current-staff.decorator';
import { AuditService } from '../audit/audit.service';
import { RatePlansService } from './rate-plans.service';
import { RevenueEngineService } from './revenue-engine.service';
import { RunRulesDto } from './dto';
import { CreateFeeDto, CreatePricingRuleDto, UpdateFeeDto, UpdatePricingRuleDto } from './dto';

/**
 * Taxes/fees and dynamic pricing rules, both hung off a room type.
 *
 * This shares the `api/v1/staff/room-types` prefix with the room-type CRUD
 * controller, which is fine in Nest because the concrete sub-paths are
 * disjoint (`:roomTypeId/fees` here, `:id/...` there). Keeping the pricing
 * surface in its own module is what stops the room module growing a second
 * unrelated responsibility.
 *
 * Same tenancy rule as everywhere else: the room type is resolved against the
 * caller's own property, so another property's id 404s rather than 403s.
 */
@ApiTags('Staff Room Type Pricing')
@ApiBearerAuth()
@UseGuards(StaffJwtGuard, StaffPermissionsGuard)
@Controller({ path: 'api/v1/staff/room-types', version: VERSION_NEUTRAL })
export class StaffRoomTypePricingController {
  constructor(
    private readonly ratePlans: RatePlansService,
    private readonly engine: RevenueEngineService,
    private readonly audit: AuditService,
  ) {}

  // ---------- Taxes and fees ----------

  @Get(':roomTypeId/fees')
  @RequireStaffPermissions('roomtype.read')
  listFees(@CurrentStaff() me: AuthenticatedStaff, @Param('roomTypeId') roomTypeId: string) {
    return this.ratePlans.listFees(me.propertyId, roomTypeId);
  }

  @Post(':roomTypeId/fees')
  @RequireStaffPermissions('roomtype.create')
  async createFee(
    @CurrentStaff() me: AuthenticatedStaff,
    @Param('roomTypeId') roomTypeId: string,
    @Body() dto: CreateFeeDto,
  ) {
    const fee = await this.ratePlans.createFee(me.propertyId, roomTypeId, dto);
    await this.audit.record({
      action: 'staff.room_type_fee.created',
      entity: 'room_type_fee',
      entityId: fee.id,
      after: { roomTypeId, name: fee.name, calculation: fee.calculation, value: fee.value },
      actorId: me.id,
      actorEmail: me.email,
      actorRole: me.role,
    });
    return fee;
  }

  @Patch('fees/:id')
  @RequireStaffPermissions('roomtype.update')
  async updateFee(
    @CurrentStaff() me: AuthenticatedStaff,
    @Param('id') id: string,
    @Body() dto: UpdateFeeDto,
  ) {
    const fee = await this.ratePlans.updateFee(me.propertyId, id, dto);
    await this.audit.record({
      action: 'staff.room_type_fee.updated',
      entity: 'room_type_fee',
      entityId: fee.id,
      after: { ...dto },
      actorId: me.id,
      actorEmail: me.email,
      actorRole: me.role,
    });
    return fee;
  }

  @Delete('fees/:id')
  @RequireStaffPermissions('roomtype.delete')
  async removeFee(@CurrentStaff() me: AuthenticatedStaff, @Param('id') id: string) {
    const result = await this.ratePlans.removeFee(me.propertyId, id);
    await this.audit.record({
      action: 'staff.room_type_fee.deleted',
      entity: 'room_type_fee',
      entityId: id,
      actorId: me.id,
      actorEmail: me.email,
      actorRole: me.role,
    });
    return result;
  }

  // ---------- Dynamic pricing rules ----------

  /** Run the rules for this type now (or preview what they would do). */
  @Post(':roomTypeId/pricing-rules/run')
  @RequireStaffPermissions('rates.update')
  async runRules(
    @CurrentStaff() me: AuthenticatedStaff,
    @Param('roomTypeId') roomTypeId: string,
    @Body() dto: RunRulesDto,
  ) {
    const res = await this.engine.run(me.propertyId, {
      roomTypeId,
      days: dto.days,
      dryRun: dto.dryRun,
    });
    if (!dto.dryRun) {
      await this.audit.record({
        action: 'staff.pricing_rules.run',
        entity: 'room_type',
        entityId: roomTypeId,
        after: { priced: res.daysPriced, reverted: res.daysReverted },
        actorId: me.id,
        actorEmail: me.email,
        actorRole: me.role,
      });
    }
    return res;
  }

  @Get(':roomTypeId/pricing-rules')
  @RequireStaffPermissions('roomtype.read')
  listRules(@CurrentStaff() me: AuthenticatedStaff, @Param('roomTypeId') roomTypeId: string) {
    return this.ratePlans.listPricingRules(me.propertyId, roomTypeId);
  }

  @Post(':roomTypeId/pricing-rules')
  @RequireStaffPermissions('roomtype.create')
  async createRule(
    @CurrentStaff() me: AuthenticatedStaff,
    @Param('roomTypeId') roomTypeId: string,
    @Body() dto: CreatePricingRuleDto,
  ) {
    const rule = await this.ratePlans.createPricingRule(me.propertyId, roomTypeId, dto);
    await this.audit.record({
      action: 'staff.pricing_rule.created',
      entity: 'pricing_rule',
      entityId: rule.id,
      after: {
        roomTypeId,
        trigger: rule.trigger,
        adjustmentKind: rule.adjustmentKind,
        adjustmentValue: rule.adjustmentValue,
      },
      actorId: me.id,
      actorEmail: me.email,
      actorRole: me.role,
    });
    return rule;
  }

  @Patch('pricing-rules/:id')
  @RequireStaffPermissions('roomtype.update')
  async updateRule(
    @CurrentStaff() me: AuthenticatedStaff,
    @Param('id') id: string,
    @Body() dto: UpdatePricingRuleDto,
  ) {
    const rule = await this.ratePlans.updatePricingRule(me.propertyId, id, dto);
    await this.audit.record({
      action: 'staff.pricing_rule.updated',
      entity: 'pricing_rule',
      entityId: rule.id,
      after: { ...dto },
      actorId: me.id,
      actorEmail: me.email,
      actorRole: me.role,
    });
    return rule;
  }

  @Delete('pricing-rules/:id')
  @RequireStaffPermissions('roomtype.delete')
  async removeRule(@CurrentStaff() me: AuthenticatedStaff, @Param('id') id: string) {
    const result = await this.ratePlans.removePricingRule(me.propertyId, id);
    await this.audit.record({
      action: 'staff.pricing_rule.deleted',
      entity: 'pricing_rule',
      entityId: id,
      actorId: me.id,
      actorEmail: me.email,
      actorRole: me.role,
    });
    return result;
  }
}
