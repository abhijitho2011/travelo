import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { StaffService } from './staff.service';
import { StaffFilterDto } from './dto';

@ApiTags('Staff')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('staff')
export class StaffController {
  constructor(private readonly svc: StaffService) {}

  @Get()
  @RequirePermissions('staff.read')
  list(@Query() q: StaffFilterDto) {
    return this.svc.list(q);
  }

  @Get(':id')
  @RequirePermissions('staff.read')
  get(@Param('id') id: string) {
    return this.svc.get(id);
  }
}
