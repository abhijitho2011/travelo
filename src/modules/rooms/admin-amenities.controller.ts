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
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { AuditService } from '../audit/audit.service';
import { AmenitiesService } from './amenities.service';
import { AmenityFilterDto, CreateAmenityDto, UpdateAmenityDto } from './dto';

/**
 * The amenity catalogue, managed by the super admin — a deliberate mirror of
 * AdminLocationsController.
 *
 * One catalogue for the whole platform is the point: it is what makes "Wifi"
 * the same row at every hotel, so cross-property reporting can group on `key`
 * instead of on free text. GMs pick from it; they never extend it.
 *
 * Every mutation is audited, because this is reference data a thousand rooms
 * depend on and "who archived the pool?" has to be answerable.
 */
@ApiTags('Admin Settings - Amenities')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('settings/amenities')
export class AdminAmenitiesController {
  constructor(
    private readonly amenities: AmenitiesService,
    private readonly audit: AuditService,
  ) {}

  @Get()
  @RequirePermissions('settings.amenities.manage')
  list(@Query() q: AmenityFilterDto) {
    return this.amenities.list(q);
  }

  @Post()
  @RequirePermissions('settings.amenities.manage')
  async create(@Body() dto: CreateAmenityDto) {
    const row = await this.amenities.create(dto);
    await this.audit.record({
      action: 'settings.amenity.created',
      entity: 'amenity',
      entityId: row.id,
      after: row,
    });
    return row;
  }

  @Patch(':id')
  @RequirePermissions('settings.amenities.manage')
  async update(@Param('id') id: string, @Body() dto: UpdateAmenityDto) {
    const { before, after } = await this.amenities.update(id, dto);
    await this.audit.record({
      action: 'settings.amenity.updated',
      entity: 'amenity',
      entityId: id,
      before,
      after,
    });
    return after;
  }

  /**
   * ARCHIVES rather than deletes. A hard delete would cascade every
   * room_type_amenities / room_amenities / property_amenities row away and
   * silently change what hotels advertise. Archiving takes it out of the
   * pickers and leaves existing rooms exactly as they are.
   */
  @Delete(':id')
  @RequirePermissions('settings.amenities.manage')
  async archive(@Param('id') id: string) {
    const { before, after } = await this.amenities.archive(id);
    await this.audit.record({
      action: 'settings.amenity.archived',
      entity: 'amenity',
      entityId: id,
      before,
      after,
    });
    return after;
  }
}
