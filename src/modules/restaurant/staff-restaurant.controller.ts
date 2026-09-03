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
import { FeatureGuard } from '../../common/guards/feature.guard';
import { RequireFeature } from '../../common/decorators/require-feature.decorator';
import {
  RequireStaffPermissions,
  StaffPermissionsGuard,
} from '../staff-auth/staff-permissions.guard';
import { CurrentStaff, AuthenticatedStaff } from '../staff-auth/current-staff.decorator';
import { AuditService } from '../audit/audit.service';
import { TablesService } from './tables.service';
import { MenuService } from './menu.service';
import { OrdersService } from './orders.service';
import {
  BulkMenuItemsDto,
  OrderDiscountDto,
  AddOrderItemsDto,
  CancelOrderDto,
  CreateCategoryDto,
  CreateMenuItemDto,
  CreateOrderDto,
  CreateTableDto,
  KotUpdateDto,
  MenuQueryDto,
  OrderFilterDto,
  SetAvailabilityDto,
  SettleOrderDto,
  TableFilterDto,
  UpdateCategoryDto,
  UpdateMenuItemDto,
  UpdateTableDto,
} from './dto';

/**
 * Restaurant / F&B, per property. Every route resolves against the caller's own
 * `propertyId`, so a foreign id 404s. The permission split mirrors the floor:
 *
 *   table.read / menu.read / order.read — everyone who works the outlet
 *   table.manage / menu.manage          — the manager owns floor and menu
 *   order.create / order.update         — waiters take and grow orders
 *   kot.update                          — kitchen + floor, split by role in-service
 *   bill.generate                       — running the bill (waiter/cashier/manager)
 *   bill.settle                         — closing it (cashier/manager)
 *   order.void                          — the manager's cancel-with-reason
 */

// ---------- Tables ----------

@ApiTags('Staff Restaurant Tables')
@ApiBearerAuth()
@UseGuards(StaffJwtGuard, StaffPermissionsGuard, FeatureGuard)
@RequireFeature('RESTAURANT')
@Controller({ path: 'api/v1/staff/restaurant/tables', version: VERSION_NEUTRAL })
export class StaffRestaurantTablesController {
  constructor(
    private readonly tables: TablesService,
    private readonly audit: AuditService,
  ) {}

  @Get()
  @RequireStaffPermissions('table.read')
  list(@CurrentStaff() me: AuthenticatedStaff, @Query() q: TableFilterDto) {
    return this.tables.list(me.propertyId, q);
  }

  @Post()
  @RequireStaffPermissions('table.manage')
  async create(@CurrentStaff() me: AuthenticatedStaff, @Body() dto: CreateTableDto) {
    const row = await this.tables.create(me.propertyId, dto);
    await this.audit.record({
      action: 'staff.restaurant.table.created',
      entity: 'restaurant_table',
      entityId: row.id,
      after: row,
      actorId: me.id,
      actorEmail: me.email,
      actorRole: me.role,
    });
    return row;
  }

  @Patch(':id')
  @RequireStaffPermissions('table.manage')
  async update(
    @CurrentStaff() me: AuthenticatedStaff,
    @Param('id') id: string,
    @Body() dto: UpdateTableDto,
  ) {
    const { before, after } = await this.tables.update(me.propertyId, id, dto);
    await this.audit.record({
      action: 'staff.restaurant.table.updated',
      entity: 'restaurant_table',
      entityId: id,
      before,
      after,
      actorId: me.id,
      actorEmail: me.email,
      actorRole: me.role,
    });
    return after;
  }

  @Delete(':id')
  @RequireStaffPermissions('table.manage')
  async remove(@CurrentStaff() me: AuthenticatedStaff, @Param('id') id: string) {
    const res = await this.tables.remove(me.propertyId, id);
    await this.audit.record({
      action: 'staff.restaurant.table.deleted',
      entity: 'restaurant_table',
      entityId: id,
      before: res.before,
      actorId: me.id,
      actorEmail: me.email,
      actorRole: me.role,
    });
    return { id: res.id, deleted: res.deleted };
  }
}

// ---------- Menu ----------

