import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Query,
  UseGuards,
  VERSION_NEUTRAL,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { StaffJwtGuard } from './staff-jwt.guard';
import { RequireStaffPermissions, StaffPermissionsGuard } from './staff-permissions.guard';
import { CurrentStaff, AuthenticatedStaff } from './current-staff.decorator';
import { StaffTeamService } from './staff-team.service';
import { CreateTeamMemberDto, SetTeamMemberStatusDto, StaffTeamFilterDto } from './dto';

/**
 * The missing link in the chain
 * Super Admin → Owner → Property + GM/AGM → the rest of the staff.
 *
 * Every route is scoped to the caller's own property by StaffTeamService; the
 * permission decorators below are what confine these routes to management
 * roles (only GM and AGM hold staff.create / staff.approve / staff.update, and
 * only GM holds staff.delete).
 */
@ApiTags('Staff Team')
@ApiBearerAuth()
@UseGuards(StaffJwtGuard, StaffPermissionsGuard)
@Controller({ path: 'api/v1/staff/team', version: VERSION_NEUTRAL })
export class StaffTeamController {
  constructor(private readonly svc: StaffTeamService) {}

  @Get()
  @RequireStaffPermissions('staff.read')
  list(@CurrentStaff() me: AuthenticatedStaff, @Query() q: StaffTeamFilterDto) {
    return this.svc.list(me, q);
  }

  @Post()
  @RequireStaffPermissions('staff.create')
  create(@CurrentStaff() me: AuthenticatedStaff, @Body() dto: CreateTeamMemberDto) {
    return this.svc.create(me, dto);
  }

  @Post(':id/approve')
  @RequireStaffPermissions('staff.approve')
  approve(@CurrentStaff() me: AuthenticatedStaff, @Param('id') id: string) {
    return this.svc.approve(me, id);
  }

  @Post(':id/status')
  @RequireStaffPermissions('staff.update')
  setStatus(
    @CurrentStaff() me: AuthenticatedStaff,
    @Param('id') id: string,
    @Body() dto: SetTeamMemberStatusDto,
  ) {
    return this.svc.setStatus(me, id, dto.status);
  }

  @Delete(':id')
  @RequireStaffPermissions('staff.delete')
  remove(@CurrentStaff() me: AuthenticatedStaff, @Param('id') id: string) {
    return this.svc.remove(me, id);
  }
}
