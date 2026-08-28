import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { PermissionsService } from './permissions.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';

@ApiTags('Permissions')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('permissions')
export class PermissionsController {
  constructor(private readonly svc: PermissionsService) {}

  @Get()
  @RequirePermissions('admin.view')
  async list() {
    const rows = await this.svc.listAll();
    // Group into { group, actions[] } shape (matches frontend `permissionMatrix`).
    const groups = new Map<string, string[]>();
    for (const row of rows) {
      const arr = groups.get(row.group) ?? [];
      arr.push(row.key);
      groups.set(row.group, arr);
    }
    return {
      matrix: Array.from(groups.entries()).map(([group, actions]) => ({ group, actions })),
      flat: rows,
    };
  }
}
