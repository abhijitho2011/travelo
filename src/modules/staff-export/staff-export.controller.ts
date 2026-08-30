import {
  Controller,
  ForbiddenException,
  Get,
  Param,
  Res,
  UseGuards,
  VERSION_NEUTRAL,
} from '@nestjs/common';
import type { Response } from 'express';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { StaffJwtGuard } from '../staff-auth/staff-jwt.guard';
import { StaffPermissionsGuard } from '../staff-auth/staff-permissions.guard';
import { CurrentStaff, AuthenticatedStaff } from '../staff-auth/current-staff.decorator';
import { AuditService } from '../audit/audit.service';
import { StaffExportService, STAFF_EXPORT_PERMISSION } from './staff-export.service';

/**
 * GET /api/v1/staff/export/:entity(.csv) — reservations | expenses. Permission
 * is checked per entity (reports.export / finance.export). @Res streams the raw
 * CSV outside the JSON envelope.
 */
@ApiTags('Staff Export')
@ApiBearerAuth()
@UseGuards(StaffJwtGuard, StaffPermissionsGuard)
@Controller({ path: 'api/v1/staff/export', version: VERSION_NEUTRAL })
export class StaffExportController {
  constructor(
    private readonly svc: StaffExportService,
    private readonly audit: AuditService,
  ) {}

  @Get(':entity')
  async export(
    @CurrentStaff() me: AuthenticatedStaff,
    @Param('entity') entityParam: string,
    @Res() res: Response,
  ): Promise<void> {
    const entity = StaffExportService.assertEntity(entityParam.replace(/\.csv$/i, ''));
    const required = STAFF_EXPORT_PERMISSION[entity];
    if (!me.permissions.includes(required)) {
      throw new ForbiddenException(`Missing permission: ${required}`);
    }
    const csv = await this.svc.document(me.propertyId, entity);
    await this.audit.record({
      action: 'staff.export.csv',
      entity,
      actorId: me.id,
      actorEmail: me.email,
      actorRole: me.role,
    });
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${StaffExportService.filename(entity)}"`,
    );
    res.setHeader('Cache-Control', 'no-store');
    res.send(csv);
  }
}
