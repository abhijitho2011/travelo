import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { SharedAuthModule } from '../shared-auth/shared-auth.module';
import { StaffJwtGuard } from '../staff-auth/staff-jwt.guard';
import { StaffPermissionsGuard } from '../staff-auth/staff-permissions.guard';
import {
  StaffRestaurantKitchenController,
  StaffRestaurantMenuController,
  StaffRestaurantOrdersController,
  StaffRestaurantSummaryController,
  StaffRestaurantTablesController,
} from './staff-restaurant.controller';
import { TablesService } from './tables.service';
import { MenuService } from './menu.service';
import { OrdersService } from './orders.service';
import { FolioModule } from '../folio/folio.module';
import { EntitlementsModule } from '../entitlements/entitlements.module';
import { FeatureGuard } from '../../common/guards/feature.guard';

/**
 * Restaurant / F&B — one module, one staff surface under
 * `/api/v1/staff/restaurant/*`: tables, menu, orders, the kitchen display and
 * the outlet summary. Reservations are read (not written) for the ROOM_CHARGE
 * settlement path; nothing here mutates a booking.
 */
@Module({
  imports: [JwtModule.register({}), SharedAuthModule, FolioModule, EntitlementsModule],
  controllers: [
    StaffRestaurantTablesController,
    StaffRestaurantMenuController,
    StaffRestaurantKitchenController,
    StaffRestaurantSummaryController,
    StaffRestaurantOrdersController,
  ],
  providers: [
    TablesService,
    MenuService,
    OrdersService,
    StaffJwtGuard,
    StaffPermissionsGuard,
    FeatureGuard,
  ],
  exports: [TablesService, MenuService, OrdersService],
})
export class RestaurantModule {}
