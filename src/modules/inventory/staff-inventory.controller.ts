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
import { ItemsService } from './items.service';
import { SuppliersService } from './suppliers.service';
import { PurchaseOrdersService } from './purchase-orders.service';
import { InventorySummaryService } from './inventory-summary.service';
import {
  CreateItemDto,
  CreateMovementDto,
  CreatePoDto,
  CreateSupplierDto,
  ItemFilterDto,
  MovementFilterDto,
  PoFilterDto,
  PoStatusDto,
  UpdateItemDto,
  UpdatePoDto,
  UpdateSupplierDto,
} from './dto';

/**
 * Inventory / Store, per property. Every route resolves against the caller's own
 * propertyId, so a foreign id 404s. Stock quantity and PO-receive are
 * transactional (see the services). Money is integer paise.
 */
@ApiTags('Staff Inventory')
@ApiBearerAuth()
@UseGuards(StaffJwtGuard, StaffPermissionsGuard)
@Controller({ path: 'api/v1/staff/inventory', version: VERSION_NEUTRAL })
export class StaffInventoryController {
  constructor(
    private readonly items: ItemsService,
    private readonly suppliers: SuppliersService,
    private readonly pos: PurchaseOrdersService,
    private readonly summarySvc: InventorySummaryService,
    private readonly audit: AuditService,
  ) {}

  private actor(me: AuthenticatedStaff) {
    return { actorId: me.id, actorEmail: me.email, actorRole: me.role };
  }

  @Get('summary')
  @RequireStaffPermissions('inventory.read')
  summary(@CurrentStaff() me: AuthenticatedStaff) {
    return this.summarySvc.summary(me.propertyId);
  }

  // ---------- Items ----------

  @Get('items')
  @RequireStaffPermissions('inventory.read')
  listItems(@CurrentStaff() me: AuthenticatedStaff, @Query() q: ItemFilterDto) {
    return this.items.list(me.propertyId, q);
  }

  @Get('items/low-stock')
  @RequireStaffPermissions('inventory.read')
  lowStock(@CurrentStaff() me: AuthenticatedStaff) {
    return this.items.lowStock(me.propertyId);
  }

  @Get('movements')
  @RequireStaffPermissions('stock.read')
  listMovements(@CurrentStaff() me: AuthenticatedStaff, @Query() q: MovementFilterDto) {
    return this.items.listMovements(me.propertyId, q);
  }

  @Get('items/:id')
  @RequireStaffPermissions('inventory.read')
  getItem(@CurrentStaff() me: AuthenticatedStaff, @Param('id') id: string) {
    return this.items.get(me.propertyId, id);
  }

  @Post('items')
  @RequireStaffPermissions('inventory.create')
  async createItem(@CurrentStaff() me: AuthenticatedStaff, @Body() dto: CreateItemDto) {
    const row = await this.items.create(me.propertyId, dto, me.id);
    await this.audit.record({
      action: 'staff.inventory.item.created',
      entity: 'inventory_item',
      entityId: row.id,
      after: row,
      ...this.actor(me),
    });
    return row;
  }

  @Patch('items/:id')
  @RequireStaffPermissions('inventory.update')
  async updateItem(
    @CurrentStaff() me: AuthenticatedStaff,
    @Param('id') id: string,
    @Body() dto: UpdateItemDto,
  ) {
    const { before, after } = await this.items.update(me.propertyId, id, dto);
    await this.audit.record({
      action: 'staff.inventory.item.updated',
      entity: 'inventory_item',
      entityId: id,
      before,
      after,
      ...this.actor(me),
    });
    return after;
  }

  @Delete('items/:id')
  @RequireStaffPermissions('inventory.update')
  async removeItem(@CurrentStaff() me: AuthenticatedStaff, @Param('id') id: string) {
    const res = await this.items.remove(me.propertyId, id);
    await this.audit.record({
      action: 'staff.inventory.item.deleted',
      entity: 'inventory_item',
      entityId: id,
      before: res.before,
      ...this.actor(me),
    });
    return res;
  }

  @Post('items/:id/movements')
  @RequireStaffPermissions('stock.adjust')
  async recordMovement(
    @CurrentStaff() me: AuthenticatedStaff,
    @Param('id') id: string,
    @Body() dto: CreateMovementDto,
  ) {
    const res = await this.items.recordMovement(me.propertyId, id, {
      type: dto.type,
      qty: dto.qty,
      reason: dto.reason,
      createdBy: me.id,
    });
    await this.audit.record({
      action: 'staff.inventory.stock.moved',
      entity: 'stock_movement',
      entityId: res.movement.id,
      after: res.movement,
      reason: `${dto.type} ${dto.qty} → on-hand ${res.item.currentQty}`,
      ...this.actor(me),
    });
    return res;
  }

