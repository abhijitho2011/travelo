import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { SharedAuthModule } from '../shared-auth/shared-auth.module';
import { PropertiesModule } from '../properties/properties.module';
import { StaffJwtGuard } from '../staff-auth/staff-jwt.guard';
import { StaffPermissionsGuard } from '../staff-auth/staff-permissions.guard';
import { OwnerJwtGuard } from '../owner-auth/owner-jwt.guard';
import { AdminAmenitiesController } from './admin-amenities.controller';
import {
  StaffAmenitiesController,
  StaffRoomTypesController,
  StaffRoomsController,
} from './staff-rooms.controller';
import { OwnerRoomsController } from './owner-rooms.controller';
import { AmenitiesService } from './amenities.service';
import { RoomTypesService } from './room-types.service';
import { RoomsService } from './rooms.service';
import { OwnerRoomsService } from './owner-rooms.service';

/**
 * Rooms, room types and the amenity catalogue — one module serving THREE
 * surfaces over the same tables, because there is one truth about a hotel's
 * rooms and it must not fork:
 *
 *   /api/v1/admin/settings/amenities  — super admin owns the catalogue
 *   /api/v1/staff/room-types, /rooms  — GM/AGM own their property's inventory
 *   /api/v1/owner/properties/:id/...  — the owner sets facilities, reads rooms
 *
 * Each surface brings its own guard and its own token family; nothing here is
 * reachable from more than one of them.
 */
@Module({
  imports: [JwtModule.register({}), SharedAuthModule, PropertiesModule],
  controllers: [
    AdminAmenitiesController,
    StaffRoomTypesController,
    StaffRoomsController,
    StaffAmenitiesController,
    OwnerRoomsController,
  ],
  providers: [
    AmenitiesService,
    RoomTypesService,
    RoomsService,
    OwnerRoomsService,
    StaffJwtGuard,
    StaffPermissionsGuard,
    OwnerJwtGuard,
  ],
  exports: [AmenitiesService, RoomTypesService, RoomsService],
})
export class RoomsModule {}