@ApiTags('Staff Restaurant Menu')
@ApiBearerAuth()
@UseGuards(StaffJwtGuard, StaffPermissionsGuard, FeatureGuard)
@RequireFeature('RESTAURANT')
@Controller({ path: 'api/v1/staff/restaurant/menu', version: VERSION_NEUTRAL })
export class StaffRestaurantMenuController {
  constructor(
    private readonly menu: MenuService,
    private readonly audit: AuditService,
  ) {}

  /** The whole menu, grouped by category, in one call. `all=true` → manager view. */
  @Get()
  @RequireStaffPermissions('menu.read')
  grouped(@CurrentStaff() me: AuthenticatedStaff, @Query() q: MenuQueryDto) {
    return this.menu.grouped(me.propertyId, q.all === true);
  }

  // --- categories ---

  @Post('categories')
  @RequireStaffPermissions('menu.manage')
  async createCategory(@CurrentStaff() me: AuthenticatedStaff, @Body() dto: CreateCategoryDto) {
    const row = await this.menu.createCategory(me.propertyId, dto);
    await this.audit.record({
      action: 'staff.restaurant.category.created',
      entity: 'menu_category',
      entityId: row.id,
      after: row,
      actorId: me.id,
      actorEmail: me.email,
      actorRole: me.role,
    });
    return row;
  }

  @Patch('categories/:id')
  @RequireStaffPermissions('menu.manage')
  async updateCategory(
    @CurrentStaff() me: AuthenticatedStaff,
    @Param('id') id: string,
    @Body() dto: UpdateCategoryDto,
  ) {
    const { before, after } = await this.menu.updateCategory(me.propertyId, id, dto);
    await this.audit.record({
      action: 'staff.restaurant.category.updated',
      entity: 'menu_category',
      entityId: id,
      before,
      after,
      actorId: me.id,
      actorEmail: me.email,
      actorRole: me.role,
    });
    return after;
  }

  @Delete('categories/:id')
  @RequireStaffPermissions('menu.manage')
  async removeCategory(@CurrentStaff() me: AuthenticatedStaff, @Param('id') id: string) {
    const res = await this.menu.removeCategory(me.propertyId, id);
    await this.audit.record({
      action: 'staff.restaurant.category.deleted',
      entity: 'menu_category',
      entityId: id,
      before: res.before,
      actorId: me.id,
      actorEmail: me.email,
      actorRole: me.role,
    });
    return { id: res.id, deleted: res.deleted };
  }

  // --- items ---

  /** Bulk menu upload: many items at once, each validated like a single one. */
  @Post('items/bulk')
  @RequireStaffPermissions('menu.manage')
  async bulkItems(@CurrentStaff() me: AuthenticatedStaff, @Body() dto: BulkMenuItemsDto) {
    const created = [];
    for (const item of dto.items) created.push(await this.menu.createItem(me.propertyId, item));
    await this.audit.record({
      action: 'staff.restaurant.menu.bulk_uploaded',
      entity: 'menu_item',
      entityId: me.propertyId,
      after: { count: created.length },
      actorId: me.id,
      actorEmail: me.email,
      actorRole: me.role,
    });
    return { created: created.length, items: created };
  }

  @Post('items')
  @RequireStaffPermissions('menu.manage')
  async createItem(@CurrentStaff() me: AuthenticatedStaff, @Body() dto: CreateMenuItemDto) {
    const row = await this.menu.createItem(me.propertyId, dto);
    await this.audit.record({
      action: 'staff.restaurant.item.created',
      entity: 'menu_item',
      entityId: row.id,
      after: row,
      actorId: me.id,
      actorEmail: me.email,
      actorRole: me.role,
    });
    return row;
  }

  @Patch('items/:id')
  @RequireStaffPermissions('menu.manage')
  async updateItem(
    @CurrentStaff() me: AuthenticatedStaff,
    @Param('id') id: string,
    @Body() dto: UpdateMenuItemDto,
  ) {
    const { before, after } = await this.menu.updateItem(me.propertyId, id, dto);
    await this.audit.record({
      action: 'staff.restaurant.item.updated',
      entity: 'menu_item',
      entityId: id,
      before,
      after,
      actorId: me.id,
      actorEmail: me.email,
      actorRole: me.role,
    });
    return after;
  }

