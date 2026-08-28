import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  UseGuards,
  VERSION_NEUTRAL,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { OwnerJwtGuard } from './owner-jwt.guard';
import { CurrentOwner, AuthenticatedOwner } from './current-owner.decorator';
import { OwnerPortalService } from './owner-portal.service';
import { LocationsService } from './locations.service';
import { CreatePropertyDto, CreateStaffDto, SetStaffStatusDto } from './dto';

@ApiTags('Owner Portal')
@ApiBearerAuth()
@UseGuards(OwnerJwtGuard)
@Controller({ path: 'api/v1/owner', version: VERSION_NEUTRAL })
export class OwnerPortalController {
  constructor(
    private readonly portal: OwnerPortalService,
    private readonly locations: LocationsService,
  ) {}

  @Get('portfolio/summary')
  summary(@CurrentOwner() owner: AuthenticatedOwner) {
    return this.portal.portfolioSummary(owner.id);
  }

  @Get('properties')
  listProperties(@CurrentOwner() owner: AuthenticatedOwner) {
    return this.portal.listProperties(owner.id);
  }

  @Post('properties')
  createProperty(@CurrentOwner() owner: AuthenticatedOwner, @Body() dto: CreatePropertyDto) {
    return this.portal.createProperty(owner.id, dto);
  }

  @Get('properties/:id/staff')
  listStaff(@CurrentOwner() owner: AuthenticatedOwner, @Param('id') id: string) {
    return this.portal.listStaff(owner.id, id);
  }

  @Post('properties/:id/staff')
  createStaff(
    @CurrentOwner() owner: AuthenticatedOwner,
    @Param('id') id: string,
    @Body() dto: CreateStaffDto,
  ) {
    return this.portal.createStaff(owner.id, id, dto);
  }

  @Post('properties/:id/staff/:sid/status')
  setStaffStatus(
    @CurrentOwner() owner: AuthenticatedOwner,
    @Param('id') id: string,
    @Param('sid') sid: string,
    @Body() dto: SetStaffStatusDto,
  ) {
    return this.portal.setStaffStatus(owner.id, id, sid, dto.status);
  }

  @Delete('properties/:id/staff/:sid')
  deleteStaff(
    @CurrentOwner() owner: AuthenticatedOwner,
    @Param('id') id: string,
    @Param('sid') sid: string,
  ) {
    return this.portal.deleteStaff(owner.id, id, sid);
  }

  @Get('reference/locations')
  referenceLocations() {
    return this.locations.asStatesMap();
  }
}
