import {
  Body,
  Controller,
  Get,
  Param,
  Put,
  Query,
  UseGuards,
  VERSION_NEUTRAL,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { OwnerJwtGuard } from '../owner-auth/owner-jwt.guard';
import { CurrentOwner, AuthenticatedOwner } from '../owner-auth/current-owner.decorator';
import { AuditService } from '../audit/audit.service';
import { OwnerRoomsService } from './owner-rooms.service';
import { RoomFilterDto, RoomTypeFilterDto, SetPropertyAmenitiesDto } from './dto';

/**
 * The owner's window onto one of their hotels' inventory.
 *
 * WRITE: property amenities only. What the hotel itself offers is the owner's
 * call. WRITE nothing else — rooms and room types are created by the GM, and
 * giving the owner a create button would put two people in charge of the same
 * numbers.
 *
 * READ: room types and rooms, so the portfolio view shows what the hotel
 * actually has rather than a number somebody typed once.
 */
@ApiTags('Owner Rooms')
@ApiBearerAuth()
@UseGuards(OwnerJwtGuard)
@Controller({ path: 'api/v1/owner/properties', version: VERSION_NEUTRAL })
export class OwnerRoomsController {
  constructor(
    private readonly svc: OwnerRoomsService,
    private readonly audit: AuditService,
  ) {}

  @Get(':id/amenities')
  amenities(@CurrentOwner() owner: AuthenticatedOwner, @Param('id') id: string) {
    return this.svc.getPropertyAmenities(owner.id, id);
  }

  @Put(':id/amenities')
  async setAmenities(
    @CurrentOwner() owner: AuthenticatedOwner,
    @Param('id') id: string,
    @Body() dto: SetPropertyAmenitiesDto,
  ) {
    const res = await this.svc.setPropertyAmenities(owner.id, id, dto.amenityIds);
    await this.audit.record({
      action: 'owner.property.amenities_set',
      entity: 'property',
      entityId: id,
      after: { amenityIds: dto.amenityIds },
      actorId: owner.id,
      actorEmail: owner.email,
      actorRole: 'OWNER',
    });
    return res;
  }

  @Get(':id/room-types')
  roomTypes(
    @CurrentOwner() owner: AuthenticatedOwner,
    @Param('id') id: string,
    @Query() q: RoomTypeFilterDto,
  ) {
    return this.svc.listRoomTypes(owner.id, id, q);
  }

  @Get(':id/rooms')
  rooms(
    @CurrentOwner() owner: AuthenticatedOwner,
    @Param('id') id: string,
    @Query() q: RoomFilterDto,
  ) {
    return this.svc.listRooms(owner.id, id, q);
  }
}
