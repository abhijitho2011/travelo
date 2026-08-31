import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Put,
  UseGuards,
  VERSION_NEUTRAL,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength } from 'class-validator';
import { StaffJwtGuard } from '../staff-auth/staff-jwt.guard';
import {
  RequireStaffPermissions,
  StaffPermissionsGuard,
} from '../staff-auth/staff-permissions.guard';
import { CurrentStaff, AuthenticatedStaff } from '../staff-auth/current-staff.decorator';
import { AuditService } from '../audit/audit.service';
import { StaffChannelsService } from './staff-channels.service';

export class MapChannelDto {
  /** The room type's id ON THE CHANNEL — copied out of the channel manager. */
  @IsString() @MaxLength(128) channelRoomTypeId!: string;
  @IsOptional() @IsString() @MaxLength(128) channelRatePlanId?: string;
}

/**
 * The property's sales channels, read-only: connecting one is an administrator's
 * job, so staff get the health of what exists and nothing else.
 *
 * The property is NEVER a parameter — every route resolves against the caller's
 * own `propertyId`, so a foreign id 404s rather than 403s.
 */
@ApiTags('Staff Sales Channels')
@ApiBearerAuth()
@UseGuards(StaffJwtGuard, StaffPermissionsGuard)
@Controller({ path: 'api/v1/staff/channels', version: VERSION_NEUTRAL })
export class StaffChannelsController {
  constructor(private readonly channels: StaffChannelsService) {}

  @Get()
  @RequireStaffPermissions('roomtype.read')
  list(@CurrentStaff() me: AuthenticatedStaff) {
    return this.channels.list(me.propertyId);
  }
}

/**
 * The per-room-type mapping. Reading it is `roomtype.read` like every other read
 * on the catalogue; writing it is `roomtype.update`, because it changes what the
 * hotel sells and where.
 */
@ApiTags('Staff Sales Channels')
@ApiBearerAuth()
@UseGuards(StaffJwtGuard, StaffPermissionsGuard)
@Controller({ path: 'api/v1/staff/room-types', version: VERSION_NEUTRAL })
export class StaffRoomTypeChannelsController {
  constructor(
    private readonly channels: StaffChannelsService,
    private readonly audit: AuditService,
  ) {}

  @Get(':roomTypeId/channels')
  @RequireStaffPermissions('roomtype.read')
  list(@CurrentStaff() me: AuthenticatedStaff, @Param('roomTypeId') roomTypeId: string) {
    return this.channels.mappingsForRoomType(me.propertyId, roomTypeId);
  }

  @Put(':roomTypeId/channels/:connectionId')
  @RequireStaffPermissions('roomtype.update')
  async map(
    @CurrentStaff() me: AuthenticatedStaff,
    @Param('roomTypeId') roomTypeId: string,
    @Param('connectionId') connectionId: string,
    @Body() dto: MapChannelDto,
  ) {
    const mapping = await this.channels.mapRoomType(me.propertyId, roomTypeId, connectionId, dto);
    await this.audit.record({
      action: 'staff.channel_mapping.updated',
      entity: 'integration_connection',
      entityId: connectionId,
      after: {
        roomTypeId,
        channelRoomTypeId: mapping.channelRoomTypeId,
        channelRatePlanId: mapping.channelRatePlanId,
      },
      actorId: me.id,
      actorEmail: me.email,
      actorRole: me.role,
    });
    return mapping;
  }

  @Delete(':roomTypeId/channels/:connectionId')
  @RequireStaffPermissions('roomtype.update')
  async unmap(
    @CurrentStaff() me: AuthenticatedStaff,
    @Param('roomTypeId') roomTypeId: string,
    @Param('connectionId') connectionId: string,
  ) {
    const mapping = await this.channels.unmapRoomType(me.propertyId, roomTypeId, connectionId);
    await this.audit.record({
      action: 'staff.channel_mapping.removed',
      entity: 'integration_connection',
      entityId: connectionId,
      after: { roomTypeId },
      actorId: me.id,
      actorEmail: me.email,
      actorRole: me.role,
    });
    return mapping;
  }
}
