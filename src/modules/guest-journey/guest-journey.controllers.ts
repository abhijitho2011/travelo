import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  UploadedFile,
  UseGuards,
  UseInterceptors,
  VERSION_NEUTRAL,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiConsumes, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsEmail,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';
import { AuditService } from '../audit/audit.service';
import { CurrentStaff, AuthenticatedStaff } from '../staff-auth/current-staff.decorator';
import { StaffJwtGuard } from '../staff-auth/staff-jwt.guard';
import {
  RequireStaffPermissions,
  StaffPermissionsGuard,
} from '../staff-auth/staff-permissions.guard';
import { GuestJourneyService, type GuestLinkWindow } from './guest-journey.service';

class GuestCheckinDto {
  @IsOptional() @IsString() @Length(2, 160) guestName?: string;
  @IsOptional() @IsEmail() guestEmail?: string;
  @IsOptional() @IsString() @Length(1, 32) idType?: string;
  @IsOptional() @IsString() @Length(1, 64) idNumber?: string;
  @IsOptional() @IsInt() @Min(1) @Max(20) adults?: number;
  @IsOptional() @IsInt() @Min(0) @Max(20) children?: number;
  @IsOptional() @IsString() @Length(0, 1000) notes?: string;
}
class PickDto {
  @IsUUID() id!: string;
  @IsOptional() @IsInt() @Min(1) @Max(50) quantity?: number;
}
class GuestRequestsDto {
  @IsArray()
  @ArrayMaxSize(20)
  @ValidateNested({ each: true })
  @Type(() => PickDto)
  picks!: PickDto[];
}
class UploadKindDto {
  @IsOptional() @IsIn(['id', 'photo']) kind?: 'id' | 'photo';
}
class GuestLinkListQueryDto {
  /** today (default): arrivals today + in-house; week: next 7 days + in-house; all: every future stay + in-house. */
  @IsOptional() @IsIn(['today', 'week', 'all']) window?: GuestLinkWindow;
}

/** The guest side. No user, no guard: the token IS the credential, and it is throttled. */
@ApiTags('Public Guest Link')
@Controller({ path: 'api/v1/public/guest', version: VERSION_NEUTRAL })
export class PublicGuestController {
  constructor(private readonly journey: GuestJourneyService) {}

  @Get(':token')
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  page(@Param('token') token: string) {
    return this.journey.page(token);
  }

  @Post(':token/checkin')
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  checkin(@Param('token') token: string, @Body() dto: GuestCheckinDto) {
    return this.journey.submitCheckin(token, dto);
  }

  @Post(':token/upload')
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 8 * 1024 * 1024, files: 1 } }))
  upload(
    @Param('token') token: string,
    @UploadedFile() file: { mimetype: string; size: number; buffer: Buffer; originalname?: string },
    @Body() dto: UploadKindDto,
  ) {
    return this.journey.upload(token, dto.kind ?? 'id', file);
  }

  @Post(':token/requests')
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  requests(@Param('token') token: string, @Body() dto: GuestRequestsDto) {
    return this.journey.requestServices(token, dto.picks);
  }

  @Post(':token/checkout')
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  checkout(@Param('token') token: string) {
    return this.journey.requestCheckout(token);
  }
}

/** The desk side: send the link, see what the guest did. */
@ApiTags('Staff Guest Link')
@ApiBearerAuth()
@UseGuards(StaffJwtGuard, StaffPermissionsGuard)
@Controller({ path: 'api/v1/staff/reservations/:id/guest-link', version: VERSION_NEUTRAL })
export class StaffGuestLinkController {
  constructor(
    private readonly journey: GuestJourneyService,
    private readonly audit: AuditService,
  ) {}

  @Get()
  @RequireStaffPermissions('reservation.read')
  status(@CurrentStaff() me: AuthenticatedStaff, @Param('id') id: string) {
    return this.journey.status(me.propertyId, id);
  }

  /** Send (or re-send) the guest's link by SMS and email. */
  @Post()
  @RequireStaffPermissions('reservation.update')
  async send(@CurrentStaff() me: AuthenticatedStaff, @Param('id') id: string) {
    const res = await this.journey.issue(me.propertyId, id, me.id);
    await this.audit.record({
      action: 'staff.reservation.magic_link_sent',
      entity: 'reservation',
      entityId: id,
      after: { sentTo: res.sentTo },
      actorId: me.id,
      actorEmail: me.email,
      actorRole: me.role,
    });
    return res;
  }
}

/** The desk's link board across the property: who was sent a link and what they did with it. */
@ApiTags('Staff Guest Link')
@ApiBearerAuth()
@UseGuards(StaffJwtGuard, StaffPermissionsGuard)
@Controller({ path: 'api/v1/staff/guest-links', version: VERSION_NEUTRAL })
export class StaffGuestLinksController {
  constructor(private readonly journey: GuestJourneyService) {}

  @Get()
  @RequireStaffPermissions('reservation.read')
  list(@CurrentStaff() me: AuthenticatedStaff, @Query() query: GuestLinkListQueryDto) {
    return this.journey.list(me.propertyId, query.window ?? 'today');
  }
}