  @Delete('items/:id')
  @RequireStaffPermissions('menu.manage')
  async removeItem(@CurrentStaff() me: AuthenticatedStaff, @Param('id') id: string) {
    const res = await this.menu.removeItem(me.propertyId, id);
    await this.audit.record({
      action: 'staff.restaurant.item.deleted',
      entity: 'menu_item',
      entityId: id,
      before: res.before,
      actorId: me.id,
      actorEmail: me.email,
      actorRole: me.role,
    });
    return { id: res.id, deleted: res.deleted };
  }

  /** The 86 flow: available on/off. */
  @Post('items/:id/availability')
  @RequireStaffPermissions('menu.manage')
  async setAvailability(
    @CurrentStaff() me: AuthenticatedStaff,
    @Param('id') id: string,
    @Body() dto: SetAvailabilityDto,
  ) {
    const { before, after } = await this.menu.setAvailability(me.propertyId, id, dto.available);
    await this.audit.record({
      action: 'staff.restaurant.item.availability_changed',
      entity: 'menu_item',
      entityId: id,
      before: { status: before.status },
      after: { status: after.status },
      actorId: me.id,
      actorEmail: me.email,
      actorRole: me.role,
    });
    return after;
  }
}

// ---------- Kitchen display ----------

@ApiTags('Staff Restaurant Kitchen')
@ApiBearerAuth()
@UseGuards(StaffJwtGuard, StaffPermissionsGuard, FeatureGuard)
@RequireFeature('RESTAURANT')
@Controller({ path: 'api/v1/staff/restaurant/kitchen', version: VERSION_NEUTRAL })
export class StaffRestaurantKitchenController {
  constructor(private readonly orders: OrdersService) {}

  @Get()
  @RequireStaffPermissions('kot.read')
  kitchen(@CurrentStaff() me: AuthenticatedStaff) {
    return this.orders.kitchen(me.propertyId);
  }
}

// ---------- Summary ----------

@ApiTags('Staff Restaurant Summary')
@ApiBearerAuth()
@UseGuards(StaffJwtGuard, StaffPermissionsGuard, FeatureGuard)
@RequireFeature('RESTAURANT')
@Controller({ path: 'api/v1/staff/restaurant/summary', version: VERSION_NEUTRAL })
export class StaffRestaurantSummaryController {
  constructor(private readonly orders: OrdersService) {}

  @Get()
  @RequireStaffPermissions('restaurant.read')
  summary(@CurrentStaff() me: AuthenticatedStaff) {
    // "Today" is the server's local calendar day. Revenue counts orders paid
    // since midnight this morning.
    const since = new Date();
    since.setHours(0, 0, 0, 0);
    return this.orders.summary(me.propertyId, since);
  }
}

// ---------- Orders ----------

@ApiTags('Staff Restaurant Orders')
@ApiBearerAuth()
@UseGuards(StaffJwtGuard, StaffPermissionsGuard, FeatureGuard)
@RequireFeature('RESTAURANT')
@Controller({ path: 'api/v1/staff/restaurant/orders', version: VERSION_NEUTRAL })
export class StaffRestaurantOrdersController {
  constructor(
    private readonly orders: OrdersService,
    private readonly audit: AuditService,
  ) {}

  @Get()
  @RequireStaffPermissions('order.read')
  list(@CurrentStaff() me: AuthenticatedStaff, @Query() q: OrderFilterDto) {
    return this.orders.list(me.propertyId, q, me.id);
  }

  @Post()
  @RequireStaffPermissions('order.create')
  async create(@CurrentStaff() me: AuthenticatedStaff, @Body() dto: CreateOrderDto) {
    const row = await this.orders.create(me.propertyId, dto, me.id);
    await this.audit.record({
      action: 'staff.restaurant.order.created',
      entity: 'restaurant_order',
      entityId: row.id,
      after: { orderNumber: row.orderNumber, tableId: row.tableId },
      actorId: me.id,
      actorEmail: me.email,
      actorRole: me.role,
    });
    return row;
  }

  @Get(':id')
  @RequireStaffPermissions('order.read')
  get(@CurrentStaff() me: AuthenticatedStaff, @Param('id') id: string) {
    return this.orders.get(me.propertyId, id);
  }

