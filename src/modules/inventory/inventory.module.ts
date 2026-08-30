import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { SharedAuthModule } from '../shared-auth/shared-auth.module';
import { StaffJwtGuard } from '../staff-auth/staff-jwt.guard';
import { StaffPermissionsGuard } from '../staff-auth/staff-permissions.guard';
import { StaffInventoryController } from './staff-inventory.controller';
import { ItemsService } from './items.service';
import { SuppliersService } from './suppliers.service';
import { PurchaseOrdersService } from './purchase-orders.service';
import { InventorySummaryService } from './inventory-summary.service';

/**
 * Inventory / Store — one staff surface under `/api/v1/staff/inventory/*`:
 * items, stock movements, suppliers and purchase orders. Stock on-hand only
 * ever changes through a movement, and a received PO creates its IN movements —
 * both transactional.
 */
@Module({
  imports: [JwtModule.register({}), SharedAuthModule],
  controllers: [StaffInventoryController],
  providers: [
    ItemsService,
    SuppliersService,
    PurchaseOrdersService,
    InventorySummaryService,
    StaffJwtGuard,
    StaffPermissionsGuard,
  ],
  exports: [ItemsService, SuppliersService, PurchaseOrdersService, InventorySummaryService],
})
export class InventoryModule {}
