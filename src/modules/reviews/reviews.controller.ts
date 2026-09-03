import { Body, Controller, Get, Param, Post, UseGuards, VERSION_NEUTRAL } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Matches,
  Max,
  Min,
} from 'class-validator';
import { AuditService } from '../audit/audit.service';
import { CurrentStaff, AuthenticatedStaff } from '../staff-auth/current-staff.decorator';
import { StaffJwtGuard } from '../staff-auth/staff-jwt.guard';
import {
  RequireStaffPermissions,
  StaffPermissionsGuard,
} from '../staff-auth/staff-permissions.guard';
import { ReviewsService } from './reviews.service';

class ReviewDto {
  @IsOptional()
  @IsIn(['GOOGLE', 'BOOKING_COM', 'MAKEMYTRIP', 'TRIPADVISOR', 'DIRECT', 'OTHER'])
  source?: 'GOOGLE' | 'BOOKING_COM' | 'MAKEMYTRIP' | 'TRIPADVISOR' | 'DIRECT' | 'OTHER';
  @IsOptional() @IsString() @Length(0, 160) guestName?: string;
  @IsInt() @Min(1) @Max(5) rating!: number;
  @IsOptional() @IsString() @Length(0, 200) title?: string;
  @IsOptional() @IsString() @Length(0, 5000) body?: string;
  @IsOptional() @Matches(/^\d{4}-\d{2}-\d{2}$/) reviewedAt?: string;
  @IsOptional() @IsString() @Length(0, 512) externalUrl?: string;
  @IsOptional() @IsUUID() reservationId?: string;
}
class RespondDto {
  @IsString() @Length(2, 4000) response!: string;
}
class DraftDto {
  @IsOptional() @IsIn(['warm', 'formal', 'brief']) tone?: 'warm' | 'formal' | 'brief';
}

@ApiTags('Staff Reviews')
@ApiBearerAuth()
@UseGuards(StaffJwtGuard, StaffPermissionsGuard)
@Controller({ path: 'api/v1/staff/reviews', version: VERSION_NEUTRAL })
export class StaffReviewsController {
  constructor(
    private readonly reviews: ReviewsService,
    private readonly audit: AuditService,
  ) {}

  @Get()
  @RequireStaffPermissions('review.read')
  list(@CurrentStaff() me: AuthenticatedStaff) {
    return this.reviews.list(me.propertyId);
  }

  @Post()
  @RequireStaffPermissions('review.respond')
  async create(@CurrentStaff() me: AuthenticatedStaff, @Body() dto: ReviewDto) {
    const row = await this.reviews.create(me.propertyId, dto);
    await this.audit.record({
      action: 'staff.review.added',
      entity: 'review',
      entityId: row.id,
      after: { source: dto.source, rating: dto.rating },
      actorId: me.id,
      actorEmail: me.email,
      actorRole: me.role,
    });
    return row;
  }

  @Post(':id/draft')
  @RequireStaffPermissions('review.respond')
  draft(@CurrentStaff() me: AuthenticatedStaff, @Param('id') id: string, @Body() dto: DraftDto) {
    return this.reviews.draft(me.propertyId, id, dto.tone ?? 'warm');
  }

  @Post(':id/respond')
  @RequireStaffPermissions('review.respond')
  async respond(
    @CurrentStaff() me: AuthenticatedStaff,
    @Param('id') id: string,
    @Body() dto: RespondDto,
  ) {
    const row = await this.reviews.respond(me.propertyId, id, dto.response, me.id);
    await this.audit.record({
      action: 'staff.review.responded',
      entity: 'review',
      entityId: id,
      actorId: me.id,
      actorEmail: me.email,
      actorRole: me.role,
    });
    return row;
  }
}