  @Post(':id/items')
  @RequireStaffPermissions('order.update')
  async addItems(
    @CurrentStaff() me: AuthenticatedStaff,
    @Param('id') id: string,
    @Body() dto: AddOrderItemsDto,
  ) {
    const row = await this.orders.addItems(me.propertyId, id, dto);
    await this.audit.record({
      action: 'staff.restaurant.order.items_added',
      entity: 'restaurant_order',
      entityId: id,
      after: { count: dto.items.length },
      actorId: me.id,
      actorEmail: me.email,
      actorRole: me.role,
    });
    return row;
  }

  @Post(':id/items/:itemId/kot')
  @RequireStaffPermissions('kot.update')
  async setKot(
    @CurrentStaff() me: AuthenticatedStaff,
    @Param('id') id: string,
    @Param('itemId') itemId: string,
    @Body() dto: KotUpdateDto,
  ) {
    const row = await this.orders.setKotStatus(me.propertyId, id, itemId, dto.status, me.role);
    await this.audit.record({
      action: 'staff.restaurant.order.kot_changed',
      entity: 'order_item',
      entityId: itemId,
      after: { status: dto.status },
      actorId: me.id,
      actorEmail: me.email,
      actorRole: me.role,
    });
    return row;
  }

  @Post(':id/items/:itemId/cancel')
  @RequireStaffPermissions('order.update')
  async cancelItem(
    @CurrentStaff() me: AuthenticatedStaff,
    @Param('id') id: string,
    @Param('itemId') itemId: string,
  ) {
    const row = await this.orders.cancelItem(me.propertyId, id, itemId);
    await this.audit.record({
      action: 'staff.restaurant.order.item_cancelled',
      entity: 'order_item',
      entityId: itemId,
      actorId: me.id,
      actorEmail: me.email,
      actorRole: me.role,
    });
    return row;
  }

  @Post(':id/bill')
  @RequireStaffPermissions('bill.generate')
  async bill(@CurrentStaff() me: AuthenticatedStaff, @Param('id') id: string) {
    const row = await this.orders.bill(me.propertyId, id);
    await this.audit.record({
      action: 'staff.restaurant.order.billed',
      entity: 'restaurant_order',
      entityId: id,
      after: { totalPaise: row.totalPaise, taxPaise: row.taxPaise },
      actorId: me.id,
      actorEmail: me.email,
      actorRole: me.role,
    });
    return row;
  }

  /** A discount with a reason. Order-level; the bill recomputes. */
  @Post(':id/discount')
  @RequireStaffPermissions('bill.settle')
  async discount(
    @CurrentStaff() me: AuthenticatedStaff,
    @Param('id') id: string,
    @Body() dto: OrderDiscountDto,
  ) {
    const row = await this.orders.applyDiscount(me.propertyId, id, dto);
    await this.audit.record({
      action: 'staff.restaurant.order.discounted',
      entity: 'restaurant_order',
      entityId: id,
      after: { amountPaise: dto.amountPaise, reason: dto.reason },
      actorId: me.id,
      actorEmail: me.email,
      actorRole: me.role,
    });
    return row;
  }

  @Post(':id/settle')
  @RequireStaffPermissions('bill.settle')
  async settle(
    @CurrentStaff() me: AuthenticatedStaff,
    @Param('id') id: string,
    @Body() dto: SettleOrderDto,
  ) {
    const row = await this.orders.settle(me.propertyId, id, dto, me.id);
    await this.audit.record({
      action: 'staff.restaurant.order.settled',
      entity: 'restaurant_order',
      entityId: id,
      after: { method: dto.method, reservationId: row.reservationId, totalPaise: row.totalPaise },
      actorId: me.id,
      actorEmail: me.email,
      actorRole: me.role,
    });
    return row;
  }

  @Post(':id/cancel')
  @RequireStaffPermissions('order.void')
  async cancel(
    @CurrentStaff() me: AuthenticatedStaff,
    @Param('id') id: string,
    @Body() dto: CancelOrderDto,
  ) {
    const row = await this.orders.cancel(me.propertyId, id, dto);
    await this.audit.record({
      action: 'staff.restaurant.order.cancelled',
      entity: 'restaurant_order',
      entityId: id,
      reason: dto.reason,
      actorId: me.id,
      actorEmail: me.email,
      actorRole: me.role,
    });
    return row;
  }
}