  // ---------- Suppliers ----------

  @Get('suppliers')
  @RequireStaffPermissions('supplier.read')
  listSuppliers(@CurrentStaff() me: AuthenticatedStaff) {
    return this.suppliers.list(me.propertyId);
  }

  @Get('suppliers/:id')
  @RequireStaffPermissions('supplier.read')
  getSupplier(@CurrentStaff() me: AuthenticatedStaff, @Param('id') id: string) {
    return this.suppliers.get(me.propertyId, id);
  }

  @Post('suppliers')
  @RequireStaffPermissions('supplier.create')
  async createSupplier(@CurrentStaff() me: AuthenticatedStaff, @Body() dto: CreateSupplierDto) {
    const row = await this.suppliers.create(me.propertyId, dto);
    await this.audit.record({
      action: 'staff.inventory.supplier.created',
      entity: 'supplier',
      entityId: row.id,
      after: row,
      ...this.actor(me),
    });
    return row;
  }

  @Patch('suppliers/:id')
  @RequireStaffPermissions('supplier.update')
  async updateSupplier(
    @CurrentStaff() me: AuthenticatedStaff,
    @Param('id') id: string,
    @Body() dto: UpdateSupplierDto,
  ) {
    const { before, after } = await this.suppliers.update(me.propertyId, id, dto);
    await this.audit.record({
      action: 'staff.inventory.supplier.updated',
      entity: 'supplier',
      entityId: id,
      before,
      after,
      ...this.actor(me),
    });
    return after;
  }

  @Delete('suppliers/:id')
  @RequireStaffPermissions('supplier.update')
  async removeSupplier(@CurrentStaff() me: AuthenticatedStaff, @Param('id') id: string) {
    const res = await this.suppliers.remove(me.propertyId, id);
    await this.audit.record({
      action: 'staff.inventory.supplier.deleted',
      entity: 'supplier',
      entityId: id,
      before: res.before,
      ...this.actor(me),
    });
    return res;
  }

  // ---------- Purchase orders ----------

  @Get('purchase-orders')
  @RequireStaffPermissions('po.read')
  listPos(@CurrentStaff() me: AuthenticatedStaff, @Query() q: PoFilterDto) {
    return this.pos.list(me.propertyId, q);
  }

  @Get('purchase-orders/:id')
  @RequireStaffPermissions('po.read')
  getPo(@CurrentStaff() me: AuthenticatedStaff, @Param('id') id: string) {
    return this.pos.get(me.propertyId, id);
  }

  @Post('purchase-orders')
  @RequireStaffPermissions('po.create')
  async createPo(@CurrentStaff() me: AuthenticatedStaff, @Body() dto: CreatePoDto) {
    const row = await this.pos.create(me.propertyId, dto, me.id);
    await this.audit.record({
      action: 'staff.inventory.po.created',
      entity: 'purchase_order',
      entityId: row.id,
      after: row,
      ...this.actor(me),
    });
    return row;
  }

  @Patch('purchase-orders/:id')
  @RequireStaffPermissions('po.update')
  async updatePo(
    @CurrentStaff() me: AuthenticatedStaff,
    @Param('id') id: string,
    @Body() dto: UpdatePoDto,
  ) {
    const { before, after } = await this.pos.update(me.propertyId, id, dto);
    await this.audit.record({
      action: 'staff.inventory.po.updated',
      entity: 'purchase_order',
      entityId: id,
      before,
      after,
      ...this.actor(me),
    });
    return after;
  }

  @Patch('purchase-orders/:id/status')
  @RequireStaffPermissions('po.update')
  async setPoStatus(
    @CurrentStaff() me: AuthenticatedStaff,
    @Param('id') id: string,
    @Body() dto: PoStatusDto,
  ) {
    const { before, after } = await this.pos.setStatus(me.propertyId, id, dto.status);
    await this.audit.record({
      action: 'staff.inventory.po.status_changed',
      entity: 'purchase_order',
      entityId: id,
      before,
      after,
      reason: `${before.status} → ${after.status}`,
      ...this.actor(me),
    });
    return after;
  }

  @Post('purchase-orders/:id/receive')
  @RequireStaffPermissions('po.receive')
  async receivePo(@CurrentStaff() me: AuthenticatedStaff, @Param('id') id: string) {
    const { before, after } = await this.pos.receive(me.propertyId, id, me.id);
    await this.audit.record({
      action: 'staff.inventory.po.received',
      entity: 'purchase_order',
      entityId: id,
      before,
      after,
      reason: `Received ${after.poNumber}: ${after.lines.length} line(s) into stock`,
      ...this.actor(me),
    });
    return after;
  }
}
